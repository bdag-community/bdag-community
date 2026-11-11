import "server-only";

import {
  isAssetStorageEnvironment,
  type AssetStorageEnvironment,
} from "@/lib/news/article-asset-policy";
import type { ArticleAssetS3Config } from "./article-asset-presign";

export type ArticleAssetRuntimeConfig = {
  storageEnvironment: AssetStorageEnvironment;
  expectedOrigin: string;
  capabilitySecret: string;
  s3: ArticleAssetS3Config;
};

export function loadArticleAssetRuntimeConfig(): ArticleAssetRuntimeConfig | null {
  const storageEnvironment = process.env.ASSET_STORAGE_ENVIRONMENT ?? "";
  const region = process.env.ASSET_S3_REGION ?? "";
  const bucket = process.env.ASSET_S3_BUCKET ?? "";
  const accessKeyId = process.env.ASSET_S3_ACCESS_KEY_ID ?? "";
  const secretAccessKey = process.env.ASSET_S3_SECRET_ACCESS_KEY ?? "";
  const capabilitySecret =
    process.env.ASSET_CAPABILITY_HMAC_SECRET ?? "";

  if (
    !isAssetStorageEnvironment(storageEnvironment) ||
    region !== "eu-central-1" ||
    !new RegExp(
      `^bdag-community-assets-${storageEnvironment}-[0-9]{12}-eu-central-1$`,
    ).test(bucket) ||
    !accessKeyId ||
    !secretAccessKey ||
    capabilitySecret.length < 32
  ) {
    return null;
  }

  return {
    storageEnvironment,
    expectedOrigin:
      storageEnvironment === "development"
        ? "http://localhost:3011"
        : "https://bdag.community",
    capabilitySecret,
    s3: { region, bucket, accessKeyId, secretAccessKey },
  };
}
