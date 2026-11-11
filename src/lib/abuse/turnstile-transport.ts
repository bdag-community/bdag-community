import { OFFICIAL_TURNSTILE_ALWAYS_PASS_SECRET_KEY } from "./turnstile-test-credentials.ts";

export const TURNSTILE_SITEVERIFY_URL =
  "https://challenges.cloudflare.com/turnstile/v0/siteverify";
export const TURNSTILE_SITEVERIFY_TIMEOUT_MS = 3_000;

const MAX_TOKEN_LENGTH = 2_048;
const MAX_TOKEN_AGE_MS = 300_000;
const MAX_FUTURE_CLOCK_SKEW_MS = 30_000;

type TurnstileConfig = {
  secretKey: string;
  expectedHostname: string;
  expectedAction: string;
  testing: boolean;
};

type TurnstileResult =
  | { status: "valid" }
  | { status: "invalid" }
  | { status: "unavailable" };

type TurnstileDependencies = {
  fetcher: typeof fetch;
  timeoutSignal: (milliseconds: number) => AbortSignal;
  now: () => number;
};

const DEFAULT_DEPENDENCIES: TurnstileDependencies = {
  fetcher: fetch,
  timeoutSignal: AbortSignal.timeout,
  now: Date.now,
};

type ProviderResponse = {
  success?: unknown;
  hostname?: unknown;
  action?: unknown;
  challenge_ts?: unknown;
};

export async function verifyTurnstileToken(
  config: TurnstileConfig,
  token: string,
  dependencies: TurnstileDependencies = DEFAULT_DEPENDENCIES,
): Promise<TurnstileResult> {
  if (!config.secretKey || !config.expectedHostname || !config.expectedAction) {
    return { status: "unavailable" };
  }
  if (!token || token.length > MAX_TOKEN_LENGTH) {
    return { status: "invalid" };
  }
  if (
    config.testing &&
    (config.secretKey !== OFFICIAL_TURNSTILE_ALWAYS_PASS_SECRET_KEY ||
      config.expectedHostname !== "localhost")
  ) {
    return { status: "invalid" };
  }

  const body = new URLSearchParams({
    secret: config.secretKey,
    response: token,
  });

  try {
    const response = await dependencies.fetcher(TURNSTILE_SITEVERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
      cache: "no-store",
      signal: dependencies.timeoutSignal(TURNSTILE_SITEVERIFY_TIMEOUT_MS),
    });
    if (!response.ok) return { status: "unavailable" };

    const data = (await response.json()) as ProviderResponse | null;
    if (!data || typeof data !== "object") return { status: "unavailable" };
    if (typeof data.success !== "boolean") return { status: "unavailable" };
    if (data.success !== true) return { status: "invalid" };
    if (config.testing) return { status: "valid" };
    if (!config.testing && data.hostname !== config.expectedHostname) {
      return { status: "invalid" };
    }
    if (!config.testing && data.action !== config.expectedAction) {
      return { status: "invalid" };
    }
    if (typeof data.challenge_ts !== "string") return { status: "invalid" };

    const challengedAt = Date.parse(data.challenge_ts);
    const age = dependencies.now() - challengedAt;
    if (
      !Number.isFinite(challengedAt) ||
      age > MAX_TOKEN_AGE_MS ||
      age < -MAX_FUTURE_CLOCK_SKEW_MS
    ) {
      return { status: "invalid" };
    }
    return { status: "valid" };
  } catch {
    return { status: "unavailable" };
  }
}
