'use client';

import { createBrowserClient } from '@supabase/ssr';

/**
 * Supabase browser client (publishable key only).
 *
 * Used by client components for the SIWE sign-in flow
 * (`supabase.auth.signInWithWeb3`) and sign-out. The session is stored in
 * an httpOnly cookie written by @supabase/ssr — never in localStorage.
 * Never reference the service-role key here.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  );
}
