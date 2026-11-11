/**
 * Pure geometry for the spine. DOM-free and import-free by design: every
 * function here is unit-testable from node:test, and the same numbers feed
 * the CSS rail, the SVG ornament and the assertions.
 */

export const RAIL_INSET_WIDE = 13; // px from the site column's left edge
export const RAIL_INSET_NARROW = 7;
export const SITE_MAX = 1440;

/** Clamp helper used across the module. */
export function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/**
 * The rail's x, in overlay pixels. Mirrors `mx-auto w-full max-w-site` plus
 * the Section gutter, so the rail keeps a constant clearance from the text
 * edge at every width. The CSS does the same sum without JS; this exists for
 * the SVG ornament (which needs real numbers) and for the tests.
 */
export function railXFor(overlayWidth: number): number {
  if (overlayWidth < 768) return RAIL_INSET_NARROW;
  return Math.max(0, (overlayWidth - SITE_MAX) / 2) + RAIL_INSET_WIDE;
}

/** Left edge of the centred content column, in overlay pixels. */
export function columnLeftFor(overlayWidth: number): number {
  return Math.max(0, (overlayWidth - SITE_MAX) / 2);
}

const STOPS: ReadonlyArray<readonly [number, readonly [number, number, number]]> = [
  [0, [0xa8, 0x56, 0xfb]], // accent
  [0.55, [0xd3, 0x3a, 0xee]], // accent-magenta
  [1, [0xf4, 0x5f, 0xc4]], // accent-pink
];

function hex(n: number): string {
  return n.toString(16).toUpperCase().padStart(2, "0");
}

/**
 * The document colour ramp: gradient-accent's three stops re-read as a
 * top-to-bottom journey down the page. One flat colour per trunk segment.
 */
export function rampColorAt(u: number): string {
  const t = clamp01(u);
  let i = 0;
  while (i < STOPS.length - 2 && t > STOPS[i + 1][0]) i++;
  const [t0, c0] = STOPS[i];
  const [t1, c1] = STOPS[i + 1];
  const f = t1 === t0 ? 0 : (t - t0) / (t1 - t0);
  return `#${hex(Math.round(c0[0] + (c1[0] - c0[0]) * f))}${hex(
    Math.round(c0[1] + (c1[1] - c0[1]) * f),
  )}${hex(Math.round(c0[2] + (c1[2] - c0[2]) * f))}`;
}

export type Segment = {
  top: number;
  height: number;
  /** Flat ramp colour sampled at the segment's midpoint. */
  color: string;
  /** Trunk dims across a section that carries its own vertical rail. */
  dim: boolean;
  /** Translucent band (section-surface) — the hairline needs more alpha. */
  surface: boolean;
};

export type SegmentInput = {
  top: number;
  bottom: number;
  dim?: boolean;
  surface?: boolean;
};

/**
 * Split the trunk into paintable segments. Splitting is not cosmetic: a
 * document-height promoted layer blows past the 4096px max texture size on
 * mobile GPUs and silently falls back to per-frame repaint.
 *
 * Tops and heights are integers, and each segment overlaps the next by 1px so
 * fractional scaleY can never open a hairline seam.
 */
export function splitSegments(
  spans: readonly SegmentInput[],
  docH: number,
  maxPx: number,
): Segment[] {
  const out: Segment[] = [];
  const safeDoc = Math.max(1, docH);
  for (const span of spans) {
    const top = Math.max(0, Math.round(span.top));
    const bottom = Math.min(Math.round(span.bottom), Math.round(safeDoc));
    const total = bottom - top;
    if (total <= 0) continue;
    const parts = Math.max(1, Math.ceil(total / maxPx));
    const each = total / parts;
    for (let i = 0; i < parts; i++) {
      const t = Math.round(top + each * i);
      const b = i === parts - 1 ? bottom : Math.round(top + each * (i + 1));
      const h = b - t;
      if (h <= 0) continue;
      out.push({
        top: t,
        height: h,
        color: rampColorAt((t + h / 2) / safeDoc),
        dim: Boolean(span.dim),
        surface: Boolean(span.surface),
      });
    }
  }
  return out;
}

/** Fork stubs grow with the margin they have to live in. */
export function forkLenFor(columnLeft: number): number {
  return Math.min(44, Math.max(13, 13 + columnLeft * 0.1));
}

/** The ghost strand only exists once there is real margin to hold it. */
export function ghostDxFor(columnLeft: number): number {
  return columnLeft >= 72 ? Math.min(72, 20 + columnLeft * 0.14) : 0;
}

/**
 * Act I: the single lazy cubic that carries the trunk from the hero node's
 * centre out to the rail. One curve, no elbow — a straight diagonal joint
 * reads as a kink in a world built from 110px blooms.
 */
export function leadPath(
  centreX: number,
  heroBottom: number,
  railX: number,
  reachY: number,
): string {
  const L = Math.max(1, reachY - heroBottom);
  return `M ${centreX.toFixed(1)} ${heroBottom.toFixed(1)} C ${centreX.toFixed(
    1,
  )} ${(heroBottom + L * 0.42).toFixed(1)}, ${railX.toFixed(1)} ${(
    reachY -
    L * 0.55
  ).toFixed(1)}, ${railX.toFixed(1)} ${reachY.toFixed(1)}`;
}

/**
 * The length of leadPath's cubic, without asking the DOM.
 *
 * getTotalLength() forces a synchronous style-and-layout pass, and it was
 * being called in the middle of measure()'s WRITE half — after ~200 attribute
 * writes — on a pass that now re-runs repeatedly while the stat numerals
 * count up. A 32-sample polyline is within 0.05% on a curve this lazy.
 */
export function leadLenFor(
  cx: number,
  y0: number,
  railX: number,
  y1: number,
): number {
  const L = Math.max(1, y1 - y0);
  const p = [
    [cx, y0],
    [cx, y0 + L * 0.42],
    [railX, y1 - L * 0.55],
    [railX, y1],
  ] as const;
  let len = 0;
  let px = p[0][0];
  let py = p[0][1];
  for (let i = 1; i <= 32; i++) {
    const t = i / 32;
    const u = 1 - t;
    const a = u * u * u;
    const b = 3 * u * u * t;
    const c = 3 * u * t * t;
    const d = t * t * t;
    const x = a * p[0][0] + b * p[1][0] + c * p[2][0] + d * p[3][0];
    const y = a * p[0][1] + b * p[1][1] + c * p[2][1] + d * p[3][1];
    len += Math.hypot(x - px, y - py);
    px = x;
    py = y;
  }
  return len;
}

/**
 * Convergence charge: a pure function of scroll position and velocity, so
 * reverse scrubbing walks back for free and nothing latches. The velocity
 * term is what lets a fast fling detonate the payoff while the hero is still
 * on screen; on scroll-up velocity is negative, so it never inflates.
 */
export function chargeFor(y: number, velocity: number, heroH: number): number {
  const h = Math.max(1, heroH);
  const start = h * 0.12;
  const span = h * 0.5;
  const scrollCharge = clamp01((y - start) / span);
  const predicted = clamp01((y + velocity * 0.35 - start) / span);
  return Math.max(scrollCharge, predicted);
}

