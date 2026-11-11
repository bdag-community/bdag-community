/**
 * Pure, deterministic fork-safe selection for automatic RPC telemetry.
 *
 * A chain id is not a fork proof. Every voter must also serve the known-good
 * pinned block below, then agree with another independent operator on an exact
 * candidate height and block hash. Endpoint count is deliberately not voter
 * count: east and west mirrors owned by the same operator still cast one vote.
 */

export const RPC_CONSENSUS_CHAIN_ID = 1404;
export const RPC_CONSENSUS_PIN_HEIGHT = 18_400_000;
export const RPC_CONSENSUS_PIN_HASH =
  "0x5fbf4e315490f0ab18b7adda33352522a03347883e1b23c3ab2e83cbe32082bb";

export type RpcBlockHashReading = {
  height: number;
  hash: string;
};

export type RpcConsensusCandidate = {
  sourceId: string;
  operatorId: string;
  chainId: number | null;
  blockHeight: number | null;
  pinnedBlockHash: string | null;
  /** `true` is disqualifying. `null` means the optional method was unsupported. */
  syncing: boolean | null;
  /** Optional and node-local. It never participates in chain selection. */
  peerCount: number | null;
  blockHashes: readonly RpcBlockHashReading[];
};

export type RpcConsensusResult = {
  chainId: typeof RPC_CONSENSUS_CHAIN_ID;
  blockHeight: number;
  blockHash: string;
  /** Lower median of the valid, one-reading-per-operator peer observations. */
  peerCount: number | null;
  /** Fixed source ID that supplied peerCount, never inferred from the head. */
  peerSourceId: string | null;
  support: number;
  operatorIds: string[];
  memberSourceIds: string[];
  representativeSourceId: string;
};

const HASH_PATTERN = /^0x[0-9a-f]{64}$/;
const ADDRESS_PATTERN = /^0x[0-9a-f]{40}$/;
const ABSENT_QUANTITY = "absent";

function normaliseHash(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const lower = value.toLowerCase();
  return HASH_PATTERN.test(lower) ? lower : null;
}

