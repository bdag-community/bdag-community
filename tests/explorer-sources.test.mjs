import { existsSync, readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { test } from "node:test";

const sourceUrl = new URL(
  "../src/lib/chain/explorer-sources.server.ts",
  import.meta.url,
);

test("automatic explorer fallback is fixed, bounded, and chain verified", () => {
  assert.ok(existsSync(sourceUrl));
  const source = readFileSync(sourceUrl, "utf8");

  assert.match(source, /https:\/\/explorer\.blockdag\.engineering/);
  assert.match(source, /https:\/\/explorer\.welshdag\.trade/);
  assert.doesNotMatch(source, /process\.env|request\.url|searchParams/);
  assert.match(source, /\/api\/v2\/stats/);
  assert.match(source, /\/api\/v1\?module=stats&action=coinsupply/);
  assert.match(source, /\/api\/v2\/main-page\/indexing-status/);
  assert.match(source, /\/api\/v2\/blocks\/\$\{verificationHeight\}/);
  assert.match(source, /rpcBlockHashFromConsensusAt/);
  assert.match(source, /EXPLORER_CONFIRMATION_MARGIN\s*=\s*64/);
  assert.match(source, /consensus\.blockHeight\s*-\s*EXPLORER_CONFIRMATION_MARGIN/);
  assert.match(source, /buildBlockscoutObservation/);
  assert.match(source, /selectExplorerReport/);
  assert.match(source, /redirect:\s*"error"/);
  assert.match(source, /MAX_RESPONSE_BYTES/);
  assert.match(source, /EXPLORER_REFRESH_MS\s*=\s*5\s*\*\s*60\s*\*\s*1_000/);
  assert.match(source, /consensusCacheKey/);
  assert.match(source, /cached\.consensusKey === consensusKey/);
  assert.match(source, /inflight\.consensusKey !== consensusKey/);
});

test("one coherent explorer is selected rather than mixing fields", () => {
  const source = readFileSync(sourceUrl, "utf8");
  assert.match(source, /Promise\.all\(AUTOMATIC_EXPLORER_SOURCES\.map/);
  assert.match(source, /report:\s*selectExplorerReport\(observations, consensus\.blockHeight\)/);
  assert.doesNotMatch(source, /Math\.max\([^)]*totalTransactions/);
});
