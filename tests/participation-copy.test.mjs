import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";

const read = (rel) => readFileSync(new URL(rel, import.meta.url), "utf8");

const site = read("../src/lib/content/site.ts");
const header = read("../src/components/site/Header.tsx");
const mobileMenu = read("../src/components/site/MobileMenu.tsx");
const communityPage = read("../src/app/(public)/community/page.tsx");

function contentBlock(exportName) {
  const start = site.indexOf(`export const ${exportName}`);
  assert.notEqual(start, -1, `${exportName} must exist in site.ts`);
  return site.slice(start, site.indexOf("} as const;", start));
}

test("the persistent participation CTA is distinct from hero navigation", () => {
  assert.match(
    site,
    /export const HEADER_CTA = \{\s*label: "Take part",\s*href: "\/community#participate",?\s*\}/,
  );

  for (const [name, source] of [
    ["Header", header],
    ["MobileMenu", mobileMenu],
  ]) {
    assert.match(source, /HEADER_CTA/,
      `${name} must render the dedicated participation CTA.`);
    assert.doesNotMatch(
      source,
      /HERO\.ctaPrimary/,
      `${name} must not reuse the hero's page-navigation label as its CTA.`,
    );
  }
});

test("the community participation CTA has a stable anchor", () => {
  const waysSection = communityPage.slice(
    communityPage.indexOf("Ways to take part"),
    communityPage.indexOf("Build (development story)"),
  );
  assert.match(waysSection, /id="participate"/);
  assert.match(waysSection, /scroll-mt-24/);
});

test("public mining copy avoids unsupported specifications and promotional claims", () => {
  const mining = `${contentBlock("MINING_SECTION")}\n${contentBlock("MINING_PAGE")}`;
  for (const claim of [
    /serious hashrate/i,
    /quiet enough/i,
    /ultimate mining machine/i,
    /relentless/i,
    /accessible (?:entry|way in)/i,
    /get paid in BDAG/i,
  ]) {
    assert.doesNotMatch(
      mining,
      claim,
      `mining copy must not publish unverified or promotional claim ${claim}.`,
    );
  }
  assert.match(mining, /current .*specifications.*bdag\.co/i);
});

test("community mining and staking links describe informational destinations", () => {
  const community = contentBlock("COMMUNITY_PAGE");
  assert.doesNotMatch(community, /cta: "Start (?:mining|staking)"/i);
  assert.match(community, /cta: "Explore mining"/);
  assert.match(community, /cta: "Read about staking"/);
});

test("verified mining configuration and availability caveats stay intact", () => {
  const mining = `${contentBlock("MINING_SECTION")}\n${contentBlock("MINING_PAGE")}`;
  assert.match(mining, /Stratum endpoint/);
  assert.match(mining, /0x reward address/);
  assert.match(mining, /not the public JSON-RPC/);
  assert.match(mining, /while stock lasts/);
  assert.match(mining, /next manufacturing round/);
  assert.match(mining, /shipping is included/i);
  assert.match(mining, /import tax and fees are paid by the buyer/i);
});
