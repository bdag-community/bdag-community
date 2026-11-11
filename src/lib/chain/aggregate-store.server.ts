import "server-only";

import {
  createEmptyAggregateState,
  mergeAggregateStates,
  type ChainAggregateReport,
  type ChainAggregateState,
  type TransactionCursor,
} from "./aggregates";

const STORE_TIMEOUT_MS = 1_500;
const STORE_REFRESH_MS = 5 * 60 * 1000;
const CONSENSUS_STORE_REFRESH_MS = 15_000;
const CURSOR_PERSIST_MS = 60_000;
const REPORT_PERSIST_MS = 60_000;
const LIVE_PERSIST_MS = 60_000;

export type ChainLiveCheckpoint = {
  blockHeight: number;
  peers: number | null;
  activeMiners: number | null;
  capturedAt: string;
};

export type ChainConsensusSnapshot = {
  chainId: number;
  blockHeight: number;
  blockHash: string;
  peers: number | null;
  peerSource: string | null;
  activeMiners: number | null;
  minerSampleAnchor: number | null;
  rpcSourceIds: string[];
  rpcOperatorIds: string[];
  rpcObservedAt: string;
  publishedAt: string;
};

export type ChainConsensusCandidate = Omit<
  ChainConsensusSnapshot,
  "publishedAt"
>;

let memoryState = createEmptyAggregateState();
let loadedAt = 0;
let loadInflight: Promise<ChainAggregateState> | null = null;
let cursorPersistedAt = 0;
let reportPersistedAt = 0;
let liveMemory: ChainLiveCheckpoint | null = null;
let liveLoadedAt = 0;
let liveLoadInflight: Promise<ChainLiveCheckpoint | null> | null = null;
let livePersistedAt = 0;
let consensusStoreMemory: ChainConsensusSnapshot | null = null;
let consensusLocalMemory: ChainConsensusSnapshot | null = null;
let consensusLoadedAt = 0;
let consensusLoadInflight: Promise<ChainConsensusSnapshot | null> | null = null;

const hasStoreEnv = () =>
  Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SECRET_KEY,
  );

export async function withTimeout<T>(
  promise: PromiseLike<T>,
  timeoutMs = STORE_TIMEOUT_MS,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.resolve(promise),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error("aggregate store timeout")),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function adminClient() {
  const { getAdminSupabase } = await import("../supabase/admin");
  return getAdminSupabase();
}

const toNumber = (value: unknown): number | null => {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim() !== ""
        ? Number(value)
        : Number.NaN;
  return Number.isFinite(parsed) && Number.isSafeInteger(parsed) ? parsed : null;
};

