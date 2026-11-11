-- 0003_contact.sql
-- BDAG Community — contact_messages: the contact-form inbox.
--
-- Deny by default. Inserts happen ONLY server-side through the service-role
-- client (which bypasses RLS) — there is deliberately NO anon/authenticated
-- write path, so the anon key alone can never spam or read the inbox. Admins
-- (JWT app_metadata.admin via public.is_admin(), migration 0001) may SELECT
-- and DELETE through the RLS-bound server client; nothing else, for anyone.

create table if not exists public.contact_messages (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  email      text not null,
  topic      text not null,
  message    text not null,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Grants. anon gets nothing at all; authenticated gets select/delete only
-- (RLS narrows both to admins); the service role writes the inbox.
-- ---------------------------------------------------------------------------
revoke all on table public.contact_messages from anon, authenticated, public;
grant select, delete on table public.contact_messages to authenticated;
revoke all on table public.contact_messages from service_role;
grant insert on table public.contact_messages to service_role;

-- ---------------------------------------------------------------------------
-- Row Level Security — enabled WITH explicit policies in this same migration.
-- No insert/update policy exists for ANY Data API role: deny by default.
-- ---------------------------------------------------------------------------
alter table public.contact_messages enable row level security;

drop policy if exists "contact: admins select" on public.contact_messages;
create policy "contact: admins select"
on public.contact_messages for select to authenticated
using ( public.is_admin() );

drop policy if exists "contact: admins delete" on public.contact_messages;
create policy "contact: admins delete"
on public.contact_messages for delete to authenticated
using ( public.is_admin() );
