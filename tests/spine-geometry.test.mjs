import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildCircuit,
  columnXOf,
  pointAtLen,
  boxHalfPath,
  cardHalfPath,
  circuitStops,
  glideEase,
  leadLenFor,
  lenAtRead,
  veilAt,
  VEIL_A0,
  VEIL_PEAK,
  unveil,
  CIRCUIT,
} from "../src/lib/spine/geometry.ts";

// BEHAVIOURAL tests for the spine's pure geometry — the rest of the suite
// asserts about source text, which cannot catch a route that silently stops
// drawing. Needs a Node that strips types (>= 22.18); CI pins node-version 22,
// which resolves to a release that does.
//
// The invariant that matters most is COVERAGE: every millimetre of the route
// is either a drawn run or a deliberate gap behind a node block. A corner arc
// that gets clipped away, or a block that eats the straight an arc needed,
// leaves the chain visibly broken — and nothing else here would notice.

const BAND = { l: 0, t: 1372, r: 2545, b: 1888 };
const CARD = { l: 585, t: 1984, r: 1961, b: 2419 };
const BASE = {
  width: 2545,
  fromX: 1272.5,
  fromY: 1276,
  railX: 565.5,
  band: BAND,
  label: { l: 585, t: 1453, r: 1228, b: 1469 },
  card: CARD,
};

/** The measured lg+ layout: six cells on one row. */
const ONE_ROW = [
  { l: 585, t: 1636, r: 801, b: 1699 },
  { l: 902, t: 1636, r: 948, b: 1699 },
  { l: 1049, t: 1636, r: 1204, b: 1699 },
  { l: 1305, t: 1636, r: 1499, b: 1699 },
  { l: 1600, t: 1636, r: 1751, b: 1699 },
  { l: 1853, t: 1636, r: 1961, b: 1699 },
];

const LAYOUTS = {
  "one row (lg+)": { ...BASE, cells: ONE_ROW },
  "one row, one label wrapped": {
    ...BASE,
    cells: ONE_ROW.map((c, i) => (i === 1 ? { ...c, t: c.t - 16 } : c)),
  },
  "three rows (2-col grid)": {
    ...BASE,
    label: null,
    cells: [1600, 1700, 1800].flatMap((t) => [
      { l: 600, t, r: 800, b: t + 63 },
      { l: 1000, t, r: 1200, b: t + 63 },
    ]),
  },
  "375px, boxes clamped off the rails": {
    width: 375,
    fromX: 187.5,
    fromY: 1276,
    railX: 7,
    band: { l: 0, t: 1372, r: 375, b: 2100 },
    label: null,
    card: { l: 16, t: 2200, r: 359, b: 2600 },
    cells: [1600, 1720].flatMap((t) => [
      { l: 16, t, r: 170, b: t + 63 },
      { l: 205, t, r: 359, b: t + 63 },
    ]),
  },
  "one cell spanning the whole row": { ...BASE, cells: [ONE_ROW[0], ONE_ROW[5]] },
  "the whole chain: band, timeline, mine, fork": {
    ...BASE,
    cells: ONE_ROW,
    timeline: {
      section: { l: 552, t: 2515, r: 1993, b: 3460 },
      label: { l: 585, t: 2515, r: 1961, b: 2531 },
      // Five nodes across the content column, as the horizontal grid lays
      // them out — inside the rails, which is what the route assumes.
      points: [0, 1, 2, 3, 4].map((i) => ({
        l: 585 + i * 341,
        t: 2640,
        r: 596 + i * 341,
        b: 2651,
      })),
    },
    mine: { l: 552, t: 3556, r: 1993, b: 3879 },
    // Two equal columns of the content grid, so the arms are mirror images.
    branches: [
      { l: 585, t: 3975, r: 1263, b: 4320 },
      { l: 1283, t: 3975, r: 1961, b: 4320 },
    ],
  },
  "the whole chain, timeline VERTICAL": {
    ...BASE,
    cells: ONE_ROW,
    timeline: {
      section: { l: 552, t: 2515, r: 1993, b: 3500 },
      label: { l: 585, t: 2515, r: 1961, b: 2531 },
      // Five nodes stacked in the gutter the layout opens for them — one
      // column, hanging back to the section's own left edge.
      points: [0, 1, 2, 3, 4].map((i) => ({
        l: 585,
        t: 2640 + i * 180,
        r: 596,
        b: 2651 + i * 180,
      })),
    },
    mine: { l: 552, t: 3600, r: 1993, b: 3923 },
    branches: [
      { l: 585, t: 4019, r: 1263, b: 4364 },
      { l: 1283, t: 4019, r: 1961, b: 4364 },
    ],
  },
  "the whole chain, timeline on the OUTER RAIL": {
    ...BASE,
    cells: ONE_ROW,
    timeline: {
      section: { l: 552, t: 2515, r: 1993, b: 3500 },
      label: { l: 585, t: 2515, r: 1961, b: 2531 },
      // The rendered dot column is centred on the circuit's own outside rail.
      // Its route should therefore stay outside instead of jogging inward.
      points: [0, 1, 2, 3, 4].map((i) => ({
        l: BASE.railX - 5.5,
        t: 2640 + i * 180,
        r: BASE.railX + 5.5,
        b: 2651 + i * 180,
      })),
    },
    mine: { l: 552, t: 3600, r: 1993, b: 3923 },
    branches: [
      { l: 585, t: 4019, r: 1263, b: 4364 },
      { l: 1283, t: 4019, r: 1961, b: 4364 },
    ],
  },
};

