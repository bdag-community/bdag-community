"use client";

import { SPINE } from "@/lib/spine/bus";

/**
 * The graph layer: everything that makes the spine read as a DAG rather than
 * a progress rail. A rail with dots on it is a timeline; a graph has a lead-in
 * curve, dead branches, a parallel strand and cross-references.
 *
 * This is a STATIC SVG shell of pooled elements. Its `d` attributes are
 * written once per measure pass by <Spine> and never per frame — the marks
 * ignite by class flip, they do not animate their geometry.
 */
export function SpineOrnament() {
  return (
    <svg
      aria-hidden
      focusable="false"
      className="spine-orn"
      preserveAspectRatio="xMinYMin meet"
    >
      {/* The circuit's colour ramp. It PICKS UP where the hero descender
          leaves off — teal, because that is the colour arriving on the hero's
          bottom edge — cools through the brand ramp across the band, and
          heats back to teal as it lands on the (teal) warning card. Starting
          this on lavender put a visible colour step right on the hero's
          border. y1/y2 are written by Spine's measure pass. */}
      <defs>
        <linearGradient id="spine-circuit-ramp" gradientUnits="userSpaceOnUse">
          {/* Pooled. Offsets, colours and opacities are all written by Spine's
              measure pass from circuitStops(), which samples the ramp at the
              BAND's own edges so the veil compensation lands where the veil
              actually is. The defaults here are an inert flat ramp, so a
              gradient caught mid-write never renders black. */}
          {Array.from({ length: 10 }, (_, i) => (
            <stop
              key={`g${i}`}
              offset={i / 9}
              stopColor="#C9A9FF"
              stopOpacity="0.6"
            />
          ))}
        </linearGradient>
        {/* Every travelling charge's bloom — the front here, and the two
            running each framed border. Declared ONCE, referenced from the
            frame SVGs too: `url(#id)` resolves document-wide, and a frame's
            bolts are only ever visible while <Spine> (so this) is mounted.
            A paint server, not a filter: a drop-shadow on a moving dot would
            re-run every frame it moves. */}
        <radialGradient id="spine-bolt-glow">
          <stop offset="0" stopColor="#2CE0CE" stopOpacity="0.5" />
          <stop offset="0.45" stopColor="#2CE0CE" stopOpacity="0.17" />
          <stop offset="1" stopColor="#2CE0CE" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* Act II: the routed circuit. It leaves the hero going down, turns
          around the band's label, threads the cells (each of which becomes a
          block on it) and terminates on the warning card's top edge. Turns
          are rounded quarter arcs, and the line breaks at every block — the
          block's own frame carries the chain across its width. */}
      <path className="spine-circuit-dark" fill="none" />
      {/* One path per drawn RUN, not one for the whole route: a
          stroke-dashoffset change invalidates a path's entire bounding box,
          and the whole route's box is ~1414x708 — larger than the card filter
          that was removed for exactly this reason. Per run, only the one the
          front is travelling changes, and its box is the stroke's own width. */}
      {Array.from({ length: SPINE.RUN_POOL }, (_, i) => (
        <path key={`r${i}`} className="spine-circuit-run" fill="none" />
      ))}
      {/* A node block's frame, drawn like the warning card's one section
          down: two halves released where the chain arrives, travelling
          opposite ways round, meeting where it leaves. The wire is not drawn
          behind them — across its own width, the block IS the chain. */}
      {Array.from({ length: SPINE.CELL_POOL }, (_, i) => (
        <g key={`c${i}`} className="spine-cell">
          <path className="spine-cell-glow" fill="none" pathLength="1" />
          <path className="spine-cell-glow" fill="none" pathLength="1" />
          <path className="spine-cell-arc" fill="none" pathLength="1" />
          <path className="spine-cell-arc" fill="none" pathLength="1" />
        </g>
      ))}
      {/* The travelling front: a bright core inside a soft bloom, moved as one
          group so the pair can never drift apart. */}
      <g className="spine-circuit-front">
        <circle className="spine-bolt-halo" r="8" />
        <circle className="spine-bolt" r="2.4" />
      </g>
      {/* …and a pooled front per parallel strand. The participation fork and
          News fan happen at different points, so only two move at once: the
          trunk hides for that span (Circuit.frontGaps) and these take over. */}
      {Array.from({ length: SPINE.ARM_POOL }, (_, i) => (
        <g key={`af${i}`} className="spine-arm-front">
          <circle className="spine-bolt-halo" r="8" />
          <circle className="spine-bolt" r="2.4" />
        </g>
      ))}
      {/* Act III: the lazy cubic carrying the trunk on to the rail. Dark base
          first, lit copy drawn over it by scroll. */}
      <path className="spine-lead-dark" fill="none" />
      <path className="spine-lead" fill="none" />
      {/* Inherited tip: on a page with no hero, the chain did not start here.
          A half-lit block with ancestors fading up into the header hairline. */}
      <g className="spine-inherit">
        <circle className="spine-inherit-ring" r="4.5" fill="none" strokeWidth="1.2" />
        {Array.from({ length: 3 }, (_, i) => (
          <circle key={`i${i}`} className="spine-inherit-ghost" r="1.5" fill="none" strokeWidth="0.9" />
        ))}
      </g>
      {/* The ghost strand — a second chain the page never quite shows you. */}
      <path className="spine-ghost" fill="none" />
      {Array.from({ length: 4 }, (_, i) => (
        <path key={`x${i}`} className="spine-cross" fill="none" />
      ))}
      {/* Dead branches: every block references a fork that went nowhere. */}
      {Array.from({ length: SPINE.NODE_POOL }, (_, i) => (
        <g key={`f${i}`} className="spine-fork">
          <path className="spine-fork-line" fill="none" />
          <circle className="spine-fork-ring" r="1" fill="none" strokeWidth="0.9" />
        </g>
      ))}
    </svg>
  );
}
