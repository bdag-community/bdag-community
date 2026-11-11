export type ArticleAssetDeletionDerivative = Readonly<{
  variantWidth: 640 | 1024 | 1600;
  processedKey: string;
  processedVersionId: string;
  publishedKey: string | null;
  publishedVersionId: string | null;
}>;

export type ArticleAssetDeletionRecord = Readonly<{
  id: string;
  articleId: string;
  storageEnvironment: "development" | "production";
  objectKey: string;
  quarantineVersionId: string | null;
  resultManifestKey: string | null;
  resultManifestVersionId: string | null;
  derivatives: readonly ArticleAssetDeletionDerivative[];
}>;

export type ArticleAssetDeletionTarget = Readonly<{
  key: string;
  versionId: string;
}>;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const VERSION_PATTERN = /^[^\u0000-\u001f\u007f]{1,2048}$/;

const dimensions = (width: 640 | 1024 | 1600) => ({
  width,
  height: width === 640 ? 360 : width === 1024 ? 576 : 900,
});

function exactDerivativeKey(
  prefix: "processed" | "published",
  articleId: string,
  assetId: string,
  width: 640 | 1024 | 1600,
): string {
  const size = dimensions(width);
  return `news/${prefix}/${articleId}/${assetId}/cover-${size.width}x${size.height}.webp`;
}

function validVersion(value: string | null): value is string {
  return typeof value === "string" && VERSION_PATTERN.test(value);
}

/**
 * Derive the only exact S3 versions an article deletion may remove.
 * All coordinates come from admin-only database rows and are checked again
 * here before the AWS boundary sees them.
 */
export function buildArticleAssetDeletionTargets(
  articleId: string,
  assets: readonly ArticleAssetDeletionRecord[],
): ArticleAssetDeletionTarget[] {
  if (!UUID_PATTERN.test(articleId)) {
    throw new Error("Article asset deletion input is invalid.");
  }

  const targets = new Map<string, ArticleAssetDeletionTarget>();
  const add = (key: string, versionId: string) => {
    if (!validVersion(versionId)) {
      throw new Error("Article asset deletion input is invalid.");
    }
    targets.set(`${key}\u0000${versionId}`, { key, versionId });
  };

  for (const asset of assets) {
    if (
      !UUID_PATTERN.test(asset.id) ||
      asset.articleId !== articleId ||
      asset.objectKey !==
        `news/quarantine/${articleId}/${asset.id}/original`
    ) {
      throw new Error("Article asset deletion input is invalid.");
    }
    if (asset.quarantineVersionId !== null) {
      add(asset.objectKey, asset.quarantineVersionId);
    }

    const expectedManifest =
      `news/processed/${articleId}/${asset.id}/result.json`;
    if (
      (asset.resultManifestKey === null) !==
      (asset.resultManifestVersionId === null)
    ) {
      throw new Error("Article asset deletion input is invalid.");
    }
    if (asset.resultManifestKey !== null) {
      if (asset.resultManifestKey !== expectedManifest) {
        throw new Error("Article asset deletion input is invalid.");
      }
      add(asset.resultManifestKey, asset.resultManifestVersionId!);
    }

    for (const derivative of asset.derivatives) {
      const processedKey = exactDerivativeKey(
        "processed",
        articleId,
        asset.id,
        derivative.variantWidth,
      );
      if (derivative.processedKey !== processedKey) {
        throw new Error("Article asset deletion input is invalid.");
      }
      add(derivative.processedKey, derivative.processedVersionId);

      if (
        (derivative.publishedKey === null) !==
        (derivative.publishedVersionId === null)
      ) {
        throw new Error("Article asset deletion input is invalid.");
      }
      if (derivative.publishedKey !== null) {
        if (
          derivative.publishedKey !==
          exactDerivativeKey(
            "published",
            articleId,
            asset.id,
            derivative.variantWidth,
          )
        ) {
          throw new Error("Article asset deletion input is invalid.");
        }
        add(derivative.publishedKey, derivative.publishedVersionId!);
      }
    }
  }

  return [...targets.values()];
}
