export const CONFIRMATION_MARGIN = 64;
export const CURSOR_BATCH_SIZE = 50;
export const MAX_CURSOR_BATCHES = 2;
export const MAX_CHECKPOINT_REPORTS = 50;
export const MAX_COIN_SUPPLY = 150_000_000_000;
export const CANONICAL_EXPLORER_SOURCE_ID = "canonical-explorer";
export const COMMUNITY_EXPLORER_SOURCE_ID = "community-blockscout";

const EXPLORER_CLOCK_SKEW_MS = 5 * 60 * 1_000;
const HASH_PATTERN = /^0x[0-9a-f]{64}$/i;

export type AggregateProvenance =
  | "exact"
  | "tracked"
  | "extrapolated"
  | "floor";

export type AggregateTrust = {
  transactions: boolean;
  addresses: boolean;
  supply: boolean;
};

export type ChainAggregateReport = {
  id?: string;
  sourceId?: string;
  verificationHeight?: number;
  verificationHash?: string;
  height: number;
  heightSource: "explorer" | "rpc";
  totalTransactions: number | null;
  totalAddresses: number | null;
  coinSupply: number | null;
  trusted: AggregateTrust;
  capturedAt: string;
};

export type ExplorerAggregateInput = Omit<ChainAggregateReport, "trusted">;

export type TransactionCursor = {
  height: number;
  runningTotal: number;
};

export type ChainAggregateState = {
  reports: ChainAggregateReport[];
  cursor: TransactionCursor | null;
};

export type ResolvedChainAggregates = {
  totalTransactions: number | null;
  totalAddresses: number | null;
  coinSupply: number | null;
  provenance: {
    totalTransactions: AggregateProvenance | null;
    totalAddresses: AggregateProvenance | null;
    coinSupply: AggregateProvenance | null;
  };
};

export type AggregateRpcCall = {
  method: "eth_getBlockByNumber";
  params: [string, false];
};

export type AggregateRpcBatch = (
  calls: AggregateRpcCall[],
) => Promise<Map<number, unknown>>;

type TrustedPoint = { height: number; value: number };

const isNonNegativeSafeInteger = (value: number | null): value is number =>
  value !== null && Number.isSafeInteger(value) && value >= 0;

const isSaneSupply = (value: number | null): value is number =>
  value !== null &&
  Number.isFinite(value) &&
  value > 0 &&
  value <= MAX_COIN_SUPPLY;

function isChainVerifiedFallbackReport(
  report: ChainAggregateReport,
): boolean {
  const capturedAt = Date.parse(report.capturedAt);
  return (
    report.sourceId === COMMUNITY_EXPLORER_SOURCE_ID &&
    isNonNegativeSafeInteger(report.height) &&
    isNonNegativeSafeInteger(report.verificationHeight ?? null) &&
    (report.verificationHeight as number) <= report.height &&
    typeof report.verificationHash === "string" &&
    HASH_PATTERN.test(report.verificationHash) &&
    Number.isFinite(capturedAt) &&
    capturedAt <= Date.now() + EXPLORER_CLOCK_SKEW_MS &&
    (isNonNegativeSafeInteger(report.totalTransactions) ||
      isNonNegativeSafeInteger(report.totalAddresses) ||
      isSaneSupply(report.coinSupply))
  );
}

const newerPoint = (
  current: TrustedPoint | null,
  candidate: TrustedPoint,
): TrustedPoint => {
  if (!current) return candidate;
  if (candidate.value > current.value) return candidate;
  if (candidate.value === current.value && candidate.height > current.height) {
    return candidate;
  }
  return current;
};

function trustedFloors(state: ChainAggregateState): {
  transactions: TrustedPoint | null;
  addresses: TrustedPoint | null;
  supply: TrustedPoint | null;
} {
  let transactions: TrustedPoint | null = null;
  let addresses: TrustedPoint | null = null;
  let supply: TrustedPoint | null = null;

  for (const report of state.reports) {
    if (report.trusted.transactions && report.totalTransactions !== null) {
      transactions = newerPoint(transactions, {
        height: report.height,
        value: report.totalTransactions,
      });
    }
    if (report.trusted.addresses && report.totalAddresses !== null) {
      addresses = newerPoint(addresses, {
        height: report.height,
        value: report.totalAddresses,
      });
    }
    if (report.trusted.supply && report.coinSupply !== null) {
      supply = newerPoint(supply, {
        height: report.height,
        value: report.coinSupply,
      });
    }
  }

  return { transactions, addresses, supply };
}

export function createEmptyAggregateState(): ChainAggregateState {
  return { reports: [], cursor: null };
}

const reportKey = (report: ChainAggregateReport): string =>
  report.id ??
  [
    report.sourceId ?? "",
    report.verificationHeight ?? "",
    report.verificationHash ?? "",
    report.capturedAt,
    report.height,
    report.totalTransactions ?? "",
    report.totalAddresses ?? "",
    report.coinSupply ?? "",
    Number(report.trusted.transactions),
    Number(report.trusted.addresses),
    Number(report.trusted.supply),
  ].join(":");

