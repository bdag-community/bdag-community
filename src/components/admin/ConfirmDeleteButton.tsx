"use client";

import { useEffect, useRef, useState, useTransition } from "react";

/**
 * Two-step destructive action — quiet trigger, explicit confirm, no browser
 * confirm() dialog. The server action owns the real gate (requireAdmin +
 * zod); this component only sequences the UI. Actions that redirect on
 * success never resolve here (NEXT_REDIRECT propagates to the router);
 * actions that stay on the page resolve void and the revalidated list drops
 * the row.
 */
type DeleteAction = (id: string) => Promise<{ ok: false; error: string } | void>;

const QUIET_BTN =
  "min-h-[44px] rounded-full px-4 text-sm transition-colors disabled:opacity-50 " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent " +
  "focus-visible:ring-offset-2 focus-visible:ring-offset-base-void";

export function ConfirmDeleteButton({
  id,
  action,
  label = "Delete",
  confirmPrompt = "Delete permanently?",
}: {
  id: string;
  action: DeleteAction;
  label?: string;
  /** Shown next to the confirm/cancel pair once armed. */
  confirmPrompt?: string;
}) {
  const [armed, setArmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const restoreTriggerFocusRef = useRef(false);

  useEffect(() => {
    if (armed) {
      confirmRef.current?.focus();
      return;
    }

    if (restoreTriggerFocusRef.current) {
      triggerRef.current?.focus();
      restoreTriggerFocusRef.current = false;
    }
  }, [armed]);

  function onConfirm() {
    setError(null);
    startTransition(async () => {
      const result = await action(id);
      if (result && !result.ok) {
        setError(result.error);
        restoreTriggerFocusRef.current = true;
        setArmed(false);
      }
    });
  }

  function onCancel() {
    restoreTriggerFocusRef.current = true;
    setArmed(false);
  }

  if (!armed) {
    return (
      <div className="flex flex-col items-end gap-1">
        <button
          ref={triggerRef}
          type="button"
          onClick={() => setArmed(true)}
          className={`${QUIET_BTN} border border-border text-on-surface-variant hover:border-error/50 hover:text-error`}
        >
          {label}
        </button>
        {error && (
          <p role="alert" className="text-xs text-error">
            {error}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <span className="text-xs text-on-surface-variant">{confirmPrompt}</span>
      <button
        ref={confirmRef}
        type="button"
        onClick={onConfirm}
        disabled={pending}
        className={`${QUIET_BTN} border border-error/60 text-error hover:bg-error/10`}
      >
        {pending ? "Deleting…" : "Yes, delete"}
      </button>
      <button
        type="button"
        onClick={onCancel}
        disabled={pending}
        className={`${QUIET_BTN} border border-border text-on-surface-variant hover:text-on-surface`}
      >
        Cancel
      </button>
    </div>
  );
}
