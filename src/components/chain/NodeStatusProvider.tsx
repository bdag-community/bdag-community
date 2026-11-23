"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { NODES_POLL_MS } from "@/lib/chain/cadence";
import { verifiedMainnetRpcUrls } from "@/lib/chain/mainnet-endpoints";
import type { NodesSnapshot } from "@/lib/chain/nodes";

type NodeMonitor = {
  snapshot: NodesSnapshot | null;
  panelState: "checking" | "live" | "stale" | "unavailable";
  rpcUrls: string[] | null;
};

const INITIAL_MONITOR: NodeMonitor = { snapshot: null, panelState: "checking", rpcUrls: null };
const NodeStatusContext = createContext<NodeMonitor>(INITIAL_MONITOR);

export function NodeStatusProvider({ children }: { children: ReactNode }) {
  const [monitor, setMonitor] = useState(INITIAL_MONITOR);

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;
    let cancelled = false;
    let loading = false;
    let lastLoadAt = 0;

    async function load() {
      const startedAt = Date.now();
      if (loading || startedAt - lastLoadAt < 2_000) return;
      lastLoadAt = startedAt;
      loading = true;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 35_000);
      setMonitor((current) => {
        if (!current.snapshot || !current.rpcUrls?.length ||
            verifiedMainnetRpcUrls(current.snapshot, startedAt).length) return current;
        return { ...current, panelState: "stale", rpcUrls: [] };
      });

      try {
        const response = await fetch("/api/nodes", {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(String(response.status));
        const snapshot: NodesSnapshot = await response.json();
        if (!snapshot || !Array.isArray(snapshot.nodes) || !Array.isArray(snapshot.definitions)) {
          throw new Error("Invalid node snapshot");
        }
        const rpcUrls = verifiedMainnetRpcUrls(snapshot, Date.now());
        if (!cancelled) setMonitor({ snapshot, panelState: "live", rpcUrls });
      } catch {
        if (!cancelled) {
          setMonitor((current) => ({
            snapshot: current.snapshot,
            panelState: current.snapshot ? "stale" : "unavailable",
            rpcUrls: [],
          }));
        }
      } finally {
        clearTimeout(timeout);
        loading = false;
      }
    }

    function syncVisibility() {
      if (document.hidden) {
        if (timer !== null) clearInterval(timer);
        timer = null;
        return;
      }
      void load();
      timer ??= setInterval(load, NODES_POLL_MS);
    }

    syncVisibility();
    document.addEventListener("visibilitychange", syncVisibility);
    return () => {
      cancelled = true;
      if (timer !== null) clearInterval(timer);
      document.removeEventListener("visibilitychange", syncVisibility);
    };
  }, []);

  return <NodeStatusContext.Provider value={monitor}>{children}</NodeStatusContext.Provider>;
}

export function useNodeStatus() {
  return useContext(NodeStatusContext);
}
