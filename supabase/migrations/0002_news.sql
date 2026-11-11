-- 0002_news.sql
-- BDAG Community — news_articles: the lightweight news CMS behind /news.
--
-- Public readers (anon) see PUBLISHED rows only; admins (JWT app_metadata.admin
-- via public.is_admin(), migration 0001) get full CRUD through the RLS-bound
-- server client. RLS + policies live in the same migration as the table.

create table if not exists public.news_articles (
  id           uuid primary key default gen_random_uuid(),
  slug         text unique not null,
  title        text not null,
  subtitle     text,
  description  text,
  -- Plain-text projection and explicit sanitized rich-text representation.
  body         text,
  body_html    text,
  image_url    text,
  author_name  text,
  submitted_by_community boolean not null default false,
  is_published boolean not null default false,
  published_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- Keep a partially-created development table aligned when this idempotent
-- migration is pasted again before the first project is connected.
alter table public.news_articles
  add column if not exists author_name text;
alter table public.news_articles
  add column if not exists body_html text;
alter table public.news_articles
  add column if not exists submitted_by_community boolean not null default false;

-- The public /news query: published rows, newest first.
create index if not exists news_articles_published_idx
on public.news_articles (is_published, published_at desc);

-- ---------------------------------------------------------------------------
-- updated_at trigger — keep the column honest on every update.
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''   -- pinned: avoids mutable-search_path privilege escalation
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists news_articles_set_updated_at on public.news_articles;
create trigger news_articles_set_updated_at
before update on public.news_articles
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Grants (explicit; RLS below is the authorization boundary).
-- ---------------------------------------------------------------------------
revoke all on table public.news_articles from anon, authenticated, public;
grant select on table public.news_articles to anon, authenticated;
grant insert, update, delete on table public.news_articles to authenticated;
revoke all on table public.news_articles from service_role;
grant insert on table public.news_articles to service_role;

-- ---------------------------------------------------------------------------
-- Row Level Security — enabled WITH explicit policies in this same migration.
-- ---------------------------------------------------------------------------
alter table public.news_articles enable row level security;

drop policy if exists "news: anyone reads published" on public.news_articles;
create policy "news: anyone reads published"
on public.news_articles for select to anon, authenticated
using ( is_published = true );

drop policy if exists "news: admins select all" on public.news_articles;
create policy "news: admins select all"
on public.news_articles for select to authenticated
using ( public.is_admin() );

drop policy if exists "news: admins insert" on public.news_articles;
create policy "news: admins insert"
on public.news_articles for insert to authenticated
with check ( public.is_admin() );

drop policy if exists "news: admins update" on public.news_articles;
create policy "news: admins update"
on public.news_articles for update to authenticated
using ( public.is_admin() )
with check ( public.is_admin() );

drop policy if exists "news: admins delete" on public.news_articles;
create policy "news: admins delete"
on public.news_articles for delete to authenticated
using ( public.is_admin() );
