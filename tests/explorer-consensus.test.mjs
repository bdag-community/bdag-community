import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { test } from "node:test";

const moduleUrl = new URL(
  "../src/lib/chain/explorer-consensus.ts",
  import.meta.url,
);

async function loadConsensus() {
  assert.ok(
    existsSync(moduleUrl),
    "the pure explorer consensus module must exist",
  );
  return import(moduleUrl.href);
}

const HASH_A = `0x${"a".repeat(64)}`;
const HASH_B = `0x${"b".repeat(64)}`;

const report = (overrides = {}) => ({
  id: "canonical-explorer",
  chainId: 1404,
  indexedHeight: 1_000,
  verificationHeight: 1_000,
  verificationHash: HASH_A,
  rpcVerificationHash: HASH_A,
  totalTransactions: 10_000,
  totalAddresses: 1_000,
  coinSupply: 100_000,
  indexedRatio: 1,
  averageBlockTimeMs: 850,
  ...overrides,
});

test("the latest same-chain explorer report wins independent of response order", async () => {
  const { selectExplorerReport } = await loadConsensus();
  const older = report({ id: "canonical-explorer", indexedHeight: 1_000 });
  const newer = report({
    id: "community-explorer",
    indexedHeight: 1_200,
    verificationHeight: 1_200,
    totalTransactions: 11_000,
  });

  assert.equal(selectExplorerReport([older, newer], 1_250)?.id, newer.id);
  assert.equal(selectExplorerReport([newer, older], 1_250)?.id, newer.id);
});

test("wrong-chain and mismatched-hash explorers are rejected", async () => {
  const { selectExplorerReport } = await loadConsensus();
  assert.equal(
    selectExplorerReport(
      [
        report({ id: "wrong-chain", chainId: 1 }),
        report({ id: "wrong-hash", verificationHash: HASH_B }),
      ],
      1_250,
    ),
    null,
  );
});

test("an impossible index height or malformed proof fails closed", async () => {
  const { selectExplorerReport } = await loadConsensus();
  const observations = [
    report({ id: "future", indexedHeight: 1_301, verificationHeight: 1_301 }),
    report({ id: "fraction", indexedHeight: 1_000.5 }),
    report({ id: "bad-proof-height", verificationHeight: 1_001 }),
    report({ id: "bad-hash", verificationHash: "0x1234" }),
  ];
  assert.equal(selectExplorerReport(observations, 1_250), null);
});

test("selection keeps one coherent report and never mixes fields", async () => {
  const { selectExplorerReport } = await loadConsensus();
  const olderWithSupply = report({
    id: "older",
    indexedHeight: 1_000,
    coinSupply: 100_000,
  });
  const newerWithoutSupply = report({
    id: "newer",
    indexedHeight: 1_100,
    verificationHeight: 1_100,
    totalTransactions: 11_000,
    coinSupply: null,
  });

  const selected = selectExplorerReport(
    [olderWithSupply, newerWithoutSupply],
    1_250,
  );
  assert.equal(selected?.id, "newer");
  assert.equal(selected?.coinSupply, null);
});

test("equal index heights use a stable source id tie-breaker", async () => {
  const { selectExplorerReport } = await loadConsensus();
  const a = report({ id: "a-explorer" });
  const z = report({ id: "z-explorer" });
  assert.equal(selectExplorerReport([z, a], 1_250)?.id, "a-explorer");
});

test("a report needs at least one bounded aggregate", async () => {
  const { selectExplorerReport } = await loadConsensus();
  assert.equal(
    selectExplorerReport(
      [
        report({
          totalTransactions: null,
          totalAddresses: null,
          coinSupply: null,
        }),
      ],
      1_250,
    ),
    null,
  );
  assert.equal(
    selectExplorerReport([report({ totalTransactions: -1 })], 1_250),
    null,
  );
});

test("Blockscout string fields become one normalized verified observation", async () => {
  const { buildBlockscoutObservation } = await loadConsensus();
  assert.deepEqual(
    buildBlockscoutObservation({
      id: "community-explorer",
      stats: {
        total_blocks: "18477312",
        total_transactions: "5197960",
        total_addresses: "111738",
        average_block_time: 533,
      },
      supply: "90018846099.12546",
      indexing: { indexed_blocks_ratio: "1.00" },
      block: {
        height: 18477312,
        hash: "0x33540b1246548e5dedc6ecc908bab0a1b4af94b8b05a3132171f5b4aeb66190c",
      },
      rpcVerificationHash:
        "0x33540b1246548e5dedc6ecc908bab0a1b4af94b8b05a3132171f5b4aeb66190c",
    }),
    {
      id: "community-explorer",
      chainId: 1404,
      indexedHeight: 18477312,
      verificationHeight: 18477312,
      verificationHash:
        "0x33540b1246548e5dedc6ecc908bab0a1b4af94b8b05a3132171f5b4aeb66190c",
      rpcVerificationHash:
        "0x33540b1246548e5dedc6ecc908bab0a1b4af94b8b05a3132171f5b4aeb66190c",
      totalTransactions: 5197960,
      totalAddresses: 111738,
      coinSupply: 90018846099.12546,
      indexedRatio: 1,
      averageBlockTimeMs: 533,
    },
  );
});

test("an explorer total may be verified against a finalized block below its indexed head", async () => {
  const { buildBlockscoutObservation } = await loadConsensus();
  const observation = buildBlockscoutObservation({
    id: "community-explorer",
    stats: { total_blocks: "1250", total_transactions: "2000" },
    supply: null,
    indexing: null,
    block: { height: 1186, hash: HASH_A },
    rpcVerificationHash: HASH_A,
  });

  assert.equal(observation?.indexedHeight, 1250);
  assert.equal(observation?.verificationHeight, 1186);
});

test("malformed Blockscout payloads fail closed instead of becoming zeros", async () => {
  const { buildBlockscoutObservation } = await loadConsensus();
  assert.equal(
    buildBlockscoutObservation({
      id: "bad",
      stats: { total_blocks: "", total_transactions: "not-a-number" },
      supply: null,
      indexing: null,
      block: null,
      rpcVerificationHash: HASH_A,
    }),
    null,
  );
});
