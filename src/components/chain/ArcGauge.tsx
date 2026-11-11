"use client";

import { useEffect, useState } from "react";
import { useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils/cn";

/**
 * The only honest dial on this site, and the one that reads empty.
 *
 * A radial gauge is a claim about a fraction of a whole, so it needs a real
 * denominator. On this chain exactly one performance metric has one: the gas
 * limit carried in every block header. Everything else people expect on a dial
 * — throughput, block time, peers, hashrate — has no maximum that exists
 * anywhere outside someone's imagination, so it gets a form its data can
 * actually support and not this component. The second use of this component is
 * the explorer's index ratio, which is a genuine 0-1 fraction and also a
 * disclosure we owe readers.
 *
 * THE NEEDLE PROBLEM, AND THE RULING. Across the last fifty blocks the network
 * uses a few thousandths of one per cent of the gas it is allowed. A "minimum
 * ink" fill — draw at least 1.2% of the arc so something is visible —
 * overstates that reading by roughly six hundred times, and no caption repairs
 * a graphic that is wrong by three orders of magnitude. So:
 *
 *   1. The fill is drawn true, which at this value means invisible. That is
 *      the correct rendering, not a bug.
 *   2. A 2px radial tick marks the exact angular position, with a short leader
 *      pointing in at the numeral. A tick is a POINTER, not a magnitude, so it
 *      stays truthful at any value including this one.
 *   3. No log axis, no rescaled maximum, no minimum-width fill.
 *   4. The headroom is the headline. The large numeral is the gas left unused
 *      in every block; the percentage consumed is the small line beneath it.
 *      The empty arc is the finding.
 *
 * Two details that carry more weight than they look like they do:
 *
 * `pathLength="100"` normalises the arc so the fill is `strokeDasharray={pct
 * 100}` — a literal percentage. There is no trigonometry and no arc-length
 * constant anywhere to get out of step with the radius.
 *
 * The fill uses BUTT caps while the track uses round ones. Round caps extend a
 * dash by half the stroke width at each end, so a round-capped fill at 0.0019%
 * would still paint a 14px blob — minimum ink smuggled in through the cap
 * style. Butt caps render nothing when there is nothing to render.
 */

/** Per-variant geometry. Everything else on the arc is derived from these. */
const GEOMETRY = {
  /** The capacity gauge: the page's headline instrument. */
  full: { vbW: 240, vbH: 140, cx: 120, cy: 120, r: 96, sw: 14, leader: 14 },
  /** The index gauge: a supporting disclosure, so it takes less room. */
  compact: { vbW: 140, vbH: 82, cx: 70, cy: 70, r: 54, sw: 9, leader: 10 },
} as const;

export type ArcGaugeProps = {
  /** The reading as a 0-1 fraction. `null` is both loading and failure. */
  fraction: number | null;
  /** The denominator the fraction was taken against, for the scale label. */
  max: number | null;
  /** The large numeral — pre-formatted by the caller, `"—"` when unknown. */
  headline: string;
  /** What the numeral is, e.g. CHAIN_PAGE.capacity.headlineLabel. Sits under
   *  it, inside the arc. */
  sub: string;
  /** The graphic's accessible name. Not painted: the card already carries this
   *  as its heading, so drawing it again would be a duplicate. */
  label: string;
  /** The paragraph under the arc. */
  caption: string;
  /** The radial pointer. On by default: a tick is truthful at every value. */
  tick?: boolean;
  variant?: "full" | "compact";
  /** Accessible description when there is no reading — pass the section's own
   *  `unavailable` string from CHAIN_PAGE so the wording stays in site.ts. */
  unavailable?: string;
  className?: string;
};

export function ArcGauge({
  fraction,
  max,
  headline,
  sub,
  label,
  caption,
  tick = true,
  variant = "full",
  unavailable = "Reading unavailable.",
  className,
}: ArcGaugeProps) {
  const reduced = useReducedMotion();
  const g = GEOMETRY[variant];

  // The draw-on happens in JS rather than being left to the global
  // reduced-motion kill block in globals.css. That block only flattens
  // durations, so under reduced motion the first paint would still commit an
  // empty arc for a frame before snapping full. Here, `drawn` starts true for
  // anyone who asked for less motion and the final dasharray is what renders
  // first — no transition class is ever attached.
  const [drawn, setDrawn] = useState(false);
  const [settled, setSettled] = useState(false);

  useEffect(() => {
    if (reduced) return;
    // One frame at zero so the transition has a value to animate out of.
    const raf = requestAnimationFrame(() => setDrawn(true));
    // After the draw, later polls are corrections rather than an entrance, so
    // they move at the shorter duration.
    const timer = setTimeout(() => setSettled(true), 950);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(timer);
    };
  }, [reduced]);

  const pct =
    fraction !== null && Number.isFinite(fraction)
      ? Math.min(100, Math.max(0, fraction * 100))
      : null;

  const arc = `M ${g.cx - g.r} ${g.cy} A ${g.r} ${g.r} 0 0 1 ${g.cx + g.r} ${g.cy}`;

  // Positive SVG rotation is clockwise, and the arc starts at its left end, so
  // rotating by (fraction x 180) sweeps left -> top -> right. The tick is not
  // animated: it is a reading, and it should be correct on the first frame.
  const tickDeg = ((pct ?? 0) / 100) * 180;
  const tickOuter = g.cx - (g.r + g.sw / 2 + 3);
  const tickInner = g.cx - (g.r - g.sw / 2 - 3);

  const scale =
    max !== null && Number.isFinite(max) && variant === "full"
      ? new Intl.NumberFormat("en").format(max)
      : null;

  const description = pct === null ? unavailable : `${headline} ${sub}`;

  return (
    <figure className={cn("flex flex-col gap-4", className)}>
      {/* The semantic reading lives outside .viz so forced-colours can hide the
          painted dial without also hiding its name and current value. It is the
          only role=img in the component; the SVG and the sighted fallback are
          both decorative to assistive technology, preventing duplicate reads. */}
      <span
        className="sr-only"
        role="img"
        aria-label={`${label}. ${description}`}
      />

      {/* .viz / .viz-fallback: under forced colours every stroke and fill in
          here maps to nothing, so the whole graphic — arc AND the numeral
          painted over it — is swapped for the <dl> that says the same thing.
          The fallback is aria-hidden because the persistent reading above
          already carries this to screen readers; it exists for sighted
          high-contrast users. */}
      <div
        className={cn(
          "viz relative mx-auto w-full",
          variant === "full" ? "max-w-[248px]" : "max-w-[176px]",
        )}
      >
        <svg
          viewBox={`0 0 ${g.vbW} ${g.vbH}`}
          className="w-full"
          aria-hidden
          focusable="false"
        >
          <path
            d={arc}
            fill="none"
            strokeLinecap="round"
            strokeWidth={g.sw}
            className="stroke-border/70"
          />
          {pct !== null && (
            <path
              d={arc}
              pathLength="100"
              fill="none"
              strokeLinecap="butt"
              strokeWidth={g.sw}
              strokeDasharray={`${(reduced || drawn ? pct : 0).toFixed(6)} 100`}
              className="stroke-accent-teal"
              style={
                reduced
                  ? undefined
                  : {
                      transitionProperty: "stroke-dasharray",
                      transitionDuration: settled ? "600ms" : "900ms",
                      transitionTimingFunction: "cubic-bezier(0.22,1,0.36,1)",
                    }
              }
            />
          )}
          {pct !== null && tick && (
            <g transform={`rotate(${tickDeg} ${g.cx} ${g.cy})`}>
              <line
                x1={tickOuter}
                y1={g.cy}
                x2={tickInner}
                y2={g.cy}
                strokeWidth={2}
                strokeLinecap="butt"
                className="stroke-accent-teal"
              />
              {/* The leader runs radially inward, which at any angle points at
                  the numeral sitting in the middle of the semicircle. */}
              <line
                x1={tickInner + 1}
                y1={g.cy}
                x2={tickInner + g.leader}
                y2={g.cy}
                strokeWidth={1}
                className="stroke-accent-teal/50"
              />
            </g>
          )}
        </svg>

        {/* The numeral sits on the arc's baseline and grows up into the
            semicircle. Positioned from the viewBox so it tracks the geometry
            rather than a magic number. */}
        <div
          aria-hidden
          className={cn(
            "absolute inset-x-0 flex flex-col items-center gap-1 text-center",
            // Kept inside the arc's interior half-width, (r - sw/2), with a
            // margin for the way the arc curves in above the baseline.
            variant === "full" ? "px-[16%]" : "px-[18%]",
          )}
          style={{ bottom: `${((g.vbH - g.cy) / g.vbH) * 100}%` }}
        >
          <span
            className={cn(
              "font-mono font-semibold tabular-nums text-on-surface",
              variant === "full" ? "text-xl sm:text-2xl" : "text-lg sm:text-xl",
            )}
          >
            {headline}
          </span>
          <span className="text-[11px] leading-tight text-on-surface-variant">
            {sub}
          </span>
        </div>
      </div>

      {scale !== null && (
        <div
          aria-hidden
          className="viz -mt-2 flex justify-between font-mono text-[10px] tabular-nums text-outline"
          style={{
            paddingLeft: `${((g.cx - g.r) / g.vbW) * 100}%`,
            paddingRight: `${((g.cx - g.r) / g.vbW) * 100}%`,
          }}
        >
          <span>0</span>
          <span>{scale}</span>
        </div>
      )}

      <dl className="viz-fallback sr-only" aria-hidden>
        <dt>{sub}</dt>
        <dd>{headline}</dd>
        {scale !== null && (
          <>
            <dt>0</dt>
            <dd>{scale}</dd>
          </>
        )}
      </dl>

      <figcaption className="caption">{caption}</figcaption>
    </figure>
  );
}
