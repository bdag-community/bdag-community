import 'server-only';

import { createClient } from '@supabase/supabase-js';

/**
 * Supabase secret-key client — bypasses ALL Row Level Security.
 *
 * NARROW USE ONLY. Per ARCHITECTURE.md Anti-Pattern 6: this client must
 * never be used for user-scoped reads/writes (use lib/supabase/server.ts —
 * the RLS-bound client — for anything tied to a wallet/user). Reserve this
 * for genuinely privileged, system-level operations only.
 *
 * Hard guarantees enforced at import time:
 *  - SUPABASE_SECRET_KEY must be present (fail fast otherwise).
 *  - The secret key must NOT be exposed via any NEXT_PUBLIC_* var
 *    (exposure = total compromise; bypasses RLS entirely).
 */

// SUPABASE_SECRET_KEY bypasses ALL Row Level Security — it is read
// here only to build the narrowly-used privileged client below. It must
// stay server-only and must never be exposed to the browser.
const secretKey = process.env.SUPABASE_SECRET_KEY;

if (!secretKey) {
  throw new Error(
    'SUPABASE_SECRET_KEY is not set. The privileged client cannot be constructed.',
  );
}

if (process.env.NEXT_PUBLIC_SUPABASE_SECRET_KEY) {
  throw new Error(
    'SUPABASE_SECRET_KEY must never be exposed as a NEXT_PUBLIC_ variable, it bypasses RLS.',
  );
}

/**
 * Construct fresh per call. No session persistence/refresh — this client
 * is never tied to a user session.
 *
 * WARNING: the client returned here uses the secret key and therefore
 * BYPASSES ALL ROW LEVEL SECURITY. It is intentionally NOT scoped to any
 * user/wallet. Only call this for system-level work that legitimately must
 * run unrestricted — never to read or write a buyer's order/profile/payment
 * (those must go through the RLS-bound client in lib/supabase/server.ts).
 */
export function getAdminSupabase() {
  // The secret key below bypasses every RLS policy — narrow use only.
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    secretKey!,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    },
  );
}