const NEWS_ROW = [
  { l: 585, t: 4560, r: 1029, b: 4970 },
  { l: 1049, t: 4560, r: 1497, b: 4970 },
  { l: 1517, t: 4560, r: 1961, b: 4970 },
];

const WITH_NEWS_FORK = {
  ...LAYOUTS["the whole chain: band, timeline, mine, fork"],
  news: NEWS_ROW,
  tail: { l: 552, t: 5160, r: 1993, b: 5310 },
};

test("the featured projects fork from the spotlight and rejoin at their own node", () => {
  const input = {
    ...WITH_NEWS_FORK,
    news: NEWS_ROW.map((box) => ({ ...box, t: box.t + 840, b: box.b + 840 })),
    tail: { ...WITH_NEWS_FORK.tail, t: 6100, b: 6250 },
    projects: {
      spotlight: { l: 585, t: 4480, r: 1961, b: 4780 },
      cards: [
        { l: 585, t: 4800, r: 1263, b: 5160 },
        { l: 1283, t: 4800, r: 1961, b: 5160 },
      ],
      hub: { l: 1237, t: 5232, r: 1309, b: 5304 },
    },
  };
  const circuit = buildCircuit(input);
  assert.equal(circuit.arms.length, 6, "participation, featured projects and news have two arms each");
  const arms = circuit.arms.slice(2, 4);
  for (const [index, arm] of arms.entries()) {
    const card = input.projects.cards[index];
    const midX = (card.l + card.r) / 2;
    assert.deepEqual(arm.points.slice(0, 2), [midX, input.projects.spotlight.b]);
    assert.deepEqual(pointAtLen(arm.points, arm.lens, arm.start + 200), [midX, input.projects.spotlight.b + 200]);
    const [x, y] = pointAtLen(arm.points, arm.lens, arm.start + arm.len);
    assert.ok(Math.abs(Math.hypot(x - 1273, y - 5268) - 36) < 0.01);
  }
  assert.ok(circuit.projectsHubAt < circuit.newsAt);
  assert.ok(circuit.hidden.some(([from, to]) =>
    Math.abs(from - circuit.projectsHubAt * circuit.len) < 0.01 && to - from === 72,
  ));

  const stacked = buildCircuit({
    ...input,
    projects: {
      ...input.projects,
      cards: [input.projects.cards[0], { ...input.projects.cards[0], t: 5180, b: 5500 }],
    },
  });
  assert.equal(stacked.arms.length, 4);
  assert.equal(stacked.projectsHubAt, Infinity);
});

/** How many spans the chain crosses without stroking: one per node block,
 *  plus one per framed section the route actually reached. */
const crossings = (input) =>
  input.cells.length +
  1 +
  (input.mine ? 1 : 0) +
  (input.branches ? input.branches.length : 0);

test("the completed hero handoff is monotone, bounded, and settles flat", () => {
  assert.equal(glideEase(0), 0);
  assert.equal(glideEase(1), 1);
  let previous = 0;
  for (let i = 1; i <= 100; i++) {
    const value = glideEase(i / 100);
    assert.ok(value >= previous, `glide regressed at ${i}%`);
    assert.ok(value >= 0 && value <= 1, `glide escaped its bounds at ${i}%`);
    previous = value;
  }
  assert.ok(1 - glideEase(0.9) < 0.001, "the arrival must settle rather than stop");
});

