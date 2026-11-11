import { existsSync, readdirSync, readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";

// The Chain page's invariants.
//
// This page's whole claim is that every number on it is read from the chain
// while the reader looks at it, and that where the chain publishes nothing we
// say so instead of estimating. Both halves of that claim are easy to break by
// accident — a literal typed into a caption "for now", a gauge maximum copied
// out of a header, a sentence quoting a reading that was true the afternoon it
// was written. These tests are the guard rails for the specific mistakes every
// draft of this page actually made.

const read = (rel) => readFileSync(new URL(rel, import.meta.url), "utf8");
const path = (rel) => new URL(rel, import.meta.url).pathname;

function sourceFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = `${dir}/${e.name}`;
    if (e.isDirectory()) return sourceFiles(p);
    return /\.(ts|tsx|css)$/.test(e.name) ? [p] : [];
  });
}

const site = read("../src/lib/content/site.ts");
// Just the CHAIN_PAGE object. The copy rules below apply to it and not to the
// rest of site.ts, which legitimately holds on-chain constants.
const block = site.slice(
  site.indexOf("export const CHAIN_PAGE"),
  site.indexOf("} as const;", site.indexOf("export const CHAIN_PAGE")),
);

test("the capacity gauge maximum is read from the chain, never hard-coded", () => {
  for (const f of sourceFiles(path("../src/components/chain"))) {
    assert.doesNotMatch(
      readFileSync(f, "utf8"),
      /45[,_ ]?000[,_ ]?000/,
      `${f}: the gas limit must come from the sampled blocks, never a literal.`,
    );
  }
});

test("no measured figure is baked into CHAIN_PAGE copy", () => {
  // Every draft of this page shipped prose asserting a live reading that was
  // false within a day (the explorer's block time has been seen at three very
  // different values; the gas-price sources have since converged). Measured
  // values belong in {placeholders}, not in sentences.
  const forbidden = [
    /\b643\b/,
    /\b783\b/,
    /\b914\b/, // observed average_block_time
    /\b25[,_]?437\b/,
    /\b392[,_]?033\b/, // daily transaction counts
    /\b\d+(\.\d+)?\s*(x|×)\s*(disagree|difference)/i,
    /\bGwei\b/, // gas price readings
    /\bfrozen\b/i, // a claim we cannot keep true
    // The interval heading shipped as "Blocks land about every 0.85 seconds"
    // — a measured figure written into a heading, on the page whose whole
    // claim is that it never does that. It is a {interval} template now.
    /\b0\.\d{2}\s*seconds\b/,
  ];
  for (const re of forbidden) {
    assert.doesNotMatch(
      block,
      re,
      `CHAIN_PAGE must not hardcode a measured value (matched ${re}).`,
    );
  }
});

test("the plain-language primer is rendered before the live readings", () => {
  const page = read("../src/app/(public)/chain/page.tsx");
  const primer = page.indexOf("<ChainPrimer");
  const readout = page.indexOf("<ChainReadout");
  assert.ok(primer > -1, "the page must render the primer");
  assert.ok(readout > primer, "the concepts must be introduced before the measurements");
  assert.doesNotMatch(block, /\n\s*intro:/, "the retired opening copy must not linger unused");
});

test("capacity copy describes its denominator without freezing a reading", () => {
  const capacity = block.slice(
    block.indexOf("capacity:"),
    block.indexOf("index:", block.indexOf("capacity:")),
  );
  assert.doesNotMatch(capacity, /small fraction/i);
  assert.doesNotMatch(capacity, /only dial/i);
  assert.match(capacity, /sampled block/i);
  assert.match(capacity, /real denominator/i);
});

test("the producer floor describes one deterministic shared sample", () => {
  const pow = block.slice(
    block.indexOf("pow:"),
    block.indexOf("evm:", block.indexOf("pow:")),
  );
  assert.doesNotMatch(pow, /rises as we watch/i);
  assert.match(pow, /sample/i);
  assert.match(pow, /roughly the trailing day/i);
  assert.doesNotMatch(pow, /resets when the site is redeployed/i);
});

test("the throughput chart fits every day to one full-height scale", () => {
  const throughput = block.slice(
    block.indexOf("throughput:"),
    block.indexOf("ticker:", block.indexOf("throughput:")),
  );
  const chart = read("../src/components/chain/ThroughputChart.tsx");

  assert.match(throughput, /Every bar shares one scale/);
  assert.match(throughput, /busiest day in this window at the top/);
  assert.doesNotMatch(throughput, /breakLabel:|cut that bar|flatten the rest/i);
  assert.match(chart, /const axisTop = record;/);
  assert.doesNotMatch(
    chart,
    /BREAK_RATIO|BREAK_HEADROOM|NOTCH_Y|\bclipped\b|copy\.breakLabel/,
    "the record sets the scale; no bar may be capped or marked as cut",
  );
});

test("the connect card does not give JSON-RPC configuration to miners", () => {
  const connect = block.slice(
    block.indexOf("connect:"),
    block.indexOf("nodes:", block.indexOf("connect:")),
  );
  assert.doesNotMatch(connect, /wallet, miner/i);
});

