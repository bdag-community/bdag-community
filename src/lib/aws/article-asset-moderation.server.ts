import "server-only";

import { createHash, timingSafeEqual } from "node:crypto";
import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import {
  isAssetStorageEnvironment,
  type AssetStorageEnvironment,
} from "@/lib/news/article-asset-policy";
import {
  buildVersionedCopySource,
  parseArticleAssetResultManifest,
  type ArticleAssetResultManifest,
} from "./article-asset-result";
import { buildArticleAssetDeletionTargets } from "./article-asset-deletion";
import type { AdminArticleAssetStorageRecord } from "@/lib/dal/admin";

const MANIFEST_MAX_BYTES = 64 * 1024;
const STORAGE_REGION = "eu-central-1";
export type { ArticleAssetResultManifest } from "./article-asset-result";

export type ArticleAssetModerationConfig = Readonly<{
  storageEnvironment: AssetStorageEnvironment;
  region: typeof STORAGE_REGION;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
}>;

export function loadArticleAssetModerationConfig(): ArticleAssetModerationConfig | null {
  const storageEnvironment = process.env.ASSET_STORAGE_ENVIRONMENT ?? "";
  const bucket = process.env.ASSET_S3_BUCKET ?? "";
  const accessKeyId = process.env.ASSET_MODERATION_S3_ACCESS_KEY_ID ?? "";
  const secretAccessKey =
    process.env.ASSET_MODERATION_S3_SECRET_ACCESS_KEY ?? "";
  if (
    !isAssetStorageEnvironment(storageEnvironment) ||
    process.env.ASSET_S3_REGION !== STORAGE_REGION ||
    !new RegExp(
      `^bdag-community-assets-${storageEnvironment}-[0-9]{12}-eu-central-1$`,
    ).test(bucket) ||
    !accessKeyId ||
    !secretAccessKey
  ) {
    return null;
  }
  return {
    storageEnvironment,
    region: STORAGE_REGION,
    bucket,
    accessKeyId,
    secretAccessKey,
  };
}

const s3Client = (config: ArticleAssetModerationConfig) =>
  new S3Client({
    region: config.region,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });

const sha256 = (value: string): string =>
  createHash("sha256").update(value, "utf8").digest("hex");

function digestMatches(actual: string, expected: string): boolean {
  const actualBytes = Buffer.from(actual, "hex");
  const expectedBytes = Buffer.from(expected, "hex");
  return (
    actualBytes.length === expectedBytes.length &&
    timingSafeEqual(actualBytes, expectedBytes)
  );
}

function isPreconditionFailed(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "$metadata" in error &&
    (error as { $metadata?: { httpStatusCode?: number } }).$metadata
      ?.httpStatusCode === 412
  );
}

const resultKey = (articleId: string, assetId: string) =>
  `news/processed/${articleId}/${assetId}/result.json`;

const expectedDerivativeKey = (
  articleId: string,
  assetId: string,
  width: 640 | 1024 | 1600,
) => {
  const height = width === 640 ? 360 : width === 1024 ? 576 : 900;
  return `news/processed/${articleId}/${assetId}/cover-${width}x${height}.webp`;
};

