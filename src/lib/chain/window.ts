import "server-only";

import { deriveContiguousRateWindow } from "@/lib/chain/window-range";

/**
 * The block-window accumulator: everything this site knows about throughput,
 * capacity and block interval that it worked out for itself.
 *
 * Why this exists at all. The explorer's aggregates cannot answer these
 * questions. `total_transactions` is a recomputed total over a database that
 * is still backfilling behind the head, so it sits byte-identical for hours
 * and then jumps — differencing it would produce a rate of zero almost always
 * and an absurd spike occasionally. `average_block_time` disagrees with every
 * direct baseline we measure and moves when no relevant block has changed. So
 * the honest route is to accumulate the block pages we are already fetching
 * and measure over our own window.
 *
 * `assemble()` in stats.ts fetches two independently verified 50-block pages.
 * The newest page always feeds the ticker, producer and capacity views. The
 * optional older page extends the rate window without being able to blank the
 * newest data if one provider times out. The accumulator dedupes by height.
 *
 * It is in-process and it resets on deploy. Every figure derived from it has
 * to be labelled with the window it was measured over, which is why `derive()`
 * returns `windowSeconds` and `windowBlocks` alongside the values rather than
 * leaving the caller to guess.
 *
 * The coverage guard is the point of the whole module. Nobody polls this site
 * continuously, so the rate uses only the newest uninterrupted run. Older
 * blocks remain available for long-baseline measurements, but a historical
 * gap can neither enter the divisor nor keep later good data blank. Below 98%
 * coverage `observedTps` returns null and the interface says it is measuring.
 */

/** One row of the ticker: what the block header itself says. */
export type RecentBlock = {
  height: number;
  /** ISO timestamp from the header. Whole seconds on this chain. */
  timestamp: string;
  /** The address in the header. Not a person, and not necessarily a machine. */
  producer: string | null;
  transactions: number;
  gasUsed: number;
};

export type BlockWindow = {
  /** (tsMax - tsMin) / (hMax - hMin). Null until the span is long enough to
   *  survive whole-second timestamps — see MIN_BASELINE_BLOCKS. */
  measuredBlockTimeMs: number | null;
  /** Blocks actually held. Not the same as the span, hence `coverage`. */
  windowBlocks: number;
  /** Chain seconds from the oldest to the newest block held. */
  windowSeconds: number;
  /** Transactions per second, or null when the window is too short or gappy. */
  observedTps: number | null;
  /** Blocks held ÷ blocks the window claims to span. 1 means no holes. */
  coverage: number;
  /** Σ gas_used ÷ Σ gas_limit over the most recent SAMPLE_BLOCKS. */
  capacityFraction: number | null;
  /** The gas ceiling, read off the sampled headers and never typed in. */
  gasLimitPerBlock: number | null;
  /** True when the sampled headers disagree about the limit — then the figure
   *  above is the highest one seen and the caption has to say so. */
  gasLimitVaried: boolean;
  /** The height range the sample covers, so a caption can name its window. */
  sampleFromHeight: number | null;
  sampleToHeight: number | null;
  /** Distinct producer addresses in that same sample. */
  producersInWindow: number;
  /** Those producers with their block counts, busiest first. */
  producers: { address: string; blocks: number }[];
  /** The newest RECENT_ROWS blocks, newest first. */
  recentBlocks: RecentBlock[];
};

type BlockFacts = {
  ts: number;
  txs: number;
  gasUsed: number;
  gasLimit: number;
  producer: string | null;
};

/** height -> facts. Deduped by height, so overlapping pages are free. */
const blocks = new Map<number, BlockFacts>();

/** ~6 h at ~0.85 s per block, so ~25k entries — a few megabytes at worst. */
const MAX_WINDOW_BLOCKS = 6 * 60 * 60;
/** The capacity reading is defined over one explorer page, which is 50. */
const SAMPLE_BLOCKS = 50;
/** Rows the ticker shows. */
const RECENT_ROWS = 8;
/**
 * COLD-START GATE, not an averaging window. Read that carefully before
 * changing it, because the name invites the wrong reading.
 *
 * The rate is `totalTxs / windowSeconds` over the newest contiguous run and is
 * always published beside that window. This constant does not set a fixed
 * averaging period. It sets how much uninterrupted history the server must
 * collect before it publishes anything at all.
 *
 * It was ten minutes, on the grounds that this chain carries so few
 * transactions that a short window is Poisson-dominated. That is true, and it
 * is a real cost only in the first minutes of a window that is about to get
 * longer anyway. Against it: nobody waits ten minutes, so in practice the
 * figure read "measuring" for every visitor who arrived after a deploy, which
 * is a permanently blank stat rather than a careful one. One minute is the
 * trade the owner asked for, and the honesty is carried where it belongs, on
 * the label: every reading states the window it was taken over, so an early
 * visitor sees "measured over 1m 4s" and can weigh it accordingly.
 */
const MIN_WINDOW_SECONDS = 60;
/** Below this, the window has holes and we publish nothing. */
const MIN_COVERAGE = 0.98;
/** Timestamps are whole seconds while blocks arrive faster than that, so an
 *  interval only becomes meaningful over distance. A thousand blocks is about
 *  fifteen minutes of chain and about a 0.1% quantisation error. */
const MIN_BASELINE_BLOCKS = 1000;

const toInt = (v: unknown): number | null => {
  const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? n : null;
};

