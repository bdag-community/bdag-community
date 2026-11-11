import "server-only";

import { CHAIN } from "@/lib/content/site";
import {
  acceptExplorerReport,
  applyValidatedExplorerReport,
  observeChainVerifiedFallbackReport,
  resolveChainAggregates,
  type AggregateProvenance,
  type ChainAggregateReport,
} from "@/lib/chain/aggregates";
import {
  getStoredChainAggregateState,
  getStoredChainConsensusSnapshot,
  getStoredChainLiveCheckpoint,
  persistChainAggregateReport,
  persistTransactionCursor,
  publishChainConsensusSnapshot,
  rememberChainAggregateState,
  type ChainConsensusSnapshot,
} from "@/lib/chain/aggregate-store.server";
import { getExplorerConsensus } from "@/lib/chain/explorer-sources.server";
import {
  countMinerSample,
  minerSampleAnchor,
  minerSampleHeights,
  type MinerSample,
  type MinerSampleHeader,
} from "@/lib/chain/miner-sample";
import {
  selectMatchingBlockOutcome as matchingBlockOutcomes,
  type RpcConsensusResult,
} from "@/lib/chain/rpc-consensus";
import {
  mergeVerifiedBlockPages,
  retainVerifiedBaselines,
} from "@/lib/chain/rpc-detail-state";
import {
  probeAutomaticRpcSources,
  rpcBatchOutcomesFromConsensus,
  type VerifiedRpcCall,
} from "@/lib/chain/rpc-sources.server";
import type { RecentBlock } from "@/lib/chain/window";
import { derive as deriveWindow, feed as feedWindow } from "@/lib/chain/window";

export type { RecentBlock } from "@/lib/chain/window";

export type NetworkStats = {
  blockHeight: number | null;
  /** A deterministic lower-median node reading, not a network-wide total. */
  peers: number | null;
  chainId: number | null;
  /** Unique producer addresses in one deterministic trailing-day sample. */
  activeMiners: number | null;
  totalTransactions: number | null;
  totalAddresses: number | null;
  coinSupply: number | null;
  aggregateProvenance: {
    totalTransactions: AggregateProvenance | null;
    totalAddresses: AggregateProvenance | null;
    coinSupply: AggregateProvenance | null;
  };
  averageBlockTimeMs: number | null;
  gasPriceWei: number | null;
  baseFeePerGasWei: number | null;
  syncing: boolean | null;
  intervalTenKMs: number | null;
  intervalHundredKMs: number | null;
  intervalMillionMs: number | null;
  measuredBlockTimeMs: number | null;
  observedTps: number | null;
  windowSeconds: number;
  windowBlocks: number;
  windowCoverage: number;
  capacityFraction: number | null;
  gasLimitPerBlock: number | null;
  gasLimitVaried: boolean | null;
  sampleFromHeight: number | null;
  sampleToHeight: number | null;
  producersInWindow: number | null;
  producers: { address: string; blocks: number }[];
  recentBlocks: RecentBlock[];
  indexedRatio: number | null;
  /** Time the authoritative RPC quorum observed this head. */
  fetchedAt: string;
  /** True once no independently verified shared snapshot is recent. */
  stale: boolean;
};

const TTL_MS = 12_000;
const CONSENSUS_STALE_MS = 60_000;
const BASELINE_SPANS = [10_000, 100_000, 1_000_000] as const;
const RECENT_PRIMARY_BLOCKS = 50;
const RECENT_EXTENSION_BLOCKS = 50;
const ADDRESS_PATTERN = /^0x[0-9a-f]{40}$/i;
const HASH_PATTERN = /^0x[0-9a-f]{64}$/i;

let cached: NetworkStats | null = null;
let inflight: Promise<NetworkStats> | null = null;
let refreshStartedAt = 0;
let sampledMiners: MinerSample | null = null;
let minerSampleInflight: Promise<MinerSample | null> | null = null;
let lastVerifiedBaselines: (number | null)[] = BASELINE_SPANS.map(() => null);

