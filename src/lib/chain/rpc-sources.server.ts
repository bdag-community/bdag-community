import "server-only";

import { MAINNET_RPC_PRIORITY, walletRpcMatchesCheckpoint } from "./mainnet-endpoints.ts";
import {
  RPC_CONSENSUS_CHAIN_ID,
  RPC_CONSENSUS_PIN_HASH,
  RPC_CONSENSUS_PIN_HEIGHT,
  readBlockHashAt,
  resolveRpcConsensus,
  type RpcConsensusCandidate,
  type RpcConsensusResult,
} from "@/lib/chain/rpc-consensus";
import {
  executeRpcBatchChunks,
} from "@/lib/chain/rpc-batching";

type FixedRpcSource = {
  id: string;
  operatorId: string;
  url: string;
  automatic: boolean;
};

/**
 * This is the complete fixed registry. URLs never come from content,
 * request data, environment variables, or the public node directory.
 * Only sources confirmed suitable by the live audit are automatic. The rest,
 * including WelshDAG, stay explicit non-automatic records so a future edit
 * cannot accidentally turn a directory entry into a vote.
 */
const RPC_SOURCES = [
  {
    id: "canonical-rpc",
    operatorId: "blockdag",
    url: "https://rpc.blockdag.engineering/",
    automatic: true,
  },
  {
    id: "rms",
    operatorId: "rms",
    url: "https://rms-bdag-rpc.de/api/rpc-live",
    automatic: true,
  },
  {
    id: "cms",
    operatorId: "cms-mining-pool",
    url: "https://rpc.cms-mining-pool.net/",
    automatic: true,
  },
  {
    id: "dvdmining",
    operatorId: "dvdmining",
    url: "https://rpc.dvdmining.com/",
    automatic: false,
  },
  {
    id: "bdag-us-east",
    operatorId: "bdag-us",
    url: "https://rpc.east.bdag-us.org/",
    automatic: true,
  },
  {
    id: "bdag-us-west",
    operatorId: "bdag-us",
    url: "https://rpc.west.bdag-us.org/",
    automatic: false,
  },
  {
    id: "bdag-us-brazil",
    operatorId: "bdag-us",
    url: "https://rpc.brazil.bdag-us.org/",
    automatic: false,
  },
  {
    id: "bdag-us-england",
    operatorId: "bdag-us",
    url: "https://rpc.england.bdag-us.org/",
    automatic: false,
  },
  {
    id: "capedag",
    operatorId: "capedag",
    url: "https://rpc.capedag.com/",
    automatic: false,
  },
  {
    id: "welshdag",
    operatorId: "welshdag",
    url: "https://rpc.welshdag.trade/",
    automatic: false,
  },
  {
    id: "bdagexplorer",
    operatorId: "bdagexplorer",
    url: "https://rpc.bdagexplorer.com/",
    automatic: true,
  },
  {
    id: "blockdag-solutions",
    operatorId: "blockdag-solutions",
    url: "https://rpc.blockdag.solutions/",
    automatic: true,
  },
] as const satisfies readonly FixedRpcSource[];

const AUTOMATIC_RPC_SOURCES = RPC_SOURCES.filter(
  (source) => source.automatic,
);
const AUTOMATIC_SOURCE_BY_ID = new Map<
  string,
  (typeof AUTOMATIC_RPC_SOURCES)[number]
>(
  AUTOMATIC_RPC_SOURCES.map((source) => [source.id, source]),
);

const PROBE_TIMEOUT_MS = 4_500;
const PROBE_CACHE_TTL_MS = 20_000;
const MAX_RESPONSE_BYTES = 512 * 1024;
const MAX_REQUEST_BYTES = 64 * 1024;
const MAX_BATCH_CALLS = 64;

type FetchLike = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

type RpcResponse = {
  id?: unknown;
  result?: unknown;
  error?: unknown;
};

export type VerifiedRpcCall = {
  method: string;
  params?: readonly unknown[];
};

export type RpcConsensusSnapshot = {
  candidates: RpcConsensusCandidate[];
  consensus: RpcConsensusResult | null;
  checkedAt: string;
};

export type RpcBatchOutcome = {
  sourceId: string;
  results: Map<number, unknown>;
};

let cachedProbe: RpcConsensusSnapshot | null = null;
let probeInflight: Promise<RpcConsensusSnapshot> | null = null;
let probeStartedAt = 0;

function byteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

async function readJsonBounded(response: Response): Promise<unknown> {
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_RESPONSE_BYTES) {
    throw new Error("RPC response exceeds the size limit");
  }

  if (!response.body) {
    const text = await response.text();
    if (byteLength(text) > MAX_RESPONSE_BYTES) {
      throw new Error("RPC response exceeds the size limit");
    }
    return JSON.parse(text) as unknown;
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_RESPONSE_BYTES) {
        await reader.cancel("RPC response exceeds the size limit");
        throw new Error("RPC response exceeds the size limit");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const joined = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    joined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder().decode(joined)) as unknown;
}

function validateCalls(calls: readonly VerifiedRpcCall[]): void {
  if (calls.length === 0 || calls.length > MAX_BATCH_CALLS) {
    throw new Error(`RPC batch must contain 1-${MAX_BATCH_CALLS} calls`);
  }
  for (const call of calls) {
    if (!/^[A-Za-z][A-Za-z0-9_.]{0,79}$/.test(call.method)) {
      throw new Error("Invalid RPC method");
    }
    if (call.params !== undefined && !Array.isArray(call.params)) {
      throw new Error("RPC params must be an array");
    }
  }
}

async function rpcBatchAtSource(
  source: FixedRpcSource,
  calls: readonly VerifiedRpcCall[],
  fetchImpl: FetchLike,
): Promise<Map<number, unknown>> {
  validateCalls(calls);
  const body = JSON.stringify(
    calls.map((call, id) => ({
      jsonrpc: "2.0",
      id,
      method: call.method,
      params: call.params ?? [],
    })),
  );
  if (byteLength(body) > MAX_REQUEST_BYTES) {
    throw new Error("RPC request exceeds the size limit");
  }

  const response = await fetchImpl(source.url, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body,
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`RPC HTTP ${response.status}`);

  const payload = await readJsonBounded(response);
  const rows = Array.isArray(payload) ? payload : [payload];
  const results = new Map<number, unknown>();
  for (const value of rows) {
    const row = value as RpcResponse | null;
    if (
      row &&
      Number.isInteger(row.id) &&
      (row.id as number) >= 0 &&
      (row.id as number) < calls.length &&
      row.error === undefined &&
      row.result !== undefined
    ) {
      results.set(row.id as number, row.result);
    }
  }
  return results;
}

