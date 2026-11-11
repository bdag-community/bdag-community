-- 0007_article_moderation.sql
-- Forward-only moderation, responsive derivative metadata, and RPC-only admin writes.

alter table public.article_assets
  drop constraint if exists article_assets_one_kind_per_article;
alter table public.article_assets
  drop constraint if exists article_assets_state_check;

alter table public.article_assets
  add constraint article_assets_state_check
  check (state in (
    'awaiting_presign',
    'awaiting_upload',
    'processing',
    'ready',
    'approved',
    'rejected',
    'failed',
    'published',
    'superseded'
  ));

alter table public.article_assets
  add column if not exists processing_attempts integer not null default 0,
  add column if not exists capability_purpose text not null
    default 'community_submission',
  add column if not exists result_manifest_key text,
  add column if not exists result_manifest_version_id text,
  add column if not exists processed_at timestamptz,
  add column if not exists moderated_by uuid references auth.users(id),
  add column if not exists moderated_at timestamptz,
  add column if not exists moderation_reason text;

alter table public.article_assets
  drop constraint if exists article_assets_capability_purpose_check;
alter table public.article_assets
  add constraint article_assets_capability_purpose_check
  check (capability_purpose in ('community_submission', 'admin_replacement'));

alter table public.article_assets
  drop constraint if exists article_assets_processing_attempts_check;
alter table public.article_assets
  add constraint article_assets_processing_attempts_check
  check (processing_attempts >= 0);
alter table public.article_assets
  drop constraint if exists article_assets_manifest_key_check;
alter table public.article_assets
  add constraint article_assets_manifest_key_check
  check (
    result_manifest_key is null
    or result_manifest_key =
      'news/processed/' || article_id::text || '/' || id::text || '/result.json'
  );
alter table public.article_assets
  drop constraint if exists article_assets_manifest_pair_check;
alter table public.article_assets
  add constraint article_assets_manifest_pair_check
  check (
    (result_manifest_key is null and result_manifest_version_id is null)
    or (result_manifest_key is not null and result_manifest_version_id is not null)
  );
alter table public.article_assets
  drop constraint if exists article_assets_moderation_check;
alter table public.article_assets
  add constraint article_assets_moderation_check
  check (
    (
      state in ('approved', 'published')
      and alt_text is not null
      and char_length(btrim(alt_text)) >= 5
      and moderated_by is not null
      and moderated_at is not null
    )
    or state not in ('approved', 'published')
  );
alter table public.article_assets
  drop constraint if exists article_assets_failure_code_check;
alter table public.article_assets
  add constraint article_assets_failure_code_check
  check (
    failure_reason is null
    or failure_reason in (
      'animated_image',
      'decode_failed',
      'dimensions_exceeded',
      'file_too_large',
      'malformed_container',
      'metadata_not_stripped',
      'output_limit',
      'pixel_limit_exceeded',
      'size_mismatch',
      'type_mismatch',
      'unsupported_type'
    )
  );

create unique index if not exists article_assets_one_active_candidate_idx
on public.article_assets (article_id, asset_kind)
where state in (
  'awaiting_presign',
  'awaiting_upload',
  'processing',
  'ready',
  'approved'
);

create unique index if not exists article_assets_one_published_cover_idx
on public.article_assets (article_id, asset_kind)
where state = 'published';

create unique index if not exists article_assets_article_id_id_idx
on public.article_assets (article_id, id);

