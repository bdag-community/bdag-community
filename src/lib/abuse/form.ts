import { ABUSE_PROTECTION_COPY } from "@/lib/content/site";
import type { SubmissionProtectionResult } from "./protection";

export function submissionProtectionMessage(
  result: Exclude<SubmissionProtectionResult, { status: "allowed" }>,
): string {
  if (result.status === "rate_limited") {
    return ABUSE_PROTECTION_COPY.rateLimited;
  }
  if (result.status === "verification_required") {
    return ABUSE_PROTECTION_COPY.verificationRequired;
  }
  return ABUSE_PROTECTION_COPY.unavailable;
}
