"use client";

import { useEffect, useRef } from "react";
import { useReducedMotion } from "motion/react";
import { CONVERGE, HERO_SCROLL_RATE, dagBus } from "@/lib/spine/bus";

/**
 * The hero's animated background: growing DAG filaments.
 *
 * Ornament with meaning (DESIGN.md): every ring is a block, every segment a
 * parent reference. Chains of tiny hollow rings grow node by node the way a
 * blockDAG grows block by block — tips advance in parallel, fork into
 * branches, and pulses of light travel the parent links like current; a
 * finished structure holds, then DIMS OUT IN PLACE and goes dark — never
 * gone, just hidden until the pointer or a bolt reveals it — and only
 * recycles later, invisibly, from the dark while a new chain ignites
 * elsewhere. Every chain flows ONE way (directed, acyclic), aimed
 * very loosely at the hero's focal point. Seeding is a shuffled GRID: every
 * ~140px cell owns a chain (perimeter cells often seed just beyond their
 * edge and stream into view), so almost no patch of screen lacks a chain —
 * visible or dark — for the pointer to find. ~30% of chains are born dark
 * and the rest go dark after their hold. A hidden INTERLINK web (dashed
 * lavender lines between neighbouring chains' closest rings) weaves the
 * field into one graph: each line is invisible until the pointer crosses it
 * — which pulses energy into BOTH chains it connects — or until a bolt's
 * wake reaches an endpoint. The pointer is part of it:
 * chains inside a small circle around the cursor (or a tap) glow — ghosts
 * included — and the touched ring fires a bolt downstream toward its tip.
 * Half of all bolts fire teal, and ~a fifth of chains are turquoise end to
 * end (the energy accent), over a faint dotted-column backdrop.
 *
 * Cost discipline: single 2D canvas, ≤ ~300 rings across ≤ 5 clusters, DPR
 * capped at 2, and NO O(n²) proximity pass — the edges ARE the DAG's parent
 * links. rAF pauses when the tab is hidden or the hero scrolls offscreen.
 * Reduced motion paints ONE static fully-grown frame. The canvas is
 * aria-hidden and pointer-transparent; nothing renders on top of it that
 * depends on it.
 */

// Brand ramp across the diagonal: magenta -> purple -> teal.
const STOPS: ReadonlyArray<readonly [number, number, number]> = [
  [211, 58, 238], // accent-magenta
  [168, 86, 251], // accent purple
  [44, 224, 206], // accent-teal
];

// Absolute ring cap. The working ceiling is computed per viewport in
// seedAll() and kept ABOVE the worst-case sum of per-chain caps — a binding
// ceiling churns half the field through runt-fades (the periodic
// empty-field bug). Dark chains cost ~nothing (alpha-0 rings short-circuit).
const HARD_RING_CAP = 3200;
// Blanket coverage: the canvas is carved into ~this-sized cells and every
// cell owns at least one chain (visible or dark), so almost no patch of
// screen is empty of something the pointer can reveal.
//
// That guarantee is DELIBERATELY RELAXED inside the laptop band below.
// Measured share of empty cells: 9% at 1280x820, 8% at 1440x760, 11% at
// 1512x900, 18% at 1728x900, 24% at 1800x900. It is not a bug and it is not
// recoverable: fewer chains over the same area is what "fewer chains" means,
// and gaps are the shape of it. The chains that remain land in distinct
// shuffled cells, so the field thins evenly rather than clumping, and
// POINTER_R_HOVER is wide enough to reach into a neighbouring cell from most
// of an empty one.
const CELL_PX = 140;
/**
 * Laptop-class widths get a thinner field.
 *
 * WHAT IS ACTUALLY HAPPENING, because the obvious story is wrong and I checked
 * it. The count is `cols * rows * 1.3` clamped to 84. It is tempting to say
 * laptops are crowded because they collide with that clamp, but at 1512 x 900
 * the raw count is 86, so the clamp removes two chains out of 86. It explains
 * almost nothing.
 *
 * The clamp is what thins the BIG screens. Measured in chains per home cell:
 * a phone sits at ~1.33, a tablet at ~1.31, and a 1512 laptop sat at ~1.30 —
 * all three at full natural density. A 1920 monitor sits at 1.00 and a 2560 at
 * 0.78, because there the clamp bites hard. So the large displays read well
 * precisely because they are already thinned, and the laptop read crowded
 * because nothing was thinning it. The band below does for laptops what the
 * clamp was already doing for monitors, and lands them at ~0.89 to 0.92, in
 * between the two.
 *
 * THE BAND IS NARROW AND DELIBERATE. 1280 to 1800 CSS pixels covers every
 * current MacBook (1440, 1470, 1512, 1710, 1728) and a laptop-sized window on
 * a larger display, which is the same picture at the same size. The upper edge
 * sits in the empty gap between the 16 inch at 1728 and the smallest common
 * external monitor at 1920, so the step lands where no real device does.
 *
 * TWO THINGS TO KNOW BEFORE RETUNING THIS.
 * (1) Density falls across the band rather than staying flat: `seeded` pins at
 *     84 while the cell count keeps growing, so 1280 lands at ~0.91 per cell
 *     and 1800 at ~0.76. The correction is weakest where the field was densest.
 *     Left alone because the owner asked for a flat 30% and every real MacBook
 *     width gets 29 to 30%; an 1800px window is the one place it over-thins.
 * (2) The count depends on hero HEIGHT as much as width, so showing or hiding a
 *     browser bookmarks bar can move a 1512 laptop between 72 and 84 chains
 *     before the band is applied. Any measurement taken here has to state the
 *     hero height it was taken at.
 */