const hexToNumber = (value: unknown): number | null => {
  if (typeof value !== "string" || !/^0x[0-9a-f]+$/i.test(value)) return null;
  const parsed = Number.parseInt(value, 16);
  return Number.isSafeInteger(parsed) ? parsed : null;
};

const blockHash = (value: unknown): string | null => {
  const hash = (value as { hash?: unknown } | null)?.hash;
  return typeof hash === "string" && HASH_PATTERN.test(hash)
    ? hash.toLowerCase()
    : null;
};

const orNull = async <T>(promise: Promise<T>): Promise<T | null> => {
  try {
    return await promise;
  } catch {
    return null;
  }
};

function baselineMs(head: unknown, older: unknown): number | null {
  const headBlock = head as { number?: unknown; timestamp?: unknown } | null;
  const oldBlock = older as { number?: unknown; timestamp?: unknown } | null;
  const headHeight = hexToNumber(headBlock?.number);
  const oldHeight = hexToNumber(oldBlock?.number);
  const headTimestamp = hexToNumber(headBlock?.timestamp);
  const oldTimestamp = hexToNumber(oldBlock?.timestamp);
  if (
    headHeight === null ||
    oldHeight === null ||
    headTimestamp === null ||
    oldTimestamp === null ||
    headHeight <= oldHeight
  ) {
    return null;
  }
  return ((headTimestamp - oldTimestamp) * 1_000) / (headHeight - oldHeight);
}

function blockPageFromResults(
  results: Map<number, unknown>,
  firstResultId: number,
  expectedHeights: readonly number[],
): { items: unknown[] } | null {
  const items: unknown[] = [];
  expectedHeights.forEach((expectedHeight, index) => {
    const block = results.get(firstResultId + index) as {
      number?: unknown;
      timestamp?: unknown;
      miner?: unknown;
      gasUsed?: unknown;
      gasLimit?: unknown;
      transactions?: unknown;
    } | null;
    const height = hexToNumber(block?.number);
    const timestamp = hexToNumber(block?.timestamp);
    if (height !== expectedHeight || timestamp === null) return;
    items.push({
      height,
      timestamp: new Date(timestamp * 1_000).toISOString(),
      transactions_count: Array.isArray(block?.transactions)
        ? block.transactions.length
        : 0,
      gas_used: hexToNumber(block?.gasUsed) ?? 0,
      gas_limit: hexToNumber(block?.gasLimit) ?? 0,
      miner: {
        hash: typeof block?.miner === "string" ? block.miner : null,
      },
    });
  });
  return items.length > 0 ? { items } : null;
}

type RpcDetails = {
  gasPriceWei: number | null;
  syncing: boolean | null;
  headBlock: unknown | null;
  baselines: (number | null)[];
  blockPage: { items: unknown[] } | null;
};

/*
 * Detail reads used to be one 56-call request. RMS, one of the two sources
 * available from production, rejects batches larger than 50. Keeping recent
 * blocks, historical baselines and optional metadata independent means a
 * transient failure in one class cannot erase verified results in another.
 */
