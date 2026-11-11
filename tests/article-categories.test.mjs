import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (relative) =>
  readFileSync(new URL(relative, import.meta.url), "utf8");

/**
 * Article categories — one closed set, agreed on by three authorities that
 * cannot import each other: the ARTICLE_CATEGORIES map in site.ts, the DB
 * check constraint in 0010_article_categories.sql, and the admin action's
 * zod enum (which reads the map, so it is pinned through the map). A category
 * is a label the reader sees on every card and article header, so the render
 * wiring is pinned too.
 */

const site = read("../src/lib/content/site.ts");
const migration = read(
  "../supabase/migrations/0010_article_categories.sql",
);
const CATEGORIES = ["news", "update", "community", "info", "projects"];

test("the category set agrees between site.ts and the DB constraint", () => {
  const mapAt = site.indexOf("export const ARTICLE_CATEGORIES = {");
  assert.ok(mapAt >= 0, "site.ts must export ARTICLE_CATEGORIES");
  const map = site.slice(mapAt, site.indexOf("} as const;", mapAt));
  for (const key of CATEGORIES) {
    assert.ok(map.includes(`${key}: "`), `ARTICLE_CATEGORIES needs ${key}`);
  }
  // The DB names the same five values, in the constraint and both RPC guards.
  const constraint = `check (category in ('${CATEGORIES.join("', '")}'))`;
  assert.ok(
    migration.includes(constraint),
    "the check constraint must list exactly the site.ts categories",
  );
  assert.match(migration, /add column if not exists category text not null default 'news'/);
});

test("both admin RPC replacements default the category so the deployed app keeps working", () => {
  // Adding a parameter changes the signature; without the drop the old
  // overload lingers and PostgREST named-argument calls turn ambiguous.
  assert.match(
    migration,
    /drop function if exists public\.admin_create_news_article\(\s*text, text, text, text, text, text, text\s*\)/,
  );
  assert.match(
    migration,
    /drop function if exists public\.admin_save_news_article\(\s*uuid, text, text, text, text, text, text, text\s*\)/,
  );
  const defaults = migration.match(/p_category text default 'news'/g) ?? [];
  assert.equal(defaults.length, 2, "create and save must default p_category");
  // Community drafts carry their provenance as a category from creation.
  assert.match(migration, /'community'\n\s*\);/);
});

test("the admin form and action carry the category into the RPCs", () => {
  const actions = read("../src/app/(admin)/admin/news/actions.ts");
  assert.match(actions, /category: z\.enum\(/);
  assert.match(actions, /Object\.keys\(ARTICLE_CATEGORIES\)/);
  assert.match(actions, /p_category: input\.category/);
  const form = read("../src/components/admin/ArticleForm.tsx");
  assert.match(form, /Object\.entries\(ARTICLE_CATEGORIES\)\.map/);
  assert.match(form, /id="article-category"/);
  assert.match(form, /category,\n\s*\};/);
});

test("the public data path selects, types, and guards the category", () => {
  const news = read("../src/lib/news.ts");
  assert.match(news, /category: ArticleCategory;/);
  // Both PostgREST field lists carry it.
  const fieldLists = news.match(/"id,slug,title,subtitle,description,category,/g) ?? [];
  assert.equal(fieldLists.length, 2, "summary and detail selects need category");
  // An unknown value from a newer schema must fall back, not crash the page.
  assert.match(news, /row\.category in ARTICLE_CATEGORIES/);
});

test("cards, the article header, and the seeds all wear the label", () => {
  for (const file of [
    "../src/components/news/ArticleCard.tsx",
    "../src/components/news/FeaturedArticle.tsx",
    "../src/app/(public)/articles/[slug]/page.tsx",
  ]) {
    assert.match(
      read(file),
      /ARTICLE_CATEGORIES\[article\.category\]/,
      `${file} must render the category label`,
    );
  }
  const seed = read("../src/lib/content/news-seed.ts");
  const seededCategories = seed.match(/category: "/g) ?? [];
  const slugs = seed.match(/slug: "/g) ?? [];
  assert.equal(
    seededCategories.length,
    slugs.length,
    "every seed article must declare a category",
  );
});

test("the old /news URLs redirect permanently to /articles", () => {
  const config = read("../next.config.ts");
  assert.match(config, /source: "\/news", destination: "\/articles", permanent: true/);
  assert.match(config, /source: "\/news\/:path\*"/);
  assert.match(config, /destination: "\/articles\/:path\*"/);
});
