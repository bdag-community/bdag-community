import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";

import sharp from "sharp";

const packageUrl = new URL(
  "../infra/aws/image-processor/package.json",
  import.meta.url,
);
const lockUrl = new URL(
  "../infra/aws/image-processor/package-lock.json",
  import.meta.url,
);
const processorUrl = new URL(
  "../infra/aws/image-processor/src/processor.ts",
  import.meta.url,
);
const policyUrl = new URL(
  "../infra/aws/image-processor/src/policy.ts",
  import.meta.url,
);
const handlerUrl = new URL(
  "../infra/aws/image-processor/src/index.ts",
  import.meta.url,
);
const packageScriptUrl = new URL(
  "../infra/aws/image-processor/package.sh",
  import.meta.url,
);

const processorExists = existsSync(processorUrl) && existsSync(policyUrl);
const handlerExists = existsSync(handlerUrl);

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function pngCrc32(input) {
  let crc = 0xffffffff;
  for (const byte of input) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data = Buffer.alloc(0)) {
  const name = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  const crc = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  crc.writeUInt32BE(pngCrc32(Buffer.concat([name, data])));
  return Buffer.concat([length, name, data, crc]);
}

function boundedPng(width, height, extraChunks = []) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, 2, 0, 0, 0], 8);
  return Buffer.concat([
    PNG_SIGNATURE,
    pngChunk("IHDR", header),
    ...extraChunks,
    pngChunk("IDAT", Buffer.from([0])),
    pngChunk("IEND"),
  ]);
}

function assertCoverFailure(run, expectedCode) {
  assert.throws(run, (error) => {
    assert.equal(error?.name, "ArticleCoverValidationError");
    assert.equal(error?.code, expectedCode);
    return true;
  });
}

test("the isolated processor pins its runtime and build dependencies", () => {
  assert.equal(existsSync(packageUrl), true);
  assert.equal(existsSync(lockUrl), true);

  const packageJson = JSON.parse(readFileSync(packageUrl, "utf8"));
  assert.equal(packageJson.private, true);
  assert.equal(packageJson.type, "module");
  assert.equal(packageJson.engines.node, ">=24 <25");
  assert.equal(
    packageJson.scripts.test,
    "npm run build && node --test ../../../tests/image-processor.test.mjs",
  );
  assert.deepEqual(packageJson.dependencies, {
    "@aws-sdk/client-s3": "3.1109.0",
    sharp: "0.35.3",
  });
  for (const version of Object.values(packageJson.devDependencies)) {
    assert.doesNotMatch(version, /^[~^*]|latest$/);
  }

  const lock = JSON.parse(readFileSync(lockUrl, "utf8"));
  assert.equal(lock.packages[""].dependencies.sharp, "0.35.3");

  const packageScript = readFileSync(packageScriptUrl, "utf8");
  assert.match(packageScript, /--os=linux/);
  assert.match(packageScript, /--cpu=arm64/);
  assert.match(packageScript, /--libc=glibc/);
  assert.match(packageScript, /--ignore-scripts/);
  assert.match(packageScript, /LC_ALL=C sort[\s\S]*zip -X/);
});