async function readRpcDetails(
  consensus: RpcConsensusResult,
): Promise<RpcDetails> {
  const baselineHeights = BASELINE_SPANS.map((span) =>
    Math.max(0, consensus.blockHeight - span),
  );
  const primaryRecentHeights = Array.from(
    { length: Math.min(RECENT_PRIMARY_BLOCKS, consensus.blockHeight + 1) },
    (_, index) => consensus.blockHeight - index,
  );
  const extensionHead =
    consensus.blockHeight - primaryRecentHeights.length;
  const extensionRecentHeights = Array.from(
    {
      length: Math.min(
        RECENT_EXTENSION_BLOCKS,
        Math.max(0, extensionHead + 1),
      ),
    },
    (_, index) => extensionHead - index,
  );
  const primaryRecentCalls: VerifiedRpcCall[] = primaryRecentHeights.map(
    (height) => ({
      method: "eth_getBlockByNumber",
      params: [`0x${height.toString(16)}`, false],
    }),
  );
  const extensionRecentCalls: VerifiedRpcCall[] = extensionRecentHeights.map(
    (height) => ({
      method: "eth_getBlockByNumber",
      params: [`0x${height.toString(16)}`, false],
    }),
  );
  const baselineCalls = baselineHeights.map((baselineHeight) => ({
    baselineHeight,
    calls: [
      {
        method: "eth_getBlockByNumber",
        params: [`0x${baselineHeight.toString(16)}`, false],
      },
    ] satisfies VerifiedRpcCall[],
  }));
  // ID 0 must be a broadly supported result because the transport uses it to
  // reject an entirely unusable source. Gas price is deliberately second.
  const optionalCalls: VerifiedRpcCall[] = [
    { method: "eth_syncing" },
    { method: "eth_gasPrice" },
  ];

  const [
    primaryRecentOutcomes,
    extensionRecentOutcomes,
    baselineOutcomes,
    optionalOutcomes,
  ] =
    await Promise.all([
      rpcBatchOutcomesFromConsensus(consensus, primaryRecentCalls),
      extensionRecentCalls.length > 0
        ? rpcBatchOutcomesFromConsensus(consensus, extensionRecentCalls)
        : Promise.resolve([]),
      Promise.all(
        baselineCalls.map(async ({ baselineHeight, calls }) => {
          const outcomes = await rpcBatchOutcomesFromConsensus(consensus, calls);
          return matchingBlockOutcomes(outcomes, 0, [baselineHeight]);
        }),
      ),
      rpcBatchOutcomesFromConsensus(consensus, optionalCalls),
    ]);

  const matchedPrimaryRecent = matchingBlockOutcomes(
    primaryRecentOutcomes,
    0,
    primaryRecentHeights,
  );
  const candidateHead = matchedPrimaryRecent?.results.get(0) ?? null;
  const primaryRecentOutcome =
    hexToNumber((candidateHead as { number?: unknown } | null)?.number) ===
      consensus.blockHeight && blockHash(candidateHead) === consensus.blockHash
      ? matchedPrimaryRecent
      : null;
  const extensionRecentOutcome =
    primaryRecentOutcome && extensionRecentHeights.length > 0
      ? matchingBlockOutcomes(
          extensionRecentOutcomes,
          0,
          extensionRecentHeights,
        )
      : null;
  const headBlock = primaryRecentOutcome?.results.get(0) ?? null;

  if (headBlock) {
    const observedBaselines = baselineOutcomes.map((outcome) => {
      const measured = outcome
        ? baselineMs(headBlock, outcome.results.get(0))
        : null;
      return measured;
    });
    lastVerifiedBaselines = retainVerifiedBaselines(
      lastVerifiedBaselines,
      observedBaselines,
    );
  }

  const optionalOutcome = optionalOutcomes[0] ?? null;
  const rawSyncing = optionalOutcome?.results.get(0);
  return {
    gasPriceWei: hexToNumber(optionalOutcome?.results.get(1)),
    syncing:
      rawSyncing === false
        ? false
        : rawSyncing === true ||
            (typeof rawSyncing === "object" && rawSyncing !== null)
          ? true
          : null,
    headBlock,
    baselines: [...lastVerifiedBaselines],
    blockPage: mergeVerifiedBlockPages(
      primaryRecentOutcome
        ? blockPageFromResults(
            primaryRecentOutcome.results,
            0,
            primaryRecentHeights,
          )
        : null,
      extensionRecentOutcome
        ? blockPageFromResults(
            extensionRecentOutcome.results,
            0,
            extensionRecentHeights,
          )
        : null,
    ),
  };
}
function currentMinerSample(
  consensus: RpcConsensusResult,
  stored: ChainConsensusSnapshot | null,
): MinerSample | null {
  const sampleAnchor = minerSampleAnchor(consensus.blockHeight);
  if (sampleAnchor === null) return null;
  if (sampledMiners?.sampleAnchor === sampleAnchor) return sampledMiners;
  if (
    stored?.minerSampleAnchor === sampleAnchor &&
    stored.activeMiners !== null
  ) {
    sampledMiners = { sampleAnchor, activeMiners: stored.activeMiners };
    return sampledMiners;
  }
  return null;
}

