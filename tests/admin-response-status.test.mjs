import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { test } from "node:test";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const migrationName = readdirSync(new URL("../supabase/migrations/", import.meta.url))
  .find((name) => name.endsWith("_inbox_response_status.sql"));
const migration = migrationName
  ? read(`../supabase/migrations/${migrationName}`)
  : "";
const actions = read("../src/app/(admin)/admin/actions.ts");
const dal = read("../src/lib/dal/admin.ts");
const inbox = read("../src/app/(admin)/admin/inbox/page.tsx");
const suggestions = read("../src/app/(admin)/admin/suggestions/page.tsx");

test("both private inbox tables store an admin-only response state and actor", () => {
  assert.notEqual(migration, "", "response-status migration must exist");
  for (const table of ["contact_messages", "suggestion_messages"]) {
    assert.match(migration, new RegExp(`alter table public\\.${table}[\\s\\S]*responded_at`, "i"));
    assert.match(migration, new RegExp(`alter table public\\.${table}[\\s\\S]*responded_by`, "i"));
    assert.match(migration, new RegExp(`grant update\\s*\\(responded_at\\)[\\s\\S]*public\\.${table}`, "i"));
    assert.match(migration, new RegExp(`on public\\.${table} for update to authenticated[\\s\\S]*public\\.is_admin\\(\\)`, "i"));
  }
  assert.match(migration, /auth\.uid\(\)/);
  assert.match(migration, /responded_at[\s\S]*clock_timestamp\(\)/);
  assert.match(migration, /then 'unrespond' else 'respond'/);
});

test("both inboxes show state and allow admins to mark or unmark it", () => {
  assert.match(dal, /export type ContactMessageRow[\s\S]*responded_at: string \| null/);
  assert.match(dal, /export type SuggestionMessageRow[\s\S]*responded_at: string \| null/);
  assert.match(dal, /\.select\("id,name,email,topic,message,created_at,responded_at"\)/);
  assert.match(dal, /\.select\("id,author_name,reply_email,suggestion,created_at,responded_at"\)/);
  assert.match(actions, /export async function setContactMessageRespondedAction/);
  assert.match(actions, /export async function setSuggestionMessageRespondedAction/);
  for (const page of [inbox, suggestions]) {
    assert.match(page, /RespondedToggle/);
    assert.match(page, /respondedAt=/);
  }
});
