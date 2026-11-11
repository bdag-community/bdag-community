"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { createClient } from "@/lib/supabase/client";

/**
 * Email + password sign-in for the admin area (browser client, anon key —
 * the session lands in the httpOnly cookie written by @supabase/ssr).
 *
 * On success we HARD-navigate to /admin so the fresh auth cookie rides the
 * request and every server component (layout, requireAdmin gate) sees it —
 * a soft router.push can race the cookie write. A signed-in non-admin is
 * bounced straight back here by requireAdmin(), where the page renders the
 * honest "no admin access" state.
 */
export function SignInForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);

    const { error: authError } = await createClient().auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (authError) {
      // Honest, specific where safely possible; never invents a cause.
      setError(
        /invalid login credentials/i.test(authError.message)
          ? "Email or password is incorrect."
          : /email not confirmed/i.test(authError.message)
            ? "This email address has not been confirmed yet."
            : "Sign-in failed. Check the connection and try again.",
      );
      setPending(false);
      return;
    }

    window.location.assign("/admin");
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <div className="space-y-1.5">
        <label
          htmlFor="admin-email"
          className="block text-sm text-on-surface-variant"
        >
          Email address
        </label>
        <Input
          id="admin-email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-invalid={error ? true : undefined}
        />
      </div>

      <div className="space-y-1.5">
        <label
          htmlFor="admin-password"
          className="block text-sm text-on-surface-variant"
        >
          Password
        </label>
        <Input
          id="admin-password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          aria-invalid={error ? true : undefined}
        />
      </div>

      {error && (
        <p role="alert" className="text-sm text-error">
          {error}
        </p>
      )}

      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}