/**
 * The completed opening's bounded handoff. Quartic ease-out leaves quickly,
 * lands flat, and never overshoots the network band.
 */
export function glideEase(t: number): number {
  const k = 1 - clamp01(t);
  return 1 - k * k * k * k;
}

/* ------------------------------ the circuit ------------------------------ */

/** A measured box in overlay coordinates. */
export type Box = { l: number; t: number; r: number; b: number };

export const CIRCUIT = {
  /** Node boxes stand off their cell by this much… */
  PAD_X: 10,
  PAD_Y: 9,
  /** …and never come closer than this to the vertical runs they hang off. */
  CLEAR: 4,
  RADIUS: 10,
  /** The chain's own corner radius, clamped to half its shorter neighbour. */
  CORNER: 18,
  /** Cells sharing this much of their height are on the same row. */
  ROW_OVERLAP: 0.5,
  /** Below this much room between the rails there is no circuit to draw. */
  MIN_SPAN: 160,
  /** Taps whose centres sit within this of each other are one COLUMN, and the
   *  chain runs straight down them instead of serpentining across rows. */
  COLUMN_TOL: 28,
  /** How far above the first node the chain jogs out of the margin rail into
   *  that column, so the corner is never drawn on top of a node. */
  COLUMN_LEAD: 34,
  /** The News fork runs in the clear gap above the three-card row, then drops
   *  into each side card's top centre. */
  NEWS_LEAD: 18,
  /** What a pixel of HORIZONTAL route costs in reading progress, against 1
   *  for a pixel of vertical.
   *
   *  The route crosses the page four times, so its length is nowhere near
   *  proportional to its height. Paced by length alone the front falls
   *  hundreds of pixels behind the reader through the band and the card, then
   *  overruns by as much again down the straight tail — the same scalar is
   *  wrong at both ends. Charging horizontal travel a fraction of the scroll
   *  it charges vertical travel makes progress track the READER, while still
   *  spending real scroll crossing the page so the threading is watchable. */
  HORIZ_WEIGHT: 0.12,
} as const;

export type CircuitInput = {
  /** Overlay width. The right-hand run mirrors railX across it. */
  width: number;
  /** Where the chain arrives from the hero: its centre x, the hero's bottom. */
  fromX: number;
  fromY: number;
  railX: number;
  /** Act II — the stats band, the cells it threads, and the label it skirts. */
  band: Box;
  label: Box | null;
  cells: readonly Box[];
  /** Act II's terminus: the first framed section the chain crosses. */
  card: Box;
  /** Act III — the timeline turned on its side. Omit and the chain ends on
   *  the card, exactly as it did before this existed. */
  timeline?: { section: Box; label: Box | null; points: readonly Box[] } | null;
  /** Act IV — a framed section, then a fork through two more, then a merge.
   *  All three are required, or the chain stops after Act III. */
  mine?: Box | null;
  branches?: readonly Box[] | null;
  /** The node the two participation arms converge on, below the pair. Given
   *  one, the arms meet it on straight diagonals and the chain leaves it as a
   *  single line; without one they turn square and merge as they always did. */
  hub?: Box | null;
  /** Act V — the last framed section. The chain runs straight down the middle
   *  to reach it, behind whatever sits between, and ends on it. */
  tail?: Box | null;
  /** A measured three-card News row between the participation merge and the
   *  tail. It fails closed when the grid wraps below lg. */
  news?: readonly Box[] | null;
};

/**
 * A stretch the chain draws IN PARALLEL with the trunk — one per fork arm.
 *
 * While the chain is in two places there is no single front, so the trunk's
 * own front hides (see `frontGaps`) and each strand carries one of its own.
 * Lengths are absolute along the whole route, so a strand needs no rebasing:
 * the same `k * len` that drives the trunk locates a point on it.
 */
export type Strand = {
  points: number[];
  lens: number[];
  /** Where this strand starts and ends along the whole route. */
  start: number;
  len: number;
  /** Absolute spans it does not stroke — the framed card it passes through. */
  gaps: [number, number][];
};

export type Circuit = {
  /** Path data for the whole visible route — several subpaths, because the
   *  chain does not draw where a block or a framed section carries it. */
  d: string;
  /** Flat [x0,y0,…] with a cumulative length per point, so the travelling
   *  front follows the ROUNDED route exactly and needs no DOM call. */
  points: number[];
  lens: number[];
  /** Cumulative READING progress per point — vertical travel at full rate,
   *  horizontal discounted by CIRCUIT.HORIZ_WEIGHT — and its total. Indexed
   *  exactly like `lens`, so `lenAtRead` converts one to the other. */
  reads: number[];
  read: number;
  /** Exact total length of the rounded route. */
  len: number;
  /** The scroll range that draws it. */
  y0: number;
  y1: number;
  /** 0..1 along the route at which the front reaches each stats-band cell,
   *  each timeline point, and each framed section (card, mine, …branches). */
  cellAt: number[];
  pointAt: number[];
  /** Always five — card, mine, branch 0, branch 1, tail — so the caller can
   *  zip it against its own element list. A frame the route did not reach is
   *  Infinity, which no progress ever passes. */
  frameAt: [number, number, number, number, number];
  /** Cumulative-length ranges the chain does not stroke: a node block or a
   *  framed section carries it there. */
  hidden: [number, number][];
  /** …and the ranges the travelling front must not appear in, which is those
   *  plus the fork, where there is no single place for it to be. */
  frontGaps: [number, number][];
  /** The fork's two arms, each with a front of its own for exactly the span
   *  `frontGaps` takes the trunk's away. Empty when the route does not fork. */
  arms: Strand[];
  /** The node block drawn around each stats cell, which side the chain enters,
   *  and the y at which it enters. */
  boxes: { box: Box; fromLeft: boolean; wireY: number }[];
  /** The route as separately drawn runs, each with its offset along the whole.
   *  Drawn per run rather than as one path: a dashoffset change invalidates a
   *  path's ENTIRE bounding box, and this route's is the width of the page. */
  runs: { d: string; len: number; start: number }[];
  /** Where the chain ends. */
  endX: number;
  endY: number;
  /** True once it has reached its last framed section: the circuit IS the
   *  whole chain on this page, and there is no margin rail left to hand to. */
  complete: boolean;
  /** Completion of the simultaneous News link, normalized to the whole route.
   *  Infinity means the cards are absent or no longer share one row. */
  newsAt: number;
  /** Where both participation arms land on the hub node, normalized. Infinity
   *  when there is no hub and the pair merges square, as it used to. */
  hubAt: number;
};

const ARC_SAMPLES = 8;

/** One waypoint. `draw` false means a block or frame carries the chain there;
 *  `cross`/`tap` name what ignites when the front arrives. */
type Move = {
  x: number;
  y: number;
  draw: boolean;
  cross: number;
  tap: number;
};

type Piece = { len: number; draw: boolean; cross: number; tap: number };
type Group = {
  x: number;
  y: number;
  ux: number;
  uy: number;
  len: number;
  pieces: Piece[];
};

