import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";

const read = (relative) =>
  readFileSync(new URL(relative, import.meta.url), "utf8");

const page = read("../src/app/(admin)/admin/inbox/page.tsx");
const dal = read("../src/lib/dal/admin.ts");
const site = read("../src/lib/content/site.ts");
const contactAction = read("../src/app/(public)/contact/actions.ts");
const topicResolver = new URL("../src/lib/contact/resolve-topic.ts", import.meta.url);

test("AMA is a contact topic accepted by the shared server validation", () => {
  const contactCopy = site.slice(
    site.indexOf("export const CONTACT_PAGE"),
    site.indexOf("} as const;", site.indexOf("export const CONTACT_PAGE")),
  );
  assert.match(contactCopy, /topics:\s*\[[\s\S]*?"AMA"/);
  assert.match(contactAction, /z\.enum\(CONTACT_PAGE\.form\.topics/);
});

test("the inbox only accepts one known topic from the URL", async () => {
  assert.ok(existsSync(topicResolver), "the topic resolver must exist");
  const { resolveContactTopic } = await import(topicResolver);
  assert.equal(resolveContactTopic("AMA"), "AMA");
  assert.equal(resolveContactTopic("Exchanges and integrators"), "Exchanges and integrators");
  assert.equal(resolveContactTopic(undefined), undefined);
  assert.equal(resolveContactTopic(""), undefined);
  assert.equal(resolveContactTopic("other"), undefined);
  assert.equal(resolveContactTopic(["AMA", "Press"]), undefined);
});

test("the inbox offers a labelled GET topic filter and filters before limiting", () => {
  assert.match(page, /searchParams:\s*Promise<\{ topic\?: string \| string\[\] \}>/);
  assert.match(page, /<form[^>]*action="\/admin\/inbox"[^>]*method="get"/);
  assert.match(page, /<label[^>]*htmlFor="inbox-topic"/);
  assert.match(page, /<select[^>]*id="inbox-topic"[^>]*name="topic"/);
  assert.match(page, /CONTACT_PAGE\.form\.topics\.map/);
  assert.match(page, /listContactMessages\(INBOX_LIMIT \+ 1, topic\)/);
  assert.match(dal, /if \(topic\) query = query\.eq\("topic", topic\)/);
  assert.ok(
    dal.indexOf('query.eq("topic", topic)') < dal.indexOf("query.limit(limit)"),
    "topic filtering must precede the 50-message limit",
  );
});
