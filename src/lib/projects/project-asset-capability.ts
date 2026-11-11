import { createHmac, randomBytes } from "node:crypto";
import type { AssetStorageEnvironment } from "@/lib/news/article-asset-policy";

/**
 * One-shot upload capabilities for project cover images. Identical mechanics
 * to article-asset-capability.ts but under a DISTINCT HMAC context, so a
 * digest minted for a project draft can never be mistaken for an article one
 * even though both flows share the same secret. Isolation otherwise comes
 * only from which table stores the digest.
 */
const CAPABILITY_CONTEXT = "bdag-community:project-asset-capability:v1";
const CAPABILITY_BYTES = 32;
const CAPABILITY_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const MINIMUM_SECRET_LENGTH = 32;

export type ProjectAssetCapability = {
  token: string;
  digest: string;
};

export function digestProjectAssetCapability(
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

export function createProjectAssetCapability(
  environment: AssetStorageEnvironment,
  secret: string,
  entropy: Uint8Array = randomBytes(CAPABILITY_BYTES),
): ProjectAssetCapability {
  if (entropy.byteLength !== CAPABILITY_BYTES) {
    throw new Error("Project asset capability entropy must be 32 bytes.");
  }
  const token = Buffer.from(entropy).toString("base64url");
  const digest = digestProjectAssetCapability(token, environment, secret);
  if (!digest) {
    throw new Error("Project asset capability secret is not configured.");
  }
  return { token, digest };
}
