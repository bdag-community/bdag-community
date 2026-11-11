"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils/cn";
import { CHAIN_PAGE } from "@/lib/content/site";

/**
 * Four measurements of the block interval on one shared axis — and
 * deliberately NOT a gauge.
 *
 * A dial needs a target to be a fraction of, and this chain declares none.
 * Difficulty reads 1 in every block header, so there is no retarget signal to
 * read a target interval off, and nothing else publishes one. Put a needle at
 * 42% of an arc and every visitor reads "42% of the way to the limit" no
 * matter what the caption underneath says. There is no limit. So the form is
 * the measurement itself: a dot at the value, an error bar at the quantisation
 * error, and the four windows stacked on one axis so they can be compared by
 * eye.
 *
 * Why four windows and not one number. Block timestamps here are whole seconds
 * while blocks arrive faster than that, so two consecutive blocks cannot give
 * an interval — the reading only becomes accurate over distance. The error on
 * a window of n blocks is 1000/n milliseconds, which is why the bars visibly
 * shrink as the baselines lengthen. That shrinking is the point of the
 * graphic: it teaches why the number needs a window, which is the argument of
 * the section this sits in. The four values also do not converge
 * monotonically, and showing all four is how we avoid pretending they do.
 *
 * Structurally this is a real <dl>, not an image. Each row is a label and a
 * spelled-out value; the track, dot and bar are an aria-hidden decorative
 * layer inside the value cell. A screen reader gets four clean measurements,
 * which is strictly better than the sighted version.
 */

/**
 * Unit vocabulary for the spoken value, not page copy — "848.2 ms" read aloud
 * is noise, so the glyphs are spelled out. These sit here rather than in
 * site.ts only because CHAIN_PAGE.interval has no key for them; if they ever
 * need rewording they belong next to `errorLabel`.
 */
const SR_MS = (ms: string) => `${ms} milliseconds`;
const SR_MS_WITH_ERROR = (ms: string, err: string) =>
  `${ms} milliseconds, plus or minus ${err}`;
const SR_UNAVAILABLE = "unavailable";

const MS = new Intl.NumberFormat("en", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});
const ERR = new Intl.NumberFormat("en", { maximumSignificantDigits: 2 });

/**
 * A bar narrower than ~2% of the axis gets no whisker caps. Capping a
 * sub-pixel bar would be minimum ink — the same dishonesty the capacity gauge
 * refuses — and an invisible error bar is the correct rendering of an error
 * that small.
 */
const WHISKER_MIN_PCT = 2;

/**
 * One baseline. The caller owns the labels — they are CHAIN_PAGE copy, and
 * this component never authors a word of its own.
 */
export type IntervalBaselineRow = {
  /** Stable React key; the caller's own identifier for the window. */
  key: string;
  /** Copy, from CHAIN_PAGE.interval.baselineLabels. */
  label: string;
  /** Length of the measurement window, in blocks. */
  blocks: number | null;
  /** Mean interval over that window, in milliseconds. `null` = no reading. */
  ms: number | null;
  /** Quantisation error: whole-second timestamps over `blocks` blocks, so
   *  1000 / blocks milliseconds. `null` draws no error bar. */
  errorMs: number | null;
  /** Shown in place of the value while a window is still filling — pass
   *  CHAIN_PAGE.interval.measuring for the since-boot row. */
  note?: string;
};

/**
 * The four readings, when the caller would rather hand over numbers than
 * assemble rows. Labels, the measuring note and the quantisation errors are
 * then filled in here from CHAIN_PAGE — there is only one correct set of them.
 */
export type IntervalReadings = {
  /** Interval measured since this server process started, in milliseconds. */
  serverMs: number | null;
  /** Blocks that window spans; sets its error and gates whether it is shown. */
  serverBlocks: number | null;
  /** (ts_head − ts_head−10,000) ÷ 10,000, in milliseconds. */
  tenKMs: number | null;
  hundredKMs: number | null;
  millionMs: number | null;
};

export type IntervalBaselinesProps = (
  { baselines: IntervalBaselineRow[] } | IntervalReadings
) & {
  className?: string;
};

/**
 * The since-boot window is not published until it spans this many blocks. Any
 * shorter and its quantisation error is wider than the spread between the
 * three fixed baselines, so the row would read as a disagreement rather than
 * as an imprecise agreement.
 */
