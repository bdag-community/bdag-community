import { NODES_POLL_MS } from "./cadence.ts";
import { RPC_CONSENSUS_PIN_HASH, type RpcConsensusResult } from "./rpc-consensus.ts";
import { CHAIN } from "../content/site.ts";

// Temporary public defaults while the BlockDAG Engineering endpoints are down.
export const MAINNET_EXPLORER_URL = "https://explorer.bdagexplorer.com/";

export const MAINNET_RPC_PRIORITY = [
  "https://rpc.capedag.com/",
  "https://rpc.bdagexplorer.com/",
  "https://rpc.england.bdag-us.org/",
] as const;
const MAX_SNAPSHOT_AGE_MS = 3 * NODES_POLL_MS;
const MAX_HEAD_DISTANCE = 64;
const MAX_CHECKPOINT_AGE_SECONDS = 120;
const MAX_CLOCK_SKEW_SECONDS = 30;

export function verifiedMainnetRpcUrls(
  snapshot: { checkedAt: string; walletRpcUrls?: readonly string[] },
  now: number,
): string[] {
  const age = now - Date.parse(snapshot.checkedAt);
  const urls = snapshot.walletRpcUrls;
  if (!Array.isArray(urls) || !Number.isFinite(age) || age > MAX_SNAPSHOT_AGE_MS ||
      age < -MAX_CLOCK_SKEW_SECONDS * 1000) return [];
  return MAINNET_RPC_PRIORITY.filter((url) => urls.includes(url));
}

export function walletRpcMatchesCheckpoint(
  probe: {
    chainId: number | null;
    headHeight: number | null;
    pinHash: string | null;
    checkpointHash: string | null;
    checkpointTime: number | null;
  },
  checkpoint: Pick<RpcConsensusResult, "blockHeight" | "blockHash"> | null,
  now: number,
): boolean {
  if (!checkpoint || probe.headHeight === null || probe.checkpointTime === null) return false;
  const age = now / 1000 - probe.checkpointTime;
  return probe.chainId === CHAIN.chainId &&
    probe.headHeight >= checkpoint.blockHeight &&
    probe.headHeight - checkpoint.blockHeight <= MAX_HEAD_DISTANCE &&
    probe.pinHash === RPC_CONSENSUS_PIN_HASH &&
    probe.checkpointHash === checkpoint.blockHash &&
    age >= -MAX_CLOCK_SKEW_SECONDS && age <= MAX_CHECKPOINT_AGE_SECONDS;
}

export function walletConfig(rpcUrls: readonly string[]): string {
  return JSON.stringify({
    chainId: CHAIN.chainIdHex,
    chainName: CHAIN.name,
    rpcUrls,
    nativeCurrency: {
      name: CHAIN.currency.symbol,
      symbol: CHAIN.currency.symbol,
      decimals: CHAIN.currency.decimals,
    },
    blockExplorerUrls: [MAINNET_EXPLORER_URL],
  }, null, 2);
}
