/**
 * Return the newest uninterrupted run of block heights. Older data remains
 * useful for long-baseline measurements, but a gap must never contaminate a
 * transaction rate derived from the latest observations.
 */
export function newestContiguousHeights(
  observedHeights: readonly number[],
): number[] {
  const heights = [
    ...new Set(
      observedHeights.filter(
        (height) => Number.isSafeInteger(height) && height >= 0,
      ),
    ),
  ].sort((a, b) => b - a);
  if (heights.length === 0) return [];

  const contiguous = [heights[0]];
  for (let index = 1; index < heights.length; index += 1) {
    if (heights[index] !== contiguous[contiguous.length - 1] - 1) break;
    contiguous.push(heights[index]);
  }
  return contiguous;
}

export type ContiguousRateObservation = {
  height: number;
  timestampMs: number;
  transactions: number;
};

export type ContiguousRateWindow = {
  windowBlocks: number;
  windowSeconds: number;
  coverage: number;
  observedTps: number | null;
  measuredBlockTimeMs: number | null;
};

/**
 * Derive rate and interval only from the newest uninterrupted chain segment.
 * This makes a later healthy read self-healing after an old polling gap.
 */
export function deriveContiguousRateWindow(
  observations: readonly ContiguousRateObservation[],
  options: {
    minimumSeconds: number;
    minimumCoverage?: number;
    minimumBaselineBlocks: number;
  },
): ContiguousRateWindow {
  const byHeight = new Map<number, ContiguousRateObservation>();
  for (const observation of observations) {
    if (
      !Number.isSafeInteger(observation.height) ||
      observation.height < 0 ||
      !Number.isFinite(observation.timestampMs) ||
      !Number.isFinite(observation.transactions) ||
      observation.transactions < 0
    ) {
      continue;
    }
    byHeight.set(observation.height, observation);
  }

  const heights = newestContiguousHeights([...byHeight.keys()]);
  if (heights.length === 0) {
    return {
      windowBlocks: 0,
      windowSeconds: 0,
      coverage: 0,
      observedTps: null,
      measuredBlockTimeMs: null,
    };
  }

  let timestampMin = Infinity;
  let timestampMax = -Infinity;
  let totalTransactions = 0;
  for (const height of heights) {
    const observation = byHeight.get(height)!;
    timestampMin = Math.min(timestampMin, observation.timestampMs);
    timestampMax = Math.max(timestampMax, observation.timestampMs);
    totalTransactions += observation.transactions;
  }

  const span = heights[0] - heights[heights.length - 1];
  const windowSeconds =
    timestampMax > timestampMin ? (timestampMax - timestampMin) / 1_000 : 0;
  const coverage = heights.length / (span + 1);
  const minimumCoverage = options.minimumCoverage ?? 0.98;

  return {
    windowBlocks: heights.length,
    windowSeconds,
    coverage,
    observedTps:
      coverage >= minimumCoverage && windowSeconds >= options.minimumSeconds
        ? totalTransactions / windowSeconds
        : null,
    measuredBlockTimeMs:
      span >= options.minimumBaselineBlocks && timestampMax > timestampMin
        ? (timestampMax - timestampMin) / span
        : null,
  };
}