type RouteOut = {
  runs: { d: string; len: number; start: number }[];
  points: number[];
  lens: number[];
  hidden: [number, number][];
  crossAt: Map<number, number>;
  tapAt: Map<number, number>;
  len: number;
};

/**
 * Turn a waypoint list into drawn runs, with the corners rounded.
 *
 * Corners get CIRCUIT.CORNER, clamped to half of each neighbouring straight
 * AND to the DRAWN room either side of the turn — the first and last block on
 * a row sit about a corner-radius from the rail, and an unclamped arc there is
 * painted across the block at one end and clipped away at the other, leaving
 * the chain to vanish for the width of the turn.
 */
function emitRoute(
  fromX: number,
  fromY: number,
  moves: readonly Move[],
  startCum: number,
): RouteOut | null {
  const empty: RouteOut = {
    runs: [],
    points: [],
    lens: [],
    hidden: [],
    crossAt: new Map(),
    tapAt: new Map(),
    len: 0,
  };
  if (moves.length === 0) return empty;

  /* ---- collapse collinear moves into straight groups ---- */
  const groups: Group[] = [];
  let px = fromX;
  let py = fromY;
  for (const m of moves) {
    const dx = m.x - px;
    const dy = m.y - py;
    const l = Math.abs(dx) + Math.abs(dy); // axis-aligned: one term is 0
    if (l <= 0) continue;
    const ux = dx / l;
    const uy = dy / l;
    const g = groups[groups.length - 1];
    if (g && g.ux === ux && g.uy === uy) {
      g.len += l;
      g.pieces.push({ len: l, draw: m.draw, cross: m.cross, tap: m.tap });
    } else {
      groups.push({
        x: px,
        y: py,
        ux,
        uy,
        len: l,
        pieces: [{ len: l, draw: m.draw, cross: m.cross, tap: m.tap }],
      });
    }
    px = m.x;
    py = m.y;
  }
  if (groups.length === 0) return empty;

  // How much DRAWN line each group has before its first crossing and after
  // its last: a corner arc may not reach into either.
  const room = groups.map((g) => {
    let head = 0;
    let lastEnd = 0;
    let seen = false;
    let d = 0;
    for (const pc of g.pieces) {
      if (!pc.draw) {
        if (!seen) head = d;
        seen = true;
        lastEnd = d + pc.len;
      }
      d += pc.len;
    }
    return seen ? { head, tail: g.len - lastEnd } : { head: g.len, tail: g.len };
  });

  const radii: number[] = [];
  for (let i = 0; i < groups.length - 1; i++) {
    radii.push(
      Math.min(
        CIRCUIT.CORNER,
        groups[i].len / 2,
        groups[i + 1].len / 2,
        room[i].tail,
        room[i + 1].head,
      ),
    );
  }

  /* ---- emit ---- */
  const out: RouteOut = {
    runs: [],
    points: [],
    lens: [],
    hidden: [],
    crossAt: new Map(),
    tapAt: new Map(),
    len: 0,
  };
  const f = (n: number) => (Math.round(n * 10) / 10).toString();
  let cum = startCum;

  for (let i = 0; i < groups.length; i++) {
    const g = groups[i];
    const rStart = i > 0 ? radii[i - 1] : 0;
    const rEnd = i < groups.length - 1 ? radii[i] : 0;
    const t0 = rStart;
    const t1 = g.len - rEnd;
    const ax = (d: number) => g.x + g.ux * d;
    const ay = (d: number) => g.y + g.uy * d;
    const cumAt = (d: number) => cum + (d - t0);

    if (i === 0) {
      out.points.push(ax(t0), ay(t0));
      out.lens.push(cum);
    }

    const drawn: [number, number][] = [];
    let d = 0;
    for (const pc of g.pieces) {
      const d0 = d;
      d += pc.len;
      const a = Math.max(d0, t0);
      const b = Math.min(d, t1);
      if (b <= a) continue;
      if (pc.cross >= 0) out.crossAt.set(pc.cross, cumAt(a));
      if (pc.tap >= 0) out.tapAt.set(pc.tap, cumAt(b));
      if (pc.draw) {
        const last = drawn[drawn.length - 1];
        if (last && Math.abs(last[1] - a) < 1e-6) last[1] = b;
        else drawn.push([a, b]);
      } else {
        out.hidden.push([cumAt(a), cumAt(b)]);
      }
    }

    const arcLen = (rEnd * Math.PI) / 2;
    let arcDrawn = false;
    for (let k = 0; k < drawn.length; k++) {
      const [a, b] = drawn[k];
      let dd = `M ${f(ax(a))} ${f(ay(a))} L ${f(ax(b))} ${f(ay(b))}`;
      let runLen = b - a;
      if (rEnd > 0 && k === drawn.length - 1 && Math.abs(b - t1) < 1e-6) {
        const g2 = groups[i + 1];
        const ex = g2.x + g2.ux * rEnd;
        const ey = g2.y + g2.uy * rEnd;
        const sweep = g.ux * g2.uy - g.uy * g2.ux > 0 ? 1 : 0;
        dd += ` A ${f(rEnd)} ${f(rEnd)} 0 0 ${sweep} ${f(ex)} ${f(ey)}`;
        runLen += arcLen;
        arcDrawn = true;
      }
      out.runs.push({ d: dd, len: runLen, start: cumAt(a) });
    }
    if (rEnd > 0 && !arcDrawn) {
      // The straight before this turn was entirely taken up by a block, so
      // the arc has no run to ride on. Give it its own, or the chain vanishes
      // for the width of the turn and reappears past it.
      const g2 = groups[i + 1];
      const ex = g2.x + g2.ux * rEnd;
      const ey = g2.y + g2.uy * rEnd;
      const sweep = g.ux * g2.uy - g.uy * g2.ux > 0 ? 1 : 0;
      out.runs.push({
        d: `M ${f(ax(t1))} ${f(ay(t1))} A ${f(rEnd)} ${f(rEnd)} 0 0 ${sweep} ${f(ex)} ${f(ey)}`,
        len: arcLen,
        start: cumAt(t1),
      });
    }

    cum = cumAt(t1);
    out.points.push(ax(t1), ay(t1));
    out.lens.push(cum);

    if (rEnd > 0) {
      const g2 = groups[i + 1];
      const c0x = ax(t1) + g2.ux * rEnd;
      const c0y = ay(t1) + g2.uy * rEnd;
      const th0 = Math.atan2(ay(t1) - c0y, ax(t1) - c0x);
      const sweep = g.ux * g2.uy - g.uy * g2.ux > 0 ? 1 : 0;
      const delta = (sweep ? 1 : -1) * (Math.PI / 2);
      for (let s = 1; s <= ARC_SAMPLES; s++) {
        const th = th0 + (delta * s) / ARC_SAMPLES;
        out.points.push(c0x + rEnd * Math.cos(th), c0y + rEnd * Math.sin(th));
        out.lens.push(cum + (arcLen * s) / ARC_SAMPLES);
      }
      cum += arcLen;
    }
  }
  out.len = cum - startCum;
  return out;
}

