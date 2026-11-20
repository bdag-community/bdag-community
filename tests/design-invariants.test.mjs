import { readdirSync, readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";

// Design-system guards for "Stately Plum" (DESIGN.md): the signature tokens,
// the reduced-motion doctrine, and the Tailwind v3 commitment. A silent token
// drift or a pasted v4 idiom (@theme / @import "tailwindcss") would corrupt
// the whole visual world without failing a build.

const read = (rel) => readFileSync(new URL(rel, import.meta.url), "utf8");

const config = read("../tailwind.config.ts");
const globals = read("../src/app/globals.css");

/** A commented-out rule reads exactly like a live one, and the prose in this
 *  file talks about the very weights and hues the tests forbid. Strip first. */
const css = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "");
/** The same for TS/TSX: a doc comment explaining what was deleted must not
 *  count as the thing still being there. */
const code = (src) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

/** The whole @layer components block that carries the reveal and the edge —
 *  exactly the CSS the animation added, and nothing else. Taken by brace, not
 *  by banner: the banner is a comment, and comments are what get stripped. */
function litEdgeBlock() {
  const end = globals.indexOf("@media (forced-colors: active)");
  assert.ok(end > -1, "globals.css must keep its forced-colors block");
  // The opening brace is part of the needle: the prose inside this very block
  // says the words "@layer components" and would otherwise match first.
  const start = globals.lastIndexOf("@layer components {", end);
  assert.ok(start > -1, "the lit-edge block must precede the forced-colors block");
  const block = blockAt(globals, start);
  assert.match(block, /THE LIT EDGE/, "wrong @layer components block");
  return block;
}

/** The text inside the first `{...}` after `from`, brace-matched. */
function blockAt(src, from) {
  const open = src.indexOf("{", from);
  assert.ok(open > -1, `no block found after index ${from}`);
  let depth = 0;
  for (let i = open; i < src.length; i += 1) {
    if (src[i] === "{") depth += 1;
    else if (src[i] === "}") {
      depth -= 1;
      if (depth === 0) return src.slice(open + 1, i);
    }
  }
  throw new Error("unbalanced braces in globals.css");
}

/** Innermost declaration blocks, paired with the text that introduced them. */
function rules(src) {
  const out = [];
  const re = /([^{}]*)\{([^{}]*)\}/g;
  let m;
  while ((m = re.exec(src)) !== null) out.push({ sel: m[1].trim(), body: m[2] });
  return out;
}

function sourceFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = `${dir}/${e.name}`;
    if (e.isDirectory()) return sourceFiles(p);
    return /\.(ts|tsx|css)$/.test(e.name) ? [p] : [];
  });
}

test("the signature colour tokens are intact", () => {
  assert.match(config, /"base-void": "#0E0715"/);
  assert.match(config, /"accent-pink": "#F45FC4"/);
});

test("gradient-accent keeps its three stops (purple -> magenta -> pink)", () => {
  const value = config.match(/"gradient-accent":\s*\n?\s*"([^"]+)"/)?.[1];
  assert.ok(value, "tailwind.config.ts must define backgroundImage.gradient-accent");
  const stops = value.match(/#[0-9A-Fa-f]{6}/g) ?? [];
  assert.equal(stops.length, 3, `gradient-accent must have exactly 3 stops (found ${stops.length})`);
  assert.deepEqual(stops, ["#A856FB", "#D33AEE", "#F45FC4"]);
});

