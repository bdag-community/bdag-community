import assert from "node:assert/strict";
import test from "node:test";
import {
  MAINNET_EXPLORER_URL,
  verifiedMainnetRpcUrls,
  walletConfig,
  walletRpcMatchesCheckpoint,
} from "../src/lib/chain/mainnet-endpoints.ts";
import { RPC_CONSENSUS_PIN_HASH } from "../src/lib/chain/rpc-consensus.ts";

const checkedAt = "2026-11-23T09:25:00Z";
const now = Date.parse(checkedAt);
const referenceHeight = 29_802_500;
const definitions = [
  { id: "england", host: "rpc.england.bdag-us.org", probePath: "/", role: "community" },
  { id: "explorer", host: "rpc.bdagexplorer.com", probePath: "/", role: "community" },
  { id: "cape", host: "rpc.capedag.com", probePath: "/", role: "community" },
  { id: "unexpected", host: "rpc.bdagscan.com", probePath: "/", role: "community" },
];

function snapshot(overrides = {}) {
  return {
    checkedAt,
    walletRpcUrls: definitions
      .filter(({ id }) => !overrides[id])
      .map(({ host }) => `https://${host}/`),
  };
}

test("wallet RPCs follow the vetted priority and switch when the primary fails", () => {
  const urls = verifiedMainnetRpcUrls(snapshot(), now);
  assert.deepEqual(urls, [
    "https://rpc.capedag.com/",
    "https://rpc.bdagexplorer.com/",
    "https://rpc.england.bdag-us.org/",
  ]);
  const fallback = verifiedMainnetRpcUrls(snapshot({ cape: true }), now);
  assert.deepEqual(fallback, urls.slice(1));
  assert.deepEqual(verifiedMainnetRpcUrls(snapshot({ cape: true, explorer: true }), now), urls.slice(2));
  const config = JSON.parse(walletConfig(fallback));
  assert.equal(config.chainId, "0x57c");
  assert.deepEqual(config.rpcUrls, fallback);
  assert.deepEqual(config.blockExplorerUrls, [MAINNET_EXPLORER_URL]);
  assert.equal(MAINNET_EXPLORER_URL, "https://explorer.bdagexplorer.com/");
});

test("client ignores expired checks and never offers unlisted addresses", () => {
  assert.deepEqual(verifiedMainnetRpcUrls(snapshot({ cape: true, explorer: true, england: true }), now), []);
  assert.deepEqual(verifiedMainnetRpcUrls(snapshot(), now + 5 * 60_000), []);
  assert.deepEqual(verifiedMainnetRpcUrls(snapshot(), now - 5 * 60_000), []);
  assert.deepEqual(verifiedMainnetRpcUrls({ checkedAt }, now), []);
});

test("server requires the Mainnet pin and a recent matching quorum checkpoint", () => {
  const checkpointHash = "0xa8a33d4640c09330224eaa99ca67b944a6d9b915dd7d49df9fcfa2c7c3580cb0";
  const checkpoint = { blockHeight: referenceHeight, blockHash: checkpointHash };
  const proof = {
    chainId: 1404,
    headHeight: referenceHeight + 5,
    pinHash: RPC_CONSENSUS_PIN_HASH,
    checkpointHash,
    checkpointTime: now / 1000 - 20,
  };
  assert.equal(walletRpcMatchesCheckpoint(proof, checkpoint, now), true);
  for (const invalid of [
    { chainId: 1043 },
    { headHeight: referenceHeight - 1 },
    { headHeight: referenceHeight + 1000 },
    { pinHash: "0xdead" },
    { checkpointHash: "0xdead" },
    { checkpointTime: now / 1000 - 500 },
  ]) {
    assert.equal(walletRpcMatchesCheckpoint({ ...proof, ...invalid }, checkpoint, now), false);
  }
  assert.equal(walletRpcMatchesCheckpoint(proof, null, now), false);
});
