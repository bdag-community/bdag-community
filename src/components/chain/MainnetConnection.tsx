"use client";

import { ArrowUpRight } from "lucide-react";
import { useNodeStatus } from "@/components/chain/NodeStatusProvider";
import { CopyRef } from "@/components/ui/CopyRef";
import { CopySnippet } from "@/components/community/CopySnippet";
import { walletConfig } from "@/lib/chain/mainnet-endpoints";

const loading = "Checking public RPCs…";
const unavailable = "No verified public RPC available";

export function MainnetRpcReference({
  format,
  className,
}: {
  format: "host" | "copy" | "link";
  className?: string;
}) {
  const { rpcUrls } = useNodeStatus();
  const rpcUrl = rpcUrls?.[0];
  if (!rpcUrl) return <span className={className}>{rpcUrls ? unavailable : loading}</span>;

  if (format === "copy") return <CopyRef value={rpcUrl} label="RPC URL" />;

  const host = new URL(rpcUrl).host;
  if (format === "host") return <span className={className}>{host}</span>;

  return (
    <a href={rpcUrl} target="_blank" rel="noopener noreferrer" className={className}>
      {host}
      <ArrowUpRight className="size-3.5" strokeWidth={1.75} aria-hidden />
    </a>
  );
}

export function MainnetWalletConfig() {
  const { rpcUrls } = useNodeStatus();
  if (!rpcUrls?.length) {
    return <p className="caption">{rpcUrls ? unavailable : loading}</p>;
  }
  return <CopySnippet value={walletConfig(rpcUrls)} label="wallet config" />;
}
