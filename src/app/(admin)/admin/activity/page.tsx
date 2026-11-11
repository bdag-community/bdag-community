import type { Metadata } from "next";
import { requireAdmin } from "@/lib/dal/session";
import { getServerSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Activity · Admin", robots: { index: false, follow: false } };
const actionLabel: Record<string, string> = { insert: "added", update: "updated", edit: "edited", delete: "removed", approve: "approved", reject: "rejected", publish: "published", unpublish: "unpublished" };

export default async function AdminActivityPage() {
  await requireAdmin();
  const supabase = await getServerSupabase();
  const { data, error } = await supabase.from("admin_activity").select("id,actor_email,action,entity_type,entity_label,occurred_at").order("occurred_at", { ascending: false }).limit(100);
  if (error) throw new Error("Could not load admin activity.");
  return <div className="max-w-4xl space-y-6"><header className="space-y-1"><h1 className="h3 text-on-surface">Admin activity</h1><p className="text-sm text-on-surface-variant">Recent changes by signed-in admins, newest first. Tracking begins when this feature is installed; it does not reconstruct earlier actions.</p></header><ol className="divide-y divide-border rounded-xl border border-border">{data?.map((item) => <li key={item.id} className="grid gap-1 px-5 py-4 sm:grid-cols-[minmax(0,1fr)_auto]"><p className="min-w-0 break-words text-sm text-on-surface"><span className="font-medium">{item.actor_email}</span> {actionLabel[item.action] ?? item.action} <span className="font-medium">{item.entity_label}</span> <span className="text-on-surface-variant">({item.entity_type.replaceAll("_", " ")})</span></p><time dateTime={item.occurred_at} className="font-mono text-xs text-on-surface-variant">{new Date(item.occurred_at).toISOString().slice(0, 16).replace("T", " ")} UTC</time></li>)}</ol>{!data?.length ? <p className="text-sm text-on-surface-variant">No admin changes recorded yet.</p> : null}{data?.length === 100 ? <p className="text-xs text-on-surface-variant">Showing the latest 100 actions.</p> : null}</div>;
}