const toSupply = (value: unknown): number | null => {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim() !== ""
        ? Number(value)
        : Number.NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

const isTimestamp = (value: unknown): value is string =>
  typeof value === "string" && Number.isFinite(Date.parse(value));

const HASH_PATTERN = /^0x[0-9a-fA-F]{64}$/;

const toQuorumIds = (value: unknown): string[] | null => {
  if (!Array.isArray(value)) return null;
  const ids: string[] = [];
  for (const item of value as unknown[]) {
    if (typeof item !== "string" || item.trim() === "") return null;
    ids.push(item.trim());
  }
  const unique = [...new Set(ids)].sort();
  return unique.length >= 2 ? unique : null;
};

function rowToConsensusSnapshot(raw: unknown): ChainConsensusSnapshot | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const chainId = toNumber(row.chain_id);
  const blockHeight = toNumber(row.block_height);
  const peersRaw = row.peers;
  const activeMinersRaw = row.active_miners;
  const minerSampleAnchorRaw = row.miner_sample_anchor;
  const peers = peersRaw === null ? null : toNumber(peersRaw);
  const activeMiners =
    activeMinersRaw === null ? null : toNumber(activeMinersRaw);
  const minerSampleAnchor =
    minerSampleAnchorRaw === null ? null : toNumber(minerSampleAnchorRaw);
  const rpcSourceIds = toQuorumIds(row.rpc_source_ids);
  const rpcOperatorIds = toQuorumIds(row.rpc_operator_ids);
  const peerSource = row.peer_source;

  if (
    chainId !== 1404 ||
    blockHeight === null ||
    blockHeight < 0 ||
    typeof row.block_hash !== "string" ||
    !/^0x[0-9a-fA-F]{64}$/.test(row.block_hash) ||
    (peersRaw !== null && (peers === null || peers < 0)) ||
    (activeMinersRaw !== null &&
      (activeMiners === null || activeMiners < 0)) ||
    (minerSampleAnchorRaw !== null &&
      (minerSampleAnchor === null ||
        minerSampleAnchor < 0 ||
        minerSampleAnchor > blockHeight)) ||
    ((peers === null && peerSource !== null) ||
      (peers !== null &&
        (typeof peerSource !== "string" ||
          peerSource.trim() === "" ||
          !rpcSourceIds?.includes(peerSource.trim())))) ||
    ((activeMiners === null && minerSampleAnchor !== null) ||
      (activeMiners !== null && minerSampleAnchor === null)) ||
    !rpcSourceIds ||
    !rpcOperatorIds ||
    !isTimestamp(row.rpc_observed_at) ||
    Date.parse(row.rpc_observed_at) > Date.now() + 5 * 60 * 1000 ||
    !isTimestamp(row.published_at)
  ) {
    return null;
  }

  return {
    chainId,
    blockHeight,
    blockHash: row.block_hash.toLowerCase(),
    peers,
    peerSource: typeof peerSource === "string" ? peerSource.trim() : null,
    activeMiners,
    minerSampleAnchor,
    rpcSourceIds,
    rpcOperatorIds,
    rpcObservedAt: row.rpc_observed_at,
    publishedAt: row.published_at,
  };
}

function rowsToState(rows: unknown[]): ChainAggregateState {
  const reports: ChainAggregateReport[] = [];
  let cursor: TransactionCursor | null = null;

  for (const raw of rows) {
    if (!raw || typeof raw !== "object") continue;
    const row = raw as Record<string, unknown>;
    const height = toNumber(row.height);
    if (height === null) continue;

    if (row.record_kind === "transaction_cursor") {
      const runningTotal = toNumber(row.running_total);
      if (
        runningTotal !== null &&
        (!cursor ||
          height > cursor.height ||
          (height === cursor.height && runningTotal > cursor.runningTotal))
      ) {
        cursor = { height, runningTotal };
      }
      continue;
    }

    if (
      row.record_kind !== "explorer_report" ||
      (row.height_source !== "explorer" && row.height_source !== "rpc") ||
      typeof row.captured_at !== "string"
    ) {
      continue;
    }

    reports.push({
      ...(typeof row.id === "string" ? { id: row.id } : {}),
      ...(typeof row.source_id === "string" &&
      row.source_id.trim() !== "" &&
      toNumber(row.verification_height) !== null &&
      typeof row.verification_hash === "string" &&
      HASH_PATTERN.test(row.verification_hash)
        ? {
            sourceId: row.source_id.trim(),
            verificationHeight: toNumber(row.verification_height) as number,
            verificationHash: row.verification_hash.toLowerCase(),
          }
        : {}),
      height,
      heightSource: row.height_source,
      totalTransactions: toNumber(row.total_transactions),
      totalAddresses: toNumber(row.total_addresses),
      coinSupply: toSupply(row.coin_supply),
      trusted: {
        transactions: row.transactions_trusted === true,
        addresses: row.addresses_trusted === true,
        supply: row.supply_trusted === true,
      },
      capturedAt: row.captured_at,
    });
  }

  return { reports, cursor };
}

async function readStore(): Promise<ChainAggregateState> {
  const client = await adminClient();
  const response = await withTimeout(
    client
      .from("chain_aggregate_checkpoints")
      .select(
        "id, record_kind, height, height_source, source_id, verification_height, verification_hash, total_transactions, total_addresses, coin_supply, transactions_trusted, addresses_trusted, supply_trusted, running_total, captured_at",
      )
      .order("captured_at", { ascending: false })
      .limit(51),
  );
  if (response.error) throw response.error;
  return rowsToState(response.data ?? []);
}