function retainAggregateReports(
  reports: ChainAggregateReport[],
): ChainAggregateReport[] {
  const byKey = new Map<string, ChainAggregateReport>();
  for (const report of reports) byKey.set(reportKey(report), report);
  const ordered = [...byKey.values()].sort((a, b) => {
    const byTime = a.capturedAt.localeCompare(b.capturedAt);
    return byTime !== 0 ? byTime : reportKey(a).localeCompare(reportKey(b));
  });

  const floorReports = new Map<
    keyof AggregateTrust,
    { report: ChainAggregateReport; value: number }
  >();
  const consider = (
    field: keyof AggregateTrust,
    report: ChainAggregateReport,
    value: number | null,
  ) => {
    if (!report.trusted[field] || value === null) return;
    const current = floorReports.get(field);
    if (
      !current ||
      value > current.value ||
      (value === current.value && report.height > current.report.height)
    ) {
      floorReports.set(field, { report, value });
    }
  };

  for (const report of ordered) {
    consider("transactions", report, report.totalTransactions);
    consider("addresses", report, report.totalAddresses);
    consider("supply", report, report.coinSupply);
  }

  const retainedFloorKeys = new Set(
    [...floorReports.values()].map(({ report }) => reportKey(report)),
  );
  const recentCapacity = Math.max(
    0,
    MAX_CHECKPOINT_REPORTS - retainedFloorKeys.size,
  );
  const recent = ordered
    .filter((report) => !retainedFloorKeys.has(reportKey(report)))
    .slice(-recentCapacity);

  return ordered.filter(
    (report) =>
      retainedFloorKeys.has(reportKey(report)) || recent.includes(report),
  );
}

export function withTransactionCursor(
  state: ChainAggregateState,
  cursor: TransactionCursor | null,
): ChainAggregateState {
  if (!cursor) return state;
  if (state.cursor && state.cursor.height > cursor.height) return state;
  if (
    state.cursor &&
    state.cursor.height === cursor.height &&
    state.cursor.runningTotal >= cursor.runningTotal
  ) {
    return state;
  }
  return { ...state, cursor };
}

export function mergeAggregateStates(
  left: ChainAggregateState,
  right: ChainAggregateState,
): ChainAggregateState {
  const reports = retainAggregateReports([...left.reports, ...right.reports]);

  let cursor = left.cursor;
  if (
    right.cursor &&
    (!cursor ||
      right.cursor.height > cursor.height ||
      (right.cursor.height === cursor.height &&
        right.cursor.runningTotal > cursor.runningTotal))
  ) {
    cursor = right.cursor;
  }

  const storedTransactionFloor = trustedFloors({ reports, cursor: null })
    .transactions;
  if (
    storedTransactionFloor &&
    (!cursor ||
      storedTransactionFloor.height > cursor.height ||
      (storedTransactionFloor.height === cursor.height &&
        storedTransactionFloor.value > cursor.runningTotal))
  ) {
    cursor = {
      height: storedTransactionFloor.height,
      runningTotal: storedTransactionFloor.value,
    };
  }
  return { reports, cursor };
}

export function acceptExplorerReport(
  state: ChainAggregateState,
  input: ExplorerAggregateInput,
): { state: ChainAggregateState; report: ChainAggregateReport } {
  const validHeight = isNonNegativeSafeInteger(input.height);
  const floors = trustedFloors(state);
  const cursorFloor = state.cursor?.runningTotal ?? null;
  const transactionFloor = Math.max(
    floors.transactions?.value ?? 0,
    cursorFloor ?? 0,
  );
  const transactionHeightFloor = Math.max(
    floors.transactions?.height ?? 0,
    state.cursor?.height ?? 0,
  );

  const trusted: AggregateTrust = {
    transactions:
      validHeight &&
      isNonNegativeSafeInteger(input.totalTransactions) &&
      input.height >= transactionHeightFloor &&
      input.totalTransactions >= transactionFloor,
    addresses:
      validHeight &&
      isNonNegativeSafeInteger(input.totalAddresses) &&
      input.height >= (floors.addresses?.height ?? 0) &&
      input.totalAddresses >= (floors.addresses?.value ?? 0),
    supply:
      validHeight &&
      isSaneSupply(input.coinSupply) &&
      input.height >= (floors.supply?.height ?? 0) &&
      input.coinSupply >= (floors.supply?.value ?? 0),
  };

  const report: ChainAggregateReport = { ...input, trusted };
  return {
    state: applyValidatedExplorerReport(state, report),
    report,
  };
}

/**
 * Retain a chain-proven community indexer observation without granting it
 * monotonic authority. The latest valid observation can correct an earlier
 * bad value downward and is always rendered as approximate.
 */
export function observeChainVerifiedFallbackReport(
  state: ChainAggregateState,
  input: ExplorerAggregateInput,
): { state: ChainAggregateState; report: ChainAggregateReport } {
  const report: ChainAggregateReport = {
    ...input,
    trusted: { transactions: false, addresses: false, supply: false },
  };
  return {
    state: isChainVerifiedFallbackReport(report)
      ? applyValidatedExplorerReport(state, report)
      : state,
    report,
  };
}

