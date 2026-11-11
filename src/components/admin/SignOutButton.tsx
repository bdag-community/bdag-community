"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * Admin chrome sign-out. Clears the Supabase session cookie via the browser
 * client, then hard-navigates to the sign-in page so every server component
 * re-renders against the signed-out state (a soft nav could keep stale RSC
 * payload around). Quiet ghost styling — Operate mode, no gradient.
 */
export function SignOutButton({ email }: { email: string | null }) {
  const [pending, setPending] = useState(false);

  async function signOut() {
    setPending(true);
    try {
      await createClient().auth.signOut();
    } finally {
      window.location.assign("/admin/sign-in");
    }
  }

  return (
    <div className="flex items-center gap-3">
      {email && (
        <span className="hidden font-mono text-xs text-on-surface-variant sm:inline">
          {email}
        </span>
      )}
      <button
        type="button"
        onClick={signOut}
        disabled={pending}
        className="min-h-[44px] rounded-full border border-border px-4 text-sm text-on-surface-variant transition-colors hover:border-accent/60 hover:text-on-surface disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-base-void"
      >
        {pending ? "Signing out…" : "Sign out"}
      </button>
    </div>
  );
}
