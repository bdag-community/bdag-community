import "server-only";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const DEVELOPMENT_ORIGIN_PATTERN =
  /^https:\/\/[a-z0-9]{12,24}\.cloudfront\.net$/;
const PRODUCTION_ORIGIN = "https://assets.bdag.community";

type DeliveryConfig = Readonly<{
  origin: string;
}>;

export type ArticleAssetDelivery = Readonly<{
  imageUrl: string;
  imageSrcSet: string;
  imageAlt: string;
}>;

function loadDeliveryConfig(): DeliveryConfig | null {
  const environment = process.env.ASSET_STORAGE_ENVIRONMENT;
  const origin = process.env.ASSET_DELIVERY_ORIGIN ?? "";
  if (
    (environment !== "development" && environment !== "production") ||
    !origin
  ) {
    return null;
  }
  let parsed: URL;
  try {
    parsed = new URL(origin);
  } catch {
    return null;
  }
  if (
    parsed.protocol !== "https:" ||
    parsed.origin !== origin ||
    parsed.pathname !== "/" ||
    parsed.search ||
    parsed.hash ||
    parsed.username ||
    parsed.password
  ) {
    return null;
  }
  if (
    (environment === "development" &&
      !DEVELOPMENT_ORIGIN_PATTERN.test(origin)) ||
    (environment === "production" && origin !== PRODUCTION_ORIGIN)
  ) {
    return null;
  }
  return { origin };
}

function publishedKey(
  articleId: string,
  assetId: string,
  variant: "640x360" | "1024x576" | "1600x900",
) {
  return `news/published/${articleId}/${assetId}/cover-${variant}.webp`;
}

export function getArticleAssetDelivery(input: {
  articleId: string;
  assetId: string | null;
  altText: string | null;
}): ArticleAssetDelivery | null {
  const config = loadDeliveryConfig();
  const altText = input.altText?.trim() ?? "";
  if (
    !config ||
    !UUID_PATTERN.test(input.articleId) ||
    !input.assetId ||
    !UUID_PATTERN.test(input.assetId) ||
    !altText ||
    altText.length > 300
  ) {
    return null;
  }
  const url = (variant: "640x360" | "1024x576" | "1600x900") =>
    `${config.origin}/${publishedKey(input.articleId, input.assetId!, variant)}`;
  return {
    imageUrl: url("1600x900"),
    imageSrcSet: `${url("640x360")} 640w, ${url("1024x576")} 1024w, ${url("1600x900")} 1600w`,
    imageAlt: altText,
  };
}
