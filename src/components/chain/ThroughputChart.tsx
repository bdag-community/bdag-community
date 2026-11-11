"use client";

import { useEffect, useId, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { CHAIN_PAGE } from "@/lib/content/site";
import { cn } from "@/lib/utils/cn";

/** The explorer publishes one completed day at a time; polling faster than
 *  this only costs the upstream requests and never changes a bar. */
const POLL_MS = 30 * 60 * 1000;
const SECONDS_PER_DAY = 86_400;
/** Loading and failure share one glyph, site-wide. */
const DASH = "—";

/* -- geometry, in viewBox units --------------------------------------------
   The SVG scales with preserveAspectRatio="none" so the chart can be short
   and wide on a phone and tall and wide on a desktop without us measuring
   anything in JS. Rects tolerate that happily; strokes do not, so every
   line carries vector-effect="non-scaling-stroke" and every piece of TEXT
   lives outside the SVG as ordinary HTML. */
const VB_W = 310;
const VB_H = 100;
/** Bar occupies two thirds of its slot; the rest is the gap. */
const BAR_RATIO = 0.66;

/** One completed day, as the explorer recorded it. */
export type HistoryPoint = { date: string; count: number };

export type ThroughputChartProps = {
  /**
   * Live throughput measured by this server's own block window, handed down
   * rather than polled: /api/stats is ChainReadout's single poll for the
   * whole page and this component must not open a second one against it.
   * Null (the default) prints the "still measuring" line.
   */
  /** Overridden only if the page needs a different heading id to point at. */
  headingId?: string;
  className?: string;
};

const nf = new Intl.NumberFormat("en");

const dayLong = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "long",
  timeZone: "UTC",
});
const dayShort = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});

/** Explorer dates are bare calendar days; pin them to UTC so a reader west of
 *  Greenwich is not shown yesterday's label over today's bar. */
/**
 * Daily averages are quoted to three decimals because that is the resolution
 * at which the days in this window actually differ.
 */
function formatRate(perSecond: number, digits: number): string {
  return perSecond.toFixed(digits);
}

function formatDay(iso: string, fmt: Intl.DateTimeFormat): string {
  const t = Date.parse(`${iso}T00:00:00Z`);
  return Number.isFinite(t) ? fmt.format(new Date(t)) : iso;
}


/** Fill a site.ts template. An absent value renders the em-dash, so a
 *  sentence never disappears just because one figure has not arrived. */
function fill(template: string, values: Record<string, string>): string {
  return template.replace(
    /\{(\w+)\}/g,
    (_, key: string) => values[key] ?? DASH,
  );
}

/**
 * Read the daily series out of whatever /api/chain-history hands back. The
 * route may pass the explorer's payload through untouched or normalise it
 * first, so both shapes are accepted here rather than the component breaking
 * on a contract detail it does not own.
 */
