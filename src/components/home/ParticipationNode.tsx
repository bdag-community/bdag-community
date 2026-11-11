/**
 * The participation hub — the hero's block, one size down.
 *
 * The two ways to take part fork the chain; this is where they come back
 * together. Both arms leave their card on a straight diagonal and land on this
 * rim (geometry.ts, `hub`), the node carries the chain across its own height
 * the way a stats cell does, and a single line leaves the bottom for News.
 *
 * Deliberately dumber than <HeroNode>: no charge, no fill, no discharge, no
 * per-frame custom properties. <Spine> flips ONE class on it when both arms
 * arrive, and CSS does the rest — so this costs nothing per frame and needs no
 * client component. It is decorative, and the chain it completes is already
 * described by the sections either side of it, so it is aria-hidden.
 */
export function ParticipationNode() {
  return (
    <div aria-hidden className="hub-node-row">
      <span data-spine-hub className="hub-node">
        <span className="hub-node-glass">
          <span className="hub-node-energy" />
          <span className="hub-node-mark">
            {/* Same trick as the hero block: a square clipping window over a
                full-height source exposes the lockup's mark without copying
                its vector path into a second component. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/logo.svg"
              alt=""
              aria-hidden
              className="block h-full w-auto max-w-none"
            />
          </span>
          <span className="hub-node-specular" />
        </span>
        <svg
          aria-hidden
          focusable="false"
          viewBox="0 0 56 56"
          className="hub-ring-svg"
        >
          {/* Hollow, like the hero's: a filled disc is a mined block.
              r is 28 (half the viewBox) minus half the stroke, so the ring's
              OUTER edge lands exactly on the element's box — which is the
              circle geometry.ts measures and terminates the two arms on. At
              the hero's 23.25 the ring sat 5.4px inside its own box, so the
              chain stopped on an edge nobody could see and the node looked
              disconnected from the lines feeding it. */}
          <circle
            className="hub-ring"
            cx="28"
            cy="28"
            r="26.65"
            fill="none"
            strokeWidth="2.7"
          />
        </svg>
      </span>
    </div>
  );
}
