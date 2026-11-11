import { createHmac } from "node:crypto";
import { isIP } from "node:net";

export type SubmissionRateScope =
  | "challenge"
  | "article"
  | "suggestion"
  | "contact"
  | "project";

const HMAC_CONTEXT = "bdag-community:submission-rate:v1";
const TOKEN_HMAC_CONTEXT = "bdag-community:turnstile-claim:v1";
const MINIMUM_HMAC_SECRET_LENGTH = 32;
const MAXIMUM_TURNSTILE_TOKEN_LENGTH = 2_048;

export function canonicalizeClientAddress(value: string): string | null {
  const first = value.split(",", 1)[0]?.trim() ?? "";
  const mapped = first.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i)?.[1];
  const candidate = mapped ?? first;
  const version = isIP(candidate);
  if (version === 4) return candidate;
  if (version !== 6) return null;

  try {
    return new URL(`http://[${candidate}]/`).hostname.slice(1, -1);
  } catch {
    return null;
  }
}

export function createSubmissionFingerprint(
  scope: SubmissionRateScope,
  address: string,
  secret: string,
): string | null {
  if (secret.length < MINIMUM_HMAC_SECRET_LENGTH) return null;
  const canonicalAddress = canonicalizeClientAddress(address);
  if (!canonicalAddress) return null;

  return createHmac("sha256", secret)
    .update(HMAC_CONTEXT)
    .update("\0")
    .update(scope)
    .update("\0")
    .update(canonicalAddress)
    .digest("hex");
}

export function createTurnstileTokenFingerprint(
  token: string,
  secret: string,
): string | null {
  if (
    secret.length < MINIMUM_HMAC_SECRET_LENGTH ||
    token.length === 0 ||
    token.length > MAXIMUM_TURNSTILE_TOKEN_LENGTH
  ) {
    return null;
  }

  return createHmac("sha256", secret)
    .update(TOKEN_HMAC_CONTEXT)
    .update("\0")
    .update(token)
    .digest("hex");
}