async function refreshMinerSample(
  consensus: RpcConsensusResult,
): Promise<MinerSample | null> {
  const available = currentMinerSample(consensus, null);
  if (available) return available;
  const sampleAnchor = minerSampleAnchor(consensus.blockHeight);
  if (sampleAnchor === null) return null;
  if (minerSampleInflight) return minerSampleInflight;

  minerSampleInflight = (async () => {
    const expectedHeights = minerSampleHeights(sampleAnchor);
    if (expectedHeights.length === 0) return null;
    const headers: MinerSampleHeader[] = [];
    for (let offset = 0; offset < expectedHeights.length; offset += 50) {
      const heights = expectedHeights.slice(offset, offset + 50);
      const outcomes = await rpcBatchOutcomesFromConsensus(
        consensus,
        heights.map((height) => ({
          method: "eth_getBlockByNumber",
          params: [`0x${height.toString(16)}`, false],
        })),
      );
      const outcome = matchingBlockOutcomes(outcomes, 0, heights);
      if (!outcome) return null;
      for (let index = 0; index < heights.length; index++) {
        const block = outcome.results.get(index) as {
          number?: unknown;
          miner?: unknown;
        } | null;
        const height = hexToNumber(block?.number);
        if (
          height === null ||
          typeof block?.miner !== "string" ||
          !ADDRESS_PATTERN.test(block.miner)
        ) {
          return null;
        }
        headers.push({ height, miner: block.miner });
      }
    }
    const complete = countMinerSample(expectedHeights, headers);
    if (complete) sampledMiners = complete;
    return complete;
  })().finally(() => {
    minerSampleInflight = null;
  });
  return minerSampleInflight;
}

async function resolveAggregates(
  consensus: RpcConsensusResult | null,
): Promise<{
  values: ReturnType<typeof resolveChainAggregates>;
  averageBlockTimeMs: number | null;
  indexedRatio: number | null;
}> {
  let aggregateState = await getStoredChainAggregateState();
  const explorerConsensus = consensus
    ? await orNull(getExplorerConsensus(consensus))
    : null;
  const explorerReport = explorerConsensus?.report ?? null;
  let freshReport: ChainAggregateReport | null = null;

  if (explorerReport && explorerReport.indexedHeight !== null) {
    const previousCursor = aggregateState.cursor;
    const beforeReport = aggregateState;
    const input = {
      sourceId: explorerReport.id,
      verificationHeight: explorerReport.verificationHeight ?? undefined,
      verificationHash: explorerReport.verificationHash ?? undefined,
      height: explorerReport.indexedHeight,
      heightSource: "explorer" as const,
      totalTransactions: explorerReport.totalTransactions,
      totalAddresses: explorerReport.totalAddresses,
      coinSupply: explorerReport.coinSupply,
      capturedAt: explorerConsensus?.checkedAt ?? new Date().toISOString(),
    };
    const accepted =
      explorerReport.id === "canonical-explorer"
        ? acceptExplorerReport(aggregateState, input)
        : observeChainVerifiedFallbackReport(aggregateState, input);
    const hasTrustedValue = Object.values(accepted.report.trusted).some(Boolean);
    const storedReport = hasTrustedValue
      ? await persistChainAggregateReport(accepted.report)
      : null;
    freshReport = storedReport ?? accepted.report;
    aggregateState = hasTrustedValue
      ? storedReport
        ? applyValidatedExplorerReport(beforeReport, storedReport)
        : beforeReport
      : accepted.state;
    rememberChainAggregateState(aggregateState);
    if (!hasTrustedValue) void persistChainAggregateReport(freshReport);
    if (
      aggregateState.cursor &&
      (previousCursor?.height !== aggregateState.cursor.height ||
        previousCursor?.runningTotal !== aggregateState.cursor.runningTotal)
    ) {
      void persistTransactionCursor(aggregateState.cursor, true);
    }
  }

  return {
    values: resolveChainAggregates(
      aggregateState,
      explorerReport?.id === "canonical-explorer" ? freshReport : null,
    ),
    averageBlockTimeMs: explorerReport?.averageBlockTimeMs ?? null,
    indexedRatio: explorerReport?.indexedRatio ?? null,
  };
}