create table if not exists public.article_asset_derivatives (
  id uuid primary key default gen_random_uuid(),
  article_id uuid not null,
  asset_id uuid not null,
  storage_environment text not null
    constraint article_asset_derivatives_environment_check
    check (storage_environment in ('development', 'production')),
  variant_width integer not null
    constraint article_asset_derivatives_variant_width_check
    check (variant_width in (640, 1024, 1600)),
  content_type text not null default 'image/webp'
    constraint article_asset_derivatives_content_type_check
    check (content_type = 'image/webp'),
  processed_key text not null unique,
  processed_version_id text not null,
  byte_size bigint not null
    constraint article_asset_derivatives_byte_size_check
    check (byte_size > 0),
  checksum_sha256 text not null
    constraint article_asset_derivatives_checksum_check
    check (checksum_sha256 ~ '^[0-9a-f]{64}$'),
  width integer not null
    constraint article_asset_derivatives_width_check
    check (width = variant_width),
  height integer not null
    constraint article_asset_derivatives_height_check
    check (
      height = case variant_width
        when 640 then 360
        when 1024 then 576
        else 900
      end
    ),
  published_key text unique,
  published_version_id text,
  published_at timestamptz,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint article_asset_derivatives_asset_fk
    foreign key (article_id, asset_id)
    references public.article_assets(article_id, id)
    on delete cascade,
  constraint article_asset_derivatives_one_variant
    unique (asset_id, variant_width),
  constraint article_asset_derivatives_processed_key_check
    check (
      processed_key =
        'news/processed/' || article_id::text || '/' || asset_id::text ||
        '/cover-' || variant_width::text || 'x' ||
        (case variant_width when 640 then '360' when 1024 then '576' else '900' end) ||
        '.webp'
    ),
  constraint article_asset_derivatives_published_key_check
    check (
      published_key is null
      or published_key =
        'news/published/' || article_id::text || '/' || asset_id::text ||
        '/cover-' || variant_width::text || 'x' ||
        (case variant_width when 640 then '360' when 1024 then '576' else '900' end) ||
        '.webp'
    ),
  constraint article_asset_derivatives_publication_pair_check
    check (
      (
        published_key is null
        and published_version_id is null
        and published_at is null
      )
      or
      (
        published_key is not null
        and published_version_id is not null
        and published_at is not null
      )
    )
);

drop trigger if exists article_asset_derivatives_set_updated_at
on public.article_asset_derivatives;
create trigger article_asset_derivatives_set_updated_at
before update on public.article_asset_derivatives
for each row execute function public.set_updated_at();

alter table public.article_asset_derivatives enable row level security;
revoke all on table public.article_asset_derivatives
from anon, authenticated, service_role, public;
grant select on table public.article_asset_derivatives to authenticated;
drop policy if exists "article asset derivatives: admins select"
on public.article_asset_derivatives;
create policy "article asset derivatives: admins select"
on public.article_asset_derivatives for select to authenticated
using (public.is_admin());

alter table public.news_articles
  add column if not exists published_asset_id uuid,
  add column if not exists published_asset_alt_text text;

update public.news_articles
set image_url = null
where image_url is not null;
update public.news_articles
set published_at = coalesce(published_at, created_at)
where is_published and published_at is null;
update public.news_articles
set published_at = null
where not is_published and published_at is not null;

alter table public.news_articles
  drop constraint if exists news_articles_legacy_image_url_check;
alter table public.news_articles
  add constraint news_articles_legacy_image_url_check
  check (image_url is null);
alter table public.news_articles
  drop constraint if exists news_articles_publication_state_check;
alter table public.news_articles
  add constraint news_articles_publication_state_check
  check (
    (is_published and published_at is not null)
    or (not is_published and published_at is null)
  );
alter table public.news_articles
  drop constraint if exists news_articles_published_asset_state_check;
alter table public.news_articles
  add constraint news_articles_published_asset_state_check
  check (published_asset_id is null or is_published);
alter table public.news_articles
  drop constraint if exists news_articles_published_asset_alt_check;
alter table public.news_articles
  add constraint news_articles_published_asset_alt_check
  check (
    (
      published_asset_id is null
      and published_asset_alt_text is null
    )
    or
    (
      published_asset_id is not null
      and published_asset_alt_text is not null
      and char_length(btrim(published_asset_alt_text)) >= 5
    )
  );
alter table public.news_articles
  drop constraint if exists news_articles_published_asset_fk;
alter table public.news_articles
  add constraint news_articles_published_asset_fk
  foreign key (id, published_asset_id)
  references public.article_assets(article_id, id)
  deferrable initially deferred;

revoke insert, update, delete on table public.news_articles from authenticated;
drop policy if exists "news: admins insert" on public.news_articles;
drop policy if exists "news: admins update" on public.news_articles;
drop policy if exists "news: admins delete" on public.news_articles;