function hexToSafeNumber(value: unknown): number | null {
  if (typeof value !== "string" || !/^0x[0-9a-f]+$/i.test(value)) return null;
  const parsed = Number.parseInt(value, 16);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

type CoreProbe = {
  chainId: number | null;
  blockHeight: number | null;
  pinnedBlockHash: string | null;
};

async function probeCore(
  source: (typeof AUTOMATIC_RPC_SOURCES)[number],
  fetchImpl: FetchLike,
): Promise<CoreProbe> {
  const results = await rpcBatchAtSource(
    source,
    [
      { method: "eth_chainId" },
      { method: "eth_blockNumber" },
      {
        method: "eth_getBlockByNumber",
        params: [`0x${RPC_CONSENSUS_PIN_HEIGHT.toString(16)}`, false],
      },
    ],
    fetchImpl,
  );
  return {
    chainId: hexToSafeNumber(results.get(0)),
    blockHeight: hexToSafeNumber(results.get(1)),
    pinnedBlockHash: readBlockHashAt(
      results.get(2),
      RPC_CONSENSUS_PIN_HEIGHT,
    ),
  };
}

async function probeOptional(
  source: (typeof AUTOMATIC_RPC_SOURCES)[number],
  fetchImpl: FetchLike,
): Promise<{ peerCount: number | null; syncing: boolean | null }> {
  // This optional batch is separate from probeCore. A per-call unsupported
  // method is ignored, and even an endpoint that rejects the whole optional
  // batch cannot erase its already-collected chain-id/head/pin proof.
  const results = await rpcBatchAtSource(
    source,
    [{ method: "net_peerCount" }, { method: "eth_syncing" }],
    fetchImpl,
  );
  const peerCount = hexToSafeNumber(results.get(0));
  const rawSyncing = results.get(1);
  const syncing =
    rawSyncing === false
      ? false
      : rawSyncing === true ||
          (typeof rawSyncing === "object" && rawSyncing !== null)
        ? true
        : null;
  return { peerCount, syncing };
}

async function candidateBlockHashes(
  source: (typeof AUTOMATIC_RPC_SOURCES)[number],
  sourceHead: number,
  candidateHeights: readonly number[],
  fetchImpl: FetchLike,
): Promise<{ height: number; hash: string }[]> {
  const heights = candidateHeights.filter((height) => height <= sourceHead);
  if (heights.length === 0) return [];
  const results = await rpcBatchAtSource(
    source,
    heights.map((height) => ({
      method: "eth_getBlockByNumber",
      params: [`0x${height.toString(16)}`, false],
    })),
    fetchImpl,
  );
  return heights.flatMap((height, index) => {
    const hash = readBlockHashAt(results.get(index), height);
    return hash ? [{ height, hash }] : [];
  });
}

async function assembleAutomaticRpcSources(
  fetchImpl: FetchLike = fetch,
): Promise<RpcConsensusSnapshot> {
  const cores = await Promise.all(
    AUTOMATIC_RPC_SOURCES.map(async (source) => {
      try {
        return await probeCore(source, fetchImpl);
      } catch {
        return {
          chainId: null,
          blockHeight: null,
          pinnedBlockHash: null,
        } satisfies CoreProbe;
      }
    }),
  );
  const candidateHeights = [
    ...new Set(
      cores.flatMap((core) =>
        core.chainId === RPC_CONSENSUS_CHAIN_ID &&
        core.pinnedBlockHash === RPC_CONSENSUS_PIN_HASH &&
        core.blockHeight !== null
          ? [core.blockHeight]
          : [],
      ),
    ),
  ].sort((a, b) => b - a);

  const candidates = await Promise.all(
    AUTOMATIC_RPC_SOURCES.map(async (source, index) => {
      const core = cores[index];
      const [optionalResult, hashesResult] = await Promise.allSettled([
        probeOptional(source, fetchImpl),
        core.blockHeight !== null
          ? candidateBlockHashes(
              source,
              core.blockHeight,
              candidateHeights,
              fetchImpl,
            )
          : Promise.resolve([]),
      ]);
      const optional =
        optionalResult.status === "fulfilled"
          ? optionalResult.value
          : { peerCount: null, syncing: null };
      const blockHashes =
        hashesResult.status === "fulfilled" ? hashesResult.value : [];
      return {
        sourceId: source.id,
        operatorId: source.operatorId,
        chainId: core.chainId,
        blockHeight: core.blockHeight,
        pinnedBlockHash: core.pinnedBlockHash,
        syncing: optional.syncing,
        peerCount: optional.peerCount,
        blockHashes,
      } satisfies RpcConsensusCandidate;
    }),
  );

  return {
    candidates,
    consensus: resolveRpcConsensus(candidates),
    checkedAt: new Date().toISOString(),
  };
}

/**
 * Probe the live-audited automatic sources at most once per 20 seconds.
 * Concurrent callers share the same in-flight promise, so a traffic burst can
 * never multiply upstream requests by the number of page/API requests.
 */
export async function probeAutomaticRpcSources(
  fetchImpl: FetchLike = fetch,
): Promise<RpcConsensusSnapshot> {
  const now = Date.now();
  if (cachedProbe && now - probeStartedAt < PROBE_CACHE_TTL_MS) {
    return cachedProbe;
  }
  if (probeInflight) return probeInflight;

  probeStartedAt = now;
  probeInflight = assembleAutomaticRpcSources(fetchImpl);
  try {
    cachedProbe = await probeInflight;
    return cachedProbe;
  } finally {
    probeInflight = null;
  }
}

/** Recommend only fixed public RPCs that can serve the live verified chain. */
export async function getWalletRpcUrls(): Promise<string[]> {
  const { consensus } = await probeAutomaticRpcSources();
  if (!consensus) return [];

  const qualified = await Promise.all(MAINNET_RPC_PRIORITY.map(async (url) => {
    const source = RPC_SOURCES.find((entry) => entry.url === url);
    if (!source) return false;
    try {
      const replies = await rpcBatchAtSource(source, [
        { method: "eth_chainId" },
        { method: "eth_blockNumber" },
        { method: "eth_getBlockByNumber", params: [`0x${RPC_CONSENSUS_PIN_HEIGHT.toString(16)}`, false] },
        { method: "eth_getBlockByNumber", params: [`0x${consensus.blockHeight.toString(16)}`, false] },
      ], fetch);
      const block = replies.get(3);
      return walletRpcMatchesCheckpoint({
        chainId: hexToSafeNumber(replies.get(0)),
        headHeight: hexToSafeNumber(replies.get(1)),
        pinHash: readBlockHashAt(replies.get(2), RPC_CONSENSUS_PIN_HEIGHT),
        checkpointHash: readBlockHashAt(block, consensus.blockHeight),
        checkpointTime: block && typeof block === "object" && "timestamp" in block
          ? hexToSafeNumber(block.timestamp)
          : null,
      }, consensus, Date.now());
    } catch {
      return false;
    }
  }));
  return MAINNET_RPC_PRIORITY.filter((_, index) => qualified[index]);
}

function verifiedMemberSources(
  consensus: RpcConsensusResult,
): (typeof AUTOMATIC_RPC_SOURCES)[number][] {
  if (consensus.support < 2) return [];
  return [...new Set(consensus.memberSourceIds)]
    .sort()
    .flatMap((sourceId) => {
      const source = AUTOMATIC_SOURCE_BY_ID.get(sourceId);
      return source ? [source] : [];
    });
}

/**
 * Run a bounded internal batch only against the verified winning members.
 * Members are tried in source-id order, so failover never depends on response
 * timing and no unverified directory endpoint can be reached by this helper.
 */
export async function rpcBatchFromConsensus(
  consensus: RpcConsensusResult,
  calls: readonly VerifiedRpcCall[],
  fetchImpl: FetchLike = fetch,
): Promise<RpcBatchOutcome | null> {
  const outcomes = await rpcBatchOutcomesFromConsensus(
    consensus,
    calls,
    fetchImpl,
  );
  return outcomes[0] ?? null;
}

/**
 * Run the same bounded batch against every verified winning operator.
 * Callers that consume block contents use these independent outcomes to
 * require a second matching block hash instead of trusting one node merely
 * because it participated in the head vote.
 */
export async function rpcBatchOutcomesFromConsensus(
  consensus: RpcConsensusResult,
  calls: readonly VerifiedRpcCall[],
  fetchImpl: FetchLike = fetch,
): Promise<RpcBatchOutcome[]> {
  validateCalls(calls);
  const outcomes = await Promise.all(
    verifiedMemberSources(consensus).map(async (
      source,
    ): Promise<RpcBatchOutcome | null> => {
      try {
        const results = await executeRpcBatchChunks(calls, (chunkCalls) =>
          rpcBatchAtSource(source, chunkCalls, fetchImpl),
        );
        return results.has(0) ? { sourceId: source.id, results } : null;
      } catch {
        return null;
      }
    }),
  );
  return outcomes
    .filter((outcome): outcome is RpcBatchOutcome => outcome !== null)
    .sort((left, right) => left.sourceId.localeCompare(right.sourceId));
}

/** Exact block hash confirmed by two verified winning operators. */
export async function rpcBlockHashFromConsensusAt(
  consensus: RpcConsensusResult,
  height: number,
  fetchImpl: FetchLike = fetch,
): Promise<string | null> {
  if (!Number.isSafeInteger(height) || height < 0) return null;
  const outcomes = await rpcBatchOutcomesFromConsensus(
    consensus,
    [
      {
        method: "eth_getBlockByNumber",
        params: [`0x${height.toString(16)}`, false],
      },
    ],
    fetchImpl,
  );
  const byHash = new Map<string, number>();
  for (const outcome of outcomes) {
    const hash = readBlockHashAt(outcome.results.get(0), height);
    if (hash) byHash.set(hash, (byHash.get(hash) ?? 0) + 1);
  }
  const matchingHashes = [...byHash.entries()]
    .map(([hash, count]) => ({ hash, count }))
    .sort(
      (left, right) =>
        right.count - left.count || left.hash.localeCompare(right.hash),
    );
  if (!matchingHashes[0] || matchingHashes[0].count < 2) return null;
  if (
    matchingHashes[1] &&
    matchingHashes[1].count === matchingHashes[0].count
  ) {
    return null;
  }
  return matchingHashes[0].hash;
}