/** Rows of cells, grouped by VERTICAL OVERLAP. Rows are laid out `items-end`
 *  and `items-start`, so cells share a baseline or a top but not both: one
 *  label wrapping to two lines moves a top by a line-height while the row
 *  still reads as one row, and testing tops alone would serpentine a straight
 *  run. The threshold scales with the type instead of with a pixel tolerance. */
function rowsOf(cells: readonly Box[]): { y: number; cells: number[] }[] {
  const order = cells
    .map((_, i) => i)
    .sort((a, b) => cells[a].t - cells[b].t || cells[a].l - cells[b].l);
  const rows: { t: number; b: number; y: number; cells: number[] }[] = [];
  for (const i of order) {
    const c = cells[i];
    let row = null;
    for (const r of rows) {
      const shared = Math.min(r.b, c.b) - Math.max(r.t, c.t);
      if (shared > CIRCUIT.ROW_OVERLAP * Math.min(r.b - r.t, c.b - c.t)) {
        row = r;
        break;
      }
    }
    if (!row) {
      row = { t: c.t, b: c.b, y: 0, cells: [] };
      rows.push(row);
    }
    row.t = Math.min(row.t, c.t);
    row.b = Math.max(row.b, c.b);
    row.cells.push(i);
  }
  for (const r of rows) {
    // The mean of the cells' OWN centres, not the midpoint of their union
    // band — the union is biased by whichever cell is tallest.
    r.y = Math.round(
      r.cells.reduce((s, i) => s + (cells[i].t + cells[i].b) / 2, 0) /
        r.cells.length,
    );
    r.cells.sort((a, b) => cells[a].l - cells[b].l);
  }
  rows.sort((a, b) => a.t - b.t);
  return rows;
}

/**
 * The shared centre x of a COLUMN of taps, clamped between the rails — or
 * null if they are not a column.
 *
 * A vertical timeline stacks every node at one x, and the chain should simply
 * run down through them. A horizontal one spreads them across the row and
 * wants the serpentine instead. Deciding by MEASURED geometry rather than by
 * a breakpoint keeps the route honest at any width the grid happens to take.
 */
export function columnXOf(
  boxes: readonly Box[],
  lo: number,
  hi: number,
): number | null {
  if (boxes.length < 2) return null;
  let min = Infinity;
  let max = -Infinity;
  let sum = 0;
  for (const b of boxes) {
    const c = (b.l + b.r) / 2;
    if (c < min) min = c;
    if (c > max) max = c;
    sum += c;
  }
  if (max - min > CIRCUIT.COLUMN_TOL) return null;
  return Math.min(Math.max(Math.round(sum / boxes.length), lo), hi);
}

/**
 * The chain below the hero: a routed circuit, not a margin rail.
 *
 * Act II  down out of the hero, left above the band's label, down the rail,
 *         right through the cells — each of which becomes a BLOCK on it —
 *         down past the band, left to the middle, onto the card's top edge.
 * Act III across the card (its border is the chain), down, left around the
 *         timeline's label, down, right through the timeline's points, back
 *         to the middle, down onto the mining section.
 * Act IV  across it, then a FORK: two lines out to the two cards below,
 *         each becoming that card's border, meeting again in the middle.
 *
 * Every framed section and every node block is crossed WITHOUT stroke: its own
 * frame is the chain across its width. The route's length still runs through,
 * so the front leaves the far side on time.
 *
 * At lg+ each cell row is one line, which is what the design was drawn for.
 * Narrower, the grids wrap them onto two or three rows, so the run
 * serpentines: left-to-right across one, drop, right-to-left across the next.
 * With one row that degenerates to the single pass, which is why there is no
 * breakpoint branch here.
 */
