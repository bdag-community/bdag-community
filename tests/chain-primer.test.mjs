import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";

const read = (rel) => readFileSync(new URL(rel, import.meta.url), "utf8");
const primerUrl = new URL(
  "../src/components/chain/ChainPrimer.tsx",
  import.meta.url,
);
const primer = existsSync(primerUrl) ? readFileSync(primerUrl, "utf8") : "";
const page = read("../src/app/(public)/chain/page.tsx");
const site = read("../src/lib/content/site.ts");
const globals = read("../src/app/globals.css");
const chainCopy = site.slice(
  site.indexOf("export const CHAIN_PAGE"),
  site.indexOf("} as const;", site.indexOf("export const CHAIN_PAGE")),
);

test("the Chain opening is the three-state primer, not the retired sentence", () => {
  assert.match(page, /import \{ ChainPrimer \} from "@\/components\/chain\/ChainPrimer"/);
  assert.match(page, /<ChainPrimer\s*\/>/);
  assert.doesNotMatch(page, /\{CHAIN_PAGE\.title\}/);
  assert.doesNotMatch(page, /\{CHAIN_PAGE\.intro\}/);
});

test("DAG, EVM and POW each have a full subtitle and plain-language explanation", () => {
  for (const [key, short, subtitle] of [
    ["dag", "DAG", "Directed Acyclic Graph"],
    ["evm", "EVM", "Ethereum Virtual Machine"],
    ["pow", "POW", "Proof of Work"],
  ]) {
    assert.match(chainCopy, new RegExp(`key: "${key}"`));
    assert.match(chainCopy, new RegExp(`short: "${short}"`));
    assert.match(chainCopy, new RegExp(`subtitle: "${subtitle}"`));
  }
  assert.match(chainCopy, /shared map of blocks/);
  assert.match(chainCopy, /engine that runs apps and transactions/);
  assert.match(chainCopy, /real computing work/);
});

test("the primer loops automatically until a reader explicitly selects a layer", () => {
  assert.ok(existsSync(primerUrl), "ChainPrimer.tsx must exist");
  assert.match(primer, /^"use client";/);
  assert.match(primer, /const AUTO_ADVANCE_MS = 6_000;/);
  assert.match(primer, /useEffect\(\(\) => \{/);
  assert.match(primer, /if \(!autoRunning\) return;/);
  assert.match(primer, /window\.setInterval/);
  assert.match(primer, /\(index \+ 1\) % copy\.items\.length/);
  assert.match(primer, /window\.clearInterval/);
  assert.match(primer, /const selectItem = \(key: PrimerKey\) => \{/);
  assert.match(primer, /setAuto\(false\);/);
  assert.match(primer, /setActiveKey\(key\);/);
  assert.match(primer, /role="group"/);
  assert.match(primer, /aria-label=\{copy\.selectorLabel\}/);
  assert.match(primer, /aria-pressed=\{isActive\}/);
  assert.match(primer, /onClick=\{\(\) => selectItem\(item\.key\)\}/);
  assert.match(primer, /min-h-\[44px\]/);
});

test("automatic rotation respects reduced motion and stays quiet to assistive technology", () => {
  assert.match(primer, /const autoRunning = auto && reduced === false;/);
  assert.match(primer, /aria-live=\{auto \? "off" : "polite"\}/);
  assert.match(primer, /data-primer-auto=\{auto \? "on" : "off"\}/);
  assert.doesNotMatch(primer, /aria-live=\{autoRunning/);
});

test("the active primer keeps one heading and swaps its matching decorative visual", () => {
  assert.equal((primer.match(/<h1\b/g) ?? []).length, 1);
  assert.match(primer, /id="chain-title"/);
  assert.match(primer, /aria-live=\{auto \? "off" : "polite"\}/);
  assert.match(primer, /aria-atomic="true"/);
  assert.match(primer, /className="sr-only">\{CHAIN_PAGE\.eyebrow\}: /);
  assert.match(primer, /active\.subtitle/);
  assert.match(primer, /active\.body/);
  assert.match(primer, /<PrimerVisual kind=\{active\.key\}/);
  assert.match(primer, /aria-hidden="true"/);
  assert.match(primer, /AnimatePresence/);
  assert.match(primer, /useReducedMotion/);
});

test("the primer artwork reuses the home node glass language and degrades cleanly", () => {
  assert.match(globals, /\.page-hero-orb\s*\{/);
  assert.match(globals, /\.page-hero-orb[\s\S]*?border-radius:\s*9999px/);
  assert.match(globals, /\.page-hero-orb[\s\S]*?backdrop-filter:\s*blur/);
  const forced =
    globals.match(/@media \(forced-colors: active\) \{[\s\S]*?\n\}/)?.[0] ?? "";
  assert.match(forced, /\.page-hero-visual/);
});
