import assert from "node:assert/strict";
import { test } from "node:test";

import {
  canonicalizeClientAddress,
  createSubmissionFingerprint,
  createTurnstileTokenFingerprint,
} from "../src/lib/abuse/fingerprint.ts";
import {
  knownFormPayloadBytes,
  payloadFits,
} from "../src/lib/abuse/payload.ts";
import { protectSubmission } from "../src/lib/abuse/protection.ts";
import {
  RATE_LIMIT_REQUEST_TIMEOUT_MS,
  consumeSubmissionRateLimit,
} from "../src/lib/abuse/rate-limit-transport.ts";
import {
  TOKEN_CLAIM_REQUEST_TIMEOUT_MS,
  claimSubmissionToken,
} from "../src/lib/abuse/token-claim-transport.ts";
import {
  TURNSTILE_SITEVERIFY_TIMEOUT_MS,
  TURNSTILE_SITEVERIFY_URL,
  verifyTurnstileToken,
} from "../src/lib/abuse/turnstile-transport.ts";

const NOW = Date.parse("2026-08-12T17:00:00.000Z");
const DIGEST = "a".repeat(64);

function turnstileHarness(response, options = {}) {
  const calls = [];
  const timeoutCalls = [];
  const signal = AbortSignal.abort("unit-test signal");
  return {
    calls,
    timeoutCalls,
    dependencies: {
      now: () => NOW,
      timeoutSignal: (milliseconds) => {
        timeoutCalls.push(milliseconds);
        return signal;
      },
      fetcher: async (...args) => {
        calls.push(args);
        if (options.error) throw options.error;
        return {
          ok: options.ok ?? true,
          json: async () => response,
        };
      },
    },
  };
}

const turnstileConfig = {
  secretKey: "unit-test-secret",
  expectedHostname: "bdag.community",
  expectedAction: "submit_article",
  testing: false,
};

test("Turnstile fails closed locally when configuration or token is invalid", async () => {
  for (const [config, token, expected] of [
    [{ ...turnstileConfig, secretKey: "" }, "token", "unavailable"],
    [{ ...turnstileConfig, expectedHostname: "" }, "token", "unavailable"],
    [{ ...turnstileConfig, expectedAction: "" }, "token", "unavailable"],
    [turnstileConfig, "", "invalid"],
    [turnstileConfig, "x".repeat(2_049), "invalid"],
  ]) {
    const harness = turnstileHarness({ success: true });
    const result = await verifyTurnstileToken(config, token, harness.dependencies);
    assert.equal(result.status, expected);
    assert.equal(harness.calls.length, 0);
  }
});

test("Turnstile accepts one exact, fresh, action-bound provider response", async () => {
  const harness = turnstileHarness({
    success: true,
    hostname: "bdag.community",
    action: "submit_article",
    challenge_ts: new Date(NOW - 30_000).toISOString(),
  });
  const result = await verifyTurnstileToken(
    turnstileConfig,
    "synthetic-token",
    harness.dependencies,
  );

  assert.deepEqual(result, { status: "valid" });
  assert.equal(harness.calls.length, 1);
  assert.deepEqual(harness.timeoutCalls, [TURNSTILE_SITEVERIFY_TIMEOUT_MS]);
  assert.equal(TURNSTILE_SITEVERIFY_TIMEOUT_MS, 3_000);

  const [url, init] = harness.calls[0];
  assert.equal(url, TURNSTILE_SITEVERIFY_URL);
  assert.equal(init.method, "POST");
  assert.equal(init.cache, "no-store");
  assert.equal(init.headers["Content-Type"], "application/x-www-form-urlencoded");
  assert.equal(init.signal.aborted, true);
  const body = new URLSearchParams(init.body);
  assert.equal(body.get("secret"), turnstileConfig.secretKey);
  assert.equal(body.get("response"), "synthetic-token");
  assert.equal(body.has("remoteip"), false);
});

