-- 0008_suggestion_inbox.sql
-- BDAG Community suggestion inbox.
--
-- Validated suggestions are inserted only by the server-side secret-key
-- client. Authenticated admins may read and delete through RLS. No public
-- client can inspect or write the inbox.

create table if not exists public.suggestion_messages (
  id          uuid primary key default gen_random_uuid(),
  author_name text,
  reply_email text,
  suggestion  text not null,
  created_at  timestamptz not null default now(),
  constraint suggestion_messages_author_name_check
    check (
      author_name is null
      or char_length(btrim(author_name)) between 1 and 120
    ),
  constraint suggestion_messages_reply_email_check
    check (
      reply_email is null
      or char_length(btrim(reply_email)) between 1 and 320
    ),
  constraint suggestion_messages_suggestion_check
    check (char_length(btrim(suggestion)) between 10 and 4000)
);

create index if not exists suggestion_messages_created_at_idx
  on public.suggestion_messages (created_at desc);

revoke all on table public.suggestion_messages
  from anon, authenticated, service_role, public;
grant select, delete on table public.suggestion_messages to authenticated;
grant insert on table public.suggestion_messages to service_role;

alter table public.suggestion_messages enable row level security;

drop policy if exists "suggestions: admins select"
  on public.suggestion_messages;
create policy "suggestions: admins select"
on public.suggestion_messages for select to authenticated
using ( public.is_admin() );

drop policy if exists "suggestions: admins delete"
  on public.suggestion_messages;
create policy "suggestions: admins delete"
on public.suggestion_messages for delete to authenticated
using ( public.is_admin() );

-- Finalize deletion only after the server has removed every recorded S3
-- object version. Browser sessions cannot execute this function.
create or replace function public.delete_news_article_after_asset_cleanup(
  p_article_id uuid
)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.news_articles
    where id = p_article_id and is_published
  ) then
    raise exception using errcode = '22023', message = 'unpublish article first';
  end if;
  delete from public.news_articles where id = p_article_id;
  return found;
end;
$$;

alter function public.delete_news_article_after_asset_cleanup(uuid)
owner to postgres;
revoke all on function public.delete_news_article_after_asset_cleanup(uuid)
from anon, authenticated, service_role, public;
grant execute on function public.delete_news_article_after_asset_cleanup(uuid)
to service_role;
