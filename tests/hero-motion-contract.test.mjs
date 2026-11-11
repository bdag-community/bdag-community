import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";

const read = (rel) => readFileSync(new URL(rel, import.meta.url), "utf8");
const code = (src) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

const dagField = code(read("../src/components/home/DagField.tsx"));
const spine = code(read("../src/components/spine/Spine.tsx"));
const bus = code(read("../src/lib/spine/bus.ts"));
const hero = read("../src/components/home/Hero.tsx");

const arrowBody = (source, name) =>
  source.match(
    new RegExp(`const ${name} = \\([^)]*\\) => \\{[\\s\\S]*?\\n    \\};`),
  )?.[0] ?? "";

test("hero convergence releases the outside first, then travels into the node", () => {
  const buildOrder = arrowBody(dagField, "buildOrder");
  assert.ok(buildOrder, "buildOrder must remain a focused ordering step");
  assert.match(
    buildOrder,
    /\.sort\(\(a, b\) => b\.d - a\.d\)/,
    "clusters farthest from the hero node must release first",
  );
  assert.match(
    buildOrder,
    /pathIntoNode\(c,\s*tx,\s*ty\)\.length\s*>=\s*2/,
    "the completion denominator must exclude chains with no inward path",
  );

  const release = arrowBody(dagField, "releaseConverge");
  assert.ok(release, "releaseConverge must remain a focused path step");
  assert.match(release, /pathIntoNode\(c,\s*tx,\s*ty\)/);
  assert.match(dagField, /path\.reverse\(\)/, "a bolt starts at its chain root");
  assert.match(
    release,
    /to:\s*\{\s*x:\s*tx,\s*y:\s*ty\s*\}/,
    "the virtual final node remains the hero node",
  );
  assert.ok(
    release.indexOf("path.reverse()") < release.indexOf("to: { x: tx, y: ty }"),
    "the chain path must resolve before the final hop into the node",
  );
});

test("the start node becomes live only after the full outside-in queue lands", () => {
  assert.match(
    dagField,
    /dagBus\.live\s*=\s*convergeIdx\s*>=\s*convergeOrder\.length[\s\S]{0,180}arrivals\s*>=\s*released/,
    "a temporary lull after one scroll must not ignite a partially charged node",
  );
});

test("the glass fill records monotonic progress across the complete queue", () => {
  assert.match(bus, /total:\s*number/);
  assert.match(dagField, /dagBus\.total\s*=\s*convergeOrder\.length/);
  assert.match(
    spine,
    /dagBus\.arrivals\s*\/\s*Math\.max\(1,\s*dagBus\.total\)/,
    "a temporary arrivals/released ratio of one must not visually complete the node",
  );
});

test("the hero exposes a compact-height content hook", () => {
  assert.match(hero, /<Section className="[^"]*\bhero-content\b/);
});

test("narrow screens derive the field and node from the same lower anchor", () => {
  assert.match(bus, /NODE_FY_NARROW:\s*0\.925/);
  assert.match(bus, /NARROW_MAX:\s*768/);
  assert.match(dagField, /nodeFyFor\(width\)/);
  assert.match(hero, /hero-node-bloom/);
});

test("the hero spark is driven only by the node becoming live", () => {
  const endHold = arrowBody(spine, "endHold");
  assert.ok(endHold, "endHold must remain a focused release step");
  assert.doesNotMatch(
    endHold,
    /\bdischarge\(\)/,
    "gesture payoff is not proof that the node actually filled",
  );
  assert.match(
    spine,
    /dagBus\.live === 1 && lastLive === 0[\s\S]{0,220}\bdischarge\(\)/,
    "every live edge must fire the existing hero discharge",
  );
  assert.equal(
    [...spine.matchAll(/\bdischarge\(\)/g)].length,
    1,
    "the live edge is the discharge's single trigger",
  );
  assert.match(
    spine,
    /dagBus\.released > dagBus\.arrivals/,
    "the spine loop must stay awake until an unheld fill can reach its live edge",
  );
});

