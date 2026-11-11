import { createHash } from "node:crypto";

import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

import {
  ARTICLE_COVER_MAX_BYTES,
  ArticleCoverValidationError,
  inspectArticleCover,
  type ArticleCoverContentType,
  type ArticleCoverFailureCode,
} from "./policy.ts";
import { processArticleCover } from "./processor.ts";

type S3EventRecord = Readonly<{
  eventName?: string;
  s3?: Readonly<{
    bucket?: Readonly<{ name?: string }>;
    object?: Readonly<{
      key?: string;
      versionId?: string;
      size?: number;
    }>;
  }>;
}>;

type S3Event = Readonly<{ Records?: readonly S3EventRecord[] }>;

export type ImageProcessorConfiguration = Readonly<{
  environment: "development" | "production";
  assetBucket: string;
  quarantinePrefix: string;
  processedPrefix: string;
}>;

type StoredObject = Readonly<{
  contentType?: string;
  contentLength?: number;
  versionId?: string;
  metadata?: Readonly<Record<string, string>>;
  body: Uint8Array;
}>;

type DerivativeWrite = Readonly<{
  bucket: string;
  key: string;
  body: Uint8Array;
  contentType: "application/json" | "image/webp";
  cacheControl: "private, no-store";
  ifNoneMatch: "*";
  metadata: Readonly<Record<string, string>>;
}>;

export interface ArticleCoverStorage {
  getObject(input: {
    bucket: string;
    key: string;
    versionId?: string;
  }): Promise<StoredObject>;
  putObject(input: DerivativeWrite): Promise<{ versionId: string }>;
}

function rejectEvent(reason: string): never {
  throw new Error(`Image processor event rejected: ${reason}.`);
}

function decodeObjectKey(encodedKey: string): string {
  try {
    return decodeURIComponent(encodedKey.replaceAll("+", " "));
  } catch {
    return rejectEvent("object key encoding is invalid");
  }
}

const IDENTIFIER = "[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";

function sourceIdentity(
  sourceKey: string,
  quarantinePrefix: string,
): { articleId: string; assetId: string } {
  const escapedPrefix = quarantinePrefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(
    `^${escapedPrefix}(${IDENTIFIER})/(${IDENTIFIER})/original$`,
    "i",
  ).exec(sourceKey);
  if (!match?.[1] || !match[2]) return rejectEvent("object key is outside quarantine");
  return { articleId: match[1].toLowerCase(), assetId: match[2].toLowerCase() };
}

function isContentType(value: string): value is ArticleCoverContentType {
  return value === "image/jpeg" || value === "image/png" || value === "image/webp";
}

function isReplay(error: unknown): boolean {
  if (typeof error !== "object" || error === null || !("name" in error)) {
    return false;
  }
  return error.name === "PreconditionFailed";
}

function sha256(value: Uint8Array | string): string {
  return createHash("sha256").update(value).digest("hex");
}

type ReadyDerivative = Readonly<{
  key: string;
  versionId: string;
  width: number;
  height: number;
  byteSize: number;
  sha256: string;
  contentType: "image/webp";
}>;

type ResultManifest = Readonly<{
  schemaVersion: 1;
  status: "ready" | "rejected";
  environment: "development" | "production";
  articleId: string;
  assetId: string;
  source: Readonly<{
    keySha256: string;
    versionId: string;
    versionIdSha256: string;
    declaredContentType: string;
    detectedContentType?: ArticleCoverContentType;
    byteSize?: number;
    sha256?: string;
    width?: number;
    height?: number;
  }>;
  derivatives: readonly ReadyDerivative[];
  failureCode?: ArticleCoverFailureCode;
}>;

function manifestBytes(manifest: ResultManifest): Buffer {
  return Buffer.from(`${JSON.stringify(manifest)}\n`, "utf8");
}

