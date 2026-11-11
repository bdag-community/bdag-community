-- 0001_identity.sql
-- BDAG Community — identity: profiles + the admin-claim plumbing.
--
-- Conventions carried over from the bdag-miner-sales migrations (the proven
-- family pattern): idempotent statements, RLS enabled with explicit policies
-- in the SAME migration that creates each table, and explicit Data API grants
-- (new Supabase projects can opt out of automatic public-schema grants).
-- Unlike the sibling repo, these migrations are CLI-tracked from day one:
-- apply with `supabase db push`, never by pasting into the dashboard.

-- ---------------------------------------------------------------------------
-- profiles — one row per auth user, created by the signup trigger below.
-- is_admin is the DB source of truth for admin status; the JWT carries it as
-- the app_metadata.admin claim via custom_access_token_hook.
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  email      text,
  is_admin   boolean not null default false,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Admin helper + Custom Access Token Hook (bdag-miner-sales migration 0001
-- pattern). The hook must be registered in Dashboard -> Auth -> Hooks.
-- ---------------------------------------------------------------------------

-- RLS/DAL helper: reads the admin claim from the JWT (never user_metadata,
-- never a client value).
create or replace function public.is_admin()
returns boolean
language sql
stable
set search_path = ''   -- pinned: avoids mutable-search_path privilege escalation
as $$
  select coalesce((auth.jwt() -> 'app_metadata' ->> 'admin')::boolean, false);
$$;

-- Custom Access Token Hook: mint app_metadata.admin from the profiles source
-- of truth. Admins must sign out and back in after the flag changes because
-- the claim only lands on freshly minted tokens.
create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
set search_path = ''   -- pinned: avoids mutable-search_path privilege escalation
as $$
declare
  claims jsonb;
  admin  boolean;
begin
  select is_admin into admin
  from public.profiles
  where user_id = (event->>'user_id')::uuid;

  claims := coalesce(event->'claims', '{}'::jsonb);
  if jsonb_typeof(claims->'app_metadata') is distinct from 'object' then
    claims := jsonb_set(claims, '{app_metadata}', '{}');
  end if;
  claims := jsonb_set(
    claims,
    '{app_metadata, admin}',
    to_jsonb(coalesce(admin, false))
  );
  event := jsonb_set(event, '{claims}', claims);

  return event;
end;
$$;

-- ---------------------------------------------------------------------------
-- Signup trigger: materialise a profiles row (with the email copied over) the
-- moment an auth user is created. SECURITY DEFINER because auth.users inserts
-- run as the auth admin, not as any Data API role.
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''   -- pinned: avoids mutable-search_path privilege escalation
as $$
begin
  insert into public.profiles (user_id, email)
  values (new.id, new.email)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Grants. The hook executes as supabase_auth_admin; user-facing roles get
-- SELECT only (RLS below narrows the rows). Explicit because new Supabase
-- projects may not auto-grant public-schema access to the API roles.
-- ---------------------------------------------------------------------------
grant usage on schema public to anon, authenticated;
grant usage on schema public to supabase_auth_admin;

revoke all on table public.profiles from supabase_auth_admin;
grant select on table public.profiles to supabase_auth_admin;
revoke all on table public.profiles from service_role;
revoke all on table public.profiles from authenticated, anon, public;
grant select on table public.profiles to authenticated;

grant execute on function public.custom_access_token_hook(jsonb) to supabase_auth_admin;
revoke execute on function public.custom_access_token_hook(jsonb) from authenticated, anon, public;

-- ---------------------------------------------------------------------------
-- Row Level Security — enabled WITH explicit policies in this same migration.
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;

drop policy if exists "profiles: owner selects own" on public.profiles;
create policy "profiles: owner selects own"
on public.profiles for select to authenticated
using ( user_id = auth.uid() );

drop policy if exists "profiles: admins select all" on public.profiles;
create policy "profiles: admins select all"
on public.profiles for select to authenticated
using ( public.is_admin() );

-- The sibling migration-0011 lesson, applied from day one: table PRIVILEGES do
-- not bypass RLS, and supabase_auth_admin is not BYPASSRLS. Without this
-- policy the hook reads zero rows, the admin claim is never minted, and every
-- admin surface fails closed.
drop policy if exists "profiles: auth admin reads for jwt hook" on public.profiles;
create policy "profiles: auth admin reads for jwt hook"
on public.profiles
as permissive
for select
to supabase_auth_admin
using ( true );
