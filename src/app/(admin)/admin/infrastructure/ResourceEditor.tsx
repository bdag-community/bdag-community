"use client";

import { useState, useTransition } from "react";
import { ConfirmDeleteButton } from "@/components/admin/ConfirmDeleteButton";
import { Input, Textarea } from "@/components/ui/Input";
import type { InfrastructureResource } from "@/lib/infrastructure";
import { deleteInfrastructureAction, saveInfrastructureAction } from "./actions";

const labelClass = "flex flex-col gap-1.5 text-xs font-medium text-on-surface-variant";

export function ResourceEditor({ kind, resource, nextOrder }: { kind: InfrastructureResource["kind"]; resource?: InfrastructureResource; nextOrder: number }) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const canonical = resource?.id === "canonical-rpc";
  return (
    <form className="space-y-4 rounded-xl border border-border bg-elevated/40 p-5" onSubmit={(event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const data = new FormData(form);
      setMessage(null);
      startTransition(async () => {
        const result = await saveInfrastructureAction(data);
        setMessage(result.ok ? "Saved." : result.error);
        if (result.ok && !resource) form.reset();
      });
    }}>
      <input type="hidden" name="kind" value={kind} />
      {resource ? <input type="hidden" name="id" value={resource.id} /> : null}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h3 className="text-base font-semibold text-on-surface">{resource?.name ?? `Add ${kind}`}</h3>
        {resource && !canonical ? <ConfirmDeleteButton id={resource.id} action={deleteInfrastructureAction} confirmPrompt={`Remove ${resource.name} from public pages?`} /> : null}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className={labelClass}>Name<Input name="name" required maxLength={120} defaultValue={resource?.name ?? ""} /></label>
        <label className={labelClass}>Display order<Input name="displayOrder" type="number" min={0} max={100000} required defaultValue={resource?.display_order ?? nextOrder} /></label>
        <label className={`${labelClass} sm:col-span-2`}>Description<Textarea name="description" rows={2} maxLength={500} defaultValue={resource?.description ?? ""} /></label>
        {kind === "rpc" ? <>
          <label className={`${labelClass} sm:col-span-2`}>RPC URL (HTTPS)<Input name="url" required mono readOnly={canonical} defaultValue={resource ? `https://${resource.rpc_host}${resource.rpc_path}` : ""} placeholder="https://rpc.example.org/" /></label>
          <label className={labelClass}>Status category<select name="role" defaultValue={canonical ? "community" : resource?.rpc_role ?? "community"} disabled={canonical} className="min-h-11 rounded border border-outline bg-base-void px-3 text-on-surface"><option value="community">Community</option><option value="flagged">Flagged</option><option value="legacy">Legacy</option></select>{canonical ? <input type="hidden" name="role" value="community" /> : null}</label>
          <label className={labelClass}>Response-time badge<Input name="responseTimeLabel" maxLength={40} defaultValue={resource?.response_time_label ?? ""} placeholder="Optional" /></label>
        </> : <input type="hidden" name="role" value="community" />}
        {kind === "explorer" ? <label className={`${labelClass} sm:col-span-2`}>Explorer website URL (HTTPS)<Input name="url" required type="url" defaultValue={resource?.url ?? ""} /></label> : null}
        {kind === "pool" ? <>
          <label className={labelClass}>Pool website URL (optional)<Input name="url" type="url" defaultValue={resource?.url ?? ""} /></label>
          <label className={labelClass}>Miner endpoint (optional)<Input name="poolEndpoint" mono defaultValue={resource?.pool_endpoint ?? ""} placeholder="stratum+tcp://pool.example.org:3334" /></label>
          <label className={labelClass}>Mining page order<Input name="miningOrder" type="number" min={0} max={100000} defaultValue={resource?.mining_order ?? ""} placeholder="Only for miner endpoint" /></label>
        </> : <><input type="hidden" name="poolEndpoint" value="" /><input type="hidden" name="miningOrder" value="" /></>}
        {kind !== "rpc" ? <input type="hidden" name="responseTimeLabel" value="" /> : null}
      </div>
      <div className="flex items-center gap-3"><button type="submit" disabled={pending} className="min-h-11 rounded-full border border-accent px-5 text-sm font-medium text-accent-soft hover:bg-accent/10 disabled:opacity-50">{pending ? "Saving…" : resource ? "Save changes" : `Add ${kind}`}</button>{message ? <p role="status" className="text-sm text-on-surface-variant">{message}</p> : null}</div>
    </form>
  );
}