const SERVER_WINDOW_MIN_BLOCKS = 1000;

function rowsFromReadings(r: IntervalReadings): IntervalBaselineRow[] {
  const labels = CHAIN_PAGE.interval.baselineLabels;
  const serverReady =
    r.serverMs !== null &&
    r.serverBlocks !== null &&
    r.serverBlocks >= SERVER_WINDOW_MIN_BLOCKS;
  return [
    {
      key: "server",
      label: labels.server,
      blocks: r.serverBlocks,
      ms: serverReady ? r.serverMs : null,
      errorMs: serverReady && r.serverBlocks ? 1000 / r.serverBlocks : null,
      // The one row whose absence is not a failure: it is a window still
      // filling, and saying so is more use than an em-dash.
      note: CHAIN_PAGE.interval.measuring,
    },
    {
      key: "tenK",
      label: labels.tenK,
      blocks: 10_000,
      ms: r.tenKMs,
      errorMs: 1000 / 10_000,
    },
    {
      key: "hundredK",
      label: labels.hundredK,
      blocks: 100_000,
      ms: r.hundredKMs,
      errorMs: 1000 / 100_000,
    },
    {
      key: "million",
      label: labels.millionn,
      blocks: 1_000_000,
      ms: r.millionMs,
      errorMs: 1000 / 1_000_000,
    },
  ];
}