test("the route is fully covered: every span is drawn or deliberately hidden", () => {
  for (const [name, input] of Object.entries(LAYOUTS)) {
    const c = buildCircuit(input);
    assert.ok(c, `${name}: should build`);
    const spans = [
      ...c.runs.map((r) => [r.start, r.start + r.len]),
      ...c.hidden,
    ].sort((a, b) => a[0] - b[0]);
    let cursor = 0;
    for (const [a, b] of spans) {
      assert.ok(
        a <= cursor + 0.05,
        `${name}: the chain stops drawing at ${cursor.toFixed(1)} and does not resume until ${a.toFixed(1)}`,
      );
      cursor = Math.max(cursor, b);
    }
    assert.ok(
      Math.abs(cursor - c.len) < 0.05,
      `${name}: coverage ends at ${cursor.toFixed(1)} of ${c.len.toFixed(1)}`,
    );
    assert.equal(
      c.hidden.length,
      crossings(input),
      `${name}: one gap per block and per framed section`,
    );
  }
});

test("every block ignites at its own moment, in the route's own order", () => {
  for (const [name, input] of Object.entries(LAYOUTS)) {
    const c = buildCircuit(input);
    assert.equal(
      new Set(c.cellAt.map((v) => v.toFixed(6))).size,
      c.cellAt.length,
      `${name}: two blocks would draw on the same frame`,
    );
    for (const v of c.cellAt) {
      assert.ok(v > 0 && v < 1, `${name}: ignition at ${v} is off the route`);
    }
    // Every block and every framed section lights exactly where the chain
    // reaches it — its gap and its ignition are the same instant.
    const starts = new Set(c.hidden.map((h) => (h[0] / c.len).toFixed(6)));
    for (const v of [...c.cellAt, ...c.frameAt.filter(Number.isFinite)]) {
      assert.ok(
        starts.has(v.toFixed(6)),
        `${name}: something lights at ${v} but the chain does not stop drawing there`,
      );
    }
  }
});

test("the fork draws both arms at once and rejoins in the middle", () => {
  const input = LAYOUTS["the whole chain: band, timeline, mine, fork"];
  const c = buildCircuit(input);
  // Both arms leave the fork together — that is what makes it a fork rather
  // than a detour — and with mirrored cards they also arrive together.
  const post = c.runs.filter((r) => r.start > c.frameAt[1] * c.len + 1);
  const spans = new Map();
  for (const r of post) {
    const k = `${r.start.toFixed(3)}:${r.len.toFixed(3)}`;
    spans.set(k, (spans.get(k) ?? 0) + 1);
  }
  assert.ok(
    [...spans.values()].filter((v) => v === 2).length >= 3,
    "the two arms should be drawing the same spans at the same time",
  );
  assert.equal(c.frameAt[2], c.frameAt[3], "mirrored cards should light together");
  assert.ok(Number.isFinite(c.frameAt[1]), "the mine frame is on the route");
  // The arms overlap in time rather than running one after the other.
  const armRuns = c.runs.filter((r) => r.start >= c.frameAt[2] * c.len - 1);
  assert.ok(armRuns.length >= 4, "each arm draws its own runs");
  // The front has nowhere single to be while the chain is in two places.
  assert.ok(
    c.frontGaps.length > c.hidden.length,
    "the fork must hide the travelling front",
  );
  // …and it ends back on the centre line.
  assert.equal(c.endX, Math.round(input.width / 2));

  // Each arm carries a polyline of its own, because the trunk's travelling
  // front stands down for exactly this span and one front per arm replaces it.
  assert.equal(c.arms.length, 2, "one strand per arm");
  const forkGap = c.frontGaps.find(([a, b]) => b - a > 100 && a >= c.frameAt[1] * c.len);
  assert.ok(forkGap, "the trunk's front must stand down across the fork");
  for (const arm of c.arms) {
    // Absolute, not rebased: the same k * len that drives the trunk locates a
    // point on a strand, so nothing has to know where the fork began.
    assert.equal(arm.lens[0], arm.start);
    assert.ok(Math.abs(arm.lens[arm.lens.length - 1] - (arm.start + arm.len)) < 0.05);
    assert.ok(arm.start >= forkGap[0] - 0.05, "a strand starts at the fork");
    // It leaves straight DOWN the underside of the section above, in its own
    // card's column — not out sideways from a stub on the centre line.
    const [ax, ay] = pointAtLen(arm.points, arm.lens, arm.start);
    const [bx, by] = pointAtLen(arm.points, arm.lens, arm.start + 4);
    assert.equal(Math.round(ax), Math.round(bx), "the arm leaves vertically");
    assert.ok(by > ay, "…and downward");
    assert.equal(Math.round(ay), input.mine.b, "…off the section's bottom edge");
    // The card it passes through is a gap on the strand, as it is on the trunk.
    assert.ok(arm.gaps.length >= 1, "the framed card must be a gap on the arm");
  }
  // The two arms are mirror images, so they are the same length…
  assert.ok(Math.abs(c.arms[0].len - c.arms[1].len) < 0.05);
  // …and they start together. That is what makes it a fork, not a detour.
  assert.equal(c.arms[0].start, c.arms[1].start);
  // They are genuinely two different lines: same y, different x.
  const at = c.arms[0].start + 4;
  const [x0] = pointAtLen(c.arms[0].points, c.arms[0].lens, at);
  const [x1] = pointAtLen(c.arms[1].points, c.arms[1].lens, at);
  assert.ok(Math.abs(x0 - x1) > 100, `both arms are at x=${x0}`);
  // Timeline nodes are taps ON the line, not crossings: they do not add gaps.
  assert.equal(c.pointAt.length, input.timeline.points.length);
  for (const v of c.pointAt) assert.ok(v > 0 && v < 1);
});