test("globals.css keeps the reduced-motion kill block and .text-gradient", () => {
  assert.match(globals, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(
    globals,
    /animation-duration: 0\.01ms !important/,
    "the reduced-motion block must flatten all animation (DESIGN.md doctrine).",
  );
  assert.match(globals, /\.text-gradient/);
});

test("the lit edge is a branch, never the chain", () => {
  const block = css(litEdgeBlock());
  const sized = rules(block).filter(
    (r) => r.sel.includes("[data-edge]") && /\b(width|height):/.test(r.body),
  );
  assert.ok(sized.length >= 2, "both axes of [data-edge] must declare a weight");
  for (const r of sized) {
    assert.match(
      r.body,
      /1\.2px/,
      `[data-edge] rule "${r.sel}" must be 1.2px — the branch weight`,
    );
  }
  // 1.8 is THE CHAIN: the hero descender, the lead-in and the trunk are one
  // continuous line and it is home-only. Everything here is a reference off it.
  assert.doesNotMatch(
    block,
    /1\.8px/,
    "the trunk weight must never appear in the lit-edge block",
  );
});

test("the lit edge is never teal", () => {
  // Teal means a value that MOVED — a measurement. The edge moves only because
  // you scrolled, which measures nothing, so it borrows none of that credit.
  const block = litEdgeBlock();
  for (const banned of ["2ce0ce", "9ff5eb", "accent-teal"]) {
    assert.doesNotMatch(
      block,
      new RegExp(banned, "i"),
      `${banned} in the lit-edge block — teal is reserved for live telemetry`,
    );
  }
});

test("nothing can hide content under reduced motion", () => {
  // The global reduced-motion block flattens transition-duration to .01ms, so
  // an element parked at opacity: 0 would simply STAY at opacity 0. Every rule
  // that can hide anything therefore has to be unreachable from reduced motion
  // — inside no-preference, not merely transition-free. This is the invariant
  // that regresses silently, because the page still looks right to everyone
  // who has not asked for less motion.
  const stripped = css(globals);
  const total = (stripped.match(/\.is-armed/g) ?? []).length;
  assert.ok(total > 0, "globals.css must still carry the arming rules");

  const marker = "@media (prefers-reduced-motion: no-preference)";
  let guarded = 0;
  for (let i = stripped.indexOf(marker); i > -1; i = stripped.indexOf(marker, i + 1)) {
    guarded += (blockAt(stripped, i).match(/\.is-armed/g) ?? []).length;
  }
  assert.equal(
    guarded,
    total,
    "every .is-armed rule must live inside a prefers-reduced-motion: no-preference block",
  );
});

test("Reveal keeps its wrappers on the server and avoids the Motion library", () => {
  const reveal = code(read("../src/components/ui/Reveal.tsx"));
  const frame = code(read("../src/components/ui/RevealFrame.tsx"));
  assert.doesNotMatch(reveal, /["']use client["']/);
  assert.doesNotMatch(reveal, /motion/);
  assert.doesNotMatch(frame, /from ["']motion/);
});

test("the edge has a forced-colors fallback", () => {
  const at = globals.indexOf("@media (forced-colors: active)");
  assert.ok(at > -1, "globals.css must keep its forced-colors block");
  const block = blockAt(globals, at);
  assert.match(block, /\[data-edge\]/, "the edge is a background — say it goes");
  assert.match(
    block,
    /\[data-reveal\]/,
    "a stalled runtime must never leave content invisible where nobody can work around it",
  );
});

test("no Tailwind v4 idioms anywhere in source", () => {
  const files = [
    new URL("../tailwind.config.ts", import.meta.url).pathname,
    ...sourceFiles(new URL("../src", import.meta.url).pathname),
  ];
  const offenders = files.filter((f) => {
    const src = readFileSync(f, "utf8");
    return src.includes("@theme") || src.includes('@import "tailwindcss"');
  });
  assert.deepEqual(
    offenders,
    [],
    `Tailwind v4 idioms found in: ${offenders.join(", ")} — this project is v3.`,
  );
});

test("the site chrome wears solid rules, never a fading gradient", () => {
  // The header's bottom edge and the footer's top edge were the same four-stop
  // gradient: transparent, purple, magenta, TEAL, transparent. Two problems.
  // It faded to nothing at both ends, so on a wide screen the rule simply
  // stopped existing under the logo and under the CTA. And it put teal, the
  // site's live-value colour, on a permanent piece of furniture that measures
  // nothing. Both are now a solid #381c56.
  const header = code(read("../src/components/site/Header.tsx"));
  const footer = code(read("../src/components/site/Footer.tsx"));
  for (const [name, src] of [
    ["Header", header],
    ["Footer", footer],
  ]) {
    assert.match(src, /bg-\[#381c56\]/, `${name}'s rule must be the solid chrome hairline.`);
    assert.doesNotMatch(
      src,
      /linear-gradient\(90deg,\s*transparent/,
      `${name} must not reinstate the fading four-stop rule.`,
    );
    assert.doesNotMatch(
      src,
      /44,\s*224,\s*206/,
      `${name} must not paint teal: teal on this site means a value that moves.`,
    );
  }
});

test("the active nav underline is one colour, not the brand gradient", () => {
  // gradient-accent has three stops. Inside a 2px bar roughly forty pixels
  // wide it cannot resolve them, so it rendered as a smear whose hue depended
  // on the width of the word above it: "Home" and "Community" were visibly
  // different colours while both meant the same thing. One state, one colour.
  const nav = code(read("../src/components/site/NavLink.tsx"));
  assert.match(nav, /after:bg-accent-glow/);
  assert.doesNotMatch(nav, /after:bg-gradient-accent/);
  // accent-glow must stay the value the underline was chosen for.
  assert.match(config, /"accent-glow":\s*"#E08CFF"/i);
});