export function IntervalBaselines(props: IntervalBaselinesProps) {
  const copy = CHAIN_PAGE.interval;
  const { className } = props;
  const rows = "baselines" in props ? props.baselines : rowsFromReadings(props);

  // The axis is derived from whatever has arrived, with 5% padding, and it is
  // shared by all four rows at every width — stacking the rows on a narrow
  // screen must not quietly rescale them against each other.
  const values = rows
    .map((r) => r.ms)
    .filter((v): v is number => v !== null && Number.isFinite(v));
  const lo0 = values.length ? Math.min(...values) : null;
  const hi0 = values.length ? Math.max(...values) : null;
  // A single reading has no spread of its own, so it gets a nominal one rather
  // than a division by zero; the dot lands mid-axis and the bars still scale.
  const pad =
    lo0 !== null && hi0 !== null ? Math.max((hi0 - lo0) * 0.05, 0.5) : 0;
  const lo = lo0 !== null ? lo0 - pad : null;
  const hi = hi0 !== null ? hi0 + pad : null;
  const span = lo !== null && hi !== null ? hi - lo : null;

  const at = (v: number) =>
    lo === null || span === null || span <= 0 ? 50 : ((v - lo) / span) * 100;

  /*
   * The error bars wipe out from their centres the first time the strip is
   * seen, because the shrinking is the thing worth noticing — a bar already at
   * width when you arrive teaches nothing. It is a transform and a transition
   * and nothing else; this used to be motion/react, imported for one scaleX on
   * one span.
   *
   * Both gates are load-bearing. The bars do not exist until the first
   * snapshot lands, so the flip cannot be scheduled at mount or it would fire
   * before there is anything to draw. And it waits for the strip to be on
   * screen, which is what whileInView did. The rAF makes the undrawn state
   * real for one frame: a transition does not run on an element's first paint.
   *
   * Nothing can be stranded at scale 0. These bars exist only because a fetch
   * resolved in this browser, so a page where effects never run is a page with
   * no bars to hide. Under reduced motion the flip happens at once, the
   * site-wide reduce block flattens the transition, and the stagger is dropped
   * — a delay is motion whatever its duration.
   */
  const stripRef = useRef<HTMLDivElement>(null);
  const [draw, setDraw] = useState({ on: false, stagger: true });
  const hasData = values.length > 0;

  useEffect(() => {
    if (draw.on || !hasData) return;
    const el = stripRef.current;
    if (!el) return;
    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    let frame = 0;
    const arrive = () => {
      frame = requestAnimationFrame(() =>
        setDraw({ on: true, stagger: !reduced }),
      );
    };
    if (reduced) {
      arrive();
      return () => cancelAnimationFrame(frame);
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        io.disconnect();
        arrive();
      },
      { rootMargin: "0px 0px -10% 0px", threshold: 0 },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [draw.on, hasData]);

  return (
    <div ref={stripRef} className={cn("flex flex-col gap-4", className)}>
      <dl className="flex flex-col gap-3">
        {rows.map((row, i) => {
          const errPct =
            row.errorMs !== null && span !== null && span > 0
              ? (row.errorMs / span) * 100
              : 0;
          const barWidth = Math.min(100, errPct * 2);
          const value = row.ms === null ? null : MS.format(row.ms);
          const errText = row.errorMs === null ? null : ERR.format(row.errorMs);

          const spoken =
            value === null
              ? (row.note ?? SR_UNAVAILABLE)
              : errText === null
                ? SR_MS(value)
                : SR_MS_WITH_ERROR(value, errText);

          return (
            <div
              key={row.key}
              className="grid grid-cols-1 items-center gap-x-4 gap-y-1.5 sm:grid-cols-[minmax(0,12rem)_1fr]"
            >
              <dt className="label-caps text-on-surface-variant">
                {row.label}
              </dt>
              <dd className="flex items-center gap-3">
                {/* The decorative layer. Live measurements move, so they wear
                    teal; the axis they sit on is structure, so it does not. */}
                <span aria-hidden className="viz relative h-3 min-w-0 flex-1">
                  <span className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-border/70" />
                  {row.ms !== null && (
                    <>
                      {barWidth > 0 && (
                        <ErrorBar
                          drawn={draw.on}
                          delayMs={draw.stagger ? i * 60 : 0}
                          left={at(row.ms) - barWidth / 2}
                          width={barWidth}
                          capped={barWidth >= WHISKER_MIN_PCT}
                        />
                      )}
                      <span
                        className="absolute top-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent-teal"
                        style={{ left: `${at(row.ms)}%` }}
                      />
                    </>
                  )}
                </span>
                {value === null ? (
                  <span aria-hidden className="text-xs text-on-surface-variant">
                    {row.note ?? "—"}
                  </span>
                ) : (
                  <>
                    <span
                      aria-hidden
                      className="w-[4.75rem] shrink-0 text-right font-mono text-xs tabular-nums text-on-surface sm:text-sm"
                    >
                      {value} ms
                    </span>
                    <span
                      aria-hidden
                      className="w-[4rem] shrink-0 text-right font-mono text-[11px] tabular-nums text-outline"
                    >
                      {errText === null ? "" : `±${errText}`}
                    </span>
                  </>
                )}
                <span className="sr-only">{spoken}</span>
              </dd>
            </div>
          );
        })}
      </dl>

      {/* The shared axis, labelled at both ends and aligned to the rows above
          by repeating their exact column and value-cell widths. */}
      <div
        aria-hidden
        className="viz grid grid-cols-1 gap-x-4 sm:grid-cols-[minmax(0,12rem)_1fr]"
      >
        <span className="hidden sm:block" />
        <div className="flex items-center gap-3">
          <div className="flex min-w-0 flex-1 justify-between font-mono text-[10px] tabular-nums text-outline">
            <span>{lo === null ? "—" : `${MS.format(lo)} ms`}</span>
            <span>{hi === null ? "—" : `${MS.format(hi)} ms`}</span>
          </div>
          <span className="w-[4.75rem] shrink-0" />
          <span className="w-[4rem] shrink-0" />
        </div>
      </div>

      <p className="caption">± {copy.errorLabel}</p>
    </div>
  );
}

/**
 * One error bar, staggered down the four rows.
 *
 * The vertical centring is part of the inline transform rather than a
 * `-translate-y-1/2` utility: a single `transform` property carries both, and
 * an inline scaleX would otherwise replace the class's translate and drop the
 * bar off the axis it is measuring against. Undrawn is the same transform at
 * zero width, so only the scale interpolates.
 */
function ErrorBar({
  drawn,
  delayMs,
  left,
  width,
  capped,
}: {
  drawn: boolean;
  delayMs: number;
  left: number;
  width: number;
  capped: boolean;
}) {
  return (
    <span
      className={cn(
        "absolute top-1/2 h-1.5 bg-accent-teal/30 transition-transform duration-[400ms] ease-[cubic-bezier(0.22,1,0.36,1)]",
        capped && "border-x border-accent-teal/70",
      )}
      style={{
        left: `${left}%`,
        width: `${width}%`,
        transform: `translateY(-50%) scaleX(${drawn ? 1 : 0})`,
        transitionDelay: `${delayMs}ms`,
      }}
    />
  );
}
