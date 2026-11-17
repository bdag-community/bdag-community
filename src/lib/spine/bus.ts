/**
 * The ONLY channel between the spine overlay and the hero canvas.
 *
 * Hero.tsx is a server component and cannot pass refs or callbacks down to
 * DagField, so the two clients meet on a module singleton read once per frame
 * — the same "closure let, read per frame" idiom DagField already uses for
 * pointer state. No React, no events, no teardown, no re-renders.
 *
 * NO COORDINATES CROSS THIS BUS. `CONVERGE.NODE_FY` is the single shared
 * constant; each side derives the anchor point from it independently (the
 * canvas in its own CSS pixels, the node in CSS percent of the same box).
 */

export const CONVERGE = {
  /** Node anchor as a fraction of hero height, measured from the TOP. */
  NODE_FY: 0.7,
  /** Narrow layouts keep both CTAs on one row, so the node can sit just below
   *  them while the canvas independently derives the same focal point. */
  NODE_FY_NARROW: 0.925,
  NARROW_MAX: 768,
  /** Concurrent convergence bolts (separate budget from the ambient cap). */
  MAX: 30,
  /** Release-time energy overshoot; every consumer clamps to 1. */
  ENERGY: 1.35,
  /** Free-space hop from the last ring into the node. */
  HOP_MS: 110,
  /** Glow-blit gate while charging (vs 0.05 at rest) — keeps the payoff cheap. */
  GLOW_GATE: 0.35,
  /** A dark cluster can't recycle mid-bolt and leave a hole in the wave. */
  RECYCLE_DEFER_MS: 1400,
} as const;

export const HERO_SCROLL_RATE = 1.4;

/**
 * The opening hold: the first approach to the hero charges the field instead
 * of moving the page, and the page only moves once the block has gone live.
 *
 * This is a wheel/touch hold, never a scroll trap. Keyboard scrolling always
 * passes through (and ends the hold on its way), an upward gesture ends it, a
 * scroll from any other source ends it, and it is capped in wall-clock time.
 */
export const LOCK = {
  /** Virtual travel that takes the charge 0 -> 1. Half a trackpad swipe, or
   *  roughly two mouse notches. This is the single biggest lever on how long
   *  the opening takes: everything the reader watches (the chains lighting and
   *  converging, the block filling) is paced by how fast the charge climbs,
   *  and the charge climbs with this. It was 420, which read as a sit-through
   *  rather than as a gesture. */
  SPAN: 210 / HERO_SCROLL_RATE,
  /** Visible fill required before the completed node may hand off to scroll. */
  FILL_READY: 0.995,
  /** Absolute ceiling on one uninterrupted gesture burst, and NOT a lever on
   *  how long the opening takes: reaching it ends the hold WITHOUT the payoff.
   *  The verified 1440px fill + discharge used to complete in ~4.2s and now
   *  completes in roughly half that, so this is a larger margin than it was.
   *  It stays where it is deliberately. Lowering it in the name of tidiness
   *  would start cutting off readers who scroll slowly, which is the one group
   *  this cap exists to protect rather than punish. */
  MAX_MS: 5600,
  /** How much LATER than that the listeners' own backstop fires. The loop is
   *  where the hold is meant to end; the listeners only step in if it has
   *  stopped running at all. Must be > 0, or the backstop races the loop at
   *  the cap and turns a hold that earned its payoff into one that did not. */
  STARVE_GRACE: 800,
  /** A gap pauses the active-burst clock without discarding progress. The next
   *  downward gesture continues the same fill instead of slipping past it. */
  IDLE_MS: 900,
  /** A deltaMode=1 (line) wheel notch, in pixels. */
  LINE_PX: 16,
  /** Bounded glide from the completed hero to the network band. */
  GLIDE_MS: 700 / HERO_SCROLL_RATE,
  /** How long the charge the hold reached stays pinned afterwards — long
   *  enough to cover the discharge, so the payoff cannot collapse in the
   *  frames before real scroll is far enough down to carry it. */
  FLOOR_MS: 2200,
  /** …and how it leaves once nothing is holding it up. Never a snap: the
   *  field would drop half its bolts mid-flight on a single frame. */
  TAU_FLOOR: 500,

  /* ---- the discharge: what the block does with the energy it took ---- */
  /** The bolt's run down the descender, once the block goes live. Long enough
   *  to read as travel rather than a flash, short enough that a reader already
   *  scrolling on has not left it behind. */
  DISCHARGE_MS: 760 / HERO_SCROLL_RATE,
  /** …and how far it pushes the circuit's own draw, in route pixels, so the
   *  chain below the hero is already alive and led by its front when the page
   *  starts moving. Converted to a fraction of the route at use. */
  DISCHARGE_PX: 300,
  /** The ramp that carries that push. Matches DISCHARGE_MS so the descender's
   *  bolt and the circuit's front are one continuous movement. */
  DISCHARGE_TAU: 280 / HERO_SCROLL_RATE,
  /** Reset only once the hero has effectively left the viewport. The node is
   *  still visible at the old 0.5vh replay gate on laptop-height screens. */
  RESET_AT_HERO: 0.98,
  /** Rest at the top before the opening arms again. Re-arming into the tail of
   *  an upward flick would take the page out of the reader's hand. */
  REARM_MS: 420,
  /** …and how still it has to be to count as rest, in px/s. */
  REARM_VEL: 40,
} as const;