test("the News row is linked along the cards' own centre line, behind them", () => {
  const c = buildCircuit(WITH_NEWS_FORK);
  assert.ok(c);
  assert.equal(c.complete, true, "the disclaimer remains the route's terminus");
  assert.ok(Number.isFinite(c.newsAt), "the three-column News row is on the route");
  assert.equal(c.arms.length, 4, "the existing fork plus two News branches");

  const [left, right] = c.arms.slice(-2);
  assert.equal(left.start, right.start, "both News branches leave together");
  assert.ok(Math.abs(left.len - right.len) < 0.05, "mirrored branches land together");
  assert.deepEqual(left.gaps, [], "News does not borrow an animated card border");
  assert.deepEqual(right.gaps, [], "News does not borrow an animated card border");

  // The chain no longer veers off above the heading: it carries on down the
  // middle until it is level with the cards, then links them along that line.
  const cx = Math.round(WITH_NEWS_FORK.width / 2);
  const linkY = Math.round((NEWS_ROW[1].t + NEWS_ROW[1].b) / 2);
  assert.ok(
    linkY > NEWS_ROW[1].t,
    "the junction is INSIDE the row, not in the gap above it",
  );
  assert.deepEqual(
    pointAtLen(left.points, left.lens, left.start).map(Math.round),
    [cx, linkY],
    "the link starts on the centre chain at the cards' centre line",
  );
  assert.deepEqual(
    pointAtLen(right.points, right.lens, right.start).map(Math.round),
    [cx, linkY],
    "both branches share the same junction",
  );

  // Each arm runs horizontally to its card's centre — staying on that line is
  // what puts it BEHIND the cards rather than bracketing over them.
  const leftEnd = pointAtLen(left.points, left.lens, left.start + left.len).map(Math.round);
  const rightEnd = pointAtLen(right.points, right.lens, right.start + right.len).map(Math.round);
  assert.deepEqual(
    leftEnd,
    [Math.round((NEWS_ROW[0].l + NEWS_ROW[0].r) / 2), linkY],
    "the left arm reaches the left article's centre, on the link line",
  );
  assert.deepEqual(
    rightEnd,
    [Math.round((NEWS_ROW[2].l + NEWS_ROW[2].r) / 2), linkY],
    "the right arm reaches the right article's centre, on the link line",
  );

  const newsDone = c.newsAt * c.len;
  assert.ok(Math.abs(newsDone - (left.start + left.len)) < 0.05);
  assert.ok(
    c.frontGaps.some(
      ([a, b]) => Math.abs(a - left.start) < 0.05 && Math.abs(b - newsDone) < 0.05,
    ),
    "the single trunk front stands down while the two News fronts travel",
  );
  assert.ok(c.frameAt[4] > c.newsAt, "the disclaimer lights after the side articles");
});

test("the News fan fails closed when the cards wrap to two or one columns", () => {
  const tail = { ...WITH_NEWS_FORK.tail, t: 5580, b: 5730 };
  const baseline = buildCircuit({ ...WITH_NEWS_FORK, news: null, tail });
  const wrapped = buildCircuit({
    ...WITH_NEWS_FORK,
    news: NEWS_ROW.map((box, i) =>
      i === 2 ? { ...box, l: 585, r: 1029, t: 4990, b: 5400 } : box,
    ),
    tail,
  });
  assert.ok(baseline && wrapped);
  assert.equal(wrapped.newsAt, Infinity);
  assert.equal(wrapped.arms.length, 2, "only the participation fork remains");
  assert.equal(
    wrapped.runs.length,
    baseline.runs.length,
    "a wrapped row adds no hidden or offscreen branch runs",
  );
});

