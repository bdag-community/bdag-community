import { existsSync, readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { test } from "node:test";

const read = (relativePath) =>
  readFileSync(new URL(relativePath, import.meta.url), "utf8");

test("consensus snapshots are private, quorum-validated, and monotonic", () => {
  const migrationUrl = new URL(
    "../supabase/migrations/0015_chain_consensus_snapshots.sql",
    import.meta.url,
  );
  assert.ok(
    existsSync(migrationUrl),
    "the resolved RPC quorum needs an isolated durable snapshot migration",
  );
  const migration = readFileSync(migrationUrl, "utf8");

  assert.match(
    migration,
    /create table if not exists public\.chain_consensus_snapshots/,
  );
  assert.match(migration, /add column if not exists source_id text/);
  assert.match(migration, /create or replace function public\.record_chain_aggregate_report_v2/);
  assert.match(migration, /p_verification_hash/);
  assert.match(migration, /p_observed_at timestamptz/);
  assert.match(migration, /canonical_transactions_floor boolean/);
  assert.match(migration, /canonical_addresses_floor boolean/);
  assert.match(migration, /canonical_supply_floor boolean/);
  assert.match(
    migration,
    /create trigger preserve_chain_aggregate_durable_floor_before_delete/,
  );
  assert.match(
    migration,
    /create trigger prune_chain_aggregate_history_after_insert/,
  );
  assert.match(
    migration,
    /limit v_recent_limit/,
    "legacy and verified writers share one floor-preserving history bound",
  );
  assert.match(
    migration,
    /p_coin_supply::numeric\(30, 8\)/,
    "idempotence compares supply at the database storage precision",
  );
  assert.match(
    migration,
    /checkpoint\.captured_at = p_observed_at/,
    "only the same source observation is deduplicated so later corrections remain visible",
  );
  assert.match(
    migration,
    /alter table public\.chain_consensus_snapshots enable row level security/,
  );
  assert.match(
    migration,
    /revoke all on table public\.chain_consensus_snapshots[\s\S]*from anon, authenticated, service_role, public/,
  );
  assert.match(
    migration,
    /grant select on table public\.chain_consensus_snapshots to service_role/,
  );
  assert.doesNotMatch(migration, /create policy/i);
  assert.match(migration, /create or replace function public\.publish_chain_consensus_snapshot\(/);
  assert.match(migration, /security definer/);
  assert.match(migration, /set search_path = ''/);
  assert.match(migration, /p_chain_id is distinct from 1404/);
  assert.match(migration, /\^0x\[0-9a-fA-F\]\{64\}\$/);
  assert.match(migration, /count\(distinct btrim\(source_id\)\) < 2/);
  assert.match(migration, /count\(distinct btrim\(operator_id\)\) < 2/);
  assert.match(
    migration,
    /current_snapshot\.block_height < excluded\.block_height[\s\S]*current_snapshot\.block_hash = excluded\.block_hash/,
  );
  assert.match(
    migration,
    /current_snapshot\.peer_source = any\(excluded\.rpc_source_ids\)[\s\S]*else null/,
    "a quorum change cannot carry a peer reading from a departed source",
  );
  assert.match(
    migration,
    /when current_snapshot\.block_height < excluded\.block_height[\s\S]*then excluded\.rpc_observed_at/,
    "a newer height keeps its own observation time",
  );
  assert.match(
    migration,
    /grant execute on function public\.publish_chain_consensus_snapshot\([\s\S]*to service_role/,
  );
});

test("the server store reads and publishes the authoritative consensus row", () => {
  const store = read("../src/lib/chain/aggregate-store.server.ts");

  assert.match(store, /export type ChainConsensusSnapshot/);
  assert.match(store, /export type ChainConsensusCandidate/);
  assert.match(store, /CONSENSUS_STORE_REFRESH_MS\s*=\s*(?:1[0-9]_000|20_000)/);
  assert.match(store, /export async function getStoredChainConsensusSnapshot/);
  assert.match(store, /\.from\("chain_consensus_snapshots"\)/);
  assert.match(store, /export async function publishChainConsensusSnapshot/);
  assert.match(store, /client\.rpc\("publish_chain_consensus_snapshot"/);
  assert.match(
    store,
    /const response = await withTimeout\([\s\S]*client\.rpc\("publish_chain_consensus_snapshot"/,
    "publishing must await the database authority rather than fire and forget",
  );
  assert.match(store, /rpc_observed_at/);
  assert.match(store, /published_at/);
  assert.match(store, /incoming\.rpcSourceIds\.includes\(current\.peerSource\)/);
  assert.match(store, /source_id, verification_height, verification_hash/);
  assert.match(store, /record_chain_aggregate_report_v2/);
  assert.match(
    store,
    /p_observed_at: report\.capturedAt/,
    "the database orders fallbacks by their bounded source observation time",
  );
  assert.match(
    store,
    /incoming\.blockHeight > current\.blockHeight[\s\S]*incoming\.rpcObservedAt/,
    "a newer height cannot inherit an observation time from an older head",
  );
  assert.match(
    store,
    /let consensusStoreMemory: ChainConsensusSnapshot \| null = null/,
    "configured runtimes keep database-confirmed authority separate from local observations",
  );
  assert.match(
    store,
    /let consensusLocalMemory: ChainConsensusSnapshot \| null = null/,
    "storeless runtimes may retain a process-local consensus snapshot",
  );

  const readAt = store.indexOf(
    "export async function getStoredChainConsensusSnapshot",
  );
  const readEnd = store.indexOf(
    "export async function publishChainConsensusSnapshot",
    readAt,
  );
  const readBody = store.slice(readAt, readEnd);
  assert.match(
    readBody,
    /if \(!hasStoreEnv\(\)\) return consensusLocalMemory;/,
    "only a storeless runtime may read the process-local snapshot",
  );
  assert.match(
    readBody,
    /\.catch\(\(\) => consensusStoreMemory\)/,
    "a failed configured read retains only the last database-confirmed row",
  );

  const publishAt = store.indexOf(
    "export async function publishChainConsensusSnapshot",
  );
  const publishEnd = store.indexOf(
    "export async function persistChainAggregateReport",
    publishAt,
  );
  const publishBody = store.slice(publishAt, publishEnd);
  const remotePublishAt = store.indexOf(
    'client.rpc("publish_chain_consensus_snapshot"',
    publishAt,
  );
  assert.ok(
    publishAt >= 0 && publishEnd > publishAt && remotePublishAt > publishAt,
    "the configured publication path remains present",
  );
  assert.match(
    publishBody,
    /if \(!hasStoreEnv\(\)\) \{[\s\S]*consensusLocalMemory = mergeConsensusSnapshot\([\s\S]*return consensusLocalMemory;[\s\S]*\}/,
    "local candidate merging is isolated to runtimes without a configured store",
  );
  assert.doesNotMatch(
    publishBody.slice(publishBody.indexOf("try {")),
    /mergeConsensusSnapshot/,
    "the configured publication path cannot promote a local candidate before database confirmation",
  );
  assert.match(
    publishBody,
    /catch \{\s*return consensusStoreMemory;\s*\}/,
    "a failed configured publish returns only the last database-confirmed row",
  );
});

test("the legacy blue-green checkpoint adapter remains available", () => {
  const store = read("../src/lib/chain/aggregate-store.server.ts");

  assert.match(store, /export async function getStoredChainLiveCheckpoint/);
  assert.match(store, /export async function persistChainLiveCheckpoint/);
  assert.match(store, /persist_chain_live_checkpoint/);
});
