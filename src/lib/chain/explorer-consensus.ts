export type ExplorerObservation = {
  id: string;
  chainId: number | null;
  indexedHeight: number | null;
  verificationHeight: number | null;
  verificationHash: string | null;
  rpcVerificationHash: string | null;
  totalTransactions: number | null;
  totalAddresses: number | null;
  coinSupply: number | null;
  indexedRatio: number | null;
  averageBlockTimeMs: number | null;
};

const HASH_PATTERN = /^0x[0-9a-f]{64}$/i;

type UnknownRecord = Record<string, unknown>;

const asRecord = (value: unknown): UnknownRecord | null =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as UnknownRecord)
    : null;

const asFiniteNumber = (value: unknown): number | null => {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value !== "string" || value.trim() === "") {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const asSafeCount = (value: unknown): number | null => {
  const parsed = asFiniteNumber(value);
  return parsed !== null && Number.isSafeInteger(parsed) && parsed >= 0
    ? parsed
    : null;
};

const isSafeCount = (value: number | null): boolean =>
  value === null ||
  (Number.isSafeInteger(value) && value >= 0);

const isSupply = (value: number | null): boolean =>
  value === null || (Number.isFinite(value) && value > 0);

export function buildBlockscoutObservation(input: {
  id: string;
  stats: unknown;
  supply: unknown;
  indexing: unknown;
  block: unknown;
  rpcVerificationHash: unknown;
}): ExplorerObservation | null {
  const stats = asRecord(input.stats);
  const indexing = asRecord(input.indexing);
  const block = asRecord(input.block);
  const indexedHeight = asSafeCount(stats?.total_blocks);
  const blockHeight = asSafeCount(block?.height);
  const blockHash = block?.hash;

  if (
    input.id.trim() === "" ||
    indexedHeight === null ||
    blockHeight === null ||
    blockHeight > indexedHeight ||
    typeof blockHash !== "string" ||
    !HASH_PATTERN.test(blockHash) ||
    typeof input.rpcVerificationHash !== "string" ||
    !HASH_PATTERN.test(input.rpcVerificationHash)
  ) {
    return null;
  }

  const observation: ExplorerObservation = {
    id: input.id,
    chainId: 1404,
    indexedHeight,
    verificationHeight: blockHeight,
    verificationHash: blockHash,
    rpcVerificationHash: input.rpcVerificationHash,
    totalTransactions: asSafeCount(stats?.total_transactions),
    totalAddresses: asSafeCount(stats?.total_addresses),
    coinSupply: asFiniteNumber(input.supply),
    indexedRatio: asFiniteNumber(indexing?.indexed_blocks_ratio),
    averageBlockTimeMs: asFiniteNumber(stats?.average_block_time),
  };

  return isVerifiedObservation(observation, indexedHeight)
    ? observation
    : null;
}

function isVerifiedObservation(
  observation: ExplorerObservation,
  rpcHead: number,
): boolean {
  if (
    observation.chainId !== 1404 ||
    !Number.isSafeInteger(rpcHead) ||
    rpcHead < 0 ||
    !Number.isSafeInteger(observation.indexedHeight) ||
    observation.indexedHeight === null ||
    observation.indexedHeight < 0 ||
    observation.indexedHeight > rpcHead ||
    !Number.isSafeInteger(observation.verificationHeight) ||
    observation.verificationHeight === null ||
    observation.verificationHeight < 0 ||
    observation.verificationHeight > observation.indexedHeight ||
    typeof observation.verificationHash !== "string" ||
    typeof observation.rpcVerificationHash !== "string" ||
    !HASH_PATTERN.test(observation.verificationHash) ||
    !HASH_PATTERN.test(observation.rpcVerificationHash) ||
    observation.verificationHash.toLowerCase() !==
      observation.rpcVerificationHash.toLowerCase() ||
    !isSafeCount(observation.totalTransactions) ||
    !isSafeCount(observation.totalAddresses) ||
    !isSupply(observation.coinSupply)
  ) {
    return false;
  }

  if (
    observation.indexedRatio !== null &&
    (!Number.isFinite(observation.indexedRatio) ||
      observation.indexedRatio < 0 ||
      observation.indexedRatio > 1)
  ) {
    return false;
  }

  if (
    observation.averageBlockTimeMs !== null &&
    (!Number.isFinite(observation.averageBlockTimeMs) ||
      observation.averageBlockTimeMs <= 0)
  ) {
    return false;
  }

  return (
    observation.totalTransactions !== null ||
    observation.totalAddresses !== null ||
    observation.coinSupply !== null
  );
}

/**
 * Pick one coherent, chain-verified explorer report. Fields are never mixed
 * between indexers: a missing value remains null so the durable aggregate
 * floor can fill it without disguising an older source as part of this read.
 */
export function selectExplorerReport(
  observations: readonly ExplorerObservation[],
  rpcHead: number,
): ExplorerObservation | null {
  const eligible = observations
    .filter((observation) => isVerifiedObservation(observation, rpcHead))
    .sort(
      (a, b) =>
        (b.indexedHeight ?? -1) - (a.indexedHeight ?? -1) ||
        a.id.localeCompare(b.id),
    );
  return eligible[0] ?? null;
}
