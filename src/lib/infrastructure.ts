import "server-only";

import { COMMUNITY_PAGE, MINING_PAGE, NODES, type NodeDef } from "@/lib/content/site";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import { getPublicSupabase } from "@/lib/supabase/public";

export type InfrastructureResource = {
  id: string;
  kind: "rpc" | "explorer" | "pool";
  name: string;
  description: string;
  url: string | null;
  pool_endpoint: string | null;
  mining_order: number | null;
  rpc_host: string | null;
  rpc_path: string | null;
  rpc_role: NodeDef["role"] | null;
  response_time_label: string | null;
  display_order: number;
};

export type InfrastructureDirectory = {
  rpcs: NodeDef[];
  explorers: { name: string; url: string }[];
  communityPools: { name: string; url: string }[];
  miningPools: { name: string; endpoint: string }[];
};

export function directoryFromRows(rows: InfrastructureResource[]): InfrastructureDirectory {
  const ordered = [...rows].sort((a, b) => a.display_order - b.display_order || a.id.localeCompare(b.id));
  const pools = ordered.filter((row) => row.kind === "pool");
  return {
    rpcs: ordered.filter((row) => row.kind === "rpc").map((row) => ({
      id: row.id,
      name: row.name,
      host: row.rpc_host!,
      probePath: row.rpc_path!,
      role: row.rpc_role!,
      ...(row.response_time_label ? { responseTimeLabel: row.response_time_label } : {}),
      blurb: row.description,
    })),
    explorers: ordered.filter((row) => row.kind === "explorer" && row.url).map((row) => ({ name: row.name, url: row.url! })),
    communityPools: pools.filter((row) => row.url).map((row) => ({ name: row.name, url: row.url! })),
    miningPools: pools.filter((row) => row.pool_endpoint).sort((a, b) => (a.mining_order ?? 100000) - (b.mining_order ?? 100000) || a.id.localeCompare(b.id)).map((row) => ({ name: row.name, endpoint: row.pool_endpoint! })),
  };
}

export async function getInfrastructureDirectory(): Promise<InfrastructureDirectory> {
  // Fresh clones without Supabase retain the exact editorial seed. A configured
  // database is authoritative: an empty or failed query must not resurrect a
  // resource an admin deliberately removed.
  if (!hasSupabaseEnv()) return {
    rpcs: [...NODES],
    explorers: [...COMMUNITY_PAGE.explorers.items],
    communityPools: [...COMMUNITY_PAGE.publicMining.items],
    miningPools: [...MINING_PAGE.publicPools.items],
  };
  const { data, error } = await getPublicSupabase().from("infrastructure_resources")
    .select("id,kind,name,description,url,pool_endpoint,mining_order,rpc_host,rpc_path,rpc_role,response_time_label,display_order")
    .order("display_order", { ascending: true }).limit(200);
  if (error) throw new Error(`Infrastructure directory unavailable: ${error.message}`);
  return directoryFromRows(data as InfrastructureResource[]);
}