export function applyValidatedExplorerReport(
  state: ChainAggregateState,
  report: ChainAggregateReport,
): ChainAggregateState {
  let next: ChainAggregateState = {
    ...state,
    reports: retainAggregateReports([...state.reports, report]),
  };

  if (
    report.trusted.transactions &&
    report.totalTransactions !== null &&
    (!state.cursor || report.height > state.cursor.height)
  ) {
    next = withTransactionCursor(next, {
      height: report.height,
      runningTotal: report.totalTransactions,
    });
  }

  return next;
}

export function resolveChainAggregates(
  state: ChainAggregateState,
  freshReport: ChainAggregateReport | null,
): ResolvedChainAggregates {
  const floors = trustedFloors(state);
  const fallback = state.reports.reduce<ChainAggregateReport | null>(
    (latest, report) => {
      if (!isChainVerifiedFallbackReport(report)) return latest;
      if (!latest) return report;
      const reportTime = Date.parse(report.capturedAt);
      const latestTime = Date.parse(latest.capturedAt);
      if (reportTime !== latestTime) return reportTime > latestTime ? report : latest;
      return (report.id ?? "").localeCompare(latest.id ?? "") > 0
        ? report
        : latest;
    },
    null,
  );
  const freshTransactions =
    freshReport?.trusted.transactions === true
      ? freshReport.totalTransactions
      : null;
  const freshAddresses =
    freshReport?.trusted.addresses === true ? freshReport.totalAddresses : null;
  const freshSupply =
    freshReport?.trusted.supply === true ? freshReport.coinSupply : null;
  const fallbackTransactions =
    isNonNegativeSafeInteger(fallback?.totalTransactions ?? null) &&
    (fallback?.totalTransactions as number) >= (floors.transactions?.value ?? 0)
      ? (fallback?.totalTransactions as number)
      : null;
  const fallbackAddresses =
    isNonNegativeSafeInteger(fallback?.totalAddresses ?? null) &&
    (fallback?.totalAddresses as number) >= (floors.addresses?.value ?? 0)
      ? (fallback?.totalAddresses as number)
      : null;
  const fallbackSupply =
    isSaneSupply(fallback?.coinSupply ?? null) &&
    (fallback?.coinSupply as number) >= (floors.supply?.value ?? 0)
      ? (fallback?.coinSupply as number)
      : null;

  return {
    totalTransactions:
      freshTransactions ?? fallbackTransactions ?? floors.transactions?.value ?? null,
    totalAddresses:
      freshAddresses ?? fallbackAddresses ?? floors.addresses?.value ?? null,
    coinSupply: freshSupply ?? fallbackSupply ?? floors.supply?.value ?? null,
    provenance: {
      totalTransactions:
        freshTransactions !== null
          ? "exact"
          : fallbackTransactions !== null || floors.transactions
            ? "floor"
            : null,
      totalAddresses:
        freshAddresses !== null
          ? "exact"
          : fallbackAddresses !== null || floors.addresses
            ? "floor"
            : null,
      coinSupply:
        freshSupply !== null
          ? "exact"
          : fallbackSupply !== null || floors.supply
            ? "floor"
            : null,
    },
  };
}

const hexToSafeInteger = (value: unknown): number | null => {
  if (typeof value !== "string" || !/^0x[0-9a-fA-F]+$/.test(value)) {
    return null;
  }
  const parsed = Number.parseInt(value, 16);
  return Number.isSafeInteger(parsed) ? parsed : null;
};

export async function advanceTransactionCursor(
  initial: TransactionCursor | null,
  headHeight: number | null,
  batchRpc: AggregateRpcBatch,
): Promise<TransactionCursor | null> {
  if (!initial || headHeight === null) return initial;
  const targetHeight = Math.max(0, headHeight - CONFIRMATION_MARGIN);
  let cursor = initial;

  for (
    let batchIndex = 0;
    batchIndex < MAX_CURSOR_BATCHES && cursor.height < targetHeight;
    batchIndex++
  ) {
    const firstHeight = cursor.height + 1;
    const lastHeight = Math.min(
      targetHeight,
      firstHeight + CURSOR_BATCH_SIZE - 1,
    );
    const calls: AggregateRpcCall[] = [];
    for (let height = firstHeight; height <= lastHeight; height++) {
      calls.push({
        method: "eth_getBlockByNumber",
        params: [`0x${height.toString(16)}`, false],
      });
    }

    let result: Map<number, unknown>;
    try {
      result = await batchRpc(calls);
    } catch {
      return cursor;
    }

    let transactionCount = 0;
    for (let index = 0; index < calls.length; index++) {
      const block = result.get(index) as {
        number?: unknown;
        transactions?: unknown;
      } | null;
      const expectedHeight = firstHeight + index;
      if (
        !block ||
        hexToSafeInteger(block.number) !== expectedHeight ||
        !Array.isArray(block.transactions)
      ) {
        return cursor;
      }
      transactionCount += block.transactions.length;
    }

    cursor = {
      height: lastHeight,
      runningTotal: cursor.runningTotal + transactionCount,
    };
  }

  return cursor;
}
