/**
 * A framed section's own border, drawn by the chain.
 *
 * The chain does not cross a framed section — it arrives on the top edge, this
 * frame carries it round both sides, the halves meet at the bottom centre, and
 * the chain leaves from there. Two halves plus a wider, dimmer pair beneath
 * them for the bloom; `pathLength="1"` normalises them, so halves of unequal
 * real length still finish together and no half needs measuring.
 *
 * Once the border is drawn, two charges keep running it — one down each side —
 * so a framed section reads as live rather than as a box that was outlined
 * once. They are the border's only permanent motion.
 *
 * It lives INSIDE its section rather than in the spine overlay because that
 * overlay sits at z-index -1: behind a translucent card's fill, a frame drawn
 * out there is muddied to a fraction of itself. Its host must carry
 * `relative isolate` and `data-spine-frame`; `isolate` is load-bearing, since
 * without it the frame's own negative z-index escapes to the root stacking
 * context and it goes straight back under the fill.
 *
 * Geometry is written once per measure pass by <Spine>; with no JS this is an
 * empty, invisible SVG and the section keeps its own static border.
 */
export function SpineFrame() {
  return (
    <svg aria-hidden focusable="false" className="spine-frame">
      <path className="spine-frame-glow" fill="none" pathLength="1" />
      <path className="spine-frame-glow" fill="none" pathLength="1" />
      <path className="spine-frame-arc" fill="none" pathLength="1" />
      <path className="spine-frame-arc" fill="none" pathLength="1" />
      {/* Two charges running the border once it is drawn — one down each side,
          following the same two halves. <Spine> gives each pair its half as an
          `offset-path`; the travel itself is CSS. */}
      <g className="spine-frame-bolt">
        <circle className="spine-bolt-halo" r="7" />
        <circle className="spine-bolt" r="2.2" />
      </g>
      <g className="spine-frame-bolt">
        <circle className="spine-bolt-halo" r="7" />
        <circle className="spine-bolt" r="2.2" />
      </g>
    </svg>
  );
}