test(
  "the bounded parser accepts only strict JPEG, PNG, and still WebP containers",
  { skip: !processorExists },
  async () => {
    const { inspectArticleCover } = await import(policyUrl.href);
    const fixtures = {
      "image/jpeg": await sharp({
        create: {
          width: 32,
          height: 24,
          channels: 3,
          background: "#a856fb",
        },
      })
        .jpeg()
        .toBuffer(),
      "image/png": await sharp({
        create: {
          width: 32,
          height: 24,
          channels: 4,
          background: { r: 168, g: 86, b: 251, alpha: 0.5 },
        },
      })
        .png()
        .toBuffer(),
      "image/webp": await sharp({
        create: {
          width: 32,
          height: 24,
          channels: 3,
          background: "#a856fb",
        },
      })
        .webp()
        .toBuffer(),
    };

    for (const [contentType, body] of Object.entries(fixtures)) {
      const inspected = inspectArticleCover(body, contentType);
      assert.equal(inspected.contentType, contentType);
      assert.equal(inspected.byteSize, body.length);
    }

    assert.throws(
      () => inspectArticleCover(fixtures["image/png"], "image/jpeg"),
      /does not match/i,
    );
    assert.throws(
      () =>
        inspectArticleCover(
          Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'/>") ,
          "image/png",
        ),
      /supported raster/i,
    );
    assert.throws(
      () =>
        inspectArticleCover(
          Buffer.concat([fixtures["image/jpeg"], Buffer.from("trailing")]),
          "image/jpeg",
        ),
      /trailing|container/i,
    );
    assert.throws(
      () =>
        inspectArticleCover(
          Buffer.concat([
            fixtures["image/jpeg"],
            Buffer.from("<script>polyglot</script>"),
            Buffer.from([0xff, 0xd9]),
          ]),
          "image/jpeg",
        ),
      /trailing|container/i,
    );

    const animatedWebp = Buffer.concat([
      Buffer.from("RIFF"),
      Buffer.from([12, 0, 0, 0]),
      Buffer.from("WEBP"),
      Buffer.from("ANIM"),
      Buffer.from([0, 0, 0, 0]),
    ]);
    assert.throws(
      () => inspectArticleCover(animatedWebp, "image/webp"),
      /animated/i,
    );
  },
);

test(
  "the processor emits deterministic metadata-free WebP cover variants",
  { skip: !processorExists },
  async () => {
    const {
      ARTICLE_COVER_PROCESSING_TIMEOUT_SECONDS,
      ARTICLE_COVER_VARIANTS,
      processArticleCover,
    } = await import(processorUrl.href);
    const input = await sharp({
      create: {
        width: 1200,
        height: 800,
        channels: 4,
        background: { r: 244, g: 95, b: 196, alpha: 0.4 },
      },
    })
      .withExif({ IFD0: { Artist: "must-not-survive" } })
      .withIccProfile("p3")
      .png()
      .toBuffer();

    assert.equal((await sharp(input).metadata()).icc?.length > 0, true);
    assert.equal(ARTICLE_COVER_PROCESSING_TIMEOUT_SECONDS, 8);
    assert.deepEqual(
      ARTICLE_COVER_VARIANTS.map(({ name, maxBytes }) => ({ name, maxBytes })),
      [
        { name: "cover-640x360.webp", maxBytes: 350 * 1024 },
        { name: "cover-1024x576.webp", maxBytes: 800 * 1024 },
        { name: "cover-1600x900.webp", maxBytes: 1600 * 1024 },
      ],
    );

    const first = await processArticleCover(input, "image/png");
    const second = await processArticleCover(input, "image/png");

    assert.deepEqual(
      first.map(({ name, width, height, contentType }) => ({
        name,
        width,
        height,
        contentType,
      })),
      [
        {
          name: "cover-640x360.webp",
          width: 640,
          height: 360,
          contentType: "image/webp",
        },
        {
          name: "cover-1024x576.webp",
          width: 1024,
          height: 576,
          contentType: "image/webp",
        },
        {
          name: "cover-1600x900.webp",
          width: 1600,
          height: 900,
          contentType: "image/webp",
        },
      ],
    );

    for (let index = 0; index < first.length; index += 1) {
      assert.deepEqual(first[index].body, second[index].body);
      assert.equal(first[index].sha256, second[index].sha256);
      assert.match(first[index].sha256, /^[0-9a-f]{64}$/);
      assert.equal(first[index].byteSize, first[index].body.length);
      assert.ok(first[index].byteSize <= ARTICLE_COVER_VARIANTS[index].maxBytes);

      const metadata = await sharp(first[index].body).metadata();
      assert.equal(metadata.format, "webp");
      assert.equal(metadata.width, first[index].width);
      assert.equal(metadata.height, first[index].height);
      assert.equal(metadata.pages ?? 1, 1);
      assert.equal(metadata.channels, 3);
      assert.equal(metadata.hasAlpha, false);
      assert.equal(metadata.exif, undefined);
      assert.equal(metadata.icc, undefined);
      assert.equal(metadata.xmp, undefined);
      assert.equal(metadata.iptc, undefined);
      assert.equal(metadata.orientation, undefined);
    }
  },
);

