export const ARTICLE_ASSET_CONTENT_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export type ArticleAssetContentType =
  (typeof ARTICLE_ASSET_CONTENT_TYPES)[number];

export const ARTICLE_ASSET_MAX_BYTES = 5 * 1024 * 1024;
export const ARTICLE_ASSET_MAX_ALT_TEXT_LENGTH = 300;
export const ARTICLE_ASSET_UPLOAD_EXPIRES_SECONDS = 300;

export type AssetStorageEnvironment = "development" | "production";

const UUID_SOURCE =
  "[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";
const UUID_PATTERN = new RegExp(`^${UUID_SOURCE}$`, "i");
const OBJECT_KEY_PATTERN = new RegExp(
  `^news/quarantine/${UUID_SOURCE}/${UUID_SOURCE}/original$`,
  "i",
);

export function isArticleAssetContentType(
  value: string,
): value is ArticleAssetContentType {
  return ARTICLE_ASSET_CONTENT_TYPES.some((contentType) => contentType === value);
}

export function isArticleAssetByteSizeAllowed(value: number): boolean {
  return Number.isInteger(value) && value >= 1 && value <= ARTICLE_ASSET_MAX_BYTES;
}

export function isAssetStorageEnvironment(
  value: string,
): value is AssetStorageEnvironment {
  return value === "development" || value === "production";
}

export function articleAssetObjectKey(
  articleId: string,
  assetId: string,
): string {
  if (!UUID_PATTERN.test(articleId) || !UUID_PATTERN.test(assetId)) {
    throw new Error("Article asset keys require UUID identifiers.");
  }
  return `news/quarantine/${articleId.toLowerCase()}/${assetId.toLowerCase()}/original`;
}

export function isArticleAssetObjectKey(value: string): boolean {
  return OBJECT_KEY_PATTERN.test(value);
}
