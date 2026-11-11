"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

/**
 * Route changes land at the top of the page, instantly.
 *
 * THE PROBLEM THIS SOLVES, and both halves of it have one cause. `html` sets
 * `scroll-behavior: smooth` so that in-page anchor links glide, and that rule
 * does not distinguish between an anchor jump and the App Router's own
 * scroll-to-top. So every page transition ANIMATED the whole document height,
 * which is slow on a long page, and the animation is cancellable: anything
 * that touches scroll while it is running stops it where it stands, which is
 * why a transition so often finished a little short of the top rather than at
 * it. Measured before this component existed: navigating away from a scrolled
 * /chain left the new page parked at 172px and it never moved again.
 *
 * The root cause was removed in globals.css: there is no global
 * `scroll-behavior: smooth` any more, so nothing animates and nothing can be
 * interrupted mid-animation. This component is the second half, and it exists
 * because "the router usually scrolls to the top" is not the same promise as
 * "the page is at the top". It makes the guarantee unconditional.
 *
 * A hash in the URL means an anchor owns the scroll and this must keep its
 * hands off, or /chain#nodes would land at the top of the page instead of at
 * the node board.
 *
 * Renders null. It goes beside <RevealRuntime> in the public layout, outside
 * the spine's positioning wrapper, because that wrapper's only job is to be
 * the containing block for `.spine { inset: 0 }`.
 */
export function ScrollReset() {
  const pathname = usePathname();

  useEffect(() => {
    if (window.location.hash) return;

    const root = document.documentElement;

    // Both mechanisms, twice. `scrollTop` and `scrollTo` are not
    // interchangeable in practice: measured on this site, there are moments
    // when one lands and the other is ignored, and which one that is depends
    // on what else is holding the scroll (the home page's opening hold, for
    // one). Writing both costs nothing.
    const jump = () => {
      root.scrollTop = 0;
      window.scrollTo(0, 0);
    };
    jump();

    // Again on the next frame, because this effect belongs to the LAYOUT and
    // the router settles the changed segment's scroll after it. Running once
    // here can be undone a moment later by something that has not finished.
    const raf = window.requestAnimationFrame(jump);
    return () => window.cancelAnimationFrame(raf);
  }, [pathname]);

  return null;
}
