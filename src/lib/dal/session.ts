import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { hasSupabaseEnv } from "@/lib/supabase/env";

/**
 * DATA ACCESS LAYER — THE REAL SECURITY BOUNDARY.
 *
 * This module is the ONLY place identity and admin status are established.
 * Middleware is coarse UX only (session refresh + redirect-away); it can be
 * bypassed and must never be trusted for authorization — that happens HERE,
 * on every data access.
 *
 * Iron rules (inherited from the bdag-miner-sales DAL, minus its wallet
 * extraction — this site authenticates by email + password):
 *  - Identity comes ONLY from the server-verified Supabase user. `getUser()`
 *    re-validates the JWT against the Supabase Auth server, unlike
 *    `getSession()`.
 *  - Admin is read ONLY from the verified JWT `app_metadata.admin` claim,
 *    minted by custom_access_token_hook from profiles.is_admin. Crucially,
 *    `getUser()` returns the auth server's PERSISTED user record, whose
 *    app_metadata does NOT include hook-injected claims — the claim lives
 *    only inside the access token, so it MUST be read via
 *    `supabase.auth.getClaims()` (which validates the token server-side).
 *    Never user_metadata, never a client value.
 *  - No Supabase env → everything resolves null / redirects; nothing crashes.
 *  - `server-only` makes the build fail if this leaks into a client bundle.
 */

export type AdminSession = {
  userId: string;
  email: string | null;
};

/**
 * Returns the server-verified authenticated user, or null (including when
 * Supabase is not configured). `cache()`-wrapped so one request makes a
 * single auth round-trip.
 */
export const verifySession = cache(async (): Promise<User | null> => {
  if (!hasSupabaseEnv()) return null;
  const { getServerSupabase } = await import("@/lib/supabase/server");
  const supabase = await getServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user ?? null;
});

/**
 * The verified admin session, or null. Non-throwing so surfaces like the
 * sign-in page can branch on it (signed out vs signed in without admin).
 * Fail-closed: any error resolving/validating the token = not an admin.
 */
export const getAdminSession = cache(async (): Promise<AdminSession | null> => {
  const user = await verifySession();
  if (!user) return null;

  // The admin flag is carried by the custom_access_token_hook as the JWT
  // app_metadata.admin claim — readable ONLY via getClaims() (see module doc).
  const { getServerSupabase } = await import("@/lib/supabase/server");
  const supabase = await getServerSupabase();
  let appMetadata: { admin?: unknown } | undefined;
  try {
    const { data } = await supabase.auth.getClaims();
    const claims = data?.claims as Record<string, unknown> | undefined;
    appMetadata = claims?.app_metadata as { admin?: unknown } | undefined;
  } catch {
    appMetadata = undefined;
  }
  if (appMetadata?.admin !== true) {
    if (process.env.NODE_ENV !== "production") {
      // Dev-only diagnostic: an operator who IS is_admin in the DB but still
      // lands here has a stale token (sign out/in) or an unregistered hook.
      console.warn(
        "[getAdminSession] admin claim absent from verified JWT, denying.",
        "\n  jwt app_metadata:",
        JSON.stringify(appMetadata ?? null),
      );
    }
    return null;
  }

  return { userId: user.id, email: user.email ?? null };
});

/**
 * Requires an admin; redirects to /admin/sign-in otherwise (signed out,
 * signed in without the claim, or Supabase not configured — the sign-in page
 * explains each state honestly). Safe to call from pages and server actions.
 */
export const requireAdmin = cache(async (): Promise<AdminSession> => {
  const session = await getAdminSession();
  if (!session) redirect("/admin/sign-in");
  return session;
});
