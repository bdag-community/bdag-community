import assert from "node:assert/strict";
import { test } from "node:test";
import { Readable } from "node:stream";
import { CopyObjectCommand, S3Client } from "@aws-sdk/client-s3";
import {
  ARTICLE_ASSET_FAILURE_CODES,
  buildVersionedCopySource,
  parseArticleAssetResultManifest,
} from "../src/lib/aws/article-asset-result.ts";

const articleId = "72000000-0000-4000-8000-000000000002";
const assetId = "73000000-0000-4000-8000-000000000002";
const digest = "a".repeat(64);
const source = {
  keySha256: digest,
  versionId: "source+/=version",
  versionIdSha256: digest,
  declaredContentType: "image/png",
};
const derivative = (width, height) => ({
  key: `news/processed/${articleId}/${assetId}/cover-${width}x${height}.webp`,
  versionId: `processed-${width}+/=`,
  width,
  height,
  byteSize: width,
  sha256: digest,
  contentType: "image/webp",
});

test("ready processor results require all three exact immutable derivatives", () => {
  const manifest = parseArticleAssetResultManifest({
    schemaVersion: 1,
    status: "ready",
    environment: "development",
    articleId,
    assetId,
    source: {
      ...source,
      detectedContentType: "image/png",
      byteSize: 2048,
      sha256: digest,
      width: 1200,
      height: 800,
    },
    derivatives: [
      derivative(640, 360),
      derivative(1024, 576),
      derivative(1600, 900),
    ],
  });
  assert.equal(manifest.status, "ready");

  assert.throws(() =>
    parseArticleAssetResultManifest({
      ...manifest,
      derivatives: [
        derivative(640, 360),
        derivative(640, 360),
        derivative(1600, 900),
      ],
    }),
  );
});

test("rejected processor results accept only the shared bounded vocabulary", () => {
  for (const failureCode of ARTICLE_ASSET_FAILURE_CODES) {
    const manifest = parseArticleAssetResultManifest({
      schemaVersion: 1,
      status: "rejected",
      environment: "development",
      articleId,
      assetId,
      source: {
        ...source,
        declaredContentType: "application/octet-stream",
      },
      derivatives: [],
      failureCode,
    });
    assert.equal(manifest.failureCode, failureCode);
  }
  assert.throws(() =>
    parseArticleAssetResultManifest({
      schemaVersion: 1,
      status: "rejected",
      environment: "development",
      articleId,
      assetId,
      source,
      derivatives: [],
      failureCode: "raw-decoder-error",
    }),
  );
});

test("versioned copy sources preserve the query delimiter and encode components", () => {
  const value = buildVersionedCopySource(
    "private-bucket",
    "news/processed/a b/cover.webp",
    "version+/=value",
  );
  assert.equal(
    value,
    "private-bucket/news/processed/a%20b/cover.webp?versionId=version%2B%2F%3Dvalue",
  );
  assert.match(value, /\?versionId=/);
  assert.doesNotMatch(value, /%3FversionId%3D/);
});

test("the AWS serializer preserves the version query and destination precondition", async () => {
  let captured;
  const client = new S3Client({
    region: "eu-central-1",
    credentials: {
      accessKeyId: "AKIAIOSFODNN7EXAMPLE",
      secretAccessKey: "a".repeat(40),
    },
    requestHandler: {
      async handle(request) {
        captured = request;
        return {
          response: {
            statusCode: 200,
            headers: {
              "x-amz-version-id": "destination-version",
              "x-amz-copy-source-version-id": "version+/=value",
            },
            body: Readable.from([
              '<CopyObjectResult><ETag>"test"</ETag></CopyObjectResult>',
            ]),
          },
        };
      },
    },
  });
  try {
    const copySource = buildVersionedCopySource(
      "private-bucket",
      "news/processed/a b/cover.webp",
      "version+/=value",
    );
    await client.send(
      new CopyObjectCommand({
        Bucket: "private-bucket",
        Key: "news/published/cover.webp",
        CopySource: copySource,
        IfNoneMatch: "*",
      }),
    );
    assert.equal(captured.headers["x-amz-copy-source"], copySource);
    assert.equal(captured.headers["if-none-match"], "*");
  } finally {
    client.destroy();
  }
});
