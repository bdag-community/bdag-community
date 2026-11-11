import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";

// Guards for the site-wide DAG spine. The spine is decoration that spans every
// public page and sits UNDER all content, so its failure modes are silent:
// a stacking-context change occludes text, a lost aria-hidden pollutes the
// a11y tree, a missing index guard throws inside a rAF and kills the hero
// field permanently. These assert the contracts that keep it invisible when
// it should be and harmless when it is not.

const read = (rel) => readFileSync(new URL(rel, import.meta.url), "utf8");

/** Assertions about what the CODE does must not trip over prose in comments. */
const code = (src) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
/** The same for CSS, where a commented-out RULE reads exactly like a live one
 *  and would otherwise satisfy an assertion while painting nothing. */
const css = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "");

const spine = read("../src/components/spine/Spine.tsx");
const ornament = read("../src/components/spine/SpineOrnament.tsx");
const heroNode = read("../src/components/home/HeroNode.tsx");
const hero = read("../src/components/home/Hero.tsx");
const dagField = read("../src/components/home/DagField.tsx");
const bus = read("../src/lib/spine/bus.ts");
const geometry = read("../src/lib/spine/geometry.ts");
const layout = read("../src/app/(public)/layout.tsx");
const homePage = read("../src/app/(public)/page.tsx");
const globals = read("../src/app/globals.css");
const config = read("../tailwind.config.ts");
const newsPreview = read("../src/components/home/NewsPreview.tsx");

test("the spine is decoration: hidden from a11y, unclickable, under content", () => {
  assert.match(spine, /aria-hidden/, "the spine root must be aria-hidden");
  assert.match(globals, /\.spine\s*\{[^}]*pointer-events:\s*none/);
  // Exactly -1, not -10: body::before is also -1 and equal z-index breaks
  // ties by tree order, so the spine paints above the wash and below content.
  assert.match(globals, /\.spine\s*\{[^}]*z-index:\s*-1;/);
});

test("the spine's wrapper never creates a stacking context", () => {
  // The spine is mounted by HOME, not the layout: it is the hero's chain
  // continued, and six pages with no hero were paying 295 hydrated elements
  // and ~25 KB of JS for a line that described nothing. The wrapper still
  // lives in the layout, because that is what `.spine { inset: 0 }` resolves
  // against, and it still has to stay bare.
  assert.match(homePage, /<Spine \/>/, "home must render the spine");
  assert.doesNotMatch(layout, /<Spine/, "no other route may mount it");
  const wrapper = layout.match(/<div className="([^"]*)">\s*<main/)?.[1];
  assert.equal(
    wrapper,
    "relative",
    "the spine wrapper must be exactly `relative` — isolate/transform/filter/contain/overflow would trap z-index:-1 above the ambient wash",
  );
});

test("the hero scroll cue is now a block, and still a real link", () => {
  assert.doesNotMatch(hero, /animate-scroll-cue/, "the mouse-pill cue is gone");
  assert.match(hero, /<HeroNode \/>/);
  assert.match(hero, /data-spine-hero/, "the spine locates the hero by this");
  // The cue's name and its target both come from HERO.scrollCue now. They used
  // to share ctaSecondary.href, which was harmless while "The Chain" was only
  // the #network band; ctaSecondary now leads to /chain, and an element whose
  // accessible name is "Scroll to explore" must not leave the page.
  assert.match(heroNode, /aria-label=\{HERO\.scrollCue\.label\}/);
  assert.match(heroNode, /focus-visible:ring-accent/, "keyboard focus stays visible");
  assert.match(heroNode, /HERO\.scrollCue\.href/, "copy still comes from site.ts");
});

test("the retired scroll-cue animation is gone from the token layer", () => {
  assert.doesNotMatch(config, /scroll-cue/);
});

