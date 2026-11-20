"use client";

import type { ComponentPropsWithoutRef } from "react";

const pendingFrames = new Set<HTMLDivElement>();
let animationFrame: number | null = null;
let observer: IntersectionObserver | undefined;

function getObserver() {
  observer ??= new IntersectionObserver(
    (entries, currentObserver) => {
      for (const { target, isIntersecting } of entries) {
        if (!isIntersecting) continue;
        target.classList.add("is-in");
        currentObserver.unobserve(target);
      }
    },
    // Keep blocks that were jumped over in view of the observer so a
    // keyboard or anchor jump cannot strand them at zero opacity.
    { rootMargin: "100000px 0px -10% 0px", threshold: 0 },
  );
  return observer;
}

function armFrames() {
  animationFrame = null;
  const fold = window.innerHeight * 0.9;
  const frames = [...pendingFrames].map((frame) => ({
    frame,
    belowFold: frame.getBoundingClientRect().top >= fold,
  }));
  pendingFrames.clear();

  // Batch layout reads above and only hide frames that are below the fold.
  for (const { frame, belowFold } of frames) {
    if (belowFold) {
      frame.classList.add("is-armed");
      getObserver().observe(frame);
    } else {
      frame.classList.add("is-in");
    }
  }
}

function registerFrame(frame: HTMLDivElement | null) {
  if (!frame || frame.classList.contains("is-in")) return;
  if (
    !window.IntersectionObserver ||
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  ) return;

  pendingFrames.add(frame);
  animationFrame ??= requestAnimationFrame(armFrames);
  return () => {
    pendingFrames.delete(frame);
    observer?.unobserve(frame);
    if (animationFrame !== null && pendingFrames.size === 0) {
      cancelAnimationFrame(animationFrame);
      animationFrame = null;
    }
  };
}

/** Register each frame once React has committed it, including streamed content. */
export function RevealFrame(props: ComponentPropsWithoutRef<"div">) {
  return <div {...props} ref={registerFrame} data-reveal />;
}
