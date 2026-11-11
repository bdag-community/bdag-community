import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const schema = read("../supabase/migrations/20260928114244_admin_infrastructure_and_activity.sql");
const audit = read("../supabase/migrations/20260928115848_admin_activity_context_and_order.sql");

test("the directory and activity log have separate public/admin boundaries", () => {
  assert.match(schema, /alter table public\.infrastructure_resources enable row level security/);
  assert.match(schema, /for select to anon, authenticated using \(true\)/);
  assert.match(schema, /for insert to authenticated\s+with check \(public\.is_admin\(\)\)/);
  assert.match(schema, /for update to authenticated\s+using \(public\.is_admin\(\)\) with check \(public\.is_admin\(\)\)/);
  assert.match(schema, /for delete to authenticated using \(public\.is_admin\(\)\)/);
  assert.match(schema, /alter table public\.admin_activity enable row level security/);
  assert.match(schema, /grant select on table public\.admin_activity to authenticated/);
  assert.doesNotMatch(schema, /grant (insert|update|delete) on table public\.admin_activity to authenticated/i);
});

test("the canonical RPC stays fixed and the flagged RPC remains text-only", () => {
  assert.match(schema, /infrastructure_canonical_fixed/);
  assert.match(schema, /rpc_host = 'rpc\.blockdag\.engineering'/);
  assert.match(schema, /rpc_role is distinct from 'canonical'/);
  const panel = read("../src/components/mining/NodesPanel.tsx");
  assert.doesNotMatch(panel, /href=\{[^}]*node\./);
  assert.match(panel, /initialDefinitions/);
});

test("all public infrastructure views read the same database directory", () => {
  const directory = read("../src/lib/infrastructure.ts");
  assert.match(directory, /from\("infrastructure_resources"\)/);
  assert.match(directory, /if \(!hasSupabaseEnv\(\)\)/);
  assert.match(directory, /if \(error\) throw/);
  for (const path of ["../src/app/(public)/community/page.tsx", "../src/app/(public)/mining/page.tsx", "../src/app/(public)/chain/page.tsx"]) {
    assert.match(read(path), /getInfrastructureDirectory\(\)/);
  }
  const nodes = read("../src/lib/chain/nodes.ts");
  assert.match(nodes, /const \{ rpcs: NODES \} = await getInfrastructureDirectory\(\)/);
  assert.match(nodes, /definitions: NODES/);
  assert.match(nodes, /redirect: "error"/);
});

test("admin edits require a verified admin and use the RLS-bound client", () => {
  const actions = read("../src/app/(admin)/admin/infrastructure/actions.ts");
  assert.match(actions, /await requireAdmin\(\)/);
  assert.match(actions, /getServerSupabase\(\)/);
  assert.match(actions, /if \(id === "canonical-rpc"\)/);
  assert.match(actions, /revalidatePath\(path\)/);
});

test("activity records actor identity and names the approved parent content", () => {
  assert.match(schema, /actor_id := auth\.uid\(\)/);
  assert.match(schema, /select email into actor_mail from auth\.users/);
  assert.match(audit, /select title into event_label from public\.news_articles/);
  assert.match(audit, /select name into event_label from public\.community_projects/);
  assert.match(audit, /alter column occurred_at set default clock_timestamp\(\)/);
});