const mergeLiveCheckpoint = (
  current: ChainLiveCheckpoint | null,
  incoming: ChainLiveCheckpoint,
): ChainLiveCheckpoint => {
  if (!current || incoming.blockHeight > current.blockHeight) return incoming;
  if (incoming.blockHeight < current.blockHeight) return current;
  return {
    blockHeight: current.blockHeight,
    peers: incoming.peers ?? current.peers,
    activeMiners: incoming.activeMiners ?? current.activeMiners,
    capturedAt: incoming.capturedAt,
  };
};

async function readLiveStore(): Promise<ChainLiveCheckpoint | null> {
  const client = await adminClient();
  const response = await withTimeout(
    client
      .from("chain_live_checkpoints")
      .select("block_height, peers, active_miners, captured_at")
      .eq("singleton", true)
      .maybeSingle(),
  );
  if (response.error) throw response.error;
  if (!response.data) return null;
  const blockHeight = toNumber(response.data.block_height);
  const peersRaw = response.data.peers;
  const activeMinersRaw = response.data.active_miners;
  const peers =
    peersRaw === null ? null : toNumber(peersRaw);
  const activeMiners =
    activeMinersRaw === null ? null : toNumber(activeMinersRaw);
  if (
    blockHeight === null ||
    (peersRaw !== null && peers === null) ||
    (activeMinersRaw !== null && activeMiners === null) ||
    typeof response.data.captured_at !== "string"
  ) {
    return null;
  }
  return {
    blockHeight,
    peers,
    activeMiners,
    capturedAt: response.data.captured_at,
  };
}

async function readConsensusStore(): Promise<ChainConsensusSnapshot | null> {
  const client = await adminClient();
  const response = await withTimeout(
    client
      .from("chain_consensus_snapshots")
      .select(
        "chain_id, block_height, block_hash, peers, peer_source, active_miners, miner_sample_anchor, rpc_source_ids, rpc_operator_ids, rpc_observed_at, published_at",
      )
      .eq("singleton", true)
      .maybeSingle(),
  );
  if (response.error) throw response.error;
  return rowToConsensusSnapshot(response.data);
}

const candidateToSnapshot = (
  candidate: ChainConsensusCandidate,
): ChainConsensusSnapshot | null =>
  rowToConsensusSnapshot({
    chain_id: candidate.chainId,
    block_height: candidate.blockHeight,
    block_hash: candidate.blockHash,
    peers: candidate.peers,
    peer_source: candidate.peerSource,
    active_miners: candidate.activeMiners,
    miner_sample_anchor: candidate.minerSampleAnchor,
    rpc_source_ids: candidate.rpcSourceIds,
    rpc_operator_ids: candidate.rpcOperatorIds,
    rpc_observed_at: candidate.rpcObservedAt,
    published_at: new Date().toISOString(),
  });

const mergeConsensusSnapshot = (
  current: ChainConsensusSnapshot | null,
  incoming: ChainConsensusSnapshot,
): ChainConsensusSnapshot => {
  if (!current) return incoming;
  if (incoming.blockHeight < current.blockHeight) return current;
  if (
    incoming.blockHeight === current.blockHeight &&
    incoming.blockHash !== current.blockHash
  ) {
    return current;
  }
  if (
    incoming.blockHeight === current.blockHeight &&
    Date.parse(incoming.rpcObservedAt) < Date.parse(current.rpcObservedAt)
  ) {
    return current;
  }

  const canCarryPeerReading =
    incoming.peers === null &&
    current.peerSource !== null &&
    incoming.rpcSourceIds.includes(current.peerSource);
  const advancesHeight = incoming.blockHeight > current.blockHeight;

  return {
    ...incoming,
    peers: incoming.peers ?? (canCarryPeerReading ? current.peers : null),
    peerSource:
      incoming.peers === null
        ? canCarryPeerReading
          ? current.peerSource
          : null
        : incoming.peerSource,
    activeMiners: incoming.activeMiners ?? current.activeMiners,
    minerSampleAnchor:
      incoming.activeMiners === null
        ? current.minerSampleAnchor
        : incoming.minerSampleAnchor,
    rpcObservedAt: advancesHeight
      ? incoming.rpcObservedAt
      : Date.parse(incoming.rpcObservedAt) >=
          Date.parse(current.rpcObservedAt)
        ? incoming.rpcObservedAt
        : current.rpcObservedAt,
  };
};

