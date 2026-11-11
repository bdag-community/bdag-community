import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";

const url = (rel) => new URL(rel, import.meta.url);
const exists = (rel) => existsSync(url(rel).pathname);
const read = (rel) => (exists(rel) ? readFileSync(url(rel), "utf8") : "");

const articleActionPath = "../src/app/(public)/articles/submit/actions.ts";
const articlePagePath = "../src/app/(public)/articles/submit/page.tsx";
const articleFormPath = "../src/components/news/CommunityArticleForm.tsx";
const suggestionActionPath = "../src/app/(public)/community/actions.ts";
const suggestionFormPath = "../src/components/community/SuggestionForm.tsx";
const suggestionEmailPath = "../src/lib/email/suggestions.ts";
const resendTransportPath = "../src/lib/email/resend-transport.ts";

test("the public article submission surface exists", () => {
  for (const rel of [articleActionPath, articlePagePath, articleFormPath]) {
    assert.ok(exists(rel), `${rel} must exist`);
  }

  const index = read("../src/app/(public)/articles/page.tsx");
  assert.match(index, /href=\{NEWS_PAGE\.submission\.cta\.href\}/);
});

test("public article submissions are forced to unpublished image-free drafts", () => {
  const action = read(articleActionPath);
  const assetMigration = read("../supabase/migrations/0006_article_assets.sql");
  const honeypotAt = action.indexOf('formData.get("website")');
  const validationAt = action.indexOf("schema.safeParse");
  const insertAt = action.indexOf('"create_community_article_draft"');

  assert.ok(honeypotAt >= 0, "the action must check the website honeypot");
  assert.ok(
    honeypotAt < validationAt && validationAt < insertAt,
    "honeypot and validation must run before the database write",
  );
  assert.match(assetMigration, /submitted_by_community[\s\S]*true/i);
  assert.match(assetMigration, /is_published[\s\S]*false/i);
  assert.match(assetMigration, /published_at[\s\S]*null/i);
  assert.match(assetMigration, /image_url[\s\S]*null/i);
  assert.match(action, /getAdminSupabase/);
  assert.doesNotMatch(action, /requireAdmin|\.update\(|\.delete\(/);
  assert.doesNotMatch(action, /\.from\("news_articles"\)/);
  assert.doesNotMatch(
    action,
    /formData\.get\(["'](?:slug|isPublished|publishedAt|imageUrl)["']\)/,
  );
});

test("the public article form cannot request publishing and exposes only one optional cover", () => {
  const form = read(articleFormPath);

  for (const name of ["authorName", "title", "subtitle", "description", "body"]) {
    assert.match(form, new RegExp(`name=["']${name}["']`));
  }
  assert.match(form, /name="website"/);
  assert.match(form, /tabIndex=\{-1\}/);
  assert.doesNotMatch(
    form,
    /name=["'](?:slug|isPublished|publishedAt|imageUrl)["']/,
  );
  assert.match(form, /type=["']file["']/);
  assert.doesNotMatch(form, /multiple/);
  assert.match(form, /NEWS_PAGE\.submission\./);
  assert.match(form, /role="alert"/);
  assert.match(form, /role="status"/);
  assert.match(form, /summaryRef\.current\?\.focus\(\)/);
  assert.match(form, /successRef\.current\?\.focus\(\)/);
  assert.match(form, /failureRef\.current\?\.focus\(\)/);
  assert.match(form, /<RichTextEditor/);
  assert.match(form, /copy\.conduct/);
});

test("author names flow from storage to admin editing and the public byline", () => {
  const migration = [
    read("../supabase/migrations/0002_news.sql"),
    read("../supabase/migrations/0007_article_moderation.sql"),
  ].join("\n");
  const news = read("../src/lib/news.ts");
  const adminDal = read("../src/lib/dal/admin.ts");
  const adminActions = read("../src/app/(admin)/admin/news/actions.ts");
  const adminForm = read("../src/components/admin/ArticleForm.tsx");
  const articlePage = read("../src/app/(public)/articles/[slug]/page.tsx");
  const site = read("../src/lib/content/site.ts");

  assert.match(migration, /author_name\s+text/i);
  assert.match(migration, /submitted_by_community\s+boolean/i);
  assert.match(news, /authorName:\s*string \| null/);
  assert.match(news, /author_name/);
  assert.match(news, /authorName:\s*row\.author_name/);
  assert.match(adminDal, /author_name:\s*string \| null/);
  assert.match(adminDal, /submitted_by_community:\s*boolean/);
  assert.match(adminActions, /authorName:\s*string/);
  assert.match(adminActions, /p_author_name:\s*input\.authorName \|\| null/);
  assert.match(adminForm, /authorName/);
  // The byline became provenance-first on 2026-08-13: the moderation
  // column picks the label ("community member" vs admin), and the author
  // name renders inside whichever branch applies. "Written by" is retired.
  assert.match(articlePage, /article\.submittedByCommunity \?/);
  assert.match(articlePage, /article\.authorName \?/);
  assert.match(site, /publishedByCommunity:\s*"Published by community member"/);
  assert.match(site, /publishedByAdmin:\s*"Published by admin"/);
  assert.doesNotMatch(site, /writtenBy:/);
});

test("only admin-gated actions can update, publish, or delete articles", () => {
  const migration = read("../supabase/migrations/0007_article_moderation.sql");
  const adminActions = read("../src/app/(admin)/admin/news/actions.ts");

  assert.match(
    migration,
    /revoke insert, update, delete on table public\.news_articles from authenticated/i,
  );

  for (const marker of [
    '"admin_create_news_article"',
    '"admin_save_news_article"',
    '"admin_publish_news_article"',
    '"admin_delete_news_article"',
  ]) {
    const writeAt = adminActions.indexOf(marker);
    const actionStart = adminActions.lastIndexOf("export async function", writeAt);
    const gateAt = adminActions.indexOf("await requireAdmin()", actionStart);
    assert.ok(
      actionStart >= 0 && gateAt > actionStart && gateAt < writeAt,
      `${marker} must remain behind requireAdmin()`,
    );
  }
});

test("admin publication requires a description and meaningful article body", () => {
  const adminActions = read("../src/app/(admin)/admin/news/actions.ts");
  const site = read("../src/lib/content/site.ts");
  const validationAt = adminActions.indexOf("function validateArticleForSave");
  const publishAt = adminActions.indexOf("export async function publishArticleAction");

  assert.ok(validationAt >= 0, "admin writes need one shared publication guard");
  assert.match(
    adminActions,
    /if \(!article\?\.description\)/,
  );
  assert.match(
    adminActions,
    /if \(!article\.body\?\.trim\(\)\)/,
  );
  assert.match(adminActions, /ADMIN_NEWS_COPY\.descriptionRequired/);
  assert.match(adminActions, /ADMIN_NEWS_COPY\.bodyRequired/);
  assert.ok(
    validationAt >= 0 && publishAt > validationAt,
    "save validation must exist before the separate publication action",
  );
  assert.match(site, /descriptionRequired:\s*"A description is required before publishing\."/);
  assert.match(site, /bodyRequired:\s*"An article body is required before publishing\."/);
});

test("the Community page owns an accessible Suggestion Box", () => {
  for (const rel of [
    suggestionActionPath,
    suggestionFormPath,
    suggestionEmailPath,
    resendTransportPath,
  ]) {
    assert.ok(exists(rel), `${rel} must exist`);
  }

  const page = read("../src/app/(public)/community/page.tsx");
  assert.match(page, /id="suggestions"/);
  assert.match(page, /aria-labelledby="suggestions-heading"/);
  // The page renders the disclosure, which mounts the form on click
  // (2026-08-13): the form must not render eagerly for every reader, and
  // Turnstile must not load until someone asks for the form.
  assert.match(page, /<SuggestionDisclosure/);
  assert.doesNotMatch(page, /<SuggestionForm/);
  const disclosure = read(
    "../src/components/community/SuggestionDisclosure.tsx",
  );
  assert.match(disclosure, /<SuggestionForm/);
  assert.match(disclosure, /useState\(false\)/, "collapsed by default");
  assert.match(page, /COMMUNITY_PAGE\.suggestionBox/);
});

test("suggestions validate and reject bots before server-only email delivery", () => {
  const action = read(suggestionActionPath);
  const honeypotAt = action.indexOf('formData.get("website")');
  const validationAt = action.indexOf("schema.safeParse");
  const sendAt = action.indexOf("await sendSuggestionEmail(parsed.data)");

  assert.ok(honeypotAt >= 0);
  assert.ok(
    honeypotAt < validationAt && validationAt < sendAt,
    "honeypot and validation must run before email delivery",
  );
  assert.match(action, /z\.object/);
  assert.match(action, /authorName/);
  assert.match(action, /replyEmail/);
  assert.match(action, /suggestion/);
});

test("suggestion email delivery fails closed and keeps provider data server-side", () => {
  const adapter = read(suggestionEmailPath);
  const transport = read(resendTransportPath);
  const form = read(suggestionFormPath);

  assert.match(adapter, /import "server-only"/);
  assert.match(adapter, /process\.env\.RESEND_API_KEY/);
  assert.match(adapter, /process\.env\.SUGGESTION_NOTIFY_EMAIL/);
  assert.match(adapter, /process\.env\.SUGGESTION_FROM_EMAIL/);
  assert.match(adapter, /sendResendPlainTextEmail/);
  assert.match(transport, /AbortSignal\.timeout/);
  assert.match(transport, /response\.ok/);
  assert.match(transport, /\btext(?:,|:)/);
  assert.doesNotMatch(transport, /html:/);

  assert.doesNotMatch(
    form,
    /RESEND_API_KEY|SUGGESTION_NOTIFY_EMAIL|SUGGESTION_FROM_EMAIL|mailto:/,
  );
  assert.match(form, /name="website"/);
  assert.match(form, /tabIndex=\{-1\}/);
  assert.match(form, /const copy = COMMUNITY_PAGE\.suggestionBox/);
  assert.match(form, /role="alert"/);
  assert.match(form, /role="status"/);
  assert.match(form, /summaryRef\.current\?\.focus\(\)/);
  assert.match(form, /successRef\.current\?\.focus\(\)/);
  assert.match(form, /failureRef\.current\?\.focus\(\)/);
});

test("new public contribution copy contains no em dash", () => {
  const site = read("../src/lib/content/site.ts");
  const newsStart = site.indexOf("submission:", site.indexOf("export const NEWS_PAGE"));
  const newsEnd = site.indexOf("} as const;", newsStart);
  const suggestionStart = site.indexOf("suggestionBox:");
  const suggestionEnd = site.indexOf("waysTitle:", suggestionStart);

  assert.ok(newsStart >= 0 && suggestionStart >= 0);
  assert.doesNotMatch(site.slice(newsStart, newsEnd), /—/);
  assert.doesNotMatch(site.slice(suggestionStart, suggestionEnd), /—/);
});
