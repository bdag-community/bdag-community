import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";

const read = (rel) => readFileSync(new URL(rel, import.meta.url), "utf8");

test("desktop navigation and footer links keep a 44px interaction target", () => {
  const nav = read("../src/components/site/NavLink.tsx");
  const footer = read("../src/components/site/Footer.tsx");

  assert.match(nav, /min-h-\[44px\]/);
  assert.match(footer, /inline-flex min-h-\[44px\] items-center py-1\.5/);
  assert.match(
    footer,
    /inline-flex min-h-\[44px\] items-center gap-1 py-1\.5 font-mono/,
  );
  assert.match(
    footer,
    /inline-flex min-h-\[44px\] items-center underline underline-offset-2/,
  );
});

test("missing producer data uses a readable text token", () => {
  const bars = read("../src/components/chain/ProducerBars.tsx");
  assert.doesNotMatch(bars, /text-outline">—/);
  assert.match(bars, /text-on-surface-muted">—/);
});

test("the public site keeps the native browser cursor", () => {
  const layout = read("../src/app/(public)/layout.tsx");
  const globals = read("../src/app/globals.css");

  assert.equal(
    existsSync(
      new URL("../src/components/site/CustomCursor.tsx", import.meta.url),
    ),
    false,
  );
  assert.doesNotMatch(layout, /CustomCursor/);
  assert.doesNotMatch(
    globals,
    /CUSTOM CURSOR|\.site-cursor|data-site-cursor|cursor:\s*none\s*!important/,
  );
});
