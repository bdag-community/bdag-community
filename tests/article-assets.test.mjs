import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { test } from "node:test";

const policyUrl = new URL(
  "../src/lib/news/article-asset-policy.ts",
  import.meta.url,
);
const capabilityUrl = new URL(
  "../src/lib/news/article-asset-capability.ts",
  import.meta.url,
);
const presignUrl = new URL(
  "../src/lib/aws/article-asset-presign.ts",
  import.meta.url,
);
const modulesExist = [policyUrl, capabilityUrl, presignUrl].every((url) =>
  existsSync(url),
);

test("the private article-asset boundary exists", () => {
  assert.equal(existsSync(policyUrl), true);
  assert.equal(existsSync(capabilityUrl), true);
  assert.equal(existsSync(presignUrl), true);
});

test(
  "the intake policy permits one bounded raster cover and generates no user-derived key",
  { skip: !modulesExist },
  async () => {
    const policy = await import(policyUrl.href);
    assert.deepEqual(policy.ARTICLE_ASSET_CONTENT_TYPES, [
      "image/jpeg",
      "image/png",
      "image/webp",
    ]);
    assert.equal(policy.ARTICLE_ASSET_MAX_BYTES, 5 * 1024 * 1024);
    assert.equal(policy.ARTICLE_ASSET_MAX_ALT_TEXT_LENGTH, 300);
    assert.equal(policy.isArticleAssetByteSizeAllowed(1), true);
    assert.equal(
      policy.isArticleAssetByteSizeAllowed(policy.ARTICLE_ASSET_MAX_BYTES),
      true,
    );
    assert.equal(policy.isArticleAssetByteSizeAllowed(0), false);
    assert.equal(
      policy.isArticleAssetByteSizeAllowed(policy.ARTICLE_ASSET_MAX_BYTES + 1),
      false,
    );
    assert.equal(policy.isArticleAssetContentType("image/jpeg"), true);
    assert.equal(policy.isArticleAssetContentType("image/svg+xml"), false);
    assert.equal(policy.isArticleAssetContentType("image/gif"), false);
    assert.equal(
      policy.articleAssetObjectKey(
        "11111111-1111-4111-8111-111111111111",
        "22222222-2222-4222-8222-222222222222",
      ),
      "news/quarantine/11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222/original",
    );
    assert.equal(
      policy.isArticleAssetObjectKey(
        "news/quarantine/11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222/original",
      ),
      true,
    );
    for (const changed of [
      "news/published/11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222/original",
      "news/quarantine/11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222/original/extra",
      "news/quarantine/11111111-1111-4111-8111-111111111111/../../original",
    ]) {
      assert.equal(policy.isArticleAssetObjectKey(changed), false);
    }
  },
);

test(
  "asset capabilities are opaque, environment-bound, and HMAC-only at rest",
  { skip: !modulesExist },
  async () => {
    const capability = await import(capabilityUrl.href);
    const secret = "a".repeat(32);
    const entropy = new Uint8Array(32).fill(7);
    const development = capability.createArticleAssetCapability(
      "development",
      secret,
      entropy,
    );

    assert.match(development.token, /^[A-Za-z0-9_-]{43}$/);
    assert.match(development.digest, /^[0-9a-f]{64}$/);
    assert.equal(
      capability.digestArticleAssetCapability(
        development.token,
        "development",
        secret,
      ),
      development.digest,
    );
    assert.notEqual(
      capability.digestArticleAssetCapability(
        development.token,
        "production",
        secret,
      ),
      development.digest,
    );
    assert.equal(
      capability.digestArticleAssetCapability("altered", "development", secret),
      null,
    );
    assert.equal(
      capability.digestArticleAssetCapability(
        development.token,
        "development",
        "short",
      ),
      null,
    );
  },
);

test(
  "the S3 signer binds exact key, type, length, expiry, and first-write precondition",
  { skip: !modulesExist },
  async () => {
    const { createArticleAssetUploadRequest } = await import(presignUrl.href);
    const upload = await createArticleAssetUploadRequest(
      {
        objectKey:
          "news/quarantine/11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222/original",
        contentType: "image/png",
        byteSize: 1234,
      },
      {
        region: "eu-central-1",
        bucket: "private-development-bucket",
        accessKeyId: "test-access-key",
        secretAccessKey: "test-secret-key",
      },
      127,
    );

    const url = new URL(upload.url);
    const signedHeaders = decodeURIComponent(
      url.searchParams.get("X-Amz-SignedHeaders") ?? "",
    ).split(";");
    assert.equal(upload.method, "PUT");
    assert.deepEqual(upload.headers, {
      "Content-Type": "image/png",
      "If-None-Match": "*",
      "Content-Length": "1234",
    });
    assert.equal(upload.byteSize, 1234);
    assert.equal(url.origin, "https://s3.eu-central-1.amazonaws.com");
    assert.match(url.pathname, /private-development-bucket\/news\/quarantine\//);
    assert.equal(url.searchParams.get("X-Amz-Expires"), "127");
    assert.equal(url.searchParams.has("x-amz-checksum-crc32"), false);
    assert.equal(url.searchParams.has("x-amz-sdk-checksum-algorithm"), false);
    for (const header of ["content-length", "content-type", "if-none-match"]) {
      assert.equal(signedHeaders.includes(header), true, `${header} must be signed`);
    }
    assert.equal(url.searchParams.has("x-amz-acl"), false);

    await assert.rejects(
      createArticleAssetUploadRequest(
        {
          objectKey:
            "news/quarantine/11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222/original",
          contentType: "image/png",
          byteSize: 1234,
        },
        {
          region: "eu-central-1",
          bucket: "private-development-bucket",
          accessKeyId: "test-access-key",
          secretAccessKey: "test-secret-key",
        },
        301,
      ),
      /configuration is invalid/,
    );

    for (const invalid of [
      {
        objectKey:
          "news/quarantine/11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222/original/changed",
        contentType: "image/png",
        byteSize: 1234,
      },
      {
        objectKey:
          "news/quarantine/11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222/original",
        contentType: "image/svg+xml",
        byteSize: 1234,
      },
      {
        objectKey:
          "news/quarantine/11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222/original",
        contentType: "image/png",
        byteSize: 0,
      },
      {
        objectKey:
          "news/quarantine/11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222/original",
        contentType: "image/png",
        byteSize: 5 * 1024 * 1024 + 1,
      },
    ]) {
      await assert.rejects(
        createArticleAssetUploadRequest(
          invalid,
          {
            region: "eu-central-1",
            bucket: "private-development-bucket",
            accessKeyId: "test-access-key",
            secretAccessKey: "test-secret-key",
          },
          300,
        ),
        /configuration is invalid/,
      );
    }
  },
);
