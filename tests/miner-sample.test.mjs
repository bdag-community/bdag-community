import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { test } from "node:test";

const moduleUrl = new URL("../src/lib/chain/miner-sample.ts", import.meta.url);

async function loadSampler() {
  assert.ok(
    existsSync(moduleUrl),
    "the deterministic miner sampler must exist",
  );
  return import(moduleUrl.href);
}

test("sample anchors are stable inside one thousand block epochs", async () => {
  const { minerSampleAnchor } = await loadSampler();
  assert.equal(minerSampleAnchor(100_064), 100_000);
  assert.equal(minerSampleAnchor(100_999), 100_000);
  assert.equal(minerSampleAnchor(101_064), 101_000);
  assert.equal(minerSampleAnchor(63), null);
});

test("the sample uses fixed complete fifty-block ranges across the trailing day", async () => {
  const { minerSampleHeights } = await loadSampler();
  const heights = minerSampleHeights(100_000);
  assert.equal(heights.length, 350);
  assert.equal(new Set(heights).size, heights.length);
  assert.equal(heights[0], 99_951);
  assert.equal(heights[49], 100_000);
  assert.equal(heights.at(-1), 15_000);
});

test("a complete deterministic sample counts unique valid producer addresses", async () => {
  const { countMinerSample, minerSampleHeights } = await loadSampler();
  const heights = minerSampleHeights(100_000);
  const minerA = `0x${"a".repeat(40)}`;
  const minerB = `0x${"b".repeat(40)}`;
  const headers = heights.map((height, index) => ({
    height,
    miner: index % 2 === 0 ? minerA : minerB.toUpperCase(),
  }));

  assert.deepEqual(countMinerSample(heights, headers), {
    activeMiners: 2,
    sampleAnchor: 100_000,
  });
});

test("missing, duplicate, wrong-height, or invalid-miner headers reject the whole sample", async () => {
  const { countMinerSample, minerSampleHeights } = await loadSampler();
  const heights = minerSampleHeights(100_000);
  const miner = `0x${"a".repeat(40)}`;
  const valid = heights.map((height) => ({ height, miner }));

  assert.equal(countMinerSample(heights, valid.slice(1)), null);
  assert.equal(
    countMinerSample(heights, [...valid.slice(0, -1), valid[0]]),
    null,
  );
  assert.equal(
    countMinerSample(heights, [
      ...valid.slice(0, -1),
      { height: heights.at(-1), miner: "not-an-address" },
    ]),
    null,
  );
});