test("a stacked timeline is threaded straight down its own column", () => {
  const input = LAYOUTS["the whole chain, timeline VERTICAL"];
  const rightX = input.width - input.railX;
  const colX = columnXOf(input.timeline.points, input.railX, rightX);
  assert.equal(colX, 591, "the column is the nodes' own shared centre");
  // The horizontal layout must NOT be mistaken for one, or the route would
  // collapse five nodes spread across the page onto a single x.
  assert.equal(
    columnXOf(
      LAYOUTS["the whole chain: band, timeline, mine, fork"].timeline.points,
      input.railX,
      rightX,
    ),
    null,
  );

  const c = buildCircuit(input);
  assert.ok(c);
  assert.equal(c.pointAt.length, input.timeline.points.length);
  for (let i = 1; i < c.pointAt.length; i++) {
    assert.ok(
      c.pointAt[i] > c.pointAt[i - 1],
      "the nodes light top to bottom, in the order the chain reaches them",
    );
  }
  // The chain is genuinely vertical through them: sampled between the first
  // node and the last, it never leaves the column. This is what a serpentine
  // route would fail — it would swing out to a rail between every pair.
  const first = c.pointAt[0] * c.len;
  const last = c.pointAt[c.pointAt.length - 1] * c.len;
  for (let t = first; t <= last; t += 11) {
    const [x] = pointAtLen(c.points, c.lens, t);
    assert.ok(
      Math.abs(x - colX) < 1.5,
      `the chain wanders to x=${x.toFixed(1)} between nodes`,
    );
  }
  // It reaches that column from the MARGIN, not straight down out of the card:
  // the section's eyebrow and heading start at the column's own x.
  const label = input.timeline.label;
  for (let t = 0; t < first; t += 11) {
    const [x, y] = pointAtLen(c.points, c.lens, t);
    if (y > label.t - 4 && y < label.b + 4) {
      assert.ok(
        x < label.l - 4,
        `the chain crosses the section label at x=${x.toFixed(1)}`,
      );
    }
  }
});

test("a timeline aligned to the outside rail never dips inward", () => {
  const input = LAYOUTS["the whole chain, timeline on the OUTER RAIL"];
  const rightX = input.width - input.railX;
  const colX = columnXOf(input.timeline.points, input.railX, rightX);
  assert.ok(
    Math.abs(colX - input.railX) < 1,
    `the measured node column ${colX} must resolve to rail ${input.railX}`,
  );

  const c = buildCircuit(input);
  assert.ok(c);
  const first = c.pointAt[0] * c.len;
  const firstY = Math.round(
    (input.timeline.points[0].t + input.timeline.points[0].b) / 2,
  );
  const tlTurn = Math.round(
    (Math.max(input.card.b, input.timeline.label.t - 160) +
      input.timeline.label.t) /
      2,
  );
  let samples = 0;
  for (let t = 0; t < first; t += 2) {
    const [x, y] = pointAtLen(c.points, c.lens, t);
    if (y > tlTurn + CIRCUIT.CORNER + 1 && y < firstY - 1) {
      samples++;
      assert.ok(
        Math.abs(x - input.railX) < 1,
        `the outside run dips inward to x=${x.toFixed(1)} before the first node`,
      );
    }
  }
  assert.ok(samples > 10, "the outside lead must have enough samples to test");
});

test("the turns are rounded, and never wider than the room they have", () => {
  const c = buildCircuit(LAYOUTS["one row (lg+)"]);
  assert.match(c.d, / A /, "the corners are arcs, not mitres");
  assert.doesNotMatch(c.d, /[CQST] /, "no freehand curve on an orthogonal route");
  const radii = [...c.d.matchAll(/ A ([\d.]+) /g)].map((m) => Number(m[1]));
  assert.ok(radii.length >= 6, "one arc per turn");
  for (const r of radii) {
    assert.ok(r > 0 && r <= CIRCUIT.CORNER, `radius ${r} is out of bounds`);
  }
  // The first and last block on a row sit ~9px from the rails, so those two
  // turns MUST come in under the nominal radius or they are drawn across the
  // block at one end and clipped away at the other.
  assert.ok(
    radii.some((r) => r < CIRCUIT.CORNER),
    "a turn beside a block should have yielded",
  );
});

test("the travelling front follows the route it draws", () => {
  const c = buildCircuit(LAYOUTS["one row (lg+)"]);
  assert.deepEqual(pointAtLen(c.points, c.lens, 0), [c.points[0], c.points[1]]);
  const end = pointAtLen(c.points, c.lens, c.len);
  assert.ok(Math.abs(end[1] - c.y1) < 0.5, "it ends on the card's top edge");
  // …and it rounds the corners rather than cutting them: a sample taken part
  // way through the first turn must be off BOTH of the straights it joins.
  const [x, y] = pointAtLen(c.points, c.lens, 137 - 18 + (18 * Math.PI) / 4);
  assert.ok(x < c.points[0] - 1 && y > 1395 + 1, "the front is on the arc");
});

