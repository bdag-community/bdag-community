-- 0010_article_categories.sql
-- One category per article, shown as a label on the public Articles pages.
--
-- The set is deliberately small and closed: a check constraint here and the
-- ARTICLE_CATEGORIES map in src/lib/content/site.ts must always agree, and
-- adding a category is a forward migration plus a copy change, never a free
-- string. The column default keeps every existing writer valid: the deployed
-- application can keep calling the seven-argument admin RPCs while the new
-- eight-argument definitions below default the category to news.

alter table public.news_articles
  add column if not exists category text not null default 'news';

alter table public.news_articles
  drop constraint if exists news_articles_category_check;
alter table public.news_articles
  add constraint news_articles_category_check
  check (category in ('news', 'update', 'community', 'info', 'projects'));

-- Community submissions predating this migration keep their provenance
-- visible: they were community stories before the label existed.
update public.news_articles
set category = 'community'
where submitted_by_community and category = 'news';

-- ---------------------------------------------------------------------------
-- admin_create_news_article — replaced with a defaulted p_category parameter.
-- The old seven-argument signature is dropped first: `create or replace` with
-- a new signature would leave both overloads behind and make the PostgREST
-- named-argument call ambiguous.
-- ---------------------------------------------------------------------------

drop function if exists public.admin_create_news_article(
  text, text, text, text, text, text, text
);

