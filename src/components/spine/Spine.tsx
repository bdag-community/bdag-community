"use client";

import { useEffect, useRef } from "react";
import { frame, cancelFrame } from "motion";
import { SpineOrnament } from "@/components/spine/SpineOrnament";
import { dagBus, LOCK, SPINE } from "@/lib/spine/bus";
import {
  boxHalfPath,
  buildCircuit,
  cardHalfPath,
  chargeFor,
  circuitStops,
  CIRCUIT,
  clamp01,
  columnLeftFor,
  expStep,
  forkLenFor,
  ghostDxFor,
  glideEase,
  headStep,
  leadPath,
  leadLenFor,
  lenAtRead,
  lockScrollFor,
  pointAtLen,
  railXFor,
  splitSegments,
  wheelPx,
  type Box,
  type Circuit,
  type Segment,
  type SegmentInput,
} from "@/lib/spine/geometry";

/**
 * THE SPINE — one chain running the length of every page.
 *
 * It is the hero's chain continued: it leaves the hero node on a lazy curve,
 * settles into the margin beside the content column, sprouts a block at every
 * section (which ignites as that section rises), forks into dead branches,
 * shadows itself with a ghost strand, and terminates in a live teal block
 * above the footer. A luminous head rides the reader's eye-line down it.
 *
 * ENGINEERING CONTRACT (this is why it stays smooth):
 * - React renders this component EXACTLY ONCE. Everything after mount is
 *   imperative writes on a fixed pool of elements. No state, no re-render,
 *   so the /api/stats poll can never land a 40-element render mid-fling.
 * - The whole per-frame budget is one scroll read plus resolved writes to the
 *   ~12 leaf elements that actually consume them. Custom properties are NOT
 *   written to a shared ancestor per frame: that invalidates the entire
 *   subtree (~136 elements here) and `contain` does not scope it.
 * - Custom properties are never written to :root (that restyles the document).
 * - The loop stops entirely when nothing is moving; the resting frame IS the
 *   resting visual, so stopping is unobservable.
 */

type Kind = "origin" | "node" | "rail" | "terminal";

type Anchor = {
  el: HTMLElement;
  y: number;
  /** Where the block is DRAWN — the terminal one sits at the chain's end,
   *  not at its section's top, so it must ignite on its own position. */
  igniteY: number;
  bottom: number;
  kind: Kind;
  railX: number | null;
  surface: boolean;
  lit: boolean;
};

const IGNITE_MARGIN = 0.9; // matches Reveal's -10% viewport margin

