import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";

const read = (relative) => {
  const url = new URL(relative, import.meta.url);
  return existsSync(url) ? readFileSync(url, "utf8") : "";
};

const migration = read("../supabase/migrations/0008_suggestion_inbox.sql");
const publicAction = read("../src/app/(public)/community/actions.ts");
const adminPage = read("../src/app/(admin)/admin/suggestions/page.tsx");
const adminActions = read("../src/app/(admin)/admin/actions.ts");
const adminDal = read("../src/lib/dal/admin.ts");
const site = read("../src/lib/content/site.ts");

test("suggestions have a private service-write and admin-read database boundary", () => {
  assert.notEqual(migration, "", "forward migration 0008 must exist");
  assert.match(migration, /create table if not exists public\.suggestion_messages/);
  assert.match(migration, /alter table public\.suggestion_messages enable row level security/);
  assert.match(
    migration,
    /revoke all on table public\.suggestion_messages\s+from anon, authenticated, service_role, public/,
  );
  assert.match(migration, /grant insert on table public\.suggestion_messages to service_role/);
  assert.match(migration, /grant select, delete on table public\.suggestion_messages to authenticated/);
  assert.match(migration, /for select to authenticated[\s\S]*public\.is_admin\(\)/i);
  assert.match(migration, /for delete to authenticated[\s\S]*public\.is_admin\(\)/i);
  assert.doesNotMatch(migration, /grant [^;]*\b(?:select|delete)\b[^;]* to anon/i);
});

test("the protected suggestion action stores first and treats email as notification", () => {
  const protectionAt = publicAction.indexOf(
    'protectPublicSubmission("suggestion", token)',
  );
  const insertAt = publicAction.indexOf('.from("suggestion_messages")');
  const emailAt = publicAction.indexOf("sendSuggestionEmail(parsed.data)");

  assert.ok(
    protectionAt >= 0 && insertAt > protectionAt && emailAt > insertAt,
    "validation and abuse protection must precede storage, then email notification",
  );
  assert.match(publicAction, /getAdminSupabase/);
  assert.match(publicAction, /author_name:\s*parsed\.data\.authorName \|\| null/);
  assert.match(publicAction, /reply_email:\s*parsed\.data\.replyEmail \|\| null/);
  assert.match(publicAction, /suggestion:\s*parsed\.data\.suggestion/);
  assert.match(site, /success:[\s\S]*saved/i);
  assert.doesNotMatch(site, /email provider accepted your suggestion/i);
});

test("the admin dashboard lists and deletes suggestions as plain text", () => {
  assert.match(adminDal, /export type SuggestionMessageRow/);
  assert.match(adminDal, /export async function listSuggestionMessages/);
  const gateAt = adminDal.indexOf("await requireAdmin()", adminDal.indexOf("listSuggestionMessages"));
  const queryAt = adminDal.indexOf('.from("suggestion_messages")', gateAt);
  assert.ok(gateAt >= 0 && queryAt > gateAt);

  assert.match(adminPage, /listSuggestionMessages\(INBOX_LIMIT \+ 1\)/);
  assert.match(adminPage, /Suggestion Box inbox/);
  assert.match(adminPage, /deleteSuggestionMessageAction/);
  assert.match(adminPage, /whitespace-pre-line break-words/);
  assert.doesNotMatch(adminPage, /dangerouslySetInnerHTML/);

  const actionAt = adminActions.indexOf(
    "export async function deleteSuggestionMessageAction",
  );
  const requireAt = adminActions.indexOf("await requireAdmin()", actionAt);
  const deleteAt = adminActions.indexOf('.from("suggestion_messages")', actionAt);
  assert.ok(actionAt >= 0 && requireAt > actionAt && deleteAt > requireAt);
});