export const SPINE = {
  TAU_HEAT_UP: 160,
  TAU_HEAT_DOWN: 420,
  /** Halved with LOCK.SPAN. These two are the charge's smoothing: leaving them
   *  where they were would have let the visible fill lag a charge that now
   *  arrives twice as fast, which shows up as the block still filling after
   *  the field has finished. */
  TAU_CHARGE: 60 / HERO_SCROLL_RATE,
  TAU_FLASH: 260,
  TAU_FILL: 75 / HERO_SCROLL_RATE,
  /** The head rides the reading line, not the viewport top. */
  READ_LINE: 0.62,
  IDLE_MS: 400,
  SEG_MAX_PX: 1600,
  NODE_POOL: 16,
  /** Worst case is a gap span + a body span per anchor, plus the tail. */
  SEG_POOL: 34,
  /** Node boxes the circuit can draw around a band's cells. Six today. */
  CELL_POOL: 10,
  /** Drawn runs in the circuit. The row is broken at every node block it
   *  passes behind, so this is the fixed turns plus roughly two per cell. */
  RUN_POOL: 36,
  /** Travelling fronts for the participation fork, featured projects and News.
   *  Their intervals never overlap, so at most two move on any frame. */
  ARM_POOL: 6,
  /** How far ahead of the reading line the circuit's front runs, as a
   *  fraction of the viewport.
   *
   *  This was a multiplier on progress, which could not be right everywhere:
   *  the route crosses the page four times, so length is not proportional to
   *  height, and one scalar left the front ~660px BEHIND the reader through
   *  the band and the card while running ~810px AHEAD down the tail. Progress
   *  is now paced in reading units (CIRCUIT.HORIZ_WEIGHT), which tracks the
   *  reader by construction, and this is the offset on top: the front sits a
   *  quarter of a screen below the reading line, so whatever is being drawn
   *  is drawing in front of you rather than above or below the fold. */
  CIRCUIT_LEAD_VH: 0.25,
} as const;

export type DagBus = {
  /** 0..1. WRITTEN by Spine every frame (unsmoothed). READ by DagField.update(). */
  charge: number;
  /** Converge bolts that reached the node. WRITTEN by DagField, READ by Spine. */
  arrivals: number;
  /** Converge bolts released this epoch. WRITTEN by DagField, READ by Spine. */
  released: number;
  /** Releasable chains in the full convergence queue. This is the stable
   *  denominator for the node's fill; `released` grows in batches and would
   *  make a partially charged node repeatedly appear full. */
  total: number;
  /** WRITTEN by Spine on route change / cold start / reduced-motion flip;
   *  DagField compares-and-resets all convergence state. */
  epoch: number;
  /** 1 once every released bolt has landed. WRITTEN by DagField. */
  live: 0 | 1;
  /** WRITTEN by Spine (matchMedia, live). Reserved: DagField currently reads
   *  its own useReducedMotion() rather than this. */
  reduced: boolean;
  /** WRITTEN by Spine when the frame-time EMA latches, or up front on a
   *  low-core device. READ by DagField: halves the convergence budget and
   *  drops the global interlink reveal. Latches for the session. */
  lean: boolean;
};

export const dagBus: DagBus = {
  charge: 0,
  arrivals: 0,
  released: 0,
  total: 0,
  epoch: 0,
  live: 0,
  reduced: false,
  lean: false,
};