test("the hero block stays hollow — a filled ring is a mined block", () => {
  assert.match(heroNode, /className="hero-ring"/);
  assert.match(heroNode, /fill="none"/, "the ring must never be filled");
  // The arc fills by stroke-dashoffset.
  assert.match(globals, /\.hero-arc\s*\{[^}]*stroke-dashoffset/);

  // The teal centre dot is gone from BOTH home nodes — it read as a stray
  // point sitting on top of the mark rather than as a state. Live is still
  // expressed, by the energy wash, the completion halo and the output port,
  // so removing the dot removed a duplicate signal and not the signal.
  assert.doesNotMatch(globals, /\.hero-core\b/);
  assert.doesNotMatch(globals, /\.hub-core\b/);
  assert.doesNotMatch(heroNode, /hero-core/);
  assert.doesNotMatch(read("../src/components/home/ParticipationNode.tsx"), /hub-core/);
  assert.ok(
    (globals.match(/var\(--hero-live/g) ?? []).length >= 3,
    "live must still drive the energy wash, the halo and the output port",
  );
});

test("the chain ends by stopping, not with a spark over the legal close", () => {
  // The terminus was a pinging teal dot parked where the route ends — which is
  // directly above the non-affiliation banner, the one block on the page that
  // should read as quiet. Removed entirely: markup, styles and the ignition
  // bookkeeping, so nothing is left toggling a class on an element that is
  // not there.
  assert.doesNotMatch(ornament, /spine-terminus/);
  assert.doesNotMatch(css(globals), /\.spine-terminus/);
  assert.doesNotMatch(code(spine), /terminusEl|terminusOn/);
  // The arrival signal that remains is the last framed section lighting its
  // own border, which is `complete` in the geometry.
  assert.match(geometry, /complete/);
});

test("the bus is the only channel, and it carries no coordinates", () => {
  assert.match(bus, /NODE_FY:\s*0\.7/);
  assert.match(bus, /MAX:\s*30/);
  assert.doesNotMatch(
    code(bus),
    /\b(clientX|clientY|scrollY|getBoundingClientRect)\b/,
    "no coordinate ever crosses the bus — both sides derive from NODE_FY",
  );
});

test("the field aims at the hero block, not at the old focal point", () => {
  assert.match(dagField, /height \* nodeFyFor\(width\)/);
  assert.match(dagField, /CONVERGE\.NODE_FY_NARROW/);
  assert.doesNotMatch(dagField, /height \* 0\.8 - by/);
});

test("the convergence bolt's virtual final node cannot throw in the rAF", () => {
  // A converge bolt hops free space into the hero block, so its head index
  // runs one past `path`. An unguarded rings[path[length]].energy throws
  // inside requestAnimationFrame and kills the hero field permanently.
  assert.match(dagField, /head\.i < pl\.path\.length/);
  const steppers = dagField.match(/const stepPulse\s*=/g) ?? [];
  assert.equal(
    steppers.length,
    1,
    "one stepper serves both ambient and converge bolts — two copies diverge on the first tune",
  );
  assert.match(dagField, /converge = converge\.filter\(/);
});

test("the spine never pulls React's scroll hooks into the frame path", () => {
  for (const [name, src] of [
    ["Spine.tsx", spine],
    ["SpineOrnament.tsx", ornament],
  ]) {
    assert.doesNotMatch(
      src,
      /from "motion\/react"/,
      `${name} must use motion's frame scheduler, not React motion hooks`,
    );
  }
  assert.match(spine, /from "motion"/);
  assert.match(spine, /cancelFrame/, "the loop must be stoppable when idle");
});

test("reduced motion and forced colours are handled explicitly", () => {
  assert.match(spine, /prefers-reduced-motion: reduce/);
  const forced = globals.match(/@media \(forced-colors: active\) \{[\s\S]*?\n\}/)?.[0] ?? "";
  assert.match(forced, /display:\s*none/);
  // Both layers, not just the overlay: the card's frame lives inside the card
  // so it can paint above its fill, which puts it outside .spine's reach.
  assert.match(forced, /\.spine\b/);
  assert.match(forced, /\.spine-frame\b/);
});

test("every spine custom property is read with a fallback", () => {
  // The overlay must render a sane resting frame even if the writer never
  // starts (JS disabled, effect throws, chunk fails).
  const bare = globals.match(/var\(--(?:sp|hero|seg|lead)-[a-z-]+\)/g) ?? [];
  assert.deepEqual(
    bare,
    [],
    `these custom properties are read without a fallback: ${bare.join(", ")}`,
  );
});

test("the rail geometry is pure and DOM-free so it cannot drift", () => {
  assert.doesNotMatch(
    code(geometry),
    /\b(document|window|getBoundingClientRect)\b/,
    "geometry.ts must stay DOM-free",
  );
  assert.doesNotMatch(geometry, /^import /m, "geometry.ts must stay import-free");
  assert.match(geometry, /RAIL_INSET_WIDE = 13/);
  assert.match(geometry, /SITE_MAX = 1440/);
  // The CSS must compute the identical rail x, or the SVG ornament and the
  // DOM trunk would separate at wide viewports.
  assert.match(globals, /--rail-x: calc\(max\(0px, \(100% - 1440px\) \/ 2\) \+ 13px\)/);
});

/** The body of a named function declaration inside the spine's effect. */
const fnBody = (name) =>
  spine.match(new RegExp(`function ${name}\\([^)]*\\) \\{[\\s\\S]*?\\n    \\}`))?.[0] ??
  spine.match(new RegExp(`const ${name} = \\([^)]*\\) => \\{[\\s\\S]*?\\n    \\};`))?.[0];

test("the opening hold has a way out for every input that could be trapped", () => {
  const arm = fnBody("armHold");
  assert.ok(arm, "armHold must exist");
  assert.match(arm, /dagBus\.reduced/, "never arms under reduced motion");
  assert.match(arm, /window\.scrollY > 2/, "never arms below the top of the page");
  assert.match(arm, /location\.hash/, "never arms on a deep link");

  // The single most important property: a keyboard scroll key does exactly
  // what it always does. Preventing one here would be a genuine scroll trap.
  const key = fnBody("onHoldKey");
  assert.ok(key, "onHoldKey must exist");
  assert.doesNotMatch(
    key,
    /preventDefault/,
    "keyboard scrolling must pass through untouched — the hold gets out of ITS way",
  );
  for (const k of ["PageDown", "End", "Home", "ArrowDown", "Tab", '" "']) {
    assert.ok(
      spine.includes(k),
      `${k} must end the hold`,
    );
  }
  // An upward gesture, a scroll from anywhere else, and wall-clock time.
  assert.match(fnBody("onWheel"), /dy <= 0[\s\S]*?endHold\(false\)/);
  assert.match(code(spine), /y > 4[\s\S]{0,220}endHold\(false\)/);
  assert.match(code(spine), /LOCK\.MAX_MS/);
  // A gesture gap is not completion. It pauses the active-burst clock while
  // preserving progress, so a second gesture cannot slip past a half-full node.
  assert.match(code(spine), /LOCK\.IDLE_MS[\s\S]{0,200}holdStart = 0/);
  assert.doesNotMatch(code(spine), /LOCK\.IMPATIENT_PX/);
  // Letting go must never snap the charge to zero — that drops every bolt in
  // flight on one frame, which reads as the field breaking, not releasing.
  assert.match(code(spine), /chargeFloor = expStep\(chargeFloor, 0, dt, LOCK\.TAU_FLOOR\)/);
});

test("the hold never keeps the browser's fast scroll path hostage", () => {
  // A permanent non-passive wheel listener costs every scroll on every page.
  // It may exist only while the hold is armed, and must be torn down with it.
  const passives = [...code(spine).matchAll(/passive: false/g)];
  assert.equal(passives.length, 2, "only the wheel and touchmove holds");
  const detach = fnBody("detachHold");
  for (const ev of ["wheel", "touchstart", "touchmove", "keydown"]) {
    assert.match(detach, new RegExp(`removeEventListener\\("${ev}"`));
  }
  assert.match(fnBody("endGlide"), /detachHold\(\)/);
  assert.match(code(spine), /return \(\) => \{[\s\S]*?endGlide\(\)/, "unmount tears it down");
});

test("a completed opening glides smoothly, remains cancellable, and restores browser scroll", () => {
  assert.match(code(spine), /window\.scrollTo/);
  assert.match(code(spine), /glideEase\(glideT\)/);
  assert.match(code(bus), /GLIDE_MS/);
  assert.match(code(geometry), /glideEase/);
  assert.match(fnBody("endGlide"), /removeProperty\("scroll-behavior"\)/);
  // Positive momentum is absorbed while the bounded glide owns the handoff;
  // a deliberate reversal immediately returns control to the reader.
  const wheel = fnBody("onWheel");
  assert.match(
    wheel,
    /holdPhase === "done"[\s\S]{0,180}dy < 0[\s\S]{0,80}endGlide\(\)[\s\S]{0,120}preventDefault/,
    "the glide absorbs only continued downward momentum",
  );
  // The rAF loop is where the hold normally ends — and it is the ONE thing
  // that can stop running (hidden tab, long task, dropped frame). The
  // listeners are still live, so the wall-clock cap is checked in them too,
  // BEFORE preventDefault: a page that will not scroll is unrecoverable.
  for (const fn of ["onWheel", "onTouchMove"]) {
    const body = fnBody(fn);
    const cap = body.indexOf("LOCK.MAX_MS + LOCK.STARVE_GRACE");
    const pd = body.indexOf("e.preventDefault()", cap);
    assert.ok(cap !== -1, `${fn} must not rely on the loop alone to end the hold`);
    assert.ok(cap < pd, `${fn} must check the cap BEFORE swallowing the gesture`);
  }
  // …and STRICTLY later than the loop's own cap. On the same deadline the
  // backstop races the loop and can turn a hold that earned its payoff into
  // one that did not — the reader holds to the very end and gets nothing.
  const grace = Number(bus.match(/STARVE_GRACE: (\d+)/)?.[1]);
  assert.ok(grace > 0, "the backstop must never fire on the loop's own deadline");
});

test("the block fires into the chain on its live edge, not on gesture payoff", () => {
  const end = fnBody("endHold");
  assert.doesNotMatch(
    end,
    /discharge\(\)/,
    "a gesture ending is not proof that the convergence bolts all landed",
  );
  assert.match(
    code(spine),
    /dagBus\.live === 1 && lastLive === 0[\s\S]{0,220}discharge\(\)/,
    "the spark must fire exactly when the completed node becomes live",
  );
  const fire = fnBody("discharge");
  // Two things leave the node together: the bolt down the descender…
  assert.match(fire, /heroEl\.dataset\.discharge = ""/);
  // …and a push on the circuit's own draw, so the chain below the fold is
  // already alive, with its front on it, when the page starts moving.
  assert.match(fire, /drawFloorTo =[\s\S]*?LOCK\.DISCHARGE_PX/);
  // Re-arming an attribute that is already there restarts nothing.
  assert.match(fire, /delete heroEl\.dataset\.discharge[\s\S]*?offsetWidth/);
  // A FLOOR under drawK, never a value of it: real scroll overtakes it and
  // the chain can never retract under the reader.
  assert.match(code(spine), /Math\.max\(\s*drawFloor,/);
  // Reduced motion gets neither the hold nor the bolt.
  assert.match(fnBody("applyReduced"), /delete heroEl\.dataset\.discharge/);
  assert.match(globals, /\[data-discharge\] \.hero-discharge \{/);
  assert.match(globals, /@keyframes hero-discharge-run/);
  // It runs ONCE. A loop here is the ambient glint's job, not the payoff's.
  assert.match(globals, /animation: hero-discharge-run [\d.]+ms linear 1 both/);
});

test("the opening plays again, but only for someone who actually left", () => {
  const loop = code(spine);
  // The animation resets once the hero is actually offscreen; returning to a
  // settled top only re-arms the already-empty cycle.
  assert.match(loop, /y >= heroH \* LOCK\.RESET_AT_HERO[\s\S]{0,100}resetOpening\(\)/);
  assert.match(loop, /openingReset &&\s*\n\s*y <= 2 &&\s*\n\s*Math\.abs\(vel\) < LOCK\.REARM_VEL/);
  assert.match(loop, /now - topSince > LOCK\.REARM_MS[\s\S]{0,400}armHold\("return"\)/);
  const reset = fnBody("resetOpening");
  assert.match(reset, /dagBus\.epoch\+\+/);
  assert.match(reset, /chargeS = 0/);
  assert.match(reset, /fill = 0/);
  assert.match(reset, /chargeFloor = 0/);
  // Re-arming changes ownership, but must not perform a second visual reset.
  const rearm = loop.match(/armHold\("return"\)/)?.index ?? 0;
  const block = loop.slice(Math.max(0, rearm - 500), rearm);
  for (const state of ["drawFloorTo = 0", "holdFullAt = 0", "openingReset = false"]) {
    assert.ok(block.includes(state), `the re-arm must reset ${state}`);
  }
  // The chain RETRACTS on the same ramp that pushed it out. Zeroing drawFloor
  // outright would blink a few hundred pixels of chain out of existence.
  assert.match(block, /drawFloorRamp = drawFloor > 0/);
  assert.doesNotMatch(block, /drawFloor = 0/, "the reset must ease, not cut");
  assert.match(
    loop,
    /if \(drawFloorRamp\) \{[\s\S]{0,300}Math\.abs\(drawFloorTo - drawFloor\)/,
    "one ramp, running both ways",
  );
  // A deep link still lands untouched; a reader who scrolled back up does not
  // stay punished for a hash that is now history.
  assert.match(
    fnBody("armHold"),
    /if \(reason === "load" && location\.hash\) return;/,
  );
  // A paused partial gesture keeps its listener and progress, not a hot rAF.
  assert.match(loop, /\(holdPhase === "held" && holdStart > 0\) \|\|\s*\n\s*gliding \|\|\s*\n\s*topSince > 0 \|\|/);
});

test("the hold rides the SAME charge curve as a real scroll", () => {
  // lockScrollFor is the inverse of chargeFor's ramp. If the two drift, the
  // hold either releases before the payoff or sits there after it is over.
  const start = geometry.match(/const start = h \* ([\d.]+)/)?.[1];
  const span = geometry.match(/const span = h \* ([\d.]+)/)?.[1];
  const lock = geometry.match(
    /export function lockScrollFor[\s\S]*?heroH\) \* \(([\d.]+) \+ ([\d.]+) \*/,
  );
  assert.equal(lock?.[1], start, "the hold must begin where chargeFor begins");
  assert.equal(lock?.[2], span, "the hold must span what chargeFor spans");
  // A line-mode mouse must not need sixteen times the gesture.
  assert.match(geometry, /deltaMode === 1/);
  assert.match(geometry, /deltaMode === 2/);
});

test("the hero's chain runs the whole drop, gradient and all", () => {
  const rail = globals.match(/\.hero-descender \{[^}]*\}/)?.[0] ?? "";
  const lit = globals.match(/\.hero-descender::after \{[^}]*\}/)?.[0] ?? "";
  assert.match(rail, /bottom:\s*0;/, "the rail reaches the hero's edge");
  // The gradient must be carried the WHOLE way down, not just on the lit part:
  // out of the block on lavender and into the hero's edge on accent purple,
  // which is where the circuit's ramp picks it up.
  for (const layer of [rail, lit]) {
    assert.match(layer, /linear-gradient\([\s\S]*?201, 169, 255[\s\S]*?168, 86, 251/);
  }
  // Revealed, never scaled: a scaled copy squeezes the whole ramp into the lit
  // stub and falls out of register with the gradient underneath it.
  assert.doesNotMatch(rail, /transform:/);
  assert.doesNotMatch(lit, /scaleY/);
  assert.match(lit, /mask-image[\s\S]*?var\(--lit\)/);
  assert.match(lit, /--lit: clamp\(0\.3, var\(--hero-charge, 0\), 1\)/);
  // The glint's travel is a fraction of the drop, so it can never be left
  // short by a taller viewport the way a hard-coded pixel length was.
  assert.match(globals, /@keyframes hero-glint[\s\S]*?translateY\(100%\)/);
});

test("the chain is one weight end to end; only its branches are lighter", () => {
  const w = (sel, prop = "width") =>
    globals.match(new RegExp(`\\.${sel}[^{]*\\{[^}]*?(?:stroke-)?${prop}: ([\\d.]+)`))?.[1];
  // Descender, lead-in and trunk are ONE line running the length of the site.
  // Any disagreement here shows up as a step at the join — and the joins are
  // pixel-exact (the lead starts on the descender's centre x), so a step would
  // be plainly visible rather than lost in a curve.
  for (const sel of ["hero-descender", "spine-lead-dark", "spine-lead", "spine-seg", "spine-head", "spine-head-body"]) {
    assert.equal(w(sel), "1.8", `${sel} is part of the chain and must be 1.8`);
  }
  // Branches are references OFF the chain, not the chain. The tick is a
  // horizontal edge, so its thickness is its height.
  assert.equal(w("spine-tick", "height"), "1.2", "the tick is a branch");
  for (const sel of ["spine-ghost", "spine-fork-line"]) {
    assert.equal(w(sel), "1.2", `${sel} is a branch`);
  }
  assert.doesNotMatch(globals, /\.spine-[a-z-]+ \{[^}]*width: 1px;/);
});

/* ---------------- Act II: the routed circuit through the band -------------- */

const statsBand = read("../src/components/home/StatsBand.tsx");
const exchange = read("../src/components/home/ExchangeWarning.tsx");
const participate = read("../src/components/home/Participate.tsx");
const timeline = read("../src/components/home/Timeline.tsx");
const spineFrame = read("../src/components/spine/SpineFrame.tsx");

/** The body of a top-level function in geometry.ts, exported or not. */
const geomFn = (name) =>
  geometry.match(new RegExp(`function ${name}\\([\\s\\S]*?\\n\\}`))?.[0] ?? "";

test("the circuit is opt-in and all-or-nothing", () => {
  // Half a circuit is worse than none: a page with a band but no card would
  // route the chain into empty space and never bring it back to the rail.
  assert.match(statsBand, /data-spine-band/);
  assert.match(statsBand, /data-spine-label/);
  assert.match(statsBand, /data-spine-cell/);
  // Written as a JSX attribute or as a spread object literal — the circuit
  // only cares that the value reaches the DOM, and ExchangeWarning now picks
  // its attributes per variant. Assert the fact, not the syntax.
  assert.match(exchange, /data-spine-frame"?[:=]\s*"cross"/);
  assert.match(
    code(spine),
    /heroEl && bandEl && card && cellEls2\.length/,
    "all four pieces, or the page keeps the plain rail",
  );
  // The later acts are opt-in on top of that: a page with a band but no
  // timeline still gets Act II, and one with no fork pair still gets Act III.
  assert.match(timeline, /data-spine-track/);
  assert.match(timeline, /data-spine-point/);
  assert.match(participate, /data-spine-frame="cross"/, "the mining section is framed");
  const branches = participate.match(/data-spine-frame="branch"/g) ?? [];
  assert.equal(branches.length, 2, "a fork needs exactly two arms");
  assert.match(code(geometry), /if \(cells\.length === 0\) return null/);
  assert.match(code(geometry), /card\.t <= band\.b \+ 8/, "a card beside the band is not a route");
});

test("the circuit is axis-aligned runs joined by rounded turns", () => {
  const body = geomFn("emitRoute");
  assert.ok(body.length > 400, "emitRoute must exist");
  assert.ok(geomFn("buildCircuit").length > 400, "buildCircuit must exist");
  // Runs are straight and turns are quarter ARCS — never a freehand curve,
  // which would break both the pure length and the axis-aligned box gaps.
  assert.match(code(body), /` A \$\{f\(rEnd\)\}/, "turns are arcs");
  assert.doesNotMatch(code(body), /[ `][CQST] /, "no cubic or quadratic anywhere");
  // The radius yields to whatever room the route actually has, or the arc is
  // drawn across the first block on a row and clipped away past the last.
  assert.match(code(body), /room\[i\]\.tail/);
  assert.match(code(body), /room\[i \+ 1\]\.head/);
  // Lengths stay arithmetic: reaching for getTotalLength() would put a DOM
  // call in a file the tests keep DOM-free, and drift the dash off the path.
  assert.doesNotMatch(code(geometry), /getTotalLength/);
  assert.match(code(spine), /r\.len\.toFixed/, "each run dashes on the pure length");
});

test("the chain is not drawn where a block or a frame carries it", () => {
  // Across its own width the block IS the chain — the same contract every
  // framed section gets. A wire drawn behind one would be a second chain.
  assert.match(code(geometry), /out\.hidden\.push\(\[cumAt\(a\), cumAt\(b\)\]\)/);
  assert.match(code(geometry), /go\(fromLeft \? b\.r : b\.l, row\.y, false, idOf\(ci\)\)/);
  assert.match(code(geometry), /go\(cardCx, card\.b, false, FRAME0\)/);
  // …and the travelling front is hidden there too, or it would cross a block
  // the wire does not.
  assert.match(code(spine), /circuit\.frontGaps\.some/);
  // The route is still ONE length: the hidden stretch is skipped by the
  // stroke, not by the clock, so the front leaves the far side on time.
  assert.match(code(geometry), /cum = cumAt\(t1\)/);
});

test("a framed section's border is inside it, not in the overlay", () => {
  // The overlay is z-index:-1 and these hosts have translucent fills, so a
  // frame drawn out there would be muddied to a fraction of itself.
  assert.match(spineFrame, /className="spine-frame"/);
  assert.match(spineFrame, /className="spine-frame-arc"/);
  assert.doesNotMatch(ornament, /spine-frame-arc/, "not in the overlay");
  for (const [name, src] of [["ExchangeWarning", exchange], ["Participate", participate]]) {
    assert.match(src, /<SpineFrame \/>/, `${name} must render the shared frame`);
  }
  // Two halves released together at the top centre must MEET at the bottom
  // centre; they only do if they are mirror images of one another.
  assert.match(code(geometry), /export function cardHalfPath/);
  assert.match(code(spine), /cardHalfPath\(m\.w, m\.h, m\.rad, m\.bw \/ 2, 1\)/);
  assert.match(code(spine), /cardHalfPath\(m\.w, m\.h, m\.rad, m\.bw \/ 2, -1\)/);
  // The frame paints above the card's fill and BELOW its text. Either half of
  // this pair alone is a bug: without `isolate` a negative z-index escapes to
  // the root stacking context and the frame goes back under the 60% fill.
  // Also form-agnostic: the class list is now assembled by cn() so the variant
  // can change the radius, but the isolate/relative pair is not negotiable.
  assert.match(exchange, /"relative isolate rounded-2xl/);
  assert.match(globals, /\.spine-frame \{[^}]*z-index: -1;/);
  // A filter's cached result is invalidated by every dashoffset change, so a
  // drop-shadow here re-runs a 1376x435 filter on every frame of the draw.
  assert.doesNotMatch(globals, /\.spine-frame-arc \{[^}]*filter:/);
  // `inset: 0` resolves against the padding box, which would sit the frame a
  // border-width inside the border it is supposed to become.
  assert.match(code(spine), /frame\.style\.left = `\$\{-m\.bw\}px`/);
});

test("a bolt only ever marks the front of a line being drawn", () => {
  // Two bolts on a border, because a border is TWO lines drawn at once — a
  // half released each way from the top centre.
  assert.equal(
    (spineFrame.match(/className="spine-frame-bolt"/g) ?? []).length,
    2,
    "one charge per half of the border",
  );
  // They take the SAME two paths the arcs draw — a bolt on its own geometry
  // would drift off the line the moment a card's radius or border changed.
  assert.match(
    code(spine),
    /querySelectorAll<SVGGElement>\("\.spine-frame-bolt"\)[\s\S]{0,180}offsetPath = `path\("\$\{half\[i % 2\]\}"\)`/,
  );
  const lit =
    css(globals).match(
      /\[data-spine-frame\]\.is-lit \.spine-frame-bolt \{[\s\S]*?\n\}/,
    )?.[0] ?? "";
  // NOTHING loops. The bolt exists while its line is being drawn and leaves
  // with it — a charge still circling a border you scrolled past minutes ago
  // is ambient decoration, not a front.
  assert.doesNotMatch(lit, /infinite/, "the border charge must not loop");
  assert.match(lit, /forwards/, "it runs once and stays where it ended");
  // …and it ends invisible, so nothing is parked on a finished border.
  assert.match(css(globals), /@keyframes spine-bolt-spark[\s\S]{0,160}100% \{\n\s*opacity: 0/);
  // Same 900ms and easing as the arcs' own transition, or it races the line.
  assert.match(lit, /spine-bolt-run 900ms cubic-bezier\(0\.22, 1, 0\.36, 1\)/);
  assert.match(
    css(globals),
    /\.spine-frame-arc,\n\.spine-frame-glow \{[\s\S]*?transition: stroke-dashoffset 900ms cubic-bezier\(0\.22, 1, 0\.36, 1\)/,
  );
  // offset-distance is a transform. A travelling stroke-dasharray would have
  // been fewer elements and would repaint a card-sized path every frame.
  assert.match(css(globals), /@keyframes spine-bolt-run[\s\S]{0,120}offset-distance: 100%/);
  assert.doesNotMatch(
    css(globals),
    /\.spine-frame-bolt[^{]*\{[^}]*stroke-dasharray/,
    "the charge must not be a travelling dash on the frame path",
  );
  // A dot parked mid-lap is a stray mark, not a resting state.
  assert.match(
    css(globals),
    /prefers-reduced-motion: reduce\)[\s\S]*?\.spine-frame-bolt,\n\s*\.spine-circuit-front,\n\s*\.spine-arm-front \{\n\s*display: none/,
  );
  // The bloom is a paint server shared with the travelling front, not a
  // filter: a drop-shadow would re-rasterise on every frame each dot moves.
  assert.match(ornament, /<radialGradient id="spine-bolt-glow">/);
  assert.match(css(globals), /\.spine-bolt-halo \{\n\s*fill: url\(#spine-bolt-glow\)/);
  assert.doesNotMatch(css(globals), /\.spine-bolt[^{]*\{[^}]*filter:/);
});

test("the fork has a front on each arm, not none", () => {
  // The trunk's front stands down for the fork (there is no single place for
  // it to be), so without these the two arms draw with nothing marking them.
  assert.match(code(geometry), /export type Strand/);
  assert.match(code(geometry), /arms: strands/);
  assert.match(ornament, /className="spine-arm-front"/);
  assert.match(bus, /ARM_POOL: 4/);
  const loop = code(spine).match(
    /for \(let i = 0; i < armFrontEls\.length; i\+\+\) \{[\s\S]*?\n        \}/,
  )?.[0];
  assert.ok(loop, "the arm fronts must be driven from the frame loop");
  // Located on the ARM's own polyline, by the same absolute k * len that
  // drives the trunk — a strand rebased to zero would put both at the fork.
  assert.match(loop, /pointAtLen\(arm\.points, arm\.lens, at\)/);
  // Hidden where its own card carries it, exactly as the trunk's front is.
  assert.match(loop, /arm\.gaps\.some/);
  // One transform write and an opacity flip only on change — the same budget
  // the single front already had.
  assert.match(loop, /if \(live !== armOn\[i\]\)/);
});

test("a node block is framed like the card, and costs nothing per frame", () => {
  // Two halves released where the chain arrives, meeting where it leaves —
  // the warning card's frame at cell scale, which is what ties them together.
  assert.match(code(geometry), /export function boxHalfPath/);
  assert.match(code(spine), /boxHalfPath\(b\.box, CIRCUIT\.RADIUS, b\.wireY, b\.fromLeft, true\)/);
  assert.match(code(spine), /boxHalfPath\(b\.box, CIRCUIT\.RADIUS, b\.wireY, b\.fromLeft, false\)/);
  // Purple, not the teal it started as.
  assert.match(globals, /\.spine-cell-arc \{[^}]*stroke: rgba\(168, 86, 251/);
  // The wide bloom stroke under it is currently COMMENTED OUT (grep
  // "TEMP glow-off"). Asserting it here would pass on the commented text and
  // say nothing, so this pins the live state instead: no glow rule, and the
  // pooled paths therefore paint nothing rather than inheriting a stroke.
  assert.doesNotMatch(
    css(globals),
    /\.spine-cell-glow \{[^}]*stroke:/,
    "if the bloom is restored, restore the colour assertion with it",
  );
  assert.doesNotMatch(
    css(globals),
    /\.spine-cell \{[^}]*stroke:/,
    "…and nothing above it may set one, or the bloom comes back invisible-adjacent",
  );
  // Drawn by a class flip and a CSS transition. Per-frame dashoffset writes on
  // four paths per cell would be 24 writes a frame for six one-shot draws.
  assert.match(globals, /stroke-dashoffset: 1;\n\s*transition: stroke-dashoffset/);
  assert.match(globals, /\.spine-cell\.is-lit \.spine-cell-arc/);
  assert.match(ornament, /pathLength="1"/, "normalised, so no half needs measuring");
  assert.doesNotMatch(code(spine), /\bboxPath\b/, "the closed-loop box is gone");
});

test("the stat cells read as blocks: centred, and no stray note", () => {
  assert.match(statsBand, /data-spine-cell\n\s*className="flex flex-col gap-1\.5 text-center"/);
  // The prose still explains the 24h window; the LABEL no longer wears it.
  assert.doesNotMatch(code(statsBand), /24h/, "the (24h) qualifier is gone from the label");
  assert.doesNotMatch(code(statsBand), /s\.note/, "…and so is the machinery that rendered it");
});

test("the chain does not change colour at the hero's edge", () => {
  // The circuit begins exactly where the descender ends, on the SAME accent
  // purple. Both halves of this matter: a mismatch is a visible step on the
  // boundary, and matching on the wrong hue (they used to meet on teal) turns
  // a couple of hundred pixels of the junction into a different-coloured line.
  const rail = css(globals).match(/\.hero-descender \{[^}]*\}/)?.[0] ?? "";
  const lastStop = [...rail.matchAll(/rgba\((\d+), (\d+), (\d+)/g)].at(-1);
  assert.deepEqual(
    lastStop?.slice(1, 4),
    ["168", "86", "251"],
    "the descender must land on accent purple",
  );
  const ramp = geometry.match(/const RAMP[\s\S]*?\n\];/)?.[0] ?? "";
  assert.match(
    ramp,
    /\[0, \[0xa8, 0x56, 0xfb\]/,
    "the circuit's ramp must start on that same purple",
  );
  // …and HOLD it. Drifting into magenta and pink over a route this long reads
  // as a different line by the time it reaches the frames at the foot of the
  // page; drifting into teal steals the colour the moving marks live on.
  assert.match(ramp, /\[1, \[0xa8, 0x56, 0xfb\]/, "and still purple at the end");
  assert.doesNotMatch(ramp, /0xf4, 0x5f, 0xc4/, "no pink on the chain");
  assert.doesNotMatch(ramp, /0x2c, 0xe0, 0xce/, "and no teal — that is the bolt's");
  // Teal on this junction is only ever a MOVING mark. The wire is not one.
  assert.doesNotMatch(rail, /44, 224, 206/);
  const lit = css(globals).match(/\.hero-descender::after \{[\s\S]*?\n\}/)?.[0] ?? "";
  assert.doesNotMatch(lit, /44, 224, 206/, "…nor is the lit copy of it");
  assert.match(
    css(globals),
    /\.hero-glint::after \{[\s\S]*?background: var\(--accent-teal\)/,
    "the glint — which travels — still is",
  );
});

test("nothing is ruled across the edge the chain crosses", () => {
  // A 1px hairline on the hero's bottom cut straight through the descender.
  // The band below separates itself with its own surface and border.
  assert.doesNotMatch(code(hero), /border-b\b/, "the hero must not rule its own edge");
  // …and neither does the band below it. It used to open at 0.55 with a
  // hairline on top, which put a hard, visibly lighter seam a hundred pixels
  // under the hero. It is a swell now: zero alpha at BOTH ends, so it has no
  // edge of its own at either.
  const band = css(globals).match(/\.section-surface \{[\s\S]*?\n  \}/)?.[0] ?? "";
  assert.doesNotMatch(band, /border-top/, "the band must not rule its own edge");
  assert.match(band, /rgba\(31, 22, 48, 0\) 0%/, "it starts invisible…");
  assert.match(band, /rgba\(31, 22, 48, 0\) 100%/, "…and ends invisible");
  // The peak has to agree with the veil model the spine compensates against.
  const peak = band.match(/rgba\(31, 22, 48, (0\.\d+)\) ([\d.]+)%/);
  assert.equal(Number(peak?.[1]), Number(geometry.match(/VEIL_A0 = ([\d.]+)/)?.[1]));
  assert.equal(
    Number(peak?.[2]) / 100,
    Number(geometry.match(/VEIL_PEAK = ([\d.]+)/)?.[1]),
  );
});

test("the circuit is written brighter where the band veils it", () => {
  // .section-surface veils whatever the spine draws behind it. Uncompensated,
  // the runs under the thickest part read dimmer than the identical runs
  // either side, and the chain appears to fade and recover for no reason.
  assert.match(code(geometry), /export const VEIL_A0 = 0\.3/);
  assert.match(code(geometry), /export const VEIL_PEAK = 0\.22/);
  assert.match(code(geometry), /export function veilAt/);
  assert.match(code(geometry), /export function unveil/);
  // Sampled at the BAND's own edges (that is where the veil is), at the
  // veil's own corner, and at the ramp's breakpoints — or interpolation
  // rounds a corner of it clean off.
  assert.match(code(geometry), /bandTop \+ h \* VEIL_PEAK/);
  assert.match(code(geometry), /RAMP\.map\(\(r\) => r\[0\]\)/);
  assert.match(code(spine), /circuitStops\(/);
  // Strictly increasing offsets, or the gradient renders undefined.
  assert.match(code(geometry), /offset <= out\[out\.length - 1\]\.offset/);
});

test("the circuit has a finished resting frame under reduced motion", () => {
  const reduced = spine.match(/const applyReduced = \(\) => \{[\s\S]*?\n    \};/)?.[0] ?? "";
  assert.match(reduced, /runEls\.forEach/, "the circuit is routed");
  assert.match(reduced, /cellLit = cellLit\.map\(\(\) => true\)/, "every box closed");
  assert.match(reduced, /frameEls\.forEach/, "every framed section framed");
  assert.match(reduced, /pointEls\.forEach/, "every timeline node lit");
  assert.match(reduced, /frontEl\.style\.opacity = "0"/, "no travelling front");
  assert.match(reduced, /leadEl\.style\.strokeDashoffset = "0"/, "the lead-in drawn");
  // The trunk is the LONGEST stretch of the chain, and its lit fill is written
  // only from renderFrame — which reduced motion never runs. Without this the
  // circuit, the boxes and the card all light up and the trunk stays a dark
  // hairline with lit blocks hanging off it.
  assert.match(reduced, /for \(const s of liveSegs\)/, "the trunk is filled");
  assert.match(reduced, /s\.k = 1;/, "…and its memo is primed, or toggling back off sticks");
  // The properties that used to stand in for this have no consumer at all.
  assert.doesNotMatch(globals, /var\(--sp-head/);
  assert.doesNotMatch(code(spine), /--sp-head|data-static|dataset\.static/);
});

test("the News fan shares circuit progress and one synchronized completion state", () => {
  assert.match(newsPreview, /data-spine-news/);
  assert.match(newsPreview, /data-spine-news-card/);
  assert.match(code(geometry), /newsAt/);
  assert.match(code(spine), /circuit\.newsAt/);
  assert.match(code(spine), /is-news-reached/);
  assert.match(code(spine), /newsLit/);
  assert.match(code(bus), /ARM_POOL:\s*4/);

  const reduced = spine.match(/const applyReduced = \(\) => \{[\s\S]*?\n    \};/)?.[0] ?? "";
  assert.match(reduced, /newsLit/);
  assert.match(reduced, /is-news-reached/);
});

// DELETED: "the sections that own a vertical rail hand off to the spine".
// There is no handoff left to assert. /staking's rail is now a [data-edge] and
// the spine is not on that page at all, so the test could only be kept green by
// renaming an attribute — which would leave it asserting a fiction.

test("the circuit is measured at LAYOUT positions, never through a reveal", () => {
  const src = code(spine);
  // Every box buildCircuit is given must come through layoutRectOf. A reveal
  // item rests 12px below its layout position until it enters, and
  // getBoundingClientRect includes that transform — so a cold load measures
  // everything below the fold low, and because a transform changes nothing
  // about layout, revealing it later fires no ResizeObserver and schedules no
  // re-measure at all.
  const call = src.slice(src.indexOf("buildCircuit({"), src.indexOf("news: newsCards"));
  assert.ok(call.length > 200, "the buildCircuit call site must be findable");
  assert.doesNotMatch(
    call,
    /\brectOf\(/,
    "no circuit input may be measured with rectOf — layoutRectOf strips the reveal transform",
  );
  for (const key of ["cells:", "branches:", "hub:", "mine:", "tail:", "label:"]) {
    assert.ok(call.includes(key), `the call site must still pass ${key}`);
  }
  // rectOf survives for exactly one caller: layoutRectOf itself.
  assert.equal(
    (src.match(/\brectOf\(/g) ?? []).length,
    1,
    "rectOf should have exactly one remaining caller (layoutRectOf)",
  );
});

test("a late-arriving snapshot cannot leave the circuit pinned to a stale layout", () => {
  const src = code(spine);

  // The stats band is the one element whose HEIGHT depends on live data: six
  // cells fit one row as placeholders and wrap to two when the numerals widen,
  // measured at exactly +103px. Everything below moves with it. One settle
  // pass covers only a warm API; a cold, rate-limited RPC round trip is
  // routinely slower, and the circuit then stays pinned above the cards.
  const timers = /\[([\d,\s]+)\]\.map\(\s*\(ms\) =>\s*window\.setTimeout\(scheduleMeasure, ms\)/.exec(src);
  assert.ok(timers, "there must be a staged set of settle re-measures after mount");
  const ms = timers[1].split(",").map((n) => Number(n.trim())).filter(Number.isFinite);
  assert.ok(ms.length >= 3, "one late pass is not enough for a cold API");
  assert.ok(Math.max(...ms) >= 4000, "the last settle pass must outlast a slow first snapshot");

  // …and the queue latch must not be able to wedge. `measureQueued` is only
  // cleared BY measure(), so a read the shared scheduler never delivers would
  // disable every future re-measure for the life of the page.
  assert.match(src, /requestAnimationFrame\(\(\) => \{\s*if \(measureQueued\) measure\(\);/);
  assert.match(src, /cancelAnimationFrame\(measureRaf\)/);
});
