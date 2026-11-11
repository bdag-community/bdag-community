import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";

const read = (rel) => readFileSync(new URL(rel, import.meta.url), "utf8");

const site = read("../src/lib/content/site.ts");
const homeMine = read("../src/components/home/Participate.tsx");
const miningPage = read("../src/app/(public)/mining/page.tsx");
const communityPage = read("../src/app/(public)/community/page.tsx");

test("the community X30 seller is described independently of bdag.co", () => {
  assert.match(site, /export const COMMUNITY_MINER_SELLER = \{/);
  assert.match(site, /url: "https:\/\/bdag-us\.org\/buy-x30\/"/);
  assert.match(site, /Independent community seller/);
  assert.match(site, /Check (?:the seller's |current )?(?:price|stock|ordering terms)/i);
  assert.match(site, /Check availability at bdag\.co/);
});

test("the seller link appears on Mining and only the Mine section of Home", () => {
  assert.match(miningPage, /id="community-seller"/);
  assert.match(miningPage, /href=\{COMMUNITY_MINER_SELLER\.url\}/);
  assert.match(homeMine, /href=\{COMMUNITY_MINER_SELLER\.url\}/);
  assert.match(homeMine, /target="_blank"/);
  assert.match(miningPage, /target="_blank"/);
  assert.doesNotMatch(communityPage, /COMMUNITY_MINER_SELLER|bdag-us\.org\/buy-x30/);
});