export function buildCircuit(input: CircuitInput): Circuit | null {
  const { width, fromX, fromY, railX, band, label, cells, card } = input;
  const rightX = width - railX;
  const cx = Math.round(width / 2);
  if (cells.length === 0) return null;
  if (rightX - railX < CIRCUIT.MIN_SPAN) return null;
  // A layout where the card has ridden up beside the band is not a route.
  if (card.t <= band.b + 8 || band.t <= fromY) return null;

  // Crossing ids: the stats cells take 0..n-1, the framed sections take
  // FRAME0.. in the order Spine hands them over (card, mine, branch, branch).
  const FRAME0 = 1000;

  const moves: Move[] = [];
  let lx = fromX;
  let ly = fromY;
  const go = (x: number, y: number, draw = true, cross = -1, tap = -1) => {
    if (x === lx && y === ly && !(cross >= 0 || tap >= 0)) return;
    moves.push({ x, y, draw, cross, tap });
    lx = x;
    ly = y;
  };
  const mid = (a: number, b: number) => Math.round((a + b) / 2);
  const centreOf = (b: Box) => Math.round((b.l + b.r) / 2);

  /** Thread a row of boxes, marking each. `crossing` hides the chain behind
   *  them (a block carries it); otherwise they are taps ON the line. */
  const thread = (
    boxes: readonly Box[],
    rows: { y: number; cells: number[] }[],
    crossing: boolean,
    startX: number,
    idOf: (i: number) => number,
  ) => {
    let x = startX;
    rows.forEach((row, ri) => {
      go(x, row.y);
      const fromLeft = x <= railX + 1;
      const endX = fromLeft ? rightX : railX;
      const startX = x;
      const seq = fromLeft ? row.cells : [...row.cells].reverse();
      for (const ci of seq) {
        const b = boxes[ci];
        if (crossing) {
          go(fromLeft ? b.l : b.r, row.y);
          go(fromLeft ? b.r : b.l, row.y, false, idOf(ci));
        } else {
          // Clamped into the run: a node measured outside it (a mid-resize
          // frame, an overflowing grid) would send the chain backwards and
          // split the row into two groups facing opposite ways.
          const lo = Math.min(startX, endX);
          const hi = Math.max(startX, endX);
          go(Math.min(Math.max(centreOf(b), lo), hi), row.y, true, -1, idOf(ci));
        }
      }
      go(endX, row.y);
      x = endX;
      void ri;
    });
    return x;
  };

  /* ------------------------------- Act II ------------------------------- */
  const turnY1 = Math.round(
    label && label.t > band.t ? (band.t + label.t) / 2 : band.t + 40,
  );
  go(fromX, turnY1);
  go(railX, turnY1);

  const cellRows = rowsOf(cells);
  const boxes: { box: Box; fromLeft: boolean; wireY: number }[] = [];
  cellRows.forEach((row, ri) => {
    const fromLeft = ri % 2 === 0;
    for (const ci of row.cells) {
      const c = cells[ci];
      boxes[ci] = {
        fromLeft,
        wireY: row.y,
        box: {
          // Clamped off the runs: at 375px the content padding is 16 and the
          // rail is at 7, so an unclamped pad would put the block ON the wire.
          l: Math.max(c.l - CIRCUIT.PAD_X, railX + CIRCUIT.CLEAR),
          t: c.t - CIRCUIT.PAD_Y,
          r: Math.min(c.r + CIRCUIT.PAD_X, rightX - CIRCUIT.CLEAR),
          b: c.b + CIRCUIT.PAD_Y,
        },
      };
    }
  });
  const afterCells = thread(
    boxes.map((b) => b.box),
    cellRows,
    true,
    railX,
    (i) => i,
  );

  const cardCx = centreOf(card);
  go(afterCells, mid(band.b, card.t));
  go(cardCx, mid(band.b, card.t));
  go(cardCx, card.t);
  // Frame 0 — the chain crosses it as that card's own border.
  go(cardCx, card.b, false, FRAME0);

  /* ------------------------------ Act III ------------------------------- */
  const tl = input.timeline;
  let endX = cardCx;
  let endY = card.b;
  const frameIds: number[] = [FRAME0];

  let lastSectionB = card.b;
  if (tl && tl.points.length && tl.section.t > card.b + 8) {
    // ABOVE the label, in the gap left by the section before it. Halving
    // section-top to label-top (which is what Act II does, where the band has
    // 80px of its own padding) lands BELOW the label here: this section's
    // first child IS its label, so the two tops are the same pixel.
    const tlTurn = Math.round(
      tl.label && tl.label.t > card.b + 16
        ? (Math.max(card.b, tl.label.t - 160) + tl.label.t) / 2
        : tl.section.t + 24,
    );
    // Down a little, then round to the left AROUND the section's label.
    go(cardCx, tlTurn);
    go(railX, tlTurn);

    const colX0 = columnXOf(tl.points, railX, rightX);
    if (colX0 !== null) {
      // A column only a hairline right of the rail (here 0.5px, the node dots
      // sit essentially ON the rail) is NOT a jog. Left as-is it makes the run
      // into the first node a near-vertical segment meeting the pure-vertical
      // run below it, and rounding that ~collinear corner with an 18px radius
      // degenerates the arc into a SEMICIRCLE looped around the first dot (the
      // chord is twice the radius). Snap any sub-jog column flush to the rail so
      // the chain stays a straight line through every node. A real, inset column
      // (> railX + 1) still jogs in with proper corners.
      const colX = colX0 > railX + 1 ? colX0 : railX;
      // VERTICAL timeline: the nodes are stacked, so the chain runs straight
      // down through them and each one is a tap on the line.
      const order = tl.points
        .map((b, i) => ({ i, y: Math.round((b.t + b.b) / 2) }))
        .sort((a, b) => a.y - b.y);
      const firstY = order[0].y;
      // The node column sits INSIDE the content gutter, so a run dropped
      // straight into it from up here would be drawn through the section's
      // eyebrow and heading. Clear them down the margin rail first, then jog
      // across into the column — above the first node, so the corner is never
      // drawn on top of one. With no room for the jog, turn in directly.
      const lead = Math.min(
        CIRCUIT.COLUMN_LEAD,
        firstY - tlTurn - CIRCUIT.CORNER * 2,
      );
      if (colX > railX + 1 && lead >= CIRCUIT.CORNER) {
        go(railX, firstY - lead);
        go(colX, firstY - lead);
      }
      for (const { i, y } of order) go(colX, y, true, -1, i);
      endX = colX;
      endY = order[order.length - 1].y;
    } else {
      const pointRows = rowsOf(tl.points);
      endX = thread(tl.points, pointRows, false, railX, (i) => i);
      endY = pointRows[pointRows.length - 1].y;
    }
    lastSectionB = tl.section.b;
  }

  const mine = input.mine;
  if (mine && mine.t > lastSectionB + 8) {
    // Down the margin PAST the section, not straight across it — the nodes
    // sit at the top of their column and their prose hangs below them.
    const t = mid(lastSectionB, mine.t);
    go(endX, t);
    go(cx, t);
    go(cx, mine.t);
    go(cx, mine.b, false, FRAME0 + frameIds.length);
    frameIds.push(FRAME0 + frameIds.length);
    endX = cx;
    endY = mine.b;
  }

  /* ------------------------------ Act IV -------------------------------- */
  // The trunk stops at the fork; the branches are emitted separately so they
  // draw at the same time rather than one after the other.
  // Two straight drops out of the underside of the section above, rather
  // than a stub down the middle and a horizontal reach out to each. The frame
  // carries the chain across its own width, so a block with two children can
  // simply hang them off its bottom edge.
  const branches = input.branches ?? [];
  const forkY = endY;
  const canFork =
    branches.length === 2 &&
    mine !== null &&
    mine !== undefined &&
    endY === mine.b &&
    branches.every((b) => b.t > endY + 8) &&
    Math.abs(centreOf(branches[0]) - centreOf(branches[1])) > 40;

  const trunk = emitRoute(fromX, fromY, moves, 0);
  if (!trunk || trunk.runs.length === 0) return null;

  let runs = trunk.runs;
  let hidden = trunk.hidden;
  let pts = trunk.points;
  let lens = trunk.lens;
  let total = trunk.len;
  const crossAt = new Map(trunk.crossAt);
  const tapAt = new Map(trunk.tapAt);
  const frontGaps: [number, number][] = [...trunk.hidden];
  const strands: Strand[] = [];
  /** Where the participation arms land on the hub, absolute along the route. */
  let hubReachedLen = Infinity;
  /** Spans the trunk crosses as a REPEATED point — the parallel stretches,
   *  where two arms travel and the trunk merely waits. They have no spatial
   *  delta of their own, so reading progress has to be told what they cost or
   *  the arms would complete in no scroll at all. */
  const parallels: { atLen: number; read: number }[] = [];

  if (canFork) {
    const branchBottom = Math.max(branches[0].b, branches[1].b);
    // The hub only takes over if it really sits below the pair and on the
    // centre line; a wrapped or shifted layout keeps the square merge.
    const hubBox = input.hub ?? null;
    const hub =
      hubBox &&
      hubBox.t > branchBottom + 8 &&
      hubBox.b > hubBox.t &&
      Math.abs(centreOf(hubBox) - cx) <= CIRCUIT.COLUMN_TOL
        ? hubBox
        : null;
    const hubX = hub ? centreOf(hub) : cx;
    /** The node's centre and radius. Both arms are aimed at the CENTRE and
     *  stopped on the rim, rather than converging to a point at twelve
     *  o'clock: two shallow lines meeting above a circle leave an empty wedge
     *  over each of its shoulders, which reads as the chain not reaching it. */
    const hubCy = hub ? (hub.t + hub.b) / 2 : 0;
    const hubR = hub ? (hub.b - hub.t) / 2 : 0;
    const mergeY = hub
      ? hub.t
      : Math.round(
          branchBottom +
            Math.min(48, Math.max(24, (branches[0].b - branches[0].t) * 0.12)),
        );
    const arms = branches.map((b, i) => {
      const bx = centreOf(b);
      const arm: Move[] = [];
      let ax = bx;
      let ay = forkY;
      const push = (x: number, y: number, draw = true, cross = -1) => {
        if (x === ax && y === ay && cross < 0) return;
        arm.push({ x, y, draw, cross, tap: -1 });
        ax = x;
        ay = y;
      };
      push(bx, b.t);
      push(bx, b.b, false, FRAME0 + frameIds.length + i);
      if (!hub) {
        push(bx, mergeY);
        push(cx, mergeY);
      }
      const route = emitRoute(bx, forkY, arm, total);
      // …and with a hub, the last leg is a straight diagonal onto its rim,
      // landing where the line to the centre crosses it.
      if (hub && route) {
        const dx = hubX - bx;
        const dy = hubCy - b.b;
        const d = Math.hypot(dx, dy) || 1;
        appendSegment(
          route,
          bx,
          b.b,
          hubX - (dx / d) * hubR,
          hubCy - (dy / d) * hubR,
          total,
        );
      }
      return route;
    });
    const armLen = Math.max(...arms.map((a) => (a ? a.len : 0)));
    for (const a of arms) {
      if (!a) continue;
      runs = runs.concat(a.runs);
      hidden = hidden.concat(a.hidden);
      for (const [k, v] of a.crossAt) crossAt.set(k, v);
      for (const h of a.hidden) frontGaps.push(h);
      // …and each arm keeps a polyline of its own, so it can carry a front
      // for exactly the span the trunk's is taken away below.
      strands.push({
        points: a.points,
        lens: a.lens,
        start: total,
        len: a.len,
        gaps: a.hidden,
      });
    }
    // The front has no single place to be while the chain is in two places.
    frontGaps.push([total, total + armLen]);
    // …so the polyline simply steps to the merge, and stays monotonic.
    parallels.push({
      atLen: total + armLen,
      read: Math.max(...arms.map((a) => (a ? readCostOf(a.points) : 0))),
    });
    pts = pts.concat([hubX, mergeY]);
    lens = lens.concat([total + armLen]);
    total += armLen;
    frameIds.push(FRAME0 + frameIds.length, FRAME0 + frameIds.length + 1);
    endX = hubX;
    endY = mergeY;
    if (hub) {
      // The node ignites the moment both arms land on its rim.
      hubReachedLen = total;
      // Across its own height the node IS the chain, exactly as a stats cell
      // is: nothing is stroked there and no front rides over it.
      const nodeH = hub.b - hub.t;
      hidden.push([total, total + nodeH]);
      frontGaps.push([total, total + nodeH]);
      pts = pts.concat([hubX, hub.b]);
      lens = lens.concat([total + nodeH]);
      total += nodeH;
      endY = hub.b;
    }
  }

  /* ------------------------------- Act V -------------------------------- */
  // Straight down the middle to the last framed section. At a measured
  // three-column News row, the route pauses at one junction above the cards
  // while two parallel branches run to the side articles. Below lg the grid
  // wraps, the geometry gate fails, and the original straight tail remains.
  const tail = input.tail;
  let complete = false;
  let newsDoneLen = Infinity;
  if (tail && tail.t > endY + 8) {
    const tailCx = centreOf(tail);

    const appendTrunk = (piece: RouteOut | null) => {
      if (!piece) return;
      runs = runs.concat(piece.runs);
      hidden = hidden.concat(piece.hidden);
      for (const h of piece.hidden) frontGaps.push(h);
      for (const [k, v] of piece.crossAt) crossAt.set(k, v);
      // The first point repeats where the preceding route left off. Keeping
      // it would give pointAtLen a zero-length cumulative span.
      pts = pts.concat(piece.points.slice(2));
      lens = lens.concat(piece.lens.slice(1));
      total += piece.len;
    };

    const news =
      input.news?.length === 3
        ? [...input.news].sort((a, b) => a.l - b.l)
        : [];
    const [newsLeft, newsCentre, newsRight] = news;
    const newsRows = news.length === 3 ? rowsOf(news) : [];
    // The chain does not veer off above the row any more. It carries straight
    // on down the middle until it is level with the cards, and links them
    // along that line — BEHIND them, so it shows in the gutters and reads
    // through the glass, and all three light together when it lands.
    const newsLinkY = newsCentre
      ? Math.round((newsCentre.t + newsCentre.b) / 2)
      : Infinity;
    const canFanNews =
      news.length === 3 &&
      newsRows.length === 1 &&
      newsLeft.r < newsCentre.l &&
      newsCentre.r < newsRight.l &&
      newsCentre.l <= cx &&
      newsCentre.r >= cx &&
      endX === cx &&
      newsLinkY > endY + 8 &&
      newsLinkY < tail.t - 8;

    if (canFanNews) {
      appendTrunk(
        emitRoute(
          endX,
          endY,
          [{ x: cx, y: newsLinkY, draw: true, cross: -1, tap: -1 }],
          total,
        ),
      );
      endX = cx;
      endY = newsLinkY;

      const newsStart = total;
      const newsArms = [newsLeft, newsRight].map((b) => {
        const bx = centreOf(b);
        return emitRoute(
          cx,
          newsLinkY,
          [{ x: bx, y: newsLinkY, draw: true, cross: -1, tap: -1 }],
          newsStart,
        );
      });
      const newsLen = Math.max(...newsArms.map((a) => (a ? a.len : 0)));
      for (const a of newsArms) {
        if (!a) continue;
        runs = runs.concat(a.runs);
        strands.push({
          points: a.points,
          lens: a.lens,
          start: newsStart,
          len: a.len,
          gaps: a.hidden,
        });
      }
      // The trunk has no single position while the two branches travel. A
      // repeated spatial point with a later cumulative length makes it resume
      // from this exact junction once both fronts land.
      frontGaps.push([newsStart, newsStart + newsLen]);
      parallels.push({
        atLen: newsStart + newsLen,
        read: Math.max(...newsArms.map((a) => (a ? readCostOf(a.points) : 0))),
      });
      pts = pts.concat([cx, newsLinkY]);
      lens = lens.concat([newsStart + newsLen]);
      total += newsLen;
      newsDoneLen = total;
    }

    const tailMoves: Move[] = [];
    let tx = endX;
    let ty = endY;
    const step = (x: number, y: number, draw = true, cross = -1) => {
      if (x === tx && y === ty) return;
      tailMoves.push({ x, y, draw, cross, tap: -1 });
      tx = x;
      ty = y;
    };
    if (tailCx !== endX) {
      const t = mid(endY, tail.t);
      step(endX, t);
      step(tailCx, t);
    }
    step(tailCx, tail.t);
    step(tailCx, tail.b, false, FRAME0 + 4);
    const piece = emitRoute(endX, endY, tailMoves, total);
    if (piece) {
      appendTrunk(piece);
      endX = tailCx;
      endY = tail.b;
      complete = true;
    }
  }

  if (total <= 0) return null;

  // Reading progress per point, sharing `lens`' indexing so one binary search
  // converts between them. Built here, once per measure, never per frame.
  const reads: number[] = new Array(lens.length);
  reads[0] = 0;
  for (let i = 1; i < lens.length; i++) {
    const dx = Math.abs(pts[i * 2] - pts[(i - 1) * 2]);
    const dy = Math.abs(pts[i * 2 + 1] - pts[(i - 1) * 2 + 1]);
    // A parallel span is priced by the arms that actually travel it, not by
    // the trunk's own step: the trunk may not move at all there (the News
    // link) or may cut a straight line the arms never take (the fork). Left
    // to the default rule the first would cost NOTHING and complete in no
    // scroll, and the second would under-charge the diagonals.
    const par = parallels.find((p) => Math.abs(p.atLen - lens[i]) < 1e-6);
    reads[i] =
      reads[i - 1] + (par ? par.read : dy + CIRCUIT.HORIZ_WEIGHT * dx);
  }

  return {
    d: runs.map((r) => r.d).join(" "),
    points: pts,
    lens,
    reads,
    read: reads[reads.length - 1],
    len: total,
    y0: fromY,
    y1: endY,
    cellAt: Array.from({ length: cells.length }, (_, i) => (crossAt.get(i) ?? 0) / total),
    pointAt: tl
      ? Array.from({ length: tl.points.length }, (_, i) => (tapAt.get(i) ?? 0) / total)
      : [],
    frameAt: [0, 1, 2, 3, 4].map((i) => {
      const at = crossAt.get(FRAME0 + i);
      return at === undefined ? Infinity : at / total;
    }) as [number, number, number, number, number],
    hidden,
    frontGaps,
    arms: strands,
    boxes,
    runs,
    endX,
    endY,
    complete,
    newsAt: Number.isFinite(newsDoneLen) ? newsDoneLen / total : Infinity,
    hubAt: Number.isFinite(hubReachedLen) ? hubReachedLen / total : Infinity,
  };
}
/**
 * Route length at a given reading progress — the inverse of `reads`.
 *
 * Pure, allocation-free and O(log n): the render loop calls it once a frame,
 * so it must not walk the route and must not touch the DOM.
 */
