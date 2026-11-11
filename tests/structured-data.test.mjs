import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";

// Structured-data guard. The SEO route surfaces already have a test in
// routes.test.mjs; this covers the layer added on top of them — the JSON-LD
// that states, as data, the two things this site spends its whole prose
// budget arguing: which chain is canonical, and that this is not the official
// project site. None of it is visible, so nothing else notices it going away.

const read = (rel) => readFileSync(new URL(rel, import.meta.url), "utf8");
const exists = (rel) => existsSync(new URL(rel, import.meta.url).pathname);

test("the structured-data surfaces exist", () => {
  const surfaces = [
    "../src/lib/seo/structured-data.ts",
    "../src/components/seo/JsonLd.tsx",
    "../src/app/llms.txt/route.ts",
  ];
  const missing = surfaces.filter((r) => !exists(r));
  assert.deepEqual(missing, [], `missing: ${missing.join(", ")}`);
});

test("JsonLd cannot be closed by its own payload", () => {
  // The one injection surface of a ld+json block is a literal </script> in the
  // serialised data. Escaping every "<" closes it whatever the payload holds.
  const component = read("../src/components/seo/JsonLd.tsx");
  assert.match(component, /replace\(\/<\/g, "\\\\u003c"\)/);
});

test("the organisation states its non-affiliation as data", () => {
  // "Is this the official BlockDAG site?" is the first question every reader
  // and every answer engine asks. The answer is already written; this makes it
  // machine-readable instead of leaving it to be inferred from prose.
  const schema = read("../src/lib/seo/structured-data.ts");
  assert.match(schema, /disambiguatingDescription: NON_AFFILIATION/);
  // One organisation, two domains, stated rather than guessed.
  assert.match(schema, /sameAs: \[FAMILY_SITES\.miners\.url\]/);
});

test("the chain schema publishes the canonical identifiers", () => {
  const schema = read("../src/lib/seo/structured-data.ts");
  for (const field of ["chainId", "currency.symbol", "rpcUrl", "explorerUrl"]) {
    assert.match(
      schema,
      new RegExp(`CHAIN\\.${field.replace(".", "\\.")}`),
      `the chain schema must carry CHAIN.${field}`,
    );
  }
});

test("an article never claims a modification date it does not have", () => {
  // The articles carry one published timestamp and no edit history. A
  // dateModified of "now" would be a freshness claim the site cannot support.
  const schema = read("../src/lib/seo/structured-data.ts");
  assert.match(schema, /dateModified: article\.publishedAt/);
  assert.doesNotMatch(schema, /dateModified: new Date\(\)/);
});

test("the article byline in schema follows the page's provenance rule", () => {
  // The moderation column decides the label, never the presence of a name —
  // the same rule the rendered byline follows.
  const schema = read("../src/lib/seo/structured-data.ts");
  assert.match(
    schema,
    /article\.submittedByCommunity && article\.authorName/,
    "author must be a Person only for a named community submission",
  );
});

test("article body HTML never reaches the schema", () => {
  // bodyHtml is sanitized for rendering, but a JSON-LD payload is a different
  // context with different escaping. It has no business being in there.
  const schema = read("../src/lib/seo/structured-data.ts");
  assert.doesNotMatch(schema, /article\.bodyHtml|article\.body\b/);
});

test("the sitemap submits published articles with their own dates", () => {
  const sitemap = read("../src/app/sitemap.ts");
  assert.match(sitemap, /getPublishedArticles\(\)/);
  assert.match(sitemap, /\/articles\/\$\{article\.slug\}/);
  // A real publication date, not the build time the nav pages get.
  assert.match(sitemap, /new Date\(article\.publishedAt\)/);
});

// Pull the two agent lists out of the module as sets, so the assertions below
// test GROUP MEMBERSHIP rather than mere presence. The previous version only
// checked each name appeared somewhere in robots.ts, which passed while GPTBot
// and ClaudeBot were in neither group and inherited the blanket "*" allow.
const crawlers = read("../src/lib/seo/ai-crawlers.ts");
const agentList = (name) => {
  const start = crawlers.indexOf(`export const ${name} = [`);
  assert.notEqual(start, -1, `${name} must be exported from ai-crawlers.ts`);
  const body = crawlers.slice(start, crawlers.indexOf("]", start));
  return new Set([...body.matchAll(/"([A-Za-z0-9-]+)"/g)].map((m) => m[1]));
};
const SEARCH = agentList("AI_SEARCH_AGENTS");
const TRAINING = agentList("AI_TRAINING_AGENTS");

test("retrieval agents are in the search group, not the training group", () => {
  for (const agent of [
    "OAI-SearchBot",
    "ChatGPT-User",
    "Claude-SearchBot",
    "Claude-User",
    "PerplexityBot",
    "Perplexity-User",
  ]) {
    assert.ok(SEARCH.has(agent), `${agent} must be in AI_SEARCH_AGENTS`);
    assert.ok(!TRAINING.has(agent), `${agent} must NOT be refused`);
  }
});

