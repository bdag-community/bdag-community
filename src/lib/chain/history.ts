import "server-only";

import { CHAIN } from "@/lib/content/site";

/**
 * The 31-day daily-transaction history, cached for an hour.
 *
 * Separate from stats.ts because the cadence is different by three orders of
 * magnitude. The snapshot in stats.ts refreshes every twelve seconds because
 * the head moves; this series changes once a day, when the explorer closes a
 * day and appends a row. Polling it on the snapshot's cadence would be 300
 * pointless requests an hour against an API that rate-limits, so it gets its
 * own TTL and its own route.
 *
 * The response holds complete days only — there is no row for the day in
 * progress, and the page says so rather than drawing a stub bar that looks
 * like a collapse in traffic.
 *
 * Same failure doctrine as stats.ts: a failed fetch serves the last good
 * series marked stale, and only an outright cold failure yields null points,
 * which the chart renders as one line of plain text instead of an empty axis.
 */

export type ChainHistoryPoint = {
  /** ISO date, e.g. "2026-08-05". One complete day. */
  date: string;
  /** Transactions the explorer counted on that day. */
  transactions: number;
};

export type ChainHistory = {
  /** Oldest first — drawing order. Null when we have never had a series. */
  points: ChainHistoryPoint[] | null;
  /** ISO timestamp the series was fetched. */
  fetchedAt: string;
  /** True when the upstream failed and this is the last good series. */
  stale: boolean;
};

const TTL_MS = 60 * 60 * 1000;
/** A refusal should not cost a whole hour of history — back off five minutes
 *  and try again, which is still nowhere near enough traffic to matter. */
const FAILURE_RETRY_MS = 5 * 60 * 1000;
const UPSTREAM_TIMEOUT_MS = 8_000;

let cached: ChainHistory | null = null;
let inflight: Promise<ChainHistory> | null = null;

/**
 * Blockscout returns `{ chart_data: [{ date, transactions_count }, ...] }`,
 * newest first. Both of those are worth stating: the key is `chart_data` and
 * not `chart`, and the order is reversed here once so no consumer has to
 * remember to do it.
 */
async function fetchSeries(): Promise<ChainHistoryPoint[]> {
  const res = await fetch(
    `${CHAIN.explorerUrl}/api/v2/stats/charts/transactions`,
    {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      cache: "no-store",
    },
  );
  if (!res.ok) throw new Error(`Explorer charts/transactions HTTP ${res.status}`);
  const json = (await res.json()) as { chart_data?: unknown };
  const rows = Array.isArray(json.chart_data) ? json.chart_data : null;
  if (!rows) throw new Error("charts/transactions: no chart_data");

  const points: ChainHistoryPoint[] = [];
  for (const raw of rows) {
    const row = raw as { date?: unknown; transactions_count?: unknown };
    const value =
      typeof row?.transactions_count === "string"
        ? Number(row.transactions_count)
        : typeof row?.transactions_count === "number"
          ? row.transactions_count
          : NaN;
    if (typeof row?.date === "string" && Number.isFinite(value)) {
      points.push({ date: row.date, transactions: value });
    }
  }
  if (points.length === 0) throw new Error("charts/transactions: empty series");

  points.sort((a, b) => a.date.localeCompare(b.date));
  return points;
}

/** Cached daily series (TTL 60 min, request-coalesced, stale-on-error). */
export async function getChainHistory(): Promise<ChainHistory> {
  const ttl = cached?.stale ? FAILURE_RETRY_MS : TTL_MS;
  if (cached && Date.now() - Date.parse(cached.fetchedAt) < ttl) {
    return cached;
  }
  inflight ??= fetchSeries()
    .then((points) => {
      const next: ChainHistory = {
        points,
        fetchedAt: new Date().toISOString(),
        stale: false,
      };
      cached = next;
      return next;
    })
    .catch(() => {
      // Hold the last good series rather than blanking a month of history
      // over one refused request. The refreshed timestamp plus the shorter
      // failure TTL is what throttles the retry.
      const held: ChainHistory = {
        points: cached?.points ?? null,
        fetchedAt: new Date().toISOString(),
        stale: true,
      };
      cached = held;
      return held;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}
