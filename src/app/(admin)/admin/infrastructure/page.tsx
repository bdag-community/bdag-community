import type { Metadata } from "next";
import { requireAdmin } from "@/lib/dal/session";
import { getServerSupabase } from "@/lib/supabase/server";
import type { InfrastructureResource } from "@/lib/infrastructure";
import { ResourceEditor } from "./ResourceEditor";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Infrastructure · Admin", robots: { index: false, follow: false } };

const sections = [
  { kind: "rpc", title: "Public RPCs", note: "These power the live status boards. The canonical RPC is fixed; flagged and legacy endpoints remain visible with their warning state." },
  { kind: "explorer", title: "Explorers", note: "Website links shown on the Community page." },
  { kind: "pool", title: "Mining pools", note: "A website appears on Community; a miner endpoint appears on Mining. A pool can have either or both." },
] as const;

export default async function AdminInfrastructurePage() {
  await requireAdmin();
  const supabase = await getServerSupabase();
  const { data, error } = await supabase.from("infrastructure_resources").select("id,kind,name,description,url,pool_endpoint,mining_order,rpc_host,rpc_path,rpc_role,response_time_label,display_order").order("display_order");
  if (error) throw new Error("Could not load infrastructure resources.");
  const rows = data as InfrastructureResource[];
  return <div className="space-y-10">
    <header className="space-y-2"><h1 className="h3 text-on-surface">Community-run infrastructure</h1><p className="text-sm text-on-surface-variant">Manage the public RPC board, explorer links and mining services from one place. Changes are recorded in Activity.</p></header>
    {sections.map(({ kind, title, note }) => {
      const resources = rows.filter((row) => row.kind === kind);
      const nextOrder = Math.max(0, ...resources.map((row) => row.display_order)) + 10;
      return <section key={kind} aria-labelledby={`${kind}-heading`} className="space-y-4"><div><h2 id={`${kind}-heading`} className="h4 text-on-surface">{title}</h2><p className="mt-1 text-sm text-on-surface-variant">{note}</p></div><div className="grid gap-4 xl:grid-cols-2">{resources.map((row) => <ResourceEditor key={row.id} kind={kind} resource={row} nextOrder={nextOrder} />)}<ResourceEditor kind={kind} nextOrder={nextOrder} /></div></section>;
    })}
  </div>;
}
