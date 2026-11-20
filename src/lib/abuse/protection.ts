import type { SubmissionRateScope } from "./fingerprint";
import type { RateLimitResult } from "./rate-limit-transport";
import type { TokenClaimResult } from "./token-claim-transport";

export type PublicSubmissionScope = Exclude<SubmissionRateScope, "challenge">;
export type PublicSubmissionAction =
  | "submit_article"
  | "submit_suggestion"
  | "contact_message"
  | "submit_project"
  | "testnet_faucet";

type ProtectionDependencies = {
  fingerprint: (scope: SubmissionRateScope) => Promise<string | null>;
  consume: (
    scope: SubmissionRateScope,
    fingerprint: string,
  ) => Promise<RateLimitResult>;
  verify: (
    token: string,
    action: PublicSubmissionAction,
  ) => Promise<{ status: "valid" | "invalid" | "unavailable" }>;
  claim: (token: string) => Promise<TokenClaimResult>;
};

export type SubmissionProtectionResult =
  | { status: "allowed" }
  | { status: "rate_limited" }
  | { status: "verification_required" }
  | { status: "unavailable" };

export async function protectSubmission(
  input: {
    scope: PublicSubmissionScope;
    action: PublicSubmissionAction;
    token: string;
  },
  dependencies: ProtectionDependencies,
): Promise<SubmissionProtectionResult> {
  const attemptFingerprint = await dependencies.fingerprint("challenge");
  if (!attemptFingerprint) return { status: "unavailable" };

  const attemptLimit = await dependencies.consume(
    "challenge",
    attemptFingerprint,
  );
  if (attemptLimit.status === "limited") return { status: "rate_limited" };
  if (attemptLimit.status !== "allowed") return { status: "unavailable" };

  const verification = await dependencies.verify(input.token, input.action);
  if (verification.status === "invalid") {
    return { status: "verification_required" };
  }
  if (verification.status !== "valid") return { status: "unavailable" };

  const tokenClaim = await dependencies.claim(input.token);
  if (tokenClaim.status === "duplicate") {
    return { status: "verification_required" };
  }
  if (tokenClaim.status !== "claimed") return { status: "unavailable" };

  const submissionFingerprint = await dependencies.fingerprint(input.scope);
  if (!submissionFingerprint) return { status: "unavailable" };

  const submissionLimit = await dependencies.consume(
    input.scope,
    submissionFingerprint,
  );
  if (submissionLimit.status === "limited") return { status: "rate_limited" };
  if (submissionLimit.status !== "allowed") return { status: "unavailable" };
  return { status: "allowed" };
}
