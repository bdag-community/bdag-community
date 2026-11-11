import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { test } from "node:test";

const stats = readFileSync(
  new URL("../src/lib/chain/stats.ts", import.meta.url),
  "utf8",
);

test("stats publishes and renders one shared authoritative quorum snapshot", () => {
  assert.match(stats, /probeAutomaticRpcSources/);
  assert.match(stats, /getStoredChainConsensusSnapshot/);
  assert.match(stats, /await publishChainConsensusSnapshot\(/);
  assert.match(stats, /authoritative\?\.blockHeight/);
  assert.match(stats, /authoritative\.rpcObservedAt/);
  assert.match(stats, /Date\.now\(\)\s*-\s*Date\.parse\(authoritative\.rpcObservedAt\)/);
  assert.doesNotMatch(stats, /stale:\s*headHeight\s*===\s*null/);
  assert.doesNotMatch(stats, /const RPC_ENDPOINTS|minersSeen|minersSeeded/);
  assert.match(
    stats,
    /authoritative\.blockHeight\s*===\s*consensus\.blockHeight[\s\S]*authoritative\.blockHash\s*===\s*consensus\.blockHash/,
    "details may be read only for the exact shared authoritative head",
  );
});

test("detail reads and deterministic miner sampling stay inside the winning quorum", () => {
  assert.match(stats, /rpcBatchOutcomesFromConsensus/);
  assert.match(stats, /matchingBlockOutcomes/);
  assert.match(stats, /consensus\.blockHash/);
  assert.match(stats, /minerSampleAnchor/);
  assert.match(stats, /minerSampleHeights/);
  assert.match(stats, /countMinerSample/);
  assert.doesNotMatch(stats, /CHAIN\.rpcUrl/);
});

test("a new deterministic producer sample never blocks the shared stats response", () => {
  assert.match(
    stats,
    /const minerSample = alignedConsensus\s*\? currentMinerSample\(/,
    "the request should reuse only an already-available sample",
  );
  assert.match(
    stats,
    /void refreshMinerSample\(/,
    "a missing sample should refresh after the response path has moved on",
  );
  assert.match(stats, /const \[details, aggregates\] = await Promise\.all\(/);
  assert.doesNotMatch(
    stats,
    /const \[details, minerSample, aggregates\] = await Promise\.all\(/,
  );
});

test("explorer aggregates use one chain-verified report and retain database floors", () => {
  assert.match(stats, /getExplorerConsensus/);
  assert.match(stats, /explorerConsensus\?\.report/);
  assert.match(stats, /acceptExplorerReport/);
  assert.match(stats, /observeChainVerifiedFallbackReport/);
  assert.match(
    stats,
    /explorerReport\.id === "canonical-explorer"[\s\S]*acceptExplorerReport[\s\S]*observeChainVerifiedFallbackReport/,
    "only the canonical explorer may advance monotonic authority",
  );
  assert.match(stats, /resolveChainAggregates/);
  assert.match(
    stats,
    /explorerReport\?\.id === "canonical-explorer"[\s\S]*\? freshReport : null/,
    "a chain-verified community indexer is still shown as a stored floor, not an exact canonical reading",
  );
  assert.doesNotMatch(stats, /async function explorerJson|CHAIN\.explorerUrl/);
});

test("a failed live refresh preserves the observation timestamp", () => {
  assert.match(stats, /fetchedAt:\s*authoritative\?\.rpcObservedAt/);
  assert.doesNotMatch(
    stats,
    /fetchedAt:\s*new Date\(\)\.toISOString\(\)[\s\S]{0,80}stale/,
  );
});

test("a verified historical baseline survives a transient authority race", () => {
  assert.match(
    stats,
    /const verifiedBaselines =\s*effectiveDetails\?\.baselines \?\? lastVerifiedBaselines/,
    "a newer shared head must not erase an independently quorum-verified historical interval",
  );
  assert.match(stats, /intervalTenKMs:\s*verifiedBaselines\[0\]/);
  assert.match(stats, /intervalHundredKMs:\s*verifiedBaselines\[1\]/);
  assert.match(stats, /intervalMillionMs:\s*verifiedBaselines\[2\]/);
});

test("an authoritative snapshot never resurrects legacy peer or miner fields", () => {
  assert.match(
    stats,
    /peers:\s*authoritative\s*\?\s*authoritative\.peers\s*:\s*storedLegacy\?\.peers/,
  );
  assert.match(
    stats,
    /activeMiners:\s*authoritative\s*\?\s*authoritative\.activeMiners\s*:\s*storedLegacy\?\.activeMiners/,
  );
  assert.doesNotMatch(
    stats,
    /authoritative\?\.(?:peers|activeMiners)\s*\?\?\s*storedLegacy/,
  );
});
