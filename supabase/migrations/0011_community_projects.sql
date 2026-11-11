-- 0011_community_projects.sql
-- Community projects: a public submission -> admin vetting -> published
-- showcase content type, mirroring the news_articles + article_assets
-- moderation pipeline that shipped in 0002/0006/0007/0010.
--
-- The image pipeline is shared with articles on the AWS side: project covers
-- use the SAME news/quarantine, news/processed, and news/published key
-- prefixes, because the processor Lambda, bucket policy, IAM users, lifecycle
-- rules, and CloudFront allow are all prefix-based and treat the two path
-- UUIDs as opaque. The first UUID is a project id here instead of an article
-- id; only these tables and RPCs know the difference. Changing the prefixes
-- would be an AWS-side deployment, so the wart of a projects cover living
-- under news/* is accepted and documented.

-- ---------------------------------------------------------------------------
-- community_projects
-- ---------------------------------------------------------------------------

create table if not exists public.community_projects (
  id           uuid primary key default gen_random_uuid(),
  name         text not null
    constraint community_projects_name_check
    check (char_length(btrim(name)) between 2 and 80),
  description  text not null
    constraint community_projects_description_check
    check (char_length(btrim(description)) between 20 and 600),
  url          text not null
    constraint community_projects_url_check
    check (
      char_length(url) between 12 and 300
      and url ~ '^https://[^[:space:]]+\.[^[:space:]]+$'
    ),
  category     text not null default 'utility'
    constraint community_projects_category_check
    check (category in (
      'utility', 'infrastructure', 'information', 'tooling', 'community'
    )),
  author_name  text
    constraint community_projects_author_name_check
    check (author_name is null or char_length(author_name) between 1 and 120),
  submitted_by_community boolean not null default true,
  is_published boolean not null default false,
  published_at timestamptz,
  published_asset_id uuid,
  published_asset_alt_text text,
  created_at   timestamptz not null default statement_timestamp(),
  updated_at   timestamptz not null default statement_timestamp(),
  constraint community_projects_publication_state_check
    check (
      (is_published and published_at is not null)
      or (not is_published and published_at is null)
    ),
  constraint community_projects_published_asset_state_check
    check (published_asset_id is null or is_published),
  constraint community_projects_published_asset_alt_check
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
    )
);

create index if not exists community_projects_published_idx
on public.community_projects (is_published, published_at desc);

drop trigger if exists community_projects_set_updated_at
on public.community_projects;
create trigger community_projects_set_updated_at
before update on public.community_projects
for each row execute function public.set_updated_at();

alter table public.community_projects enable row level security;

revoke all on table public.community_projects
from anon, authenticated, service_role, public;
grant select on table public.community_projects to anon, authenticated;

drop policy if exists "projects: anyone reads published"
on public.community_projects;
create policy "projects: anyone reads published"
on public.community_projects for select to anon, authenticated
using (is_published = true);

drop policy if exists "projects: admins select all"
on public.community_projects;
create policy "projects: admins select all"
on public.community_projects for select to authenticated
using (public.is_admin());

-- ---------------------------------------------------------------------------
-- project_assets — the article_assets state machine, keyed to projects.
-- Born at the 0007 feature level: approved/superseded states, moderation
-- columns, and capability purposes are present from the start.
-- ---------------------------------------------------------------------------

create table if not exists public.project_assets (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null
    references public.community_projects(id) on delete cascade,
  storage_environment text not null
    constraint project_assets_storage_environment_check
    check (storage_environment in ('development', 'production')),
  asset_kind text not null default 'cover'
    constraint project_assets_kind_check
    check (asset_kind = 'cover'),
  object_key text not null unique,
  state text not null default 'awaiting_presign'
    constraint project_assets_state_check
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
    )),
  declared_content_type text not null
    constraint project_assets_declared_content_type_check
    check (declared_content_type in ('image/jpeg', 'image/png', 'image/webp')),
  declared_byte_size bigint not null
    constraint project_assets_declared_byte_size_check
    check (declared_byte_size between 1 and 5242880),
  detected_content_type text,
  byte_size bigint
    constraint project_assets_byte_size_check
    check (byte_size is null or byte_size > 0),
  checksum_sha256 text
    constraint project_assets_checksum_check
    check (checksum_sha256 is null or checksum_sha256 ~ '^[0-9a-f]{64}$'),
  width integer
    constraint project_assets_width_check
    check (width is null or width > 0),
  height integer
    constraint project_assets_height_check
    check (height is null or height > 0),
  alt_text text
    constraint project_assets_alt_text_check
    check (alt_text is null or char_length(alt_text) between 1 and 300),
  quarantine_version_id text,
  processing_attempts integer not null default 0
    constraint project_assets_processing_attempts_check
    check (processing_attempts >= 0),
  capability_purpose text not null default 'community_submission'
    constraint project_assets_capability_purpose_check
    check (capability_purpose in ('community_submission', 'admin_replacement')),
  result_manifest_key text,
  result_manifest_version_id text,
  processed_at timestamptz,
  moderated_by uuid references auth.users(id),
  moderated_at timestamptz,
  moderation_reason text,
  failure_reason text
    constraint project_assets_failure_code_check
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
    ),
  capability_digest text unique
    constraint project_assets_capability_digest_check
    check (capability_digest is null or capability_digest ~ '^[0-9a-f]{64}$'),
  capability_expires_at timestamptz not null,
  presigned_at timestamptz,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint project_assets_object_key_check
    check (
      object_key =
        'news/quarantine/' || project_id::text || '/' || id::text || '/original'
    ),
  constraint project_assets_manifest_key_check
    check (
      result_manifest_key is null
      or result_manifest_key =
        'news/processed/' || project_id::text || '/' || id::text || '/result.json'
    ),
  constraint project_assets_manifest_pair_check
    check (
      (result_manifest_key is null and result_manifest_version_id is null)
      or (
        result_manifest_key is not null
        and result_manifest_version_id is not null
      )
    ),
  constraint project_assets_moderation_check
    check (
      (
        state in ('approved', 'published')
        and alt_text is not null
        and char_length(btrim(alt_text)) >= 5
        and moderated_by is not null
        and moderated_at is not null
      )
      or state not in ('approved', 'published')
    ),
  constraint project_assets_capability_window_check
    check (
      capability_expires_at > created_at
      and capability_expires_at <= created_at + interval '5 minutes'
      and (presigned_at is null or presigned_at < capability_expires_at)
    ),
  constraint project_assets_presign_state_check
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

create index if not exists project_assets_environment_state_idx
on public.project_assets (storage_environment, state, created_at);

create unique index if not exists project_assets_project_id_id_idx
on public.project_assets (project_id, id);

create unique index if not exists project_assets_one_active_candidate_idx
on public.project_assets (project_id, asset_kind)
where state in (
  'awaiting_presign',
  'awaiting_upload',
  'processing',
  'ready',
  'approved'
);

create unique index if not exists project_assets_one_published_cover_idx
on public.project_assets (project_id, asset_kind)
where state = 'published';

drop trigger if exists project_assets_set_updated_at on public.project_assets;
create trigger project_assets_set_updated_at
before update on public.project_assets
for each row execute function public.set_updated_at();

alter table public.project_assets enable row level security;

revoke all on table public.project_assets
from anon, authenticated, service_role, public;
grant select on table public.project_assets to authenticated;

drop policy if exists "project assets: admins select" on public.project_assets;
create policy "project assets: admins select"
on public.project_assets for select to authenticated
using (public.is_admin());

-- ---------------------------------------------------------------------------
-- project_asset_derivatives
-- ---------------------------------------------------------------------------

create table if not exists public.project_asset_derivatives (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  asset_id uuid not null,
  storage_environment text not null
    constraint project_asset_derivatives_environment_check
    check (storage_environment in ('development', 'production')),
  variant_width integer not null
    constraint project_asset_derivatives_variant_width_check
    check (variant_width in (640, 1024, 1600)),
  content_type text not null default 'image/webp'
    constraint project_asset_derivatives_content_type_check
    check (content_type = 'image/webp'),
  processed_key text not null unique,
  processed_version_id text not null,
  byte_size bigint not null
    constraint project_asset_derivatives_byte_size_check
    check (byte_size > 0),
  checksum_sha256 text not null
    constraint project_asset_derivatives_checksum_check
    check (checksum_sha256 ~ '^[0-9a-f]{64}$'),
  width integer not null
    constraint project_asset_derivatives_width_check
    check (width = variant_width),
  height integer not null
    constraint project_asset_derivatives_height_check
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
  constraint project_asset_derivatives_asset_fk
    foreign key (project_id, asset_id)
    references public.project_assets(project_id, id)
    on delete cascade,
  constraint project_asset_derivatives_one_variant
    unique (asset_id, variant_width),
  constraint project_asset_derivatives_processed_key_check
    check (
      processed_key =
        'news/processed/' || project_id::text || '/' || asset_id::text ||
        '/cover-' || variant_width::text || 'x' ||
        (case variant_width when 640 then '360' when 1024 then '576' else '900' end) ||
        '.webp'
    ),
  constraint project_asset_derivatives_published_key_check
    check (
      published_key is null
      or published_key =
        'news/published/' || project_id::text || '/' || asset_id::text ||
        '/cover-' || variant_width::text || 'x' ||
        (case variant_width when 640 then '360' when 1024 then '576' else '900' end) ||
        '.webp'
    ),
  constraint project_asset_derivatives_publication_pair_check
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

drop trigger if exists project_asset_derivatives_set_updated_at
on public.project_asset_derivatives;
create trigger project_asset_derivatives_set_updated_at
before update on public.project_asset_derivatives
for each row execute function public.set_updated_at();

alter table public.project_asset_derivatives enable row level security;
revoke all on table public.project_asset_derivatives
from anon, authenticated, service_role, public;
grant select on table public.project_asset_derivatives to authenticated;
drop policy if exists "project asset derivatives: admins select"
on public.project_asset_derivatives;
create policy "project asset derivatives: admins select"
on public.project_asset_derivatives for select to authenticated
using (public.is_admin());

alter table public.community_projects
  drop constraint if exists community_projects_published_asset_fk;
alter table public.community_projects
  add constraint community_projects_published_asset_fk
  foreign key (id, published_asset_id)
  references public.project_assets(project_id, id)
  deferrable initially deferred;

-- ---------------------------------------------------------------------------
-- Abuse scope: the projects form gets its own rate-limit lane, at the same
-- 3 per 24 hours as articles.
-- ---------------------------------------------------------------------------

alter table public.submission_rate_limits
  drop constraint if exists submission_rate_limits_scope_check;
alter table public.submission_rate_limits
  add constraint submission_rate_limits_scope_check
  check (scope in ('challenge', 'article', 'suggestion', 'contact', 'project'));

create or replace function public.consume_submission_rate_limit(
  p_scope text,
  p_fingerprint text
)
returns table (
  allowed boolean,
  remaining integer,
  retry_after_seconds integer
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_limit integer;
  v_window interval;
  v_now timestamptz := statement_timestamp();
  v_window_start timestamptz;
  v_window_end timestamptz;
  v_count integer;
  v_allowed boolean;
begin
  case p_scope
    when 'challenge' then
      v_limit := 30;
      v_window := interval '10 minutes';
    when 'article' then
      v_limit := 3;
      v_window := interval '24 hours';
    when 'suggestion' then
      v_limit := 5;
      v_window := interval '1 hour';
    when 'contact' then
      v_limit := 5;
      v_window := interval '1 hour';
    when 'project' then
      v_limit := 3;
      v_window := interval '24 hours';
    else
      raise exception using
        errcode = '22023',
        message = 'invalid rate-limit scope';
  end case;

  if p_fingerprint is null or p_fingerprint !~ '^[0-9a-f]{64}$' then
    raise exception using
      errcode = '22023',
      message = 'invalid rate-limit fingerprint';
  end if;

  delete from public.submission_rate_limits
  where expires_at <= v_now;

  v_window_start := date_bin(
    v_window,
    v_now,
    timestamptz '1970-01-01 00:00:00+00'
  );
  v_window_end := v_window_start + v_window;

  insert into public.submission_rate_limits as current_window (
    scope,
    fingerprint,
    window_start,
    request_count,
    expires_at
  ) values (
    p_scope,
    p_fingerprint,
    v_window_start,
    1,
    v_window_end
  )
  on conflict (scope, fingerprint, window_start) do update
  set request_count = current_window.request_count + 1
  where current_window.request_count < v_limit
  returning current_window.request_count into v_count;

  v_allowed := found;
  if not v_allowed then
    v_count := v_limit;
  end if;

  return query
  select
    v_allowed,
    greatest(v_limit - v_count, 0),
    case
      when v_allowed then 0
      else greatest(
        1,
        ceil(extract(epoch from (v_window_end - v_now)))::integer
      )
    end;
end;
$$;

-- ---------------------------------------------------------------------------
-- create_community_project_draft — the anonymous submission boundary.
-- ---------------------------------------------------------------------------

create or replace function public.create_community_project_draft(
  p_name text,
  p_description text,
  p_url text,
  p_category text,
  p_author_name text,
  p_storage_environment text,
  p_asset_content_type text,
  p_asset_byte_size bigint,
  p_asset_alt_text text,
  p_capability_digest text
)
returns table (project_id uuid, asset_id uuid)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := statement_timestamp();
  v_project_id uuid := gen_random_uuid();
  v_asset_id uuid;
  v_capability_expires_at timestamptz;
  v_asset_requested boolean :=
    p_storage_environment is not null
    or p_asset_content_type is not null
    or p_asset_byte_size is not null
    or p_asset_alt_text is not null
    or p_capability_digest is not null;
begin
  if p_name is null or char_length(btrim(p_name)) not between 2 and 80 then
    raise exception using errcode = '22023', message = 'invalid project name';
  end if;
  if p_description is null
    or char_length(btrim(p_description)) not between 20 and 600 then
    raise exception using errcode = '22023', message = 'invalid project description';
  end if;
  if p_url is null
    or char_length(p_url) not between 12 and 300
    or p_url !~ '^https://[^[:space:]]+\.[^[:space:]]+$' then
    raise exception using errcode = '22023', message = 'invalid project url';
  end if;
  if p_category is null
    or p_category not in (
      'utility', 'infrastructure', 'information', 'tooling', 'community'
    ) then
    raise exception using errcode = '22023', message = 'invalid project category';
  end if;
  if p_author_name is not null and char_length(p_author_name) > 120 then
    raise exception using errcode = '22023', message = 'invalid project author';
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
      raise exception using errcode = '22023', message = 'invalid project asset';
    end if;
    v_asset_id := gen_random_uuid();
    v_capability_expires_at := v_now + interval '5 minutes';
  end if;

  insert into public.community_projects (
    id,
    name,
    description,
    url,
    category,
    author_name,
    submitted_by_community,
    is_published,
    published_at
  ) values (
    v_project_id,
    btrim(p_name),
    btrim(p_description),
    p_url,
    p_category,
    nullif(btrim(coalesce(p_author_name, '')), ''),
    true,
    false,
    null
  );

  if v_asset_id is not null then
    insert into public.project_assets (
      id,
      project_id,
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
      v_project_id,
      p_storage_environment,
      'cover',
      'news/quarantine/' || v_project_id::text || '/' || v_asset_id::text || '/original',
      'awaiting_presign',
      p_asset_content_type,
      p_asset_byte_size,
      nullif(btrim(coalesce(p_asset_alt_text, '')), ''),
      'community_submission',
      p_capability_digest,
      v_capability_expires_at
    );
  end if;

  return query select v_project_id, v_asset_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- claim_project_asset_presign — one-shot capability claim for the projects
-- presign route. Same contract as claim_article_asset_presign.
-- ---------------------------------------------------------------------------

create or replace function public.claim_project_asset_presign(
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
  update public.project_assets as asset
  set
    state = 'awaiting_upload',
    presigned_at = statement_timestamp(),
    capability_digest = null,
    updated_at = statement_timestamp()
  from public.community_projects as project
  where project.id = asset.project_id
    and (
      asset.capability_purpose = 'admin_replacement'
      or (
        asset.capability_purpose = 'community_submission'
        and project.submitted_by_community = true
        and project.is_published = false
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

-- ---------------------------------------------------------------------------
-- Admin project RPCs. Same doctrine as 0007: security definer, is_admin()
-- self-check, EXECUTE granted to authenticated only.
-- ---------------------------------------------------------------------------

create or replace function public.admin_create_community_project(
  p_name text,
  p_description text,
  p_url text,
  p_category text,
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
  if p_name is null or char_length(btrim(p_name)) not between 2 and 80
    or p_description is null
    or char_length(btrim(p_description)) not between 20 and 600
    or p_url is null
    or char_length(p_url) not between 12 and 300
    or p_url !~ '^https://[^[:space:]]+\.[^[:space:]]+$'
    or p_author_name is not null and char_length(p_author_name) > 120 then
    raise exception using errcode = '22023', message = 'invalid project content';
  end if;
  if p_category is null
    or p_category not in (
      'utility', 'infrastructure', 'information', 'tooling', 'community'
    ) then
    raise exception using errcode = '22023', message = 'invalid project category';
  end if;

  insert into public.community_projects (
    id, name, description, url, category, author_name,
    submitted_by_community, is_published, published_at
  ) values (
    v_id,
    btrim(p_name),
    btrim(p_description),
    p_url,
    p_category,
    nullif(btrim(coalesce(p_author_name, '')), ''),
    false,
    false,
    null
  );
  return v_id;
end;
$$;

create or replace function public.admin_save_community_project(
  p_project_id uuid,
  p_name text,
  p_description text,
  p_url text,
  p_category text,
  p_author_name text
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
  if p_project_id is null
    or p_name is null or char_length(btrim(p_name)) not between 2 and 80
    or p_description is null
    or char_length(btrim(p_description)) not between 20 and 600
    or p_url is null
    or char_length(p_url) not between 12 and 300
    or p_url !~ '^https://[^[:space:]]+\.[^[:space:]]+$'
    or p_author_name is not null and char_length(p_author_name) > 120 then
    raise exception using errcode = '22023', message = 'invalid project content';
  end if;
  if p_category is null
    or p_category not in (
      'utility', 'infrastructure', 'information', 'tooling', 'community'
    ) then
    raise exception using errcode = '22023', message = 'invalid project category';
  end if;

  update public.community_projects
  set
    name = btrim(p_name),
    description = btrim(p_description),
    url = p_url,
    category = p_category,
    author_name = nullif(btrim(coalesce(p_author_name, '')), '')
  where id = p_project_id;
  return found;
end;
$$;

create or replace function public.admin_begin_project_asset_replacement(
  p_project_id uuid,
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
  if p_project_id is null then
    raise exception using errcode = '22023', message = 'invalid project asset';
  end if;
  if not exists (
    select 1 from public.community_projects where id = p_project_id
  ) then
    raise exception using errcode = 'P0002', message = 'project not found';
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
    raise exception using errcode = '22023', message = 'invalid project asset';
  end if;

  update public.project_assets
  set
    state = 'superseded',
    capability_digest = null,
    presigned_at = coalesce(
      presigned_at,
      capability_expires_at - interval '1 microsecond'
    ),
    failure_reason = null,
    moderation_reason = null
  where project_id = p_project_id
    and asset_kind = 'cover'
    and state in (
      'awaiting_presign', 'awaiting_upload', 'processing', 'ready', 'approved'
    );

  insert into public.project_assets (
    id,
    project_id,
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
    p_project_id,
    p_storage_environment,
    'cover',
    'news/quarantine/' || p_project_id::text || '/' || v_asset_id::text || '/original',
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

create or replace function public.admin_sync_project_asset_result(
  p_project_id uuid,
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
  v_asset public.project_assets%rowtype;
  v_derivative jsonb;
  v_variant_width integer;
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception using errcode = '42501', message = 'admin access required';
  end if;
  if p_project_id is null
    or p_asset_id is null
    or p_storage_environment is null
    or p_storage_environment not in ('development', 'production')
    or p_object_key is null
    or char_length(p_object_key) = 0 then
    raise exception using errcode = '22023', message = 'invalid asset result';
  end if;
  select * into v_asset
  from public.project_assets
  where id = p_asset_id
    and project_id = p_project_id
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
      'news/processed/' || p_project_id::text || '/' || p_asset_id::text || '/result.json'
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
    update public.project_assets
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
        'news/processed/' || p_project_id::text || '/' || p_asset_id::text ||
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
        from public.project_asset_derivatives
        where asset_id = p_asset_id
          and variant_width = v_variant_width
      ) then
      raise exception using errcode = '22023', message = 'invalid asset derivative';
    end if;

    insert into public.project_asset_derivatives (
      project_id,
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
      p_project_id,
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
    select count(*) from public.project_asset_derivatives
    where asset_id = p_asset_id
  ) <> 3 then
    raise exception using errcode = '22023', message = 'incomplete asset derivatives';
  end if;

  update public.project_assets
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

create or replace function public.admin_approve_project_asset(
  p_project_id uuid,
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
  update public.project_assets
  set
    state = 'approved',
    alt_text = btrim(p_alt_text),
    moderated_by = auth.uid(),
    moderated_at = statement_timestamp(),
    moderation_reason = null
  where id = p_asset_id
    and project_id = p_project_id
    and state = 'ready'
    and (
      select count(*) from public.project_asset_derivatives
      where asset_id = p_asset_id
    ) = 3;
  return found;
end;
$$;

create or replace function public.admin_reject_project_asset(
  p_project_id uuid,
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
  update public.project_assets
  set
    state = 'rejected',
    moderated_by = auth.uid(),
    moderated_at = statement_timestamp(),
    moderation_reason = btrim(p_reason),
    failure_reason = null
  where id = p_asset_id
    and project_id = p_project_id
    and state in ('ready', 'approved');
  return found;
end;
$$;

create or replace function public.admin_publish_community_project(
  p_project_id uuid,
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
  v_project public.community_projects%rowtype;
  v_asset public.project_assets%rowtype;
  v_derivative jsonb;
  v_variant_width integer;
  v_selected_asset_id uuid;
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception using errcode = '42501', message = 'admin access required';
  end if;
  select * into v_project
  from public.community_projects
  where id = p_project_id
  for update;
  if not found then
    return false;
  end if;

  v_selected_asset_id := coalesce(p_asset_id, v_project.published_asset_id);
  if v_selected_asset_id is not null then
    select * into v_asset
    from public.project_assets
    where id = v_selected_asset_id
      and project_id = p_project_id
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
            'news/published/' || p_project_id::text || '/' || p_asset_id::text ||
            '/cover-' || v_variant_width::text || 'x' ||
            (case v_variant_width when 640 then '360' when 1024 then '576' else '900' end) ||
            '.webp'
          or coalesce(v_derivative ->> 'publishedVersionId', '') = '' then
          raise exception using errcode = '22023', message = 'invalid asset promotion';
        end if;
        -- First publication stamps the columns; a REPUBLISH after an
        -- unpublish arrives with the same immutable key and version (the
        -- promotion helper reuses the existing S3 object on 412), so an
        -- exact match is accepted as an idempotent no-op instead of
        -- dead-ending the publish forever.
        update public.project_asset_derivatives
        set
          published_key = v_derivative ->> 'publishedKey',
          published_version_id = v_derivative ->> 'publishedVersionId',
          published_at = coalesce(published_at, statement_timestamp())
        where asset_id = p_asset_id
          and variant_width = v_variant_width
          and (
            (published_key is null and published_version_id is null)
            or (
              published_key = v_derivative ->> 'publishedKey'
              and published_version_id = v_derivative ->> 'publishedVersionId'
            )
          );
        if not found then
          raise exception using errcode = '22023', message = 'invalid asset promotion';
        end if;
      end loop;
    elsif p_published_derivatives is not null then
      raise exception using errcode = '22023', message = 'unexpected asset promotion';
    end if;
    if (
      select count(*) from public.project_asset_derivatives
      where asset_id = v_selected_asset_id
        and published_key is not null
        and published_version_id is not null
    ) <> 3 then
      raise exception using errcode = '22023', message = 'asset is not publishable';
    end if;
  elsif p_published_derivatives is not null then
    raise exception using errcode = '22023', message = 'unexpected asset promotion';
  end if;

  if v_project.published_asset_id is not null
    and v_project.published_asset_id is distinct from v_selected_asset_id then
    update public.project_assets
    set state = 'superseded'
    where id = v_project.published_asset_id and state = 'published';
  end if;
  if v_selected_asset_id is not null then
    update public.project_assets
    set state = 'published'
    where id = v_selected_asset_id;
  end if;
  update public.community_projects
  set
    is_published = true,
    published_at = coalesce(published_at, statement_timestamp()),
    published_asset_id = v_selected_asset_id,
    published_asset_alt_text = case
      when v_selected_asset_id is null then null
      else v_asset.alt_text
    end
  where id = p_project_id;
  return true;
end;
$$;

create or replace function public.admin_unpublish_community_project(
  p_project_id uuid
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
  from public.community_projects
  where id = p_project_id
  for update;
  if not found then
    return false;
  end if;
  update public.community_projects
  set
    is_published = false,
    published_at = null,
    published_asset_id = null,
    published_asset_alt_text = null
  where id = p_project_id;
  if v_asset_id is not null then
    -- The one-active-candidate index admits a single non-published cover.
    -- A pending replacement candidate would collide with the demotion below
    -- and abort the whole takedown, so supersede it first: unpublishing is
    -- the kill switch and must never be blocked by a half-finished upload.
    update public.project_assets
    set
      state = 'superseded',
      capability_digest = null,
      presigned_at = coalesce(
        presigned_at,
        capability_expires_at - interval '1 microsecond'
      ),
      failure_reason = null,
      moderation_reason = null
    where project_id = p_project_id
      and asset_kind = 'cover'
      and id <> v_asset_id
      and state in (
        'awaiting_presign', 'awaiting_upload', 'processing', 'ready', 'approved'
      );
    update public.project_assets
    set state = 'approved'
    where id = v_asset_id and state = 'published';
  end if;
  return true;
end;
$$;

create or replace function public.admin_delete_community_project(
  p_project_id uuid
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
    select 1 from public.community_projects
    where id = p_project_id and is_published
  ) then
    raise exception using errcode = '22023', message = 'unpublish project first';
  end if;
  if exists (
    select 1 from public.project_assets where project_id = p_project_id
  ) then
    raise exception using errcode = '22023', message = 'asset cleanup required';
  end if;
  delete from public.community_projects where id = p_project_id;
  return found;
end;
$$;

-- Finalizer for asset-bearing projects: the server deletes the exact recorded
-- S3 object versions first, then calls this with the service-role client.
create or replace function public.delete_community_project_after_asset_cleanup(
  p_project_id uuid
)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.community_projects
    where id = p_project_id and is_published
  ) then
    raise exception using errcode = '22023', message = 'unpublish project first';
  end if;
  delete from public.community_projects where id = p_project_id;
  return found;
end;
$$;

-- ---------------------------------------------------------------------------
-- Forward-replace the two article RPCs that share the same two defects the
-- project review surfaced: (1) republishing a previously published cover
-- dead-ended because the derivative promotion refused already-stamped
-- columns, and (2) unpublishing collided with the one-active-candidate
-- index whenever a replacement candidate was pending. Same signatures, same
-- grants, fixed bodies.
-- ---------------------------------------------------------------------------

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
        -- A republish after an unpublish arrives with the same immutable key
        -- and version (the promotion helper reuses the existing S3 object on
        -- 412); accept the exact match as an idempotent no-op.
        update public.article_asset_derivatives
        set
          published_key = v_derivative ->> 'publishedKey',
          published_version_id = v_derivative ->> 'publishedVersionId',
          published_at = coalesce(published_at, statement_timestamp())
        where asset_id = p_asset_id
          and variant_width = v_variant_width
          and (
            (published_key is null and published_version_id is null)
            or (
              published_key = v_derivative ->> 'publishedKey'
              and published_version_id = v_derivative ->> 'publishedVersionId'
            )
          );
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
    -- Supersede any pending replacement candidate first, so the demotion
    -- below can never collide with the one-active-candidate index and block
    -- the takedown.
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
      and id <> v_asset_id
      and state in (
        'awaiting_presign', 'awaiting_upload', 'processing', 'ready', 'approved'
      );
    update public.article_assets
    set state = 'approved'
    where id = v_asset_id and state = 'published';
  end if;
  return true;
end;
$$;

-- ---------------------------------------------------------------------------
-- Ownership and execution.
-- ---------------------------------------------------------------------------

alter function public.consume_submission_rate_limit(text, text)
owner to postgres;

alter function public.create_community_project_draft(
  text, text, text, text, text, text, text, bigint, text, text
) owner to postgres;
alter function public.claim_project_asset_presign(text, text)
owner to postgres;
alter function public.admin_create_community_project(
  text, text, text, text, text
) owner to postgres;
alter function public.admin_save_community_project(
  uuid, text, text, text, text, text
) owner to postgres;
alter function public.admin_begin_project_asset_replacement(
  uuid, text, text, bigint, text, text
) owner to postgres;
alter function public.admin_sync_project_asset_result(
  uuid, uuid, text, text, text, text, text, text, text, bigint, text,
  integer, integer, jsonb, text
) owner to postgres;
alter function public.admin_approve_project_asset(uuid, uuid, text)
owner to postgres;
alter function public.admin_reject_project_asset(uuid, uuid, text)
owner to postgres;
alter function public.admin_publish_community_project(uuid, uuid, jsonb)
owner to postgres;
alter function public.admin_unpublish_community_project(uuid)
owner to postgres;
alter function public.admin_delete_community_project(uuid)
owner to postgres;
alter function public.delete_community_project_after_asset_cleanup(uuid)
owner to postgres;

revoke all on function public.create_community_project_draft(
  text, text, text, text, text, text, text, bigint, text, text
) from anon, authenticated, service_role, public;
grant execute on function public.create_community_project_draft(
  text, text, text, text, text, text, text, bigint, text, text
) to service_role;

revoke all on function public.claim_project_asset_presign(text, text)
from anon, authenticated, service_role, public;
grant execute on function public.claim_project_asset_presign(text, text)
to service_role;

revoke all on function public.admin_create_community_project(
  text, text, text, text, text
) from anon, authenticated, service_role, public;
grant execute on function public.admin_create_community_project(
  text, text, text, text, text
) to authenticated;

revoke all on function public.admin_save_community_project(
  uuid, text, text, text, text, text
) from anon, authenticated, service_role, public;
grant execute on function public.admin_save_community_project(
  uuid, text, text, text, text, text
) to authenticated;

revoke all on function public.admin_begin_project_asset_replacement(
  uuid, text, text, bigint, text, text
) from anon, authenticated, service_role, public;
grant execute on function public.admin_begin_project_asset_replacement(
  uuid, text, text, bigint, text, text
) to authenticated;

revoke all on function public.admin_sync_project_asset_result(
  uuid, uuid, text, text, text, text, text, text, text, bigint, text,
  integer, integer, jsonb, text
) from anon, authenticated, service_role, public;
grant execute on function public.admin_sync_project_asset_result(
  uuid, uuid, text, text, text, text, text, text, text, bigint, text,
  integer, integer, jsonb, text
) to authenticated;

revoke all on function public.admin_approve_project_asset(uuid, uuid, text)
from anon, authenticated, service_role, public;
grant execute on function public.admin_approve_project_asset(uuid, uuid, text)
to authenticated;

revoke all on function public.admin_reject_project_asset(uuid, uuid, text)
from anon, authenticated, service_role, public;
grant execute on function public.admin_reject_project_asset(uuid, uuid, text)
to authenticated;

revoke all on function public.admin_publish_community_project(uuid, uuid, jsonb)
from anon, authenticated, service_role, public;
grant execute on function public.admin_publish_community_project(uuid, uuid, jsonb)
to authenticated;

revoke all on function public.admin_unpublish_community_project(uuid)
from anon, authenticated, service_role, public;
grant execute on function public.admin_unpublish_community_project(uuid)
to authenticated;

revoke all on function public.admin_delete_community_project(uuid)
from anon, authenticated, service_role, public;
grant execute on function public.admin_delete_community_project(uuid)
to authenticated;

revoke all on function public.delete_community_project_after_asset_cleanup(uuid)
from anon, authenticated, service_role, public;
grant execute on function public.delete_community_project_after_asset_cleanup(uuid)
to service_role;
