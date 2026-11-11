import { z } from "zod";

export const ARTICLE_ASSET_FAILURE_CODES = [
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
] as const;

const uuid = z.string().uuid();
const sha256 = z.string().regex(/^[0-9a-f]{64}$/);
const contentType = z.enum(["image/jpeg", "image/png", "image/webp"]);
const sourceIdentity = z.object({
  keySha256: sha256,
  versionId: z.string().min(1).max(1000),
  versionIdSha256: sha256,
});

const readySource = sourceIdentity.extend({
  declaredContentType: contentType,
  detectedContentType: contentType,
  byteSize: z.number().int().positive().max(5 * 1024 * 1024),
  sha256,
  width: z.number().int().positive().max(8192),
  height: z.number().int().positive().max(8192),
});

const rejectedSource = sourceIdentity.extend({
  declaredContentType: z
    .string()
    .trim()
    .min(1)
    .max(100)
    .regex(/^[^\s/]+\/[^\s/]+$/),
  detectedContentType: contentType.optional(),
  byteSize: z.number().int().nonnegative().safe().optional(),
  sha256: sha256.optional(),
  width: z.number().int().positive().max(8192).optional(),
  height: z.number().int().positive().max(8192).optional(),
});

const derivative = z.object({
  key: z.string().min(1).max(500),
  versionId: z.string().min(1).max(1000),
  width: z.union([z.literal(640), z.literal(1024), z.literal(1600)]),
  height: z.union([z.literal(360), z.literal(576), z.literal(900)]),
  byteSize: z.number().int().positive().max(5 * 1024 * 1024),
  sha256,
  contentType: z.literal("image/webp"),
});

const common = {
  schemaVersion: z.literal(1),
  environment: z.enum(["development", "production"]),
  articleId: uuid,
  assetId: uuid,
};

const readyManifest = z.object({
  ...common,
  status: z.literal("ready"),
  source: readySource,
  derivatives: z.tuple([derivative, derivative, derivative]),
  failureCode: z.undefined().optional(),
});

const rejectedManifest = z.object({
  ...common,
  status: z.literal("rejected"),
  source: rejectedSource,
  derivatives: z.tuple([]),
  failureCode: z.enum(ARTICLE_ASSET_FAILURE_CODES),
});

const resultManifest = z
  .discriminatedUnion("status", [readyManifest, rejectedManifest])
  .superRefine((value, context) => {
    if (value.status !== "ready") return;
    const expected = new Map([
      [640, 360],
      [1024, 576],
      [1600, 900],
    ]);
    if (
      new Set(value.derivatives.map(({ width }) => width)).size !== 3 ||
      value.derivatives.some(({ width, height }) => expected.get(width) !== height)
    ) {
      context.addIssue({ code: "custom", message: "invalid derivative set" });
    }
  });

export type ArticleAssetResultManifest = z.infer<typeof resultManifest>;

export function parseArticleAssetResultManifest(
  input: unknown,
): ArticleAssetResultManifest {
  return resultManifest.parse(input);
}

/** Build the S3 CopySource while preserving its query delimiter. */
export function buildVersionedCopySource(
  bucket: string,
  key: string,
  versionId: string,
): string {
  const encodedKey = key.split("/").map(encodeURIComponent).join("/");
  return `${bucket}/${encodedKey}?versionId=${encodeURIComponent(versionId)}`;
}
