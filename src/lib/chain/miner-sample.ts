const SAMPLE_CONFIRMATIONS = 64;
const SAMPLE_EPOCH_BLOCKS = 1_000;
const PAGE_BLOCKS = 50;
const SAMPLE_OFFSETS = [0, 10_000, 25_000, 40_000, 55_000, 70_000, 85_000] as const;
const ADDRESS_PATTERN = /^0x[0-9a-f]{40}$/i;

export type MinerSampleHeader = {
  height: number;
  miner: string;
};

export type MinerSample = {
  activeMiners: number;
  sampleAnchor: number;
};

export function minerSampleAnchor(headHeight: number): number | null {
  if (!Number.isSafeInteger(headHeight) || headHeight < SAMPLE_CONFIRMATIONS) {
    return null;
  }
  return (
    Math.floor((headHeight - SAMPLE_CONFIRMATIONS) / SAMPLE_EPOCH_BLOCKS) *
    SAMPLE_EPOCH_BLOCKS
  );
}

export function minerSampleHeights(sampleAnchor: number): number[] {
  if (!Number.isSafeInteger(sampleAnchor) || sampleAnchor < 0) return [];
  const heights: number[] = [];
  for (const offset of SAMPLE_OFFSETS) {
    const end = sampleAnchor - offset;
    const start = end - PAGE_BLOCKS + 1;
    if (start < 0) return [];
    for (let height = start; height <= end; height++) heights.push(height);
  }
  return heights;
}

export function countMinerSample(
  expectedHeights: readonly number[],
  headers: readonly MinerSampleHeader[],
): MinerSample | null {
  if (expectedHeights.length === 0 || headers.length !== expectedHeights.length) {
    return null;
  }
  const expected = new Set(expectedHeights);
  if (expected.size !== expectedHeights.length) return null;

  const seenHeights = new Set<number>();
  const miners = new Set<string>();
  for (const header of headers) {
    if (
      !Number.isSafeInteger(header.height) ||
      !expected.has(header.height) ||
      seenHeights.has(header.height) ||
      typeof header.miner !== "string" ||
      !ADDRESS_PATTERN.test(header.miner)
    ) {
      return null;
    }
    seenHeights.add(header.height);
    miners.add(header.miner.toLowerCase());
  }
  if (seenHeights.size !== expected.size) return null;

  return {
    activeMiners: miners.size,
    sampleAnchor: Math.max(...expectedHeights),
  };
}
