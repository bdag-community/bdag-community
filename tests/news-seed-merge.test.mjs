import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";

const mergePath = new URL("../src/lib/news/merge-published.ts", import.meta.url);
const news = readFileSync(new URL("../src/lib/news.ts", import.meta.url), "utf8");
const adminArticles = readFileSync(
  new URL("../src/app/(admin)/admin/articles/page.tsx", import.meta.url),
  "utf8",
);

test("published database articles and seed articles share one newest-first list", async () => {
  assert.ok(existsSync(mergePath), "the published article merger must exist");
  const { mergePublishedArticles } = await import(mergePath);
  const seed = [
    { slug: "seed-a", publishedAt: "2026-08-05T09:00:00Z", source: "seed" },
    { slug: "seed-b", publishedAt: "2026-07-28T09:00:00Z", source: "seed" },
  ];
  const live = [
    { slug: "new", publishedAt: "2026-09-29T09:00:00Z", source: "database" },
  ];

  assert.deepEqual(
    mergePublishedArticles(live, seed).map((article) => article.slug),
    ["new", "seed-a", "seed-b"],
  );
  assert.deepEqual(
    mergePublishedArticles(live, seed, 2).map((article) => article.slug),
    ["new", "seed-a"],
  );
  assert.deepEqual(mergePublishedArticles(null, seed), seed);
});

test("a published database article replaces a seed with the same slug", async () => {
  assert.ok(existsSync(mergePath), "the published article merger must exist");
  const { mergePublishedArticles } = await import(mergePath);
  const seed = [
    { slug: "shared", publishedAt: "2026-07-01T09:00:00Z", source: "seed" },
  ];
  const live = [
    { slug: "shared", publishedAt: "2026-09-01T09:00:00Z", source: "database" },
  ];

  assert.deepEqual(mergePublishedArticles(live, seed), live);
  assert.match(news, /mergePublishedArticles\(live, seed\.map\(articleToSummary\), limit\)/);
});

test("admin clarifies that code-managed articles remain public but are not editable there", () => {
  assert.match(adminArticles, /code-managed/);
  assert.doesNotMatch(adminArticles, /until the first one is published here/);
});