function hexToSafeHeight(value: unknown): number | null {
  if (typeof value !== "string" || !/^0x[0-9a-f]+$/i.test(value)) return null;
  const parsed = Number.parseInt(value, 16);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

function normaliseAddress(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const lower = value.toLowerCase();
  return ADDRESS_PATTERN.test(lower) ? lower : null;
}

function normaliseQuantity(value: unknown): string | null {
  if (typeof value !== "string" || !/^0x[0-9a-f]+$/i.test(value)) {
    return null;
  }
  const digits = value.slice(2).toLowerCase().replace(/^0+/, "");
  return `0x${digits || "0"}`;
}

function fullBlockFingerprint(
  value: unknown,
  expectedHeight: number,
): string | null {
  const block = value as {
    number?: unknown;
    hash?: unknown;
    miner?: unknown;
    timestamp?: unknown;
    gasUsed?: unknown;
    gasLimit?: unknown;
    baseFeePerGas?: unknown;
    transactions?: unknown;
  } | null;
  const hash = readBlockHashAt(block, expectedHeight);
  const miner = normaliseAddress(block?.miner);
  const timestamp = normaliseQuantity(block?.timestamp);
  const gasUsed = normaliseQuantity(block?.gasUsed);
  const gasLimit = normaliseQuantity(block?.gasLimit);
  const baseFeePerGas =
    block?.baseFeePerGas === null || block?.baseFeePerGas === undefined
      ? ABSENT_QUANTITY
      : normaliseQuantity(block.baseFeePerGas);
  if (
    hash === null ||
    miner === null ||
    timestamp === null ||
    gasUsed === null ||
    gasLimit === null ||
    baseFeePerGas === null ||
    !Array.isArray(block?.transactions)
  ) {
    return null;
  }

  const transactions: string[] = [];
  for (const value of block.transactions as unknown[]) {
    const transactionHash = normaliseHash(value);
    if (transactionHash === null) return null;
    transactions.push(transactionHash);
  }

  return JSON.stringify({
    number: expectedHeight,
    hash,
    miner,
    timestamp,
    gasUsed,
    gasLimit,
    baseFeePerGas,
    transactions,
  });
}

/** Bind an RPC block proof to the exact requested height. */
export function readBlockHashAt(
  value: unknown,
  expectedHeight: number,
): string | null {
  if (!validHeight(expectedHeight)) return null;
  const block = value as { number?: unknown; hash?: unknown } | null;
  if (hexToSafeHeight(block?.number) !== expectedHeight) return null;
  return normaliseHash(block?.hash);
}

export type RpcBlockOutcome = {
  sourceId: string;
  results: Map<number, unknown>;
};

/** Select one deterministic result only after two sources prove every block. */
export function selectMatchingBlockOutcome<T extends RpcBlockOutcome>(
  outcomes: readonly T[],
  firstBlockId: number,
  expectedHeights: readonly number[],
): T | null {
  const groups = new Map<string, T[]>();

  for (const outcome of outcomes) {
    const proof: string[] = [];
    let valid = true;
    expectedHeights.forEach((expectedHeight, index) => {
      const fingerprint = fullBlockFingerprint(
        outcome.results.get(firstBlockId + index),
        expectedHeight,
      );
      if (fingerprint === null) {
        valid = false;
        return;
      }
      proof.push(fingerprint);
    });
    if (!valid) continue;
    const fingerprint = proof.join("|");
    const matching = groups.get(fingerprint) ?? [];
    matching.push(outcome);
    groups.set(fingerprint, matching);
  }

  const ranked = [...groups.values()].sort(
    (left, right) =>
      right.length - left.length ||
      left[0].sourceId.localeCompare(right[0].sourceId),
  );
  if (!ranked[0] || ranked[0].length < 2) return null;
  if (ranked[1]?.length === ranked[0].length) return null;
  return [...ranked[0]].sort((left, right) =>
    left.sourceId.localeCompare(right.sourceId),
  )[0];
}

function validIdentifier(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 80;
}

function validHeight(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function validPeerCount(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

type OperatorObservation = Map<string, Set<string>>;

/**
 * Select the highest exact height/hash agreed by at least two operator IDs.
 *
 * If one operator equivocates at a height, all of that operator's observations
 * at that height are ignored. If two forks have equal strongest support at the
 * highest quorate height, selection fails closed rather than quietly choosing
 * whichever response happened to arrive first.
 */
export function resolveRpcConsensus(
  candidates: readonly RpcConsensusCandidate[],
): RpcConsensusResult | null {
  const eligible = candidates.filter((candidate) => {
    return (
      validIdentifier(candidate.sourceId) &&
      validIdentifier(candidate.operatorId) &&
      candidate.chainId === RPC_CONSENSUS_CHAIN_ID &&
      validHeight(candidate.blockHeight) &&
      candidate.blockHeight >= RPC_CONSENSUS_PIN_HEIGHT &&
      normaliseHash(candidate.pinnedBlockHash) === RPC_CONSENSUS_PIN_HASH &&
      candidate.syncing !== true
    );
  });

  // height -> operator -> hash -> source IDs. Keeping the pre-deduplicated
  // shape lets us reject an operator that presents two forks at one height.
  const observations = new Map<number, Map<string, OperatorObservation>>();
  for (const candidate of eligible) {
    for (const reading of candidate.blockHashes) {
      const hash = normaliseHash(reading.hash);
      if (
        !hash ||
        !validHeight(reading.height) ||
        reading.height < RPC_CONSENSUS_PIN_HEIGHT ||
        reading.height > (candidate.blockHeight as number)
      ) {
        continue;
      }
      const atHeight = observations.get(reading.height) ?? new Map();
      const byOperator = atHeight.get(candidate.operatorId) ?? new Map();
      const sourceIds = byOperator.get(hash) ?? new Set<string>();
      sourceIds.add(candidate.sourceId);
      byOperator.set(hash, sourceIds);
      atHeight.set(candidate.operatorId, byOperator);
      observations.set(reading.height, atHeight);
    }
  }

  const heights = [...observations.keys()].sort((a, b) => b - a);
  for (const height of heights) {
    const atHeight = observations.get(height);
    if (!atHeight) continue;

    const votes = new Map<
      string,
      { operatorIds: string[]; memberSourceIds: string[] }
    >();
    for (const [operatorId, hashes] of atHeight) {
      // Duplicate endpoints do not get duplicate votes. An operator reporting
      // two hashes gets no vote at this height at all.
      if (hashes.size !== 1) continue;
      const [[hash, sourceIds]] = hashes;
      const vote = votes.get(hash) ?? { operatorIds: [], memberSourceIds: [] };
      vote.operatorIds.push(operatorId);
      vote.memberSourceIds.push([...sourceIds].sort()[0]);
      votes.set(hash, vote);
    }

    const quorate = [...votes.entries()]
      .filter(([, vote]) => vote.operatorIds.length >= 2)
      .sort((a, b) => b[1].operatorIds.length - a[1].operatorIds.length);
    if (quorate.length === 0) continue;

    const strongestSupport = quorate[0][1].operatorIds.length;
    if (
      quorate.length > 1 &&
      quorate[1][1].operatorIds.length === strongestSupport
    ) {
      return null;
    }

    const [blockHash, winningVote] = quorate[0];
    const operatorToSource = new Map<string, string>();
    winningVote.operatorIds.forEach((operatorId, index) => {
      operatorToSource.set(operatorId, winningVote.memberSourceIds[index]);
    });
    const operatorIds = [...operatorToSource.keys()].sort();
    const memberSourceIds = operatorIds.map(
      (operatorId) => operatorToSource.get(operatorId) as string,
    );
    const candidateBySource = new Map(
      eligible.map((candidate) => [candidate.sourceId, candidate]),
    );
    const peers = memberSourceIds
      .flatMap((sourceId) => {
        const value = candidateBySource.get(sourceId)?.peerCount;
        return validPeerCount(value) ? [{ sourceId, value }] : [];
      })
      .sort((a, b) => a.value - b.value || a.sourceId.localeCompare(b.sourceId));
    const peerReading =
      peers.length > 0 ? peers[Math.floor((peers.length - 1) / 2)] : null;
    const sortedMemberSourceIds = [...memberSourceIds].sort();

    return {
      chainId: RPC_CONSENSUS_CHAIN_ID,
      blockHeight: height,
      blockHash,
      peerCount: peerReading?.value ?? null,
      peerSourceId: peerReading?.sourceId ?? null,
      support: operatorIds.length,
      operatorIds,
      memberSourceIds: sortedMemberSourceIds,
      representativeSourceId: sortedMemberSourceIds[0],
    };
  }

  return null;
}
