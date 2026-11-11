import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";

const read = (rel) => readFileSync(new URL(rel, import.meta.url), "utf8");
const withoutComments = (source) => source.replace(/\/\*[\s\S]*?\*\//g, "");

const globals = withoutComments(read("../src/app/globals.css"));
const hero = read("../src/components/home/Hero.tsx");
const exchangeWarning = read("../src/components/home/ExchangeWarning.tsx");
const news = read("../src/components/home/NewsPreview.tsx");
const card = read("../src/components/ui/Card.tsx");
const reveal = read("../src/components/ui/Reveal.tsx");
const node = read("../src/components/home/ParticipationNode.tsx");
const statNumber = read("../src/components/ui/StatNumber.tsx");

test("the hero storm sky sits behind the constellation at 75% opacity", () => {
  // The furthest-back hero layer (2026-08-13): inside the aria-hidden
  // backdrop, BEFORE DagField in source order so every chain draws over it,
  // decorative (empty alt), at the 0.75 the owner settled on after trying
  // 0.15, 0.3 and 0.4. Arbitrary-value opacity so a missing scale step cannot
  // silently drop the class and paint the sky at full strength.
  const start = hero.indexOf('aria-hidden className="absolute inset-0"');
  const end = hero.indexOf("<DagField");
  assert.ok(start > 0 && end > start, "the backdrop wrapper precedes DagField");
  const backdrop = hero.slice(start, end);
  // The purple swirl won the A/B; the losing sky is deleted.
  assert.match(backdrop, /hero-storm-b\.webp/, "the storm layer exists");
  assert.match(backdrop, /alt=""/, "decoration, not content");
  assert.match(backdrop, /opacity-\[0\.75\]/, "the chosen strength");
  assert.match(backdrop, /object-cover/);
  assert.ok(
    existsSync(new URL("../public/hero-storm-b.webp", import.meta.url)),
    "the sky asset ships",
  );
  assert.ok(
    !existsSync(new URL("../public/hero-storm.webp", import.meta.url)),
    "the losing sky stays deleted",
  );
});

test("the hero node is a translucent glass instrument whose energy fill follows arrivals", () => {
  const glass = globals.match(/\.hero-node-glass\s*\{[\s\S]*?\n\}/)?.[0] ?? "";
  const energy = globals.match(/\.hero-node-energy\s*\{[\s\S]*?\n\}/)?.[0] ?? "";
  const mark = globals.match(/\.hero-node-mark\s*\{[\s\S]*?\n\}/)?.[0] ?? "";

  assert.match(glass, /overflow:\s*hidden/);
  assert.match(glass, /backdrop-filter:\s*blur\(/);
  assert.match(glass, /rgba\(/, "the shell must remain translucent, not an opaque disc");
  assert.match(energy, /var\(--hero-fill,\s*0\)/);
  assert.match(mark, /overflow:\s*hidden/, "the official wide logo is cropped to its mark");
});

test("one node radius keeps the shell and all three outgoing-chain layers aligned", () => {
  const node = globals.match(/\.hero-node\s*\{[\s\S]*?\n\}/)?.[0] ?? "";
  const anchor =
    globals.match(/\[data-spine-hero\]\s*\{[\s\S]*?\n\}/)?.[0] ?? "";
  const hit = globals.match(/\.hero-node-hit\s*\{[\s\S]*?\n\}/)?.[0] ?? "";

  assert.match(anchor, /--hero-node-y:\s*92\.5%/);
  assert.match(node, /--hero-node-size/);
  assert.match(node, /--hero-node-radius/);
  assert.match(hit, /var\(--hero-node-size,\s*72px\)/);
  assert.match(hit, /var\(--hero-node-y,\s*70%\)/);

  for (const selector of ["hero-descender", "hero-glint-wrap", "hero-discharge-wrap"]) {
    const block =
      globals.match(new RegExp(`\\.${selector}\\s*\\{[\\s\\S]*?\\n\\}`))?.[0] ?? "";
    assert.match(block, /var\(--hero-node-y,\s*70%\)/);
    assert.match(
      block,
      /var\(--hero-node-radius,\s*36px\)/,
      `${selector} drifted off the glass shell`,
    );
  }

  assert.match(
    globals,
    /@media\s*\(min-width:\s*768px\)[\s\S]{0,220}--hero-node-y:\s*70%/,
  );
});

test("short laptop viewports tighten only the hero rhythm so its payoff stays in-frame", () => {
  const compact =
    globals.match(/@media\s*\(min-width:\s*768px\)\s*and\s*\(max-height:\s*720px\)[\s\S]{0,900}/)?.[0] ?? "";

  assert.match(compact, /\.hero-content/);
  assert.match(compact, /padding-(?:block|top)/);
  assert.match(compact, /\.display/);
  assert.match(compact, /\.body[\s\S]{0,100}max-width:\s*44ch/);
});

test("short phone viewports compact the hero so the node stays in-frame", () => {
  // The mobile sibling of the laptop tier: an in-browser tab (URL bars, or a
  // webview inside a messenger) leaves ~80-85% of the screen as the small
  // viewport, and at full rhythm the hero copy alone outgrew 100svh — the
  // node at 92.5% fell below the fold. The tier shrinks rhythm and type so
  // the content fits INSIDE the min-height and the node lands on screen.
  const compact =
    globals.match(/@media\s*\(max-width:\s*767px\)\s*and\s*\(max-height:\s*780px\)[\s\S]{0,900}/)?.[0] ?? "";

  assert.match(compact, /\.hero-content/);
  assert.match(compact, /padding-(?:block|top)/);
  assert.match(compact, /\.display/);
  // And a second, tighter tier catches SE-class heights.
  assert.match(
    globals,
    /@media\s*\(max-width:\s*767px\)\s*and\s*\(max-height:\s*640px\)/,
  );
});

test("in-app browsers cannot inflate the numerals out of their boxes", () => {
  // Root fix: font boosting off — the layout sets its own responsive sizes,
  // and Messenger's webview was inflating the live numerals past their cells.
  const htmlRule = globals.match(/\nhtml\s*\{[\s\S]*?\n\}/)?.[0] ?? "";
  assert.match(htmlRule, /text-size-adjust:\s*100%/);
  // Defence in depth: below sm each spine cell is a container and the numeral
  // is capped by the cell's own width, so overflow is impossible rather than
  // merely unlikely.
  const cap =
    globals.match(/@media\s*\(max-width:\s*639px\)[\s\S]{0,700}/)?.[0] ?? "";
  assert.match(cap, /container-type:\s*inline-size/);
  assert.match(cap, /\[data-spine-cell\] dd[\s\S]{0,80}min\(1\.5rem,\s*15cqw\)/);
  // The copyable RPC hostname wraps instead of clipping at the edge.
  const band = read("../src/components/home/StatsBand.tsx");
  assert.match(band, /max-w-full flex-wrap[\s\S]{0,220}break-all/);
});

test("timeline dots share the outside rail at narrow and wide gutters", () => {
  const narrow = globals.match(/\.tl-dot-outer\s*\{[\s\S]*?\n\}/)?.[0] ?? "";
  const responsive =
    globals.match(/@media\s*\(min-width:\s*768px\)\s*\{\s*\.tl-dot-outer\s*\{[\s\S]*?\n\s*\}\s*\}/)?.[0] ?? "";

  assert.match(narrow, /7px/);
  assert.match(narrow, /safe-area-inset-left/);
  assert.match(narrow, /5\.5px/);
  assert.match(responsive, /13px/);
  assert.match(responsive, /max\(2rem,\s*env\(safe-area-inset-left\)\)/);
});

test("narrow hero actions stay on one row above the bottom node", () => {
  assert.match(hero, /className="[^"]*\bhero-actions\b/);
  const narrow =
    globals.match(/@media\s*\(max-width:\s*767px\)[\s\S]{0,500}/)?.[0] ?? "";
  assert.match(narrow, /\.hero-actions[\s\S]{0,100}flex-wrap:\s*nowrap/);
  assert.match(narrow, /padding-inline:\s*1rem/);
});

test("both canonical-warning variants share one teal routing instrument", () => {
  assert.match(exchangeWarning, /function ExchangeWarningNode\(\)/);
  assert.match(exchangeWarning, /aria-hidden="true"/);
  assert.match(exchangeWarning, /className="exchange-warning-node"/);
  assert.match(exchangeWarning, /className="exchange-warning-node-art"/);
  assert.match(exchangeWarning, /className="exchange-warning-node-art-grid"/);
  assert.match(exchangeWarning, /className="exchange-warning-node-art-nodes"/);
  assert.match(exchangeWarning, /className="exchange-warning-node-art-check"/);
  assert.match(exchangeWarning, /className="exchange-warning-node-label">canonical</);
  assert.doesNotMatch(exchangeWarning, /src="\/logo\.svg"/);
  assert.equal(
    (exchangeWarning.match(/<ExchangeWarningNode \/>/g) ?? []).length,
    1,
    "both placements must reuse the same render path, not duplicate the drawing",
  );
  assert.doesNotMatch(exchangeWarning, /isFull \? <ExchangeWarningNode/);

  const node =
    globals.match(/\.exchange-warning-node\s*\{[\s\S]*?\n\}/)?.[0] ?? "";
  const glass =
    globals.match(/\.exchange-warning-node-glass\s*\{[\s\S]*?\n\}/)?.[0] ?? "";
  const wide =
    globals.match(/@media\s*\(min-width:\s*1120px\)\s*\{\s*\.exchange-warning-node\s*\{[\s\S]*?\n\s*\}\s*\}/)?.[0] ?? "";
  const forced =
    globals.match(/@media\s*\(forced-colors:\s*active\)\s*\{[\s\S]*?\n\}/)?.[0] ?? "";

  assert.match(node, /display:\s*none/);
  assert.match(node, /pointer-events:\s*none/);
  assert.match(wide, /display:\s*block/);
  assert.match(glass, /backdrop-filter:\s*blur\(/);
  assert.match(glass, /44,\s*224,\s*206/);
  assert.doesNotMatch(glass, /168,\s*86,\s*251|244,\s*95,\s*196/);
  assert.doesNotMatch(`${node}\n${glass}`, /animation\s*:/);
  assert.match(forced, /\.exchange-warning-node/);
});

test("Home News opts into one three-card chain junction without animated borders", () => {
  assert.match(news, /data-spine-news/);
  for (const role of ["left", "center", "right"]) {
    assert.match(news, new RegExp(`['\"]${role}['\"]`));
  }
  assert.match(news, /data-spine-news-card/);
  assert.doesNotMatch(news, /data-edge/);
  assert.doesNotMatch(news, /data-spine-frame/);
  assert.doesNotMatch(news, /SpineFrame/);
  assert.match(reveal, /ComponentPropsWithoutRef<"div">/);
  assert.match(reveal, /\.\.\.rest/);
});

test("the participation hub fails closed with the fork it belongs to", () => {
  const start = globals.indexOf(".hub-node-row {");
  const block = start >= 0 ? globals.slice(start, start + 700) : "";
  assert.ok(block, ".hub-node-row must exist");

  // geometry.ts only forks when the two cards' centres are >40px apart, which
  // stops being true the moment they stack. A node with no arms converging on
  // it is a disconnected dot, so it must not render there at all.
  assert.match(block, /display:\s*none/, "the hub is hidden by default");
  assert.match(
    block,
    /@media \(min-width:\s*1024px\)\s*\{\s*\.hub-node-row\s*\{\s*display:\s*flex/,
    "…and only appears where the pair is side by side",
  );

  // It is decoration for a chain the sections either side already describe.
  assert.match(node, /aria-hidden/);
  assert.match(node, /data-spine-hub/);
});

test("the News arrival lights all three cards, and hover still outranks it", () => {
  const start = globals.indexOf(
    "@media (min-width: 1024px) {\n  [data-spine-news] [data-spine-news-card]",
  );
  const highlight = start >= 0 ? globals.slice(start, start + 2200) : "";

  // The chain links the whole row now, so the highlight is not per-card.
  assert.match(highlight, /\[data-spine-news\] \[data-spine-news-card\]/);
  assert.doesNotMatch(highlight, /data-spine-news-card="left"/);
  assert.doesNotMatch(highlight, /data-spine-news-card="right"/);
  assert.match(highlight, /\.is-news-reached/);

  // It is the resting-hover treatment: border + halo, and NO lift — three
  // cards rising together on scroll would read as a glitch, not an arrival.
  assert.match(highlight, /border-color/);
  assert.match(highlight, /box-shadow/);
  assert.doesNotMatch(highlight, /translate/);

  // …and a pointer must still have somewhere brighter to go, or hovering an
  // already-lit card would do nothing at all.
  assert.match(highlight, /:hover/);
  assert.match(card, /hover:border-accent-soft\/75/);
  assert.match(card, /hover:shadow-glow(?!-sm)/);
  assert.match(card, /hover:-translate-y-0\.5/);
});


test("a counting numeral cannot resize the band it sits in", () => {
  // tabular-nums keeps each DIGIT the same width, but the number of digits
  // grows as the value counts (0 -> 17 -> 17,003,258). That changed the
  // numeral's width on almost every frame, and in a space-between band it
  // re-distributed every cell sixty times a second AND fired the spine's cell
  // ResizeObserver, rebuilding the whole circuit each time. The shudder was
  // the layout under the numbers, not the numbers.
  const src = withoutComments(statNumber);

  // A sizer in flow, invisible, holding the value the count-up is heading FOR.
  assert.match(src, /const target =/, "the final value must be formatted for the sizer");
  assert.match(
    src,
    /className="invisible font-mono tabular-nums"[\s\S]{0,60}\{target\}/,
    "the sizer must be invisible, in flow, and hold the TARGET value",
  );
  // `invisible` (visibility) and not opacity-0 — it must not become a paint layer.
  assert.doesNotMatch(src, /opacity-0[^"]*"[\s\S]{0,60}\{target\}/);

  // The animating numeral is out of flow, so it cannot affect that box…
  assert.match(
    src,
    /className="absolute inset-0 text-right font-mono tabular-nums"/,
    "the animating numeral must be absolutely positioned and right-aligned",
  );
  // …and the display still tracks the tween, not the target.
  assert.match(src, /\{display\}/);

  // The truth stays available to assistive tech regardless of the animation.
  assert.match(src, /className="sr-only">\{truth\}/);
});

test("every page below Home wears the same hero, from one implementation", () => {
  const heroSrc = read("../src/components/site/PageHero.tsx");
  const artSrc = read("../src/components/site/PageHeroArt.tsx");
  const primer = read("../src/components/chain/ChainPrimer.tsx");
  const css = withoutComments(globals);
  // Comment-stripped: the notes explaining the rename and the primitives have
  // to be able to name the things they replaced.
  const strip = (t) =>
    t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
  const hero = strip(heroSrc);
  const art = strip(artSrc);

  // ONE implementation. Five near-identical hero components is how five pages
  // drift apart, which is the same failure the fork card's variant was.
  for (const cls of ["page-hero-grid", "page-hero-visual", "page-hero-orb"]) {
    assert.ok(hero.includes(cls), `the hero must use the shared ${cls}`);
    assert.ok(primer.includes(cls), `the Chain primer must use the same ${cls}`);
    assert.match(css, new RegExp(`\\.${cls}[\\s,{]`), `${cls} defined once`);
  }
  assert.doesNotMatch(hero, /chain-primer/);
  assert.doesNotMatch(css, /\.chain-primer/);

  // No toggle on these pages, so no client bundle for a static SVG.
  assert.doesNotMatch(hero, /"use client"/);
  assert.doesNotMatch(art, /"use client"/);
  assert.doesNotMatch(hero, /useState|useEffect|AnimatePresence/);

  // One display word, the claim under it, the description kept.
  assert.match(hero, /<h1 id=\{titleId\} className="display hero-word/);
  assert.match(hero, /\{subtitle\}/);
  assert.match(hero, /\{intro\}/);
  assert.match(hero, /aria-hidden="true"/, "the orb is decoration");

  // Every page that has one uses it, passes its own art, and keeps exactly
  // one h1. No eyebrow: each page's eyebrow was the word its title now is.
  const pages = {
    community: "CommunityArt",
    mining: "MiningArt",
    staking: "StakingArt",
    articles: "NewsArt",
    faq: "FaqArt",
    contact: "ContactArt",
  };
  for (const [slug, artName] of Object.entries(pages)) {
    const page = read(`../src/app/(public)/${slug}/page.tsx`);
    assert.match(page, /<PageHero/, `/${slug} must use the shared hero`);
    assert.ok(page.includes(`<${artName} />`), `/${slug} must pass ${artName}`);
    assert.ok(
      page.includes(`titleId="${slug}-title"`),
      `/${slug} must label its section from the hero's h1`,
    );
    assert.equal(
      (page.match(/<h1\b/g) ?? []).length,
      0,
      `/${slug} must not author a second h1; the hero owns it`,
    );
    assert.doesNotMatch(
      page,
      /_PAGE\.eyebrow\}<\/p>|eyebrow animate-fade-in/,
      `/${slug} must not render an eyebrow above its own name`,
    );
    // Its art must actually be defined, and be drawn rather than typed.
    assert.ok(art.includes(`export function ${artName}`), `${artName} must exist`);
  }

  // Seven drawings (six nav pages plus the community Projects view), seven
  // distinct shapes, all from the shared primitives.
  const bodies = [...art.matchAll(/export function (\w+Art)\(\)[\s\S]*?\n\}/g)];
  assert.equal(bodies.length, 7, "one drawing per page");
  const shapes = new Set(bodies.map((m) => m[0].replace(/\s+/g, "")));
  assert.equal(shapes.size, 7, "no two pages share a drawing");
  for (const [body, name] of bodies.map((m) => [m[0], m[1]])) {
    assert.match(body, /page-hero-art-flow/, `${name} needs one accent stroke`);
    assert.match(body, /viewBox="0 0 320 320"/, `${name} must share the canvas`);
    assert.doesNotMatch(body, /<text|emoji/, `${name} must be drawn, not typed`);
  }
});