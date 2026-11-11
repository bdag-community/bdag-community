import { createHmac, randomBytes } from "node:crypto";
import type { AssetStorageEnvironment } from "./article-asset-policy";

const CAPABILITY_CONTEXT = "bdag-community:article-asset-capability:v1";
const CAPABILITY_BYTES = 32;
const CAPABILITY_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const MINIMUM_SECRET_LENGTH = 32;

export type ArticleAssetCapability = {
  token: string;
  digest: string;
};

export function digestArticleAssetCapability(
  token: string,
  environment: AssetStorageEnvironment,
  secret: string,
): string | null {
  if (
    secret.length < MINIMUM_SECRET_LENGTH ||
    !CAPABILITY_PATTERN.test(token)
  ) {
    return null;
  }

  return createHmac("sha256", secret)
    .update(CAPABILITY_CONTEXT)
    .update("\0")
    .update(environment)
    .update("\0")
    .update(token)
    .digest("hex");
}

export function createArticleAssetCapability(
  environment: AssetStorageEnvironment,
  secret: string,
  entropy: Uint8Array = randomBytes(CAPABILITY_BYTES),
): ArticleAssetCapability {
  if (entropy.byteLength !== CAPABILITY_BYTES) {
    throw new Error("Article asset capability entropy must be 32 bytes.");
  }
  const token = Buffer.from(entropy).toString("base64url");
  const digest = digestArticleAssetCapability(token, environment, secret);
  if (!digest) {
    throw new Error("Article asset capability secret is not configured.");
  }
  return { token, digest };
}
