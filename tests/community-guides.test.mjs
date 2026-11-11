import { existsSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { test } from "node:test";
import assert from "node:assert/strict";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const exists = (path) => existsSync(new URL(path, import.meta.url));

test("the three community PDFs have public reading routes with download and accessible reading fallbacks", async () => {
  assert.ok(exists("../src/lib/content/community-guides.ts"), "community guide catalogue is missing");
  const { COMMUNITY_GUIDES } = await import("../src/lib/content/community-guides.ts");
  assert.deepEqual(COMMUNITY_GUIDES.map((guide) => guide.slug), ["staking-and-dao", "staking-v2", "dao-and-development"]);
  assert.deepEqual(COMMUNITY_GUIDES.map((guide) => guide.pages.length), [3, 1, 1]);
  for (const guide of COMMUNITY_GUIDES) {
    const pdf = readFileSync(new URL(`../public${guide.pdf}`, import.meta.url));
    assert.equal(pdf.subarray(0, 5).toString(), "%PDF-");
    assert.equal(createHash("sha256").update(pdf).digest("hex"), guide.sha256);
    assert.ok(guide.reading.length > 0);
    for (const page of guide.pages) {
      assert.ok(exists(`../public${page.src}`));
      assert.ok(page.alt.length > 20);
      assert.ok(page.width > 0 && page.height > 0);
    }
  }
  const route = read("../src/app/(public)/guides/[slug]/page.tsx");
  assert.match(route, /generateStaticParams/);
  assert.match(route, /export const dynamicParams = false/);
  assert.match(route, /generateMetadata/);
  assert.match(route, /notFound\(/);
  assert.match(route, /download/);
  assert.match(route, /target="_blank"/);
  assert.match(route, /guide\.pages\.map/);
  assert.match(route, /guide\.reading\.map/);
  assert.doesNotMatch(route, /<iframe|<object|dangerouslySetInnerHTML/);
  assert.match(read("../src/components/site/Footer.tsx"), /href: "\/guides"/);
  assert.match(read("../src/app/sitemap.ts"), /COMMUNITY_GUIDES/);
});