test("the schematic caveat is present and still says it is not the data", () => {
  // The DISCLOSURE is non-negotiable and is what this asserts: a multi-parent
  // picture that is not labelled a schematic is the biggest honesty trap on
  // this page, because the RPC returns a singular parentHash and the structure
  // drawn cannot be read off the chain at all.
  //
  // The REASON is no longer on the page. It was shortened out of this sentence
  // and then removed with the boundary rail, both at the owner's request. That
  // is a defensible trade: the label still tells a reader the drawing is not
  // data, which is the part that stops them being misled. What it no longer
  // does is explain why, so a reader who wants to check the claim has nowhere
  // on the site to go.
  assert.match(block, /schematic, not a rendering/);
  assert.match(block, /the protocol's design, and not the data/);
});

test("the schematic caveat renders beside the diagram, not below the fold", () => {
  const page = read("../src/app/(public)/chain/page.tsx");
  const diagram = page.indexOf("<DagSchematic");
  const caveat = page.indexOf("schematicNote");
  assert.ok(diagram > -1, "the page must render the schematic");
  assert.ok(caveat > -1, "the page must render CHAIN_PAGE.shape.schematicNote");
  assert.ok(
    caveat > diagram,
    "the caveat belongs immediately beneath the drawing it qualifies.",
  );
  // It must be in the same section as the figure, ahead of the readout band.
  assert.ok(
    caveat < page.indexOf("<ChainReadout"),
    "the caveat must not be pushed below the live readout.",
  );
});


test("the explorer's average block time is never displayed or derived from", () => {
  for (const f of [
    ...sourceFiles(path("../src/components/chain")),
    path("../src/app/(public)/chain/page.tsx"),
  ]) {
    assert.doesNotMatch(
      readFileSync(f, "utf8"),
      /averageBlockTimeMs/,
      `${f}: this field disagrees with every direct baseline and drifts. Use the measured interval.`,
    );
  }
});

test("TPS is never derived from a total_transactions delta", () => {
  const stats = read("../src/lib/chain/stats.ts");
  const chainWindow = read("../src/lib/chain/window.ts");
  for (const [name, src] of [
    ["stats.ts", stats],
    ["window.ts", chainWindow],
  ]) {
    assert.doesNotMatch(
      src,
      /totalTransactions\s*[-–]\s*prev|prevTotalTransactions/,
      `${name}: the explorer aggregate is recomputed over an incomplete index; TPS comes from the block-window accumulator.`,
    );
  }
});

test("the observed-TPS accumulator refuses to publish a gappy window", () => {
  const stats = read("../src/lib/chain/stats.ts");
  const chainWindow = read("../src/lib/chain/window.ts");
  assert.match(chainWindow, /coverage/, "derive() must expose a coverage ratio");
  assert.match(chainWindow, /0\.98/, "observedTps must return null below 0.98 coverage");
  assert.match(chainWindow, /deriveContiguousRateWindow/);
  assert.match(stats, /const RECENT_PRIMARY_BLOCKS = 50/);
  assert.match(stats, /const RECENT_EXTENSION_BLOCKS = 50/);
  assert.match(chainWindow, /const SAMPLE_BLOCKS = 50/);
  assert.match(chainWindow, /const sample = heights\.slice\(0, SAMPLE_BLOCKS\)/);
});

test("the RPC batch can carry params", () => {
  const stats = read("../src/lib/chain/rpc-sources.server.ts");
  assert.doesNotMatch(
    stats,
    /params:\s*\[\],?\s*\n\s*\}\)\),/,
    "rpcBatchAt must accept per-method params — eth_getBlockByNumber cannot be batched otherwise.",
  );
  assert.match(stats, /eth_getBlockByNumber/);
});

