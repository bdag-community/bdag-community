import assert from "node:assert/strict";
import { test } from "node:test";

import {
  RESEND_EMAILS_URL,
  RESEND_REQUEST_TIMEOUT_MS,
  sendResendPlainTextEmail,
} from "../src/lib/email/resend-transport.ts";

const config = {
  apiKey: "unit-test-key",
  recipient: "admin@example.com",
  sender: "BDAG Community Suggestions <suggestions@example.com>",
};

const message = {
  subject: "New bdag.community suggestion",
  text: "Suggestion: A safe synthetic test message.",
};

const createHarness = ({ ok = true, status = 202, error } = {}) => {
  const calls = [];
  const timeoutCalls = [];
  const signal = AbortSignal.abort("test signal");

  return {
    calls,
    timeoutCalls,
    dependencies: {
      fetcher: async (...args) => {
        calls.push(args);
        if (error) {
          throw error;
        }
        return { ok, status };
      },
      timeoutSignal: (milliseconds) => {
        timeoutCalls.push(milliseconds);
        return signal;
      },
    },
  };
};

test("missing Resend configuration fails closed without a request", async () => {
  for (const field of ["apiKey", "recipient", "sender"]) {
    const harness = createHarness();
    const result = await sendResendPlainTextEmail(
      { ...config, [field]: "" },
      message,
      harness.dependencies,
    );

    assert.equal(result, false);
    assert.equal(harness.calls.length, 0);
    assert.equal(harness.timeoutCalls.length, 0);
  }
});

test("unsafe email header values fail closed without a request", async () => {
  for (const unsafeConfig of [
    { ...config, apiKey: "unsafe\r\nkey" },
    { ...config, recipient: "admin@example.com\r\nBcc: other@example.com" },
    { ...config, sender: "Sender\nBcc: other@example.com" },
  ]) {
    const harness = createHarness();
    const result = await sendResendPlainTextEmail(
      unsafeConfig,
      message,
      harness.dependencies,
    );

    assert.equal(result, false);
    assert.equal(harness.calls.length, 0);
  }
});

test("a provider 2xx response is accepted with one fixed plain-text request", async () => {
  const harness = createHarness();
  const result = await sendResendPlainTextEmail(
    config,
    { ...message, replyTo: "visitor@example.com" },
    harness.dependencies,
  );

  assert.equal(result, true);
  assert.equal(harness.calls.length, 1);
  assert.deepEqual(harness.timeoutCalls, [RESEND_REQUEST_TIMEOUT_MS]);

  const [url, init] = harness.calls[0];
  assert.equal(url, RESEND_EMAILS_URL);
  assert.equal(init.method, "POST");
  assert.equal(init.headers.Authorization, `Bearer ${config.apiKey}`);
  assert.equal(init.headers["Content-Type"], "application/json");
  assert.equal(init.headers["User-Agent"], "bdag-community/1.0");
  assert.equal(init.cache, "no-store");

  const body = JSON.parse(init.body);
  assert.equal(body.from, config.sender);
  assert.deepEqual(body.to, [config.recipient]);
  assert.equal(body.subject, message.subject);
  assert.equal(body.text, message.text);
  assert.equal(body.reply_to, "visitor@example.com");
  assert.ok(!("html" in body));
});

test("Reply-To is omitted when the visitor did not provide an email", async () => {
  const harness = createHarness();
  await sendResendPlainTextEmail(config, message, harness.dependencies);

  const body = JSON.parse(harness.calls[0][1].body);
  assert.ok(!("reply_to" in body));
});

test("provider non-2xx responses fail closed", async () => {
  for (const status of [403, 422]) {
    const harness = createHarness({ ok: false, status });
    const result = await sendResendPlainTextEmail(
      config,
      message,
      harness.dependencies,
    );

    assert.equal(result, false);
    assert.equal(harness.calls.length, 1);
  }
});

test("provider timeouts and network errors fail closed", async () => {
  for (const error of [
    new DOMException("Timed out", "TimeoutError"),
    new TypeError("Network request failed"),
  ]) {
    const harness = createHarness({ error });
    const result = await sendResendPlainTextEmail(
      config,
      message,
      harness.dependencies,
    );

    assert.equal(result, false);
    assert.equal(harness.calls.length, 1);
    assert.deepEqual(harness.timeoutCalls, [8_000]);
  }
});
