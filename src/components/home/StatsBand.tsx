"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import { Section } from "@/components/ui/Section";
import { Button } from "@/components/ui/Button";
import { StatNumber } from "@/components/ui/StatNumber";
import { ChainStatusPill } from "@/components/chain/ChainStatusPill";
import type { NetworkStats } from "@/lib/chain/stats";
import { CHAIN, STATS_SECTION } from "@/lib/content/site";

const POLL_MS = 12_000;

type FetchPhase = "checking" | "live" | "degraded";

type StatDef = {
  key: keyof Pick<
    NetworkStats,
    | "blockHeight"
    | "peers"
    | "activeMiners"
    | "totalTransactions"
    | "totalAddresses"
    | "coinSupply"
  >;
  label: string;
  format: "grouped" | "compact";
};

type AggregateStatKey = keyof NetworkStats["aggregateProvenance"];

const isAggregateStatKey = (key: StatDef["key"]): key is AggregateStatKey =>
  key === "totalTransactions" ||
  key === "totalAddresses" ||
  key === "coinSupply";

const STATS: StatDef[] = [
  { key: "blockHeight", label: "Block height", format: "grouped" },
  { key: "peers", label: "Peers", format: "grouped" },
  // "Mining pools", not "miners": block rewards pay to ~20 addresses in any
  // 24h window and the top handful dominate — pools/large operators, with
  // the individual miners behind them not publicly visible. The value is
  // STILL that 24h window; only the "(24h)" qualifier was dropped from the
  // label, so do not re-scope the query to match a shorter-looking label.
  { key: "activeMiners", label: "Mining pools", format: "grouped" },
  { key: "totalTransactions", label: "Transactions", format: "grouped" },
  { key: "totalAddresses", label: "Addresses", format: "grouped" },
  { key: "coinSupply", label: "BDAG supply", format: "compact" },
];

/**
 * The network's pulse — live numerals over a quiet band ("data is jewellery",
 * DESIGN.md). Polls the same-origin /api/stats snapshot (server-cached, so
 * every visitor shares one upstream poll), pauses while the tab is hidden,
 * and keeps transient failover in the console while its public chain identity
 * remains stable.
 */