create function public.admin_create_news_article(
  p_title text,
  p_slug text,
  p_subtitle text,
  p_description text,
  p_body text,
  p_body_html text,
  p_author_name text,
  p_category text default 'news'
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_id uuid := gen_random_uuid();
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception using errcode = '42501', message = 'admin access required';
  end if;
  if p_title is null or char_length(btrim(p_title)) not between 1 and 200
    or p_slug is null
    or char_length(p_slug) not between 1 and 120
    or p_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$'
    or p_subtitle is not null and char_length(p_subtitle) > 300
    or p_description is not null and char_length(p_description) > 1000
    or p_body is not null and char_length(p_body) > 50000
    or p_body_html is not null and char_length(p_body_html) > 100000
    or p_author_name is not null and char_length(p_author_name) > 120 then
    raise exception using errcode = '22023', message = 'invalid article content';
  end if;
  if p_category is null
    or p_category not in ('news', 'update', 'community', 'info', 'projects') then
    raise exception using errcode = '22023', message = 'invalid article category';
  end if;

  insert into public.news_articles (
    id, slug, title, subtitle, description, body, body_html, image_url,
    author_name, submitted_by_community, is_published, published_at, category
  ) values (
    v_id,
    p_slug,
    btrim(p_title),
    nullif(btrim(coalesce(p_subtitle, '')), ''),
    nullif(btrim(coalesce(p_description, '')), ''),
    nullif(p_body, ''),
    nullif(p_body_html, ''),
    null,
    nullif(btrim(coalesce(p_author_name, '')), ''),
    false,
    false,
    null,
    p_category
  );
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- admin_save_news_article — replaced with a defaulted p_category parameter.
-- ---------------------------------------------------------------------------

drop function if exists public.admin_save_news_article(
  uuid, text, text, text, text, text, text, text
);

create function public.admin_save_news_article(
  p_article_id uuid,
  p_title text,
  p_slug text,
  p_subtitle text,
  p_description text,
  p_body text,
  p_body_html text,
  p_author_name text,
  p_category text default 'news'
)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_is_published boolean;
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception using errcode = '42501', message = 'admin access required';
  end if;
  if p_article_id is null
    or p_title is null
    or char_length(btrim(p_title)) not between 1 and 200
    or p_slug is null
    or char_length(p_slug) not between 1 and 120
    or p_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$'
    or p_subtitle is not null and char_length(p_subtitle) > 300
    or p_description is not null and char_length(p_description) > 1000
    or p_body is not null and char_length(p_body) > 50000
    or p_body_html is not null and char_length(p_body_html) > 100000
    or p_author_name is not null and char_length(p_author_name) > 120 then
    raise exception using errcode = '22023', message = 'invalid article content';
  end if;
  if p_category is null
    or p_category not in ('news', 'update', 'community', 'info', 'projects') then
    raise exception using errcode = '22023', message = 'invalid article category';
  end if;

  select is_published into v_is_published
  from public.news_articles
  where id = p_article_id
  for update;
  if not found then
    return false;
  end if;
  if v_is_published and (
    p_description is null
    or char_length(btrim(p_description)) = 0
    or p_body is null
    or char_length(btrim(p_body)) = 0
  ) then
    raise exception using errcode = '22023', message = 'published article is incomplete';
  end if;

  update public.news_articles
  set
    slug = p_slug,
    title = btrim(p_title),
    subtitle = nullif(btrim(coalesce(p_subtitle, '')), ''),
    description = nullif(btrim(coalesce(p_description, '')), ''),
    body = nullif(p_body, ''),
    body_html = nullif(p_body_html, ''),
    author_name = nullif(btrim(coalesce(p_author_name, '')), ''),
    image_url = null,
    category = p_category
  where id = p_article_id;
  return found;
end;
$$;

-- ---------------------------------------------------------------------------
-- create_community_article_draft — same signature, community drafts now carry
-- the community category from the moment they are created. An admin can
-- recategorise on review through admin_save_news_article.
-- ---------------------------------------------------------------------------

create or replace function public.create_community_article_draft(
  p_title text,
  p_subtitle text,
  p_description text,
  p_body text,
  p_body_html text,
  p_author_name text,
  p_storage_environment text,
  p_asset_content_type text,
  p_asset_byte_size bigint,
  p_asset_alt_text text,
  p_capability_digest text
)
returns table (article_id uuid, asset_id uuid)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := statement_timestamp();
  v_article_id uuid := gen_random_uuid();
  v_asset_id uuid;
  v_capability_expires_at timestamptz;
  v_asset_requested boolean :=
    p_storage_environment is not null
    or p_asset_content_type is not null
    or p_asset_byte_size is not null
    or p_asset_alt_text is not null
    or p_capability_digest is not null;
begin
  if p_title is null or char_length(btrim(p_title)) not between 5 and 200 then
    raise exception using errcode = '22023', message = 'invalid article title';
  end if;
  if p_subtitle is not null and char_length(p_subtitle) > 300 then
    raise exception using errcode = '22023', message = 'invalid article subtitle';
  end if;
  if p_description is null
    or char_length(btrim(p_description)) not between 20 and 1000 then
    raise exception using errcode = '22023', message = 'invalid article description';
  end if;
  if p_body is null or char_length(btrim(p_body)) not between 100 and 50000 then
    raise exception using errcode = '22023', message = 'invalid article body';
  end if;
  if p_body_html is null or char_length(p_body_html) > 100000 then
    raise exception using errcode = '22023', message = 'invalid article html';
  end if;
  if p_author_name is not null and char_length(p_author_name) > 120 then
    raise exception using errcode = '22023', message = 'invalid article author';
  end if;

  if v_asset_requested then
    if p_storage_environment is null
      or p_storage_environment not in ('development', 'production')
      or p_asset_content_type is null
      or p_asset_content_type not in ('image/jpeg', 'image/png', 'image/webp')
      or p_asset_byte_size is null
      or p_asset_byte_size not between 1 and 5242880
      or p_capability_digest is null
      or p_capability_digest !~ '^[0-9a-f]{64}$'
      or (
        p_asset_alt_text is not null
        and char_length(p_asset_alt_text) not between 1 and 300
      ) then
      raise exception using errcode = '22023', message = 'invalid article asset';
    end if;
    v_asset_id := gen_random_uuid();
    v_capability_expires_at := v_now + interval '5 minutes';
  end if;

  insert into public.news_articles (
    id,
    slug,
    title,
    subtitle,
    description,
    body,
    body_html,
    image_url,
    author_name,
    submitted_by_community,
    is_published,
    published_at,
    category
  ) values (
    v_article_id,
    'community-' || v_article_id::text,
    btrim(p_title),
    nullif(btrim(coalesce(p_subtitle, '')), ''),
    btrim(p_description),
    p_body,
    p_body_html,
    null,
    nullif(btrim(coalesce(p_author_name, '')), ''),
    true,
    false,
    null,
    'community'
  );

  if v_asset_id is not null then
    insert into public.article_assets (
      id,
      article_id,
      storage_environment,
      asset_kind,
      object_key,
      state,
      declared_content_type,
      declared_byte_size,
      alt_text,
      capability_digest,
      capability_expires_at
    ) values (
      v_asset_id,
      v_article_id,
      p_storage_environment,
      'cover',
      'news/quarantine/' || v_article_id::text || '/' || v_asset_id::text || '/original',
      'awaiting_presign',
      p_asset_content_type,
      p_asset_byte_size,
      nullif(btrim(coalesce(p_asset_alt_text, '')), ''),
      p_capability_digest,
      v_capability_expires_at
    );
  end if;

  return query select v_article_id, v_asset_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Ownership and execution, matching 0006/0007 exactly.
-- ---------------------------------------------------------------------------

alter function public.admin_create_news_article(
  text, text, text, text, text, text, text, text
) owner to postgres;
alter function public.admin_save_news_article(
  uuid, text, text, text, text, text, text, text, text
) owner to postgres;
alter function public.create_community_article_draft(
  text, text, text, text, text, text, text, text, bigint, text, text
) owner to postgres;

revoke all on function public.admin_create_news_article(
  text, text, text, text, text, text, text, text
) from anon, authenticated, service_role, public;
grant execute on function public.admin_create_news_article(
  text, text, text, text, text, text, text, text
) to authenticated;
revoke all on function public.admin_save_news_article(
  uuid, text, text, text, text, text, text, text, text
) from anon, authenticated, service_role, public;
grant execute on function public.admin_save_news_article(
  uuid, text, text, text, text, text, text, text, text
) to authenticated;