export function Spine() {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    // `main` first, and `wrap` from it. The spine used to be a child of the
    // relative wrapper, so root.parentElement WAS the wrapper; it is now
    // mounted by the home page and its parent is <main> itself. The wrapper is
    // still the box every measurement is taken against, so read it from main.
    const main = document.getElementById("main");
    const wrap = main?.parentElement;
    if (!wrap || !main) return;

    const reduceMQ = window.matchMedia("(prefers-reduced-motion: reduce)");

    const segEls = Array.from(
      root.querySelectorAll<HTMLElement>(".spine-seg"),
    );
    const nodeEls = Array.from(
      root.querySelectorAll<HTMLElement>(".spine-node"),
    );
    const headEl = root.querySelector<HTMLElement>(".spine-head");
    const headBodyEl = root.querySelector<HTMLElement>(".spine-head-body");
    const headBloomEl = root.querySelector<HTMLElement>(".spine-head-tip");
    const orn = root.querySelector<SVGSVGElement>(".spine-orn");
    const leadEl = orn?.querySelector<SVGPathElement>(".spine-lead") ?? null;
    const leadDarkEl =
      orn?.querySelector<SVGPathElement>(".spine-lead-dark") ?? null;
    const ghostEl = orn?.querySelector<SVGPathElement>(".spine-ghost") ?? null;
    const crossEls = orn
      ? Array.from(orn.querySelectorAll<SVGPathElement>(".spine-cross"))
      : [];
    const forkEls = orn
      ? Array.from(orn.querySelectorAll<SVGGElement>(".spine-fork"))
      : [];
    const runEls = orn
      ? Array.from(orn.querySelectorAll<SVGPathElement>(".spine-circuit-run"))
      : [];
    const circuitDarkEl =
      orn?.querySelector<SVGPathElement>(".spine-circuit-dark") ?? null;
    const frontEl =
      orn?.querySelector<SVGGElement>(".spine-circuit-front") ?? null;
    const armFrontEls = orn
      ? Array.from(orn.querySelectorAll<SVGGElement>(".spine-arm-front"))
      : [];
    const rampEl =
      orn?.querySelector<SVGLinearGradientElement>("#spine-circuit-ramp") ?? null;
    const cellEls = orn
      ? Array.from(orn.querySelectorAll<SVGGElement>(".spine-cell"))
      : [];

    let anchors: Anchor[] = [];
    /** Only the segments actually on screen get a transform written. */
    let liveSegs: { el: HTMLElement; y: number; n: number; k: number }[] = [];
    let leadLen = 0;
    let leadY0 = 0;
    let leadN = 1;
    let terminalY = 0;
    let docH = 0;
    let wrapTop = 0;
    let vh = window.innerHeight;
    let railX = 0;
    let railStartY = 0;
    let heroEl: HTMLElement | null = null;
    let heroH = 1;
    let glideY = 0;
    let path = location.pathname;
    let wrapLeft = 0;

    // Act II. Null on every page that does not carry all three hooks, which
    // is every page but home — those keep the plain rail.
    let circuit: Circuit | null = null;
    let cellLit: boolean[] = [];
    // Framed sections (the chain crosses them; their own border carries it)
    // and timeline points (nodes ON it). Both ignite when the front arrives.
    let frameEls: (HTMLElement | undefined)[] = [];
    let frameLit: boolean[] = [];
    let pointEls: HTMLElement[] = [];
    let pointLit: boolean[] = [];
    let newsEl: HTMLElement | null = null;
    let newsLit = false;
    let hubEl: HTMLElement | null = null;
    let hubLit = false;
    let frontOn = false;
    const armOn: boolean[] = [];
    let runLast: number[] = [];
    let observedCells: HTMLElement[] = [];
    let cellRo: ResizeObserver | null = null;

    // Animated quantities (all frame-rate independent, none of them springs).
    let head = 0;
    let heat = 0;
    let lastTarget = 0;
    let chargeS = 0;
    let flash = 0;
    let fill = 0;
    let seen = 0;
    let lastY = window.scrollY;
    let vel = 0;
    let y = window.scrollY;
    let lastLive: 0 | 1 = 0;
    let emaDt = 16;

    let running = false;
    let stillFor = 0;
    let measureQueued = false;
    let measureRaf = 0;
    let dirtyClasses = true;

    // The opening hold (see LOCK in bus.ts) and the discharge that ends it.
    let holdPhase: "off" | "armed" | "held" | "done" = "off";
    let holdTravel = 0;
    let holdStart = 0;
    let holdFullAt = 0;
    let holdLiveAt = 0;
    let holdSeenAt = 0;
    let chargeFloor = 0;
    let floorUntil = 0;
    let touchY = 0;
    let completionLatched = false;
    let openingReset = false;
    let gliding = false;
    let glideT = 0;
    let glideFrom = 0;
    let glideTo = 0;
    // The block's discharge into the chain. `drawFloor` is to the circuit what
    // `chargeFloor` is to the field: a value the release pins ahead of scroll,
    // which real scroll then overtakes. It only ever RISES, so the chain never
    // retracts under the reader — scrolling back to the top clears it.
    let drawFloor = 0;
    let drawFloorTo = 0;
    let drawFloorRamp = false;
    // Rest at the top, for re-arming an opening already reset offscreen.
    let topSince = 0;

    /** How much of the circuit the reading line has drawn, 0..1. Reduced
     *  motion has no reading line and no loop, so it is simply finished.
     *
     *  Floored by the discharge: when the block fires, the chain below the
     *  hero is already drawing with its own front on it, so the page starts
     *  moving into a live chain rather than into nothing. */
    const drawK = () =>
      dagBus.reduced || !circuit
        ? 1
        : Math.max(
            drawFloor,
            clamp01(
              lenAtRead(
                circuit.reads,
                circuit.lens,
                ((head + vh * SPINE.CIRCUIT_LEAD_VH - circuit.y0) /
                  Math.max(1, circuit.y1 - circuit.y0)) *
                  circuit.read,
              ) / circuit.len,
            ),
          );

    /* ------------------------------ measuring ----------------------------- */

    const collect = (): Anchor[] => {
      const tagged = Array.from(
        main.querySelectorAll<HTMLElement>("[data-spine], [data-spine-anchor]"),
      ).filter((el) => !el.closest("[data-spine-skip]"));

      let els = tagged;
      if (els.length < 3) {
        // Fallback: the page's own block rhythm. Absolutely-positioned
        // children (the home page's sr-only h1) are not blocks.
        const blocksIn = (parent: Element): HTMLElement[] =>
          Array.from(parent.children).filter(
            (el): el is HTMLElement =>
              el instanceof HTMLElement &&
              el.offsetHeight > 120 &&
              getComputedStyle(el).position !== "absolute",
          );
        // Sparse pages (/news, /contact) are structurally ONE section, which
        // would leave the spine a bare line with a single dot. Descend until
        // the page yields enough blocks to read as a graph.
        let level = blocksIn(main);
        for (let depth = 0; level.length < 3 && depth < 3; depth++) {
          const expanded = level.flatMap((el) => {
            const kids = blocksIn(el);
            return kids.length > 1 ? kids : [el];
          });
          if (expanded.length === level.length) break;
          level = expanded;
        }
        els = level;
      }

      const wrapRect = wrap.getBoundingClientRect();
      wrapTop = wrapRect.top + window.scrollY;
      wrapLeft = wrapRect.left;

      return els.map((el, i) => {
        const r = el.getBoundingClientRect();
        const declared = el.dataset.spineKind as Kind | undefined;
        const kind: Kind =
          declared ??
          (i === els.length - 1 ? "terminal" : i === 0 ? "origin" : "node");
        const railEl = el.querySelector<HTMLElement>("[data-spine-rail]");
        const top = Math.round(r.top + window.scrollY - wrapTop);
        return {
          el,
          y: top,
          igniteY: top,
          bottom: Math.round(r.bottom + window.scrollY - wrapTop),
          kind,
          // Overlay-space x of the section's own rail: the spine dims across
          // it and reaches an edge to it rather than running beside it.
          railX: railEl
            ? Math.round(railEl.getBoundingClientRect().left - wrapRect.left)
            : null,
          surface:
            el.dataset.spineSurface !== undefined ||
            el.classList.contains("section-surface") ||
            Boolean(el.querySelector(".section-surface")),
          lit: false,
        };
      });
    };

    const measure = () => {
      measureQueued = false;
      const W = wrap.clientWidth;
      vh = window.visualViewport?.height ?? window.innerHeight;
      railX = railXFor(W);
      const colLeft = columnLeftFor(W);

      const next = collect();
      // Carry ignition state across re-measures so nothing re-ignites.
      const wasLit = new Map(anchors.map((a) => [a.el, a.lit]));
      for (const a of next) a.lit = wasLit.get(a.el) ?? false;
      anchors = next.slice(0, SPINE.NODE_POOL);
      docH = wrap.offsetHeight;

      heroEl = main.querySelector<HTMLElement>("[data-spine-hero]");
      heroH = heroEl ? heroEl.offsetHeight : 1;

      const heroBottom = heroEl
        ? Math.round(
            heroEl.getBoundingClientRect().bottom + window.scrollY - wrapTop,
          )
        : 0;
      // The completed opening lands the network band flush below the sticky
      // header. This is measured with the rest of the route, never mid-frame.
      const headerH =
        document.querySelector<HTMLElement>("header")?.offsetHeight ?? 0;
      const networkEl = main.querySelector<HTMLElement>("#network");
      const networkY = networkEl
        ? networkEl.getBoundingClientRect().top + window.scrollY
        : heroBottom + wrapTop;
      glideY = Math.max(0, Math.round(networkY - headerH));
      /* ---- Act II: the routed circuit ---- */
      // Opt-in and all-or-nothing: a page missing any one of the three hooks
      // keeps the plain rail rather than half a circuit.
      const rectOf = (el: Element): Box => {
        const r = el.getBoundingClientRect();
        return {
          l: r.left - wrapLeft,
          t: r.top + window.scrollY - wrapTop,
          r: r.right - wrapLeft,
          b: r.bottom + window.scrollY - wrapTop,
        };
      };
      // EVERY box the circuit is built from goes through this, not rectOf.
      //
      // A reveal item rests 12px below its layout position until it enters,
      // and getBoundingClientRect includes that transform. A cold load at the
      // top therefore measures everything below the fold 12px low — and
      // because a transform changes NOTHING about layout, revealing it later
      // fires no ResizeObserver and schedules no re-measure. The chain stayed
      // pinned to where the cards used to be, which is why the gap under
      // STAKE / BUILD appeared on a load-then-scroll but never on a reload
      // already parked at that section, where the cards were never armed.
      const layoutRectOf = (el: HTMLElement): Box => {
        const box = rectOf(el);
        let dx = 0;
        let dy = 0;
        for (let node: HTMLElement | null = el; node && node !== wrap; ) {
          const transform = getComputedStyle(node).transform;
          const matrix = transform.match(/^matrix\(([^)]+)\)$/)?.[1];
          const matrix3d = transform.match(/^matrix3d\(([^)]+)\)$/)?.[1];
          if (matrix) {
            const values = matrix.split(",").map(Number);
            dx += values[4] ?? 0;
            dy += values[5] ?? 0;
          } else if (matrix3d) {
            const values = matrix3d.split(",").map(Number);
            dx += values[12] ?? 0;
            dy += values[13] ?? 0;
          }
          node = node.parentElement;
        }
        return {
          l: box.l - dx,
          t: box.t - dy,
          r: box.r - dx,
          b: box.b - dy,
        };
      };
      const bandEl = main.querySelector<HTMLElement>("[data-spine-band]");
      const bandBox = bandEl ? layoutRectOf(bandEl) : null;
      // Framed sections in document order: the trunk crosses the "cross" ones
      // and the fork crosses the "branch" pair.
      const allFrames = Array.from(
        main.querySelectorAll<HTMLElement>("[data-spine-frame]"),
      );
      const crossFrames = allFrames.filter(
        (el) => el.dataset.spineFrame === "cross",
      );
      const branchFrames = allFrames.filter(
        (el) => el.dataset.spineFrame === "branch",
      );
      const cardEl = crossFrames[0] ?? null;
      const mineEl = crossFrames[1] ?? null;
      const tailEl = crossFrames[2] ?? null;
      newsEl = main.querySelector<HTMLElement>("[data-spine-news]");
      hubEl = main.querySelector<HTMLElement>("[data-spine-hub]");
      newsEl?.toggleAttribute(
        "data-spine-news-quiet",
        root.dataset.quiet !== undefined,
      );
      const newsCardEls = newsEl
        ? (["left", "center", "right"] as const)
            .map((role) =>
              newsEl!.querySelector<HTMLElement>(
                `[data-spine-news-card="${role}"]`,
              ),
            )
            .filter((el): el is HTMLElement => el !== null)
        : [];
      const newsCards =
        newsCardEls.length === 3 ? newsCardEls.map(layoutRectOf) : null;
      // The timeline, turned on its side: a track of nodes the chain runs
      // through rather than a rail of its own.
      const trackEl = main.querySelector<HTMLElement>("[data-spine-track]");
      pointEls = trackEl
        ? Array.from(trackEl.querySelectorAll<HTMLElement>("[data-spine-point]"))
        : [];
      const labelEl =
        bandEl?.querySelector<HTMLElement>("[data-spine-label]") ?? null;
      const cellEls2 = bandEl
        ? Array.from(bandEl.querySelectorAll<HTMLElement>("[data-spine-cell]"))
        : [];
      // The cells are LIVE telemetry: they render as placeholders, then take
      // their real widths when /api/stats lands, and lg:justify-between then
      // redistributes every one of them. Measured once at mount, the node
      // boxes would sit around numbers that have since moved. Watch the cells
      // themselves — the page-level observer only sees the document's height,
      // which does not change when a numeral gets a digit wider.
      if (
        cellEls2.length !== observedCells.length ||
        cellEls2.some((el, i) => el !== observedCells[i])
      ) {
        // Re-observing fires the callback once per target; only re-observe
        // when the SET has actually changed, or that feedback never settles.
        cellRo?.disconnect();
        observedCells = cellEls2;
        for (const el of observedCells) cellRo?.observe(el);
      }

      // Read the card's metrics HERE, alongside its rect and before the ~40
      // attribute writes below. Reading them after those writes forces a
      // synchronous relayout — and cellRo now fires this pass repeatedly
      // while the stat numerals count up.
      const card = cardEl ? layoutRectOf(cardEl) : null;
      // Every frame's metrics read HERE, alongside its rect and before the
      // ~200 attribute writes below — reading them after forces a synchronous
      // relayout, on a pass that re-runs while the stat numerals count up.
      frameEls = [
        cardEl ?? undefined,
        mineEl ?? undefined,
        branchFrames[0],
        branchFrames[1],
        tailEl ?? undefined,
      ];
      const frameMetrics = frameEls.map((el) => {
        if (!el) return null;
        const cs = getComputedStyle(el);
        return {
          el,
          bw: parseFloat(cs.borderTopWidth) || 0,
          rad: parseFloat(cs.borderTopLeftRadius) || 0,
          w: el.offsetWidth,
          h: el.offsetHeight,
        };
      });
      circuit =
        heroEl && bandEl && card && cellEls2.length
          ? buildCircuit({
              width: W,
              fromX: W / 2,
              fromY: heroBottom,
              railX,
              band: bandBox!,
              label: labelEl ? layoutRectOf(labelEl) : null,
              cells: cellEls2.map(layoutRectOf),
              card,
              timeline:
                trackEl && pointEls.length
                  ? {
                      section: layoutRectOf(trackEl),
                      label: trackEl.querySelector<HTMLElement>(
                        "[data-spine-label]",
                      )
                        ? layoutRectOf(
                            trackEl.querySelector<HTMLElement>(
                              "[data-spine-label]",
                            )!,
                          )
                        : null,
                      points: pointEls.map(layoutRectOf),
                    }
                  : null,
              mine: mineEl ? layoutRectOf(mineEl) : null,
              branches:
                branchFrames.length === 2
                  ? branchFrames.map(layoutRectOf)
                  : null,
              hub: hubEl ? layoutRectOf(hubEl) : null,
              tail: tailEl ? layoutRectOf(tailEl) : null,
              news: newsCards,
            })
          : null;

      // Resize can cross lg in either direction after the route has passed
      // News. Reconcile synchronously: reduced motion has no render loop, and
      // normal motion must not leave a desktop highlight on a wrapped grid.
      const hasNewsFan = Number.isFinite(circuit?.newsAt ?? Infinity);
      newsLit =
        hasNewsFan &&
        (newsLit || drawK() >= (circuit?.newsAt ?? Infinity));
      newsEl?.classList.toggle("is-news-reached", newsLit);
      hubLit =
        Number.isFinite(circuit?.hubAt ?? Infinity) &&
        (hubLit || drawK() >= (circuit?.hubAt ?? Infinity));
      hubEl?.classList.toggle("is-lit", hubLit);

      // Act III leaves the CARD when there is a circuit — the chain has
      // already spent two acts getting there — and the hero otherwise.
      // A circuit that reached its last framed section has nothing to hand
      // over to: the chain ends there, on the centre line, and a rail
      // reappearing in the margin below it would be a second chain.
      const railed = !circuit?.complete;
      const leadFromX = circuit ? circuit.endX : W / 2;
      const leadFromY = circuit ? circuit.endY : heroBottom;
      const reachIdx = Math.min(2, Math.max(0, anchors.length - 1));
      const reachY = circuit
        ? (anchors.find((a) => a.y > leadFromY + 8)?.y ?? leadFromY + 320)
        : anchors.length
          ? anchors[reachIdx].y
          : heroBottom + 320;
      railStartY = !railed
        ? Number.POSITIVE_INFINITY
        : heroEl
          ? reachY
          : Math.max(0, (anchors[0]?.y ?? 0) - 24);

      // The CSS declares --rail-x too (so a no-JS page still shows a sane
      // hairline), but it branches on the VIEWPORT while this branches on the
      // overlay's width. `scrollbar-gutter: stable` separates the two by the
      // scrollbar width, which put the trunk and its graph layer 6px apart in
      // a ~15px band around 768. Resolving it here gives both one basis.
      //
      // It is written HERE, below every measurement above, because it is a
      // custom property on the overlay — the ancestor of ~136 elements — and
      // the first read after it forces a style recalc of that whole subtree
      // plus a document layout. Everything above this line is read-only.
      root.style.setProperty("--rail-x", `${railX}px`);

      /* ---- trunk segments ---- */
      const spans: SegmentInput[] = [];
      terminalY = Math.max(railStartY + 1, docH - 24);
      let cursor = railStartY;
      for (const a of anchors) {
        if (a.bottom <= cursor) continue;
        const top = Math.max(cursor, a.y);
        if (top > cursor) {
          spans.push({ top: cursor, bottom: top });
        }
        const bottom = Math.min(a.bottom, terminalY);
        if (bottom > top) {
          spans.push({
            top,
            bottom,
            dim: a.railX !== null,
            surface: a.surface,
          });
        }
        cursor = Math.max(cursor, bottom);
        if (cursor >= terminalY) break;
      }
      if (cursor < terminalY) spans.push({ top: cursor, bottom: terminalY });

      const segs: Segment[] = splitSegments(spans, docH, SPINE.SEG_MAX_PX).slice(
        0,
        SPINE.SEG_POOL,
      );

      liveSegs = [];
      segEls.forEach((el, i) => {
        const s = segs[i];
        if (!s) {
          el.hidden = true;
          return;
        }
        el.hidden = false;
        const fill = el.querySelector<HTMLElement>(".spine-fill");
        if (fill)
          liveSegs.push({ el: fill, y: s.top, n: Math.max(1, s.height), k: -1 });
        el.style.setProperty("--seg-top", `${s.top}px`);
        el.style.setProperty("--seg-h", `${s.height + 1}px`);
        el.style.setProperty("--seg-c", s.color);
        el.style.setProperty(
          "--seg-a",
          String((s.dim ? 0.35 : 1) * (s.surface ? 2 : 1) * 0.3),
        );
        el.style.setProperty("--seg-dark", s.dim ? "0.19" : "0.55");
      });

      /* ---- section nodes ---- */
      nodeEls.forEach((el, i) => {
        const a = anchors[i];
        // A page that yields a single block (a 404, say) would show one
        // orphan node with no chain behind it. Show the trunk only.
        if (!a || anchors.length < 2 || a.y < railStartY - 40) {
          el.hidden = true;
          return;
        }
        el.hidden = false;
        el.style.transform = `translate3d(0, ${a.y}px, 0)`;
        el.dataset.kind = a.kind;
        const tick = el.querySelector<HTMLElement>(".spine-tick");
        if (tick) {
          const target = a.railX ?? colLeft + (W < 768 ? 16 : 32);
          tick.style.width = `${Math.max(0, Math.round(target - railX - 6))}px`;
        }
      });
      // The terminal block sits on the last anchor's END, not its start.
      const lastIdx = anchors.length - 1;
      if (lastIdx >= 0 && nodeEls[lastIdx]) {
        nodeEls[lastIdx].style.transform = `translate3d(0, ${terminalY}px, 0)`;
        anchors[lastIdx].igniteY = terminalY;
      }

      /* ---- graph ornament ---- */
      if (orn) {
        orn.setAttribute("width", `${W}`);
        orn.setAttribute("height", `${docH}`);
        orn.setAttribute("viewBox", `0 0 ${W} ${docH}`);

        /* ---- Act II geometry, written once per measure ---- */
        if (circuitDarkEl) {
          if (circuit) {
            // The dark base stays ONE path: it never changes after measure,
            // so its bounding box is never invalidated.
            circuitDarkEl.setAttribute("d", circuit.d);
            circuitDarkEl.removeAttribute("hidden");
            // Each lit run carries its own dash. Lengths are the arithmetic
            // ones from geometry.ts — every segment is axis-aligned, so no
            // getTotalLength() is needed and none can drift.
            const drawn = drawK() * circuit.len;
            runLast = [];
            runEls.forEach((el, i) => {
              const r = circuit!.runs[i];
              if (!r) {
                el.setAttribute("hidden", "");
                return;
              }
              el.removeAttribute("hidden");
              el.setAttribute("d", r.d);
              el.style.strokeDasharray = r.len.toFixed(1);
              // Painted from where the reader ALREADY is, never retracted. A
              // re-measure (fonts.ready, the late pass, a stat widening) that
              // reset this is invisible while the loop runs and permanent when
              // it does not — i.e. always, under reduced motion.
              const off = r.len - Math.min(r.len, Math.max(0, drawn - r.start));
              runLast[i] = off;
              el.style.strokeDashoffset = off.toFixed(1);
            });
            frontEl?.removeAttribute("hidden");
            // Only the arms the route actually forked into: a spare left in
            // the pool would sit at the origin waiting to be given a place.
            armFrontEls.forEach((el, i) => {
              if (circuit!.arms[i]) el.removeAttribute("hidden");
              else el.setAttribute("hidden", "");
            });
            rampEl?.setAttribute("x1", "0");
            rampEl?.setAttribute("y1", `${circuit.y0}`);
            rampEl?.setAttribute("x2", "0");
            rampEl?.setAttribute("y2", `${circuit.y1}`);
            if (rampEl && bandBox) {
              const stops = circuitStops(
                circuit.y0,
                circuit.y1,
                bandBox.t,
                bandBox.b,
              );
              const els = Array.from(rampEl.querySelectorAll("stop"));
              els.forEach((el, i) => {
                // Fewer samples than slots when two collapse: park the spares
                // on the last real stop so none of them renders a stray colour.
                const s = stops[Math.min(i, stops.length - 1)];
                el.setAttribute("offset", s.offset.toFixed(4));
                el.setAttribute("stop-color", s.color);
                el.setAttribute("stop-opacity", s.opacity.toFixed(3));
              });
            }
          } else {
            circuitDarkEl.setAttribute("hidden", "");
            for (const el of runEls) el.setAttribute("hidden", "");
            frontEl?.setAttribute("hidden", "");
            for (const el of armFrontEls) el.setAttribute("hidden", "");
          }
        }
        // Carry ignition across re-measures: a resize must not replay six boxes.
        const wasCellLit = cellLit;
        cellLit = circuit ? circuit.boxes.map((_, i) => wasCellLit[i] ?? false) : [];
        cellEls.forEach((el, i) => {
          const b = circuit?.boxes[i];
          if (!b) {
            el.setAttribute("hidden", "");
            return;
          }
          el.removeAttribute("hidden");
          // glow, glow, arc, arc — top half then bottom half in each pair, so
          // the wide dim bloom sits exactly under the sharp stroke it blooms.
          const halves = [
            boxHalfPath(b.box, CIRCUIT.RADIUS, b.wireY, b.fromLeft, true),
            boxHalfPath(b.box, CIRCUIT.RADIUS, b.wireY, b.fromLeft, false),
          ];
          el.querySelectorAll<SVGPathElement>("path").forEach((q, j) =>
            q.setAttribute("d", halves[j % 2]),
          );
        });

        if (leadEl) {
          if (railed && heroEl && reachY > leadFromY) {
            const d = leadPath(leadFromX, leadFromY, railX, reachY);
            leadEl.setAttribute("d", d);
            leadDarkEl?.setAttribute("d", d);
            leadLen = leadLenFor(leadFromX, leadFromY, railX, reachY);
            leadY0 = leadFromY;
            leadN = Math.max(1, reachY - leadFromY);
            leadEl.style.strokeDasharray = leadLen.toFixed(1);
            // Same rule as the circuit: paint where the reader is, so a
            // re-measure cannot un-draw a chain the loop will never redraw.
            leadEl.style.strokeDashoffset = (
              (dagBus.reduced ? 0 : 1 - clamp01((head - leadY0) / leadN)) *
              leadLen
            ).toFixed(1);
            leadEl.removeAttribute("hidden");
            leadDarkEl?.removeAttribute("hidden");
          } else {
            leadLen = 0;
            leadEl.setAttribute("hidden", "");
            leadDarkEl?.setAttribute("hidden", "");
          }
        }

        // Inner pages inherit the chain rather than starting it: a half-lit
        // block above the first section with its ancestors fading up out of
        // frame. Home starts at Genesis, so it never shows one.
        const inherit = orn.querySelector<SVGGElement>(".spine-inherit");
        if (inherit) {
          if (heroEl) {
            inherit.setAttribute("hidden", "");
          } else {
            inherit.removeAttribute("hidden");
            const iy = Math.max(18, railStartY - 26);
            inherit
              .querySelector(".spine-inherit-ring")
              ?.setAttribute("cx", `${railX}`);
            inherit
              .querySelector(".spine-inherit-ring")
              ?.setAttribute("cy", `${iy}`);
            inherit
              .querySelectorAll<SVGCircleElement>(".spine-inherit-ghost")
              .forEach((g, i) => {
                g.setAttribute("cx", `${railX}`);
                g.setAttribute("cy", `${iy - 11 - i * 8}`);
                g.style.opacity = `${0.3 - i * 0.09}`;
              });
          }
        }

        const enrich = docH <= 24000;
        const ghostDx = enrich ? ghostDxFor(colLeft) : 0;
        if (ghostEl) {
          if (ghostDx > 0) {
            const gx = railX - ghostDx;
            ghostEl.setAttribute(
              "d",
              `M ${gx} ${railStartY + 40} L ${gx} ${docH - 80}`,
            );
            ghostEl.removeAttribute("hidden");
          } else {
            ghostEl.setAttribute("hidden", "");
          }
        }
        crossEls.forEach((el, i) => {
          if (ghostDx <= 0) {
            el.setAttribute("hidden", "");
            return;
          }
          const span = docH - 120 - railStartY;
          const cy = Math.round(railStartY + 60 + (span * (i + 1)) / 5);
          el.setAttribute(
            "d",
            `M ${railX - ghostDx} ${cy} L ${railX} ${cy + 26}`,
          );
          el.removeAttribute("hidden");
        });

        // Fit the stub to the margin it actually has: at 375px the rail sits
        // 7px from the edge, and an unclamped 13px fork puts its terminating
        // micro-block at x = -3, clipped away to an orphan stub.
        const forkLen = Math.min(
          forkLenFor(colLeft),
          Math.max(6, (railX - 3) / Math.cos((38 * Math.PI) / 180)),
        );
        forkEls.forEach((g, i) => {
          const a = anchors[i];
          if (!a || a.kind === "terminal" || a.y < railStartY) {
            g.setAttribute("hidden", "");
            return;
          }
          g.removeAttribute("hidden");
          // 38 degrees down-left into the margin, ending in a hollow micro-block.
          const dx = -Math.cos((38 * Math.PI) / 180) * forkLen;
          const dy = Math.sin((38 * Math.PI) / 180) * forkLen;
          const ex = railX + dx;
          const ey = a.y + dy;
          const line = g.querySelector<SVGPathElement>(".spine-fork-line");
          const ring = g.querySelector<SVGCircleElement>(".spine-fork-ring");
          line?.setAttribute(
            "d",
            `M ${railX} ${a.y} Q ${railX + dx * 0.55} ${a.y + dy * 0.2}, ${ex.toFixed(1)} ${ey.toFixed(1)}`,
          );
          ring?.setAttribute("cx", `${ex.toFixed(1)}`);
          ring?.setAttribute("cy", `${ey.toFixed(1)}`);
        });
      }

      /* ---- each framed section's own border ---- */
      const wasFrameLit = frameLit;
      frameLit = frameEls.map((_, i) => wasFrameLit[i] ?? false);
      for (const m of frameMetrics) {
        if (!m) continue;
        const frame = m.el.querySelector<SVGSVGElement>(".spine-frame");
        const arcs = Array.from(
          m.el.querySelectorAll<SVGPathElement>(".spine-frame-arc, .spine-frame-glow"),
        );
        if (!frame || arcs.length < 2) continue;
        // An absolute child resolves `inset: 0` against the host's PADDING
        // box, which would sit the frame a border-width inside the very
        // border it is meant to become. Pin it to the border box instead.
        frame.style.left = `${-m.bw}px`;
        frame.style.top = `${-m.bw}px`;
        frame.style.width = `${m.w}px`;
        frame.style.height = `${m.h}px`;
        frame.setAttribute("viewBox", `0 0 ${m.w} ${m.h}`);
        // Pairs: even index clockwise, odd anticlockwise, so the wide dim
        // glow sits exactly under the sharp stroke it blooms.
        const half = [
          cardHalfPath(m.w, m.h, m.rad, m.bw / 2, 1),
          cardHalfPath(m.w, m.h, m.rad, m.bw / 2, -1),
        ];
        arcs.forEach((el, i) => el.setAttribute("d", half[i % 2]));
        // The two travelling charges ride the same two halves. Written here,
        // once per measure — the travel itself is a CSS animation on
        // offset-distance, so this costs nothing per frame.
        m.el
          .querySelectorAll<SVGGElement>(".spine-frame-bolt")
          .forEach((el, i) => {
            el.style.offsetPath = `path("${half[i % 2]}")`;
          });
      }
      const wasPointLit = pointLit;
      pointLit = pointEls.map((_, i) => wasPointLit[i] ?? false);

      dirtyClasses = true;
      arm();
    };

    /** Light every node box the front has already passed. Used on cold loads
     *  and route changes, inside the quiet window, so nothing replays. */
    const settleCells = () => {
      if (!circuit) return;
      const k = drawK();
      circuit.cellAt.forEach((at, i) => {
        if (k >= at) {
          cellLit[i] = true;
          cellEls[i]?.classList.add("is-lit");
        }
      });
      circuit.frameAt.forEach((at, i) => {
        if (k >= at) {
          frameLit[i] = true;
          frameEls[i]?.classList.add("is-lit");
        }
      });
      circuit.pointAt.forEach((at, i) => {
        if (k >= at) {
          pointLit[i] = true;
          pointEls[i]?.classList.add("is-lit");
        }
      });
      if (k >= circuit.newsAt) {
        newsLit = true;
        newsEl?.classList.add("is-news-reached");
      }
      if (k >= circuit.hubAt) {
        hubLit = true;
        hubEl?.classList.add("is-lit");
      }
    };

    const scheduleMeasure = () => {
      if (measureQueued) return;
      measureQueued = true;
      frame.read(measure);
      // Safety net. `measureQueued` is only ever cleared BY measure(), so a
      // read that never gets delivered latches it true and silently disables
      // every future re-measure for the life of the page — the failure mode
      // is a circuit frozen against a layout that has since moved. A plain
      // rAF cannot be dropped by a shared scheduler; if the read did arrive,
      // measure() has already cleared the latch and this does nothing.
      cancelAnimationFrame(measureRaf);
      measureRaf = requestAnimationFrame(() => {
        if (measureQueued) measure();
      });
    };

    /* ------------------------------ the hold ------------------------------ */

    /* Arriving at the hero, the first gestures do not scroll the page: they
       charge the field, and the page only moves — straight to the next
       section — once the block is live, visibly full, and discharged.
       Everything about this is designed to be escapable:
         - it never arms under reduced motion, below the top, or on a deep link
         - every keyboard scroll key passes through UNTOUCHED and ends it
         - an upward gesture ends it, without the payoff
         - a scroll from any other source (scrollbar, find-in-page) ends it
         - one uninterrupted gesture burst is capped in wall-clock time
         - after an offscreen reset, a settled return to the top re-arms it
       The non-passive wheel listener exists only while it is armed, so the
       browser's fast scroll path is never given up for the rest of the visit. */

    const detachHold = () => {
      window.removeEventListener("wheel", onWheel);
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("keydown", onHoldKey);
    };

    const armHold = (reason: "load" | "return") => {
      if (holdPhase !== "off" || dagBus.reduced) return;
      if (!heroEl || window.scrollY > 2) return;
      // A deep link lands mid-page and must never be grabbed. Once the reader
      // has come back to the top under their own power that hash is history,
      // and they are at the opening like anyone else.
      if (reason === "load" && location.hash) return;
      holdPhase = "armed";
      // `passive: false` is required to hold the page still at all.
      window.addEventListener("wheel", onWheel, { passive: false });
      window.addEventListener("touchstart", onTouchStart, { passive: true });
      window.addEventListener("touchmove", onTouchMove, { passive: false });
      window.addEventListener("keydown", onHoldKey, { passive: true });
    };

    const endGlide = () => {
      gliding = false;
      glideT = 0;
      // The glide drives scroll per frame, so it pins `auto` inline while it
      // runs and drops the override here. There is no global smooth rule to
      // hand ownership back TO any more (globals.css removed it, because route
      // transitions inherited it), so this now falls through to the UA
      // default. Keep the removeProperty rather than writing "auto": the
      // element should carry no opinion once the glide is done.
      document.documentElement.style.removeProperty("scroll-behavior");
      detachHold();
    };

    /** Clear one completed/aborted opening exactly once, after the hero has
     *  left the viewport. DagField already treats an epoch edge as a complete
     *  convergence reset, so no second reset channel is needed. */
    const resetOpening = () => {
      openingReset = true;
      completionLatched = false;
      chargeFloor = 0;
      floorUntil = 0;
      chargeS = 0;
      fill = 0;
      flash = 0;
      seen = dagBus.arrivals;
      holdTravel = 0;
      holdStart = 0;
      holdFullAt = 0;
      holdLiveAt = 0;
      holdSeenAt = 0;
      dagBus.charge = 0;
      dagBus.epoch++;
      lastLive = 0;
      if (heroEl) {
        delete heroEl.dataset.discharge;
        heroEl.classList.remove("is-complete");
      }
    };

    /** Fire what the block took into the chain: a bolt down the descender (a
     *  CSS one-shot, keyed off the attribute) and a push on the circuit's own
     *  draw, so the two read as one movement leaving the node. */
    const discharge = () => {
      if (!heroEl) return;
      // Retrigger cleanly on a second opening: an attribute that is already
      // there does not restart a CSS animation, so take it off and let the
      // frame that re-adds it be a fresh start.
      delete heroEl.dataset.discharge;
      void heroEl.offsetWidth; // one forced reflow, once per opening
      heroEl.dataset.discharge = "";
      drawFloorTo = circuit
        ? Math.min(0.3, LOCK.DISCHARGE_PX / Math.max(1, circuit.len))
        : 0;
      drawFloorRamp = drawFloorTo > 0;
    };

    /** `payoff` means live + visible fill + discharge all completed. Only that
     *  path earns the bounded glide; every safety escape simply gives control
     *  back where the page already stands. */
    const endHold = (payoff: boolean) => {
      if (holdPhase === "off" || holdPhase === "done") return;
      const engaged = holdPhase === "held";
      const reached = clamp01(holdTravel / LOCK.SPAN);
      holdPhase = "done";
      holdTravel = 0;
      holdLiveAt = 0;
      completionLatched = engaged && payoff;
      if (engaged) {
        // Whatever charge the hold reached is carried across the release:
        // recomputed from a scrollY still sitting at 0 it would collapse in a
        // single frame, dropping every bolt in flight. It hands off to real
        // scroll the moment real scroll is far enough down to carry it.
        chargeFloor = payoff ? 1 : reached;
        floorUntil = performance.now() + (payoff ? LOCK.FLOOR_MS : 0);
      }
      if (completionLatched) {
        glideFrom = window.scrollY;
        glideTo = glideY;
        if (glideTo > glideFrom + 8) {
          gliding = true;
          glideT = 0;
          // Avoid composing the global smooth-anchor rule with our own eased
          // positions; endGlide restores stylesheet ownership.
          document.documentElement.style.scrollBehavior = "auto";
          arm();
          return; // listeners absorb trailing downward momentum while gliding
        }
      }
      detachHold();
      arm();
    };

    function onWheel(e: WheelEvent) {
      if (e.ctrlKey) return; // pinch-zoom, not a scroll
      const dy = wheelPx(e.deltaY, e.deltaMode, LOCK.LINE_PX, vh);
      if (holdPhase === "done") {
        if (!gliding) return detachHold();
        if (dy < 0) return endGlide();
        e.preventDefault(); // absorb only trailing downward momentum
        return;
      }
      if (dy <= 0 || window.scrollY > 2) return endHold(false);
      if (holdPhase === "armed") {
        holdPhase = "held";
        holdStart = performance.now();
      } else if (holdStart === 0) {
        // A paused partial gesture starts a fresh safety window but keeps its
        // accumulated charge.
        holdStart = performance.now();
      }
      // The loop is where the hold normally ends. This listener is the only
      // thing still running if the loop is ever starved — a hidden tab, a long
      // task, a dropped rAF — and a page that will not scroll is the one
      // failure this must never have. Checked BEFORE preventDefault, so the
      // gesture that breaks the deadlock is also the one that scrolls.
      if (
        holdStart > 0 &&
        performance.now() - holdStart > LOCK.MAX_MS + LOCK.STARVE_GRACE
      )
        return endHold(false);
      e.preventDefault();
      holdTravel = Math.min(LOCK.SPAN, holdTravel + dy);
      holdSeenAt = performance.now();
      arm();
    }

    function onTouchStart(e: TouchEvent) {
      touchY = e.touches[0]?.clientY ?? 0;
    }

    function onTouchMove(e: TouchEvent) {
      const cy = e.touches[0]?.clientY ?? touchY;
      const dy = touchY - cy;
      touchY = cy;
      if (holdPhase === "done") {
        if (gliding) endGlide();
        else detachHold();
        return;
      }
      // iOS stops making touchmove cancelable once a scroll is underway; there
      // is no holding the page after that, so let it go rather than half-hold.
      if (dy <= 0 || window.scrollY > 2 || !e.cancelable) return endHold(false);
      if (holdPhase === "armed") {
        holdPhase = "held";
        holdStart = performance.now();
      } else if (holdStart === 0) {
        holdStart = performance.now();
      }
      // Same starvation guard as the wheel: see onWheel.
      if (
        holdStart > 0 &&
        performance.now() - holdStart > LOCK.MAX_MS + LOCK.STARVE_GRACE
      )
        return endHold(false);
      e.preventDefault();
      holdTravel = Math.min(LOCK.SPAN, holdTravel + dy);
      holdSeenAt = performance.now();
      arm();
    }

    // Deliberately NOT preventDefault: the key does exactly what it always
    // does, and the hold simply gets out of its way.
    const SCROLL_KEYS = new Set([
      " ",
      "Spacebar",
      "PageDown",
      "PageUp",
      "End",
      "Home",
      "ArrowDown",
      "ArrowUp",
      "Tab",
    ]);
    function onHoldKey(e: KeyboardEvent) {
      if (!SCROLL_KEYS.has(e.key)) return;
      endGlide();
      endHold(false);
      detachHold();
    }

    /* ------------------------------- frame -------------------------------- */

    const readFrame = () => {
      y = window.scrollY;
    };

    const updateFrame = (info: { delta?: number }) => {
      const dt = Math.min(Math.max(info?.delta ?? 16, 1), 64);
      // Degrade before it stutters: a sustained slow frame time latches lean
      // for the session, which halves the convergence budget and drops the
      // global interlink reveal. It never un-latches — flapping would be
      // worse than either state.
      if (!dagBus.lean) {
        emaDt = expStep(emaDt, dt, dt, 600);
        if (emaDt > 26) dagBus.lean = true;
      }
      vel = ((y - lastY) / dt) * 1000;
      lastY = y;

      /* ---- the hold: gestures charge the field, the page stays still ---- */
      const now = performance.now();

      // The discharge belongs to the block's state, not to the input path
      // that happened to fill it. A held gesture, keyboard scroll, restored
      // momentum and a later replay all meet on this same live edge. When the
      // opening is engaged, remember the edge so the page stays put long
      // enough for the one-shot spark to traverse the hero descender.
      if (!openingReset && dagBus.live === 1 && lastLive === 0) {
        holdLiveAt = holdPhase === "held" ? now : 0;
        discharge();
      } else if (dagBus.live === 0 && lastLive === 1) {
        holdLiveAt = 0;
      }

      if (holdPhase === "held") {
        if (y > 4) {
          // Something else moved us — a scrollbar drag, find-in-page, an
          // in-page anchor. Whatever it was outranks the hold.
          endHold(false);
        } else {
          if (holdTravel >= LOCK.SPAN && !holdFullAt) holdFullAt = now;
          const completionReady =
            dagBus.live === 1 &&
            holdLiveAt > 0 &&
            fill >= LOCK.FILL_READY &&
            now - holdLiveAt >= LOCK.DISCHARGE_MS;
          if (completionReady) {
            endHold(true);
          } else if (holdStart > 0 && now - holdStart > LOCK.MAX_MS) {
            endHold(false);
          } else if (
            !holdFullAt &&
            holdStart > 0 &&
            now - holdSeenAt > LOCK.IDLE_MS
          ) {
            // Keep the partial charge, but stop counting inactive time toward
            // the hard safety cap. The next down gesture resumes this cycle.
            holdStart = 0;
          }
        }
      }

      if (gliding) {
        glideT = Math.min(1, glideT + dt / LOCK.GLIDE_MS);
        window.scrollTo(
          0,
          glideFrom + (glideTo - glideFrom) * glideEase(glideT),
        );
        if (glideT >= 1) endGlide();
      }
      // The discharge: the push the block gave the chain. It is a FLOOR under
      // drawK, never a value of it — real scroll overtakes it silently, and
      // nothing here can pull the chain out from under the reader. The same
      // ramp runs BOTH ways, so the reset at the top retracts the chain rather
      // than blinking a few hundred pixels of it out of existence.
      if (drawFloorRamp) {
        drawFloor = expStep(drawFloor, drawFloorTo, dt, LOCK.DISCHARGE_TAU);
        if (Math.abs(drawFloorTo - drawFloor) < 0.0004) {
          drawFloor = drawFloorTo;
          drawFloorRamp = false;
        }
      }

      // Reset once, offscreen. A completed node remains visibly stable for the
      // whole hero; returning to the top only changes listener ownership.
      if (
        holdPhase === "done" &&
        !openingReset &&
        y >= heroH * LOCK.RESET_AT_HERO
      ) {
        resetOpening();
      }
      if (
        holdPhase === "done" &&
        openingReset &&
        y <= 2 &&
        Math.abs(vel) < LOCK.REARM_VEL
      ) {
        if (!topSince) topSince = now;
        else if (now - topSince > LOCK.REARM_MS) {
          topSince = 0;
          openingReset = false;
          holdPhase = "off";
          holdFullAt = 0;
          holdLiveAt = 0;
          holdStart = 0;
          holdSeenAt = 0;
          // The chain lets go of its discharge too, so the whole sequence —
          // charge, fire, chain — is there to be watched a second time. Eased
          // out on the same ramp that brought it in, not cut.
          drawFloorTo = 0;
          drawFloorRamp = drawFloor > 0;
          armHold("return");
        }
      } else {
        topSince = 0;
      }

      // Clamped to the chain's end: unclamped, the head parks a few hundred
      // pixels past the terminal block, inside the footer, where a lavender
      // hairline and a teal tip float with nothing to ride on.
      const target = Math.min(y + vh * SPINE.READ_LINE - wrapTop, terminalY);
      const before = head;
      head = headStep(head, target, dt, vh);

      const speed = Math.abs(target - lastTarget) / dt;
      lastTarget = target;
      const heatTarget = Math.min(1, speed / 2.2);
      heat = expStep(
        heat,
        heatTarget,
        dt,
        heatTarget > heat ? SPINE.TAU_HEAT_UP : SPINE.TAU_HEAT_DOWN,
      );

      // Convergence charge is a pure function of (scroll, velocity): reverse
      // scrubbing walks it back for free and nothing latches. Pages with no
      // hero have nothing to charge — without this guard their heroH of 1
      // pins charge at 1, and navigating home would detonate the whole field
      // on its first frame instead of playing the cascade.
      // While held, the hold's own travel stands in for scrollY on the SAME
      // curve, so nothing downstream knows the difference between a held
      // sequence and a real slow scroll.
      const holding = holdPhase === "held";
      let charge = !openingReset && heroEl
        ? chargeFor(
            holding ? lockScrollFor(holdTravel / LOCK.SPAN, heroH) : y,
            holding ? 0 : vel,
            heroH,
          )
        : 0;
      if (completionLatched && !openingReset) {
        // A successful node stays complete until the physical reset boundary;
        // velocity prediction may not collapse it between wheel ticks.
        charge = 1;
      } else if (chargeFloor > 0) {
        if (charge >= chargeFloor) {
          chargeFloor = 0; // real scroll can carry it from here
        } else {
          if (now > floorUntil) {
            chargeFloor = expStep(chargeFloor, 0, dt, LOCK.TAU_FLOOR);
            if (chargeFloor < 0.01) chargeFloor = 0;
          }
          charge = Math.max(charge, chargeFloor);
        }
      }
      dagBus.charge = charge;
      chargeS = expStep(chargeS, dagBus.charge, dt, SPINE.TAU_CHARGE);

      // DagField zeroes arrivals when charge returns to 0 and on epoch
      // change; without walking `seen` back the delta goes far negative and
      // the replayed cascade loses its first half-second of arrival flashes.
      if (dagBus.arrivals < seen) seen = dagBus.arrivals;
      const arrived = dagBus.arrivals - seen;
      seen = dagBus.arrivals;
      flash = Math.max(0, flash * Math.exp(-dt / SPINE.TAU_FLASH) + 0.22 * arrived);
      fill = expStep(
        fill,
        openingReset ? 0 : dagBus.arrivals / Math.max(1, dagBus.total),
        dt,
        SPINE.TAU_FILL,
      );

      // Ignition: same threshold Reveal uses, latched once.
      const line = y + vh * IGNITE_MARGIN - wrapTop;
      for (const a of anchors) {
        if (!a.lit && a.igniteY <= line) {
          a.lit = true;
          dirtyClasses = true;
        }
      }

      const moving =
        Math.abs(target - before) > 0.25 ||
        heat > 0.01 ||
        arrived > 0 ||
        dagBus.released > dagBus.arrivals ||
        (holdPhase === "held" && holdStart > 0) ||
        gliding ||
        topSince > 0 ||
        drawFloorRamp ||
        chargeFloor > 0;
      stillFor = moving ? 0 : stillFor + dt;
      if (stillFor > SPINE.IDLE_MS && !dirtyClasses) stop();
    };

    const renderFrame = () => {
      // Resolved values go straight onto the ~12 leaves that consume them.
      // Writing --sp-head on the root instead would invalidate all ~136
      // descendants every frame, and `contain` does not scope custom-property
      // invalidation — measured at 2-3ms/frame before this change.
      // Only the one or two segments actually straddling the head change. The
      // rest are pinned at a literal 0 or 1, so the compare is exact and the
      // steady state drops from ~12 writes a frame to one.
      for (const s of liveSegs) {
        const r = (head - s.y) / s.n;
        const k = r <= 0 ? 0 : r >= 1 ? 1 : r;
        if (k === s.k) continue;
        s.k = k;
        s.el.style.transform = `scaleY(${k === 0 || k === 1 ? k : k.toFixed(4)})`;
      }
      if (headEl) {
        headEl.style.transform = `translate3d(0, ${head.toFixed(1)}px, 0)`;
        headEl.style.opacity = clamp01((head - railStartY) / 140).toFixed(3);
      }
      if (headBodyEl) {
        // scaleY on a fixed 300px body, NOT a height write — height was the
        // one layout-dirtying property in the frame path, and the next tick's
        // scrollY read flushed that dirty layout every single frame.
        headBodyEl.style.transform = `scaleY(${((160 + heat * 140) / 300).toFixed(4)})`;
      }
      if (headBloomEl) headBloomEl.style.opacity = heat.toFixed(3);
      if (leadEl && leadLen > 0) {
        const k = clamp01((head - leadY0) / leadN);
        leadEl.style.strokeDashoffset = ((1 - k) * leadLen).toFixed(1);
      }
      if (circuit) {
        // One scalar drives the whole act. Because the dash is a LENGTH and
        // the progress is linear in scroll, the front travels the path at a
        // constant speed — the horizontal runs take their fair share of the
        // scroll instead of snapping past while y stands still.
        const k = drawK();
        const drawn = k * circuit.len;
        for (let i = 0; i < runEls.length; i++) {
          const r = circuit.runs[i];
          if (!r) break;
          const off = r.len - Math.min(r.len, Math.max(0, drawn - r.start));
          if (off === runLast[i]) continue; // every run but one, every frame
          runLast[i] = off;
          runEls[i].style.strokeDashoffset = off.toFixed(1);
        }
        if (frontEl) {
          // Hidden where the chain is: behind a node block the block's own
          // frame is the chain, so a dot crossing it would be a second one.
          const at = k * circuit.len;
          const behind = circuit.frontGaps.some((h) => at >= h[0] && at <= h[1]);
          const live = k > 0.002 && k < 0.998 && !behind;
          if (live) {
            const [fx, fy] = pointAtLen(circuit.points, circuit.lens, k * circuit.len);
            frontEl.style.transform = `translate(${fx.toFixed(1)}px, ${fy.toFixed(1)}px)`;
          }
          if (live !== frontOn) {
            frontOn = live;
            frontEl.style.opacity = live ? "1" : "0";
          }
        }
        // The fork: while the chain is drawing two lines the trunk's front is
        // in `frontGaps`, and these two carry it instead — one per arm, on the
        // arm's own polyline. Same idiom, same cost: one transform write each
        // and an opacity flip only when the state actually changes.
        for (let i = 0; i < armFrontEls.length; i++) {
          const arm = circuit.arms[i];
          const el = armFrontEls[i];
          const at = k * circuit.len;
          const live =
            arm !== undefined &&
            at > arm.start &&
            at < arm.start + arm.len &&
            !arm.gaps.some((h) => at >= h[0] && at <= h[1]);
          if (live) {
            const [ax, ay] = pointAtLen(arm.points, arm.lens, at);
            el.style.transform = `translate(${ax.toFixed(1)}px, ${ay.toFixed(1)}px)`;
          }
          if (live !== armOn[i]) {
            armOn[i] = live;
            el.style.opacity = live ? "1" : "0";
          }
        }
        // Boxes ignite by class flip and draw themselves through a CSS
        // transition, so the six of them cost nothing per frame.
        // Everything the chain touches ignites when the front reaches it —
        // node blocks, framed sections and timeline nodes alike — by class
        // flip, so the per-frame cost of all of them together is zero.
        for (let i = 0; i < cellLit.length; i++) {
          if (!cellLit[i] && k >= circuit.cellAt[i]) {
            cellLit[i] = true;
            dirtyClasses = true;
          }
        }
        for (let i = 0; i < frameLit.length; i++) {
          if (!frameLit[i] && k >= circuit.frameAt[i]) {
            frameLit[i] = true;
            dirtyClasses = true;
          }
        }
        for (let i = 0; i < pointLit.length; i++) {
          if (!pointLit[i] && k >= circuit.pointAt[i]) {
            pointLit[i] = true;
            dirtyClasses = true;
          }
        }
        if (!newsLit && k >= circuit.newsAt) {
          newsLit = true;
          dirtyClasses = true;
        }
        if (!hubLit && k >= circuit.hubAt) {
          hubLit = true;
          dirtyClasses = true;
        }
      }
      const renderedLive: 0 | 1 = openingReset ? 0 : dagBus.live;
      if (heroEl) {
        heroEl.style.setProperty("--hero-charge", chargeS.toFixed(3));
        heroEl.style.setProperty("--hero-flash", Math.min(1, flash).toFixed(3));
        heroEl.style.setProperty("--hero-fill", clamp01(fill).toFixed(3));
        heroEl.style.setProperty("--hero-live", String(renderedLive));
      }
      // The completion burst is a one-shot: fire it on the 0 -> 1 edge only.
      if (renderedLive !== lastLive) {
        lastLive = renderedLive;
        heroEl?.classList.toggle("is-complete", renderedLive === 1);
      }
      if (process.env.NODE_ENV !== "production") {
        (window as unknown as { __spine: unknown }).__spine = {
          head: Math.round(head),
          heat: +heat.toFixed(2),
          charge: +dagBus.charge.toFixed(3),
          fill: +fill.toFixed(3),
          arrivals: dagBus.arrivals,
          released: dagBus.released,
          total: dagBus.total,
          live: dagBus.live,
          segs: anchors.length,
          heroH,
          hold: holdPhase,
          travel: Math.round(holdTravel),
          glide: gliding ? +glideT.toFixed(2) : 0,
          glideY,
          floor: chargeFloor,
          drawFloor: +drawFloor.toFixed(4),
          drawK: +drawK().toFixed(4),
          openingReset,
        };
      }
      if (dirtyClasses) {
        dirtyClasses = false;
        anchors.forEach((a, i) => {
          const el = nodeEls[i];
          if (el) el.classList.toggle("is-lit", a.lit);
        });
        cellEls.forEach((el, i) => el.classList.toggle("is-lit", cellLit[i] === true));
        frameEls.forEach((el, i) => el?.classList.toggle("is-lit", frameLit[i] === true));
        pointEls.forEach((el, i) => el.classList.toggle("is-lit", pointLit[i] === true));
        newsEl?.classList.toggle("is-news-reached", newsLit);
        hubEl?.classList.toggle("is-lit", hubLit);
      }
    };

    const start = () => {
      if (running || dagBus.reduced) return;
      running = true;
      stillFor = 0;
      root.classList.add("is-live");
      frame.read(readFrame, true);
      frame.update(updateFrame, true);
      frame.render(renderFrame, true);
    };
    const stop = () => {
      if (!running) return;
      running = false;
      root.classList.remove("is-live");
      cancelFrame(readFrame);
      cancelFrame(updateFrame);
      cancelFrame(renderFrame);
    };
    function arm() {
      if (dagBus.reduced) return;
      if (!running) start();
      stillFor = 0;
    }

    /* --------------------------- static/reduced --------------------------- */

    const applyReduced = () => {
      dagBus.reduced = reduceMQ.matches;
      if (reduceMQ.matches || navigator.hardwareConcurrency <= 4) {
        dagBus.lean = true;
      }
      if (dagBus.reduced) {
        // Holding the page still IS motion the reader did not ask for, and so
        // is a bolt let loose down the descender.
        endGlide();
        endHold(false);
        detachHold();
        holdLiveAt = 0;
        completionLatched = false;
        openingReset = false;
        drawFloor = 0;
        drawFloorTo = 0;
        drawFloorRamp = false;
        if (heroEl) delete heroEl.dataset.discharge;
      }
      if (!dagBus.reduced) {
        arm();
        return;
      }
      // The finished chain: fully drawn, every block and frame lit.
      stop();
      anchors.forEach((a, i) => {
        a.lit = true;
        nodeEls[i]?.classList.add("is-lit");
      });
      // The FINISHED CHAIN, all of it. The trunk's lit fill is written only
      // from renderFrame, and reduced motion never runs renderFrame — so
      // without this the circuit, the boxes and the card all light up and the
      // single longest stretch of the chain stays a dark hairline.
      for (const s of liveSegs) {
        s.k = 1;
        s.el.style.transform = "scaleY(1)";
      }
      if (leadEl && leadLen > 0) leadEl.style.strokeDashoffset = "0";
      runEls.forEach((el, i) => {
        el.style.strokeDashoffset = "0";
        runLast[i] = 0;
      });
      if (frontEl) {
        frontOn = false;
        frontEl.style.opacity = "0";
      }
      armFrontEls.forEach((el, i) => {
        armOn[i] = false;
        el.style.opacity = "0";
      });
      cellLit = cellLit.map(() => true);
      cellEls.forEach((el, i) => el.classList.toggle("is-lit", i < cellLit.length));
      frameLit = frameLit.map((_, i) => Number.isFinite(circuit?.frameAt[i] ?? Infinity));
      frameEls.forEach((el, i) => el?.classList.toggle("is-lit", frameLit[i]));
      pointLit = pointLit.map(() => true);
      pointEls.forEach((el) => el.classList.add("is-lit"));
      newsLit = Number.isFinite(circuit?.newsAt ?? Infinity);
      newsEl?.classList.toggle("is-news-reached", newsLit);
      hubLit = Number.isFinite(circuit?.hubAt ?? Infinity);
      hubEl?.classList.toggle("is-lit", hubLit);
      if (heroEl) {
        heroEl.style.setProperty("--hero-charge", "1");
        heroEl.style.setProperty("--hero-fill", "1");
        heroEl.style.setProperty("--hero-flash", "0");
        heroEl.style.setProperty("--hero-live", "1");
      }
      dagBus.epoch++;
    };

    /* ------------------------- route + restoration ------------------------ */

    const jumpTo = (silent: boolean) => {
      wrapTop = wrap.getBoundingClientRect().top + window.scrollY;
      lastY = window.scrollY;
      y = lastY;
      head = y + vh * SPINE.READ_LINE - wrapTop;
      lastTarget = head;
      heat = 0;
      flash = 0;
      seen = dagBus.arrivals;
      if (silent) {
        // Deep link / restored scroll: the field must not replay its cascade.
        chargeS = 1;
        fill = 1;
      }
      dagBus.epoch++;
    };

    const onRoute = () => {
      if (location.pathname === path) return;
      path = location.pathname;
      // A new page is a new opening, whatever happened on the last one: end
      // whatever is running, then reset to "off" so the arm below can take.
      endGlide();
      endHold(false);
      detachHold();
      holdPhase = "off";
      holdLiveAt = 0;
      completionLatched = false;
      openingReset = false;
      drawFloor = 0;
      drawFloorTo = 0;
      drawFloorRamp = false;
      topSince = 0;
      if (heroEl) delete heroEl.dataset.discharge;
      root.dataset.quiet = "1";
      anchors.forEach((a) => (a.lit = false));
      nodeEls.forEach((el) => el.classList.remove("is-lit"));
      cellLit = [];
      cellEls.forEach((el) => el.classList.remove("is-lit"));
      frameLit = [];
      frameEls.forEach((el) => el?.classList.remove("is-lit"));
      pointLit = [];
      pointEls.forEach((el) => el.classList.remove("is-lit"));
      newsLit = false;
      newsEl?.classList.remove("is-news-reached");
      jumpTo(false);
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          measure();
          if (dagBus.reduced) {
            // Reduced motion has no loop to re-ignite anything, so every
            // route after the first would render a half-drawn chain.
            applyReduced();
          } else {
            // Silently light everything already behind the reader.
            const line = window.scrollY + vh * IGNITE_MARGIN - wrapTop;
            anchors.forEach((a, i) => {
              if (a.igniteY <= line) {
                a.lit = true;
                nodeEls[i]?.classList.add("is-lit");
              }
            });
            settleCells();
          }
          armHold("load");
          requestAnimationFrame(() => {
            delete root.dataset.quiet;
            newsEl?.removeAttribute("data-spine-news-quiet");
          });
        }),
      );
    };

    /* ------------------------------ observers ----------------------------- */

    const onScroll = () => arm();
    const onResize = () => {
      scheduleMeasure();
      arm();
    };

    const ro = new ResizeObserver(scheduleMeasure);
    ro.observe(wrap);
    // Declared here, wired in measure(): see the comment there for why the
    // cells need their own observer rather than riding on the page's.
    cellRo = new ResizeObserver(scheduleMeasure);
    // The MutationObserver exists to catch ROUTE CHANGES, not content churn:
    // WordRotate swaps a child roughly every second and StatsBand ticks its
    // numerals, which between them would re-measure ~12x per rotation cycle
    // and hold the loop permanently awake on a page nobody is scrolling.
    // Geometry changes are the ResizeObserver's job.
    const mo = new MutationObserver(() => onRoute());
    mo.observe(main, { childList: true, subtree: false });

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onResize, { passive: true });
    window.addEventListener("pointerdown", onScroll, { passive: true });
    reduceMQ.addEventListener("change", applyReduced);

    measure();
    const cold = window.scrollY > heroH * 0.62;
    jumpTo(cold);
    if (cold) {
      const line = window.scrollY + vh * IGNITE_MARGIN - wrapTop;
      root.dataset.quiet = "1";
      main
        .querySelector<HTMLElement>("[data-spine-news]")
        ?.setAttribute("data-spine-news-quiet", "");
      anchors.forEach((a, i) => {
        if (a.y <= line) {
          a.lit = true;
          nodeEls[i]?.classList.add("is-lit");
        }
      });
      settleCells();
      requestAnimationFrame(() => {
        delete root.dataset.quiet;
        newsEl?.removeAttribute("data-spine-news-quiet");
      });
    }
    applyReduced();
    armHold("load");
    void document.fonts?.ready.then(scheduleMeasure);
    // The stats band is the one element on this page whose HEIGHT depends on
    // live data: with placeholders its six cells fit on one row, and when
    // /api/stats lands the widened numerals wrap to two — measured at exactly
    // +103px. Everything below moves with it, including the whole
    // participation fork, so a circuit built before that lands is pinned 103px
    // above the cards it is drawn from. That is the gap under STAKE / BUILD on
    // a cold load, and the reason a reload parked at that section looked fine:
    // the response is served from a warm cache and beats the settle passes.
    //
    // A single pass at 1200ms only covers a warm API. A cold RPC round trip is
    // rate-limited and fans out to the explorer, and routinely takes longer.
    const lateTimers = [400, 1200, 2600, 5000].map((ms) =>
      window.setTimeout(scheduleMeasure, ms),
    );

    return () => {
      stop();
      endGlide();
      cancelAnimationFrame(measureRaf);
      ro.disconnect();
      cellRo?.disconnect();
      mo.disconnect();
      for (const t of lateTimers) window.clearTimeout(t);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("pointerdown", onScroll);
      reduceMQ.removeEventListener("change", applyReduced);
    };
  }, []);

  return (
    <div aria-hidden className="spine" ref={rootRef}>
      <SpineOrnament />
      {Array.from({ length: SPINE.SEG_POOL }, (_, i) => (
        <i key={`s${i}`} className="spine-seg" hidden>
          <i className="spine-fill" />
        </i>
      ))}
      {Array.from({ length: SPINE.NODE_POOL }, (_, i) => (
        <i key={`n${i}`} className="spine-node" hidden>
          <i className="spine-node-dot" />
          <i className="spine-tick" />
        </i>
      ))}
      <i className="spine-head">
        <i className="spine-head-body" />
        <i className="spine-head-tip" />
      </i>
    </div>
  );
}
