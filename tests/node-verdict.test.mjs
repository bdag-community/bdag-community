import { existsSync, readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { test } from "node:test";

const verdictUrl = new URL("../src/lib/chain/node-verdict.ts", import.meta.url);
const read = (rel) => readFileSync(new URL(rel, import.meta.url), "utf8");

async function load() {
  assert.ok(existsSync(verdictUrl), "the pure node-verdict module must exist");
  return import(verdictUrl.href);
}

const REF = 20_000_000;
const base = {
  reachable: true,
  chainId: 1404,
  expectedChainId: 1404,
  referenceHeight: REF,
  evidence: null,
  flagged: false,
};

test("head distance alone never says fork — only behind", async () => {
  const { decideVerdict, BEHIND_BLOCKS } = await load();
  assert.equal(
    decideVerdict({ ...base, blockHeight: REF - BEHIND_BLOCKS - 1 }),
    "behind",
  );
  assert.equal(
    decideVerdict({ ...base, blockHeight: REF - 2_000_000 }),
    "behind",
    "two million blocks behind with no hash evidence is still only behind",
  );
  assert.equal(decideVerdict({ ...base, blockHeight: REF - 5 }), "canonical");
  assert.equal(
    decideVerdict({ ...base, blockHeight: REF + 5_000 }),
    "canonical",
    "ahead of a stale reference is not behind",
  );
});

test("a settled hash mismatch is the only road to the fork verdict", async () => {
  const { decideVerdict } = await load();
  const proven = { matched: 1, checked: 3, forkProven: true };
  const agreed = { matched: 3, checked: 3, forkProven: false };
  assert.equal(
    decideVerdict({ ...base, blockHeight: REF, evidence: proven }),
    "diverged",
    "level with the head but wrong hashes is a fork",
  );
  assert.equal(
    decideVerdict({ ...base, blockHeight: REF - 5_000, evidence: agreed }),
    "behind",
  );
  assert.equal(
    decideVerdict({ ...base, blockHeight: REF - 5_000, evidence: proven }),
    "diverged",
  );
  assert.equal(
    decideVerdict({ ...base, blockHeight: REF - 10, evidence: agreed }),
    "canonical",
  );
});

test("the documented fork keeps its verdict only while there is no evidence", async () => {
  const { decideVerdict } = await load();
  assert.equal(
    decideVerdict({ ...base, blockHeight: REF - 2_000_000, flagged: true }),
    "diverged",
  );
  assert.equal(
    decideVerdict({
      ...base,
      blockHeight: REF - 2_000_000,
      flagged: true,
      evidence: { matched: 2, checked: 2, forkProven: false },
    }),
    "behind",
    "matching hashes decide, even for the flagged host",
  );
});

test("reachability and chain id verdicts are unchanged", async () => {
  const { decideVerdict } = await load();
  assert.equal(decideVerdict({ ...base, reachable: false, blockHeight: null, chainId: null }), "offline");
  assert.equal(decideVerdict({ ...base, chainId: null, blockHeight: null }), "degraded");
  assert.equal(decideVerdict({ ...base, chainId: 1, blockHeight: REF }), "wrong-chain");
  assert.equal(decideVerdict({ ...base, blockHeight: null }), "degraded");
});

test("hash evidence: only a by-number mismatch settled on both sides proves a fork", async () => {
  const { hashEvidence, SETTLED_DEPTH } = await load();
  const reference = new Map([
    [REF - 100, "0xaaa"],
    [REF - 1_000, "0xbbb"],
    [REF - 10_000, "0xccc"],
  ]);
  const agree = hashEvidence(
    [
      { height: REF - 100, hash: "0xaaa", byNumber: true },
      { height: REF - 1_000, hash: "0xbbb", byNumber: true },
      { height: REF - 99_999, hash: "0xzzz", byNumber: true },
    ],
    reference,
    REF,
    REF,
  );
  assert.deepEqual(agree, { matched: 2, checked: 2, forkProven: false });

  const fork = hashEvidence(
    [{ height: REF - 1_000, hash: "0xnot", byNumber: true }],
    reference,
    REF,
    REF,
  );
  assert.deepEqual(fork, { matched: 0, checked: 1, forkProven: true });

  // A mismatch inside the settling window on the node's side is not proof.
  const tip = hashEvidence(
    [{ height: REF - 100, hash: "0xnot", byNumber: true }],
    reference,
    REF,
    REF - 100 + SETTLED_DEPTH - 1,
  );
  assert.deepEqual(tip, { matched: 0, checked: 1, forkProven: false });

  // A node's own `latest` tip can confirm the chain, never condemn it.
  const latestMatch = hashEvidence(
    [{ height: REF - 10_000, hash: "0xccc", byNumber: false }],
    reference,
    REF,
    REF - 10_000,
  );
  assert.deepEqual(latestMatch, { matched: 1, checked: 1, forkProven: false });
  const latestMismatch = hashEvidence(
    [{ height: REF - 10_000, hash: "0xorphan", byNumber: false }],
    reference,
    REF,
    REF - 10_000,
  );
  assert.deepEqual(latestMismatch, { matched: 0, checked: 1, forkProven: false });

  assert.equal(hashEvidence([], reference, REF, REF), null);
  assert.equal(
    hashEvidence([{ height: 5, hash: "0x1", byNumber: true }], reference, REF, REF),
    null,
    "no reference at that height means nothing was checked",
  );
});

test("reference hashes: canonical wins, otherwise a strict two-node quorum", async () => {
  const { referenceHashesFrom } = await load();
  const canonical = new Map([[10, "0xcanon"]]);
  const voters = [
    new Map([[10, "0xother"], [20, "0xq"], [30, "0xa"]]),
    new Map([[10, "0xother"], [20, "0xq"], [30, "0xb"]]),
    new Map([[20, "0xq"], [30, "0xa"], [40, "0xlone"]]),
  ];
  const ref = referenceHashesFrom(canonical, voters);
  assert.equal(ref.get(10), "0xcanon", "the canonical answer is never outvoted");
  assert.equal(ref.get(20), "0xq");
  assert.equal(ref.get(30), "0xa", "two beats one");
  assert.equal(ref.get(40), undefined, "one node is not a quorum");

  const split = referenceHashesFrom(null, [
    new Map([[1, "0xa"], [2, "0xa"]]),
    new Map([[1, "0xa"], [2, "0xa"]]),
    new Map([[1, "0xc"], [2, "0xb"]]),
    new Map([[2, "0xb"]]),
  ]);
  assert.equal(split.get(1), "0xa");
  assert.equal(split.get(2), undefined, "a 2-2 split yields no reference");
});

test("sample heights cover the reference depths and each lagging node's own head", async () => {
  const { sampleHeights, HASH_SAMPLE_DEPTHS, OWN_HEAD_SAMPLE_DEPTH, MAX_SAMPLE_HEIGHTS } = await load();
  assert.deepEqual(sampleHeights(null, [1, 2]), []);
  const heights = sampleHeights(REF, [REF, REF - 3, null, REF - 2_745, REF - 2_000_000]);
  for (const d of HASH_SAMPLE_DEPTHS) assert.ok(heights.includes(REF - d));
  assert.ok(heights.includes(REF - 2_745));
  assert.ok(heights.includes(REF - 2_745 - OWN_HEAD_SAMPLE_DEPTH));
  assert.ok(heights.includes(REF - 2_000_000));
  assert.ok(heights.includes(REF - 2_000_000 - OWN_HEAD_SAMPLE_DEPTH));
  assert.ok(!heights.includes(REF - 3), "a node level with the head needs no own sample");
  assert.deepEqual(heights, [...heights].sort((a, b) => b - a), "highest first");
  assert.ok(heights.length <= MAX_SAMPLE_HEIGHTS);
  assert.ok(sampleHeights(50, [10]).every((h) => h > 0), "no non-positive heights");
});

test("the prober decides through the pure module and no longer forks on distance", () => {
  const nodes = read("../src/lib/chain/nodes.ts");
  assert.match(nodes, /from "@\/lib\/chain\/node-verdict"/);
  assert.match(nodes, /decideVerdict\(/);
  assert.match(nodes, /referenceHashesFrom\(/);
  assert.doesNotMatch(nodes, /DIVERGENCE_BLOCKS/);
  assert.doesNotMatch(nodes, /return "diverged"/, "the I/O layer never names the fork verdict itself");
  assert.match(nodes, /params: \["latest", false\]/, "nodes that only serve latest still get checked");
  assert.match(nodes, /result \?\? fetchHashes\(urls\[i\], \[\]\)/, "a failed batch retries with latest alone");
  assert.match(nodes, /HASH_TIMEOUT_MS = 10_000/);

  const ui = read("../src/components/mining/verdicts.ts");
  assert.match(ui, /behind:\s*\{[\s\S]*?label:\s*"Behind"/);
  assert.match(ui, /diverged:\s*\{[\s\S]*?label:\s*"Fork"/);
});