test("a block's two half-frames meet where the chain leaves it", () => {
  const c = buildCircuit(LAYOUTS["one row (lg+)"]);
  const { box, wireY, fromLeft } = c.boxes[0];
  const halves = [true, false].map((top) =>
    boxHalfPath(box, CIRCUIT.RADIUS, wireY, fromLeft, top),
  );
  const ends = halves.map((d) => d.match(/L ([\d.]+) ([\d.]+)$/).slice(1, 3));
  const starts = halves.map((d) => d.match(/^M ([\d.]+) ([\d.]+)/).slice(1, 3));
  assert.deepEqual(starts[0], starts[1], "both halves are released together");
  assert.deepEqual(ends[0], ends[1], "…and meet on the far side");
  assert.equal(Number(starts[0][0]), box.l, "released on the edge the chain arrives at");
  assert.equal(Number(ends[0][0]), box.r, "meeting on the edge it leaves by");
});

test("the card's two half-frames are exactly equal, so they meet at the bottom", () => {
  const [cw, ch] = [1376, 435];
  const halves = [1, -1].map((dir) => cardHalfPath(cw, ch, 16, 0.5, dir));
  // Endpoints only — an arc's parameters are rx ry rot laf sf x y, so a naive
  // number scrape would count the radii as coordinates.
  const seg = (d) => {
    const out = [];
    for (const m of d.matchAll(/([MLA])\s*([-\d.\s]+)/g)) {
      const n = m[2].trim().split(/\s+/).map(Number);
      out.push(m[1] === "A" ? [n[5], n[6]] : [n[0], n[1]]);
    }
    return out;
  };
  const len = (pts) =>
    pts.slice(1).reduce((s, p, i) => s + Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1]), 0);
  // Both halves carry the same two arcs, so equal chord length is equal length.
  assert.ok(Math.abs(len(seg(halves[0])) - len(seg(halves[1]))) < 0.01);
  for (const h of halves) {
    assert.match(h, new RegExp(`^M ${cw / 2}\\.0 `), "released at the top centre");
    assert.match(h, new RegExp(`L ${cw / 2}\\.0 `), "meeting at the bottom centre");
  }
});

test("the veil compensation is monotone — the chain never dims to cross the band", () => {
  const stops = circuitStops(1276, 1984, BAND.t, BAND.b);
  const seen = stops.map((s) => {
    const y = 1276 + s.offset * 708;
    return s.opacity * (1 - veilAt(y, BAND.t, BAND.b - BAND.t));
  });
  // The one dip permitted is the veil's own ceiling, at its peak.
  const floor = 1 - VEIL_A0;
  for (let i = 1; i < seen.length; i++) {
    assert.ok(
      seen[i] >= Math.min(seen[i - 1], floor) - 0.001,
      `as-seen alpha falls from ${seen[i - 1].toFixed(3)} to ${seen[i].toFixed(3)}`,
    );
  }
  assert.ok(stops.every((s) => s.opacity <= 1), "nothing is written past opaque");
  assert.equal(unveil(0.5, 0), 0.5, "no veil, no compensation");
  assert.equal(veilAt(1000, BAND.t, 516), 0, "and none outside the band at all");

  // The band is a SWELL, not a step. Zero at BOTH edges is what removes the
  // seam under the hero; a veil that opened at its peak is exactly the hard
  // line this replaced, and the compensation has to model the same curve or
  // the chain is written for a veil that is not there.
  const H = 516;
  assert.equal(veilAt(BAND.t, BAND.t, H), 0, "no veil at the band's top edge");
  assert.equal(veilAt(BAND.t + H, BAND.t, H), 0, "…nor at its bottom");
  assert.ok(
    Math.abs(veilAt(BAND.t + H * VEIL_PEAK, BAND.t, H) - VEIL_A0) < 1e-9,
    "the peak sits at VEIL_PEAK",
  );
  // Monotone up to the peak, monotone down after it — no kinks the CSS
  // gradient does not have.
  let prev = -1;
  for (let t = 0; t <= VEIL_PEAK; t += VEIL_PEAK / 20) {
    const v = veilAt(BAND.t + H * t, BAND.t, H);
    assert.ok(v >= prev - 1e-9, "the rise must not dip");
    prev = v;
  }
  prev = Infinity;
  for (let t = VEIL_PEAK; t <= 1; t += (1 - VEIL_PEAK) / 20) {
    const v = veilAt(BAND.t + H * t, BAND.t, H);
    assert.ok(v <= prev + 1e-9, "the fall must not rise");
    prev = v;
  }
});