test("only a visibly filled live node may start the smooth handoff", () => {
  assert.match(bus, /FILL_READY:\s*0\.99\d*/);
  assert.match(bus, /GLIDE_MS:\s*\d+/);
  assert.match(
    spine,
    /const completionReady\s*=[\s\S]{0,320}dagBus\.live === 1[\s\S]{0,180}fill >= LOCK\.FILL_READY[\s\S]{0,180}now - holdLiveAt >= LOCK\.DISCHARGE_MS/,
    "live state, visible fill, and the completed discharge must all gate the handoff",
  );
  assert.match(
    spine,
    /if \(completionReady\) \{[\s\S]{0,100}endHold\(true\)/,
    "the successful payoff is the only normal path into the glide",
  );
  assert.match(spine, /window\.scrollTo\([\s\S]{0,140}glideEase\(glideT\)/);
  for (const escape of ["LOCK.MAX_MS", "dy <= 0", "onHoldKey"]) {
    assert.ok(spine.includes(escape), `${escape} must remain an escape`);
  }
  assert.match(
    spine,
    /now - holdStart > LOCK\.MAX_MS[\s\S]{0,120}endHold\(false\)/,
    "the hard safety cap releases control without pretending the node completed",
  );

  const dischargeMs = Number(bus.match(/DISCHARGE_MS:\s*(\d+)/)?.[1]);
  const maxMs = Number(bus.match(/MAX_MS:\s*(\d+)/)?.[1]);
  assert.ok(dischargeMs > 0 && dischargeMs < maxMs, "the dwell stays below the hard cap");
  assert.ok(maxMs >= 5000, "the slowest verified desktop fill gets a safe completion margin");
  assert.doesNotMatch(
    bus,
    /\b(clientX|clientY|scrollY|getBoundingClientRect)\b/,
    "responsive motion must not put coordinates on the scalar bus",
  );
});

test("partial pauses and large downward deltas keep charging instead of bypassing fill", () => {
  assert.doesNotMatch(
    spine,
    /LOCK\.IMPATIENT_PX/,
    "a fast downward fling is input toward completion, not an escape from it",
  );
  assert.match(
    spine,
    /holdTravel\s*=\s*Math\.min\(LOCK\.SPAN,\s*holdTravel \+ dy\)/,
    "large deltas clamp at full charge instead of opening an early-release path",
  );
  const idle = spine.match(
    /!holdFullAt[\s\S]{0,140}now - holdSeenAt > LOCK\.IDLE_MS[\s\S]{0,180}/,
  )?.[0] ?? "";
  assert.match(idle, /holdStart = 0/);
  assert.doesNotMatch(
    idle,
    /endHold/,
    "a pause resets only the active-burst clock; the next down gesture continues the fill",
  );
});

test("crossing the offscreen hero threshold performs one complete cycle reset", () => {
  assert.match(bus, /RESET_AT_HERO:\s*0\.\d+/);
  const resetAt = Number(bus.match(/RESET_AT_HERO:\s*(0\.\d+)/)?.[1]);
  const narrowNode = Number(bus.match(/NODE_FY_NARROW:\s*(0\.\d+)/)?.[1]);
  assert.ok(resetAt > narrowNode, "the narrow node must be offscreen before reset");
  assert.match(
    spine,
    /holdPhase === "done"[\s\S]{0,180}!openingReset[\s\S]{0,180}y >= heroH \* LOCK\.RESET_AT_HERO[\s\S]{0,100}resetOpening\(\)/,
    "the reset is tied to physical hero progress, not an unrelated viewport fraction",
  );
  const reset = arrowBody(spine, "resetOpening");
  assert.ok(reset, "resetOpening must centralise the replay boundary");
  for (const state of [
    "openingReset = true",
    "chargeFloor = 0",
    "floorUntil = 0",
    "chargeS = 0",
    "fill = 0",
    "flash = 0",
    "dagBus.epoch++",
  ]) {
    assert.ok(reset.includes(state), `resetOpening must clear ${state}`);
  }
  assert.match(reset, /delete heroEl\.dataset\.discharge/);
  assert.doesNotMatch(spine, /y > vh \* 0\.5/, "the old visible-node threshold is gone");
});