test("the RPC reads stay batched POSTs, not per-call fetches", () => {
  const sources = read("../src/lib/chain/rpc-sources.server.ts");
  assert.match(sources, /calls\.map\(\(call, id\) =>/);
  assert.match(sources, /headers:[\s\S]*body,[\s\S]*cache:\s*"no-store"/);
});

test("the live tiles use a fixed independent-operator RPC quorum", () => {
  const stats = read("../src/lib/chain/stats.ts");
  const sources = read("../src/lib/chain/rpc-sources.server.ts");

  assert.match(stats, /probeAutomaticRpcSources/);
  assert.match(stats, /rpcBatchOutcomesFromConsensus/);
  assert.match(stats, /publishChainConsensusSnapshot/);
  assert.match(stats, /minerSampleHeights/);
  assert.doesNotMatch(stats, /const RPC_ENDPOINTS|minersSeen/);
  assert.match(sources, /id:\s*"canonical-rpc"[\s\S]*automatic:\s*true/);
  assert.match(sources, /id:\s*"rms"[\s\S]*automatic:\s*true/);
  assert.match(sources, /id:\s*"cms"[\s\S]*automatic:\s*true/);
  assert.match(sources, /id:\s*"welshdag"[\s\S]*automatic:\s*false/);
});

test("every new visual has a forced-colors fallback", () => {
  const globals = read("../src/app/globals.css");
  const forced = globals.match(/@media \(forced-colors: active\) \{[\s\S]*?\n\}/)?.[0] ?? "";
  assert.match(forced, /\.viz\b/);
  assert.match(forced, /\.viz-fallback\b/);
  assert.match(forced, /\.dag-edge\b/);
});

test("the throughput fallback clips a wrapper, not an intrinsic-width table", () => {
  const chart = read("../src/components/chain/ThroughputChart.tsx");
  assert.doesNotMatch(
    chart,
    /<table className="viz-fallback sr-only">/,
    "an sr-only class directly on a table is widened by table layout and expands the page on narrow screens.",
  );
  assert.match(
    chart,
    /<div className="viz-fallback sr-only">\s*<table>/,
    "clip a normal wrapper so the hidden table cannot expand the document, while forced colours can still reveal it.",
  );
});

test("globals.css keeps the reduced-motion kill block and .text-gradient", () => {
  // The .dag-* and .viz work appends to this file; it must never disturb the
  // two blocks the rest of the site depends on.
  const globals = read("../src/app/globals.css");
  assert.match(globals, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(globals, /\.text-gradient\s*\{/);
  assert.doesNotMatch(globals, /@theme\b/, "Tailwind v4 idiom — this project is v3.4.");
  assert.doesNotMatch(globals, /@import\s+["']tailwindcss["']/);
});

test("the chain page declares the /chain nav entry everywhere it is consumed", () => {
  assert.match(site, /href: "\/chain"/);
  assert.match(
    read("../src/components/site/MobileMenu.tsx"),
    /"\/chain":/,
    "NAV_ICON needs a /chain entry or the drawer renders undefined.",
  );
  assert.match(read("../src/components/site/Footer.tsx"), /\/chain/);
});

test("the hero scroll cue stays on-page", () => {
  const heroNode = read("../src/components/home/HeroNode.tsx");
  assert.match(heroNode, /HERO\.scrollCue\.href/);
  assert.doesNotMatch(
    heroNode,
    /HERO\.ctaSecondary\.href/,
    "an element named 'Scroll to explore' must not navigate to another page.",
  );
  assert.match(site, /scrollCue:\s*\{\s*href:\s*"#network"/);
});

test("the home band points at the board's new home", () => {
  // The seven-card board moved to /chain; the home band's link has to follow
  // it or it sends people to the page that no longer has one.
  assert.match(site, /viewAllNodes:\s*\{[^}]*href:\s*"\/chain#nodes"/);
  const mining = read("../src/app/(public)/mining/page.tsx");
  assert.match(
    mining,
    /variant="compact"/,
    "Mining keeps the board in compact form under the same id, so /mining#nodes still lands somewhere live.",
  );
  assert.match(mining, /id="nodes"/);
});

test("the RMS and WelshDAG RPCs share one live board on Community and Mining", () => {
  const community = read("../src/app/(public)/community/page.tsx");
  const mining = read("../src/app/(public)/mining/page.tsx");

  assert.match(
    site,
    /id:\s*"rms"[\s\S]*?host:\s*"rms-bdag-rpc\.de"[\s\S]*?probePath:\s*"\/api\/rpc-live"[\s\S]*?role:\s*"community"/,
  );
  assert.match(
    site,
    /id:\s*"welshdag"[\s\S]*?host:\s*"rpc\.welshdag\.trade"[\s\S]*?probePath:\s*"\/"[\s\S]*?role:\s*"community"/,
  );

  for (const page of [community, mining]) {
    assert.match(page, /id="nodes"/);
    assert.match(page, /<NodesPanel variant="compact" initialDefinitions=\{infrastructure\.rpcs\} \/>/);
  }
});

test("live telemetry retains internal checking and degraded states", () => {
  const home = read("../src/components/home/StatsBand.tsx");
  const chain = read("../src/components/chain/ChainReadout.tsx");

  assert.match(home, /useState<FetchPhase>\("checking"\)/);
  assert.match(home, /setPhase\(next\.stale \? "degraded" : "live"\)/);
  assert.match(home, /setPhase\("degraded"\)/);

  assert.match(chain, /status:\s*"checking"/);
  assert.match(chain, /status:\s*next\.stale \? "degraded" : "live"/);
  assert.match(chain, /publish\(\{ status: "degraded" \}\)/);
});

test("public chain status stays live while reconnect diagnostics are console-only", () => {
  const home = read("../src/components/home/StatsBand.tsx");
  const chain = read("../src/components/chain/ChainReadout.tsx");
  const pill = read("../src/components/chain/ChainStatusPill.tsx");

  assert.match(block, /liveLabel:\s*"LIVE · CHAIN ID 1404"/);
  assert.doesNotMatch(block, /checkingLabel|degradedLabel/);

  assert.match(home, /<ChainStatusPill status=\{phase\} surface="home" \/>/);
  assert.match(chain, /<ChainStatusPill status=\{status\} surface="chain" \/>/);

  assert.match(pill, /CHAIN_PAGE\.readout\.liveLabel/);
  assert.match(pill, /label-caps flex/);
  assert.doesNotMatch(pill, /normal-case/);
  assert.match(pill, /bg-accent-teal shadow-live/);
  assert.match(pill, /import \{ useEffect \} from "react"/);
  assert.match(
    pill,
    /useEffect\(\(\) => \{[\s\S]*if \(status !== "degraded"\) return;[\s\S]*console\.debug\([\s\S]*\[chain-readout\] reconnecting to chain[\s\S]*surface,[\s\S]*chainId:\s*CHAIN\.chainId[\s\S]*\}, \[status, surface\]\);/,
    "the diagnostic should run once per degraded transition, not once per poll or render.",
  );
  assert.doesNotMatch(pill, /checkingLabel|degradedLabel|bg-warn-orange|animate-pulse/);
});

test("the chain readout does not force long numerals into two columns at 320px", () => {
  const chain = read("../src/components/chain/ChainReadout.tsx");
  assert.match(
    chain,
    /grid grid-cols-1[^"]*min-\[360px\]:grid-cols-2/,
    "the 320px content track is too narrow for a block height beside an interval.",
  );
  assert.match(chain, /text-2xl[^"]*sm:text-3xl[^"]*md:text-4xl/);
});

test("the node board distinguishes checking, unavailable, stale, and live", () => {
  const nodes = read("../src/components/mining/NodesPanel.tsx");
  const section = site.slice(
    site.indexOf("export const NODES_SECTION"),
    site.indexOf("} as const;", site.indexOf("export const NODES_SECTION")),
  );

  assert.match(nodes, /type PanelState = "checking" \| "live" \| "stale" \| "unavailable"/);
  assert.match(nodes, /useState<PanelState>\("checking"\)/);
  assert.match(nodes, /setPanelState\("live"\)/);
  assert.match(nodes, /current === "live" \|\| current === "stale"/);
  assert.match(nodes, /panelState === "live"[\s\S]*?bg-accent-teal shadow-live/);
  assert.match(section, /unavailable:\s*"Unavailable"/);
  assert.match(section, /statusLabels:/);
});

test("response-time rows label the fork and deprecated endpoint beside their hosts", () => {
  const bars = read("../src/components/chain/NodeLatencyBars.tsx");
  const fork = site.slice(
    site.indexOf('id: "bdagscan-fork"'),
    site.indexOf('id: "works-legacy"'),
  );
  const deprecated = site.slice(
    site.indexOf('id: "works-legacy"'),
    site.indexOf("] as const;", site.indexOf('id: "works-legacy"')),
  );

  assert.match(fork, /responseTimeLabel:\s*"Fork"/);
  assert.match(deprecated, /responseTimeLabel:\s*"Deprecated"/);
  assert.match(
    bars,
    /<dt[\s\S]*?\{node\.name\}[\s\S]*?node\.responseTimeLabel[\s\S]*?<\/dt>/,
    "the role label belongs in the hostname cell, not beside the measured value",
  );
  assert.equal(
    (bars.match(/sm:grid-cols-\[minmax\(0,15rem\)_minmax\(0,1fr\)\]/g) ?? []).length,
    2,
    "the measured 230px host-plus-label width needs a 240px column, including the aligned axis",
  );
});

test("the chain node board omits both requested explanatory footnotes", () => {
  const bars = read("../src/components/chain/NodeLatencyBars.tsx");
  const nodes = read("../src/components/mining/NodesPanel.tsx");
  const section = site.slice(
    site.indexOf("export const NODES_SECTION"),
    site.indexOf("} as const;", site.indexOf("export const NODES_SECTION")),
  );

  assert.doesNotMatch(block, /latencyNote:/);
  assert.doesNotMatch(bars, /latencyNote/);
  assert.doesNotMatch(section, /\n\s*note:/);
  assert.doesNotMatch(nodes, /NODES_SECTION\.note/);
});

test("Mining distinguishes pool Stratum configuration from public JSON-RPC", () => {
  const mining = read("../src/app/(public)/mining/page.tsx");
  const miningCopy = site.slice(
    site.indexOf("export const MINING_PAGE"),
    site.indexOf("} as const;", site.indexOf("export const MINING_PAGE")),
  );
  // The point is that an ASIC does not speak JSON-RPC, so /mining must never
  // hand a miner the RPC endpoint or the chain ID as if they were its config.
  // A CopyRef is fine in itself; the page carries one for the onboarding brief
  // link. What it must not carry is a copyable CHAIN value.
  assert.doesNotMatch(mining, /ENDPOINT_LABELS/);
  assert.doesNotMatch(mining, /CHAIN\.rpcUrl|CHAIN\.chainIdHex|CHAIN\.explorerUrl/);
  for (const m of mining.matchAll(/<CopyRef[\s\S]{0,120}?\/>/g)) {
    assert.doesNotMatch(m[0], /CHAIN\./, "no CHAIN value is copyable on /mining");
  }
  assert.match(miningCopy, /Stratum endpoint/);
  assert.match(miningCopy, /not the public JSON-RPC/);
  assert.doesNotMatch(miningCopy, /Configure your miner with these two values/);
});

test("the page renders every section heading the outline promises", () => {
  const page = read("../src/app/(public)/chain/page.tsx");
  const primerUrl = new URL(
    "../src/components/chain/ChainPrimer.tsx",
    import.meta.url,
  );
  const primer = existsSync(primerUrl) ? readFileSync(primerUrl, "utf8") : "";
  // "honestly-heading" is deliberately absent: "Reading the chain honestly"
  // and "What this page cannot tell you" ran back to back doing one job, and
  // are now the single boundary rail.
  //
  // "boundary-heading" is absent because the rail itself was removed at the
  // owner's request as too extensive. The two items in it that were not
  // editorial moved inline: see the producer-caveat assertion below and
  // STATS_SECTION.floorNote on the home band.
  //
  // "interval-heading" is deliberately absent too. The Timing section was
  // removed at the owner's request because the block interval already reads in
  // the live band above it. See the last test in this file for what had to be
  // kept when it went.
  for (const id of [
    "chain-title",
    "shape-heading",
    "ticker-heading",
    "producers-heading",
    "evm-heading",
    "connect-heading",
    "nodes-heading",
  ]) {
    assert.ok(page.includes(`"${id}"`), `the page must carry the ${id} heading anchor.`);
  }
  // live-heading belongs to ChainReadout, which renders the banded section.
  assert.match(read("../src/components/chain/ChainReadout.tsx"), /live-heading/);
  // Exactly one h1.
  assert.equal(
    ((page + primer).match(/<h1\b/g) ?? []).length,
    1,
    "one h1 per document, and this page's is the chain title.",
  );
});

test("the page authors no prose of its own", () => {
  const page = read("../src/app/(public)/chain/page.tsx");
  assert.ok(
    page.includes('from "@/lib/content/site"'),
    "copy comes from site.ts, never from the page file.",
  );
  // The fork warning is rendered from site.ts, never re-authored here. This
  // page used to inline its own copy of the card and had drifted from the
  // canonical one on the radius, the border alpha, the icon and the heading
  // level, so the assertion is now that it CALLS the shared card rather than
  // that it names the copy keys itself. The host is deliberately not written
  // into this file either; the repo-wide guard for that lives in
  // content-invariants.
  assert.match(
    page,
    /<ExchangeWarning \/>/,
    "the fork warning is Home's card, rendered exactly as Home renders it.",
  );
  assert.doesNotMatch(
    page,
    /EXCHANGE_WARNING\./,
    "the page must not re-author the fork warning; ExchangeWarning owns that markup.",
  );
  assert.match(
    read("../src/components/home/ExchangeWarning.tsx"),
    /EXCHANGE_WARNING\.(label|title|body|recommend)/,
    "the shared card must render site.ts prose.",
  );
});

test("nothing below the readout opens a second poll of /api/stats", () => {
  // One snapshot, one cadence. Two pollers would put two different block
  // heights on one page, which is worse than showing no height at all.
  const pollers = sourceFiles(path("../src/components/chain")).filter((f) =>
    /["']\/api\/stats["']/.test(readFileSync(f, "utf8")),
  );
  assert.deepEqual(
    pollers.map((f) => f.split("/").pop()),
    ["ChainReadout.tsx"],
    "only ChainReadout may fetch /api/stats; everything else reads useChainSnapshot().",
  );
});

test("the schematic is entirely purple — teal means a value that moves", () => {
  // Comment-stripped, and case-insensitive. The previous version of this
  // assertion scanned the raw file for lowercase /teal/, which the component
  // passed only because its own comment happened to capitalise "Teal". The
  // rule is about what the drawing PAINTS, and the comment explaining the rule
  // has to be able to name the colour it excludes.
  const schematic = read("../src/components/chain/DagSchematic.tsx")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/^\s*\/\/[^\n]*$/gm, "");
  assert.doesNotMatch(
    schematic,
    /teal/i,
    "the DAG drawing is protocol structure, not telemetry, so no part of it wears the live colour.",
  );

  // The same rule in the stylesheet: this figure's rules must not reach for
  // the live colour either. accent-teal is 44,224,206.
  const css = read("../src/app/globals.css").replace(/\/\*[\s\S]*?\*\//g, "");
  const block = css.slice(css.indexOf(".dag-figure"), css.indexOf("@keyframes dag-fill"));
  assert.ok(block.length > 400, "the dag rules must be findable");
  assert.doesNotMatch(block, /teal|44,\s*224,\s*206/i);

  // And it must stay still for anyone who asked for stillness: every resting
  // state is the finished state, so reduced motion sees a complete drawing.
  assert.match(block, /@media \(prefers-reduced-motion: no-preference\)/);
});

test("the schematic fits a phone without scrolling", () => {
  // This drawing used to be 960 units wide with a 40rem floor and a sideways
  // scroll region, because its smallest text rendered at 5.2px otherwise. The
  // 560-wide rewrite removed the need: on a 390px phone the SVG renders at
  // 358/560 = 0.64, and the smallest text in it is 20 viewBox units, so
  // nothing lands below 12.8px.
  //
  // THE AUTHORING RULE THIS IS REALLY DEFENDING: nothing under 20 viewBox
  // units may be text. Any string that cannot meet that belongs in HTML
  // beside the drawing, not inside it. Break that and the floor comes back.
  const src = read("../src/components/chain/DagSchematic.tsx");
  const svg = src.slice(src.indexOf("<svg"), src.indexOf("</svg>"));
  assert.doesNotMatch(svg, /min-w-\[/, "a floor width means the drawing no longer fits.");
  assert.doesNotMatch(src, /overflow-x-auto/);
  assert.doesNotMatch(src, /tabIndex/, "nothing in the figure is a scroll container any more.");
  assert.match(svg, /aria-hidden="true"/);
  assert.doesNotMatch(svg, /aria-label/, "the figure's one name lives on the sr-only span.");
});
test("the drawing is inside .viz and the fallback is outside it", () => {
  // Forced colours sets `.viz { display: none }`. This class used to sit on the
  // <figure>, so the stage list, the caption and the drawing all disappeared
  // together and nothing took their place. The house pattern is the drawing
  // wrapped in .viz with a .viz-fallback SIBLING holding the same records
  // (ArcGauge.tsx, ThroughputChart.tsx). The forced-colors test above only
  // checks that the class names appear in the CSS, never where `viz` sits in
  // the markup, which is why this assertion has to exist separately.
  const src = read("../src/components/chain/DagSchematic.tsx");
  const figureTag = src.slice(src.indexOf("<figure"), src.indexOf(">", src.indexOf("<figure")));
  assert.doesNotMatch(
    figureTag,
    /\bviz\b/,
    "viz on the <figure> hides the stage list and the caption along with the drawing.",
  );
  const wrapper = src.slice(
    src.indexOf('className="viz"'),
    src.indexOf("<svg"),
  );
  assert.match(wrapper, /\bviz\b/, "the drawing's wrapper is what forced colours should hide.");
  assert.ok(
    src.indexOf("viz-fallback") > src.indexOf("</svg>"),
    "the fallback must be a sibling AFTER the drawing, never nested inside it.",
  );
  // Same rule already pinned for ThroughputChart: table layout ignores the
  // sr-only width and widens the document, so clip a wrapper instead.
  assert.match(src, /<div className="viz-fallback sr-only" aria-hidden>\s*<table>/);
  assert.doesNotMatch(src, /<table className="viz-fallback/);
});

test("the drawing renders 1:1 on a desktop", () => {
  // Without a ceiling the figure stretches to about 1376px inside Section's
  // max-w-site, a 2.46x blow-up that renders a 1.6px hairline at 3.9px and
  // makes a schematic read as a banner. 35rem is exactly 560px, which is the
  // viewBox width, so the cap and the viewBox must always move together.
  // TWO drawings now, the graph and the order, side by side on a desktop.
  // Both are 560 units wide so they scale together and read as one figure;
  // 35rem is exactly 560px, so neither can be blown past 1:1. The caps and the
  // viewBox widths must always move together.
  const src = read("../src/components/chain/DagSchematic.tsx");
  const boxes = [...src.matchAll(/viewBox="0 0 (\d+) (\d+)"/g)].map((m) => m[0]);
  assert.deepEqual(boxes, ['viewBox="0 0 560 300"', 'viewBox="0 0 560 200"']);
  assert.equal((src.match(/max-w-\[35rem\]/g) ?? []).length, 2);
});

test("no drawn value wears the live truncation shape", () => {
  // BlockTicker prints REAL producer addresses a few hundred pixels below this
  // figure, as 0x1f4a…9c2e: head, ellipsis, tail. That form can be pasted into
  // an explorer. Every value in the drawing is head-only, so no string in it
  // can be matched against anything. This is one keystroke from being lost to
  // a well-meaning edit that makes a hash "look more real".
  const site = read("../src/lib/content/site.ts");
  // Comment-stripped: the fixture's own comment quotes the live form in order
  // to say why the drawing does not use it, and an assertion that trips on the
  // explanation of the rule is an assertion that cannot describe its rule.
  const shape = site
    .slice(site.indexOf("  shape: {"), site.indexOf("  readout: {"))
    .replace(/\/\*[\s\S]*?\*\//g, "");
  assert.doesNotMatch(
    shape,
    /0x[0-9a-fA-F]+…[0-9a-fA-F]/,
    "head-and-tail truncation is the live table's form; the schematic must not borrow it.",
  );
  // And the drawing owns no values of its own: one array feeds the cards, the
  // ordered rows and the forced-colours table, so the three cannot disagree.
  const src = read("../src/components/chain/DagSchematic.tsx")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
  assert.doesNotMatch(src, /0x[0-9a-fA-F]/, "every drawn value comes from CHAIN_PAGE.shape.diagram.");
});

test("the schematic declares its values as examples before it shows one", () => {
  // The banner is the one tell that survives the figure being screenshotted
  // and pasted somewhere without its caption. It must be the FIRST text in the
  // drawing, in DOM order, so it is met before any hash.
  const site = read("../src/lib/content/site.ts");
  const shape = site
    .slice(site.indexOf("  shape: {"), site.indexOf("  readout: {"))
    .replace(/\/\*[\s\S]*?\*\//g, "");
  assert.match(shape, /exampleLabel: "SCHEMATIC, NOT LIVE DATA"/);
  assert.match(
    shape,
    /label:\s*\n?\s*"Schematic drawn with example letters\./,
    "the figure's one accessible name must open with the caveat, not end with it.",
  );

  // The banner is the tell that survives the figure being screenshotted
  // without its caption, so it has to be met before any drawn value. Asserted
  // over the whole component rather than over one <svg>, because the drawing
  // is two SVGs now and the banner belongs to the first of them.
  const src = read("../src/components/chain/DagSchematic.tsx");
  const banner = src.indexOf("diagram.exampleLabel");
  const firstValue = src.indexOf("{blocks[0].id}");
  assert.ok(banner > -1 && firstValue > -1);
  assert.ok(banner < firstValue, "the banner must be the first text in the drawing.");

  // The drawing prints NO hash-shaped string at all, which is a stronger
  // guarantee than the rhyme scheme and head-only truncation it replaced. The
  // blocks are the letters A to E and the order is the digits 1 to 4, so
  // nothing here can be pasted into an explorer, matched against anything, or
  // mistaken for the head-and-tail producer addresses the live table prints a
  // few hundred pixels below.
  assert.doesNotMatch(shape, /0x/, "the drawing prints no values at all.");
  assert.equal(
    (shape.match(/\{ id: "/g) ?? []).length,
    5,
    "five blocks, one array, feeding the circles, the slots and the table.",
  );

  // Nothing carrying a unit: those are the columns the live table prints, and
  // a purple copy of one of them sitting above the live band is the whole
  // misreading this figure exists to avoid.
  const diagram = shape.slice(shape.indexOf("    diagram: {"));
  assert.doesNotMatch(diagram, /\btx\b|\bgas\b|\bgwei\b/i);
});

test("the schematic uses the AA text token, not the border token", () => {
  // globals.css retires #6E6385 (`outline`) for text and names
  // --on-surface-muted as the same register at AA. Small SVG text is exactly
  // the case that comment was written for.
  const css = read("../src/app/globals.css").replace(/\/\*[\s\S]*?\*\//g, "");
  const block = css.slice(css.indexOf(".dag-figure"), css.indexOf("@keyframes dag-fill"));
  assert.doesNotMatch(block, /#6e6385/i);
});

test("nothing in the schematic rests hidden, and the loop stays small", () => {
  // The reduced-motion guarantee is structural: every resting state IS the
  // finished state. That regresses silently, because the page still looks
  // right to everyone who has not asked for less motion. So: every declaration
  // that can hide something must sit inside the no-preference block.
  const css = read("../src/app/globals.css").replace(/\/\*[\s\S]*?\*\//g, "");
  const block = css.slice(css.indexOf(".dag-figure"), css.indexOf("@keyframes dag-fill"));
  const guard = block.indexOf("@media (prefers-reduced-motion: no-preference)");
  assert.ok(guard > -1);
  for (const pattern of [/stroke-dasharray/g, /opacity:\s*0\b/g, /translateX/g]) {
    for (const m of block.matchAll(pattern)) {
      assert.ok(
        m.index > guard,
        `"${m[0]}" sits outside the reduced-motion guard, so the drawing would rest incomplete.`,
      );
    }
  }
  // One loop, on the machine. The previous figure had seven infinite
  // animations, three of them marks travelling toward the engine. A second
  // `infinite` appearing here is the signal that a travelling mark has crept
  // back onto a lane above a band of live numerals.
  assert.equal(
    (block.match(/\binfinite\b/g) ?? []).length,
    1,
    "only the engine's fill may repeat.",
  );
});


test("the walkthrough can be stopped, and its captions never leave the page", () => {
  // Two independent things are pinned here and both regress silently.
  //
  // ONE: the run is about twenty-nine seconds, so WCAG 2.2.2 requires a way to
  // stop it. Focus entering the figure must stop it permanently, because a
  // keyboard user who has just arrived must never have content move under
  // them.
  //
  // TWO, and this is the one the next person to touch this file will
  // simplify away: all six captions stay in the DOM and in the accessibility
  // tree, sharing one grid cell, with only opacity changing. That is what lets
  // a screen reader read the whole lesson once, in order, with no
  // announcements, and what lets a reduced-motion reader see a plain numbered
  // list. Collapsing it into `{active && <p>}` would remove five sixths of the
  // teaching from every screen reader and the page would still look perfect.
  const src = read("../src/components/chain/DagSchematic.tsx");
  assert.match(src, /^"use client";/);
  // An EXPLICIT comparison against false, in either direction. The rule is
  // that it may never be a truthiness check. Motion can resolve the media
  // query synchronously on the first browser render, while the server has no
  // media query. The separate hydration snapshot keeps both renders in still
  // mode before progressively enhancing the figure.
  assert.match(src, /useSyncExternalStore/);
  assert.match(src, /const hydrated = useSyncExternalStore\(/);
  assert.match(src, /const walking = hydrated && reduced === false/);
  assert.match(src, /reduced (?:===|!==) false/);
  assert.doesNotMatch(src, /if \(reduced\)|!reduced\b/);
  assert.match(src, /onFocusCapture/, "focus into the figure must stop the advance.");
  assert.match(src, /aria-live=\{running \? "off" : "polite"\}/);
  assert.equal(
    (src.match(/aria-live/g) ?? []).length,
    1,
    "one live region, on the step counter, never on the captions.",
  );
  assert.doesNotMatch(
    src,
    /role="tablist"|role="tab"|aria-selected/,
    "the transport is not a second copy of the primer's segmented selector.",
  );
  assert.match(src, /diagram\.pauseLabel/);
  assert.match(src, /diagram\.playLabel/);

  const css = read("../src/app/globals.css").replace(/\/\*[\s\S]*?\*\//g, "");
  const block = css.slice(css.indexOf(".dag-figure"), css.indexOf("@keyframes dag-fill"));
  assert.doesNotMatch(
    block,
    /\.dag-caption-list\s*\{[^}]*display:\s*none/,
    "all six captions stay in the accessibility tree; only opacity changes.",
  );
  // The caption stack rests as a real list, so stillness is a complete lesson.
  assert.match(block, /\.dag-caption-list\s*\{\s*display:\s*flex/);
});

test("a printed page gets every caption, not the one that happened to be lit", () => {
  // @media print does not match prefers-reduced-motion, so the caption stack
  // is live while printing and a printed page would otherwise catch one beat
  // of six. The reduced-motion reader is safe by construction; the printing
  // one is not, and nothing else in the suite would notice.
  const css = read("../src/app/globals.css");
  const print = css.match(/@media print \{[\s\S]*?\n\}/)?.[0] ?? "";
  assert.ok(print.length > 0, "the print block must be findable");
  assert.match(print, /\.dag-caption-list/);
  assert.match(print, /\.dag-caption\s*\{[^}]*opacity:\s*1\s*!important/);
  assert.match(print, /\.dag-transport\s*\{[^}]*display:\s*none/);
});
test("the page says each thing once", () => {
  // Every one of these shipped TWICE — the same argument, often the same
  // sentence, in two places several screens apart. Each now lives in the one
  // spot closest to the thing it qualifies, and the twin is gone. A reader
  // who is told the same caveat four times stops reading the caveats.
  const once = (re, label) => {
    const hits = block.match(re) ?? [];
    assert.equal(hits.length, 1, `${label} must appear exactly once in CHAIN_PAGE (found ${hits.length}).`);
  };

  // The hash/receipt distinction: was a pull quote AND a card.
  // The hash-is-not-a-receipt argument went with the boundary rail.
  // The no-hashrate disclosure: was pow.body[1] AND a boundary item. pow's
  // copy is now the ONLY statement of it, so it must not be shortened.
  once(/difficulty carries no usable information/g, "the no-hashrate disclosure");
  assert.match(block, /Anyone quoting a BlockDAG hashrate is not reading it off this chain/);
  // The schematic caveat's REASON is gone from the site entirely, so there is
  // nothing left to count. Removed rather than relaxed to zero, because an
  // assertion that something appears zero times is not this test's job.
  // "a producer address is not a miner": was ticker.note, pow.body[0] AND a
  // boundary item. Two of those are inline where producers are counted.
  assert.equal(
    (block.match(/one address can (sit in front of|stand for)/gi) ?? []).length,
    1,
    "the producer-is-not-a-miner caveat lives once, under the producer bars",
  );
  // Gas paid in BDAG: was evm.body[1] AND an honestly card.
  once(/token balance alone is not enough to transact/g, "the gas-is-paid-in-BDAG note");
});

test("the Gwei readings are gone, and nothing re-derives them", () => {
  // The owner asked for these out: a gas price in Gwei beside a base fee in
  // wei, two unit systems in one row, on a page whose reader met the word
  // "DAG" four screens earlier. `block` is already checked for /Gwei/ by the
  // no-baked-figures test; this pins the RENDERING side.
  const live = read("../src/components/chain/ChainLive.tsx");
  const page = read("../src/app/(public)/chain/page.tsx");
  assert.doesNotMatch(live, /Gwei/i, "no Gwei formatting survives in ChainLive");
  assert.doesNotMatch(live, /ChainEvmReadings/, "the readings component is gone");
  assert.doesNotMatch(page, /ChainEvmReadings/, "and the page no longer renders it");
  assert.doesNotMatch(live, /eth_gasPrice|eth_syncing/, "and neither method is surfaced");

  // The batch itself must NOT be trimmed: /api/stats addresses its responses
  // by index, so dropping a method silently re-points every later reading.
  const stats = read("../src/lib/chain/stats.ts");
  assert.match(stats, /eth_gasPrice/, "the RPC batch keeps its shape");
  assert.match(stats, /eth_syncing/, "the RPC batch keeps its shape");
});



test("the ticker never changes height when it refreshes", () => {
  // Comment-stripped: the comment explaining WHY each of these is gone has to
  // be able to name the thing it removed.
  const ticker = read("../src/components/chain/BlockTicker.tsx")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/^\s*\/\/[^\n]*$/gm, "");

  // Blocks land about once a second and the poll is every twelve, so EVERY
  // visible row is replaced on every update. <AnimatePresence> kept all eight
  // outgoing rows mounted while all eight replacements entered, so the tbody
  // briefly held sixteen: measured at 365px -> 693px -> 365px, a section that
  // doubled and snapped back every twelve seconds.
  assert.doesNotMatch(ticker, /AnimatePresence/, "exiting rows must not stay in flow");
  assert.doesNotMatch(ticker, /\bexit=/, "and nothing may animate on the way out");

  // A transform on a <tr> fights the table's own layout algorithm. `layout`
  // and `y` are both transforms, which is where the wobble came from.
  assert.doesNotMatch(ticker, /^\s*layout\b/m, "no layout projection on table rows");
  assert.doesNotMatch(ticker, /\by:\s*-?\d/, "no y offset on table rows");

  // Opacity would blank the very numbers the refresh is delivering, and with a
  // full turnover that means the whole table dips to nothing twice a minute.
  assert.doesNotMatch(ticker, /opacity:\s*0\b/, "rows must not fade their content");

  // What IS animated: a background sweep that decays to nothing, staggered by
  // row, over a table whose row count is fixed.
  assert.match(ticker, /backgroundColor/);
  assert.match(ticker, /delay: index \* SWEEP_STEP_S/);

  // The static marker is the load-bearing one — it is all a reduced-motion or
  // forced-colours reader ever sees, so it must not become the flash's job.
  assert.match(ticker, /border-l-accent-teal/);
  assert.match(ticker, /if \(reduced\) return <tr/);
});


test("the fork card has one rendering, and /chain does not list the endpoints twice", () => {
  const warning = read("../src/components/home/ExchangeWarning.tsx");
  const page = read("../src/app/(public)/chain/page.tsx");

  // The compact variant existed to work around a duplicate: it dropped the
  // endpoint list because /chain's Connect section listed the same values a
  // few hundred pixels above it. Both are gone. A card that renders one way
  // cannot drift between pages, which is the failure this component was
  // extracted to fix in the first place.
  assert.doesNotMatch(warning, /ExchangeWarningVariant/);
  assert.doesNotMatch(warning, /\bisFull\b/);
  // The precise claim: the component takes NO props at all. A looser regex
  // here trips on `text-on-surface-variant` and on the Button's own
  // variant="ghost", neither of which is this card having a mode.
  assert.match(
    warning,
    /export function ExchangeWarning\(\) \{/,
    "the card takes no props, so it cannot render two ways",
  );
  assert.match(page, /<ExchangeWarning \/>/);
  // Scoped to THIS card: NodesPanel and Button legitimately take a variant.
  assert.doesNotMatch(
    page,
    /<ExchangeWarning\s+[^/>]/,
    "the fork card must be rendered with no props",
  );

  // Connect keeps the paste-once snippet and the liveness hairline. It must
  // NOT re-list the values the card now carries.
  assert.match(page, /<CopySnippet/);
  assert.match(page, /<ConnectPulse \/>/);
  assert.doesNotMatch(page, /<CopyRef/, "the labelled values live on the fork card now");
  assert.doesNotMatch(page, /CHAIN\.rpcUrl|CHAIN\.explorerUrl|CHAIN\.chainIdHex/);

  // ConnectPulse must stay on the page rather than migrate into the shared
  // card: it reads the snapshot, and only ChainReadout.tsx may touch the poll.
  const pulse = read("../src/components/chain/ConnectPulse.tsx");
  assert.match(
    pulse,
    /from "@\/components\/chain\/ChainReadout"/,
    "ConnectPulse reads the page's one store, so it cannot move into a shared component",
  );
  assert.doesNotMatch(warning, /useChain|ConnectPulse/);
});

test("removing Timing kept the reason the interval needs a long window", () => {
  // The Timing section is gone: the interval numeral reads in the live band
  // above, labelled with the window it was measured over, and the owner judged
  // a whole section explaining it to be more than the page needed.
  //
  // What could not go with it is WHY that window has to be a million blocks.
  // Timestamps on this chain are whole seconds while blocks arrive faster than
  // that, so an interval cannot be read from two consecutive blocks. Without
  // that sentence somewhere, "measured over 1,000,000 blocks" under the
  // numeral reads as an arbitrary choice rather than a necessary one. It moved
  // to the boundary rail, which is the section for exactly this.
  const page = read("../src/app/(public)/chain/page.tsx");
  assert.doesNotMatch(page, /<ChainIntervalStrip \/>/, "the strip left with its section.");
  assert.doesNotMatch(page, /id="interval"/);

  // The explanation of WHY that window has to be long moved to the boundary
  // rail when Timing was removed, and then went with the rail. The numeral
  // still states its own window ("measured over 1,000,000 blocks"), which is
  // the disclosure; what is gone is the reason the window has to be that big.
  const site = read("../src/lib/content/site.ts");

  // The two "measuring" strings gate on different things and must stay
  // separate: TPS waits a minute, the since-boot interval waits a thousand
  // blocks. One string for both was wrong about one of them.
  assert.match(site, /measuringTps: "measuring: needs about a minute of blocks"/);
  assert.match(site, /measuring: "measuring: needs a few thousand blocks"/);
  const readout = read("../src/components/chain/ChainReadout.tsx");
  assert.match(readout, /CHAIN_PAGE\.interval\.measuringTps/);
});

test("the node board credits the community member who aggregated the RPC list", () => {
  const site = read("../src/lib/content/site.ts");
  const page = read("../src/app/(public)/chain/page.tsx");
  // The handle is spelled the way they spell it, straight apostrophe.
  assert.match(site, /credit: "Credit to community member odin's-explorer/);
  assert.match(page, /CHAIN_PAGE\.nodes\.credit/);
});
