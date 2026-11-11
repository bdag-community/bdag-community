-- 0012_project_description_limit.sql
-- Tighten the project description to 200 characters. The public card clamps
-- the description at three lines, and 200 characters is what actually fits
-- there, so the writer hits the limit while typing instead of publishing
-- text the card will truncate. 0011 already shipped to the hosted project,
-- so the change is a forward migration: constraint plus the three writer
-- RPCs, same signatures, same grants.

-- Only days-old operator test rows can exist at this point, so a defensive
-- trim is safe and keeps the tightened constraint addable.
update public.community_projects
set description = btrim(left(description, 200))
where char_length(btrim(description)) > 200;

alter table public.community_projects
  drop constraint if exists community_projects_description_check;
alter table public.community_projects
  add constraint community_projects_description_check
  check (char_length(btrim(description)) between 20 and 200);

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
    or char_length(btrim(p_description)) not between 20 and 200 then
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
    or char_length(btrim(p_description)) not between 20 and 200
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
    or char_length(btrim(p_description)) not between 20 and 200
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

alter function public.create_community_project_draft(
  text, text, text, text, text, text, text, bigint, text, text
) owner to postgres;
alter function public.admin_create_community_project(
  text, text, text, text, text
) owner to postgres;
alter function public.admin_save_community_project(
  uuid, text, text, text, text, text
) owner to postgres;
