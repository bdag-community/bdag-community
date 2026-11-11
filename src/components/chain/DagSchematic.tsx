"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useReducedMotion } from "motion/react";
import { CHAIN_PAGE } from "@/lib/content/site";

/**
 * The DAG under the EVM, taught in six beats.
 *
 * One drawing that walks itself through a lesson while a single caption
 * underneath says what is happening right now. Five lettered circles joined by
 * arrows, then those blocks laid out in one numbered line, then a hexagon that
 * turns the state it holds into the next one.
 *
 * THE SIX BEATS follow the standard decomposition of the term, in order:
 * vertex and edge, then DIRECTED (every edge points one way), then ACYCLIC
 * (follow the edges and you never arrive back where you started). Then what a
 * BlockDAG adds over a single-file chain, then what consensus does with it,
 * then the state transition performed on the result. Every sentence lives in
 * CHAIN_PAGE.shape.diagram.steps and is on the page in full whether or not
 * anything ever moves.
 *
 * WHY THIS IS A CLIENT COMPONENT, having been a server one. The run is about
 * twenty-nine seconds, so WCAG 2.2.2 requires a mechanism to pause, a
 * mechanism is a button, and a button that changes what the figure shows needs
 * state. A pure CSS caption cycle is also a trap that no test here would
 * catch: the global reduced-motion kill block forces animation-delay to 0ms,
 * iteration-count to 1 and duration to 0.01ms but resets neither
 * animation-name nor animation-fill-mode, so a staggered opacity loop would
 * land every caption on its 100% frame with the stagger gone. Once JavaScript
 * is required to pause, it should own the advance too.
 *
 * THE STILL MODE IS THE DEFAULT, and that is load-bearing. `walking` is gated
 * by an SSR-aware hydration snapshot because useReducedMotion() may resolve to
 * false synchronously in the browser even though the server has no media
 * query. The server and hydrating client therefore both render the finished,
 * still figure before progressively enhancing it. The server HTML carries no
 * `data-step`, and every rule that
 * can dim, hide or move anything is written as `.dag-figure[data-step] ...`
 * inside the no-preference guard. So the SSR output, a page whose chunk never
 * arrived, a hydration failure and a reduced-motion reader all render the same
 * complete figure with all six captions listed, and there is no first-paint
 * flash of a half-built drawing.
 *
 * THE CAPTION STACK IS NOT AN ACCIDENT. All six <li> stay in the DOM and in
 * the accessibility tree, sharing ONE grid cell, and only opacity changes.
 * That is what lets a screen reader read the whole lesson once, in order, with
 * no announcements, and what lets a reduced-motion reader see a plain numbered
 * list. Collapsing this into `{active && <p>}` would remove five sixths of the
 * teaching from every screen reader and nothing would look wrong. A test pins
 * it.
 *
 * THE CROSSING IS THE ARGUMENT. D and E each point back to both B and C, and
 * it is the crossing that makes "more than one parent" visible rather than
 * asserted. It is the first thing a tidier layout would remove and it must not
 * be removed.
 *
 * NO TEAL, at any alpha. Teal on this site means a value that moves and
 * nothing here was measured: the public RPC returns one parentHash per block,
 * so the multi-parent structure cannot be read off the chain. Every string in
 * the drawing is a letter or a single digit, so nothing in it can be pasted
 * into an explorer or mistaken for the producer addresses the live table
 * prints below.
 */

const { diagram } = CHAIN_PAGE.shape;
const STEPS = diagram.steps.length;

const subscribeHydration = () => () => {};
const getClientHydration = () => true;
const getServerHydration = () => false;

/** Dwell per beat. Beats 3 and 4 carry the two hardest ideas and the longest
 *  sentences, so they get the most room. Written here, and also handed to the
 *  progress rail as an inline custom property, so the timer and the sweep
 *  cannot drift apart. */
const BEAT_MS = [4200, 3800, 5600, 5600, 4600, 5200];

/** Which beat each mark belongs to, as a `data-state` the CSS reads. */
function stateFor(beat: number, step: number) {
  if (beat > step) return "future";
  return beat === step ? "now" : "past";
}

