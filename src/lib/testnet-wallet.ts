import type { TESTNET } from "./content/site";

type Provider = { request: (args: { method: string; params: unknown[] }) => Promise<unknown> };
type Network = typeof TESTNET.network;

/** Network metadata only: no account access, signing, transfers or explorer guess. */
export async function requestTestnetNetwork(provider: Provider | undefined, network: Network) {
  if (!provider || typeof provider.request !== "function") {
    throw new Error("Open this page in MetaMask’s browser or a browser with the MetaMask extension, or use the manual details below.");
  }
  try {
    await provider.request({
      method: "wallet_addEthereumChain",
      params: [{ chainId: network.chainIdHex, chainName: network.name, nativeCurrency: network.currency, rpcUrls: [network.rpcUrl, network.fallbackRpcUrl] }],
    });
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? error.code : undefined;
    if (code === 4001) throw new Error("Request cancelled. You can add the network again whenever you’re ready.");
    if (code === -32002) throw new Error("A wallet request is already open. Complete or dismiss it before trying again.");
    throw new Error("Your wallet could not add the network. Try the manual details below, including the alternative RPC.");
  }
}
