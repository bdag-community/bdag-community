import "server-only";

import { headers } from "next/headers";
import {
  createSubmissionFingerprint,
  createTurnstileTokenFingerprint,
  type SubmissionRateScope,
} from "./fingerprint";
import {
  protectSubmission,
  type PublicSubmissionAction,
  type PublicSubmissionScope,
  type SubmissionProtectionResult,
} from "./protection";
import { consumeSubmissionRateLimit } from "./rate-limit-transport";
import { claimSubmissionToken } from "./token-claim-transport";
import { verifyTurnstileToken } from "./turnstile-transport";
import { OFFICIAL_TURNSTILE_ALWAYS_PASS_SITE_KEY } from "./turnstile-test-credentials.ts";

const ACTIONS: Readonly<Record<PublicSubmissionScope, PublicSubmissionAction>> = {
  article: "submit_article",
  suggestion: "submit_suggestion",
  contact: "contact_message",
  project: "submit_project",
};

async function getRequestContext(): Promise<{
  clientAddress: string;
  requestHostname: string;
}> {
  const requestHeaders = await headers();
  const forwarded = requestHeaders.get("x-forwarded-for");
  const real = requestHeaders.get("x-real-ip");
  const rawHost =
    requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "";
  let requestHostname = "";
  try {
    requestHostname = new URL(`http://${rawHost.split(",", 1)[0]?.trim()}`)
      .hostname
      .replace(/^\[|\]$/g, "")
      .toLowerCase();
  } catch {
    requestHostname = "";
  }

  return {
    clientAddress:
      forwarded ??
      real ??
      (process.env.TURNSTILE_TEST_MODE === "true" ? "127.0.0.1" : ""),
    requestHostname,
  };
}

export async function protectPublicSubmission(
  scope: PublicSubmissionScope,
  token: string,
): Promise<SubmissionProtectionResult> {
  const action = ACTIONS[scope];
  const hmacSecret = process.env.ABUSE_HMAC_SECRET ?? "";
  const turnstileSecret = process.env.TURNSTILE_SECRET_KEY ?? "";
  const expectedHostname = process.env.TURNSTILE_EXPECTED_HOSTNAME ?? "";
  const testing = process.env.TURNSTILE_TEST_MODE === "true";
  const { clientAddress, requestHostname } = await getRequestContext();
  if (
    testing &&
    (!new Set(["localhost", "127.0.0.1", "::1"]).has(requestHostname) ||
      process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY !==
        OFFICIAL_TURNSTILE_ALWAYS_PASS_SITE_KEY)
  ) {
    return { status: "unavailable" };
  }

  const getClient = async () => {
    const { getAdminSupabase } = await import("@/lib/supabase/admin");
    return getAdminSupabase();
  };

  return protectSubmission(
    { scope, action, token },
    {
      fingerprint: async (rateScope: SubmissionRateScope) =>
        createSubmissionFingerprint(
          rateScope,
          clientAddress,
          hmacSecret,
        ),
      consume: async (rateScope, fingerprint) =>
        consumeSubmissionRateLimit(rateScope, fingerprint, {
          timeoutSignal: AbortSignal.timeout,
          rpc: async (functionName, parameters, signal) => {
            try {
              const client = await getClient();
              const query = client.rpc(functionName, parameters).abortSignal(signal);
              const { data, error } = await query;
              return { data, error };
            } catch {
              return { data: null, error: true };
            }
          },
        }),
      verify: async (responseToken, expectedAction) =>
        verifyTurnstileToken(
          {
            secretKey: turnstileSecret,
            expectedHostname,
            expectedAction,
            testing,
          },
          responseToken,
        ),
      claim: async (responseToken) => {
        if (testing) return { status: "claimed" };
        const fingerprint = createTurnstileTokenFingerprint(
          responseToken,
          hmacSecret,
        );
        if (!fingerprint) return { status: "unavailable" };
        return claimSubmissionToken(fingerprint, {
          timeoutSignal: AbortSignal.timeout,
          rpc: async (functionName, parameters, signal) => {
            try {
              const client = await getClient();
              const query = client.rpc(functionName, parameters).abortSignal(signal);
              const { data, error } = await query;
              return { data, error };
            } catch {
              return { data: null, error: true };
            }
          },
        });
      },
    },
  );
}