const LAPTOP_MIN_PX = 1280;
const LAPTOP_MAX_PX = 1800;
const LAPTOP_DENSITY = 0.7;
const GROW_MS_MIN = 45; // per-tip growth cadence
const GROW_MS_MAX = 95;
const BRANCH_P = 0.16; // fork probability per growth step
const MAX_TIPS = 5; // parallel growth tips per cluster
// Each chain flows ONE way (the D in DAG): its direction is fixed at birth —
// aimed very loosely at the hero's focal point (horizontal centre, 20% up
// from the bottom) — and tips may wander only within this half-angle cone of
// it. A tip that would have to turn back retires instead. Some chains seed
// beyond the frame and grow into view (the canvas clips them; no overflow).
const FLOW_CONE = 0.7;
const AIM_JITTER = 0.9; // "very loosely": ±0.45 rad off the focal aim
// Pointer interactivity: chains within this radius of the cursor (or a tap)
// glow, and the nearest ring fires a bolt DOWNSTREAM toward its chain's tip.
// Sized to bridge a home-cell diagonal so a sweep always finds something.
const POINTER_R_HOVER = 85;
const POINTER_R_TAP = 105;
const POINTER_COOLDOWN_MS = 700; // per-chain, so hovering doesn't machine-gun
// Teal is the energy accent (DESIGN.md): half of all bolts fire teal
// regardless of where they start, and a fifth of chains are born turquoise
// end-to-end — prominent, while purple/magenta still carries the field.
const TEAL_PULSE_P = 0.5;
const TEAL_CHAIN_P = 0.22;
// Ghost chains: present in the graph, invisible until energy touches them —
// the pointer circle (or a bolt) makes them materialise, then they fade
// back into the dark as the energy decays.
const GHOST_P = 0.3;
const IN_MS = 300; // ring fade-in
// Long, WIDELY varied holds: the variance is what keeps chain lifecycles
// decorrelated across generations (tight holds re-synchronise into waves
// that periodically thin the field).
const HOLD_MIN_MS = 5000;
const HOLD_VAR_MS = 7000;
// Chains never visibly disappear: after their hold they DIM OUT in place
// (uniform, no dissolve) and go DARK — still in the graph, revealed by the
// pointer or a bolt like any ghost — then quietly recycle from the dark.
const FADE_MS = 900;
const DARK_MIN_MS = 12000;
const DARK_VAR_MS = 14000;
const ENERGY_DECAY_MS = 700; // birth flash / pulse wake half-life-ish
const RING_ALPHA = 0.74;
const PULSE_MAX = 14;

/** CSS uses the matching 768px media query and 70%/92.5% anchors. Keeping the
 *  choice scalar and local preserves the no-coordinate bus contract. */
function nodeFyFor(width: number) {
  return width < CONVERGE.NARROW_MAX
    ? CONVERGE.NODE_FY_NARROW
    : CONVERGE.NODE_FY;
}

type Ring = {
  x: number;
  y: number;
  r: number;
  born: number;
  color: string; // "r, g, b" cached at birth
  sprite: number; // glow sprite index (nearest hue stop)
  energy: number; // 1 at birth / on pulse pass, decays to 0
  parent: number; // index within the cluster, -1 for the seed
  kids: number;
};

type Tip = { node: number; angle: number; growAt: number; done: boolean };

type Home = {
  x0: number;
  y0: number;
  w: number;
  h: number;
  edge: "left" | "top" | "right" | null; // perimeter cells can seed outside
};

type Cluster = {
  rings: Ring[];
  tips: Tip[];
  cap: number;
  home: Home | null; // the cell this chain keeps re-seeding into
  dir: number; // this chain's flow direction (within the field's cone)
  state: "growing" | "holding" | "fading" | "dark";
  stateAt: number;
  hold: number;
  darkFor: number; // how long the chain stays dark before recycling
  gen: number; // bumped on respawn so stale pulses die
  pointerAt: number; // last pointer-triggered bolt (cooldown)
  convergedAt: number; // discharged into the hero block this epoch (0 = not yet)
  teal: boolean; // a turquoise chain, end to end
  ghost: boolean; // born dark: invisible until energy reveals it
};

type Pulse = {
  cluster: Cluster;
  gen: number;
  path: number[];
  t0: number;
  dur: number;
  sprite: number; // hue fixed at spawn; teal-biased (TEAL_PULSE_P)
  /** Convergence bolts get a virtual final node: the hero block, in canvas
   *  coordinates. The bolt leaves its chain and hops free space into it. */
  to?: { x: number; y: number };
};

// Cross-chain interlinks: one line between the closest ring pair of two
// neighbouring chains, weaving the whole field into a single web. Invisible
// until the pointer crosses the line (or its endpoints carry bolt energy).
type Interlink = {
  a: Cluster;
  ia: number;
  ga: number;
  b: Cluster;
  ib: number;
  gb: number;
};

type Drip = { x: number; y: number; v: number };

function mix(a: readonly [number, number, number], b: readonly [number, number, number], t: number) {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ] as const;
}

/** Smallest signed angle from `dir` to `a`, clamped into the flow cone. */
function clampToCone(a: number, dir: number) {
  const d = Math.atan2(Math.sin(a - dir), Math.cos(a - dir));
  return dir + Math.max(-FLOW_CONE, Math.min(FLOW_CONE, d));
}

/** Piecewise-linear colour along the magenta->purple->teal ramp. */
function rampAt(t: number) {
  const c =
    t < 0.5 ? mix(STOPS[0], STOPS[1], t * 2) : mix(STOPS[1], STOPS[2], (t - 0.5) * 2);
  return `${c[0]}, ${c[1]}, ${c[2]}`;
}

/** Soft radial glow sprite, pre-rendered once per hue stop. */
function makeSprite(rgb: readonly [number, number, number]) {
  const s = document.createElement("canvas");
  s.width = 32;
  s.height = 32;
  const c = s.getContext("2d");
  if (c) {
    const g = c.createRadialGradient(16, 16, 0, 16, 16, 16);
    g.addColorStop(0, "rgba(255, 255, 255, 0.85)");
    g.addColorStop(0.3, `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, 0.5)`);
    g.addColorStop(1, `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, 0)`);
    c.fillStyle = g;
    c.fillRect(0, 0, 32, 32);
  }
  return s;
}

