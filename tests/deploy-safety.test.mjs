import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";

const deploy = readFileSync(
  new URL("../ops/deploy.sh", import.meta.url),
  "utf8",
);

test("production deployment proves a candidate before switching Caddy", () => {
  const runCandidate = deploy.indexOf('--name "$candidate_name"');
  const candidateHealth = deploy.indexOf('"http://127.0.0.1:${candidate_port}/api/health"');
  const caddyReload = deploy.indexOf("caddy reload --config");
  const retirePrevious = deploy.indexOf('docker stop "$previous_name"');

  assert.ok(runCandidate >= 0);
  assert.ok(candidateHealth > runCandidate);
  assert.ok(caddyReload > candidateHealth);
  assert.ok(retirePrevious > caddyReload);
  assert.doesNotMatch(
    deploy.slice(0, candidateHealth),
    /docker (?:rm -f|stop) bdag-community(?:\s|$)/,
  );
});

test("candidate readiness exceeds the slow upstream health deadline", () => {
  assert.match(deploy, /--max-time 20/);
  assert.match(deploy, /for attempt in \$\(seq 1 12\)/);
  assert.match(deploy, /candidate did not become healthy/i);
  assert.match(deploy, /docker rm -f "\$candidate_name"/);
});

test("the regenerated Caddy proxy requests plain JSON from snapshot routes", () => {
  const snapshot = deploy.indexOf('reverse_proxy @snapshot_json 127.0.0.1:');
  const defaultProxy = deploy.indexOf('reverse_proxy 127.0.0.1:');

  assert.match(deploy, /@snapshot_json path \/api\/stats \/api\/chain-history/);
  assert.ok(snapshot >= 0 && defaultProxy > snapshot);
  assert.match(deploy.slice(snapshot, defaultProxy), /header_up Accept-Encoding identity/);
});

test("a failed traffic switch restores Caddy and keeps the old container", () => {
  assert.match(deploy, /previous_site_file/);
  assert.match(deploy, /restore_caddy/);
  assert.match(deploy, /caddy validate --config \/etc\/caddy\/Caddyfile/);
  assert.match(
    deploy,
    /curl[\s\S]*127\.0\.0\.1:2019\/config\/[\s\S]*jq -e --arg dial "127\.0\.0\.1:\$\{candidate_port\}"/,
  );
  assert.match(deploy, /bdag-community-previous/);
  assert.doesNotMatch(deploy, /docker image prune/);
});

test("go-live runtime refuses a partial production configuration", () => {
  assert.doesNotMatch(deploy, /(?:^|\n)\. "\$runtime_file"/);
  assert.match(deploy, /while IFS='=' read -r runtime_name runtime_value/);
  assert.match(deploy, /export "\$runtime_name=\$runtime_value"/);
  for (const name of [
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    "SUPABASE_SECRET_KEY",
    "RESEND_API_KEY",
    "SUGGESTION_FROM_EMAIL",
    "SUGGESTION_NOTIFY_EMAIL",
    "ASSET_S3_BUCKET",
    "ASSET_S3_ACCESS_KEY_ID",
    "ASSET_S3_SECRET_ACCESS_KEY",
    "ASSET_CAPABILITY_HMAC_SECRET",
    "ASSET_MODERATION_S3_ACCESS_KEY_ID",
    "ASSET_MODERATION_S3_SECRET_ACCESS_KEY",
    "ORIGIN_GATE_SECRET",
  ]) {
    assert.match(deploy, new RegExp(`\\b${name}\\b`));
  }
  assert.match(deploy, /NEXT_PUBLIC_SITE_URL[\s\S]*https:\/\/bdag\.community/);
  assert.match(deploy, /ASSET_S3_REGION[\s\S]*eu-central-1/);
});

test("the public origin accepts only Cloudflare-gated traffic", () => {
  assert.match(deploy, /ORIGIN_GATE_SECRET[\s\S]*\^\[0-9a-f\]\{64\}\$/);
  assert.match(deploy, /@origin_gate header X-BDAG-Origin/);
  assert.match(
    deploy,
    /header_up X-Forwarded-For \{http\.request\.header\.CF-Connecting-IP\}/,
  );
  assert.match(deploy, /respond "Forbidden" 403/);
  assert.match(deploy, /install -o root -g caddy -m 0640/);
  assert.match(
    deploy,
    /select\(\.dial\? == \$dial\)/,
  );
});
