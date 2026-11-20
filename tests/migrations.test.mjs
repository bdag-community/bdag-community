import { readdirSync, readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";

// Migration convention guards (the proven bdag-miner-sales family pattern):
// every migration is paste-safe (idempotent), enables RLS in the SAME file
// that creates each table, and keeps comments free of single-quote
// apostrophes (they have bitten dashboard/CLI pastes before). Plus the
// contract surface: the three tables and the two identity functions exist.

const dir = new URL("../supabase/migrations", import.meta.url).pathname;
const files = readdirSync(dir)
  .filter((f) => f.endsWith(".sql"))
  .sort();
const migrations = files.map((f) => ({
  name: f,
  sql: readFileSync(`${dir}/${f}`, "utf8"),
}));
const migration = (name) =>
  migrations.find(({ name: candidate }) => candidate === name)?.sql ?? "";
const supabaseReadme = readFileSync(
  new URL("../supabase/README.md", import.meta.url),
  "utf8",
);

test("there are migrations to check", () => {
  assert.equal(migrations.length, 19, `expected 19 migrations (found ${files.length})`);
});

test("every CREATE TABLE is idempotent (IF NOT EXISTS)", () => {
  for (const { name, sql } of migrations) {
    const creates = sql.match(/create table\s+\S+/gi) ?? [];
    for (const stmt of creates) {
      assert.match(
        stmt,
        /create table\s+if/i,
        `${name}: "${stmt}" must use CREATE TABLE IF NOT EXISTS.`,
      );
    }
  }
});

test("every created table enables RLS in the SAME migration", () => {
  for (const { name, sql } of migrations) {
    const tables = [...sql.matchAll(/create table if not exists (public\.\w+)/gi)];
    for (const [, table] of tables) {
      assert.match(
        sql,
        new RegExp(`alter table ${table.replace(".", "\\.")} enable row level security`),
        `${name}: ${table} must enable ROW LEVEL SECURITY in the same file.`,
      );
    }
  }
});

test("every CREATE POLICY is preceded by its DROP POLICY IF EXISTS", () => {
  for (const { name, sql } of migrations) {
    const policies = [...sql.matchAll(/create policy "([^"]+)"/g)];
    for (const [, policy] of policies) {
      const drop = sql.indexOf(`drop policy if exists "${policy}"`);
      const create = sql.indexOf(`create policy "${policy}"`);
      assert.ok(
        drop !== -1 && drop < create,
        `${name}: policy "${policy}" needs DROP POLICY IF EXISTS before CREATE POLICY (idempotency).`,
      );
    }
  }
});

test("no single-quote apostrophes inside SQL comments", () => {
  for (const { name, sql } of migrations) {
    sql.split("\n").forEach((line, i) => {
      const at = line.indexOf("--");
      if (at === -1) return;
      assert.ok(
        !line.slice(at).includes("'"),
        `${name}:${i + 1} comment contains an apostrophe — rewrite without it.`,
      );
    });
  }
});

test("the contract tables and boundary functions exist across the set", () => {
  const all = migrations.map((m) => m.sql).join("\n");
  for (const table of [
    "public.profiles",
    "public.news_articles",
    "public.contact_messages",
    "public.submission_rate_limits",
    "public.submission_token_claims",
    "public.article_assets",
  ]) {
    assert.ok(
      all.includes(`create table if not exists ${table}`),
      `the migration set must create ${table}`,
    );
  }
  assert.match(all, /create or replace function public\.is_admin\(\)/);
  assert.match(all, /create or replace function public\.custom_access_token_hook\(event jsonb\)/);
  assert.match(all, /create or replace function public\.consume_submission_rate_limit\(/);
  assert.match(all, /create or replace function public\.claim_submission_token\(/);
});

test("Turnstile replay claims are private, atomic, and short-lived", () => {
  const replay = migration("0005_turnstile_replay.sql");

  assert.match(replay, /create table if not exists public\.submission_token_claims/);
  assert.match(replay, /alter table public\.submission_token_claims enable row level security/);
  assert.match(
    replay,
    /revoke all on table public\.submission_token_claims\s+from anon, authenticated, service_role, public/,
  );
  assert.match(replay, /create or replace function public\.claim_submission_token\(/);
  assert.match(replay, /security definer/);
  assert.match(replay, /set search_path = ''/);
  assert.match(replay, /on conflict \(fingerprint\) do nothing/);
  assert.doesNotMatch(replay, /on conflict[\s\S]*?do update/);
  assert.match(replay, /interval '10 minutes'/);
  assert.match(
    replay,
    /delete from public\.submission_token_claims[\s\S]*?expires_at <= statement_timestamp\(\)/,
  );
  assert.match(
    replay,
    /revoke all on function public\.claim_submission_token\(text\)\s+from anon, authenticated, service_role, public/,
  );
  assert.match(
    replay,
    /grant execute on function public\.claim_submission_token\(text\)\s+to service_role/,
  );
  assert.doesNotMatch(replay, /turnstile_token|cf-turnstile-response|raw_token/i);
});

test("the Supabase guide records the linked migration boundary and current inventory", () => {
  assert.match(supabaseReadme, /Migrations `0001` through `0015` are already applied/);
  for (let sequence = 1; sequence <= 15; sequence += 1) {
    const id = String(sequence).padStart(4, "0");
    assert.match(
      supabaseReadme,
      new RegExp("`" + id + "`"),
      `the migration inventory must document ${id}`,
    );
  }
  assert.match(
    supabaseReadme,
    /`0005`[\s\S]*HMAC[\s\S]*atomic[\s\S]*Turnstile[\s\S]*replay[\s\S]*retention/i,
  );
  assert.match(
    supabaseReadme,
    /`0006`[\s\S]*private article-asset[\s\S]*conditional-upload capability RPCs/i,
  );
  assert.match(
    supabaseReadme,
    /`0007`[\s\S]*private processing[\s\S]*admin moderation[\s\S]*publication RPCs/i,
  );
  assert.match(
    supabaseReadme,
    /`0015`[\s\S]*RPC quorum[\s\S]*explorer provenance/i,
  );
});

test("the JWT hook has the documented auth-admin grants and fails closed on demotion", () => {
  const identity = migration("0001_identity.sql");

  assert.match(
    identity,
    /grant usage on schema public to supabase_auth_admin;/,
    "the Auth service needs explicit USAGE on public before it can invoke the hook",
  );
  assert.match(
    identity,
    /grant execute on function public\.custom_access_token_hook\(jsonb\) to supabase_auth_admin;/,
  );
  assert.match(
    identity,
    /to_jsonb\(coalesce\(admin, false\)\)/,
    "a fresh token must receive admin=false after the profile is demoted",
  );
  assert.doesNotMatch(
    identity,
    /if admin then[\s\S]*?app_metadata, admin/,
    "the hook must not preserve a stale true claim when the source-of-truth row is false",
  );
});

test("the frozen intake migrations granted only their historical insert surfaces", () => {
  const news = migration("0002_news.sql");
  const contact = migration("0003_contact.sql");

  for (const [name, sql, table] of [
    ["news", news, "news_articles"],
    ["contact", contact, "contact_messages"],
  ]) {
    assert.match(
      sql,
      new RegExp(`revoke all on table public\\.${table} from service_role;`),
      `${name} must clear inherited service-role grants first`,
    );
    assert.match(
      sql,
      new RegExp(`grant insert on table public\\.${table} to service_role;`),
      `${name} intake needs INSERT and nothing broader`,
    );
    assert.doesNotMatch(
      sql,
      new RegExp(`grant all on table public\\.${table} to service_role;`),
    );
  }
});

test("migration 0006 replaces direct news intake with narrow asset RPCs", () => {
  const assets = migration("0006_article_assets.sql");

  assert.match(
    assets,
    /revoke all on table public\.news_articles from service_role;/,
  );
  assert.match(assets, /security definer/);
  assert.match(assets, /set search_path = ''/);
  assert.match(
    assets,
    /grant execute on function public\.create_community_article_draft\([\s\S]*?\) to service_role;/,
  );
  assert.match(
    assets,
    /grant execute on function public\.claim_article_asset_presign\(text, text\)\s+to service_role;/,
  );
  assert.match(
    assets,
    /p_storage_environment is null[\s\S]*p_asset_content_type is null[\s\S]*p_asset_byte_size is null/i,
  );
});

test("news grants clear inherited privileges before restoring the exact public surface", () => {
  const news = migration("0002_news.sql");
  const revokeAt = news.indexOf(
    "revoke all on table public.news_articles from anon, authenticated, public;",
  );
  const publicReadAt = news.indexOf(
    "grant select on table public.news_articles to anon, authenticated;",
  );
  const adminWritesAt = news.indexOf(
    "grant insert, update, delete on table public.news_articles to authenticated;",
  );

  assert.ok(
    revokeAt >= 0 && revokeAt < publicReadAt && publicReadAt < adminWritesAt,
    "public roles must lose inherited TRUNCATE and other grants before the exact API grants return",
  );
});