test("Turnstile test mode is restricted to official localhost dummy credentials", async () => {
  for (const config of [
    { ...turnstileConfig, testing: true },
    {
      ...turnstileConfig,
      secretKey: "1x0000000000000000000000000000000AA",
      expectedHostname: "bdag.community",
      testing: true,
    },
  ]) {
    const harness = turnstileHarness({ success: true });
    const result = await verifyTurnstileToken(
      config,
      "synthetic-token",
      harness.dependencies,
    );
    assert.equal(result.status, "invalid");
    assert.equal(harness.calls.length, 0);
  }

  const harness = turnstileHarness({
    success: true,
    hostname: "dummy-key-pass.cloudflare.com",
    action: "test",
    challenge_ts: "2022-01-01T00:00:00.000Z",
  });
  const result = await verifyTurnstileToken(
    {
      ...turnstileConfig,
      secretKey: "1x0000000000000000000000000000000AA",
      expectedHostname: "localhost",
      testing: true,
    },
    "synthetic-token",
    harness.dependencies,
  );
  assert.equal(result.status, "valid");
});

test("Turnstile rejects replay, stale, future, hostname, and action mismatches", async () => {
  const cases = [
    { success: false, "error-codes": ["timeout-or-duplicate"] },
    {
      success: true,
      hostname: "bdag.community",
      action: "submit_article",
      challenge_ts: new Date(NOW - 300_001).toISOString(),
    },
    {
      success: true,
      hostname: "bdag.community",
      action: "submit_article",
      challenge_ts: new Date(NOW + 30_001).toISOString(),
    },
    {
      success: true,
      hostname: "wrong.example",
      action: "submit_article",
      challenge_ts: new Date(NOW).toISOString(),
    },
    {
      success: true,
      hostname: "bdag.community",
      action: "wrong_action",
      challenge_ts: new Date(NOW).toISOString(),
    },
  ];
  for (const response of cases) {
    const harness = turnstileHarness(response);
    const result = await verifyTurnstileToken(
      turnstileConfig,
      "synthetic-token",
      harness.dependencies,
    );
    assert.equal(result.status, "invalid");
    assert.equal(harness.calls.length, 1);
  }
});

test("Turnstile provider and response failures are unavailable with no retry", async () => {
  for (const harness of [
    turnstileHarness({}, { ok: false }),
    turnstileHarness(null),
    turnstileHarness({ hostname: "bdag.community" }),
    turnstileHarness({}, { error: new DOMException("Timed out", "TimeoutError") }),
  ]) {
    const result = await verifyTurnstileToken(
      turnstileConfig,
      "synthetic-token",
      harness.dependencies,
    );
    assert.equal(result.status, "unavailable");
    assert.equal(harness.calls.length, 1);
  }
});

test("submission fingerprints are canonical, scoped, and irreversible", () => {
  const secret = "unit-test-hmac-secret-that-is-long-enough";
  assert.equal(canonicalizeClientAddress("::ffff:192.0.2.10"), "192.0.2.10");
  assert.equal(
    canonicalizeClientAddress("2001:0db8:0:0:0:0:0:1"),
    "2001:db8::1",
  );
  assert.equal(
    canonicalizeClientAddress("192.0.2.10, 127.0.0.1"),
    "192.0.2.10",
  );
  assert.equal(canonicalizeClientAddress("not-an-address"), null);

  const article = createSubmissionFingerprint(
    "article",
    "::ffff:192.0.2.10",
    secret,
  );
  const articleAgain = createSubmissionFingerprint(
    "article",
    "192.0.2.10, 127.0.0.1",
    secret,
  );
  const suggestion = createSubmissionFingerprint(
    "suggestion",
    "192.0.2.10",
    secret,
  );
  assert.match(article ?? "", /^[a-f0-9]{64}$/);
  assert.equal(article, articleAgain);
  assert.notEqual(article, suggestion);
  assert.doesNotMatch(article ?? "", /192\.0\.2\.10/);
  assert.equal(createSubmissionFingerprint("article", "192.0.2.10", "short"), null);
});