export function rememberChainAggregateState(state: ChainAggregateState): void {
  memoryState = mergeAggregateStates(memoryState, state);
}

export async function getStoredChainAggregateState(): Promise<ChainAggregateState> {
  const now = Date.now();
  if (!hasStoreEnv()) return memoryState;
  if (now - loadedAt < STORE_REFRESH_MS) return memoryState;
  if (loadInflight) return loadInflight;

  loadedAt = now;
  loadInflight = readStore()
    .then((stored) => {
      memoryState = mergeAggregateStates(memoryState, stored);
      return memoryState;
    })
    .catch(() => memoryState)
    .finally(() => {
      loadInflight = null;
    });
  return loadInflight;
}

export async function getStoredChainLiveCheckpoint(): Promise<ChainLiveCheckpoint | null> {
  const now = Date.now();
  if (!hasStoreEnv()) return liveMemory;
  if (now - liveLoadedAt < STORE_REFRESH_MS) return liveMemory;
  if (liveLoadInflight) return liveLoadInflight;

  liveLoadedAt = now;
  liveLoadInflight = readLiveStore()
    .then((stored) => {
      if (stored) liveMemory = mergeLiveCheckpoint(liveMemory, stored);
      return liveMemory;
    })
    .catch(() => liveMemory)
    .finally(() => {
      liveLoadInflight = null;
    });
  return liveLoadInflight;
}

export async function getStoredChainConsensusSnapshot(): Promise<ChainConsensusSnapshot | null> {
  const now = Date.now();
  if (!hasStoreEnv()) return consensusLocalMemory;
  if (now - consensusLoadedAt < CONSENSUS_STORE_REFRESH_MS) {
    return consensusStoreMemory;
  }
  if (consensusLoadInflight) return consensusLoadInflight;

  consensusLoadedAt = now;
  consensusLoadInflight = readConsensusStore()
    .then((stored) => {
      consensusStoreMemory = stored;
      return consensusStoreMemory;
    })
    .catch(() => consensusStoreMemory)
    .finally(() => {
      consensusLoadInflight = null;
    });
  return consensusLoadInflight;
}

export async function publishChainConsensusSnapshot(
  candidate: ChainConsensusCandidate,
): Promise<ChainConsensusSnapshot | null> {
  const localCandidate = candidateToSnapshot(candidate);
  if (!localCandidate) {
    return hasStoreEnv() ? consensusStoreMemory : consensusLocalMemory;
  }

  if (!hasStoreEnv()) {
    consensusLocalMemory = mergeConsensusSnapshot(
      consensusLocalMemory,
      localCandidate,
    );
    return consensusLocalMemory;
  }

  try {
    const client = await adminClient();
    const response = await withTimeout(
      client.rpc("publish_chain_consensus_snapshot", {
        p_chain_id: candidate.chainId,
        p_block_height: candidate.blockHeight,
        p_block_hash: candidate.blockHash,
        p_peers: candidate.peers,
        p_peer_source: candidate.peerSource,
        p_active_miners: candidate.activeMiners,
        p_miner_sample_anchor: candidate.minerSampleAnchor,
        p_rpc_source_ids: candidate.rpcSourceIds,
        p_rpc_operator_ids: candidate.rpcOperatorIds,
        p_rpc_observed_at: candidate.rpcObservedAt,
      }),
    );
    if (response.error) throw response.error;
    const data = Array.isArray(response.data) ? response.data[0] : response.data;
    const effective = rowToConsensusSnapshot(data);
    if (!effective) return consensusStoreMemory;

    consensusStoreMemory = effective;
    consensusLoadedAt = Date.now();
    return effective;
  } catch {
    return consensusStoreMemory;
  }
}