export function StatsBand() {
  const [stats, setStats] = useState<NetworkStats | null>(null);
  const [phase, setPhase] = useState<FetchPhase>("checking");
  // Extrapolated blocks since the current snapshot: blocks land faster than
  // we poll, so the height keeps ticking BETWEEN polls at the measured block
  // interval and every poll corrects it to truth. Capped at two poll windows
  // so a stalled backend can never fabricate progress.
  const [tick, setTick] = useState(0);
  const lastSnapshotRef = useRef<string | null>(null);

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;
    let cancelled = false;

    const load = async () => {
      try {
        const res = await fetch("/api/stats", { cache: "no-store" });
        if (!res.ok) throw new Error(String(res.status));
        const next = (await res.json()) as NetworkStats;
        if (!cancelled) {
          // New snapshot -> extrapolation restarts from truth.
          if (lastSnapshotRef.current !== next.fetchedAt) {
            lastSnapshotRef.current = next.fetchedAt;
            setTick(0);
          }
          setStats(next);
          setPhase(next.stale ? "degraded" : "live");
        }
      } catch {
        if (!cancelled) setPhase("degraded");
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
    // Only the POLLING pauses while the tab is hidden; the initial snapshot
    // below always loads, so a background-opened tab is already truthful the
    // moment it is first seen. Resuming visibility refreshes immediately.
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

  // The between-polls ticker: advance the displayed height once per measured
  // block interval while the tab is visible.
  useEffect(() => {
    if (!stats || stats.blockHeight === null) return;
    // The MEASURED interval, not the explorer's average_block_time: that
    // field disagrees with every direct baseline we take and moves between
    // checks in which no relevant block changed. CHAIN.blockIntervalFallbackMs
    // stands in only until the first snapshot arrives.
    const per = Math.min(
      3000,
      Math.max(400, stats.measuredBlockTimeMs ?? CHAIN.blockIntervalFallbackMs),
    );
    const maxTicks = Math.floor((POLL_MS * 2) / per);
    const id = setInterval(() => {
      if (document.hidden) return;
      setTick((t) => (t < maxTicks ? t + 1 : t));
    }, per);
    return () => clearInterval(id);
  }, [stats]);

  const hasDerivedAggregate = Object.values(
    stats?.aggregateProvenance ?? {},
  ).some((provenance) => provenance !== null && provenance !== "exact");

  return (
    // data-spine-*: the DAG spine routes a circuit through this band —
    // around the label, along the cell row, boxing each cell as it passes.
    // The hooks are opt-in, so a page without them simply keeps the rail.
    <section
      id="network"
      data-spine-band
      aria-label="Live network statistics"
      className="full-bleed section-surface scroll-mt-24"
    >
      <Section className="flex flex-col gap-10 py-16 sm:py-20">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div className="flex flex-col gap-3">
            {/* Live telemetry wears turquoise (DESIGN.md accent roles). */}
            <p data-spine-label className="eyebrow text-teal-soft">
              {STATS_SECTION.eyebrow}
            </p>
            <h2 className="h2">{STATS_SECTION.title}</h2>
            <p className="lead">{STATS_SECTION.sub}</p>
          </div>
          <ChainStatusPill status={phase} surface="home" />
        </div>

        {/* lg+: space-between distribution instead of equal tracks — equal
            tracks read unevenly because value widths differ wildly (a 10-digit
            height next to a 2-digit peer count). */}
        <dl className="grid grid-cols-2 gap-x-6 gap-y-10 md:grid-cols-3 lg:flex lg:flex-wrap lg:items-end lg:justify-between lg:gap-x-10">
          {STATS.map((s) => {
            const provenance =
              stats !== null && isAggregateStatKey(s.key)
                ? (stats.aggregateProvenance?.[s.key] ?? null)
                : null;
            const showMarker =
              provenance !== null && provenance !== "exact";
            const markerLabel = showMarker
              ? STATS_SECTION.aggregateProvenance.labels[provenance]
              : null;

            return (
              <div
                key={s.key}
                data-spine-cell
                className="flex flex-col gap-1.5 text-center"
              >
                <dt className="label-caps text-on-surface-variant">
                  {s.label}
                </dt>
              {/* Three steps, one per grid shape, each measured against the
                  track it has to sit in. Below sm the grid is two columns and
                  a 375px viewport leaves 159.5px per cell — a ten-digit height
                  in Geist Mono is 180px at 30px and 144px at 24px, so 30px
                  collided with the next cell and `html { overflow-x: clip }`
                  swallowed the evidence. sm keeps two columns but ≥292px of
                  them; md switches to three at 218.7px, where 36px still fits
                  a ten-digit number, which is the size this band has always
                  worn on desktop. */}
                <dd className="text-2xl font-semibold text-on-surface sm:text-3xl md:text-4xl">
                  <span className="inline-flex items-start">
                    <StatNumber
                      value={
                        stats === null
                          ? null
                          : s.key === "blockHeight" &&
                              stats.blockHeight !== null
                            ? stats.blockHeight + tick
                            : stats[s.key]
                      }
                      format={s.format}
                    />
                    {showMarker && markerLabel ? (
                      <sup
                        className="ml-1 text-xs font-medium text-on-surface-variant sm:text-sm"
                        title={markerLabel}
                      >
                        <span aria-hidden>
                          {STATS_SECTION.aggregateProvenance.marker}
                        </span>
                        <span className="sr-only"> {markerLabel}</span>
                      </sup>
                    ) : null}
                  </span>
                </dd>
              </div>
            );
          })}
        </dl>

        <div className="flex flex-wrap items-center gap-x-6 gap-y-4 border-t border-border/60 pt-6">
          <Button
            href={STATS_SECTION.viewAll.url}
            target="_blank"
            rel="noopener noreferrer"
            variant="ghost"
            trailingIcon={
              <ArrowUpRight className="size-4" strokeWidth={2} aria-hidden />
            }
          >
            {STATS_SECTION.viewAll.label}
          </Button>
          {/* Deliberately plain text, not a link — the endpoint is for wallets
              and integrators to copy, not for browsers to open. The hostname
              is machine-facing data, so it wears teal (DESIGN.md). max-w-full
              + flex-wrap + break-all: a boosted-text webview once clipped the
              hostname at the container edge; a hostname may wrap, never clip. */}
          <p className="inline-flex min-h-[44px] max-w-full flex-wrap items-center gap-1.5 font-mono text-sm text-on-surface-variant">
            {STATS_SECTION.publicRpc.label}:{" "}
            <span className="break-all text-teal-soft">
              {STATS_SECTION.publicRpc.host}
            </span>
          </p>
          <Link
            href={STATS_SECTION.viewAllNodes.href}
            className="focus-ring group inline-flex min-h-[44px] items-center gap-1.5 text-sm font-medium text-accent-soft transition-colors hover:text-on-surface"
          >
            {STATS_SECTION.viewAllNodes.label}
            <ArrowRight
              className="size-4 transition-transform group-hover:translate-x-0.5"
              strokeWidth={2}
              aria-hidden
            />
          </Link>
        </div>

        {/* The explorer-index caveat, inline with the totals it qualifies.
            It arrived here when the /chain boundary rail was removed, and this
            band is the only place on the site that draws a transaction total
            or an address total: without it both read as complete counts. */}
        <p className="caption max-w-[72ch]">
          {STATS_SECTION.floorNote}
          {hasDerivedAggregate ? (
            <> {STATS_SECTION.aggregateProvenance.note}</>
          ) : null}
        </p>
      </Section>
    </section>
  );
}