test(
  "the PNG boundary enforces checksums, chunk order, animation, and pixel limits",
  { skip: !processorExists },
  async () => {
    const { inspectArticleCover } = await import(policyUrl.href);

    assertCoverFailure(
      () => inspectArticleCover(boundedPng(6000, 4001), "image/png"),
      "pixel_limit_exceeded",
    );

    const animationControl = Buffer.alloc(8);
    animationControl.writeUInt32BE(2, 0);
    assertCoverFailure(
      () =>
        inspectArticleCover(
          boundedPng(32, 24, [pngChunk("acTL", animationControl)]),
          "image/png",
        ),
      "animated_image",
    );

    const corrupted = boundedPng(32, 24);
    corrupted[corrupted.length - 1] ^= 0xff;
    assertCoverFailure(
      () => inspectArticleCover(corrupted, "image/png"),
      "malformed_container",
    );

    const header = Buffer.alloc(13);
    header.writeUInt32BE(32, 0);
    header.writeUInt32BE(24, 4);
    header.set([8, 2, 0, 0, 0], 8);
    assertCoverFailure(
      () =>
        inspectArticleCover(
          boundedPng(32, 24, [pngChunk("IHDR", header)]),
          "image/png",
        ),
      "malformed_container",
    );
    assertCoverFailure(
      () =>
        inspectArticleCover(
          boundedPng(32, 24, [pngChunk("ABCD")]),
          "image/png",
        ),
      "malformed_container",
    );
  },
);

test(
  "the processor rejects oversized, over-dimensioned, and animated inputs",
  { skip: !processorExists },
  async () => {
    const { inspectArticleCover } = await import(policyUrl.href);
    const { processArticleCover } = await import(processorUrl.href);

    assert.throws(
      () => inspectArticleCover(Buffer.alloc(5 * 1024 * 1024 + 1), "image/png"),
      /5 MiB/i,
    );

    const oversizedPngHeader = await sharp({
      create: {
        width: 8193,
        height: 1,
        channels: 3,
        background: "#a856fb",
      },
    })
      .png()
      .toBuffer();
    assert.throws(
      () => inspectArticleCover(oversizedPngHeader, "image/png"),
      /dimensions|pixels/i,
    );

    const twoPageGif = await sharp({
      create: {
        width: 16,
        height: 32,
        channels: 4,
        background: "#a856fb",
      },
    })
      .gif({ pageHeight: 16, loop: 0, delay: [100, 100] })
      .toBuffer();
    await assert.rejects(
      processArticleCover(twoPageGif, "image/webp"),
      /supported raster|does not match/i,
    );
  },
);

test(
  "the processor exposes one bounded deterministic failure vocabulary",
  { skip: !processorExists },
  async () => {
    const { ARTICLE_COVER_FAILURE_CODES } = await import(policyUrl.href);
    assert.deepEqual(ARTICLE_COVER_FAILURE_CODES, [
      "animated_image",
      "decode_failed",
      "dimensions_exceeded",
      "file_too_large",
      "malformed_container",
      "metadata_not_stripped",
      "output_limit",
      "pixel_limit_exceeded",
      "size_mismatch",
      "type_mismatch",
      "unsupported_type",
    ]);
  },
);

test("the S3 handler source exists", () => {
  assert.equal(handlerExists, true);
});