export async function persistChainAggregateReport(
  report: ChainAggregateReport,
): Promise<ChainAggregateReport | null> {
  if (!hasStoreEnv()) return report;
  const now = Date.now();
  const hasTrustedValue =
    report.trusted.transactions ||
    report.trusted.addresses ||
    report.trusted.supply;
  if (!hasTrustedValue && now - reportPersistedAt < REPORT_PERSIST_MS) {
    return report;
  }
  reportPersistedAt = now;

  try {
    const client = await adminClient();
    const hasExplorerProof =
      typeof report.sourceId === "string" &&
      report.sourceId.trim() !== "" &&
      Number.isSafeInteger(report.verificationHeight) &&
      (report.verificationHeight as number) >= 0 &&
      typeof report.verificationHash === "string" &&
      HASH_PATTERN.test(report.verificationHash);
    const response = await withTimeout(
      client.rpc(hasExplorerProof
        ? "record_chain_aggregate_report_v2"
        : "record_chain_aggregate_report", {
        p_height: report.height,
        p_height_source: report.heightSource,
        p_total_transactions: report.totalTransactions,
        p_total_addresses: report.totalAddresses,
        p_coin_supply: report.coinSupply,
        p_transactions_trusted: report.trusted.transactions,
        p_addresses_trusted: report.trusted.addresses,
        p_supply_trusted: report.trusted.supply,
        ...(hasExplorerProof
          ? {
              p_source_id: report.sourceId,
              p_verification_height: report.verificationHeight,
              p_verification_hash: report.verificationHash,
              p_observed_at: report.capturedAt,
            }
          : {}),
      }),
    );
    if (response.error) throw response.error;
    const data = Array.isArray(response.data) ? response.data[0] : response.data;
    if (
      !data ||
      typeof data !== "object" ||
      typeof data.id !== "string" ||
      typeof data.transactions_trusted !== "boolean" ||
      typeof data.addresses_trusted !== "boolean" ||
      typeof data.supply_trusted !== "boolean"
    ) {
      return null;
    }
    return {
      ...report,
      id: data.id,
      trusted: {
        transactions: data.transactions_trusted,
        addresses: data.addresses_trusted,
        supply: data.supply_trusted,
      },
    };
  } catch {
    // Persistence is resilience only. Live stats must never fail with it.
    return null;
  }
}

export async function persistTransactionCursor(
  cursor: TransactionCursor,
  force = false,
): Promise<void> {
  if (!hasStoreEnv()) return;
  const now = Date.now();
  if (!force && now - cursorPersistedAt < CURSOR_PERSIST_MS) return;
  cursorPersistedAt = now;

  try {
    const client = await adminClient();
    const response = await withTimeout(
      client.rpc("advance_chain_transaction_cursor", {
        p_height: cursor.height,
        p_running_total: cursor.runningTotal,
      }),
    );
    if (response.error) throw response.error;
  } catch {
    // The in-memory cursor stays authoritative until the store recovers.
  }
}

export async function persistChainLiveCheckpoint(
  checkpoint: ChainLiveCheckpoint,
): Promise<void> {
  liveMemory = mergeLiveCheckpoint(liveMemory, checkpoint);
  if (!hasStoreEnv()) return;
  const now = Date.now();
  if (now - livePersistedAt < LIVE_PERSIST_MS) return;
  livePersistedAt = now;

  try {
    const client = await adminClient();
    const response = await withTimeout(
      client.rpc("persist_chain_live_checkpoint", {
        p_block_height: checkpoint.blockHeight,
        p_peers: checkpoint.peers,
        p_active_miners: checkpoint.activeMiners,
      }),
    );
    if (response.error) throw response.error;
  } catch {
    // The in-process checkpoint remains available until the store recovers.
  }
}
