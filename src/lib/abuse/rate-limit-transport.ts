import type { SubmissionRateScope } from "./fingerprint";

export const RATE_LIMIT_REQUEST_TIMEOUT_MS = 3_000;

type RateLimitRow = {
  allowed?: unknown;
  remaining?: unknown;
  retry_after_seconds?: unknown;
};

type RpcResponse = {
  data: unknown;
  error: unknown;
};

type RateLimitDependencies = {
  rpc: (
    functionName: string,
    parameters: { p_scope: SubmissionRateScope; p_fingerprint: string },
    signal: AbortSignal,
  ) => Promise<RpcResponse>;
  timeoutSignal: (milliseconds: number) => AbortSignal;
};

export type RateLimitResult =
  | { status: "allowed"; remaining: number; retryAfterSeconds: number }
  | { status: "limited"; remaining: number; retryAfterSeconds: number }
  | { status: "unavailable" };

export async function consumeSubmissionRateLimit(
  scope: SubmissionRateScope,
  fingerprint: string,
  dependencies: RateLimitDependencies,
): Promise<RateLimitResult> {
  if (!/^[a-f0-9]{64}$/.test(fingerprint)) {
    return { status: "unavailable" };
  }

  try {
    const signal = dependencies.timeoutSignal(RATE_LIMIT_REQUEST_TIMEOUT_MS);
    const { data, error } = await dependencies.rpc(
      "consume_submission_rate_limit",
      { p_scope: scope, p_fingerprint: fingerprint },
      signal,
    );
    if (error || !Array.isArray(data) || data.length !== 1) {
      return { status: "unavailable" };
    }
    const row = data[0] as RateLimitRow;
    if (
      typeof row.allowed !== "boolean" ||
      typeof row.remaining !== "number" ||
      typeof row.retry_after_seconds !== "number"
    ) {
      return { status: "unavailable" };
    }
    return {
      status: row.allowed ? "allowed" : "limited",
      remaining: Math.max(0, row.remaining),
      retryAfterSeconds: Math.max(0, row.retry_after_seconds),
    };
  } catch {
    return { status: "unavailable" };
  }
}
