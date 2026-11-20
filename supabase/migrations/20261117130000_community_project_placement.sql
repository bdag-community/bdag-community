alter table public.community_projects
  add column is_featured boolean not null default false,
  add column is_focused boolean not null default false;

create unique index community_projects_single_focus_idx
  on public.community_projects (is_focused) where is_focused;

create function public.admin_set_project_placement(
  p_project_id uuid,
  p_is_featured boolean,
  p_is_focused boolean
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
  if p_project_id is null or p_is_featured is null or p_is_focused is null then
    raise exception using errcode = '22023', message = 'invalid project placement';
  end if;

  -- Serialize placement changes so competing admin requests switch focus
  -- atomically. Lock the target to coordinate with publishing and deletion.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('community_projects:homepage-placement', 0)
  );
  perform 1 from public.community_projects
  where id = p_project_id and is_published
  for update;
  if not found then return false; end if;

  if p_is_focused then
    update public.community_projects
    set is_focused = false
    where is_focused and id <> p_project_id;
  end if;

  update public.community_projects
  set is_featured = p_is_featured, is_focused = p_is_focused
  where id = p_project_id;
  return true;
end;
$$;

alter function public.admin_set_project_placement(uuid, boolean, boolean) owner to postgres;
revoke all on function public.admin_set_project_placement(uuid, boolean, boolean)
  from public, anon, authenticated, service_role;
grant execute on function public.admin_set_project_placement(uuid, boolean, boolean)
  to authenticated;

-- Feature the existing Turbo and main DagSeal listings in place.
update public.community_projects
set is_featured = true
where rtrim(lower(url), '/') in ('https://turbo.macula.co.za', 'https://dagseal.com');

insert into public.community_projects (
  name, description, url, category, submitted_by_community, is_published, published_at
)
select
  'Select Start',
  'Play free browser games, enter tournaments and take on quests. Select Start brings casual gaming to BlockDAG with leaderboards and rewards across arcade, puzzle and action games.',
  'https://selectstart.now',
  'community',
  false,
  true,
  statement_timestamp()
where not exists (
  select 1 from public.community_projects
  where rtrim(lower(url), '/') = 'https://selectstart.now'
);

update public.community_projects
set is_focused = true
where id = (
  select id from public.community_projects
  where rtrim(lower(url), '/') = 'https://selectstart.now' and is_published
  order by published_at desc, id
  limit 1
);