test("the lead-in measures itself to within a fraction of a pixel", () => {
  // Against a dense sampling of the same cubic: the shipped 32 samples must
  // not drift, because the dash is cut from this number.
  const [cx, y0, railX, y1] = [1273, 2024, 565.5, 2515];
  const L = y1 - y0;
  const p = [
    [cx, y0],
    [cx, y0 + L * 0.42],
    [railX, y1 - L * 0.55],
    [railX, y1],
  ];
  let dense = 0;
  let [ax, ay] = p[0];
  for (let i = 1; i <= 4000; i++) {
    const t = i / 4000;
    const u = 1 - t;
    const x = u ** 3 * p[0][0] + 3 * u * u * t * p[1][0] + 3 * u * t * t * p[2][0] + t ** 3 * p[3][0];
    const y = u ** 3 * p[0][1] + 3 * u * u * t * p[1][1] + 3 * u * t * t * p[2][1] + t ** 3 * p[3][1];
    dense += Math.hypot(x - ax, y - ay);
    [ax, ay] = [x, y];
  }
  const got = leadLenFor(cx, y0, railX, y1);
  assert.ok(Math.abs(got - dense) / dense < 0.0005, `${got} vs ${dense}`);
});

test("a page without the pieces for a circuit gets none", () => {
  assert.equal(buildCircuit({ ...BASE, cells: [] }), null, "no cells");
  assert.equal(
    buildCircuit({ ...BASE, cells: ONE_ROW, card: { ...CARD, t: 1800 } }),
    null,
    "a card that has ridden up beside the band is not a route",
  );
  assert.equal(
    buildCircuit({ ...BASE, width: 150, railX: 7, cells: ONE_ROW }),
    null,
    "no room between the rails",
  );
});

/* ------------------------- the participation hub ------------------------- */

const HUB = { l: 1236.5, t: 4436, r: 1308.5, b: 4508 };
const WITH_HUB = { ...WITH_NEWS_FORK, hub: HUB };

test("the participation arms meet the hub on straight diagonals", () => {
  const c = buildCircuit(WITH_HUB);
  assert.ok(c);
  assert.ok(Number.isFinite(c.hubAt), "the hub is on the route");

  const cx = Math.round(WITH_HUB.width / 2);
  const hubX = Math.round((HUB.l + HUB.r) / 2);
  assert.equal(hubX, cx, "the fixture's hub is on the centre line");

  // The two participation arms are the FIRST pair (News adds the second).
  const [a, b] = c.arms.slice(0, 2);
  const endA = pointAtLen(a.points, a.lens, a.start + a.len);
  const endB = pointAtLen(b.points, b.lens, b.start + b.len);

  // Each arm lands ON the rim, aimed at the CENTRE — not at a shared point at
  // twelve o'clock. Two shallow lines converging above a circle leave an empty
  // wedge over each shoulder, which reads as the chain not reaching the node.
  const cy = (HUB.t + HUB.b) / 2;
  const r = (HUB.b - HUB.t) / 2;
  for (const [label, end] of [["first", endA], ["second", endB]]) {
    const dist = Math.hypot(end[0] - hubX, end[1] - cy);
    assert.ok(
      Math.abs(dist - r) < 0.01,
      `the ${label} arm must stop exactly on the rim (was ${dist.toFixed(2)}, r=${r})`,
    );
    assert.ok(end[1] < cy, `the ${label} arm arrives above the centre`);
  }
  // Mirrored about the centre line, and NOT the same point.
  assert.ok(Math.abs(endA[1] - endB[1]) < 0.01, "both land at the same height");
  assert.ok(
    Math.abs(hubX - endA[0] + (hubX - endB[0])) < 0.01,
    "and are mirrored either side of the centre",
  );
  assert.ok(
    Math.abs(endA[0] - endB[0]) > 1,
    "they are two landings on the rim, not one apex above it",
  );

  // Diagonal, and drawn as ONE straight line: emitRoute measures a move as
  // |dx| + |dy|, so a diagonal routed through it would be longer than it looks
  // and the front would visibly lag along it.
  const diagonals = c.runs.filter((r) => {
    const m = /^M ([\d.-]+) ([\d.-]+) L ([\d.-]+) ([\d.-]+)$/.exec(r.d);
    return m && Math.abs(+m[1] - +m[3]) > 1 && Math.abs(+m[2] - +m[4]) > 1;
  });
  assert.equal(diagonals.length, 2, "exactly two diagonals, one per card");
  for (const d of diagonals) {
    assert.doesNotMatch(d.d, / A /, "a diagonal never takes a corner arc");
    const m = /^M ([\d.-]+) ([\d.-]+) L ([\d.-]+) ([\d.-]+)$/.exec(d.d);
    assert.ok(
      Math.abs(d.len - Math.hypot(+m[3] - +m[1], +m[4] - +m[2])) < 0.05,
      "a diagonal's length is its true length, not its Manhattan distance",
    );
  }
});

