import "server-only";

import { createClient } from "@supabase/supabase-js";

/**
 * Cookie-free Supabase client for public, RLS-protected reads.
 *
 * The publishable key maps an unsigned request to Postgres' `anon` role. This
 * client deliberately has no session storage, cookie adapter, or secret key,
 * so a visitor's admin session can never change what a public cache entry sees.
 */
export function getPublicSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false,
      },
    },
  );
}