test(
  "the S3 handler binds the exact source version and conditionally writes only deterministic derivatives",
  async () => {
    const { processS3Event } = await import(handlerUrl.href);
    const articleId = "11111111-1111-4111-8111-111111111111";
    const assetId = "22222222-2222-4222-8222-222222222222";
    const sourceKey = `news/quarantine/${articleId}/${assetId}/original`;
    const source = await sharp({
      create: {
        width: 64,
        height: 48,
        channels: 3,
        background: "#a856fb",
      },
    })
      .png()
      .toBuffer();
    const gets = [];
    const puts = [];
    const storage = {
      async getObject(input) {
        gets.push(input);
        return {
          contentType: "image/png",
          contentLength: source.length,
          body: source,
        };
      },
      async putObject(input) {
        puts.push(input);
        return { versionId: `derivative-version-${puts.length}` };
      },
    };

    const result = await processS3Event(
      {
        Records: [
          {
            eventName: "ObjectCreated:Put",
            s3: {
              bucket: { name: "development-assets" },
              object: {
                key: encodeURIComponent(sourceKey),
                versionId: "version-1",
                size: source.length,
              },
            },
          },
        ],
      },
      storage,
      {
        environment: "development",
        assetBucket: "development-assets",
        quarantinePrefix: "news/quarantine/",
        processedPrefix: "news/processed/",
      },
    );

    assert.deepEqual(result, {
      processedRecords: 1,
      derivativeWrites: 3,
      manifestWrites: 1,
      rejectedRecords: 0,
    });
    assert.deepEqual(gets, [
      {
        bucket: "development-assets",
        key: sourceKey,
        versionId: "version-1",
      },
    ]);
    assert.deepEqual(
      puts.slice(0, 3).map((put) => ({
        key: put.key,
        contentType: put.contentType,
        contentLength: put.body.length,
        ifNoneMatch: put.ifNoneMatch,
        cacheControl: put.cacheControl,
      })),
      [
        "cover-640x360.webp",
        "cover-1024x576.webp",
        "cover-1600x900.webp",
      ].map((name, index) => ({
        key: `news/processed/${articleId}/${assetId}/${name}`,
        contentType: "image/webp",
        contentLength: puts[index].body.length,
        ifNoneMatch: "*",
        cacheControl: "private, no-store",
      })),
    );
    for (const put of puts.slice(0, 3)) {
      assert.deepEqual(Object.keys(put.metadata).toSorted(), [
        "derivative-sha256",
        "height",
        "source-sha256",
        "source-version-sha256",
        "width",
      ]);
      assert.match(put.metadata["source-version-sha256"], /^[0-9a-f]{64}$/);
      assert.doesNotMatch(JSON.stringify(put.metadata), /version-1/);
    }
    const manifestWrite = puts[3];
    assert.equal(
      manifestWrite.key,
      `news/processed/${articleId}/${assetId}/result.json`,
    );
    assert.equal(manifestWrite.contentType, "application/json");
    assert.equal(manifestWrite.ifNoneMatch, "*");
    assert.equal(manifestWrite.cacheControl, "private, no-store");
    const manifest = JSON.parse(Buffer.from(manifestWrite.body).toString("utf8"));
    assert.deepEqual(Object.keys(manifest).toSorted(), [
      "articleId",
      "assetId",
      "derivatives",
      "environment",
      "schemaVersion",
      "source",
      "status",
    ]);
    assert.equal(manifest.schemaVersion, 1);
    assert.equal(manifest.status, "ready");
    assert.equal(manifest.environment, "development");
    assert.equal(manifest.articleId, articleId);
    assert.equal(manifest.assetId, assetId);
    assert.deepEqual(Object.keys(manifest.source).toSorted(), [
      "byteSize",
      "declaredContentType",
      "detectedContentType",
      "height",
      "keySha256",
      "sha256",
      "versionId",
      "versionIdSha256",
      "width",
    ]);
    assert.equal(manifest.source.declaredContentType, "image/png");
    assert.equal(manifest.source.detectedContentType, "image/png");
    assert.equal(manifest.source.byteSize, source.length);
    assert.match(manifest.source.sha256, /^[0-9a-f]{64}$/);
    assert.match(manifest.source.keySha256, /^[0-9a-f]{64}$/);
    assert.equal(manifest.source.versionId, "version-1");
    assert.match(manifest.source.versionIdSha256, /^[0-9a-f]{64}$/);
    assert.doesNotMatch(JSON.stringify(manifest.source), /quarantine/);
    assert.deepEqual(
      manifest.derivatives.map((derivative) => ({
        key: derivative.key,
        versionId: derivative.versionId,
        width: derivative.width,
        height: derivative.height,
        contentType: derivative.contentType,
      })),
      [
        {
          key: `news/processed/${articleId}/${assetId}/cover-640x360.webp`,
          versionId: "derivative-version-1",
          width: 640,
          height: 360,
          contentType: "image/webp",
        },
        {
          key: `news/processed/${articleId}/${assetId}/cover-1024x576.webp`,
          versionId: "derivative-version-2",
          width: 1024,
          height: 576,
          contentType: "image/webp",
        },
        {
          key: `news/processed/${articleId}/${assetId}/cover-1600x900.webp`,
          versionId: "derivative-version-3",
          width: 1600,
          height: 900,
          contentType: "image/webp",
        },
      ],
    );
  },
);