/**
 * Absorb one /api/v2/blocks response. Anything malformed is skipped rather
 * than thrown: this runs inside the snapshot assembly, which must survive a
 * bad upstream response the same way it survives no response at all.
 *
 * Only ever feed CONTIGUOUS pages from the head. The historical sampling that
 * seeds the 24h miner count deliberately does not come through here — those
 * pages sit tens of thousands of blocks apart and would collapse `coverage`
 * to a few per cent, which is exactly the signal the guard exists to protect.
 */
export function feed(page: unknown): void {
  const items = Array.isArray(page)
    ? page
    : ((page as { items?: unknown[] } | null)?.items ?? null);
  if (!Array.isArray(items)) return;

  for (const raw of items) {
    const item = raw as {
      height?: unknown;
      timestamp?: unknown;
      transactions_count?: unknown;
      gas_used?: unknown;
      gas_limit?: unknown;
      miner?: { hash?: unknown };
    } | null;
    if (!item) continue;

    const height = toInt(item.height);
    const ts =
      typeof item.timestamp === "string" ? Date.parse(item.timestamp) : NaN;
    if (height === null || !Number.isSafeInteger(height) || !Number.isFinite(ts))
      continue;

    blocks.set(height, {
      ts,
      txs: toInt(item.transactions_count) ?? 0,
      gasUsed: toInt(item.gas_used) ?? 0,
      gasLimit: toInt(item.gas_limit) ?? 0,
      producer:
        typeof item.miner?.hash === "string" ? item.miner.hash : null,
    });
  }

  prune();
}

/** Drop everything older than the window so memory is bounded by height, not
 *  by uptime. Pruning by height rather than by wall clock keeps `coverage`
 *  meaningful — the denominator is a block span, so the cut must be one too. */
function prune(): void {
  let hMax = -Infinity;
  for (const height of blocks.keys()) if (height > hMax) hMax = height;
  if (!Number.isFinite(hMax)) return;
  const floor = hMax - MAX_WINDOW_BLOCKS;
  for (const height of blocks.keys()) if (height < floor) blocks.delete(height);
}

const EMPTY: BlockWindow = {
  measuredBlockTimeMs: null,
  windowBlocks: 0,
  windowSeconds: 0,
  observedTps: null,
  coverage: 0,
  capacityFraction: null,
  gasLimitPerBlock: null,
  gasLimitVaried: false,
  sampleFromHeight: null,
  sampleToHeight: null,
  producersInWindow: 0,
  producers: [],
  recentBlocks: [],
};

/** Everything the window can honestly say right now. Cheap enough to call on
 *  every snapshot: one sort over at most MAX_WINDOW_BLOCKS entries. */
export function derive(): BlockWindow {
  if (blocks.size === 0) return EMPTY;

  const heights = [...blocks.keys()].sort((a, b) => b - a);
  const rate = deriveContiguousRateWindow(
    heights.map((height) => {
      const facts = blocks.get(height)!;
      return {
        height,
        timestampMs: facts.ts,
        transactions: facts.txs,
      };
    }),
    {
      minimumSeconds: MIN_WINDOW_SECONDS,
      minimumCoverage: MIN_COVERAGE,
      minimumBaselineBlocks: MIN_BASELINE_BLOCKS,
    },
  );

  // Capacity, producers and the ticker are all read off the most recent page
  // only: "how full are the blocks right now" is a different question from
  // "how busy has the last six hours been", and mixing the two would let a
  // quiet night quietly dilute a busy minute.
  const sample = heights.slice(0, SAMPLE_BLOCKS);
  let sumUsed = 0;
  let sumLimit = 0;
  let gasLimitPerBlock = 0;
  let gasLimitVaried = false;
  const producerCounts = new Map<string, number>();
  for (const height of sample) {
    const facts = blocks.get(height);
    if (!facts) continue;
    sumUsed += facts.gasUsed;
    sumLimit += facts.gasLimit;
    if (gasLimitPerBlock > 0 && facts.gasLimit !== gasLimitPerBlock) {
      gasLimitVaried = true;
    }
    if (facts.gasLimit > gasLimitPerBlock) gasLimitPerBlock = facts.gasLimit;
    if (facts.producer) {
      const key = facts.producer.toLowerCase();
      producerCounts.set(key, (producerCounts.get(key) ?? 0) + 1);
    }
  }

  const producers = [...producerCounts.entries()]
    .map(([address, count]) => ({ address, blocks: count }))
    .sort((a, b) => b.blocks - a.blocks || a.address.localeCompare(b.address));

  const recentBlocks: RecentBlock[] = heights
    .slice(0, RECENT_ROWS)
    .map((height) => {
      const facts = blocks.get(height)!;
      return {
        height,
        timestamp: new Date(facts.ts).toISOString(),
        producer: facts.producer,
        transactions: facts.txs,
        gasUsed: facts.gasUsed,
      };
    });

  return {
    measuredBlockTimeMs: rate.measuredBlockTimeMs,
    windowBlocks: rate.windowBlocks,
    windowSeconds: rate.windowSeconds,
    observedTps: rate.observedTps,
    coverage: rate.coverage,
    capacityFraction: sumLimit > 0 ? sumUsed / sumLimit : null,
    gasLimitPerBlock: gasLimitPerBlock > 0 ? gasLimitPerBlock : null,
    gasLimitVaried,
    sampleFromHeight: sample.length > 0 ? sample[sample.length - 1] : null,
    sampleToHeight: sample.length > 0 ? sample[0] : null,
    producersInWindow: producerCounts.size,
    producers,
    recentBlocks,
  };
}