export function DagSchematic() {
  const blocks = diagram.blocks;
  const reduced = useReducedMotion();
  const hydrated = useSyncExternalStore(
    subscribeHydration,
    getClientHydration,
    getServerHydration,
  );
  const figureRef = useRef<HTMLElement>(null);
  const yielded = useRef(false);

  const [step, setStep] = useState(1);
  const [playing, setPlaying] = useState(false);
  const [onScreen, setOnScreen] = useState(false);
  /* Lazily initialised from the DOM rather than assumed true: a tab restored
     from the back/forward cache, or opened in the background, would otherwise
     spend its first beat believing it is in front. */
  const [tabVisible, setTabVisible] = useState(
    () => typeof document === "undefined" || !document.hidden,
  );
  /** Bumped on every restart so the rail's sweep remounts and replays. */
  const [run, setRun] = useState(0);

  /* Enhance. DERIVED, never stored: `mode` would only ever be a copy of this
     expression, and a copy has to be synchronised by an effect that fires a
     second render for nothing.

     `=== false` rather than a truthiness check keeps reduced motion explicit;
     the hydration gate keeps the server HTML and first client render identical
     even when Motion resolves the media query synchronously. */
  const walking = hydrated && reduced === false;
  const running = walking && playing && onScreen && tabVisible;

  /* Viewport. Deliberately does NOT self-unobserve: leaving the viewport has
     to pause, or the lesson runs out in an empty room.

     HYSTERESIS, and it is the whole point of this effect. A single ratio
     threshold on an element that is taller than a laptop viewport flaps on and
     off across one scroll gesture, and every flip restarted the current beat.
     So the test is asked in VISIBLE PIXELS, with two different answers
     depending on which way it is moving: 240px of the figure to start, and
     only 80px to keep going. A reader scrolling gently while they read can no
     longer knock the run over. */
  useEffect(() => {
    const node = figureRef.current;
    if (!node) return;
    /* Measured directly, and measured ONCE synchronously before the observer
       is even created. An IntersectionObserver only delivers on the rendering
       pipeline, so a tab that is restored, prerendered, or simply not in front
       can leave the first callback arbitrarily late, and until it arrives the
       walkthrough believes it is off screen and refuses to start. That is the
       "only works after a while" failure. The observer is now just the update
       channel; it is not the source of truth. */
    const measure = () => {
      const r = node.getBoundingClientRect();
      const visible = Math.min(window.innerHeight, r.bottom) - Math.max(0, r.top);
      setOnScreen((prev) => (prev ? visible > 80 : visible >= 240));
    };
    measure();
    if (typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(measure, {
      threshold: [0, 0.05, 0.1, 0.2, 0.35, 0.5, 0.75, 1],
    });
    io.observe(node);
    return () => io.disconnect();
  }, []);

  /* Nothing burns a timer in a background tab, and the button keeps saying
     Pause rather than lying about a run that is not advancing. */
  useEffect(() => {
    const onVis = () => setTabVisible(!document.hidden);
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  /* Autoplay starts only once half the figure is on screen, which is several
     viewports below the primer, so the page never has two auto-advancing
     explainers running in one viewport. */
  useEffect(() => {
    if (!walking || !onScreen || yielded.current) return;
    setPlaying(true);
  }, [walking, onScreen]);

  /* The clock. A per-step timeout rather than an interval, because the dwells
     differ. It LOOPS: after the last beat it returns to the first and keeps
     going, so a reader who arrives halfway through never has to find a control
     to see the beginning. The Pause button and the viewport test are what stop
     it, which is also what WCAG 2.2.2 asks for. */
  useEffect(() => {
    if (!running) return;
    const t = window.setTimeout(() => {
      setStep((s) => (s >= STEPS ? 1 : s + 1));
      setRun((r) => r + 1);
    }, BEAT_MS[step - 1]);
    return () => window.clearTimeout(t);
  }, [running, step]);

  /** Taking control is sticky. Nothing resumes autoplay afterwards. */
  const yieldControl = () => {
    yielded.current = true;
    setPlaying(false);
  };

  const goTo = (n: number) => {
    yieldControl();
    setStep(Math.min(STEPS, Math.max(1, n)));
    setRun((r) => r + 1);
  };

  /* `atEnd` asks the only question the button needs answered: is there
     anywhere further to go? It deliberately does NOT consult `playing`.
     `running` is false whenever the pointer is over the figure, so the clock
     that clears `playing` on the last beat never fires for a reader who is
     resting their mouse there, and a label derived from `playing` would sit on
     "Play" forever at the end of a finished run. */
  const atEnd = step >= STEPS;

  /* THE LABEL AND THE BRANCH MUST ASK THE SAME QUESTION, and this is the bug
     that made the control feel broken. The label is derived from `running`,
     which is `playing` AND on screen AND the tab in front. `toggle` used to
     branch on `playing` alone, so any time those two diverged (scrolled out of
     view, or a background tab) the button read "Play" and pressing it PAUSED.
     Both now ask `running`. */
  const toggle = () => {
    setRun((r) => r + 1);
    yielded.current = true;
    if (running) {
      setPlaying(false);
      return;
    }
    if (atEnd) setStep(1);
    setPlaying(true);
  };

  /** A chapter group. `--i` staggers marks within one beat by 110ms. */
  const ch = (beat: number, i = 0) => ({
    className: "dag-ch",
    "data-state": walking ? stateFor(beat, step) : undefined,
    style: { "--i": i } as React.CSSProperties,
  });

  return (
    <figure
      ref={figureRef}
      className="dag-figure flex flex-col gap-4"
      data-mode={walking ? "walk" : "still"}
      data-step={walking ? step : undefined}
      data-playing={running ? "on" : undefined}
      onFocusCapture={yieldControl}
    >
      {/* The figure's structural reading, OUTSIDE .viz, because forced colours
          sets .viz to display none and a name living inside it would vanish
          for the one reader who cannot work around its absence. */}
      <span className="sr-only" role="img" aria-label={diagram.label} />

      {/* One column on a phone, which is where the caption belongs directly
          under the drawing. Two on a desktop, where a 560px drawing alone in a
          1376px column read as a figure that had been left in the corner, and
          where putting the narration beside the picture also removes the eye
          travel down and back on every beat. */}
      <div className="dag-layout">
        <div className="viz">
          <svg
            viewBox="0 0 560 300"
            aria-hidden="true"
            className="dag-svg w-full max-w-[35rem]"
            focusable="false"
          >
            <defs>
              <linearGradient
                id="dag-stub-fade"
                gradientUnits="userSpaceOnUse"
                x1="34"
                x2="8"
              >
                <stop offset="0" stopColor="rgba(168,86,251,0.5)" />
                <stop offset="1" stopColor="rgba(168,86,251,0)" />
              </linearGradient>
            </defs>

            {/* The tell. Outside every chapter group, so it is present from the
                first frame in every mode, and the first text in the drawing. */}
            <text className="dag-caps" x="16" y="26">
              {diagram.exampleLabel}
            </text>
            <path className="dag-rule" d="M368 20H544" />

            {/* --- the interval band, behind B and C (beat 4) --- */}
            <g {...ch(4, 0)}>
              <rect className="dag-band" x="228" y="46" width="84" height="184" rx="22" />
            </g>

            {/* --- edges, painted before the vertices so they tuck under the
                    rims. Authored CHILD FIRST, so the draw grows backwards in
                    time into a block that already exists. --- */}
            <g className="dag-edges">
              <g {...ch(1, 2)}>
                <path className="dag-edge" pathLength="1" d="M238.9 95.4 L91.1 130.6" />
                <path className="dag-edge" pathLength="1" d="M238.9 180.6 L91.1 145.4" />
              </g>
              <g {...ch(4, 2)}>
                <path className="dag-edge" pathLength="1" d="M448 88H302" />
                <path className="dag-edge" pathLength="1" d="M448 188H302" />
              </g>
              {/* THE CROSSING. Both diagonals have midpoint (375,138), the
                  centre of the clear span between the columns, and they share
                  one index so it forms as a single gesture. Do not straighten
                  these. */}
              <g {...ch(4, 3)}>
                <path className="dag-edge is-cross" pathLength="1" d="M451.1 101.8 L298.9 174.2" />
                <path className="dag-edge is-cross" pathLength="1" d="M451.1 174.2 L298.9 101.8" />
              </g>
              {/* The heads are what make the edges DIRECTED, so they are their
                  own beat rather than arriving with the lines. */}
              <g {...ch(2, 0)}>
                <path className="dag-head" d="M101.5 134.1 L91.1 130.6 L98.8 122.8" />
                <path className="dag-head" d="M98.8 153.2 L91.1 145.4 L101.5 141.9" />
              </g>
              <g {...ch(4, 2)}>
                <path className="dag-head" d="M311.3 93.8 L302 88 L311.3 82.2" />
                <path className="dag-head" d="M311.3 193.8 L302 188 L311.3 182.2" />
              </g>
              <g {...ch(4, 3)}>
                <path className="dag-head is-cross" d="M309.8 175.5 L298.9 174.2 L304.8 164.9" />
                <path className="dag-head is-cross" d="M304.8 111.1 L298.9 101.8 L309.8 100.6" />
              </g>
            </g>

            {/* --- the five vertices --- */}
            <g {...ch(1, 0)}>
              <circle className="dag-node" cx="60" cy="138" r="26" />
              <text className="dag-node-id" x="60" y="148">
                {blocks[0].id}
              </text>
              {/* A is not genesis. Its own parents are off the left edge. */}
              <path className="dag-stub" pathLength="1" d="M34 138H8" />
            </g>
            <g {...ch(1, 1)}>
              <circle className="dag-node" cx="270" cy="88" r="26" />
              <text className="dag-node-id" x="270" y="98">
                {blocks[1].id}
              </text>
              <circle className="dag-node" cx="270" cy="188" r="26" />
              <text className="dag-node-id" x="270" y="198">
                {blocks[2].id}
              </text>
            </g>
            <g {...ch(4, 1)}>
              <circle className="dag-node is-ref" cx="480" cy="88" r="26" />
              <text className="dag-node-id" x="480" y="98">
                {blocks[3].id}
              </text>
              <circle className="dag-node is-ref" cx="480" cy="188" r="26" />
              <text className="dag-node-id" x="480" y="198">
                {blocks[4].id}
              </text>
            </g>

            {/* --- beat 3: the walk out of C, and the edge that cannot exist ---
                The ghost is drawn with a REAL GAP and a cross through the gap
                rather than as a dash pattern, because acyclicity is a negative
                claim about paths and it had to survive stillness. Its head is
                the only one in the figure pointing forward in time. */}
            <g {...ch(3, 0)}>
              {/* r=32 rings C from OUTSIDE its 26-unit rim. At r=8 it sat on
                  top of the letter and turned C into a struck-through O. It
                  rests here rather than being hidden between beats, because a
                  ring around the block the walk starts from reads as "start
                  here" and every resting state in this figure has to be a true
                  one. */}
              <circle className="dag-token" cx="270" cy="188" r="32" />
            </g>
            <g {...ch(3, 14)}>
              <path className="dag-ghost" pathLength="1" d="M60 164V246Q60 254 68 254H154" />
            </g>
            <g {...ch(3, 17)}>
              <path className="dag-ghost" pathLength="1" d="M186 254H262Q270 254 270 246V214" />
            </g>
            <g {...ch(3, 21)}>
              <path className="dag-head" d="M275.8 223.3 L270 214 L264.2 223.3" />
            </g>
            <g {...ch(3, 23)}>
              <path className="dag-ghost-x" d="M162 246 L178 262 M178 246 L162 262" />
            </g>
            <g {...ch(3, 26)}>
              <text className="dag-caps is-mid" x="170" y="284">
                {diagram.noLoopLabel}
              </text>
            </g>
          </svg>
        </div>

        {/* The second half of the drawing, and its own SVG rather than a lower
            band of the first. Beside the graph on a desktop, under it on a
            phone. Splitting them is what lets the two sit side by side at all:
            one tall viewBox can only ever stack, and the graph and the order
            are the two halves of the section's sentence. They share every
            class, every chapter mechanism and the same 560-unit width, so the
            two drawings scale together and read as one figure. */}
        <div className="viz">
          <svg
            viewBox="0 0 560 200"
            aria-hidden="true"
            className="dag-svg w-full max-w-[35rem]"
            focusable="false"
          >
            {/* --- beat 5: the resolved order --- */}
            <g {...ch(5, 0)}>
              <path className="dag-lane" pathLength="1" d="M40 60H520" />
              <path className="dag-head" d="M510.7 54.2 L520 60 L510.7 65.8" />
            </g>
            {blocks.slice(1).map((b, i) => (
              <g key={b.id} {...ch(5, i + 1)}>
                <text className="dag-caps is-mid" x={130 + i * 120} y="24">
                  {b.order}
                </text>
                <rect
                  className="dag-slot"
                  x={102 + i * 120}
                  y="36"
                  width="56"
                  height="48"
                  rx="12"
                />
                <text className="dag-slot-id" x={130 + i * 120} y="69">
                  {b.id}
                </text>
              </g>
            ))}

            {/* --- beat 6: the state machine ---
                The bracket says the whole SET enters the machine. Marks flying
                out of four slots would say four independent things arrive, which
                is false. Two chips of the same shape, because this round's
                output is next round's input. */}
            <g {...ch(6, 0)}>
              <path className="dag-lane" pathLength="1" d="M102 84V92H490V84" />
              <path className="dag-lane" pathLength="1" d="M296 92V106" />
              <path className="dag-head" d="M301.8 96.7 L296 106 L290.2 96.7" />
            </g>
            <g {...ch(6, 1)}>
              <rect className="dag-chip" x="14" y="120" width="148" height="52" rx="14" />
              <text className="dag-chip-label" x="88" y="153">
                {diagram.stateIn}
              </text>
              <path className="dag-lane" pathLength="1" d="M162 146H252" />
              <path className="dag-head" d="M242.7 140.2 L252 146 L242.7 151.8" />
            </g>
            <g {...ch(6, 2)}>
              <path
                className="dag-engine-body"
                d="M296 106 L340 126 V166 L296 186 L252 166 V126 Z"
              />
              <text className="dag-engine-label" x="296" y="155">
                {diagram.engineLabel}
              </text>
            </g>
            <g {...ch(6, 3)}>
              <path className="dag-lane" pathLength="1" d="M340 146H398" />
              <path className="dag-head" d="M388.7 140.2 L398 146 L388.7 151.8" />
              <rect className="dag-chip" x="398" y="120" width="148" height="52" rx="14" />
              <text className="dag-chip-label" x="472" y="153">
                {diagram.stateOut}
              </text>
            </g>
          </svg>
        </div>
      </div>

      {/* The narration: the switching caption, the standing caption and the
          transport. FULL WIDTH, under both drawings, at every size. It reads
          as the line the whole figure is currently on, so putting it in a
          column beside one half of the drawing would have tied it to that
          half. */}
      <div className="dag-narration">
        {/* THE SWITCHING CAPTION. All six stay in the DOM. While the walkthrough
            runs they share one grid cell and only opacity changes, so the row is
            sized by the tallest of them and advancing a beat never moves the
            page a pixel. At rest they are a plain numbered list. */}
        <div className="dag-captions">
          <ol className="dag-caption-list">
            {diagram.steps.map((s) => (
              <li key={s.n} className="dag-caption" data-on={s.n.replace(/^0/, "")}>
                <span className="dag-caption-n font-mono text-xs text-outline">
                  {s.n}
                </span>
                <span className="dag-caption-label label-caps text-on-surface-variant">
                  {s.label}
                </span>
                <p className="dag-caption-body body-sm max-w-[60ch]">{s.body}</p>
              </li>
            ))}
          </ol>
      </div>

        {walking ? (
          <div
            className="dag-transport"
            role="group"
            aria-label={diagram.transportLabel}
          >
            <div className="dag-transport-row">
              <button
                type="button"
                className="dag-btn focus-ring"
                onClick={() => goTo(step - 1)}
                disabled={step <= 1}
              >
                {diagram.backLabel}
              </button>
              {/* A label-changing button, not aria-pressed: the control's name
                  always says what pressing it will do. */}
              <button type="button" className="dag-btn focus-ring" onClick={toggle}>
                {running
                  ? diagram.pauseLabel
                  : atEnd
                    ? diagram.replayLabel
                    : diagram.playLabel}
              </button>
              <button
                type="button"
                className="dag-btn focus-ring"
                onClick={() => goTo(step + 1)}
                disabled={step >= STEPS}
              >
                {diagram.nextLabel}
              </button>
              {/* The figure's ONE live region, and it is off while the run is
                  advancing so a reader is not interrupted six times. */}
              <p
                className="dag-step-count font-mono text-xs text-on-surface-variant"
                aria-live={running ? "off" : "polite"}
                aria-atomic="true"
              >
                {diagram.stepTemplate
                  .replace("{n}", String(step))
                  .replace("{total}", String(STEPS))}
              </p>
            </div>
            {/* A readout, not a control. */}
            <div className="dag-rail" aria-hidden>
              {diagram.steps.map((s, i) => (
                <span
                  key={s.n}
                  className="dag-rail-seg"
                  data-reached={i + 1 <= step ? "" : undefined}
                  data-on={i + 1 === step ? "" : undefined}
                  style={{ "--dag-beat": `${BEAT_MS[i]}ms` } as React.CSSProperties}
                >
                  <span className="dag-rail-fill" key={`${step}-${run}`} />
                </span>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      {/* The forced-colours reading, fed from the same array as the drawing.
          These five rows state the entire topology, the crossing and the
          resolved order in words. aria-hidden because the sr-only role="img"
          above is already the figure's one accessible name. The clip is on the
          WRAPPER, never on the <table>: table layout ignores the clip width
          and widens the document on narrow screens. */}
      <div className="viz-fallback sr-only" aria-hidden>
        <table>
          <caption>{diagram.label}</caption>
          <thead>
            <tr>
              {diagram.fallbackColumns.map((c) => (
                <th key={c} scope="col">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {blocks.map((b) => (
              <tr key={b.id}>
                <th scope="row">{b.id}</th>
                <td>{b.refs}</td>
                <td>{b.order}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  );
}