/**
 * Append ONE straight segment to a finished route piece, with no corner arc.
 *
 * The participation arms leave their cards on a diagonal, which `emitRoute`
 * cannot express: it measures a move as `|dx| + |dy|`, because every other
 * turn on this page is axis-aligned and rounded. A diagonal measured that way
 * would be longer than it looks, and the front would visibly lag along it.
 */
function appendSegment(
  route: RouteOut,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  startCum: number,
): void {
  const l = Math.hypot(toX - fromX, toY - fromY);
  if (l <= 0) return;
  const n = (v: number) => (Math.round(v * 10) / 10).toString();
  route.runs.push({
    d: `M ${n(fromX)} ${n(fromY)} L ${n(toX)} ${n(toY)}`,
    len: l,
    start: startCum + route.len,
  });
  route.points.push(toX, toY);
  route.lens.push(startCum + route.len + l);
  route.len += l;
}

/** Reading cost of a polyline — the same price the trunk pays per step. */
function readCostOf(points: readonly number[]): number {
  let sum = 0;
  for (let i = 1; i * 2 + 1 < points.length; i++) {
    const dx = Math.abs(points[i * 2] - points[(i - 1) * 2]);
    const dy = Math.abs(points[i * 2 + 1] - points[(i - 1) * 2 + 1]);
    sum += dy + CIRCUIT.HORIZ_WEIGHT * dx;
  }
  return sum;
}