test("the hub carries the chain across itself, and one line leaves it", () => {
  const c = buildCircuit(WITH_HUB);
  const hubX = Math.round((HUB.l + HUB.r) / 2);
  const reached = c.hubAt * c.len;

  // Across its own height the node IS the chain: nothing stroked, no front.
  assert.ok(
    c.hidden.some(
      ([a, b]) =>
        Math.abs(a - reached) < 0.05 && Math.abs(b - (reached + (HUB.b - HUB.t))) < 0.05,
    ),
    "the node's own height is a deliberate gap, like a stats cell",
  );
  assert.ok(
    c.frontGaps.some(
      ([a, b]) =>
        Math.abs(a - reached) < 0.05 && Math.abs(b - (reached + (HUB.b - HUB.t))) < 0.05,
    ),
    "and no travelling front rides over it",
  );

  // Below the hub the route is single again, on the centre line.
  const below = pointAtLen(c.points, c.lens, reached + (HUB.b - HUB.t) + 1);
  assert.equal(Math.round(below[0]), hubX, "one line leaves the hub, centred");
  assert.ok(below[1] > HUB.b - 1, "and it leaves downward");
});

test("the hub fails closed: no hub, or an off-centre one, keeps the square merge", () => {
  const none = buildCircuit(WITH_NEWS_FORK);
  assert.equal(none.hubAt, Infinity, "no hub means no hub junction");
  assert.equal(none.complete, true, "and the route still reaches its terminus");

  const offCentre = buildCircuit({
    ...WITH_HUB,
    hub: { ...HUB, l: HUB.l - 400, r: HUB.r - 400 },
  });
  assert.equal(offCentre.hubAt, Infinity, "an off-centre hub is ignored");

  const overlapping = buildCircuit({
    ...WITH_HUB,
    hub: { ...HUB, t: 4000, b: 4072 },
  });
  assert.equal(overlapping.hubAt, Infinity, "a hub above the pair is ignored");
});

/* ---------------------------- reading progress --------------------------- */

test("progress is paced by READING, so the front tracks the reader", () => {
  const c = buildCircuit(WITH_HUB);

  assert.equal(c.reads.length, c.lens.length, "reads share lens' indexing");
  assert.ok(
    c.reads.every((v, i) => i === 0 || v >= c.reads[i - 1]),
    "reading progress never goes backwards",
  );
  assert.ok(
    c.read < c.len,
    "horizontal travel is discounted, so reading progress is shorter than the route",
  );

  // Each step costs its vertical travel in full and its horizontal at weight.
  let parallels = 0;
  for (let i = 1; i < c.reads.length; i++) {
    const dx = Math.abs(c.points[i * 2] - c.points[(i - 1) * 2]);
    const dy = Math.abs(c.points[i * 2 + 1] - c.points[(i - 1) * 2 + 1]);
    const step = c.reads[i] - c.reads[i - 1];
    if (Math.abs(step - (dy + CIRCUIT.HORIZ_WEIGHT * dx)) > 1e-6) {
      // A parallel span, priced by the arms that travel it rather than by the
      // trunk's own step. It MUST cost something: the News link's trunk does
      // not move at all there, and a naive dy + dx pass would price it zero
      // and complete both arms in no scroll whatsoever.
      parallels++;
      assert.ok(step > 0, `parallel span ${i} costs no reading progress`);
    }
  }
  assert.equal(parallels, 2, "the participation fork and the News link");
});

test("lenAtRead inverts reads, and is clamped at both ends", () => {
  const c = buildCircuit(WITH_HUB);
  assert.equal(lenAtRead(c.reads, c.lens, -1e6), c.lens[0], "clamped below");
  assert.equal(
    lenAtRead(c.reads, c.lens, 1e9),
    c.lens[c.lens.length - 1],
    "clamped above",
  );
  // Round-tripping every stored point must land back on its own length.
  for (let i = 0; i < c.reads.length; i++) {
    assert.ok(
      Math.abs(lenAtRead(c.reads, c.lens, c.reads[i]) - c.lens[i]) < 1e-6,
      `point ${i} did not round-trip`,
    );
  }
  // …and it is monotonic in between, or the chain would retract mid-scroll.
  let prev = -Infinity;
  for (let r = 0; r <= c.read; r += c.read / 400) {
    const l = lenAtRead(c.reads, c.lens, r);
    assert.ok(l >= prev - 1e-9, "lenAtRead went backwards");
    prev = l;
  }
});
