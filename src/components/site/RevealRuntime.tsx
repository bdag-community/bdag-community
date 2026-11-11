"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

/**
 * One IntersectionObserver for every [data-reveal] on the page. Renders null.
 *
 * Contract: this component is the ONLY thing that may hide content. A page
 * where it never runs is a page where nothing is hidden.
 *
 * useEffect, not useLayoutEffect: useLayoutEffect warns during SSR, and it buys
 * nothing here because blocks that are already on screen are never armed — so
 * there is no frame in which visible content could be hidden.
 *
 * usePathname is safe here in a way it is not in <Spine>: the spine's contract
 * forbids a router subscription because re-rendering it would unmount and
 * remount 295 pooled elements and re-run measure() from cold. This component
 * owns no DOM and renders null; the App Router replaces the page subtree on
 * navigation, so the re-scan is required.
 */
export function RevealRuntime() {
  const pathname = usePathname();

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const els = Array.from(
      document.querySelectorAll<HTMLElement>("[data-reveal]:not(.is-in)"),
    );
    if (!els.length) return;

    // READ PASS — every rect first, no writes interleaved. This is the spine's
    // own discipline (Spine.measure()); the same reads with one style write
    // between them measured 58.7x slower on this codebase.
    const fold = window.innerHeight * 0.9;
    const tops = els.map((el) => el.getBoundingClientRect().top);

    // WRITE PASS. Above-fold blocks are never armed, so they cannot flash.
    const pending: HTMLElement[] = [];
    els.forEach((el, i) => {
      if (tops[i] < fold) el.classList.add("is-in");
      else {
        el.classList.add("is-armed");
        pending.push(el);
      }
    });
    if (!pending.length) return;

    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          e.target.classList.add("is-in"); // one leaf write
          io.unobserve(e.target); // fires once, ever
        }
      },
      // The bottom -10% is the arrival line: a block reveals when its top
      // passes 90% of the viewport, which is the same fold the read pass used.
      //
      // The top margin is a safety net, not a trigger. An observer only queues
      // an entry when the intersection state CHANGES, so a viewport that jumps
      // clean over an armed block — find-in-page, End, an anchor with smooth
      // scrolling switched off — takes it from "below, not intersecting" to
      // "above, not intersecting", queues nothing, and leaves it at opacity 0
      // with nothing left to scroll into. Extending the root upward past any
      // page height makes "above" still intersecting, so that jump is the one
      // state change the observer cannot miss. Costs nothing: same observer,
      // same entry count, still self-unobserving.
      { rootMargin: "100000px 0px -10% 0px", threshold: 0 },
    );
    for (const el of pending) io.observe(el);
    return () => io.disconnect();
  }, [pathname]);

  return null;
}