export function lenAtRead(
  reads: readonly number[],
  lens: readonly number[],
  target: number,
): number {
  const n = reads.length;
  if (n === 0) return 0;
  if (n === 1 || target <= reads[0]) return lens[0];
  if (target >= reads[n - 1]) return lens[n - 1];
  let lo = 1;
  let hi = n - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (reads[mid] < target) lo = mid + 1;
    else hi = mid;
  }
  const span = reads[lo] - reads[lo - 1];
  const t = span <= 0 ? 0 : (target - reads[lo - 1]) / span;
  return lens[lo - 1] + (lens[lo] - lens[lo - 1]) * t;
}

export function pointAtLen(
  points: readonly number[],
  lens: readonly number[],
  target: number,
): [number, number] {
  const n = lens.length;
  if (n === 0) return [0, 0];
  if (n === 1 || target <= lens[0]) return [points[0], points[1]];
  for (let i = 1; i < n; i++) {
    if (target <= lens[i] || i === n - 1) {
      const span = lens[i] - lens[i - 1];
      const t = span <= 0 ? 0 : clamp01((target - lens[i - 1]) / span);
      const x0 = points[(i - 1) * 2];
      const y0 = points[(i - 1) * 2 + 1];
      return [x0 + (points[i * 2] - x0) * t, y0 + (points[i * 2 + 1] - y0) * t];
    }
  }
  return [points[(n - 1) * 2], points[(n - 1) * 2 + 1]];
}

/**
 * HALF of a node block's rounded frame, from the point the chain enters to the
 * point it leaves — `top` picks which way round.
 *
 * The two halves are released together and meet on the far side, which is the
 * warning card's frame at cell scale: the block IS the chain across its own
 * width, which is why the wire is not drawn behind it. They are normalised
 * with pathLength, so an off-centre entry still lands both halves together.
 */
export function boxHalfPath(
  b: Box,
  radius: number,
  wireY: number,
  fromLeft: boolean,
  top: boolean,
): string {
  const r = Math.max(0, Math.min(radius, (b.r - b.l) / 2, (b.b - b.t) / 2));
  // Clamped past the corners, or an end would land on an arc.
  const ey = Math.min(Math.max(wireY, b.t + r), b.b - r);
  const inX = fromLeft ? b.l : b.r;
  const outX = fromLeft ? b.r : b.l;
  const edgeY = top ? b.t : b.b;
  const cornerY = top ? b.t + r : b.b - r;
  const inCorner = fromLeft ? b.l + r : b.r - r;
  const outCorner = fromLeft ? b.r - r : b.l + r;
  // Clockwise round the top from the left, and its mirror in each other case.
  const sweep = top === fromLeft ? 1 : 0;
  const f = (n: number) => n.toFixed(1);
  return (
    `M ${f(inX)} ${f(ey)} L ${f(inX)} ${f(cornerY)}` +
    ` A ${r} ${r} 0 0 ${sweep} ${f(inCorner)} ${f(edgeY)}` +
    ` L ${f(outCorner)} ${f(edgeY)}` +
    ` A ${r} ${r} 0 0 ${sweep} ${f(outX)} ${f(cornerY)}` +
    ` L ${f(outX)} ${f(ey)}`
  );
}

/**
 * The circuit's colour journey, as fractions of its own height.
 *
 * ACCENT PURPLE, the whole way down, at the exact value the hero descender now
 * lands on — so the two meet at the hero's edge with nothing to see.
 *
 * It used to open on teal, to match a descender that ended teal. Matching at
 * the boundary was the right instinct and the colour was the wrong one: the
 * junction went turquoise for a couple of hundred pixels and read as a
 * different line from the chain above and below it. Teal is reserved for the
 * things that MOVE on the chain — the glint, the travelling bolts, the head
 * tip — and for live telemetry. Never for the wire, and no longer for a
 * resting point: the terminus spark and both nodes' centre dots are gone.
 *
 * It stays a gradient rather than a flat stroke because circuitStops() still
 * has to lift its alpha where .section-surface veils it; the ramp is now
 * carrying contrast compensation, not hue.
 */
const RAMP: ReadonlyArray<readonly [number, readonly [number, number, number], number]> = [
  [0, [0xa8, 0x56, 0xfb], 0.8],
  [0.22, [0xa8, 0x56, 0xfb], 0.8],
  [1, [0xa8, 0x56, 0xfb], 0.78],
];

