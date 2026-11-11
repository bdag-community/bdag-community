import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (relative) =>
  readFileSync(new URL(relative, import.meta.url), "utf8");

const articleAction = read("../src/app/(public)/articles/submit/actions.ts");
const suggestionAction = read("../src/app/(public)/community/actions.ts");
const contactAction = read("../src/app/(public)/contact/actions.ts");
const articleForm = read("../src/components/news/CommunityArticleForm.tsx");
const suggestionForm = read("../src/components/community/SuggestionForm.tsx");
const contactForm = read("../src/components/contact/ContactForm.tsx");
const widget = read("../src/components/security/TurnstileWidget.tsx");
const serverBoundary = read("../src/lib/abuse/public-submission.server.ts");
const migration = read("../supabase/migrations/0004_submission_abuse.sql");
const site = read("../src/lib/content/site.ts");
const nextConfig = read("../next.config.ts");
const dockerfile = read("../Dockerfile");
  const compose = read("../docker-compose.yml");
const deploy = read("../ops/deploy.sh");
const envExample = read("../.env.local.example");
const eslintConfig = read("../eslint.config.mjs");
const runbook = read("../SUPABASE-S3-INTEGRATION-RUNBOOK.md");

function assertProtected(action, scope, sideEffect) {
  const honeypotAt = action.indexOf('formData.get("website")');
  const validationAt = action.indexOf("schema.safeParse");
  const protectionAt = action.indexOf(`protectPublicSubmission("${scope}"`);
  const protectionImportAt = action.lastIndexOf("\n", protectionAt);
  const sideEffectAt = action.indexOf(sideEffect, protectionAt);
  assert.ok(
    honeypotAt >= 0 &&
      honeypotAt < validationAt &&
      validationAt < protectionImportAt &&
      protectionAt < sideEffectAt,
    `${scope} must honeypot, validate, protect, then perform its side effect`,
  );
  assert.match(action, /formData\.get\("cf-turnstile-response"\)/);
  assert.match(action, /formError\?: string/);
  assert.match(action, /payloadFits\(/);
}

test("all three anonymous write paths share the protection boundary", () => {
  assertProtected(
    articleAction,
    "article",
    '"create_community_article_draft"',
  );
  assertProtected(suggestionAction, "suggestion", "sendSuggestionEmail");
  assertProtected(contactAction, "contact", '.from("contact_messages")');
  assert.match(serverBoundary, /submit_article/);
  assert.match(serverBoundary, /submit_suggestion/);
  assert.match(serverBoundary, /contact_message/);
  assert.match(serverBoundary, /headers\(\)/);
  assert.match(serverBoundary, /ABUSE_HMAC_SECRET/);
  assert.match(serverBoundary, /requestHostname/);
  assert.match(serverBoundary, /OFFICIAL_TURNSTILE_ALWAYS_PASS_SITE_KEY/);
  assert.match(serverBoundary, /createTurnstileTokenFingerprint/);
  assert.match(serverBoundary, /claimSubmissionToken/);
  assert.doesNotMatch(serverBoundary, /console\.|remoteip|article body|visitor content/i);
});

test("each public form renders and resets the shared accessible challenge", () => {
  for (const [form, action] of [
    [articleForm, "submit_article"],
    [suggestionForm, "submit_suggestion"],
    [contactForm, "contact_message"],
  ]) {
    assert.match(form, /<TurnstileWidget/);
    assert.match(form, new RegExp(`action="${action}"`));
    assert.match(form, /attempt=\{state\.attempt\}/);
    assert.match(form, /onVerifiedChange=\{handleVerifiedChange\}/);
    assert.match(form, /!humanVerified/);
    assert.match(form, /state\.formError/);
  }
  assert.match(widget, /challenges\.cloudflare\.com\/turnstile\/v0\/api\.js\?render=explicit/);
  assert.match(widget, /cf-turnstile-response/);
  assert.match(widget, /turnstile\.reset/);
  assert.match(widget, /turnstile\.remove/);
  assert.match(widget, /onError=/);
  assert.match(widget, /"refresh-expired"/);
  assert.match(widget, /"response-field-name"/);
  assert.match(widget, /tabIndex=\{-1\}/);
  assert.match(widget, /<noscript>/);
  assert.match(widget, /ABUSE_PROTECTION_COPY/);
  assert.match(widget, /onVerifiedChange\(true\)/);
  assert.match(widget, /onVerifiedChange\(false\)/);
  assert.doesNotMatch(widget, /TURNSTILE_SECRET_KEY|ABUSE_HMAC_SECRET/);
});

test("the shared copy states privacy, retention, JavaScript, and fail-closed behavior", () => {
  const copy = site.slice(
    site.indexOf("ABUSE_PROTECTION_COPY"),
    site.indexOf("/*", site.indexOf("ABUSE_PROTECTION_COPY")),
  );
  assert.match(copy, /Cloudflare Turnstile/);
  assert.match(copy, /JavaScript is required/);
  assert.match(copy, /Nothing was submitted/);
  assert.match(copy, /do not send your form text/i);
  assert.match(copy, /24 hours after (?:its|the) window closes/i);
  assert.doesNotMatch(copy, /—/);
});

test("Next and Docker configuration preserve the public and secret boundaries", () => {
  assert.match(nextConfig, /script-src[^\n]*https:\/\/challenges\.cloudflare\.com/);
  assert.match(nextConfig, /frame-src https:\/\/challenges\.cloudflare\.com/);
  assert.match(nextConfig, /serverActions:[\s\S]*bodySizeLimit:\s*"1mb"/);
  for (const source of [dockerfile, compose, deploy]) {
    assert.match(source, /NEXT_PUBLIC_TURNSTILE_SITE_KEY/);
  }
  assert.match(compose, /127\.0\.0\.1:3011:3000/);
  assert.match(
    compose,
    /NEXT_PUBLIC_TURNSTILE_SITE_KEY:[^\n]*1x00000000000000000000AA/,
  );
  assert.doesNotMatch(dockerfile, /ARG (?:TURNSTILE_SECRET_KEY|ABUSE_HMAC_SECRET)/);
  assert.doesNotMatch(
    dockerfile,
    /ENV[^\n]*(?:TURNSTILE_SECRET_KEY|ABUSE_HMAC_SECRET)/,
  );
  assert.match(eslintConfig, /supabase\/\.temp\/\*\*/);
  assert.match(deploy, /TURNSTILE_SECRET_KEY/);
  assert.match(deploy, /TURNSTILE_EXPECTED_HOSTNAME/);
  assert.match(deploy, /ABUSE_HMAC_SECRET/);
  assert.equal(
    (deploy.match(/dummy Turnstile test keys are forbidden in production/g) ?? [])
      .length,
    2,
  );
  for (const name of [
    "NEXT_PUBLIC_TURNSTILE_SITE_KEY",
    "TURNSTILE_SECRET_KEY",
    "TURNSTILE_EXPECTED_HOSTNAME",
    "TURNSTILE_TEST_MODE",
    "ABUSE_HMAC_SECRET",
  ]) {
    assert.match(envExample, new RegExp(`^${name}=`, "m"));
  }
});

test("migration 0004 exposes one atomic, service-role-only limiter", () => {
  assert.match(migration, /create table if not exists public\.submission_rate_limits/);
  assert.match(migration, /enable row level security/);
  assert.match(migration, /security definer/);
  assert.match(migration, /set search_path = ''/);
  assert.match(migration, /consume_submission_rate_limit/);
  assert.match(migration, /'challenge'[\s\S]*30[\s\S]*10 minutes/);
  assert.match(migration, /'article'[\s\S]*3[\s\S]*24 hours/);
  assert.match(migration, /'suggestion'[\s\S]*5[\s\S]*1 hour/);
  assert.match(migration, /'contact'[\s\S]*5[\s\S]*1 hour/);
  assert.match(migration, /grant execute[\s\S]*to service_role/);
  assert.match(migration, /revoke all[\s\S]*from anon, authenticated, service_role, public/);
  const tableDefinition = migration.slice(
    migration.indexOf("create table if not exists public.submission_rate_limits"),
    migration.indexOf(");", migration.indexOf("create table if not exists public.submission_rate_limits")),
  );
  assert.doesNotMatch(
    tableDefinition,
    /\b(?:ip_address|email|token|user_agent|article_body|message)\b/i,
  );
});

test("the runbook keeps completed Step 7 closed after Step 11 completes", () => {
  assert.match(
    runbook,
    /^Status: steps 1 through 11 complete; step 12 is not started\s*$/m,
  );
  assert.match(runbook, /^Last completed step: 11\s*$/m);
  assert.match(
    runbook,
    /^Next authorised step: 12 only\s*$/m,
  );
  const step7 = runbook.slice(
    runbook.indexOf("## Step 7:"),
    runbook.indexOf("## Step 8:"),
  );
  assert.match(step7, /Status: Complete \(2026-08-13\)/);
  assert.match(step7, /`bdag-community-production`/);
  assert.match(step7, /0005_turnstile_replay\.sql/);
  assert.match(step7, /admin@bdag\.community[\s\S]*Active[\s\S]*2FA[\s\S]*active/i);
  assert.match(step7, /all three anonymous write paths/i);
  assert.match(step7, /30 attempts per 10 minutes/i);
  assert.match(step7, /3 article\s+submissions per 24 hours/i);
  assert.match(step7, /5 suggestion emails per hour/i);
  assert.match(step7, /5 contact\s+messages per hour/i);
  assert.match(step7, /465[\s\S]*zero horizontal overflow/i);
  assert.match(step7, /temporary hosts[\s\S]*removed/i);
  assert.doesNotMatch(step7, /Status: In progress/);
});
