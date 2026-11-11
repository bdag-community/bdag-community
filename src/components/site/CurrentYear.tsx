"use client";

import { useEffect, useRef } from "react";

/**
 * The footer's copyright year, read from the reader's clock instead of ours.
 *
 * Five routes are prerendered, so `new Date().getFullYear()` in a server
 * component is the BUILD year: a site that is not redeployed over New Year
 * silently starts claiming the wrong one, on every page, in the one line whose
 * whole job is to be current.
 *
 * The correction is a direct DOM write, not state, and that is deliberate.
 * There is no way to render the server's year on the client's first pass — it
 * is not knowable except from the markup already on the page — so a
 * state-driven second pass would diff against React's own first render, which
 * already held the browser's year, and never touch the DOM at all. Writing the
 * text node is the one move that is true whatever hydration decided. This
 * component holds no state, so React never re-renders it and can never clobber
 * the write. Synchronising the DOM with an external system (here, the clock)
 * is what an effect is for.
 *
 * suppressHydrationWarning covers the one night a year when the server's year
 * and the browser's genuinely differ. Without JS the build year still renders,
 * which is exactly what shipped before this component existed.
 */
export function CurrentYear() {
  const ref = useRef<HTMLTimeElement>(null);

  useEffect(() => {
    const now = String(new Date().getFullYear());
    const el = ref.current;
    if (!el || el.textContent === now) return;
    el.textContent = now;
    el.dateTime = now;
  }, []);

  const year = String(new Date().getFullYear());

  return (
    <time ref={ref} dateTime={year} suppressHydrationWarning>
      {year}
    </time>
  );
}