/** .section-surface is a translucent veil — 0.55 at the band's top edge,
 *  nothing by its bottom. Everything the spine draws BEHIND it loses that
 *  fraction of its contrast, and the circuit crosses the whole ramp. */
/** The veil's peak alpha… */
export const VEIL_A0 = 0.3;
/** …and where down the band it sits, as a fraction of the band's height.
 *  Together these ARE the CSS gradient's three stops: 0 at the top edge, the
 *  peak at VEIL_PEAK, 0 at the bottom. Change one, change the other. */
export const VEIL_PEAK = 0.22;
export function veilAt(y: number, bandTop: number, bandH: number): number {
  const h = Math.max(1, bandH);
  const t = (y - bandTop) / h;
  if (t < 0 || t > 1) return 0;
  return t < VEIL_PEAK
    ? VEIL_A0 * (t / VEIL_PEAK)
    : VEIL_A0 * ((1 - t) / (1 - VEIL_PEAK));
}

/**
 * The alpha to WRITE so that `seen` is what survives the veil.
 *
 * The cap is 1 — the physical ceiling — and NOT a comfort margin. A lower cap
 * silently swallows the compensation exactly where the veil is thickest, and
 * the as-seen curve then steps DOWN at the band's top border and climbs back
 * across it: the very artefact this exists to remove. Where the demand exceeds
 * 1 the best achievable is `1 - veil`, which is what this returns.
 */
export function unveil(seen: number, veil: number): number {
  return Math.min(1, seen / Math.max(0.25, 1 - veil));
}

/**
 * The circuit's gradient stops, veil-compensated.
 *
 * Sampled at the band's own edges rather than at fixed fractions: without
 * this the first horizontal run (which sits high in the band, under the
 * thickest part of the veil) reads about half as bright as the identical run
 * through the cell row, and the chain appears to fade and then recover for no
 * reason the eye can attribute to anything.
 */
export function circuitStops(
  y0: number,
  y1: number,
  bandTop: number,
  bandBottom: number,
): { offset: number; color: string; opacity: number }[] {
  const span = Math.max(1, y1 - y0);
  const h = Math.max(1, bandBottom - bandTop);
  // The band's own edges, because that is where the veil is; plus the ramp's
  // own breakpoints, because linear interpolation between samples would
  // otherwise round a corner of the ramp clean off.
  const offsets = [
    0,
    ...[
      bandTop,
      // The veil's own corner, and the midpoint of its falling limb: unveil()
      // is not linear in the veil, so the straight run between two samples
      // would cut the compensation curve short.
      bandTop + h * VEIL_PEAK,
      bandTop + h * (VEIL_PEAK + (1 - VEIL_PEAK) / 2),
      bandBottom,
    ].map((y) => clamp01((y - y0) / span)),
    ...RAMP.map((r) => r[0]),
    1,
  ].sort((a, b) => a - b);
  const out: { offset: number; color: string; opacity: number }[] = [];
  for (const offset of offsets) {
    // Strictly increasing, or the gradient renders undefined.
    if (out.length && offset <= out[out.length - 1].offset + 1e-4) continue;
    let i = 0;
    while (i < RAMP.length - 2 && offset > RAMP[i + 1][0]) i++;
    const [u0, c0, a0] = RAMP[i];
    const [u1, c1, a1] = RAMP[i + 1];
    const f = u1 === u0 ? 0 : (offset - u0) / (u1 - u0);
    out.push({
      offset,
      color: `#${hex(Math.round(c0[0] + (c1[0] - c0[0]) * f))}${hex(
        Math.round(c0[1] + (c1[1] - c0[1]) * f),
      )}${hex(Math.round(c0[2] + (c1[2] - c0[2]) * f))}`,
      opacity: unveil(
        a0 + (a1 - a0) * f,
        veilAt(y0 + offset * span, bandTop, h),
      ),
    });
  }
  return out;
}

/**
 * One half of a rounded rectangle's perimeter, top centre to bottom centre.
 * `dir` 1 runs clockwise down the right side, -1 anticlockwise down the left.
 *
 * The two halves are EXACTLY equal in length by symmetry, so energy released
 * at the top centre meets itself at the bottom — which is the whole point of
 * splitting the frame rather than drawing it as one loop.
 */
export function cardHalfPath(
  w: number,
  h: number,
  radius: number,
  inset: number,
  dir: 1 | -1,
): string {
  const x0 = inset;
  const y0 = inset;
  const x1 = w - inset;
  const y1 = h - inset;
  const r = Math.max(0, Math.min(radius - inset, (x1 - x0) / 2, (y1 - y0) / 2));
  const cx = w / 2;
  const sweep = dir > 0 ? 1 : 0;
  const nearX = dir > 0 ? x1 : x0;
  const cornerX = dir > 0 ? x1 - r : x0 + r;
  const f = (n: number) => n.toFixed(1);
  return `M ${f(cx)} ${f(y0)} L ${f(cornerX)} ${f(y0)} A ${r} ${r} 0 0 ${sweep} ${f(nearX)} ${f(y0 + r)} L ${f(nearX)} ${f(y1 - r)} A ${r} ${r} 0 0 ${sweep} ${f(cornerX)} ${f(y1)} L ${f(cx)} ${f(y1)}`;
}

/**
 * A wheel delta in pixels, whatever the device reports. deltaMode 1 is lines
 * and 2 is pages; taking deltaY at face value makes a line-mode mouse (Firefox
 * on Windows) need sixteen times the gesture to move the same distance.
 */
export function wheelPx(
  deltaY: number,
  deltaMode: number,
  lineHeight: number,
  pageHeight: number,
): number {
  if (deltaMode === 1) return deltaY * lineHeight;
  if (deltaMode === 2) return deltaY * Math.max(1, pageHeight);
  return deltaY;
}

/**
 * The scroll position that would produce a given hold progress — the inverse
 * of chargeFor's ramp. Feeding this in place of scrollY is what makes the held
 * sequence indistinguishable from a real slow scroll: one charge curve, one
 * set of thresholds, nothing special-cased downstream.
 */
export function lockScrollFor(progress: number, heroH: number): number {
  return Math.max(1, heroH) * (0.12 + 0.5 * clamp01(progress));
}

/**
 * Frame-rate-independent exponential approach. DESIGN.md forbids bounces, so
 * every continuous quantity uses this rather than a spring: critically damped
 * by construction, zero overshoot, visually identical when tuned.
 */
export function expStep(
  current: number,
  target: number,
  dt: number,
  tau: number,
): number {
  return current + (target - current) * (1 - Math.exp(-dt / Math.max(1, tau)));
}

/**
 * The head chases the reading line, but snaps rather than sweeping when the
 * jump is huge (F5 mid-page, an in-page anchor landing, route change) — a
 * 4000px whoosh on load looks like a bug, not a flourish.
 */
export function headStep(
  head: number,
  target: number,
  dt: number,
  viewportH: number,
): number {
  if (Math.abs(target - head) > 3 * viewportH) return target;
  return expStep(head, target, dt, 90);
}