test(
  "the S3 handler fails closed on altered events and treats conditional replay as idempotent",
  async () => {
    const { processS3Event } = await import(handlerUrl.href);
    const validEvent = {
      Records: [
        {
          eventName: "ObjectCreated:Put",
          s3: {
            bucket: { name: "development-assets" },
            object: {
              key: encodeURIComponent(
                "news/quarantine/11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222/original",
              ),
              versionId: "version-1",
              size: 1,
            },
          },
        },
      ],
    };
    const configuration = {
      environment: "development",
      assetBucket: "development-assets",
      quarantinePrefix: "news/quarantine/",
      processedPrefix: "news/processed/",
    };
    const invalidStorage = {
      async getObject() {
        throw new Error("must not read invalid events");
      },
      async putObject() {},
    };

    for (const mutate of [
      (event) => {
        event.Records[0].eventName = "ObjectCreated:CompleteMultipartUpload";
      },
      (event) => {
        event.Records[0].s3.bucket.name = "production-assets";
      },
      (event) => {
        event.Records[0].s3.object.key = encodeURIComponent(
          "news/published/11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222/original",
        );
      },
      (event) => {
        delete event.Records[0].s3.object.versionId;
      },
    ]) {
      const altered = structuredClone(validEvent);
      mutate(altered);
      await assert.rejects(
        processS3Event(altered, invalidStorage, configuration),
        /event rejected/i,
      );
    }

    const source = await sharp({
      create: {
        width: 16,
        height: 16,
        channels: 3,
        background: "#a856fb",
      },
    })
      .webp()
      .toBuffer();
    validEvent.Records[0].s3.object.size = source.length;
    let putAttempts = 0;
    const stored = new Map();
    const replayStorage = {
      async getObject(input) {
        if (
          input.key !==
          decodeURIComponent(validEvent.Records[0].s3.object.key)
        ) {
          const existing = stored.get(input.key);
          if (!existing) throw new Error("missing replay object");
          return existing;
        }
        return {
          contentType: "image/webp",
          contentLength: source.length,
          body: source,
        };
      },
      async putObject(input) {
        putAttempts += 1;
        if (stored.has(input.key)) {
          const error = new Error("precondition");
          error.name = "PreconditionFailed";
          throw error;
        }
        const versionId = `stored-version-${stored.size + 1}`;
        stored.set(input.key, {
          body: input.body,
          contentType: input.contentType,
          contentLength: input.body.length,
          versionId,
          metadata: input.metadata,
        });
        return { versionId };
      },
    };
    const first = await processS3Event(
      validEvent,
      replayStorage,
      configuration,
    );
    assert.deepEqual(first, {
      processedRecords: 1,
      derivativeWrites: 3,
      manifestWrites: 1,
      rejectedRecords: 0,
    });
    const second = await processS3Event(
      validEvent,
      replayStorage,
      configuration,
    );
    assert.deepEqual(second, {
      processedRecords: 1,
      derivativeWrites: 0,
      manifestWrites: 0,
      rejectedRecords: 0,
    });
    assert.equal(putAttempts, 8);
  },
);

