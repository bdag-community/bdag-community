import { existsSync, readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { test } from "node:test";

const read = (relativePath) =>
  readFileSync(new URL(relativePath, import.meta.url), "utf8");

const aggregateModuleUrl = new URL(
  "../src/lib/chain/aggregates.ts",
  import.meta.url,
);

async function loadAggregates() {
  assert.ok(
    existsSync(aggregateModuleUrl),
    "the pure chain aggregate module must exist",
  );
  return import(aggregateModuleUrl.href);
}

const checkpoint = (overrides = {}) => ({
  height: 100,
  heightSource: "explorer",
  totalTransactions: 1_000,
  totalAddresses: 100,
  coinSupply: 10_000,
  capturedAt: "2026-08-17T10:00:00.000Z",
  ...overrides,
});

test("a trusted explorer read becomes an exact checkpoint and seeds the cursor", async () => {
  const { acceptExplorerReport, createEmptyAggregateState, resolveChainAggregates } =
    await loadAggregates();

  const accepted = acceptExplorerReport(
    createEmptyAggregateState(),
    checkpoint(),
  );

  assert.deepEqual(accepted.report.trusted, {
    transactions: true,
    addresses: true,
    supply: true,
  });
  assert.deepEqual(accepted.state.cursor, {
    height: 100,
    runningTotal: 1_000,
  });
  assert.deepEqual(
    resolveChainAggregates(accepted.state, accepted.report, 120),
    {
      totalTransactions: 1_000,
      totalAddresses: 100,
      coinSupply: 10_000,
      provenance: {
        totalTransactions: "exact",
        totalAddresses: "exact",
        coinSupply: "exact",
      },
    },
  );
});

test("an outage holds the latest stored explorer checkpoint unchanged", async () => {
  const {
    acceptExplorerReport,
    advanceTransactionCursor,
    createEmptyAggregateState,
    resolveChainAggregates,
    withTransactionCursor,
  } = await loadAggregates();

  const first = acceptExplorerReport(
    createEmptyAggregateState(),
    checkpoint(),
  );
  const second = acceptExplorerReport(
    first.state,
    checkpoint({
      height: 200,
      totalTransactions: 1_100,
      totalAddresses: 110,
      coinSupply: 10_100,
      capturedAt: "2026-08-17T10:05:00.000Z",
    }),
  );

  const calls = [];
  const cursor = await advanceTransactionCursor(
    second.state.cursor,
    300,
    async (batch) => {
      calls.push(batch);
      return new Map(
        batch.map((call, index) => {
          const height = Number.parseInt(call.params[0], 16);
          return [
            index,
            {
              number: call.params[0],
              transactions: [`0x${height}a`, `0x${height}b`],
            },
          ];
        }),
      );
    },
  );

  assert.equal(calls.length, 1, "only the 36 confirmed blocks need one batch");
  assert.equal(calls[0].length, 36);
  assert.deepEqual(cursor, { height: 236, runningTotal: 1_172 });

  const resolved = resolveChainAggregates(
    withTransactionCursor(second.state, cursor),
    null,
    300,
  );
  assert.deepEqual(resolved, {
    totalTransactions: 1_100,
    totalAddresses: 110,
    coinSupply: 10_100,
    provenance: {
      totalTransactions: "floor",
      totalAddresses: "floor",
      coinSupply: "floor",
    },
  });
});

test("supply remains a floor until two increasing trusted checkpoints exist", async () => {
  const { acceptExplorerReport, createEmptyAggregateState, resolveChainAggregates } =
    await loadAggregates();
  const accepted = acceptExplorerReport(
    createEmptyAggregateState(),
    checkpoint(),
  );

  const resolved = resolveChainAggregates(accepted.state, null, 10_000);
  assert.equal(resolved.coinSupply, 10_000);
  assert.equal(resolved.provenance.coinSupply, "floor");
});

test("a lower explorer backfill is retained but cannot lower a served floor", async () => {
  const { acceptExplorerReport, createEmptyAggregateState, resolveChainAggregates } =
    await loadAggregates();
  const high = acceptExplorerReport(
    createEmptyAggregateState(),
    checkpoint({ height: 200, totalTransactions: 2_000, totalAddresses: 200 }),
  );
  const backfill = acceptExplorerReport(
    high.state,
    checkpoint({
      height: 210,
      totalTransactions: 1_900,
      totalAddresses: 190,
      coinSupply: 9_900,
      capturedAt: "2026-08-17T10:06:00.000Z",
    }),
  );

  assert.equal(backfill.state.reports.length, 2, "the raw report remains auditable");
  assert.deepEqual(backfill.report.trusted, {
    transactions: false,
    addresses: false,
    supply: false,
  });
  assert.deepEqual(resolveChainAggregates(backfill.state, backfill.report, 210), {
    totalTransactions: 2_000,
    totalAddresses: 200,
    coinSupply: 10_000,
    provenance: {
      totalTransactions: "floor",
      totalAddresses: "floor",
      coinSupply: "floor",
    },
  });
});

test("a stale-height report cannot become a new trusted checkpoint", async () => {
  const { acceptExplorerReport, createEmptyAggregateState } =
    await loadAggregates();
  const current = acceptExplorerReport(
    createEmptyAggregateState(),
    checkpoint({ height: 300 }),
  );
  const stale = acceptExplorerReport(
    current.state,
    checkpoint({
      height: 299,
      totalTransactions: 1_100,
      totalAddresses: 110,
      coinSupply: 10_100,
      capturedAt: "2026-08-17T10:07:00.000Z",
    }),
  );

  assert.deepEqual(stale.report.trusted, {
    transactions: false,
    addresses: false,
    supply: false,
  });
});

test("a non-integral checkpoint height is never trusted", async () => {
  const { acceptExplorerReport, createEmptyAggregateState } =
    await loadAggregates();
  const invalid = acceptExplorerReport(
    createEmptyAggregateState(),
    checkpoint({ height: 100.5 }),
  );

  assert.deepEqual(invalid.report.trusted, {
    transactions: false,
    addresses: false,
    supply: false,
  });
  assert.equal(invalid.state.cursor, null);
});

test("database-downgraded trust flags cannot seed local state", async () => {
  const {
    acceptExplorerReport,
    applyValidatedExplorerReport,
    createEmptyAggregateState,
    resolveChainAggregates,
  } = await loadAggregates();
  const current = acceptExplorerReport(
    createEmptyAggregateState(),
    checkpoint({ height: 300 }),
  );
  const rejectedByStore = {
    ...checkpoint({
      height: 400,
      totalTransactions: 2_000,
      totalAddresses: 200,
      coinSupply: 20_000,
      capturedAt: "2026-08-17T10:08:00.000Z",
    }),
    trusted: { transactions: false, addresses: false, supply: false },
  };

  const next = applyValidatedExplorerReport(current.state, rejectedByStore);
  assert.deepEqual(next.cursor, { height: 300, runningTotal: 1_000 });
  assert.deepEqual(resolveChainAggregates(next, rejectedByStore, 400), {
    totalTransactions: 1_000,
    totalAddresses: 100,
    coinSupply: 10_000,
    provenance: {
      totalTransactions: "floor",
      totalAddresses: "floor",
      coinSupply: "floor",
    },
  });
});

test("community explorer observations are correctable approximate fallbacks, never monotonic authority", async () => {
  const {
    acceptExplorerReport,
    createEmptyAggregateState,
    observeChainVerifiedFallbackReport,
    resolveChainAggregates,
  } = await loadAggregates();
  const canonical = acceptExplorerReport(
    createEmptyAggregateState(),
    checkpoint({ sourceId: "canonical-explorer" }),
  );
  const inflated = observeChainVerifiedFallbackReport(
    canonical.state,
    checkpoint({
      sourceId: "community-blockscout",
      verificationHeight: 190,
      verificationHash: `0x${"a".repeat(64)}`,
      height: 200,
      totalTransactions: 999_999_999_999,
      totalAddresses: 999_999_999,
      coinSupply: 149_999_999_999,
      capturedAt: "2026-08-20T10:00:00.000Z",
    }),
  );

  assert.deepEqual(inflated.report.trusted, {
    transactions: false,
    addresses: false,
    supply: false,
  });
  assert.deepEqual(inflated.state.cursor, canonical.state.cursor);
  assert.deepEqual(resolveChainAggregates(inflated.state, null), {
    totalTransactions: 999_999_999_999,
    totalAddresses: 999_999_999,
    coinSupply: 149_999_999_999,
    provenance: {
      totalTransactions: "floor",
      totalAddresses: "floor",
      coinSupply: "floor",
    },
  });

  const corrected = observeChainVerifiedFallbackReport(
    inflated.state,
    checkpoint({
      sourceId: "community-blockscout",
      verificationHeight: 191,
      verificationHash: `0x${"b".repeat(64)}`,
      height: 201,
      totalTransactions: 1_100,
      totalAddresses: 110,
      coinSupply: 10_100,
      capturedAt: "2026-08-20T10:05:00.000Z",
    }),
  );
  assert.deepEqual(resolveChainAggregates(corrected.state, null), {
    totalTransactions: 1_100,
    totalAddresses: 110,
    coinSupply: 10_100,
    provenance: {
      totalTransactions: "floor",
      totalAddresses: "floor",
      coinSupply: "floor",
    },
  });
});

test("a future-dated community observation is not retained", async () => {
  const { createEmptyAggregateState, observeChainVerifiedFallbackReport } =
    await loadAggregates();
  const empty = createEmptyAggregateState();
  const observed = observeChainVerifiedFallbackReport(
    empty,
    checkpoint({
      sourceId: "community-blockscout",
      verificationHeight: 90,
      verificationHash: `0x${"c".repeat(64)}`,
      capturedAt: "2100-01-01T00:00:00.000Z",
    }),
  );
  assert.deepEqual(observed.state, empty);
});

test("rolling community history preserves every trusted canonical field floor", async () => {
  const {
    applyValidatedExplorerReport,
    createEmptyAggregateState,
    mergeAggregateStates,
    observeChainVerifiedFallbackReport,
    resolveChainAggregates,
  } = await loadAggregates();

  let state = createEmptyAggregateState();
  const trustedReports = [
    {
      ...checkpoint({ id: "transaction-floor", totalTransactions: 2_000 }),
      trusted: { transactions: true, addresses: false, supply: false },
    },
    {
      ...checkpoint({ id: "address-floor", totalAddresses: 200 }),
      trusted: { transactions: false, addresses: true, supply: false },
    },
    {
      ...checkpoint({ id: "supply-floor", coinSupply: 20_000 }),
      trusted: { transactions: false, addresses: false, supply: true },
    },
  ];
  for (const report of trustedReports) {
    state = applyValidatedExplorerReport(state, report);
  }

  const fallbackReports = [];
  for (let index = 0; index < 55; index += 1) {
    const observed = observeChainVerifiedFallbackReport(
      state,
      checkpoint({
        id: `community-${index}`,
        sourceId: "community-blockscout",
        verificationHeight: 200 + index,
        verificationHash: `0x${(index + 1).toString(16).padStart(64, "0")}`,
        height: 210 + index,
        totalTransactions: 2_100 + index,
        totalAddresses: 210 + index,
        coinSupply: 20_100 + index,
        capturedAt: new Date(
          Date.parse("2026-08-20T10:00:00.000Z") + index * 1_000,
        ).toISOString(),
      }),
    );
    fallbackReports.push(observed.report);
    state = observed.state;
  }

  assert.equal(state.reports.length, 50);
  assert.deepEqual(
    trustedReports.map((report) => report.id).filter((id) =>
      state.reports.some((report) => report.id === id),
    ),
    ["transaction-floor", "address-floor", "supply-floor"],
  );
  assert.deepEqual(resolveChainAggregates(state, null), {
    totalTransactions: 2_154,
    totalAddresses: 264,
    coinSupply: 20_154,
    provenance: {
      totalTransactions: "floor",
      totalAddresses: "floor",
      coinSupply: "floor",
    },
  });

  const merged = mergeAggregateStates(
    { reports: trustedReports, cursor: null },
    { reports: fallbackReports, cursor: null },
  );
  assert.equal(merged.reports.length, 50);
  assert.ok(
    trustedReports.every(({ id }) =>
      merged.reports.some((report) => report.id === id),
    ),
    "database reload merging preserves all trusted field floors",
  );

  const corrected = observeChainVerifiedFallbackReport(
    state,
    checkpoint({
      id: "community-correction",
      sourceId: "community-blockscout",
      verificationHeight: 300,
      verificationHash: `0x${"f".repeat(64)}`,
      height: 310,
      totalTransactions: 1_900,
      totalAddresses: 190,
      coinSupply: 19_000,
      capturedAt: "2026-08-20T10:01:00.000Z",
    }),
  );
  assert.deepEqual(resolveChainAggregates(corrected.state, null), {
    totalTransactions: 2_000,
    totalAddresses: 200,
    coinSupply: 20_000,
    provenance: {
      totalTransactions: "floor",
      totalAddresses: "floor",
      coinSupply: "floor",
    },
  });
});

test("cursor catch-up is capped at two batches of fifty and never repeats a range", async () => {
  const { advanceTransactionCursor } = await loadAggregates();
  const ranges = [];
  const batcher = async (batch) => {
    const heights = batch.map((call) => Number.parseInt(call.params[0], 16));
    ranges.push([heights[0], heights.at(-1)]);
    return new Map(
      batch.map((call, index) => [
        index,
        { number: call.params[0], transactions: ["0xtx"] },
      ]),
    );
  };

  const first = await advanceTransactionCursor(
    { height: 100, runningTotal: 1_000 },
    400,
    batcher,
  );
  assert.deepEqual(ranges, [
    [101, 150],
    [151, 200],
  ]);
  assert.deepEqual(first, { height: 200, runningTotal: 1_100 });

  const second = await advanceTransactionCursor(first, 400, batcher);
  assert.deepEqual(ranges.slice(2), [
    [201, 250],
    [251, 300],
  ]);
  assert.deepEqual(second, { height: 300, runningTotal: 1_200 });
});

test("an incomplete RPC batch never skips an uncounted block", async () => {
  const { advanceTransactionCursor } = await loadAggregates();
  const start = { height: 100, runningTotal: 1_000 };
  const result = await advanceTransactionCursor(start, 180, async (batch) => {
    return new Map(
      batch.slice(0, -1).map((call, index) => [
        index,
        { number: call.params[0], transactions: [] },
      ]),
    );
  });
  assert.deepEqual(result, start);
});

test("a trusted stored report restores a missing transaction cursor", async () => {
  const {
    createEmptyAggregateState,
    mergeAggregateStates,
    resolveChainAggregates,
  } = await loadAggregates();
  const storedReport = {
    ...checkpoint(),
    trusted: { transactions: true, addresses: true, supply: true },
  };

  const restored = mergeAggregateStates(createEmptyAggregateState(), {
    reports: [storedReport],
    cursor: null,
  });

  assert.deepEqual(restored.cursor, { height: 100, runningTotal: 1_000 });
  assert.equal(
    resolveChainAggregates(restored, null, 120).totalTransactions,
    1_000,
  );
});

test("the migration keeps aggregate history private and cursor writes monotonic", () => {
  const migration = read("../supabase/migrations/0009_chain_aggregates.sql");
  assert.match(
    migration,
    /create table if not exists public\.chain_aggregate_checkpoints/,
  );
  assert.match(
    migration,
    /alter table public\.chain_aggregate_checkpoints enable row level security/,
  );
  assert.match(
    migration,
    /revoke all on table public\.chain_aggregate_checkpoints[\s\S]*from anon, authenticated, service_role, public/,
  );
  assert.match(
    migration,
    /grant select on table public\.chain_aggregate_checkpoints to service_role/,
  );
  assert.doesNotMatch(migration, /create policy/i);
  assert.match(migration, /limit 50/i);
  assert.match(
    migration,
    /lock table public\.chain_aggregate_checkpoints in share row exclusive mode/,
  );
  assert.match(migration, /on conflict \(record_kind\)[\s\S]*do update/);
  assert.match(
    migration,
    /where current_cursor\.height < excluded\.height[\s\S]*current_cursor\.running_total <= excluded\.running_total/,
  );
  assert.match(migration, /security definer/);
  assert.match(migration, /set search_path = ''/);
  assert.match(
    migration,
    /returns table \([\s\S]*transactions_trusted boolean[\s\S]*supply_trusted boolean/,
  );
});

test("canonical RPC tile checkpoints are private and advance by block height", () => {
  const migrationUrl = new URL(
    "../supabase/migrations/0014_chain_live_checkpoints.sql",
    import.meta.url,
  );
  assert.ok(
    existsSync(migrationUrl),
    "the canonical RPC tiles need a durable fallback migration",
  );
  const migration = readFileSync(migrationUrl, "utf8");

  assert.match(
    migration,
    /create table if not exists public\.chain_live_checkpoints/,
  );
  assert.match(
    migration,
    /alter table public\.chain_live_checkpoints enable row level security/,
  );
  assert.match(
    migration,
    /revoke all on table public\.chain_live_checkpoints[\s\S]*from anon, authenticated, service_role, public/,
  );
  assert.match(
    migration,
    /grant select on table public\.chain_live_checkpoints to service_role/,
  );
  assert.doesNotMatch(migration, /create policy/i);
  assert.match(migration, /security definer/);
  assert.match(migration, /set search_path = ''/);
  assert.match(
    migration,
    /where current_checkpoint\.block_height <= excluded\.block_height/,
    "an older canonical read must never replace a newer fallback",
  );
});

test("stats publish and restore one shared quorum snapshot", () => {
  const stats = read("../src/lib/chain/stats.ts");
  const store = read("../src/lib/chain/aggregate-store.server.ts");

  assert.match(stats, /getStoredChainConsensusSnapshot/);
  assert.match(stats, /publishChainConsensusSnapshot/);
  assert.match(stats, /authoritative\?\.blockHeight/);
  assert.match(stats, /peers:\s*authoritative\s*\?\s*authoritative\.peers/);
  assert.match(
    stats,
    /activeMiners:\s*authoritative\s*\?\s*authoritative\.activeMiners/,
  );
  assert.match(stats, /authoritative\?\.rpcObservedAt/);
  assert.match(store, /CONSENSUS_STORE_REFRESH_MS\s*=\s*15_000/);
  assert.match(store, /publish_chain_consensus_snapshot/);

  // Migration 0014 remains a rollout-only fallback for an old blue-green
  // process. New live writes must go exclusively through the quorum store.
  assert.match(stats, /getStoredChainLiveCheckpoint/);
  assert.doesNotMatch(stats, /persistChainLiveCheckpoint/);
});

test("stats wiring stays thin and the hot Supabase path is bounded", () => {
  const stats = read("../src/lib/chain/stats.ts");
  const store = read("../src/lib/chain/aggregate-store.server.ts");

  assert.match(stats, /acceptExplorerReport/);
  assert.doesNotMatch(
    stats,
    /advanceTransactionCursor/,
    "an explorer outage must hold the database checkpoint rather than synthesize a new total",
  );
  assert.match(stats, /resolveChainAggregates/);
  assert.match(stats, /await persistChainAggregateReport/);
  assert.match(stats, /getExplorerConsensus/);
  assert.match(stats, /heightSource:\s*"explorer"/);
  assert.match(stats, /Date\.parse\(authoritative\.rpcObservedAt\)/);
  assert.match(stats, /fetchedAt:\s*authoritative\?\.rpcObservedAt/);
  assert.match(store, /Promise\.race|withTimeout/);
  assert.match(store, /5 \* 60 \* 1000/);
  assert.match(store, /60_000/);
  assert.match(store, /await import\("\.\.\/supabase\/admin"\)/);
  assert.doesNotMatch(store, /^import .*supabase\/admin/m);
});

test("the home band visibly marks every non-exact aggregate", () => {
  const statsBand = read("../src/components/home/StatsBand.tsx");
  const site = read("../src/lib/content/site.ts");
  const provenanceStart = site.indexOf("  aggregateProvenance:");
  const provenanceEnd = site.indexOf("\n  },", provenanceStart) + 5;
  assert.match(statsBand, /aggregateProvenance/);
  assert.match(statsBand, /STATS_SECTION\.aggregateProvenance\.marker/);
  assert.match(statsBand, /STATS_SECTION\.aggregateProvenance\.note/);
  assert.match(
    statsBand,
    /Object\.values\(\s*stats\?\.aggregateProvenance \?\? \{\},?\s*\)/,
    "new UI code tolerates one old API response during a blue-green switch",
  );
  assert.match(statsBand, /stats\.aggregateProvenance\?\.\[s\.key\] \?\? null/);
  assert.match(site, /aggregateProvenance:/);
  assert.match(site, /marker: "≈"/);
  assert.ok(provenanceStart >= 0 && provenanceEnd > provenanceStart);
  assert.doesNotMatch(site.slice(provenanceStart, provenanceEnd), /—|;/);
});