test("Turnstile token fingerprints are bounded, irreversible, and token-specific", () => {
  const secret = "unit-test-hmac-secret-that-is-long-enough";
  const first = createTurnstileTokenFingerprint("first-token", secret);
  const firstAgain = createTurnstileTokenFingerprint("first-token", secret);
  const second = createTurnstileTokenFingerprint("second-token", secret);

  assert.match(first ?? "", /^[a-f0-9]{64}$/);
  assert.equal(first, firstAgain);
  assert.notEqual(first, second);
  assert.doesNotMatch(first ?? "", /first-token/);
  assert.equal(createTurnstileTokenFingerprint("", secret), null);
  assert.equal(
    createTurnstileTokenFingerprint("x".repeat(2_049), secret),
    null,
  );
  assert.equal(createTurnstileTokenFingerprint("first-token", "short"), null);
});

test("the token-claim transport makes one bounded, service-only RPC request", async () => {
  const calls = [];
  const timeoutCalls = [];
  const signal = AbortSignal.abort("unit-test signal");
  const result = await claimSubmissionToken(DIGEST, {
    timeoutSignal: (milliseconds) => {
      timeoutCalls.push(milliseconds);
      return signal;
    },
    rpc: async (...args) => {
      calls.push(args);
      return { data: true, error: null };
    },
  });

  assert.deepEqual(result, { status: "claimed" });
  assert.equal(TOKEN_CLAIM_REQUEST_TIMEOUT_MS, 3_000);
  assert.deepEqual(timeoutCalls, [TOKEN_CLAIM_REQUEST_TIMEOUT_MS]);
  assert.deepEqual(calls, [
    ["claim_submission_token", { p_fingerprint: DIGEST }, signal],
  ]);
});

test("the token-claim transport fails closed for replay and storage failures", async () => {
  for (const [data, error, expected] of [
    [false, null, "duplicate"],
    [null, { message: "redacted" }, "unavailable"],
    ["true", null, "unavailable"],
  ]) {
    const result = await claimSubmissionToken(DIGEST, {
      timeoutSignal: AbortSignal.timeout,
      rpc: async () => ({ data, error }),
    });
    assert.equal(result.status, expected);
  }

  let called = false;
  const malformed = await claimSubmissionToken("raw-token", {
    timeoutSignal: AbortSignal.timeout,
    rpc: async () => {
      called = true;
      return { data: true, error: null };
    },
  });
  assert.equal(malformed.status, "unavailable");
  assert.equal(called, false);
});

test("the rate-limit transport uses one bounded, minimal RPC request", async () => {
  const calls = [];
  const timeoutCalls = [];
  const signal = AbortSignal.abort("unit-test signal");
  const result = await consumeSubmissionRateLimit("article", DIGEST, {
    timeoutSignal: (milliseconds) => {
      timeoutCalls.push(milliseconds);
      return signal;
    },
    rpc: async (...args) => {
      calls.push(args);
      return {
        data: [{ allowed: true, remaining: 2, retry_after_seconds: 60 }],
        error: null,
      };
    },
  });

  assert.deepEqual(result, {
    status: "allowed",
    remaining: 2,
    retryAfterSeconds: 60,
  });
  assert.equal(RATE_LIMIT_REQUEST_TIMEOUT_MS, 3_000);
  assert.deepEqual(timeoutCalls, [RATE_LIMIT_REQUEST_TIMEOUT_MS]);
  assert.deepEqual(calls, [
    [
      "consume_submission_rate_limit",
      { p_scope: "article", p_fingerprint: DIGEST },
      signal,
    ],
  ]);
});