const UNKNOWN_DECLARED_CONTENT_TYPE = "application/octet-stream";
const DECLARED_CONTENT_TYPE_MAX_LENGTH = 100;
const MIME_TYPE =
  /^[a-z0-9][a-z0-9!#$%&'*+.^_`|~-]*\/[a-z0-9][a-z0-9!#$%&'*+.^_`|~-]*$/i;

function boundedDeclaredContentType(value: string | undefined): string {
  const normalized = value?.trim().toLowerCase() ?? "";
  return normalized.length > 0 &&
    normalized.length <= DECLARED_CONTENT_TYPE_MAX_LENGTH &&
    MIME_TYPE.test(normalized)
    ? normalized
    : UNKNOWN_DECLARED_CONTENT_TYPE;
}

async function commitManifest(
  storage: ArticleCoverStorage,
  configuration: ImageProcessorConfiguration,
  articleId: string,
  assetId: string,
  manifest: ResultManifest,
): Promise<boolean> {
  const body = manifestBytes(manifest);
  try {
    await storage.putObject({
      bucket: configuration.assetBucket,
      key: `${configuration.processedPrefix}${articleId}/${assetId}/result.json`,
      body,
      contentType: "application/json",
      cacheControl: "private, no-store",
      ifNoneMatch: "*",
      metadata: {},
    });
    return true;
  } catch (error) {
    if (isReplay(error)) {
      const current = await storage.getObject({
        bucket: configuration.assetBucket,
        key: `${configuration.processedPrefix}${articleId}/${assetId}/result.json`,
      });
      if (
        current.contentType !== "application/json" ||
        current.contentLength !== body.length ||
        !Buffer.from(current.body).equals(body)
      ) {
        throw new Error("Existing image processor result does not match replay.");
      }
      return false;
    }
    throw error;
  }
}

async function recoverDerivative(
  storage: ArticleCoverStorage,
  configuration: ImageProcessorConfiguration,
  key: string,
  variant: Readonly<{
    width: number;
    height: number;
    byteSize: number;
    sha256: string;
    contentType: "image/webp";
    body: Uint8Array;
  }>,
  expectedMetadata: Readonly<Record<string, string>>,
): Promise<ReadyDerivative> {
  const current = await storage.getObject({
    bucket: configuration.assetBucket,
    key,
  });
  const metadata = current.metadata ?? {};
  if (
    !current.versionId ||
    current.contentType !== variant.contentType ||
    current.contentLength !== variant.byteSize ||
    !Buffer.from(current.body).equals(variant.body) ||
    Object.entries(expectedMetadata).some(
      ([name, value]) => metadata[name] !== value,
    )
  ) {
    throw new Error("Existing processed derivative does not match replay.");
  }
  return {
    key,
    versionId: current.versionId,
    width: variant.width,
    height: variant.height,
    byteSize: variant.byteSize,
    sha256: variant.sha256,
    contentType: variant.contentType,
  };
}

export async function processS3Event(
  event: S3Event,
  storage: ArticleCoverStorage,
  configuration: ImageProcessorConfiguration,
): Promise<{
  processedRecords: number;
  derivativeWrites: number;
  manifestWrites: number;
  rejectedRecords: number;
}> {
  if (!Array.isArray(event.Records) || event.Records.length < 1) {
    return rejectEvent("records are missing");
  }

  let derivativeWrites = 0;
  let manifestWrites = 0;
  let rejectedRecords = 0;
  for (const record of event.Records) {
    if (record.eventName !== "ObjectCreated:Put") {
      return rejectEvent("only ObjectCreated:Put is accepted");
    }
    if (record.s3?.bucket?.name !== configuration.assetBucket) {
      return rejectEvent("bucket does not match the configured asset bucket");
    }
    const encodedKey = record.s3.object?.key;
    const versionId = record.s3.object?.versionId;
    const eventSize = record.s3.object?.size;
    if (!encodedKey || !versionId) return rejectEvent("object key or version is missing");
    if (!Number.isSafeInteger(eventSize) || (eventSize ?? 0) < 0) {
      return rejectEvent("object size is outside the intake boundary");
    }

    const sourceKey = decodeObjectKey(encodedKey);
    const { articleId, assetId } = sourceIdentity(
      sourceKey,
      configuration.quarantinePrefix,
    );
    if ((eventSize ?? 0) > ARTICLE_COVER_MAX_BYTES) {
      const oversizedManifest: ResultManifest = {
        schemaVersion: 1,
        status: "rejected",
        environment: configuration.environment,
        articleId,
        assetId,
        source: {
          keySha256: sha256(sourceKey),
          versionId,
          versionIdSha256: sha256(versionId),
          declaredContentType: boundedDeclaredContentType(undefined),
          byteSize: eventSize,
        },
        derivatives: [],
        failureCode: "file_too_large",
      };
      if (
        await commitManifest(
          storage,
          configuration,
          articleId,
          assetId,
          oversizedManifest,
        )
      ) {
        manifestWrites += 1;
      }
      rejectedRecords += 1;
      continue;
    }
    const source = await storage.getObject({
      bucket: configuration.assetBucket,
      key: sourceKey,
      versionId,
    });
    const contentType = source.contentType ?? "";
    const sourceBase = {
      keySha256: sha256(sourceKey),
      versionId,
      versionIdSha256: sha256(versionId),
      declaredContentType: boundedDeclaredContentType(contentType),
    };
    if (
      source.body.length !== eventSize ||
      (source.contentLength !== undefined && source.contentLength !== source.body.length)
    ) {
      const manifest: ResultManifest = {
        schemaVersion: 1,
        status: "rejected",
        environment: configuration.environment,
        articleId,
        assetId,
        source: sourceBase,
        derivatives: [],
        failureCode: "size_mismatch",
      };
      if (
        await commitManifest(
          storage,
          configuration,
          articleId,
          assetId,
          manifest,
        )
      ) {
        manifestWrites += 1;
      }
      rejectedRecords += 1;
      continue;
    }
    if (!isContentType(contentType)) {
      const manifest: ResultManifest = {
        schemaVersion: 1,
        status: "rejected",
        environment: configuration.environment,
        articleId,
        assetId,
        source: sourceBase,
        derivatives: [],
        failureCode: "unsupported_type",
      };
      if (
        await commitManifest(
          storage,
          configuration,
          articleId,
          assetId,
          manifest,
        )
      ) {
        manifestWrites += 1;
      }
      rejectedRecords += 1;
      continue;
    }

    const sourceDigest = sha256(source.body);
    const versionDigest = sha256(versionId);
    let inspected;
    let variants;
    try {
      inspected = inspectArticleCover(source.body, contentType);
      try {
        variants = await processArticleCover(source.body, contentType);
      } catch (error) {
        if (error instanceof ArticleCoverValidationError) throw error;
        throw new ArticleCoverValidationError(
          "decode_failed",
          "the image decoder rejected the payload",
        );
      }
    } catch (error) {
      if (!(error instanceof ArticleCoverValidationError)) throw error;
      const manifest: ResultManifest = {
        schemaVersion: 1,
        status: "rejected",
        environment: configuration.environment,
        articleId,
        assetId,
        source: sourceBase,
        derivatives: [],
        failureCode: error.code,
      };
      if (
        await commitManifest(
          storage,
          configuration,
          articleId,
          assetId,
          manifest,
        )
      ) {
        manifestWrites += 1;
      }
      rejectedRecords += 1;
      continue;
    }
    const derivativeFacts: ReadyDerivative[] = [];
    for (const variant of variants) {
      const derivativeKey = `${configuration.processedPrefix}${articleId}/${assetId}/${variant.name}`;
      const derivativeMetadata = {
        width: String(variant.width),
        height: String(variant.height),
        "derivative-sha256": variant.sha256,
        "source-sha256": sourceDigest,
        "source-version-sha256": versionDigest,
      };
      try {
        const stored = await storage.putObject({
          bucket: configuration.assetBucket,
          key: derivativeKey,
          body: variant.body,
          contentType: variant.contentType,
          cacheControl: "private, no-store",
          ifNoneMatch: "*",
          metadata: derivativeMetadata,
        });
        if (!stored.versionId) {
          throw new Error("Image processor storage did not return a version ID.");
        }
        derivativeFacts.push({
          key: derivativeKey,
          versionId: stored.versionId,
          width: variant.width,
          height: variant.height,
          byteSize: variant.byteSize,
          sha256: variant.sha256,
          contentType: variant.contentType,
        });
        derivativeWrites += 1;
      } catch (error) {
        if (!isReplay(error)) throw error;
        derivativeFacts.push(
          await recoverDerivative(
            storage,
            configuration,
            derivativeKey,
            variant,
            derivativeMetadata,
          ),
        );
      }
    }
    const manifest: ResultManifest = {
      schemaVersion: 1,
      status: "ready",
      environment: configuration.environment,
      articleId,
      assetId,
      source: {
        ...sourceBase,
        detectedContentType: inspected.contentType,
        byteSize: inspected.byteSize,
        sha256: sourceDigest,
        width: inspected.width,
        height: inspected.height,
      },
      derivatives: derivativeFacts,
    };
    if (
      await commitManifest(
        storage,
        configuration,
        articleId,
        assetId,
        manifest,
      )
    ) {
      manifestWrites += 1;
    }
  }
  return {
    processedRecords: event.Records.length,
    derivativeWrites,
    manifestWrites,
    rejectedRecords,
  };
}

function environmentConfiguration(): ImageProcessorConfiguration {
  const environment = process.env.ASSET_ENVIRONMENT;
  const assetBucket = process.env.ASSET_BUCKET;
  const quarantinePrefix = process.env.QUARANTINE_PREFIX;
  const processedPrefix = process.env.PROCESSED_PREFIX;
  if (
    (environment !== "development" && environment !== "production") ||
    !assetBucket ||
    !quarantinePrefix ||
    !processedPrefix
  ) {
    throw new Error("Image processor configuration is incomplete.");
  }
  return { environment, assetBucket, quarantinePrefix, processedPrefix };
}

const s3 = new S3Client({});
const awsStorage: ArticleCoverStorage = {
  async getObject(input): Promise<StoredObject> {
    const object = await s3.send(
      new GetObjectCommand({
        Bucket: input.bucket,
        Key: input.key,
        ...(input.versionId === undefined
          ? {}
          : { VersionId: input.versionId }),
      }),
    );
    if (!object.Body) throw new Error("Article cover rejected: object body is missing.");
    return {
      ...(object.ContentType === undefined
        ? {}
        : { contentType: object.ContentType }),
      ...(object.ContentLength === undefined
        ? {}
        : { contentLength: object.ContentLength }),
      ...(object.VersionId === undefined ? {} : { versionId: object.VersionId }),
      ...(object.Metadata === undefined ? {} : { metadata: object.Metadata }),
      body: await object.Body.transformToByteArray(),
    };
  },
  async putObject(input): Promise<{ versionId: string }> {
    const stored = await s3.send(
      new PutObjectCommand({
        Bucket: input.bucket,
        Key: input.key,
        Body: input.body,
        ContentType: input.contentType,
        ContentLength: input.body.length,
        CacheControl: input.cacheControl,
        IfNoneMatch: input.ifNoneMatch,
        Metadata: input.metadata,
      }),
    );
    if (!stored.VersionId) {
      throw new Error("Image processor storage did not return a version ID.");
    }
    return { versionId: stored.VersionId };
  },
};

export async function handler(event: S3Event): Promise<{
  processedRecords: number;
  derivativeWrites: number;
  manifestWrites: number;
  rejectedRecords: number;
}> {
  return processS3Event(event, awsStorage, environmentConfiguration());
}