function readPoints(payload: unknown): HistoryPoint[] | null {
  if (!payload || typeof payload !== "object") return null;
  const record = payload as Record<string, unknown>;
  const raw = Array.isArray(record.points)
    ? record.points
    : Array.isArray(record.chart_data)
      ? record.chart_data
      : null;
  if (!raw) return null;

  const points: HistoryPoint[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const date = typeof row.date === "string" ? row.date : null;
    // `transactions` is what /api/chain-history actually emits (history.ts
    // normalises the explorer's rows into ChainHistoryPoint); `count` and the
    // explorer's own `tx_count` are accepted too, so a route that passes the
    // upstream payload through untouched still draws.
    const value =
      typeof row.transactions === "number"
        ? row.transactions
        : typeof row.count === "number"
          ? row.count
          : typeof row.tx_count === "number"
            ? row.tx_count
            : typeof row.tx_count === "string"
              ? Number(row.tx_count)
              : null;
    if (date === null || value === null || !Number.isFinite(value)) continue;
    points.push({ date, count: value });
  }
  if (points.length === 0) return null;
  // Oldest first, so "latest" is the last bar no matter how the upstream
  // ordered its response.
  return points.sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Thirty-one days of daily transactions on one linear axis.
 *
 * There is no gauge here and there never will be: a gauge is a claim about a
 * fraction of a whole, and no maximum throughput has ever been measured on
 * this network. The highest day in the current response defines the top of
 * the chart, and every other day is drawn at its full proportional height.
 * The record is recomputed from every response and never written into copy.
 */
export function ThroughputChart({
  headingId = "throughput-heading",
  className,
}: ThroughputChartProps) {
  const copy = CHAIN_PAGE.throughput;
  const reduced = useReducedMotion();
  const uid = useId();
  const titleId = `${uid}-title`;
  const descId = `${uid}-desc`;

  const [points, setPoints] = useState<HistoryPoint[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;
    let cancelled = false;

    const load = async () => {
      try {
        const res = await fetch("/api/chain-history", { cache: "no-store" });
        if (!res.ok) throw new Error(String(res.status));
        const next = readPoints(await res.json());
        if (cancelled) return;
        if (next) {
          setPoints(next);
          setFailed(false);
        } else {
          // A well-formed response with no series in it is still a failure
          // for our purposes — there is nothing to draw.
          setFailed(true);
        }
      } catch {
        // Keep whatever we already drew. A day-old chart is still true; the
        // only thing a failed poll costs us is the newest bar.
        if (!cancelled) setFailed(true);
      }
    };

    const start = () => {
      timer ??= setInterval(load, POLL_MS);
    };
    const stop = () => {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    };
    const sync = () => {
      if (document.hidden) {
        stop();
      } else {
        void load();
        start();
      }
    };

    void load();
    if (!document.hidden) start();
    document.addEventListener("visibilitychange", sync);
    return () => {
      cancelled = true;
      stop();
      document.removeEventListener("visibilitychange", sync);
    };
  }, []);

  const slots = points?.length ?? 31;
  const slotWidth = VB_W / slots;
  const barWidth = slotWidth * BAR_RATIO;

  // The record is derived here, at render, from the response in hand. It is
  // never a constant: the day it becomes one is the day it goes stale.
  const counts = points?.map((p) => p.count) ?? [];
  const record = counts.length > 0 ? Math.max(...counts) : null;
  const recordIndex = record === null ? -1 : counts.indexOf(record);
  const axisTop = record;

  const latest = points?.[points.length - 1] ?? null;
  const peak = recordIndex >= 0 ? (points?.[recordIndex] ?? null) : null;

  const latestLine = fill(copy.latestTemplate, {
    count: latest ? nf.format(latest.count) : DASH,
    date: latest ? formatDay(latest.date, dayLong) : DASH,
    rate: latest ? formatRate(latest.count / SECONDS_PER_DAY, 3) : DASH,
  });
  const peakLine = fill(copy.peakTemplate, {
    count: peak ? nf.format(peak.count) : DASH,
    date: peak ? formatDay(peak.date, dayLong) : DASH,
    rate: peak ? formatRate(peak.count / SECONDS_PER_DAY, 3) : DASH,
  });
  // The chart is only replaced by a line of text when we have never had a
  // series to draw. A poll that fails on top of good data changes nothing.
  const unavailable = points === null && failed;

  return (
    <div className={cn("flex flex-col gap-5", className)}>
      <div className="flex flex-col gap-2">
        <h3 id={headingId} className="h3">
          {copy.title}
        </h3>
        <p className="body-sm">{copy.caption}</p>
      </div>

      {unavailable ? (
        <p className="body-sm text-on-surface-variant">{copy.unavailable}</p>
      ) : (
        <div className="relative">
          {/* Everything inside .viz is the drawing; forced colours hide it
              wholesale and reveal the table below in its place. */}
          <div className="viz">
            <p
              aria-hidden
              className="mb-1 text-right font-mono text-[11px] tabular-nums text-on-surface-variant"
            >
              {axisTop === null ? DASH : nf.format(Math.round(axisTop))}
            </p>

            <div className="relative">
              <svg
                role="img"
                aria-labelledby={`${titleId} ${descId}`}
                viewBox={`0 0 ${VB_W} ${VB_H}`}
                preserveAspectRatio="none"
                className="block h-40 w-full sm:h-48 lg:h-56"
              >
                <title id={titleId}>{copy.title}</title>
                <desc id={descId}>
                  {`${copy.caption} ${latestLine} ${peakLine}`}
                </desc>

                {points === null
                  ? // Loading draws the axis and thirty-one empty slots at the
                    // chart's final height, so nothing below it moves when the
                    // real bars arrive.
                    Array.from({ length: slots }, (_, i) => (
                      <rect
                        key={i}
                        x={i * slotWidth + (slotWidth - barWidth) / 2}
                        y={VB_H - 2}
                        width={barWidth}
                        height={2}
                        className="fill-border/60"
                      />
                    ))
                  : points.map((point, i) => {
                      const top = axisTop ?? point.count;
                      const height =
                        top > 0 ? Math.max(0, point.count / top) * VB_H : 0;
                      const x = i * slotWidth + (slotWidth - barWidth) / 2;
                      const y = VB_H - height;
                      const isLatest = i === points.length - 1;
                      const shared = {
                        x,
                        y,
                        width: barWidth,
                        height,
                        className: isLatest
                          ? "fill-accent-teal"
                          : "fill-accent-teal/70",
                      };
                      const label = fill(copy.latestTemplate, {
                        count: nf.format(point.count),
                        date: formatDay(point.date, dayLong),
                        rate: formatRate(point.count / SECONDS_PER_DAY, 3),
                      });
                      return reduced ? (
                        <rect key={point.date} {...shared}>
                          <title>{label}</title>
                        </rect>
                      ) : (
                        <motion.rect
                          key={point.date}
                          {...shared}
                          // Scale, not height: the bars grow once on the
                          // paint that first shows real data, and every later
                          // response rewrites height as a plain attribute with
                          // no transition. A bar chart that re-grows itself
                          // implies movement in data that changes once a day.
                          style={{
                            transformBox: "fill-box",
                            transformOrigin: "bottom",
                          }}
                          initial={{ scaleY: 0 }}
                          animate={{ scaleY: 1 }}
                          transition={{
                            duration: 0.5,
                            delay: i * 0.012,
                            ease: [0.22, 1, 0.36, 1],
                          }}
                        >
                          <title>{label}</title>
                        </motion.rect>
                      );
                    })}

                <line
                  x1={0}
                  x2={VB_W}
                  y1={VB_H}
                  y2={VB_H}
                  strokeWidth={1}
                vectorEffect="non-scaling-stroke"
                className="stroke-border"
              />
            </svg>
            </div>

            {/* Date axis. Only the ends survive on a phone; every fifth label
                appears once there is room for it, and none of them rotate. */}
            <div
              aria-hidden
              className="mt-2 grid"
              style={{
                gridTemplateColumns: `repeat(${slots}, minmax(0, 1fr))`,
              }}
            >
              {(points ?? Array.from({ length: slots }, () => null)).map(
                (point, i) => (
                  <span
                    key={point ? point.date : i}
                    className={cn(
                      "whitespace-nowrap text-center font-mono text-[10px] text-on-surface-variant",
                      i === 0 || i === slots - 1
                        ? ""
                        : i % 5 === 0
                          ? "hidden sm:block"
                          : "hidden",
                    )}
                  >
                    {point ? formatDay(point.date, dayShort) : DASH}
                  </span>
                ),
              )}
            </div>
          </div>

          {/* The whole series as text: read on demand by a screen reader, and
              revealed in place of the drawing under forced colours. Row
              headers carry the dates, so the table needs no invented column
              names. */}
          {/* Clip a normal wrapper rather than the table itself. CSS table
              layout ignores the sr-only width when cells have intrinsic
              content, so putting sr-only on <table> widened a 320px document
              to more than 600px even though the table was visually hidden.
              Forced-colours mode already restores .viz-fallback to normal
              flow, so the same wrapper reveals this table there. */}
          <div className="viz-fallback sr-only">
            <table>
              <caption>{copy.title}</caption>
              <tbody>
                {(points ?? []).map((point) => (
                  <tr key={point.date}>
                    <th scope="row">{formatDay(point.date, dayLong)}</th>
                    <td>
                      {fill(copy.latestTemplate, {
                        count: nf.format(point.count),
                        date: formatDay(point.date, dayLong),
                        rate: formatRate(point.count / SECONDS_PER_DAY, 3),
                      })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <p className="body-sm">{latestLine}</p>
        <p className="body-sm">{peakLine}</p>
      </div>
    </div>
  );
}