test("the rate-limit transport fails closed on exhaustion or bad storage responses", async () => {
  const cases = [
    {
      data: [{ allowed: false, remaining: 0, retry_after_seconds: 30 }],
      error: null,
      expected: "limited",
    },
    { data: null, error: { message: "redacted" }, expected: "unavailable" },
    { data: [], error: null, expected: "unavailable" },
  ];
  for (const item of cases) {
    const result = await consumeSubmissionRateLimit("suggestion", DIGEST, {
      timeoutSignal: AbortSignal.timeout,
      rpc: async () => ({ data: item.data, error: item.error }),
    });
    assert.equal(result.status, item.expected);
  }
  let called = false;
  const invalid = await consumeSubmissionRateLimit("article", "raw-ip", {
    timeoutSignal: AbortSignal.timeout,
    rpc: async () => {
      called = true;
      return { data: [], error: null };
    },
  });
  assert.equal(invalid.status, "unavailable");
  assert.equal(called, false);
});

test("the protection pipeline limits attempts before verification and writes", async () => {
  const events = [];
  const result = await protectSubmission(
    { scope: "article", action: "submit_article", token: "token" },
    {
      fingerprint: async (scope) => {
        events.push(`fingerprint:${scope}`);
        return DIGEST;
      },
      consume: async (scope) => {
        events.push(`consume:${scope}`);
        return { status: "allowed", remaining: 1, retryAfterSeconds: 60 };
      },
      verify: async () => {
        events.push("verify");
        return { status: "valid" };
      },
      claim: async () => {
        events.push("claim");
        return { status: "claimed" };
      },
    },
  );
  assert.deepEqual(result, { status: "allowed" });
  assert.deepEqual(events, [
    "fingerprint:challenge",
    "consume:challenge",
    "verify",
    "claim",
    "fingerprint:article",
    "consume:article",
  ]);
});

test("a duplicate verified token stops before the form quota and side effect", async () => {
  const events = [];
  const result = await protectSubmission(
    { scope: "article", action: "submit_article", token: "replayed-token" },
    {
      fingerprint: async (scope) => {
        events.push(`fingerprint:${scope}`);
        return DIGEST;
      },
      consume: async (scope) => {
        events.push(`consume:${scope}`);
        return { status: "allowed", remaining: 1, retryAfterSeconds: 60 };
      },
      verify: async () => {
        events.push("verify");
        return { status: "valid" };
      },
      claim: async () => {
        events.push("claim");
        return { status: "duplicate" };
      },
    },
  );

  assert.deepEqual(result, { status: "verification_required" });
  assert.deepEqual(events, [
    "fingerprint:challenge",
    "consume:challenge",
    "verify",
    "claim",
  ]);
});

test("the protection pipeline stops before provider or form side effects", async () => {
  let verifyCalls = 0;
  const limited = await protectSubmission(
    { scope: "suggestion", action: "submit_suggestion", token: "token" },
    {
      fingerprint: async () => DIGEST,
      consume: async () => ({
        status: "limited",
        remaining: 0,
        retryAfterSeconds: 60,
      }),
      verify: async () => {
        verifyCalls += 1;
        return { status: "valid" };
      },
      claim: async () => ({ status: "claimed" }),
    },
  );
  assert.equal(limited.status, "rate_limited");
  assert.equal(verifyCalls, 0);

  let consumeCalls = 0;
  const invalid = await protectSubmission(
    { scope: "contact", action: "contact_message", token: "bad" },
    {
      fingerprint: async () => DIGEST,
      consume: async () => {
        consumeCalls += 1;
        return { status: "allowed", remaining: 1, retryAfterSeconds: 60 };
      },
      verify: async () => ({ status: "invalid" }),
      claim: async () => ({ status: "claimed" }),
    },
  );
  assert.equal(invalid.status, "verification_required");
  assert.equal(consumeCalls, 1);
});

test("known-field payload limits count UTF-8 bytes independently", () => {
  assert.equal(knownFormPayloadBytes({ message: "é" }), 2);
  assert.equal(payloadFits({ body: "a".repeat(16) }, 16), true);
  assert.equal(payloadFits({ body: "a".repeat(17) }, 16), false);
});