export async function readValidatedArticleAssetResult(input: {
  articleId: string;
  assetId: string;
  sourceKey: string;
  declaredContentType: "image/jpeg" | "image/png" | "image/webp";
}): Promise<{
  manifest: ArticleAssetResultManifest;
  manifestKey: string;
  manifestVersionId: string;
  sourceVersionId: string;
}> {
  const config = loadArticleAssetModerationConfig();
  if (!config) throw new Error("Asset moderation is not configured.");
  const client = s3Client(config);
  try {
    const manifestKey = resultKey(input.articleId, input.assetId);
    const response = await client.send(
      new GetObjectCommand({ Bucket: config.bucket, Key: manifestKey }),
      { abortSignal: AbortSignal.timeout(8_000) },
    );
    if (
      !response.Body ||
      !response.VersionId ||
      response.ContentType !== "application/json" ||
      (response.ContentLength ?? MANIFEST_MAX_BYTES + 1) > MANIFEST_MAX_BYTES
    ) {
      throw new Error("The processor result is unavailable.");
    }
    const bytes = await response.Body.transformToByteArray();
    if (bytes.length > MANIFEST_MAX_BYTES) {
      throw new Error("The processor result is invalid.");
    }
    const manifest = parseArticleAssetResultManifest(
      JSON.parse(new TextDecoder().decode(bytes)) as unknown,
    );
    if (
      manifest.environment !== config.storageEnvironment ||
      manifest.articleId !== input.articleId ||
      manifest.assetId !== input.assetId ||
      ((manifest.status === "ready" ||
        ["image/jpeg", "image/png", "image/webp"].includes(
          manifest.source.declaredContentType,
        )) &&
        manifest.source.declaredContentType !== input.declaredContentType) ||
      !digestMatches(manifest.source.keySha256, sha256(input.sourceKey)) ||
      !digestMatches(
        manifest.source.versionIdSha256,
        sha256(manifest.source.versionId),
      )
    ) {
      throw new Error("The processor result does not match this asset.");
    }
    for (const derivative of manifest.derivatives) {
      if (
        derivative.key !==
          expectedDerivativeKey(
            input.articleId,
            input.assetId,
            derivative.width,
          )
      ) {
        throw new Error("The processor result contains an invalid derivative.");
      }
    }
    return {
      manifest,
      manifestKey,
      manifestVersionId: response.VersionId,
      sourceVersionId: manifest.source.versionId,
    };
  } finally {
    client.destroy();
  }
}

export type ArticleAssetDerivativeStorageRow = Readonly<{
  variantWidth: 640 | 1024 | 1600;
  processedKey: string;
  processedVersionId: string;
  byteSize: number;
  checksumSha256: string;
}>;

export type PublishedDerivative = Readonly<{
  variantWidth: 640 | 1024 | 1600;
  publishedKey: string;
  publishedVersionId: string;
  created: boolean;
}>;

export async function promoteArticleAssetDerivatives(input: {
  articleId: string;
  assetId: string;
  derivatives: readonly ArticleAssetDerivativeStorageRow[];
}): Promise<readonly PublishedDerivative[]> {
  const config = loadArticleAssetModerationConfig();
  if (!config) throw new Error("Asset moderation is not configured.");
  if (input.derivatives.length !== 3) {
    throw new Error("Three processed derivatives are required.");
  }
  const client = s3Client(config);
  const promoted: PublishedDerivative[] = [];
  try {
    for (const derivative of input.derivatives) {
      const source = await client.send(
        new HeadObjectCommand({
          Bucket: config.bucket,
          Key: derivative.processedKey,
          VersionId: derivative.processedVersionId,
        }),
        { abortSignal: AbortSignal.timeout(8_000) },
      );
      if (
        source.ContentType !== "image/webp" ||
        source.ContentLength !== derivative.byteSize ||
        source.Metadata?.["derivative-sha256"] !== derivative.checksumSha256
      ) {
        throw new Error("A processed derivative failed verification.");
      }
      const publishedKey = derivative.processedKey.replace(
        /^news\/processed\//,
        "news/published/",
      );
      let publishedVersionId: string;
      let created = false;
      try {
        const copied = await client.send(
          new CopyObjectCommand({
            Bucket: config.bucket,
            Key: publishedKey,
            CopySource: buildVersionedCopySource(
              config.bucket,
              derivative.processedKey,
              derivative.processedVersionId,
            ),
            IfNoneMatch: "*",
            ContentType: "image/webp",
            CacheControl: "public, max-age=31536000, immutable",
            Metadata: {
              "derivative-sha256": derivative.checksumSha256,
            },
            MetadataDirective: "REPLACE",
          }),
          { abortSignal: AbortSignal.timeout(8_000) },
        );
        if (
          !copied.VersionId ||
          copied.CopySourceVersionId !== derivative.processedVersionId
        ) {
          throw new Error("Published version is unavailable.");
        }
        publishedVersionId = copied.VersionId;
        created = true;
      } catch (error) {
        if (!isPreconditionFailed(error)) throw error;
        const existing = await client.send(
          new HeadObjectCommand({ Bucket: config.bucket, Key: publishedKey }),
          { abortSignal: AbortSignal.timeout(8_000) },
        );
        if (
          !existing.VersionId ||
          existing.ContentType !== "image/webp" ||
          existing.ContentLength !== derivative.byteSize ||
          existing.Metadata?.["derivative-sha256"] !==
            derivative.checksumSha256
        ) {
          throw new Error("An existing published derivative is not reusable.");
        }
        publishedVersionId = existing.VersionId;
      }
      promoted.push({
        variantWidth: derivative.variantWidth,
        publishedKey,
        publishedVersionId,
        created,
      });
    }
    return promoted;
  } catch (error) {
    const cleanup = await Promise.allSettled(
      promoted.filter(({ created }) => created).map((derivative) =>
        client.send(
          new DeleteObjectCommand({
            Bucket: config.bucket,
            Key: derivative.publishedKey,
            VersionId: derivative.publishedVersionId,
          }),
          { abortSignal: AbortSignal.timeout(8_000) },
        ),
      ),
    );
    const cleanupErrors = cleanup.flatMap((result) =>
      result.status === "rejected" ? [result.reason] : [],
    );
    if (cleanupErrors.length > 0) {
      throw new AggregateError(
        [error, ...cleanupErrors],
        "Published derivative cleanup failed.",
      );
    }
    throw error;
  } finally {
    client.destroy();
  }
}

