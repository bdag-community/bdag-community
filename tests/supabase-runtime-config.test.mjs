import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";

const read = (relativePath) =>
  readFileSync(new URL(relativePath, import.meta.url), "utf8");

const publicRuntimeFiles = [
  "../src/lib/supabase/env.ts",
  "../src/lib/supabase/server.ts",
  "../src/lib/supabase/public.ts",
  "../src/lib/supabase/client.ts",
  "../src/middleware.ts",
];

test("the runtime consumes the approved publishable and secret key names", () => {
  for (const relativePath of publicRuntimeFiles) {
    const source = read(relativePath);
    assert.match(source, /NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY/);
    assert.doesNotMatch(source, /NEXT_PUBLIC_SUPABASE_ANON_KEY/);
  }

  const privilegedClient = read("../src/lib/supabase/admin.ts");
  assert.match(privilegedClient, /process\.env\.SUPABASE_SECRET_KEY/);
  assert.match(
    privilegedClient,
    /process\.env\.NEXT_PUBLIC_SUPABASE_SECRET_KEY/,
    "a public copy of the secret key must fail fast",
  );
  assert.doesNotMatch(privilegedClient, /SUPABASE_SERVICE_ROLE_KEY/);

  const example = read("../.env.local.example");
  assert.match(example, /^NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=$/m);
  assert.match(example, /^SUPABASE_SECRET_KEY=$/m);
  assert.doesNotMatch(example, /SUPABASE_(?:ANON|SERVICE_ROLE)_KEY/);
});

test("Docker builds expose only the publishable Supabase key to client bundles", () => {
  const dockerfile = read("../Dockerfile");
  const compose = read("../docker-compose.yml");
  const deploy = read("../ops/deploy.sh");

  for (const source of [dockerfile, compose, deploy]) {
    assert.match(source, /NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY/);
    assert.doesNotMatch(source, /NEXT_PUBLIC_SUPABASE_ANON_KEY/);
    assert.doesNotMatch(source, /SUPABASE_SERVICE_ROLE_KEY/);
  }
  assert.doesNotMatch(
    dockerfile,
    /ARG SUPABASE_SECRET_KEY|ENV[^\n]*SUPABASE_SECRET_KEY/,
    "the server-only secret belongs in the runtime env file, never a build layer",
  );
});

test("local Supabase config is reproducible without a hosted project reference", () => {
  const config = read("../supabase/config.toml");

  assert.match(config, /^project_id = "bdag-community-local"$/m);
  assert.match(config, /^\[auth\.hook\.custom_access_token\]$/m);
  assert.match(config, /^enabled = true$/m);
  assert.match(
    config,
    /^uri = "pg-functions:\/\/postgres\/public\/custom_access_token_hook"$/m,
  );
  assert.doesNotMatch(config, /project_ref|supabase\.co|sb_(?:publishable|secret)_/i);
  assert.doesNotMatch(config, /(?:^|\s)port = 5432$/m);
});

test("all Supabase CLI machine metadata stays ignored", () => {
  const gitignore = read("../.gitignore");

  assert.match(gitignore, /^supabase\/\.temp\/$/m);
  assert.match(gitignore, /^supabase\/\.branches\/$/m);
});