test("training crawlers are refused, including the vendor general crawlers", () => {
  // GPTBot and ClaudeBot are the ones that get missed: they are distinct from
  // OAI-SearchBot / Claude-SearchBot, and being cited by either assistant does
  // not require them. Google-Extended is one token covering Gemini training
  // AND grounding, so a "training refused" policy cannot allow it.
  for (const agent of [
    "GPTBot",
    "ClaudeBot",
    "Google-Extended",
    "CCBot",
    "Bytespider",
    "Amazonbot",
    "meta-externalagent",
    "Applebot-Extended",
  ]) {
    assert.ok(TRAINING.has(agent), `${agent} must be in AI_TRAINING_AGENTS`);
    assert.ok(!SEARCH.has(agent), `${agent} must NOT be allowed`);
  }
});

test("no agent is in both groups", () => {
  const both = [...SEARCH].filter((a) => TRAINING.has(a));
  assert.deepEqual(both, [], `agents in both groups: ${both.join(", ")}`);
});

test("robots.ts wires both groups into rules that keep /admin closed", () => {
  const robots = read("../src/app/robots.ts");
  // lastIndexOf, not indexOf — the first occurrence is the import line.
  const trainingRule = robots.slice(robots.lastIndexOf("AI_TRAINING_AGENTS"));
  assert.match(trainingRule.slice(0, 120), /disallow: "\/"/);
  const searchRule = robots.slice(robots.lastIndexOf("AI_SEARCH_AGENTS"));
  assert.match(searchRule.slice(0, 120), /allow: "\/"/);
  // A narrower user-agent group REPLACES the "*" group for the agents it
  // names rather than stacking on it, so the AI group must repeat the private
  // paths or it re-opens /admin to exactly the agents it welcomes.
  assert.match(searchRule.slice(0, 160), /PRIVATE_PATHS/);
  assert.match(robots, /const PRIVATE_PATHS = \["\/admin", "\/api\/"\]/);
});

test("every public page that can carry structured data does", () => {
  const wired = [
    ["../src/app/layout.tsx", /organizationSchema\(\)/],
    ["../src/app/(public)/chain/page.tsx", /chainSchema\(\)/],
    ["../src/app/(public)/faq/page.tsx", /faqPageSchema\(\)/],
    ["../src/app/(public)/articles/[slug]/page.tsx", /newsArticleSchema\(article\)/],
  ];
  for (const [file, pattern] of wired) {
    assert.match(read(file), pattern, `${file} lost its JSON-LD`);
  }
});

test("an article share card is typed as an article", () => {
  // og:type website on an article drops the publication date from every
  // share surface that reads it.
  const page = read("../src/app/(public)/articles/[slug]/page.tsx");
  assert.match(page, /type: "article"/);
  assert.match(page, /publishedTime: article\.publishedAt/);
});

test("an article's openGraph restates every shared field", () => {
  // Nested metadata merges SHALLOWLY: a nested openGraph REPLACES the root
  // layout's object rather than merging into it. Declaring only type and
  // publishedTime silently dropped siteName, locale and url from every
  // article card — a regression with no visible symptom. Anything added to
  // the root layout's openGraph must be added here too.
  const page = read("../src/app/(public)/articles/[slug]/page.tsx");
  const og = page.slice(page.indexOf("openGraph: {"));
  const block = og.slice(0, og.indexOf("};"));
  for (const field of [
    /siteName: SITE\.name/,
    /locale: "en_GB"/,
    /url: "\.\/"/,
    /title: article\.title/,
    /description: article\.description/,
  ]) {
    assert.match(block, field, `article openGraph must restate ${field}`);
  }
  // The root layout is the source of the list above; if it grows a field that
  // is not restated here, this is the test that should have caught it.
  const rootOg = read("../src/app/layout.tsx");
  const rootBlock = rootOg.slice(rootOg.indexOf("openGraph: {"));
  const rootFields = [
    ...rootBlock.slice(0, rootBlock.indexOf("},")).matchAll(/^\s{4}(\w+):/gm),
  ].map((m) => m[1]);
  for (const field of rootFields) {
    if (field === "type") continue; // deliberately differs: website vs article
    assert.match(
      block,
      new RegExp(`${field}:`),
      `root openGraph has "${field}" — the article must restate it`,
    );
  }
});

test("only articles claim a modification date", () => {
  // A nav page has no edit date, and build time is not a substitute: it
  // restamps the whole site on every unrelated deploy.
  const sitemap = read("../src/app/sitemap.ts");
  assert.doesNotMatch(sitemap, /new Date\(\)/, "build time is not an edit date");
  // The one real date on the site survives.
  assert.match(sitemap, /lastModified: new Date\(article\.publishedAt\)/);
  const navBlock = sitemap.slice(
    sitemap.indexOf("NAV_LINKS.map"),
    sitemap.indexOf("const articles"),
  );
  assert.doesNotMatch(navBlock, /lastModified/);
});
