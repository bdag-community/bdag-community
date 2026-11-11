/**
 * Supabase env presence check — the switch behind the site's graceful
 * degradation. With no Supabase project wired (fresh clone, preview build),
 * news serves the seed articles and the contact form falls back to channels;
 * nothing may crash on missing env. Import this before touching any client
 * in lib/supabase/* (those assume env is present).
 */
export function hasSupabaseEnv(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );
}