test(
  "deterministic validation failures commit one bounded rejected manifest and do not throw",
  async () => {
    const { processS3Event } = await import(handlerUrl.href);
    const invalidCases = [
      { body: Buffer.alloc(0), type: "image/png", code: "malformed_container" },
      { body: Buffer.from("not-an-image"), type: "image/png", code: "malformed_container" },
      { body: Buffer.from("not-an-image"), type: "image/jpeg", code: "malformed_container" },
      { body: Buffer.from("not-an-image"), type: "image/webp", code: "malformed_container" },
    ];

    for (const invalid of invalidCases) {
      const writes = [];
      const event = {
        Records: [
          {
            eventName: "ObjectCreated:Put",
            s3: {
              bucket: { name: "development-assets" },
              object: {
                key: encodeURIComponent(
                  "news/quarantine/11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222/original",
                ),
                versionId: "sensitive-version-id",
                size: invalid.body.length,
              },
            },
          },
        ],
      };
      const result = await processS3Event(
        event,
        {
          async getObject() {
            return {
              contentType: invalid.type,
              contentLength: invalid.body.length,
              body: invalid.body,
            };
          },
          async putObject(input) {
            writes.push(input);
            return { versionId: "manifest-version" };
          },
        },
        {
          environment: "development",
          assetBucket: "development-assets",
          quarantinePrefix: "news/quarantine/",
          processedPrefix: "news/processed/",
        },
      );
      assert.deepEqual(result, {
        processedRecords: 1,
        derivativeWrites: 0,
        manifestWrites: 1,
        rejectedRecords: 1,
      });
      assert.equal(writes.length, 1);
      assert.match(writes[0].key, /\/result\.json$/);
      const manifest = JSON.parse(Buffer.from(writes[0].body).toString("utf8"));
      assert.equal(manifest.status, "rejected");
      assert.equal(manifest.failureCode, invalid.code);
      assert.equal(manifest.source.versionId, "sensitive-version-id");
      assert.match(manifest.source.versionIdSha256, /^[0-9a-f]{64}$/);
      assert.deepEqual(Object.keys(manifest).toSorted(), [
        "articleId",
        "assetId",
        "derivatives",
        "environment",
        "failureCode",
        "schemaVersion",
        "source",
        "status",
      ]);
      assert.deepEqual(manifest.derivatives, []);
      assert.doesNotMatch(
        JSON.stringify(manifest),
        /not-an-image|Article cover rejected|stack/i,
      );
    }
  },
);

test("stored byte-count disagreement commits a bounded rejection", async () => {
  const { processS3Event } = await import(handlerUrl.href);
  const writes = [];
  const result = await processS3Event(
    {
      Records: [
        {
          eventName: "ObjectCreated:Put",
          s3: {
            bucket: { name: "development-assets" },
            object: {
              key: encodeURIComponent(
                "news/quarantine/11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222/original",
              ),
              versionId: "sensitive-version-id",
              size: 4,
            },
          },
        },
      ],
    },
    {
      async getObject() {
        return {
          contentType: "image/png",
          contentLength: 3,
          body: Buffer.from("abc"),
        };
      },
      async putObject(input) {
        writes.push(input);
        return { versionId: "manifest-version" };
      },
    },
    {
      environment: "development",
      assetBucket: "development-assets",
      quarantinePrefix: "news/quarantine/",
      processedPrefix: "news/processed/",
    },
  );

  assert.deepEqual(result, {
    processedRecords: 1,
    derivativeWrites: 0,
    manifestWrites: 1,
    rejectedRecords: 1,
  });
  const manifest = JSON.parse(Buffer.from(writes[0].body).toString("utf8"));
  assert.equal(manifest.failureCode, "size_mismatch");
  assert.equal(manifest.source.versionId, "sensitive-version-id");
  assert.doesNotMatch(JSON.stringify(manifest), /abc/);
});

test("unsupported source types use one bounded manifest content type", async () => {
  const { processS3Event } = await import(handlerUrl.href);
  const writes = [];
  const sourceVersionId = "source-version-with-+/=characters";
  const result = await processS3Event(
    {
      Records: [
        {
          eventName: "ObjectCreated:Put",
          s3: {
            bucket: { name: "development-assets" },
            object: {
              key: encodeURIComponent(
                "news/quarantine/11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222/original",
              ),
              versionId: sourceVersionId,
              size: 3,
            },
          },
        },
      ],
    },
    {
      async getObject() {
        return {
          contentType: `image/invalid-${"x".repeat(200)}`,
          contentLength: 3,
          body: Buffer.from("abc"),
        };
      },
      async putObject(input) {
        writes.push(input);
        return { versionId: "manifest-version" };
      },
    },
    {
      environment: "development",
      assetBucket: "development-assets",
      quarantinePrefix: "news/quarantine/",
      processedPrefix: "news/processed/",
    },
  );

  assert.equal(result.rejectedRecords, 1);
  const manifest = JSON.parse(Buffer.from(writes[0].body).toString("utf8"));
  assert.equal(manifest.failureCode, "unsupported_type");
  assert.equal(manifest.source.declaredContentType, "application/octet-stream");
  assert.equal(manifest.source.versionId, sourceVersionId);
  assert.ok(manifest.source.declaredContentType.length <= 100);
});
