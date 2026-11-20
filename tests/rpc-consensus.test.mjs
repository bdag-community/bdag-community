import { existsSync, readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { test } from "node:test";

const consensusUrl = new URL(
  "../src/lib/chain/rpc-consensus.ts",
  import.meta.url,
);
const sourcesUrl = new URL(
  "../src/lib/chain/rpc-sources.server.ts",
  import.meta.url,
);
const batchingUrl = new URL(
  "../src/lib/chain/rpc-batching.ts",
  import.meta.url,
);
const detailStateUrl = new URL(
  "../src/lib/chain/rpc-detail-state.ts",
  import.meta.url,
);

async function loadConsensus() {
  assert.ok(existsSync(consensusUrl), "the pure RPC consensus module must exist");
  return import(consensusUrl.href);
}

async function loadBatching() {
  assert.ok(
    existsSync(batchingUrl),
    "the pure RPC batching module must exist",
  );
  return import(batchingUrl.href);
}

async function loadDetailState() {
  assert.ok(
    existsSync(detailStateUrl),
    "the pure RPC detail-state module must exist",
  );
  return import(detailStateUrl.href);
}

const PINNED_HASH =
  "0x5fbf4e315490f0ab18b7adda33352522a03347883e1b23c3ab2e83cbe32082bb";

const candidate = (overrides = {}) => ({
  sourceId: "canonical",
  operatorId: "blockdag",
  chainId: 1404,
  blockHeight: 20_000_000,
  pinnedBlockHash: PINNED_HASH,
  syncing: false,
  peerCount: 12,
  blockHashes: [
    {
      height: 20_000_000,
      hash: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    },
  ],
  ...overrides,
});

test("wrong-chain and pinned-hash mismatch sources cannot vote", async () => {
  const { resolveRpcConsensus } = await loadConsensus();
  const result = resolveRpcConsensus([
    candidate(),
    candidate({
      sourceId: "east",
      operatorId: "bdag-us",
      chainId: 1,
    }),
    candidate({
      sourceId: "dvd",
      operatorId: "dvd",
      pinnedBlockHash:
        "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    }),
  ]);

  assert.equal(result, null, "only one verified operator remains");
});

test("block proofs bind the returned number to the requested height", async () => {
  const { readBlockHashAt } = await loadConsensus();
  const hash = `0x${"a".repeat(64)}`;

  assert.equal(
    readBlockHashAt({ number: "0x10", hash }, 16),
    hash,
  );
  assert.equal(
    readBlockHashAt({ number: "0x11", hash }, 16),
    null,
    "an endpoint cannot substitute a different block height",
  );
  assert.equal(readBlockHashAt({ hash }, 16), null);
});

test("follow-up block details require two matching source proofs", async () => {
  const { selectMatchingBlockOutcome } = await loadConsensus();
  const hashA = `0x${"a".repeat(64)}`;
  const hashB = `0x${"b".repeat(64)}`;
  const block = (height, hash, overrides = {}) => ({
    number: `0x${height.toString(16)}`,
    hash,
    miner: `0x${"1".repeat(40)}`,
    timestamp: "0x65000000",
    gasUsed: "0x5208",
    gasLimit: "0x1c9c380",
    baseFeePerGas: "0x3b9aca00",
    transactions: [`0x${"c".repeat(64)}`, `0x${"d".repeat(64)}`],
    ...overrides,
  });
  const outcome = (sourceId, height, hash, overrides = {}) => ({
    sourceId,
    results: new Map([[2, block(height, hash, overrides)]]),
  });

  assert.equal(
    selectMatchingBlockOutcome(
      [outcome("rms", 16, hashA), outcome("cms", 16, hashA)],
      2,
      [16],
    )?.sourceId,
    "cms",
  );
  assert.equal(
    selectMatchingBlockOutcome([outcome("rms", 16, hashA)], 2, [16]),
    null,
  );
  assert.equal(
    selectMatchingBlockOutcome(
      [outcome("rms", 17, hashA), outcome("cms", 16, hashA)],
      2,
      [16],
    ),
    null,
    "a substituted height cannot count toward detail quorum",
  );
  assert.equal(
    selectMatchingBlockOutcome(
      [
        outcome("a", 16, hashA),
        outcome("b", 16, hashA),
        outcome("c", 16, hashB),
        outcome("d", 16, hashB),
      ],
      2,
      [16],
    ),
    null,
    "an equal fork tie fails closed",
  );

  for (const [field, override] of [
    ["miner", { miner: `0x${"2".repeat(40)}` }],
    ["timestamp", { timestamp: "0x65000001" }],
    ["gas used", { gasUsed: "0x5209" }],
    ["gas limit", { gasLimit: "0x1c9c381" }],
    ["base fee", { baseFeePerGas: "0x3b9aca01" }],
    ["ordered transactions", { transactions: [`0x${"d".repeat(64)}`, `0x${"c".repeat(64)}`] }],
  ]) {
    assert.equal(
      selectMatchingBlockOutcome(
        [outcome("rms", 16, hashA), outcome("cms", 16, hashA, override)],
        2,
        [16],
      ),
      null,
      `matching number/hash cannot hide divergent ${field}`,
    );
  }

  const rms = outcome("rms", 16, hashA);
  rms.results.set(0, "0x1");
  rms.results.set(1, false);
  const cms = outcome("cms", 16, hashA);
  cms.results.set(0, "0x2");
  cms.results.set(1, { currentBlock: "0x10" });
  assert.equal(
    selectMatchingBlockOutcome([rms, cms], 2, [16])?.sourceId,
    "cms",
    "gas price and sync status stay outside the block-evidence fingerprint",
  );
});

test("a source claiming a head below the pinned checkpoint cannot vote", async () => {
  const { resolveRpcConsensus, RPC_CONSENSUS_PIN_HEIGHT } =
    await loadConsensus();
  const height = RPC_CONSENSUS_PIN_HEIGHT - 1;
  const hash = `0x${"c".repeat(64)}`;

  assert.equal(
    resolveRpcConsensus([
      candidate({
        sourceId: "canonical",
        operatorId: "blockdag",
        blockHeight: height,
        blockHashes: [{ height, hash }],
      }),
      candidate({
        sourceId: "rms",
        operatorId: "rms",
        blockHeight: height,
        blockHashes: [{ height, hash }],
      }),
    ]),
    null,
  );
});

test("duplicate endpoints from one operator count as one vote", async () => {
  const { resolveRpcConsensus } = await loadConsensus();
  assert.equal(resolveRpcConsensus([
    candidate({ sourceId: "east", operatorId: "bdag-us" }),
    candidate({ sourceId: "west", operatorId: "bdag-us", peerCount: 99 }),
  ]), null);

  const result = resolveRpcConsensus([
    candidate({ sourceId: "west", operatorId: "bdag-us", peerCount: 99 }),
    candidate({ sourceId: "east", operatorId: "bdag-us", peerCount: 11 }),
    candidate({ sourceId: "canonical", operatorId: "blockdag", peerCount: 15 }),
  ]);
  assert.equal(result?.support, 2);
  assert.deepEqual(result?.memberSourceIds, ["canonical", "east"]);
  assert.equal(result?.peerCount, 11);
});

test("the highest exact height and hash with two operators wins", async () => {
  const { resolveRpcConsensus } = await loadConsensus();
  const lowerHash =
    "0x1111111111111111111111111111111111111111111111111111111111111111";
  const higherHash =
    "0x2222222222222222222222222222222222222222222222222222222222222222";
  const result = resolveRpcConsensus([
    candidate({
      sourceId: "canonical",
      operatorId: "blockdag",
      blockHeight: 20_000_002,
      peerCount: 18,
      blockHashes: [
        { height: 20_000_000, hash: lowerHash },
        { height: 20_000_002, hash: higherHash },
      ],
    }),
    candidate({
      sourceId: "dvd",
      operatorId: "dvd",
      blockHeight: 20_000_002,
      peerCount: 10,
      blockHashes: [
        { height: 20_000_000, hash: lowerHash },
        { height: 20_000_002, hash: higherHash },
      ],
    }),
    candidate({
      sourceId: "rms",
      operatorId: "rms",
      blockHeight: 20_000_000,
      peerCount: 7,
      blockHashes: [{ height: 20_000_000, hash: lowerHash }],
    }),
  ]);

  assert.deepEqual(result, {
    chainId: 1404,
    blockHeight: 20_000_002,
    blockHash: higherHash,
    peerCount: 10,
    peerSourceId: "dvd",
    support: 2,
    operatorIds: ["blockdag", "dvd"],
    memberSourceIds: ["canonical", "dvd"],
    representativeSourceId: "canonical",
  });
});

test("a tied fork at the highest eligible height fails closed", async () => {
  const { resolveRpcConsensus } = await loadConsensus();
  const forkA =
    "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
  const forkB =
    "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
  const result = resolveRpcConsensus([
    candidate({ sourceId: "canonical", operatorId: "blockdag", blockHashes: [{ height: 20_000_000, hash: forkA }] }),
    candidate({ sourceId: "dvd", operatorId: "dvd", blockHashes: [{ height: 20_000_000, hash: forkA }] }),
    candidate({ sourceId: "rms", operatorId: "rms", blockHashes: [{ height: 20_000_000, hash: forkB }] }),
    candidate({ sourceId: "cape", operatorId: "capedag", blockHashes: [{ height: 20_000_000, hash: forkB }] }),
  ]);

  assert.equal(result, null);
});

test("no exact two-operator agreement returns no consensus", async () => {
  const { resolveRpcConsensus } = await loadConsensus();
  const result = resolveRpcConsensus([
    candidate({
      sourceId: "canonical",
      operatorId: "blockdag",
      blockHashes: [{ height: 20_000_000, hash: `0x${"1".repeat(64)}` }],
    }),
    candidate({
      sourceId: "dvd",
      operatorId: "dvd",
      blockHashes: [{ height: 20_000_000, hash: `0x${"2".repeat(64)}` }],
    }),
  ]);

  assert.equal(result, null);
});

test("selection is independent of response order", async () => {
  const { resolveRpcConsensus } = await loadConsensus();
  const rows = [
    candidate({ sourceId: "rms", operatorId: "rms", peerCount: 21 }),
    candidate({ sourceId: "canonical", operatorId: "blockdag", peerCount: 9 }),
    candidate({ sourceId: "dvd", operatorId: "dvd", peerCount: 14 }),
  ];

  const forward = resolveRpcConsensus(rows);
  assert.deepEqual(forward, resolveRpcConsensus([...rows].reverse()));
  assert.equal(forward?.peerCount, 14, "three valid peers use the lower median");
  assert.equal(forward?.peerSourceId, "dvd");
});

test("an unsupported optional peer method cannot poison a core-valid source", async () => {
  const { resolveRpcConsensus } = await loadConsensus();
  const result = resolveRpcConsensus([
    candidate({ sourceId: "canonical", operatorId: "blockdag", peerCount: null }),
    candidate({ sourceId: "dvd", operatorId: "dvd", peerCount: 17 }),
  ]);

  assert.equal(result?.blockHeight, 20_000_000);
  assert.equal(result?.peerCount, 17);
  assert.equal(result?.peerSourceId, "dvd");
});

test("an explicitly syncing source cannot vote but unknown syncing may", async () => {
  const { resolveRpcConsensus } = await loadConsensus();
  const result = resolveRpcConsensus([
    candidate({ sourceId: "canonical", operatorId: "blockdag", syncing: true }),
    candidate({ sourceId: "dvd", operatorId: "dvd", syncing: null }),
    candidate({ sourceId: "rms", operatorId: "rms", syncing: false }),
  ]);

  assert.deepEqual(result?.memberSourceIds, ["dvd", "rms"]);
});

test("the automatic source registry is fixed, operator-aware and excludes unsafe nodes", () => {
  assert.ok(existsSync(sourcesUrl), "the fixed RPC source module must exist");
  const source = readFileSync(sourcesUrl, "utf8");

  for (const expected of [
    "https://rpc.blockdag.engineering/",
    "https://rms-bdag-rpc.de/api/rpc-live",
    "https://rpc.cms-mining-pool.net/",
    "https://rpc.dvdmining.com/",
    "https://rpc.east.bdag-us.org/",
    "https://rpc.west.bdag-us.org/",
    "https://rpc.brazil.bdag-us.org/",
    "https://rpc.england.bdag-us.org/",
    "https://rpc.capedag.com/",
    "https://rpc.bdagexplorer.com/",
    "https://rpc.blockdag.solutions/",
  ]) {
    assert.ok(source.includes(expected), `missing fixed source ${expected}`);
  }
  assert.match(source, /id:\s*"bdag-us-east"[\s\S]*?operatorId:\s*"bdag-us"[\s\S]*?rpc\.east\.bdag-us\.org/);
  assert.match(source, /id:\s*"bdag-us-west"[\s\S]*?operatorId:\s*"bdag-us"[\s\S]*?rpc\.west\.bdag-us\.org/);
  assert.match(source, /id:\s*"bdag-us-brazil"[\s\S]*?operatorId:\s*"bdag-us"[\s\S]*?rpc\.brazil\.bdag-us\.org/);
  assert.match(source, /id:\s*"bdag-us-england"[\s\S]*?operatorId:\s*"bdag-us"[\s\S]*?rpc\.england\.bdag-us\.org/);
  for (const automaticId of [
    "canonical-rpc",
    "rms",
    "cms",
    "bdag-us-east",
    "bdagexplorer",
    "blockdag-solutions",
  ]) {
    assert.match(
      source,
      new RegExp(`id:\\s*"${automaticId}"[^}]*automatic:\\s*true`),
    );
  }
  for (const manualId of [
    "dvdmining",
    "bdag-us-west",
    "bdag-us-brazil",
    "bdag-us-england",
    "capedag",
    "welshdag",
  ]) {
    assert.match(
      source,
      new RegExp(`id:\\s*"${manualId}"[^}]*automatic:\\s*false`),
    );
  }
  assert.match(source, /rpc\.welshdag\.trade[\s\S]*?automatic:\s*false/);
  assert.doesNotMatch(source, /rpc\.bdagscan\.com|rpc\.blockdag\.works/);
  assert.doesNotMatch(source, /process\.env|EXPLORER_PROXY_BASE|RPC_URL/);
});

test("homepage stats can resolve an independent community quorum during a primary outage", async () => {
  const localImports = new Map([
    ["server-only", "data:text/javascript,export%20%7B%7D"],
    ["@/lib/chain/rpc-consensus", consensusUrl.href],
    ["@/lib/chain/rpc-batching", batchingUrl.href],
  ]);
  const hooks = registerHooks({
    resolve(specifier, context, nextResolve) {
      const url = context.parentURL === sourcesUrl.href && localImports.get(specifier);
      return url ? { url, shortCircuit: true } : nextResolve(specifier, context);
    },
  });
  let prober;
  try {
    prober = await import(sourcesUrl.href);
  } finally {
    hooks.deregister();
  }

  const head = 28_994_000;
  const headHash = `0x${"c".repeat(64)}`;
  const peers = new Map([
    ["rpc.east.bdag-us.org", "0x16"],
    ["rpc.bdagexplorer.com", "0x17"],
    ["rpc.blockdag.solutions", "0x18"],
  ]);
  const hex = (value) => `0x${value.toString(16)}`;
  const fetchRpc = async (url, options) => {
    const host = new URL(url).hostname;
    if (!peers.has(host)) throw new Error("RPC unavailable");
    const results = {
      eth_chainId: "0x57c",
      eth_blockNumber: hex(head),
      eth_syncing: false,
      net_peerCount: peers.get(host),
    };
    const replies = JSON.parse(options.body).map(({ id, method, params }) => ({
      jsonrpc: "2.0",
      id,
      result: method === "eth_getBlockByNumber"
        ? { number: params[0], hash: params[0] === hex(18_400_000) ? PINNED_HASH : headHash }
        : results[method],
    }));
    return Response.json(replies);
  };
  const { consensus } = await prober.probeAutomaticRpcSources(fetchRpc);
  assert.equal(consensus?.blockHeight, head);
  assert.equal(consensus.blockHash, headHash);
  assert.equal(consensus.support, 3);
  assert.equal(consensus.peerCount, 23);
  assert.deepEqual(consensus.memberSourceIds, [
    "bdag-us-east",
    "bdagexplorer",
    "blockdag-solutions",
  ]);
});

test("the prober isolates core liveness from optional peer and sync methods", () => {
  assert.ok(existsSync(sourcesUrl), "the fixed RPC source module must exist");
  const source = readFileSync(sourcesUrl, "utf8");

  assert.match(source, /probeCore/);
  assert.match(source, /probeOptional/);
  assert.match(source, /Promise\.allSettled/);
  assert.match(source, /MAX_RESPONSE_BYTES/);
  assert.match(source, /AbortSignal\.timeout/);
  assert.match(source, /probeAutomaticRpcSources/);
  assert.match(source, /rpcBatchOutcomesFromConsensus/);
  assert.match(source, /rpcBatchFromConsensus/);
  assert.match(source, /rpcBlockHashFromConsensusAt/);
  assert.match(
    source,
    /matchingHashes[\s\S]*count\s*<\s*2[\s\S]*return null/,
    "an explorer proof needs matching block hashes from two quorum members",
  );
  assert.match(source, /PROBE_CACHE_TTL_MS\s*=\s*20_000/);
  assert.match(source, /cachedProbe/);
  assert.match(source, /probeInflight/);
});

test("a logical detail request respects the audited 50-call upstream ceiling", async () => {
  const {
    RPC_UPSTREAM_BATCH_LIMIT,
    partitionRpcBatch,
    mergeRpcBatchChunk,
    executeRpcBatchChunks,
  } = await loadBatching();
  const calls = Array.from({ length: 56 }, (_, id) => ({ id }));
  const chunks = partitionRpcBatch(calls);

  assert.equal(RPC_UPSTREAM_BATCH_LIMIT, 50);
  assert.deepEqual(
    chunks.map((chunk) => ({ offset: chunk.offset, length: chunk.calls.length })),
    [
      { offset: 0, length: 50 },
      { offset: 50, length: 6 },
    ],
  );
  assert.deepEqual(chunks.flatMap((chunk) => chunk.calls), calls);

  const merged = new Map();
  mergeRpcBatchChunk(
    merged,
    chunks[0],
    new Map(chunks[0].calls.map((call, id) => [id, `result-${call.id}`])),
  );
  mergeRpcBatchChunk(
    merged,
    chunks[1],
    new Map(chunks[1].calls.map((call, id) => [id, `result-${call.id}`])),
  );
  assert.equal(merged.size, 56);
  assert.equal(merged.get(0), "result-0");
  assert.equal(merged.get(50), "result-50");
  assert.equal(merged.get(55), "result-55");

  const emitted = [];
  const executed = await executeRpcBatchChunks(calls, async (chunkCalls) => {
    emitted.push(chunkCalls.length);
    return new Map(
      chunkCalls.map((call, id) => [id, `executed-${call.id}`]),
    );
  });
  assert.deepEqual(emitted, [50, 6]);
  assert.equal(executed.get(0), "executed-0");
  assert.equal(executed.get(49), "executed-49");
  assert.equal(executed.get(50), "executed-50");
  assert.equal(executed.get(55), "executed-55");

  let attempts = 0;
  await assert.rejects(
    executeRpcBatchChunks(calls, async (chunkCalls) => {
      attempts += 1;
      if (attempts === 2) throw new Error("second chunk failed");
      return new Map(chunkCalls.map((call, id) => [id, call.id]));
    }),
    /second chunk failed/,
  );
  assert.equal(attempts, 2, "a failed chunk rejects the whole source outcome");
});

test("a failed baseline retains only that span's last verified reading", async () => {
  const { retainVerifiedBaselines } = await loadDetailState();
  assert.deepEqual(
    retainVerifiedBaselines([10, 100, 1_000], [11, null, 1_001]),
    [11, 100, 1_001],
  );
});

test("an older-page failure cannot erase the verified newest block page", async () => {
  const { mergeVerifiedBlockPages } = await loadDetailState();
  const newest = {
    items: Array.from({ length: 50 }, (_, index) => ({ height: 200 - index })),
  };
  const older = {
    items: Array.from({ length: 50 }, (_, index) => ({ height: 150 - index })),
  };

  assert.deepEqual(mergeVerifiedBlockPages(newest, null), newest);
  assert.equal(mergeVerifiedBlockPages(newest, older)?.items.length, 100);
  assert.deepEqual(
    mergeVerifiedBlockPages(newest, { items: [{ height: 149 }] }),
    newest,
    "a non-contiguous older page is ignored instead of contaminating the window",
  );
  assert.equal(mergeVerifiedBlockPages(null, older), null);
});

test("recent blocks, baselines, and optional metadata fail independently", () => {
  const source = readFileSync(sourcesUrl, "utf8");
  const stats = readFileSync(
    new URL("../src/lib/chain/stats.ts", import.meta.url),
    "utf8",
  );

  assert.match(source, /executeRpcBatchChunks/);
  assert.match(stats, /const primaryRecentCalls/);
  assert.match(stats, /const extensionRecentCalls/);
  assert.match(stats, /const baselineCalls/);
  assert.match(stats, /const optionalCalls/);
  assert.match(
    stats,
    /matchingBlockOutcomes\(\s*primaryRecentOutcomes,\s*0,\s*primaryRecentHeights,?\s*\)/,
  );
  assert.match(
    stats,
    /matchingBlockOutcomes\(\s*extensionRecentOutcomes,\s*0,\s*extensionRecentHeights,?\s*\)/,
  );
  assert.match(
    stats,
    /matchingBlockOutcomes\(outcomes, 0, \[baselineHeight\]\)/,
  );
  assert.match(
    stats,
    /optionalCalls[\s\S]*method: "eth_syncing"[\s\S]*method: "eth_gasPrice"/,
    "the required result at id 0 must not be optional gas-price data",
  );
});
