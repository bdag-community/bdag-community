export const TOKEN_CLAIM_REQUEST_TIMEOUT_MS = 3_000;

type RpcResponse = {
  data: unknown;
  error: unknown;
};

type TokenClaimDependencies = {
  rpc: (
    functionName: string,
    parameters: { p_fingerprint: string },
    signal: AbortSignal,
  ) => Promise<RpcResponse>;
  timeoutSignal: (milliseconds: number) => AbortSignal;
};

export type TokenClaimResult =
  | { status: "claimed" }
  | { status: "duplicate" }
  | { status: "unavailable" };

export async function claimSubmissionToken(
  fingerprint: string,
  dependencies: TokenClaimDependencies,
): Promise<TokenClaimResult> {
  if (!/^[a-f0-9]{64}$/.test(fingerprint)) {
    return { status: "unavailable" };
  }

  try {
    const signal = dependencies.timeoutSignal(TOKEN_CLAIM_REQUEST_TIMEOUT_MS);
    const { data, error } = await dependencies.rpc(
      "claim_submission_token",
      { p_fingerprint: fingerprint },
      signal,
    );
    if (error || typeof data !== "boolean") {
      return { status: "unavailable" };
    }
    return { status: data ? "claimed" : "duplicate" };
  } catch {
    return { status: "unavailable" };
  }
}
