"use client";

import { useState, useTransition } from "react";

type ResponseAction = (
  id: string,
  responded: boolean,
) => Promise<{ ok: false; error: string } | void>;

export function RespondedToggle({
  id,
  respondedAt,
  action,
}: {
  id: string;
  respondedAt: string | null;
  action: ResponseAction;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const responded = respondedAt !== null;

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <span
        className={`rounded-full border px-3 py-1 text-xs font-medium ${
          responded
            ? "border-success/40 bg-success/10 text-success"
            : "border-border text-on-surface-variant"
        }`}
        title={respondedAt ? `Marked responded ${new Date(respondedAt).toUTCString()}` : undefined}
      >
        {responded ? "Responded" : "Not responded"}
      </span>
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            const result = await action(id, !responded);
            if (result && !result.ok) setError(result.error);
          });
        }}
        className="min-h-[44px] rounded-full border border-border px-4 text-sm text-on-surface-variant transition-colors hover:border-accent hover:text-on-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-base-void disabled:opacity-50"
      >
        {pending ? "Saving…" : responded ? "Mark not responded" : "Mark responded"}
      </button>
      {error ? <p role="alert" className="w-full text-right text-xs text-error">{error}</p> : null}
    </div>
  );
}
