import "server-only";

import {
  GetObjectCommand,
  S3Client,
  type GetObjectCommandOutput,
} from "@aws-sdk/client-s3";
import { loadArticleAssetModerationConfig } from "./article-asset-moderation.server";

const PREVIEW_MAX_BYTES = 5 * 1024 * 1024;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;

export type ArticleAssetPreviewInput = Readonly<{
  articleId: string;
  assetId: string;
  processedKey: string;
  processedVersionId: string;
  byteSize: number;
  checksumSha256: string;
}>;

export type ArticleAssetPreview = Readonly<{
  body: ReadableStream<Uint8Array>;
  byteSize: number;
}>;

/** Preserve streaming while failing the connection if S3 exceeds its bound. */
function boundedWebStream(
  source: ReadableStream<Uint8Array>,
  expectedBytes: number,
  onFinished: () => void,
): ReadableStream<Uint8Array> {
  const reader = source.getReader();
  let receivedBytes = 0;
  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    onFinished();
  };
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const chunk = await reader.read();
        if (chunk.done) {
          if (receivedBytes !== expectedBytes) {
            finish();
            controller.error(new Error("The preview stream ended early."));
            return;
          }
          finish();
          controller.close();
          return;
        }
        receivedBytes += chunk.value.byteLength;
        if (
          receivedBytes > expectedBytes ||
          receivedBytes > PREVIEW_MAX_BYTES
        ) {
          await reader.cancel().catch(() => undefined);
          finish();
          controller.error(new Error("The preview stream exceeded its bound."));
          return;
        }
        controller.enqueue(chunk.value);
      } catch {
        finish();
        controller.error(new Error("The preview stream could not be read."));
      }
    },
    async cancel(reason) {
      try {
        await reader.cancel(reason);
      } finally {
        finish();
      }
    },
  });
}

/**
 * Reads one immutable processed derivative for a same-origin admin response.
 * The key, version, checksum, type, and length must all match trusted database
 * metadata before any byte is sent to the browser.
 */
export async function readArticleAssetPreview(
  input: ArticleAssetPreviewInput,
): Promise<ArticleAssetPreview> {
  const config = loadArticleAssetModerationConfig();
  const expectedKey = `news/processed/${input.articleId}/${input.assetId}/cover-1024x576.webp`;
  if (
    !config ||
    !UUID_PATTERN.test(input.articleId) ||
    !UUID_PATTERN.test(input.assetId) ||
    input.processedKey !== expectedKey ||
    input.processedVersionId.length < 1 ||
    input.processedVersionId.length > 1000 ||
    !Number.isInteger(input.byteSize) ||
    input.byteSize < 1 ||
    input.byteSize > PREVIEW_MAX_BYTES ||
    !SHA256_PATTERN.test(input.checksumSha256)
  ) {
    throw new Error("The article asset preview is invalid.");
  }

  const client = new S3Client({
    region: config.region,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });
  let response: GetObjectCommandOutput;
  try {
    response = await client.send(
      new GetObjectCommand({
        Bucket: config.bucket,
        Key: input.processedKey,
        VersionId: input.processedVersionId,
      }),
      { abortSignal: AbortSignal.timeout(8_000) },
    );
  } catch (error) {
    client.destroy();
    throw error;
  }
  if (
    !response.Body ||
    response.ContentType !== "image/webp" ||
    response.ContentLength !== input.byteSize ||
    response.ContentLength > PREVIEW_MAX_BYTES ||
    response.Metadata?.["derivative-sha256"] !== input.checksumSha256 ||
    response.Metadata?.width !== "1024" ||
    response.Metadata?.height !== "576"
  ) {
    if (response.Body) {
      await response.Body.transformToWebStream().cancel().catch(() => undefined);
    }
    client.destroy();
    throw new Error("The article asset preview failed verification.");
  }

  let source: ReadableStream<Uint8Array>;
  try {
    source = response.Body.transformToWebStream() as ReadableStream<Uint8Array>;
  } catch (error) {
    client.destroy();
    throw error;
  }
  return {
    body: boundedWebStream(
      source,
      response.ContentLength,
      () => client.destroy(),
    ),
    byteSize: response.ContentLength,
  };
}
