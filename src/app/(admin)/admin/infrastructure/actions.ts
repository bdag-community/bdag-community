"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/dal/session";
import { getServerSupabase } from "@/lib/supabase/server";

export type InfrastructureActionResult = { ok: true } | { ok: false; error: string };

const fields = z.object({
  id: z.string().max(120).optional(),
  kind: z.enum(["rpc", "explorer", "pool"]),
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500),
  url: z.string().trim().max(500),
  poolEndpoint: z.string().trim().max(200),
  role: z.enum(["community", "flagged", "legacy"]),
  responseTimeLabel: z.string().trim().max(40),
  displayOrder: z.coerce.number().int().min(0).max(100000),
  miningOrder: z.union([z.literal(""), z.coerce.number().int().min(0).max(100000)]),
});

function httpsUrl(input: string): URL | null {
  try {
    const url = new URL(input);
    if (url.protocol !== "https:" || url.username || url.password || url.port || url.hash || url.search) return null;
    if (!/^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/i.test(url.hostname)) return null;
    if (/(^|\.)(localhost|local|internal|test|invalid)$/.test(url.hostname)) return null;
    return url;
  } catch { return null; }
}

function refresh() {
  for (const path of ["/admin", "/admin/infrastructure", "/admin/activity", "/community", "/mining", "/chain", "/api/nodes"]) revalidatePath(path);
}

export async function saveInfrastructureAction(form: FormData): Promise<InfrastructureActionResult> {
  await requireAdmin();
  const parsed = fields.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { ok: false, error: "Check the fields and try again." };
  const v = parsed.data;
  const supabase = await getServerSupabase();
  let existing: { id: string; kind: string; rpc_role: string | null } | null = null;
  if (v.id) {
    const { data, error } = await supabase.from("infrastructure_resources").select("id,kind,rpc_role").eq("id", v.id).maybeSingle();
    if (error || !data) return { ok: false, error: "This resource no longer exists." };
    existing = data;
    if (existing.kind !== v.kind) return { ok: false, error: "The resource type cannot be changed." };
  }

  const common = { name: v.name, description: v.description, display_order: v.displayOrder, updated_at: new Date().toISOString() };
  let details: Record<string, string | number | null>;
  if (v.kind === "rpc") {
    const url = httpsUrl(v.url);
    if (!url || url.pathname.length > 120 || !/^\/[a-zA-Z0-9/_-]*$/.test(url.pathname)) return { ok: false, error: "Enter a public HTTPS RPC URL without credentials, port, query or fragment." };
    if (existing?.rpc_role === "canonical" && (url.hostname !== "rpc.blockdag.engineering" || url.pathname !== "/")) return { ok: false, error: "The canonical RPC endpoint is fixed." };
    details = {
      url: null, pool_endpoint: null, mining_order: null,
      rpc_host: url.hostname, rpc_path: url.pathname,
      rpc_role: existing?.rpc_role === "canonical" ? "canonical" : v.role,
      response_time_label: v.responseTimeLabel || null,
    };
  } else if (v.kind === "explorer") {
    if (!httpsUrl(v.url)) return { ok: false, error: "Enter a public HTTPS explorer URL." };
    details = { url: v.url, pool_endpoint: null, mining_order: null, rpc_host: null, rpc_path: null, rpc_role: null, response_time_label: null };
  } else {
    if (v.url && !httpsUrl(v.url)) return { ok: false, error: "Enter a public HTTPS pool website URL." };
    if (v.poolEndpoint && !/^stratum\+tcp:\/\/[a-z0-9][a-z0-9.-]*\.[a-z]{2,}:[0-9]{2,5}$/i.test(v.poolEndpoint)) return { ok: false, error: "Enter a stratum+tcp://host:port endpoint." };
    if (!v.url && !v.poolEndpoint) return { ok: false, error: "Add a website or a miner endpoint." };
    details = { url: v.url || null, pool_endpoint: v.poolEndpoint || null, mining_order: v.miningOrder === "" ? null : v.miningOrder, rpc_host: null, rpc_path: null, rpc_role: null, response_time_label: null };
  }

  const payload = { ...common, ...details };
  const { error } = existing
    ? await supabase.from("infrastructure_resources").update(payload).eq("id", existing.id)
    : await supabase.from("infrastructure_resources").insert({ ...payload, id: crypto.randomUUID(), kind: v.kind });
  if (error) return { ok: false, error: error.code === "23505" ? "That URL or endpoint is already listed." : "Could not save the resource. Try again." };
  refresh();
  return { ok: true };
}

export async function deleteInfrastructureAction(id: string): Promise<{ ok: false; error: string } | void> {
  await requireAdmin();
  const parsed = z.string().uuid().safeParse(id);
  // Seed IDs are descriptive rather than UUIDs; validate as safe identifiers.
  if (!parsed.success && !/^[a-z0-9-]{2,120}$/.test(id)) return { ok: false, error: "Invalid resource ID." };
  if (id === "canonical-rpc") return { ok: false, error: "The canonical RPC cannot be removed." };
  const supabase = await getServerSupabase();
  const { error } = await supabase.from("infrastructure_resources").delete().eq("id", id);
  if (error) return { ok: false, error: "Could not remove the resource. Try again." };
  refresh();
}