export function DagField({ className }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const reduced = useReducedMotion();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let width = 0;
    let height = 0;
    let raf = 0;
    let last = performance.now();
    let running = false;
    let visible = true;

    const sprites = STOPS.map(makeSprite);
    let backdrop: HTMLCanvasElement | null = null;
    const clusters: Cluster[] = [];
    let pulses: Pulse[] = [];
    let drips: Drip[] = [];
    let pulseAt = 0;

    // Pointer state (canvas coords). The canvas stays pointer-events-none;
    // we listen on the window so hovering the hero copy still counts.
    let px = -1e4;
    let py = -1e4;
    let pointerR = POINTER_R_HOVER;
    let pointerUntil = 0;
    let ringCeiling = HARD_RING_CAP; // recomputed per viewport in seedAll
    let links: Interlink[] = [];
    let linkRebuildAt = 0;

    // Convergence: the field discharging into the hero block as you scroll.
    // Driven entirely by dagBus.charge, which is a pure function of scroll
    // position and velocity — so scrubbing back up walks it back for free.
    let converge: Pulse[] = [];
    let convergeOrder: number[] = [];
    let convergeIdx = 0;
    let orderDirty = true;
    let convEpoch = dagBus.epoch;
    let released = 0;
    let arrivals = 0;

    const teal = (base: number) => (Math.random() < TEAL_PULSE_P ? 2 : base);

    const onPointer = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      px = e.clientX - rect.left;
      py = e.clientY - rect.top;
      const tap = e.type === "pointerdown";
      pointerR = tap ? POINTER_R_TAP : POINTER_R_HOVER;
      // A tap keeps the circle alive long enough to see the bolt; hover
      // refreshes continuously while moving.
      pointerUntil = performance.now() + (tap ? 650 : 160);
    };

    /* ------------------------- static texture layers ------------------------ */

    // Faint dotted columns (the reference artwork's "digital rain" backdrop).
    const buildBackdrop = () => {
      const b = document.createElement("canvas");
      b.width = Math.max(1, Math.round(width * dpr));
      b.height = Math.max(1, Math.round(height * dpr));
      const c = b.getContext("2d");
      if (c) {
        c.setTransform(dpr, 0, 0, dpr, 0, 0);
        for (let x = 24; x < width; x += 54) {
          const teal = Math.random() < 1 / 6;
          const alpha = 0.025 + Math.random() * 0.03;
          c.fillStyle = teal
            ? `rgba(44, 224, 206, ${alpha.toFixed(3)})`
            : `rgba(201, 169, 255, ${alpha.toFixed(3)})`;
          for (let y = 4; y < height; y += 7) c.fillRect(x, y, 1, 1);
        }
      }
      backdrop = b;
    };

    const seedDrips = () => {
      const n = Math.min(12, Math.max(5, Math.round(width / 150)));
      drips = Array.from({ length: n }, () => ({
        x: 24 + Math.floor(Math.random() * ((width - 24) / 54)) * 54,
        y: Math.random() * height,
        v: 10 + Math.random() * 16,
      }));
    };

    /* ----------------------------- DAG growth ------------------------------ */

    const colorFor = (x: number, y: number, forceTeal: boolean) => {
      const t = forceTeal
        ? 0.78 + Math.random() * 0.22
        : Math.min(
            1,
            Math.max(
              0,
              0.65 * (x / Math.max(1, width)) +
                0.35 * (y / Math.max(1, height)) +
                (Math.random() - 0.5) * 0.12,
            ),
          );
      return { color: rampAt(t), sprite: t < 0.3 ? 0 : t < 0.72 ? 1 : 2 };
    };

    const newRing = (
      x: number,
      y: number,
      r: number,
      parent: number,
      now: number,
      forceTeal: boolean,
    ): Ring => {
      const { color, sprite } = colorFor(x, y, forceTeal);
      return { x, y, r, born: now, color, sprite, energy: 1, parent, kids: 0 };
    };

    const totalRings = () => clusters.reduce((n, c) => n + c.rings.length, 0);

    const initCluster = (c: Cluster, now: number) => {
      // Seed inside the chain's home cell — the grid is what guarantees
      // blanket coverage, and respawning into the same cell keeps it even
      // as chains recycle. Perimeter homes often seed just beyond their
      // edge so chains still visibly enter from outside the frame.
      let bx = width / 2;
      let by = height / 2;
      if (c.home) {
        const h = c.home;
        bx = h.x0 + Math.random() * h.w;
        by = h.y0 + Math.random() * h.h;
        if (h.edge && Math.random() < 0.45) {
          if (h.edge === "left") bx = -width * (0.01 + Math.random() * 0.05);
          else if (h.edge === "right")
            bx = width * (1.01 + Math.random() * 0.05);
          else by = -height * (0.01 + Math.random() * 0.05);
        }
      } else {
        bx = width * (0.05 + Math.random() * 0.9);
        by = height * (0.06 + Math.random() * 0.84);
      }
      c.teal = Math.random() < TEAL_CHAIN_P;
      c.ghost = Math.random() < GHOST_P;
      const seed = newRing(bx, by, 2.2, -1, now, c.teal);
      if (c.ghost) seed.energy = 0.35; // ghosts get only a faint birth glint
      c.rings = [seed];
      // Aim very loosely at the focal point: horizontal centre, 30% up from
      // the bottom — the hero node's anchor, so the whole field is already
      // pointed at the block it will eventually discharge into.
      const fdx = width * 0.5 - bx;
      const fdy = height * nodeFyFor(width) - by;
      c.dir =
        (Math.hypot(fdx, fdy) < 60
          ? Math.random() * Math.PI * 2
          : Math.atan2(fdy, fdx)) +
        (Math.random() - 0.5) * AIM_JITTER;
      // Both tips point downstream, splayed apart — the chain forks forward,
      // never backward (directed, acyclic).
      const splay = 0.15 + Math.random() * 0.3;
      c.tips = [
        { node: 0, angle: c.dir - splay, growAt: now + Math.random() * 120, done: false },
        { node: 0, angle: c.dir + splay, growAt: now + Math.random() * 120, done: false },
      ];
      c.cap = 20 + Math.round(Math.random() * 16);
      c.state = "growing";
      c.stateAt = now;
      c.hold = HOLD_MIN_MS + Math.random() * HOLD_VAR_MS;
      c.darkFor = DARK_MIN_MS + Math.random() * DARK_VAR_MS;
      c.gen++;
      c.pointerAt = 0;
      c.convergedAt = 0;
    };

    const settle = (c: Cluster, now: number) => {
      // A chain that retired before amounting to anything (seeded too close
      // to the downstream edge) goes straight to the dark and recycles fast.
      if (c.rings.length < 6) {
        c.state = "dark";
        c.darkFor = 3000;
      } else {
        c.state = "holding";
      }
      c.stateAt = now;
      for (const t of c.tips) t.done = true;
    };

    const grow = (c: Cluster, now: number) => {
      for (const tip of c.tips) {
        if (tip.done) continue;
        // Bounded catch-up so a stalled frame never bursts a whole branch.
        let steps = 0;
        while (now >= tip.growAt && steps < 3) {
          steps++;
          if (c.rings.length >= c.cap || totalRings() >= ringCeiling) {
            tip.done = true;
            break;
          }
          const p = c.rings[tip.node];
          // Mostly straight runs with occasional sharp elbows — but always
          // clamped into the flow cone: a chain never turns back on itself.
          tip.angle = clampToCone(
            tip.angle +
              (Math.random() < 0.15
                ? (Math.random() < 0.5 ? 1 : -1) * (0.7 + Math.random() * 0.6)
                : (Math.random() - 0.5) * 0.45),
            c.dir,
          );
          const r = 1.5 + Math.random() * 0.9 + (Math.random() < 0.12 ? 1 : 0);
          // Beads with generous air between them, plus the odd connector.
          const gap =
            Math.random() < 0.14 ? 15 + Math.random() * 10 : 4 + Math.random() * 5.5;
          const step = p.r + r + gap;
          const nx = p.x + Math.cos(tip.angle) * step;
          const ny = p.y + Math.sin(tip.angle) * step;
          if (nx < -40 || nx > width + 40 || ny < -40 || ny > height + 40) {
            // Far side of the frame reached: the tip retires — turning
            // around would break the chain's one direction.
            tip.done = true;
            break;
          }
          const ring = newRing(nx, ny, r, tip.node, now, c.teal);
          if (c.ghost) ring.energy = 0.35;
          c.rings.push(ring);
          p.kids++;
          tip.node = c.rings.length - 1;
          tip.growAt = Math.max(
            tip.growAt + GROW_MS_MIN + Math.random() * (GROW_MS_MAX - GROW_MS_MIN),
            now - 200,
          );
          // Fork: a parallel branch from the block just added, still forward.
          if (
            Math.random() < BRANCH_P &&
            c.tips.filter((t) => !t.done).length < MAX_TIPS &&
            c.rings.length < c.cap - 4
          ) {
            c.tips.push({
              node: tip.node,
              angle: clampToCone(
                tip.angle +
                  (Math.random() < 0.5 ? 1 : -1) * (0.55 + Math.random() * 0.6),
                c.dir,
              ),
              growAt: now + GROW_MS_MIN + Math.random() * GROW_MS_MAX,
              done: false,
            });
          }
        }
      }
      if (c.rings.length >= c.cap || c.tips.every((t) => t.done)) settle(c, now);
    };

    // Link each chain to its ≤3 nearest neighbour chains via the closest
    // ring pair (stride-sampled — this is ornament, not routing). Rebuilt
    // periodically because chains grow and recycle; stale links are dropped
    // per-frame by their gen stamps.
    const rebuildLinks = () => {
      links = [];
      for (let i = 0; i < clusters.length; i++) {
        const A = clusters[i];
        if (A.rings.length < 4) continue;
        const neigh = clusters
          .map((B, j) => ({
            B,
            d:
              j <= i || B.rings.length < 4
                ? Infinity
                : Math.hypot(
                    A.rings[0].x - B.rings[0].x,
                    A.rings[0].y - B.rings[0].y,
                  ),
          }))
          .filter((e) => e.d < 320)
          .sort((x, y) => x.d - y.d)
          .slice(0, 3);
        for (const { B } of neigh) {
          let best = Infinity;
          let bia = -1;
          let bib = -1;
          for (let ia = 0; ia < A.rings.length; ia += 2) {
            const ra = A.rings[ia];
            for (let ib = 0; ib < B.rings.length; ib += 2) {
              const rb = B.rings[ib];
              const d2 = (ra.x - rb.x) ** 2 + (ra.y - rb.y) ** 2;
              if (d2 < best) {
                best = d2;
                bia = ia;
                bib = ib;
              }
            }
          }
          if (bia >= 0 && best < 260 * 260) {
            links.push({ a: A, ia: bia, ga: A.gen, b: B, ib: bib, gb: B.gen });
          }
        }
      }
    };

    /** The root-to-nearest-descendant route a convergence bolt can actually
     *  travel. A seed can occasionally be the ring nearest the node; that
     *  produces a one-node path and is decoration, not a releasable bolt. */
    const pathIntoNode = (c: Cluster, tx: number, ty: number) => {
      let best = -1;
      let bd = Infinity;
      for (let i = 0; i < c.rings.length; i++) {
        const d = (c.rings[i].x - tx) ** 2 + (c.rings[i].y - ty) ** 2;
        if (d < bd) {
          bd = d;
          best = i;
        }
      }
      const path: number[] = [];
      for (let i = best; i !== -1; i = c.rings[i].parent) path.push(i);
      path.reverse();
      return path;
    };

    /** Chains discharge farthest-first, so the field closes in on the block
     *  from its perimeter. Each individual bolt still runs downstream from
     *  its root to the ring nearest the block, then makes the final hop in. */
    const buildOrder = () => {
      const tx = width * 0.5;
      const ty = height * nodeFyFor(width);
      convergeOrder = clusters
        .map((c, i) => ({
          i,
          eligible: pathIntoNode(c, tx, ty).length >= 2,
          d: c.rings.length >= 3
            ? (c.rings[0].x - tx) ** 2 + (c.rings[0].y - ty) ** 2
            : Infinity,
        }))
        .filter((e) => e.eligible && Number.isFinite(e.d))
        .sort((a, b) => b.d - a.d)
        .map((e) => e.i);
    };

    /**
     * Release one chain into the hero block: the whole chain wakes at once
     * (dark and ghost chains visibly APPEAR), then a teal bolt runs it from
     * root to the ring nearest the block and hops free space into the block.
     */
    const releaseConverge = (c: Cluster, now: number) => {
      if (c.convergedAt || c.rings.length < 3) return;
      c.convergedAt = now;
      const tx = width * 0.5;
      const ty = height * nodeFyFor(width);
      const path = pathIntoNode(c, tx, ty);
      if (path.length < 2) return;
      // The overshoot buys ~250ms at full brightness before any visible dim;
      // both consumers clamp to 1, so no new field is needed on Ring.
      for (const idx of path) {
        c.rings[idx].energy = Math.max(c.rings[idx].energy, CONVERGE.ENERGY);
      }
      // A dark chain must not recycle mid-bolt and leave a hole in the wave.
      if (c.state === "dark") c.darkFor += CONVERGE.RECYCLE_DEFER_MS;
      converge.push({
        cluster: c,
        gen: c.gen,
        path,
        t0: now,
        dur:
          (Math.min(450, Math.max(160, path.length * 34)) + CONVERGE.HOP_MS) /
          HERO_SCROLL_RATE,
        sprite: 2, // always teal: machine energy arriving at the block
        to: { x: tx, y: ty },
      });
      released++;
    };

    const update = (now: number) => {
      /* ---- convergence: released in update(), not draw(), so the injected
         energy lands on the same frame that computes alphas ---- */
      if (dagBus.epoch !== convEpoch) {
        convEpoch = dagBus.epoch;
        converge.length = 0;
        convergeIdx = 0;
        released = 0;
        arrivals = 0;
        convergeOrder.length = 0;
        for (const c of clusters) c.convergedAt = 0;
        orderDirty = true;
      }
      const ch = dagBus.charge;
      if (ch <= 0.02) {
        convergeIdx = 0;
        if (ch === 0) {
          converge.length = 0;
          for (const c of clusters) c.convergedAt = 0;
          released = 0;
          arrivals = 0;
          convergeOrder.length = 0;
        }
        orderDirty = true;
      } else {
        if (orderDirty) {
          buildOrder();
          orderDirty = false;
        }
        const want = Math.min(
          convergeOrder.length,
          Math.ceil(ch * convergeOrder.length),
        );
        // Scrubbing up re-arms the counter; bolts already in flight still land.
        if (want < convergeIdx) convergeIdx = want;
        const cap = dagBus.lean ? 12 : CONVERGE.MAX;
        while (convergeIdx < want && converge.length < cap) {
          const c = clusters[convergeOrder[convergeIdx++]];
          if (c) releaseConverge(c, now);
        }
      }

      if (now >= linkRebuildAt) {
        rebuildLinks();
        linkRebuildAt = now + 1200;
      }
      for (const c of clusters) {
        if (c.state === "growing") grow(c, now);
        else if (c.state === "holding") {
          if (now > c.stateAt + c.hold) {
            c.state = "fading";
            c.stateAt = now;
          }
        } else if (c.state === "fading") {
          // Dimmed out — not gone. The chain goes dark in place, still
          // pointer-revealable, and only recycles later from the dark.
          if (now > c.stateAt + FADE_MS + 60) {
            c.state = "dark";
            c.stateAt = now;
          }
        } else if (now > c.stateAt + c.darkFor) {
          initCluster(c, now);
        }
      }

      // Publish for the spine: arrivals advance against the complete queue, a
      // stable denominator that cannot jump backwards as new batches release.
      // A lull after a partial gesture is not completion: `live` waits until
      // the full outside-in queue has been considered and every real bolt has
      // landed. Otherwise the first small scroll can fire the node, release
      // the hold, and let the actual finish run behind the sticky header.
      dagBus.released = released;
      dagBus.arrivals = arrivals;
      dagBus.total = convergeOrder.length;
      dagBus.live =
        convergeIdx >= convergeOrder.length &&
        convergeOrder.length > 0 &&
        released >= convergeOrder.length &&
        arrivals >= released
          ? 1
          : 0;
    };

    /* ------------------------------- render -------------------------------- */

    const alphas: number[] = [];

    /**
     * Advance and draw one bolt. Returns false when it is finished.
     *
     * A convergence bolt carries a VIRTUAL FINAL NODE (`pl.to`, the hero
     * block) that is not a ring, so both energy writes must be guarded: the
     * hop's head index runs one past the end of `path`, and an unguarded
     * `rings[path[length]].energy` throws inside the rAF and kills the field
     * permanently.
     */
    const stepPulse = (pl: Pulse, now: number, isConverge: boolean) => {
      if (pl.gen !== pl.cluster.gen) return false;
      // A dimming chain still discharges — the wave must not develop holes.
      if (!isConverge && pl.cluster.state === "fading") return false;
      const rings = pl.cluster.rings;
      const p = (now - pl.t0) / pl.dur;
      if (p >= 1) {
        if (pl.to) {
          if (isConverge) arrivals++;
        } else {
          const last = rings[pl.path[pl.path.length - 1]];
          if (last) last.energy = 1;
        }
        return false;
      }
      const segs = pl.to ? pl.path.length : pl.path.length - 1;
      if (segs < 1) return false;
      const nodeAt = (k: number) =>
        k < pl.path.length ? rings[pl.path[k]] : pl.to!;
      const posAt = (q: number) => {
        const f = q * segs;
        const i = Math.min(segs - 1, Math.max(0, Math.floor(f)));
        const fr = f - i;
        const a = nodeAt(i);
        const b = nodeAt(i + 1);
        if (!a || !b) return { x: 0, y: 0, i, bad: true };
        return { x: a.x + (b.x - a.x) * fr, y: a.y + (b.y - a.y) * fr, i };
      };
      const head = posAt(p);
      if ("bad" in head) return false;
      if (head.i < pl.path.length) {
        const wake = rings[pl.path[head.i]];
        if (wake) wake.energy = 1; // luminous wake
      }
      const sprite = sprites[pl.sprite];
      // Teal bolts are the energy accent: a touch larger and brighter
      // than the brand-hued majority (prominent, still secondary).
      const isTeal = pl.sprite === 2;
      const gain = Math.sin(p * Math.PI);
      for (let k = 3; k >= 1; k--) {
        const tq = p - k * 0.045;
        if (tq <= 0) continue;
        const tp = posAt(tq);
        if ("bad" in tp) continue;
        const s = (isTeal ? 11.5 : 10) - k * 2;
        ctx.globalAlpha = (0.3 / k) * gain;
        ctx.drawImage(sprite, tp.x - s / 2, tp.y - s / 2, s, s);
      }
      const hs = isTeal ? 15 : 13;
      ctx.globalAlpha = (isTeal ? 0.95 : 0.85) * gain;
      ctx.drawImage(sprite, head.x - hs / 2, head.y - hs / 2, hs, hs);
      ctx.globalAlpha = 1;
      ctx.fillStyle = `rgba(255, 255, 255, ${(0.9 * gain).toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(head.x, head.y, isTeal ? 1.3 : 1.1, 0, Math.PI * 2);
      ctx.fill();
      return true;
    };

    const draw = (now: number, dt: number, isStatic: boolean) => {
      ctx.clearRect(0, 0, width, height);
      if (backdrop) ctx.drawImage(backdrop, 0, 0, width, height);

      if (!isStatic) {
        ctx.fillStyle = "rgba(201, 169, 255, 0.1)";
        for (const d of drips) {
          d.y += (d.v * dt) / 1000;
          if (d.y > height + 4) {
            d.y = -4;
            d.x = 24 + Math.floor(Math.random() * ((width - 24) / 54)) * 54;
          }
          ctx.fillRect(d.x, d.y, 1, 3);
        }
      }

      /* The interlink web — under the chains. Invisible at rest: a line
         lights up where the pointer crosses it (feeding energy into BOTH
         chains it connects, so the web visibly joins them) or while its
         endpoint rings carry bolt energy. */
      if (!isStatic && links.length) {
        const active = now < pointerUntil;
        const reach = pointerR * 1.3;
        // Mid-convergence the hidden web surfaces globally for about a second:
        // the moment the field admits it was never separate chains.
        const ch = dagBus.charge;
        const linkFloor =
          dagBus.lean || ch <= 0.28 || ch >= 0.86
            ? 0
            : 0.22 *
              (ch < 0.52 ? (ch - 0.28) / 0.24 : (0.86 - ch) / 0.34);
        ctx.setLineDash([2, 5]);
        ctx.lineWidth = 0.9;
        for (const L of links) {
          if (L.ga !== L.a.gen || L.gb !== L.b.gen) continue;
          const ra = L.a.rings[L.ia];
          const rb = L.b.rings[L.ib];
          if (!ra || !rb) continue;
          const eF = Math.min(1, (ra.energy + rb.energy) * 0.5);
          let pF = 0;
          if (active) {
            const vx = rb.x - ra.x;
            const vy = rb.y - ra.y;
            const len2 = vx * vx + vy * vy || 1;
            const t = Math.max(
              0,
              Math.min(1, ((px - ra.x) * vx + (py - ra.y) * vy) / len2),
            );
            const d = Math.hypot(px - (ra.x + vx * t), py - (ra.y + vy * t));
            if (d < reach) {
              pF = 1 - d / reach;
              ra.energy = Math.max(ra.energy, pF * 0.85);
              rb.energy = Math.max(rb.energy, pF * 0.85);
            }
          }
          const a = Math.max(pF * 0.55, eF * 0.4, linkFloor);
          if (a <= 0.02) continue;
          const d0 = Math.hypot(rb.x - ra.x, rb.y - ra.y) || 1;
          const ux = (rb.x - ra.x) / d0;
          const uy = (rb.y - ra.y) / d0;
          ctx.strokeStyle = `rgba(201, 169, 255, ${a.toFixed(3)})`;
          ctx.beginPath();
          ctx.moveTo(ra.x + ux * (ra.r + 2), ra.y + uy * (ra.r + 2));
          ctx.lineTo(rb.x - ux * (rb.r + 2), rb.y - uy * (rb.r + 2));
          ctx.stroke();
        }
        ctx.setLineDash([]);
      }

      for (const c of clusters) {
        const rings = c.rings;
        // Pass 1 — per-ring alpha (fade-in, staggered dissolve, soft shimmer).
        for (let i = 0; i < rings.length; i++) {
          const ring = rings[i];
          ring.energy = Math.max(0, ring.energy - dt / ENERGY_DECAY_MS);
          let a = isStatic ? 1 : Math.min(1, (now - ring.born) / IN_MS);
          // Going dark: a uniform dim in place (dormancy, not the old
          // dissolve — chains must never look like they disappear). Energy
          // rescues a dimming chain, so a convergence bolt brings it BACK
          // rather than letting it vanish mid-discharge.
          if (c.state === "fading") {
            const f = Math.max(0, 1 - (now - c.stateAt) / FADE_MS);
            a *= Math.max(f, Math.min(1, ring.energy));
          }
          a *= 0.85 + 0.15 * Math.sin(now * 0.004 + i * 1.73);
          // Dark chains (born-ghost or gone dark) render only where energy
          // touches them: invisible at rest, they materialise under the
          // pointer or a passing bolt and sink back as the energy decays.
          if (c.ghost || c.state === "dark") {
            a *= Math.min(1, ring.energy * 1.15);
          }
          alphas[i] = Math.max(0, a);
        }

        // Pass 2 — edges (parent references), ring-border to ring-border.
        // 1.2, in step with every hairline in the spine.
        ctx.lineWidth = 1.2;
        for (let i = 1; i < rings.length; i++) {
          const ring = rings[i];
          const p = rings[ring.parent];
          const a = 0.5 * Math.min(alphas[i], alphas[ring.parent]);
          if (a <= 0.012) continue;
          const dx = ring.x - p.x;
          const dy = ring.y - p.y;
          const d = Math.hypot(dx, dy) || 1;
          // Touching beads need no connector line.
          if (d < p.r + ring.r + 2.6) continue;
          const ux = dx / d;
          const uy = dy / d;
          ctx.strokeStyle = `rgba(${ring.color}, ${a.toFixed(3)})`;
          ctx.beginPath();
          ctx.moveTo(p.x + ux * (p.r + 1.2), p.y + uy * (p.r + 1.2));
          ctx.lineTo(ring.x - ux * (ring.r + 1.2), ring.y - uy * (ring.r + 1.2));
          ctx.stroke();
        }

        // Pass 3 — the rings themselves: hollow, bordered, tiny.
        // During convergence `releaseConverge` raises whole chains to 1.35 at
        // once, so the ordinary 0.05 gate would blit hundreds of glow sprites
        // on exactly the frames that matter most. Raise it while charging.
        const glowGate = dagBus.charge > 0.02 ? CONVERGE.GLOW_GATE : 0.05;
        for (let i = 0; i < rings.length; i++) {
          const ring = rings[i];
          const a = alphas[i] * Math.min(1, RING_ALPHA + 0.38 * ring.energy);
          if (a <= 0.012) continue;
          ctx.lineWidth = 1.2 + ring.energy * 0.84;
          ctx.strokeStyle = `rgba(${ring.color}, ${a.toFixed(3)})`;
          ctx.beginPath();
          ctx.arc(ring.x, ring.y, ring.r, 0, Math.PI * 2);
          ctx.stroke();
          if (ring.energy > glowGate) {
            const size = 10 + 8 * ring.energy;
            ctx.globalAlpha = 0.5 * ring.energy * alphas[i];
            ctx.drawImage(
              sprites[ring.sprite],
              ring.x - size / 2,
              ring.y - size / 2,
              size,
              size,
            );
            ctx.globalAlpha = 1;
          }
        }

        // Pass 4 — live growth tips spark like a welding point. Ghost chains
        // grow in silence: a permanent spark would give them away.
        if (!isStatic && c.state === "growing" && !c.ghost) {
          for (const tip of c.tips) {
            if (tip.done) continue;
            const ring = rings[tip.node];
            const flicker = 0.55 + 0.25 * Math.sin(now * 0.02 + tip.node * 2.1);
            ctx.globalAlpha = flicker * alphas[tip.node];
            ctx.drawImage(sprites[ring.sprite], ring.x - 5, ring.y - 5, 10, 10);
            ctx.globalAlpha = 1;
          }
        }
      }

      /* Pointer circle: touched chains glow, and each fires a bolt from the
         ring under the cursor DOWNSTREAM toward its tip (the directed end). */
      if (!isStatic && now < pointerUntil) {
        const r2 = pointerR * pointerR;
        for (const c of clusters) {
          if (c.state === "fading") continue;
          let nearest = -1;
          let nd = Infinity;
          for (let i = 0; i < c.rings.length; i++) {
            const ring = c.rings[i];
            const ddx = ring.x - px;
            const ddy = ring.y - py;
            const d2 = ddx * ddx + ddy * ddy;
            if (d2 < r2) {
              ring.energy = Math.max(ring.energy, 0.55);
              if (d2 < nd) {
                nd = d2;
                nearest = i;
              }
            }
          }
          if (
            nearest >= 0 &&
            now - c.pointerAt > POINTER_COOLDOWN_MS &&
            pulses.length < PULSE_MAX + 6
          ) {
            c.pointerAt = now;
            // Walk downstream (kids), branching at random, out to a leaf.
            const kidsOf: number[][] = c.rings.map(() => []);
            for (let i = 1; i < c.rings.length; i++) {
              kidsOf[c.rings[i].parent].push(i);
            }
            const path = [nearest];
            let cur = nearest;
            while (kidsOf[cur].length) {
              cur = kidsOf[cur][Math.floor(Math.random() * kidsOf[cur].length)];
              path.push(cur);
            }
            if (path.length >= 3) {
              pulses.push({
                cluster: c,
                gen: c.gen,
                path,
                t0: now,
                dur: Math.min(1000, Math.max(360, path.length * 75)),
                sprite: teal(c.rings[nearest].sprite),
              });
            }
          }
        }
      }

      /* Electric pulses travelling the parent links, with a short tail.
         One stepper serves BOTH the ambient bolts and the convergence bolts —
         two copies would diverge on the first tuning pass. */
      if (!isStatic) {
        pulses = pulses.filter((pl) => stepPulse(pl, now, false));
        converge = converge.filter((pl) => stepPulse(pl, now, true));

        if (now >= pulseAt) {
          pulseAt = now + 220 + Math.random() * 280;
          if (pulses.length < PULSE_MAX) {
            const ready = clusters.filter(
              (c) => c.state !== "fading" && c.rings.length >= 8,
            );
            // Mostly strike the chains in existence; now and then a bolt
            // lands on a dark one and briefly betrays the hidden layer.
            const vis = ready.filter((c) => !c.ghost && c.state !== "dark");
            const hid = ready.filter((c) => c.ghost || c.state === "dark");
            const pool =
              Math.random() < 0.7 && vis.length ? vis : hid.length ? hid : vis;
            const c = pool[Math.floor(Math.random() * pool.length)];
            if (c) {
              const leaves: number[] = [];
              for (let i = 1; i < c.rings.length; i++) {
                if (c.rings[i].kids === 0) leaves.push(i);
              }
              const leaf = leaves[Math.floor(Math.random() * leaves.length)];
              if (leaf !== undefined) {
                const path: number[] = [];
                for (let i = leaf; i !== -1; i = c.rings[i].parent) path.push(i);
                path.reverse(); // energy flows from history out to the tip
                if (path.length >= 4) {
                  pulses.push({
                    cluster: c,
                    gen: c.gen,
                    path,
                    t0: now,
                    dur: Math.min(1200, Math.max(480, path.length * 85)),
                    sprite: teal(c.rings[path[0]].sprite),
                  });
                }
              }
            }
          }
        }
      }
    };

    /* ------------------------------ lifecycle ------------------------------- */

    // Back-dated pre-simulation: the field is already alive and desynchronised
    // on first paint instead of every cluster sprouting in unison.
    const seedAll = (now: number) => {
      pulses = [];
      // Interlinks hold hard references to the old clusters; leaving them
      // behind hangs dashed lines at stale coordinates until the next rebuild.
      links = [];
      linkRebuildAt = 0;
      converge.length = 0;
      convergeIdx = 0;
      released = 0;
      arrivals = 0;
      orderDirty = true;
      clusters.length = 0;
      // One home cell per chain, shuffled, with ~1.3x oversampling so some
      // cells hold two — the union of chains blankets the whole canvas.
      const cols = Math.max(1, Math.round(width / CELL_PX));
      const rows = Math.max(1, Math.round(height / CELL_PX));
      const cells = Array.from({ length: cols * rows }, (_, k) => k);
      for (let k = cells.length - 1; k > 0; k--) {
        const j = Math.floor(Math.random() * (k + 1));
        [cells[k], cells[j]] = [cells[j], cells[k]];
      }
      // The multiplier is applied AFTER the clamp, not before it. Before, it
      // would be eaten by the ceiling: 1728 seeds a raw 109, and 109 * 0.7 is
      // still 77, an 8% reduction rather than 30%. It is the shipped count
      // that has to come down.
      const seeded = Math.min(84, Math.max(24, Math.round(cols * rows * 1.3)));
      const n =
        width >= LAPTOP_MIN_PX && width <= LAPTOP_MAX_PX
          ? // The 24 floor is re-applied AFTER the multiplier. Applied only to
            // `seeded` it is silently bypassed: a short hero at a banded width
            // floors to 24 and then thins to 17. Not reachable at today's hero
            // height, but a floor that a later multiplier can walk through is
            // not a floor.
            Math.max(24, Math.round(seeded * LAPTOP_DENSITY))
          : seeded;
      ringCeiling = Math.min(HARD_RING_CAP, n * 36 + 100);
      const cw = width / cols;
      const ch = height / rows;
      for (let i = 0; i < n; i++) {
        const cell = cells[i % cells.length];
        const cx = cell % cols;
        const cy = Math.floor(cell / cols);
        const c: Cluster = {
          rings: [],
          tips: [],
          cap: 0,
          home: {
            x0: cx * cw,
            y0: cy * ch,
            w: cw,
            h: ch,
            edge:
              cx === 0
                ? "left"
                : cx === cols - 1
                  ? "right"
                  : cy === 0
                    ? "top"
                    : null,
          },
          dir: 0,
          state: "growing",
          stateAt: 0,
          hold: 0,
          darkFor: 0,
          gen: 0,
          pointerAt: 0,
          convergedAt: 0,
          teal: false,
          ghost: false,
        };
        clusters.push(c);
        // Phase-staggered ages across the full lifecycle window so births,
        // dim-outs and recycles spread out instead of arriving in waves —
        // and so a good share of the field is ALREADY dark at first paint.
        const t0 = now - ((i + Math.random() * 0.6) / n) * 25000;
        initCluster(c, t0);
        for (let v = t0; v < now && c.state === "growing"; v += 90) grow(c, v);
        for (const ring of c.rings) {
          ring.energy = Math.max(
            0,
            (c.ghost ? 0.35 : 1) - (now - ring.born) / ENERGY_DECAY_MS,
          );
        }
        if (c.state !== "growing") {
          const age = now - t0;
          if (age > 11000) {
            // Old enough to have gone dark already: hidden depth from the
            // first frame, waiting for the pointer.
            c.state = "dark";
            c.stateAt = now - Math.random() * 4000;
            for (const ring of c.rings) ring.energy = 0;
          } else {
            // Freshly settled: spread dim-outs across the FULL recycle
            // cycle (~22s), oldest chains first — compressing them into a
            // few seconds empties the field until the first dark chains
            // regrow (the visibility-desert bug).
            c.stateAt = now;
            c.hold = 1500 + ((n - i) / n) * 21000 + Math.random() * 1500;
          }
        }
      }
    };

    // iOS collapses its URL bar as you scroll, which fires resize with a
    // height delta. Re-seeding the field on that is catastrophic — the whole
    // graph would rebuild mid-scroll — so height-only changes must persist
    // before they count as a real viewport change.
    let pendingSeed = 0;
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const widthChanged = Math.abs(rect.width - width) > 80;
      const heightChanged = Math.abs(rect.height - height) > 160;
      width = rect.width;
      height = rect.height;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      buildBackdrop();
      seedDrips();
      if (widthChanged || clusters.length === 0) {
        window.clearTimeout(pendingSeed);
        seedAll(performance.now());
      } else if (heightChanged) {
        window.clearTimeout(pendingSeed);
        pendingSeed = window.setTimeout(() => {
          const now = canvas.getBoundingClientRect();
          if (Math.abs(now.height - height) < 8) seedAll(performance.now());
        }, 250);
      }
      if (reduced) draw(performance.now(), 0, true);
    };

    const loop = (now: number) => {
      const dt = Math.min(now - last, 64);
      last = now;
      update(now);
      draw(now, dt, false);
      if (process.env.NODE_ENV !== "production") {
        (window as unknown as { __field: unknown }).__field = {
          converge: converge.length,
          released,
          arrivals,
          pulses: pulses.length,
          clusters: clusters.length,
          charge: +dagBus.charge.toFixed(3),
          visible,
          hidden: document.hidden,
        };
      }
      raf = requestAnimationFrame(loop);
    };

    const start = () => {
      if (running || reduced) return;
      running = true;
      // Bolts that expired while the tab was hidden must not all land at once
      // on the first resumed frame. They are CREDITED rather than discarded:
      // dropping them silently widens the released/arrivals gap every time
      // the hero scrolls out and back, and the block would never fill.
      // Arrivals are never reset here — the arc records history, and a block
      // does not un-mine.
      arrivals += converge.length;
      converge.length = 0;
      last = performance.now();
      raf = requestAnimationFrame(loop);
    };
    const stop = () => {
      running = false;
      cancelAnimationFrame(raf);
    };
    const sync = () => {
      if (visible && !document.hidden) start();
      else stop();
    };

    resize();
    if (!reduced) sync();

    const ro = new ResizeObserver(() => resize());
    ro.observe(canvas);

    const io = new IntersectionObserver((entries) => {
      visible = entries.some((e) => e.isIntersecting);
      if (!reduced) sync();
    });
    io.observe(canvas);

    const onVisibility = () => {
      if (!reduced) sync();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pointermove", onPointer, { passive: true });
    window.addEventListener("pointerdown", onPointer, { passive: true });

    return () => {
      stop();
      ro.disconnect();
      io.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pointermove", onPointer);
      window.removeEventListener("pointerdown", onPointer);
    };
  }, [reduced]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className={`pointer-events-none absolute inset-0 h-full w-full ${className ?? ""}`}
    />
  );
}
