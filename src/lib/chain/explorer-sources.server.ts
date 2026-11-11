import "server-only";

import {
  buildBlockscoutObservation,
  selectExplorerReport,
  type ExplorerObservation,
} from "@/lib/chain/explorer-consensus";
import {
  rpcBlockHashFromConsensusAt,
} from "@/lib/chain/rpc-sources.server";
import type { RpcConsensusResult } from "@/lib/chain/rpc-consensus";

type FixedExplorerSource = {
  id: string;
  baseUrl: string;
};

/** Fixed server-side allowlist. No request, environment, or content value can
 * turn this into an arbitrary fetcher. The community source is eligible only
 * after its exact indexed block hash is verified against the RPC quorum. */
const AUTOMATIC_EXPLORER_SOURCES = [
  {
    id: "canonical-explorer",
    baseUrl: "https://explorer.blockdag.engineering",
  },
  {
    id: "community-blockscout",
    baseUrl: "https://explorer.welshdag.trade",
  },
] as const satisfies readonly FixedExplorerSource[];

const EXPLORER_TIMEOUT_MS = 5_000;
const MAX_RESPONSE_BYTES = 1024 * 1024;
const EXPLORER_REFRESH_MS = 5 * 60 * 1_000;
const EXPLORER_CONFIRMATION_MARGIN = 64;

type FetchLike = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export type ExplorerConsensusSnapshot = {
  observations: ExplorerObservation[];
  report: ExplorerObservation | null;
  checkedAt: string;
};

let cached: {
  value: ExplorerConsensusSnapshot;
  at: number;
  consensusKey: string;
} | null = null;
let inflight: {
  consensusKey: string;
  promise: Promise<ExplorerConsensusSnapshot>;
} | null = null;

const consensusCacheKey = (consensus: RpcConsensusResult): string =>
  [
    ...consensus.memberSourceIds,
    "operators",
    ...consensus.operatorIds,
  ].join("|");

async function readJsonBounded(response: Response): Promise<unknown> {
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_RESPONSE_BYTES) {
    throw new Error("Explorer response exceeds the size limit");
  }

  if (!response.body) {
    throw new Error("Explorer response has no body");
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
        await reader.cancel("Explorer response exceeds the size limit");
        throw new Error("Explorer response exceeds the size limit");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
}

async function explorerJson(
  source: FixedExplorerSource,
  path: string,
  fetchImpl: FetchLike,
): Promise<unknown> {
  const response = await fetchImpl(new URL(path, source.baseUrl), {
    headers: { Accept: "application/json" },
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(EXPLORER_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`Explorer HTTP ${response.status}`);
  return readJsonBounded(response);
}

function safeCount(value: unknown): number | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  if (typeof value === "string" && value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

async function probeExplorerSource(
  source: FixedExplorerSource,
  consensus: RpcConsensusResult,
  fetchImpl: FetchLike,
): Promise<ExplorerObservation | null> {
  const stats = await explorerJson(source, "/api/v2/stats", fetchImpl);
  const indexedHeight = safeCount(
    (stats as { total_blocks?: unknown } | null)?.total_blocks,
  );
  if (indexedHeight === null || indexedHeight > consensus.blockHeight) {
    return null;
  }
  const verificationHeight = Math.min(
    indexedHeight,
    consensus.blockHeight - EXPLORER_CONFIRMATION_MARGIN,
  );
  if (verificationHeight < 0) return null;

  const [supplyResult, indexingResult, blockResult, rpcHashResult] =
    await Promise.allSettled([
    explorerJson(
      source,
      "/api/v1?module=stats&action=coinsupply",
      fetchImpl,
    ),
    explorerJson(source, "/api/v2/main-page/indexing-status", fetchImpl),
    explorerJson(source, `/api/v2/blocks/${verificationHeight}`, fetchImpl),
    rpcBlockHashFromConsensusAt(consensus, verificationHeight, fetchImpl),
    ]);
  if (blockResult.status !== "fulfilled" || rpcHashResult.status !== "fulfilled") {
    return null;
  }

  return buildBlockscoutObservation({
    id: source.id,
    stats,
    supply: supplyResult.status === "fulfilled" ? supplyResult.value : null,
    indexing:
      indexingResult.status === "fulfilled" ? indexingResult.value : null,
    block: blockResult.value,
    rpcVerificationHash: rpcHashResult.value,
  });
}

export async function probeAutomaticExplorerSources(
  consensus: RpcConsensusResult,
  fetchImpl: FetchLike = fetch,
): Promise<ExplorerConsensusSnapshot> {
  const observations = (
    await Promise.all(AUTOMATIC_EXPLORER_SOURCES.map(async (source) => {
      try {
        return await probeExplorerSource(source, consensus, fetchImpl);
      } catch {
        return null;
      }
    }))
  ).filter((value): value is ExplorerObservation => value !== null);

  return {
    observations,
    report: selectExplorerReport(observations, consensus.blockHeight),
    checkedAt: new Date().toISOString(),
  };
}

/** Shared five-minute explorer read. RPC consensus remains much fresher, while
 * these indexed aggregates move slowly and are stored as monotonic floors. */
export async function getExplorerConsensus(
  consensus: RpcConsensusResult,
): Promise<ExplorerConsensusSnapshot> {
  const consensusKey = consensusCacheKey(consensus);
  if (
    cached &&
    cached.consensusKey === consensusKey &&
    Date.now() - cached.at < EXPLORER_REFRESH_MS
  ) {
    return {
      ...cached.value,
      report: selectExplorerReport(
        cached.value.observations,
        consensus.blockHeight,
      ),
    };
  }
  if (!inflight || inflight.consensusKey !== consensusKey) {
    const promise = probeAutomaticExplorerSources(consensus)
      .then((value) => {
        cached = { value, at: Date.now(), consensusKey };
        return value;
      })
      .finally(() => {
        if (inflight?.promise === promise) inflight = null;
      });
    inflight = { consensusKey, promise };
  }
  return inflight.promise;
}