async function assemble(): Promise<NetworkStats> {
  const [rpcProbe, storedConsensus, storedLegacy] = await Promise.all([
    probeAutomaticRpcSources(),
    getStoredChainConsensusSnapshot(),
    getStoredChainLiveCheckpoint(),
  ]);
  const consensus = rpcProbe.consensus;

  let authoritative = storedConsensus;
  if (consensus) {
    authoritative =
      (await publishChainConsensusSnapshot({
        chainId: consensus.chainId,
        blockHeight: consensus.blockHeight,
        blockHash: consensus.blockHash,
        peers: consensus.peerCount,
        peerSource: consensus.peerSourceId,
        activeMiners: null,
        minerSampleAnchor: null,
        rpcSourceIds: consensus.memberSourceIds,
        rpcOperatorIds: consensus.operatorIds,
        rpcObservedAt: rpcProbe.checkedAt,
      })) ?? authoritative;
  }

  const alignedConsensus =
    consensus !== null &&
    authoritative !== null &&
    authoritative.blockHeight === consensus.blockHeight &&
    authoritative.blockHash === consensus.blockHash
      ? consensus
      : null;

  const minerSample = alignedConsensus
    ? currentMinerSample(alignedConsensus, authoritative)
    : null;
  if (alignedConsensus && !minerSample) {
    const sampleConsensus = alignedConsensus;
    void refreshMinerSample(sampleConsensus)
      .then((sample) =>
        sample
          ? publishChainConsensusSnapshot({
              chainId: sampleConsensus.chainId,
              blockHeight: sampleConsensus.blockHeight,
              blockHash: sampleConsensus.blockHash,
              peers: sampleConsensus.peerCount,
              peerSource: sampleConsensus.peerSourceId,
              activeMiners: sample.activeMiners,
              minerSampleAnchor: sample.sampleAnchor,
              rpcSourceIds: sampleConsensus.memberSourceIds,
              rpcOperatorIds: sampleConsensus.operatorIds,
              rpcObservedAt: rpcProbe.checkedAt,
            })
          : null,
      )
      .catch(() => undefined);
  }

  const [details, aggregates] = await Promise.all([
    alignedConsensus
      ? readRpcDetails(alignedConsensus)
      : Promise.resolve(null),
    resolveAggregates(alignedConsensus),
  ]);

  if (alignedConsensus && minerSample) {
    authoritative =
      (await publishChainConsensusSnapshot({
        chainId: alignedConsensus.chainId,
        blockHeight: alignedConsensus.blockHeight,
        blockHash: alignedConsensus.blockHash,
        peers: alignedConsensus.peerCount,
        peerSource: alignedConsensus.peerSourceId,
        activeMiners: minerSample.activeMiners,
        minerSampleAnchor: minerSample.sampleAnchor,
        rpcSourceIds: alignedConsensus.memberSourceIds,
        rpcOperatorIds: alignedConsensus.operatorIds,
        rpcObservedAt: rpcProbe.checkedAt,
      })) ?? authoritative;
  }

  const finalAlignment =
    consensus !== null &&
    authoritative !== null &&
    authoritative.blockHeight === consensus.blockHeight &&
    authoritative.blockHash === consensus.blockHash;
  const effectiveDetails = finalAlignment ? details : null;
  // Historical intervals are independently verified by two operators. A
  // concurrent writer may advance the shared head between this process's
  // detail read and final publication, but that authority race does not make
  // the last verified historical baselines untrue.
  const verifiedBaselines =
    effectiveDetails?.baselines ?? lastVerifiedBaselines;

  if (effectiveDetails?.blockPage) feedWindow(effectiveDetails.blockPage);
  const observed = deriveWindow();
  const observedAt =
    authoritative?.rpcObservedAt ??
    storedLegacy?.capturedAt ??
    cached?.fetchedAt ??
    new Date().toISOString();
  const stale =
    !authoritative ||
    Date.now() - Date.parse(authoritative.rpcObservedAt) > CONSENSUS_STALE_MS;
  const snapshot: NetworkStats = {
    blockHeight: authoritative?.blockHeight ?? storedLegacy?.blockHeight ?? null,
    peers: authoritative ? authoritative.peers : storedLegacy?.peers ?? null,
    chainId: authoritative?.chainId ?? null,
    activeMiners: authoritative
      ? authoritative.activeMiners
      : storedLegacy?.activeMiners ?? null,
    totalTransactions: aggregates.values.totalTransactions,
    totalAddresses: aggregates.values.totalAddresses,
    coinSupply: aggregates.values.coinSupply,
    aggregateProvenance: aggregates.values.provenance,
    averageBlockTimeMs: aggregates.averageBlockTimeMs,
    gasPriceWei: effectiveDetails?.gasPriceWei ?? null,
    baseFeePerGasWei: hexToNumber(
      (effectiveDetails?.headBlock as { baseFeePerGas?: unknown } | null)
        ?.baseFeePerGas,
    ),
    syncing: effectiveDetails?.syncing ?? null,
    intervalTenKMs: verifiedBaselines[0] ?? null,
    intervalHundredKMs: verifiedBaselines[1] ?? null,
    intervalMillionMs: verifiedBaselines[2] ?? null,
    measuredBlockTimeMs: observed.measuredBlockTimeMs,
    observedTps: observed.observedTps,
    windowSeconds: observed.windowSeconds,
    windowBlocks: observed.windowBlocks,
    windowCoverage: observed.coverage,
    capacityFraction: observed.capacityFraction,
    gasLimitPerBlock: observed.gasLimitPerBlock,
    gasLimitVaried:
      observed.gasLimitPerBlock === null ? null : observed.gasLimitVaried,
    sampleFromHeight: observed.sampleFromHeight,
    sampleToHeight: observed.sampleToHeight,
    producersInWindow:
      observed.producersInWindow > 0 ? observed.producersInWindow : null,
    producers: observed.producers,
    recentBlocks: observed.recentBlocks,
    indexedRatio: aggregates.indexedRatio,
    fetchedAt: authoritative?.rpcObservedAt ?? observedAt,
    stale,
  };

  if (!authoritative && !storedLegacy && cached) {
    return {
      ...cached,
      totalTransactions: snapshot.totalTransactions,
      totalAddresses: snapshot.totalAddresses,
      coinSupply: snapshot.coinSupply,
      aggregateProvenance: snapshot.aggregateProvenance,
      stale: true,
    };
  }
  return snapshot;
}

function refresh(): Promise<NetworkStats> {
  if (!inflight) {
    refreshStartedAt = Date.now();
    inflight = assemble()
      .then((snapshot) => {
        cached = snapshot;
        return snapshot;
      })
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

export async function getNetworkStats(): Promise<NetworkStats> {
  if (cached && Date.now() - refreshStartedAt < TTL_MS) return cached;
  if (cached) {
    void refresh().catch(() => undefined);
    return cached;
  }
  return refresh();
}

export async function probeRpcHealth(): Promise<{
  ok: boolean;
  chainId: number | null;
  blockHeight: number | null;
}> {
  const stats = await getNetworkStats();
  return {
    ok:
      !stats.stale &&
      stats.chainId === CHAIN.chainId &&
      stats.blockHeight !== null,
    chainId: stats.chainId,
    blockHeight: stats.blockHeight,
  };
}
