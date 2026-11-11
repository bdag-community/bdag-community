import 'server-only';

import { cache } from 'react';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';

/**
 * Supabase SSR server client (publishable key, RLS-bound).
 *
 * This is the RLS-respecting client used for authenticated admin reads/writes.
 * It reads/writes the httpOnly session cookie via @supabase/ssr so the
 * Supabase session is the only source of identity. Never use the
 * service-role client (lib/supabase/admin.ts) for user-scoped data.
 *
 * `cache()`-wrapped so a single request reuses one client instance.
 */
export const getServerSupabase = cache(async () => {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            // `setAll` from a Server Component is a no-op (cookies are
            // immutable there). Session refresh happens in middleware.
          }
        },
      },
    },
  );
});
