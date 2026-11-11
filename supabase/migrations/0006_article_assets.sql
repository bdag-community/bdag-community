-- 0006_article_assets.sql
-- Private cover-image metadata and one-shot quarantine upload capabilities.

create table if not exists public.article_assets (
  id uuid primary key default gen_random_uuid(),
  article_id uuid not null references public.news_articles(id) on delete cascade,
  storage_environment text not null
    constraint article_assets_storage_environment_check
    check (storage_environment in ('development', 'production')),
  asset_kind text not null default 'cover'
    constraint article_assets_kind_check
    check (asset_kind = 'cover'),
  object_key text not null unique,
  state text not null default 'awaiting_presign'
    constraint article_assets_state_check
    check (state in (
      'awaiting_presign',
      'awaiting_upload',
      'processing',
      'ready',
      'rejected',
      'failed',
      'published'
    )),
  declared_content_type text not null
    constraint article_assets_declared_content_type_check
    check (declared_content_type in ('image/jpeg', 'image/png', 'image/webp')),
  declared_byte_size bigint not null
    constraint article_assets_declared_byte_size_check
    check (declared_byte_size between 1 and 5242880),
  detected_content_type text,
  byte_size bigint
    constraint article_assets_byte_size_check
    check (byte_size is null or byte_size > 0),
  checksum_sha256 text
    constraint article_assets_checksum_check
    check (checksum_sha256 is null or checksum_sha256 ~ '^[0-9a-f]{64}$'),
  width integer
    constraint article_assets_width_check
    check (width is null or width > 0),
  height integer
    constraint article_assets_height_check
    check (height is null or height > 0),
  alt_text text
    constraint article_assets_alt_text_check
    check (alt_text is null or char_length(alt_text) between 1 and 300),
  quarantine_version_id text,
  processed_key text unique,
  failure_reason text
    constraint article_assets_failure_reason_check
    check (failure_reason is null or char_length(failure_reason) <= 1000),
  capability_digest text unique
    constraint article_assets_capability_digest_check
    check (capability_digest is null or capability_digest ~ '^[0-9a-f]{64}$'),
  capability_expires_at timestamptz not null,
  presigned_at timestamptz,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint article_assets_one_kind_per_article
    unique (article_id, asset_kind),
  constraint article_assets_object_key_check
    check (
      object_key =
        'news/quarantine/' || article_id::text || '/' || id::text || '/original'
    ),
  constraint article_assets_capability_window_check
    check (
      capability_expires_at > created_at
      and capability_expires_at <= created_at + interval '5 minutes'
      and (presigned_at is null or presigned_at < capability_expires_at)
    ),
  constraint article_assets_presign_state_check
    check (
      (
        state = 'awaiting_presign'
        and presigned_at is null
        and capability_digest is not null
      )
      or
      (
        state <> 'awaiting_presign'
        and presigned_at is not null
        and capability_digest is null
      )
    )
);

create index if not exists article_assets_environment_state_idx
on public.article_assets (storage_environment, state, created_at);

drop trigger if exists article_assets_set_updated_at on public.article_assets;
create trigger article_assets_set_updated_at
before update on public.article_assets
for each row execute function public.set_updated_at();

alter table public.article_assets enable row level security;

revoke all on table public.article_assets
from anon, authenticated, service_role, public;
grant select on table public.article_assets to authenticated;

drop policy if exists "article assets: admins select" on public.article_assets;
create policy "article assets: admins select"
on public.article_assets for select to authenticated
using (public.is_admin());

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
    published_at
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
    null
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

alter function public.create_community_article_draft(
  text, text, text, text, text, text, text, text, bigint, text, text
) owner to postgres;
revoke all on function public.create_community_article_draft(
  text, text, text, text, text, text, text, text, bigint, text, text
) from anon, authenticated, service_role, public;
grant execute on function public.create_community_article_draft(
  text, text, text, text, text, text, text, text, bigint, text, text
) to service_role;

create or replace function public.claim_article_asset_presign(
  p_capability_digest text,
  p_storage_environment text
)
returns table (
  object_key text,
  declared_content_type text,
  declared_byte_size bigint,
  upload_expires_in_seconds integer
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if p_capability_digest is null
    or p_capability_digest !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = 'invalid asset capability';
  end if;
  if p_storage_environment is null
    or p_storage_environment not in ('development', 'production') then
    raise exception using errcode = '22023', message = 'invalid storage environment';
  end if;

  return query
  update public.article_assets as asset
  set
    state = 'awaiting_upload',
    presigned_at = statement_timestamp(),
    capability_digest = null,
    updated_at = statement_timestamp()
  from public.news_articles as article
  where article.id = asset.article_id
    and article.submitted_by_community = true
    and article.is_published = false
    and asset.storage_environment = p_storage_environment
    and asset.capability_digest = p_capability_digest
    and asset.capability_expires_at > statement_timestamp()
    and asset.state = 'awaiting_presign'
    and asset.presigned_at is null
  returning
    asset.object_key,
    asset.declared_content_type,
    asset.declared_byte_size,
    least(
      300,
      greatest(
        1,
        floor(
          extract(
            epoch from asset.capability_expires_at - statement_timestamp()
          )
        )::integer
      )
    );
end;
$$;

alter function public.claim_article_asset_presign(text, text) owner to postgres;
revoke all on function public.claim_article_asset_presign(text, text)
from anon, authenticated, service_role, public;
grant execute on function public.claim_article_asset_presign(text, text)
to service_role;

revoke all on table public.news_articles from service_role;
