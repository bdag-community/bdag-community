import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";

const page = readFileSync(
  new URL("../src/app/(admin)/admin/inbox/page.tsx", import.meta.url),
  "utf8",
);

test("the admin inbox discloses when older messages are not shown", () => {
  assert.match(page, /const INBOX_LIMIT = 50/);
  assert.match(page, /listContactMessages\(INBOX_LIMIT \+ 1, topic\)/);
  assert.match(page, /messages\.slice\(0, INBOX_LIMIT\)/);
  assert.match(page, /messages\.length > INBOX_LIMIT/);
  assert.match(page, /Showing the 50 newest messages/);
});