create or replace function public.admin_create_news_article(
  p_title text,
  p_slug text,
  p_subtitle text,
  p_description text,
  p_body text,
  p_body_html text,
  p_author_name text
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

  insert into public.news_articles (
    id, slug, title, subtitle, description, body, body_html, image_url,
    author_name, submitted_by_community, is_published, published_at
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
    null
  );
  return v_id;
end;
$$;

create or replace function public.admin_save_news_article(
  p_article_id uuid,
  p_title text,
  p_slug text,
  p_subtitle text,
  p_description text,
  p_body text,
  p_body_html text,
  p_author_name text
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
    image_url = null
  where id = p_article_id;
  return found;
end;
$$;

create or replace function public.admin_begin_article_asset_replacement(
  p_article_id uuid,
  p_storage_environment text,
  p_asset_content_type text,
  p_asset_byte_size bigint,
  p_asset_alt_text text,
  p_capability_digest text
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_asset_id uuid := gen_random_uuid();
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception using errcode = '42501', message = 'admin access required';
  end if;
  if p_article_id is null then
    raise exception using errcode = '22023', message = 'invalid article asset';
  end if;
  if not exists (
    select 1 from public.news_articles where id = p_article_id
  ) then
    raise exception using errcode = 'P0002', message = 'article not found';
  end if;
  if p_storage_environment is null
    or p_storage_environment not in ('development', 'production')
    or p_asset_content_type is null
    or p_asset_content_type not in ('image/jpeg', 'image/png', 'image/webp')
    or p_asset_byte_size is null
    or p_asset_byte_size not between 1 and 5242880
    or p_capability_digest is null
    or p_capability_digest !~ '^[0-9a-f]{64}$'
    or p_asset_alt_text is not null
      and char_length(p_asset_alt_text) not between 1 and 300 then
    raise exception using errcode = '22023', message = 'invalid article asset';
  end if;

  update public.article_assets
  set
    state = 'superseded',
    capability_digest = null,
    presigned_at = coalesce(
      presigned_at,
      capability_expires_at - interval '1 microsecond'
    ),
    failure_reason = null,
    moderation_reason = null
  where article_id = p_article_id
    and asset_kind = 'cover'
    and state in (
      'awaiting_presign', 'awaiting_upload', 'processing', 'ready', 'approved'
    );

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
    capability_purpose,
    capability_digest,
    capability_expires_at
  ) values (
    v_asset_id,
    p_article_id,
    p_storage_environment,
    'cover',
    'news/quarantine/' || p_article_id::text || '/' || v_asset_id::text || '/original',
    'awaiting_presign',
    p_asset_content_type,
    p_asset_byte_size,
    nullif(btrim(coalesce(p_asset_alt_text, '')), ''),
    'admin_replacement',
    p_capability_digest,
    statement_timestamp() + interval '5 minutes'
  );
  return v_asset_id;
end;
$$;

-- Forward-replace the 0006 claim boundary so an opaque, unexpired capability
-- can also authorize a replacement candidate created by an authenticated admin.
-- The browser still cannot choose a key, environment, expiry, or article id.
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
    and (
      asset.capability_purpose = 'admin_replacement'
      or (
        asset.capability_purpose = 'community_submission'
        and article.submitted_by_community = true
        and article.is_published = false
      )
    )
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

create or replace function public.admin_sync_article_asset_result(
  p_article_id uuid,
  p_asset_id uuid,
  p_storage_environment text,
  p_object_key text,
  p_quarantine_version_id text,
  p_result_manifest_key text,
  p_result_manifest_version_id text,
  p_result_status text,
  p_detected_content_type text,
  p_byte_size bigint,
  p_checksum_sha256 text,
  p_width integer,
  p_height integer,
  p_derivatives jsonb,
  p_failure_reason text
)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_asset public.article_assets%rowtype;
  v_derivative jsonb;
  v_variant_width integer;
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception using errcode = '42501', message = 'admin access required';
  end if;
  if p_article_id is null
    or p_asset_id is null
    or p_storage_environment is null
    or p_storage_environment not in ('development', 'production')
    or p_object_key is null
    or char_length(p_object_key) = 0 then
    raise exception using errcode = '22023', message = 'invalid asset result';
  end if;
  select * into v_asset
  from public.article_assets
  where id = p_asset_id
    and article_id = p_article_id
    and storage_environment = p_storage_environment
    and object_key = p_object_key
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'asset not found';
  end if;
  if p_quarantine_version_id is null or char_length(p_quarantine_version_id) = 0
    or p_result_manifest_key is null
    or p_result_manifest_version_id is null
    or char_length(p_result_manifest_version_id) = 0
    or p_result_manifest_key <>
      'news/processed/' || p_article_id::text || '/' || p_asset_id::text || '/result.json'
    or p_result_status not in ('ready', 'rejected') then
    raise exception using errcode = '22023', message = 'invalid asset result';
  end if;

  -- S3 result objects are immutable and version-bound. An exact replay of a
  -- result already committed to this row is a successful no-op.
  if v_asset.state in ('ready', 'failed') then
    if v_asset.quarantine_version_id = p_quarantine_version_id
      and v_asset.result_manifest_key = p_result_manifest_key
      and v_asset.result_manifest_version_id = p_result_manifest_version_id
      and (
        (v_asset.state = 'ready' and p_result_status = 'ready')
        or (
          v_asset.state = 'failed'
          and p_result_status = 'rejected'
          and v_asset.failure_reason = p_failure_reason
        )
      ) then
      return true;
    end if;
    raise exception using errcode = '22023', message = 'asset result already committed';
  end if;

  if v_asset.state <> 'awaiting_upload' then
    raise exception using errcode = '22023', message = 'invalid asset result';
  end if;

  if p_result_status = 'rejected' then
    if p_failure_reason is null
      or p_failure_reason not in (
        'animated_image',
        'decode_failed',
        'dimensions_exceeded',
        'file_too_large',
        'malformed_container',
        'metadata_not_stripped',
        'output_limit',
        'pixel_limit_exceeded',
        'size_mismatch',
        'type_mismatch',
        'unsupported_type'
      ) then
      raise exception using errcode = '22023', message = 'invalid asset failure';
    end if;
    update public.article_assets
    set
      state = 'failed',
      quarantine_version_id = p_quarantine_version_id,
      result_manifest_key = p_result_manifest_key,
      result_manifest_version_id = p_result_manifest_version_id,
      processing_attempts = processing_attempts + 1,
      failure_reason = p_failure_reason
    where id = p_asset_id;
    return true;
  end if;

  if p_result_status is distinct from 'ready'
    or p_detected_content_type not in ('image/jpeg', 'image/png', 'image/webp')
    or p_byte_size is null or p_byte_size <= 0
    or p_checksum_sha256 is null or p_checksum_sha256 !~ '^[0-9a-f]{64}$'
    or p_width is null or p_width <= 0
    or p_height is null or p_height <= 0
    or p_derivatives is null
    or jsonb_typeof(p_derivatives) <> 'array'
    or jsonb_array_length(p_derivatives) <> 3 then
    raise exception using errcode = '22023', message = 'invalid asset result';
  end if;

  for v_derivative in select value from jsonb_array_elements(p_derivatives)
  loop
    if jsonb_typeof(v_derivative) <> 'object'
      or jsonb_typeof(v_derivative -> 'variantWidth') <> 'number'
      or jsonb_typeof(v_derivative -> 'byteSize') <> 'number'
      or jsonb_typeof(v_derivative -> 'width') <> 'number'
      or jsonb_typeof(v_derivative -> 'height') <> 'number'
      or coalesce(v_derivative ->> 'variantWidth', '') !~ '^[0-9]{1,4}$'
      or coalesce(v_derivative ->> 'byteSize', '') !~ '^[0-9]{1,10}$'
      or coalesce(v_derivative ->> 'width', '') !~ '^[0-9]{1,4}$'
      or coalesce(v_derivative ->> 'height', '') !~ '^[0-9]{1,4}$' then
      raise exception using errcode = '22023', message = 'invalid asset derivative';
    end if;
    v_variant_width := (v_derivative ->> 'variantWidth')::integer;
    if v_variant_width not in (640, 1024, 1600)
      or v_derivative ->> 'contentType' <> 'image/webp'
      or v_derivative ->> 'processedKey' <>
        'news/processed/' || p_article_id::text || '/' || p_asset_id::text ||
        '/cover-' || v_variant_width::text || 'x' ||
        (case v_variant_width when 640 then '360' when 1024 then '576' else '900' end) ||
        '.webp'
      or coalesce(v_derivative ->> 'processedVersionId', '') = ''
      or coalesce(v_derivative ->> 'checksumSha256', '') !~ '^[0-9a-f]{64}$'
      or (v_derivative ->> 'byteSize')::bigint <= 0
      or (v_derivative ->> 'width')::integer <> v_variant_width
      or (v_derivative ->> 'height')::integer <>
        (case v_variant_width when 640 then 360 when 1024 then 576 else 900 end)
      or exists (
        select 1
        from public.article_asset_derivatives
        where asset_id = p_asset_id
          and variant_width = v_variant_width
      ) then
      raise exception using errcode = '22023', message = 'invalid asset derivative';
    end if;

    insert into public.article_asset_derivatives (
      article_id,
      asset_id,
      storage_environment,
      variant_width,
      content_type,
      processed_key,
      processed_version_id,
      byte_size,
      checksum_sha256,
      width,
      height
    ) values (
      p_article_id,
      p_asset_id,
      p_storage_environment,
      v_variant_width,
      'image/webp',
      v_derivative ->> 'processedKey',
      v_derivative ->> 'processedVersionId',
      (v_derivative ->> 'byteSize')::bigint,
      v_derivative ->> 'checksumSha256',
      (v_derivative ->> 'width')::integer,
      (v_derivative ->> 'height')::integer
    );
  end loop;

  if (
    select count(*) from public.article_asset_derivatives
    where asset_id = p_asset_id
  ) <> 3 then
    raise exception using errcode = '22023', message = 'incomplete asset derivatives';
  end if;

  update public.article_assets
  set
    state = 'ready',
    quarantine_version_id = p_quarantine_version_id,
    result_manifest_key = p_result_manifest_key,
    result_manifest_version_id = p_result_manifest_version_id,
    detected_content_type = p_detected_content_type,
    byte_size = p_byte_size,
    checksum_sha256 = p_checksum_sha256,
    width = p_width,
    height = p_height,
    processed_at = statement_timestamp(),
    processing_attempts = processing_attempts + 1,
    failure_reason = null
  where id = p_asset_id;
  return true;
end;
$$;

create or replace function public.admin_approve_article_asset(
  p_article_id uuid,
  p_asset_id uuid,
  p_alt_text text
)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception using errcode = '42501', message = 'admin access required';
  end if;
  if p_alt_text is null or char_length(btrim(p_alt_text)) not between 5 and 300 then
    raise exception using errcode = '22023', message = 'meaningful alt text required';
  end if;
  update public.article_assets
  set
    state = 'approved',
    alt_text = btrim(p_alt_text),
    moderated_by = auth.uid(),
    moderated_at = statement_timestamp(),
    moderation_reason = null
  where id = p_asset_id
    and article_id = p_article_id
    and state = 'ready'
    and (
      select count(*) from public.article_asset_derivatives
      where asset_id = p_asset_id
    ) = 3;
  return found;
end;
$$;

create or replace function public.admin_reject_article_asset(
  p_article_id uuid,
  p_asset_id uuid,
  p_reason text
)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception using errcode = '42501', message = 'admin access required';
  end if;
  if p_reason is null or char_length(btrim(p_reason)) not between 5 and 1000 then
    raise exception using errcode = '22023', message = 'rejection reason required';
  end if;
  update public.article_assets
  set
    state = 'rejected',
    moderated_by = auth.uid(),
    moderated_at = statement_timestamp(),
    moderation_reason = btrim(p_reason),
    failure_reason = null
  where id = p_asset_id
    and article_id = p_article_id
    and state in ('ready', 'approved');
  return found;
end;
$$;

create or replace function public.admin_publish_news_article(
  p_article_id uuid,
  p_asset_id uuid,
  p_published_derivatives jsonb
)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_article public.news_articles%rowtype;
  v_asset public.article_assets%rowtype;
  v_derivative jsonb;
  v_variant_width integer;
  v_selected_asset_id uuid;
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception using errcode = '42501', message = 'admin access required';
  end if;
  select * into v_article
  from public.news_articles
  where id = p_article_id
  for update;
  if not found then
    return false;
  end if;
  if v_article.description is null or char_length(btrim(v_article.description)) = 0
    or v_article.body is null or char_length(btrim(v_article.body)) = 0 then
    raise exception using errcode = '22023', message = 'article is incomplete';
  end if;

  v_selected_asset_id := coalesce(p_asset_id, v_article.published_asset_id);
  if v_selected_asset_id is not null then
    select * into v_asset
    from public.article_assets
    where id = v_selected_asset_id
      and article_id = p_article_id
      and state in ('approved', 'published')
    for update;
    if not found
      or v_asset.alt_text is null
      or char_length(btrim(v_asset.alt_text)) < 5 then
      raise exception using errcode = '22023', message = 'asset is not publishable';
    end if;
    if v_asset.state = 'approved' then
      if p_published_derivatives is null
        or jsonb_typeof(p_published_derivatives) <> 'array'
        or jsonb_array_length(p_published_derivatives) <> 3 then
        raise exception using errcode = '22023', message = 'invalid asset promotion';
      end if;
      for v_derivative in
        select value from jsonb_array_elements(p_published_derivatives)
      loop
        if jsonb_typeof(v_derivative) <> 'object'
          or jsonb_typeof(v_derivative -> 'variantWidth') <> 'number'
          or coalesce(v_derivative ->> 'variantWidth', '') !~ '^[0-9]{1,4}$'
          or jsonb_typeof(v_derivative -> 'publishedKey') <> 'string'
          or jsonb_typeof(v_derivative -> 'publishedVersionId') <> 'string' then
          raise exception using errcode = '22023', message = 'invalid asset promotion';
        end if;
        v_variant_width := (v_derivative ->> 'variantWidth')::integer;
        if v_variant_width not in (640, 1024, 1600)
          or v_derivative ->> 'publishedKey' <>
            'news/published/' || p_article_id::text || '/' || p_asset_id::text ||
            '/cover-' || v_variant_width::text || 'x' ||
            (case v_variant_width when 640 then '360' when 1024 then '576' else '900' end) ||
            '.webp'
          or coalesce(v_derivative ->> 'publishedVersionId', '') = '' then
          raise exception using errcode = '22023', message = 'invalid asset promotion';
        end if;
        update public.article_asset_derivatives
        set
          published_key = v_derivative ->> 'publishedKey',
          published_version_id = v_derivative ->> 'publishedVersionId',
          published_at = statement_timestamp()
        where asset_id = p_asset_id
          and variant_width = v_variant_width
          and published_key is null
          and published_version_id is null;
        if not found then
          raise exception using errcode = '22023', message = 'invalid asset promotion';
        end if;
      end loop;
    elsif p_published_derivatives is not null then
      raise exception using errcode = '22023', message = 'unexpected asset promotion';
    end if;
    if (
      select count(*) from public.article_asset_derivatives
      where asset_id = v_selected_asset_id
        and published_key is not null
        and published_version_id is not null
    ) <> 3 then
      raise exception using errcode = '22023', message = 'asset is not publishable';
    end if;
  elsif p_published_derivatives is not null then
    raise exception using errcode = '22023', message = 'unexpected asset promotion';
  end if;

  if v_article.published_asset_id is not null
    and v_article.published_asset_id is distinct from v_selected_asset_id then
    update public.article_assets
    set state = 'superseded'
    where id = v_article.published_asset_id and state = 'published';
  end if;
  if v_selected_asset_id is not null then
    update public.article_assets
    set state = 'published'
    where id = v_selected_asset_id;
  end if;
  update public.news_articles
  set
    is_published = true,
    published_at = coalesce(published_at, statement_timestamp()),
    published_asset_id = v_selected_asset_id,
    published_asset_alt_text = case
      when v_selected_asset_id is null then null
      else v_asset.alt_text
    end,
    image_url = null
  where id = p_article_id;
  return true;
end;
$$;

create or replace function public.admin_unpublish_news_article(
  p_article_id uuid
)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_asset_id uuid;
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception using errcode = '42501', message = 'admin access required';
  end if;
  select published_asset_id into v_asset_id
  from public.news_articles
  where id = p_article_id
  for update;
  if not found then
    return false;
  end if;
  update public.news_articles
  set
    is_published = false,
    published_at = null,
    published_asset_id = null,
    published_asset_alt_text = null,
    image_url = null
  where id = p_article_id;
  if v_asset_id is not null then
    update public.article_assets
    set state = 'approved'
    where id = v_asset_id and state = 'published';
  end if;
  return true;
end;
$$;

create or replace function public.admin_delete_news_article(
  p_article_id uuid
)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception using errcode = '42501', message = 'admin access required';
  end if;
  if exists (
    select 1 from public.news_articles
    where id = p_article_id and is_published
  ) then
    raise exception using errcode = '22023', message = 'unpublish article first';
  end if;
  if exists (
    select 1 from public.article_assets where article_id = p_article_id
  ) then
    raise exception using errcode = '22023', message = 'asset cleanup required';
  end if;
  delete from public.news_articles where id = p_article_id;
  return found;
end;
$$;

alter function public.admin_create_news_article(
  text, text, text, text, text, text, text
) owner to postgres;
alter function public.admin_save_news_article(
  uuid, text, text, text, text, text, text, text
) owner to postgres;
alter function public.admin_begin_article_asset_replacement(
  uuid, text, text, bigint, text, text
) owner to postgres;
alter function public.admin_sync_article_asset_result(
  uuid, uuid, text, text, text, text, text, text, text, bigint, text,
  integer, integer, jsonb, text
) owner to postgres;
alter function public.admin_approve_article_asset(uuid, uuid, text)
owner to postgres;
alter function public.admin_reject_article_asset(uuid, uuid, text)
owner to postgres;
alter function public.admin_publish_news_article(uuid, uuid, jsonb)
owner to postgres;
alter function public.admin_unpublish_news_article(uuid)
owner to postgres;
alter function public.admin_delete_news_article(uuid)
owner to postgres;

revoke all on function public.admin_create_news_article(
  text, text, text, text, text, text, text
) from anon, authenticated, service_role, public;
grant execute on function public.admin_create_news_article(
  text, text, text, text, text, text, text
) to authenticated;
revoke all on function public.admin_save_news_article(
  uuid, text, text, text, text, text, text, text
) from anon, authenticated, service_role, public;
grant execute on function public.admin_save_news_article(
  uuid, text, text, text, text, text, text, text
) to authenticated;
revoke all on function public.admin_begin_article_asset_replacement(
  uuid, text, text, bigint, text, text
) from anon, authenticated, service_role, public;
grant execute on function public.admin_begin_article_asset_replacement(
  uuid, text, text, bigint, text, text
) to authenticated;
revoke all on function public.admin_sync_article_asset_result(
  uuid, uuid, text, text, text, text, text, text, text, bigint, text,
  integer, integer, jsonb, text
) from anon, authenticated, service_role, public;
grant execute on function public.admin_sync_article_asset_result(
  uuid, uuid, text, text, text, text, text, text, text, bigint, text,
  integer, integer, jsonb, text
) to authenticated;
revoke all on function public.admin_approve_article_asset(uuid, uuid, text)
from anon, authenticated, service_role, public;
grant execute on function public.admin_approve_article_asset(uuid, uuid, text)
to authenticated;
revoke all on function public.admin_reject_article_asset(uuid, uuid, text)
from anon, authenticated, service_role, public;
grant execute on function public.admin_reject_article_asset(uuid, uuid, text)
to authenticated;
revoke all on function public.admin_publish_news_article(uuid, uuid, jsonb)
from anon, authenticated, service_role, public;
grant execute on function public.admin_publish_news_article(uuid, uuid, jsonb)
to authenticated;
revoke all on function public.admin_unpublish_news_article(uuid)
from anon, authenticated, service_role, public;
grant execute on function public.admin_unpublish_news_article(uuid)
to authenticated;
revoke all on function public.admin_delete_news_article(uuid)
from anon, authenticated, service_role, public;
grant execute on function public.admin_delete_news_article(uuid)
to authenticated;
