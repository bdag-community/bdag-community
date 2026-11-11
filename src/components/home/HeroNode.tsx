"use client";

import { HERO } from "@/lib/content/site";

/**
 * The hero's scroll affordance, re-imagined as a BLOCK.
 *
 * It replaces the old mouse-pill cue with a single hollow ring — an unmined
 * block — anchored at 70% down the hero on wider screens and below the stacked
 * CTAs on narrow ones (the same responsive point every chain aims at), with a
 * chain descender running to the hero's bottom border where the spine takes over.
 *
 * Nothing here re-renders. Four CSS custom properties written by <Spine> on
 * the hero element drive every visual:
 *   --hero-charge  0..1  approach: ring brightness + descender draw
 *   --hero-fill    0..1  arrived / released: the arc fills clockwise
 *   --hero-flash   0..1  a discrete tick per arriving bolt
 *   --hero-live    0|1   every bolt has landed: energy wash + completion halo
 *
 * The glass lens is translucent ornament behind the block. The perimeter must
 * never be plugged: a filled disc is a mined block, and the whole point is
 * that it fills by ARC as the field's energy arrives.
 *
 * The link target comes from HERO.scrollCue and not from the hero's secondary
 * CTA, which the two shared while "The Chain" was only the #network band. That
 * CTA now leads to /chain; this element is named "Scroll to explore" and has
 * to keep landing on this page.
 */
export function HeroNode() {
  return (
    <div className="hero-node pointer-events-none absolute inset-x-0 top-0 z-0 h-full">
      {/* Chain descender: the spine's first segment, drawn by scroll. At rest
          it is a short stub with a glint falling down it; the glint stops the
          moment real energy takes over. */}
      <span aria-hidden className="hero-descender" />
      <span aria-hidden className="hero-glint-wrap">
        <span className="hero-glint" />
      </span>
      {/* The DISCHARGE. Idle, the glint drifts down the descender; when the
          block has taken the whole field and fires, this runs the same drop
          once, brighter and faster, and the circuit below picks the movement
          up on its own front. <Spine> fires it with data-discharge on the
          hero, and takes it off when the reader returns to the top. */}
      <span aria-hidden className="hero-discharge-wrap">
        <span className="hero-discharge">
          <span className="spine-bolt-halo-css" />
          <span className="hero-discharge-core" />
        </span>
      </span>

      <a
        href={HERO.scrollCue.href}
        aria-label={HERO.scrollCue.label}
        className="hero-node-hit focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-base-void"
      >
        <span aria-hidden className="hero-halo" />
        <span aria-hidden className="hero-halo-burst" />
        {/* A translucent material shell behind the established hollow block.
            Its empty leaves are driven entirely by the same CSS scalars as the
            arc, so the node adds no component state or second timing system. */}
        <span
          aria-hidden
          className="hero-node-glass pointer-events-none absolute inset-0 overflow-hidden rounded-full"
        >
          <span className="hero-node-energy absolute inset-0" />
          <span className="hero-node-mark absolute inset-[23%] overflow-hidden">
            {/* The official lockup begins with a square mark. A square clipping
                window and a full-height, auto-width source expose that mark
                without copying its vector path into this component. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/logo.svg"
              alt=""
              aria-hidden
              className="hero-node-mark-source block h-full w-auto max-w-none"
            />
          </span>
          <span className="hero-node-specular absolute inset-0" />
        </span>
        <svg
          aria-hidden
          focusable="false"
          viewBox="0 0 56 56"
          className="hero-ring-svg"
        >
          {/* Resting ring — hollow, breathing, brightening with approach. */}
          <circle
            className="hero-ring"
            cx="28"
            cy="28"
            r="23.25"
            fill="none"
            strokeWidth="2.7"
          />
          <g className="hero-breathe">
            <circle
              cx="28"
              cy="28"
              r="23.25"
              fill="none"
              strokeWidth="2.7"
              stroke="rgba(201,169,255,0.9)"
            />
          </g>
          {/* Arc fill — clockwise from 12 o'clock, one tick per arrival.
              Two stacked arcs cross-fade lavender -> teal as it completes. */}
          <g transform="rotate(-90 28 28)">
            <circle
              className="hero-arc hero-arc-soft"
              cx="28"
              cy="28"
              r="23.25"
              fill="none"
              strokeWidth="3.6"
              strokeLinecap="butt"
            />
            <circle
              className="hero-arc hero-arc-teal"
              cx="28"
              cy="28"
              r="23.25"
              fill="none"
              strokeWidth="3.6"
              strokeLinecap="butt"
            />
          </g>
          {/* Output port: the filled node hands its spark to the descender here. */}
          <circle
            className="hero-output-port"
            cx="28"
            cy="51.25"
            r="1.35"
            fill="none"
          />
        </svg>
      </a>
    </div>
  );
}
