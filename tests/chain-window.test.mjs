import { existsSync } from "node:fs";
import assert from "node:assert/strict";
import { test } from "node:test";

const rangeUrl = new URL(
  "../src/lib/chain/window-range.ts",
  import.meta.url,
);

test("TPS restarts from the newest contiguous run after an older gap", async () => {
  assert.ok(existsSync(rangeUrl), "the pure window-range helper must exist");
  const { deriveContiguousRateWindow, newestContiguousHeights } = await import(
    rangeUrl.href
  );

  assert.deepEqual(
    newestContiguousHeights([79, 110, 108, 109, 80, 110]),
    [110, 109, 108],
  );

  const oldRun = Array.from({ length: 101 }, (_, index) => ({
    height: 100 - index,
    timestampMs: (100 - index) * 1_000,
    transactions: 50,
  }));
  const freshRun = Array.from({ length: 62 }, (_, index) => ({
    height: 262 - index,
    timestampMs: (262 - index) * 1_000,
    transactions: 1,
  }));
  const rate = deriveContiguousRateWindow([...oldRun, ...freshRun], {
    minimumSeconds: 60,
    minimumBaselineBlocks: 1_000,
  });

  assert.equal(rate.windowBlocks, 62);
  assert.equal(rate.windowSeconds, 61);
  assert.equal(rate.coverage, 1);
  assert.equal(rate.observedTps, 62 / 61);
  assert.equal(rate.measuredBlockTimeMs, null);
});

test("old history cannot satisfy the one-minute gate for a short new run", async () => {
  const { deriveContiguousRateWindow } = await import(rangeUrl.href);
  const oldRun = Array.from({ length: 101 }, (_, index) => ({
    height: 100 - index,
    timestampMs: (100 - index) * 1_000,
    transactions: 10,
  }));
  const freshRun = Array.from({ length: 31 }, (_, index) => ({
    height: 231 - index,
    timestampMs: (231 - index) * 1_000,
    transactions: 1,
  }));

  const rate = deriveContiguousRateWindow([...oldRun, ...freshRun], {
    minimumSeconds: 60,
    minimumBaselineBlocks: 1_000,
  });

  assert.equal(rate.windowBlocks, 31);
  assert.equal(rate.windowSeconds, 30);
  assert.equal(rate.observedTps, null);
});