export async function deletePublishedArticleAssetVersions(
  derivatives: readonly PublishedDerivative[],
): Promise<void> {
  const config = loadArticleAssetModerationConfig();
  if (!config) throw new Error("Asset moderation is not configured.");
  const client = s3Client(config);
  try {
    await Promise.all(
      derivatives.filter(({ created }) => created).map((derivative) =>
        client.send(
          new DeleteObjectCommand({
            Bucket: config.bucket,
            Key: derivative.publishedKey,
            VersionId: derivative.publishedVersionId,
          }),
          { abortSignal: AbortSignal.timeout(8_000) },
        ),
      ),
    );
  } finally {
    client.destroy();
  }
}

/** Delete only the exact versioned objects recorded for one unpublished article. */
export async function deleteArticleAssetVersions(input: {
  articleId: string;
  assets: readonly AdminArticleAssetStorageRecord[];
}): Promise<void> {
  const records = input.assets.map((asset) => ({
    id: asset.id,
    articleId: asset.article_id,
    storageEnvironment: asset.storage_environment,
    objectKey: asset.object_key,
    quarantineVersionId: asset.quarantine_version_id,
    resultManifestKey: asset.result_manifest_key,
    resultManifestVersionId: asset.result_manifest_version_id,
    derivatives: asset.derivatives.map((derivative) => ({
      variantWidth: derivative.variantWidth,
      processedKey: derivative.processedKey,
      processedVersionId: derivative.processedVersionId,
      publishedKey: derivative.publishedKey,
      publishedVersionId: derivative.publishedVersionId,
    })),
  }));
  const targets = buildArticleAssetDeletionTargets(input.articleId, records);
  if (targets.length === 0) return;

  const config = loadArticleAssetModerationConfig();
  if (
    !config ||
    records.some(
      ({ storageEnvironment }) =>
        storageEnvironment !== config.storageEnvironment,
    )
  ) {
    throw new Error("Asset moderation is not configured for this article.");
  }

  const client = s3Client(config);
  try {
    for (const target of targets) {
      await client.send(
        new DeleteObjectCommand({
          Bucket: config.bucket,
          Key: target.key,
          VersionId: target.versionId,
        }),
        { abortSignal: AbortSignal.timeout(8_000) },
      );
    }
  } finally {
    client.destroy();
  }
}
