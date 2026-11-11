-- One public directory for the status board, explorers, and mining pools.
-- The canonical chain endpoint and trusted quorum remain deployment config.
create table if not exists public.infrastructure_resources (
  id text primary key,
  kind text not null check (kind in ('rpc', 'explorer', 'pool')),
  name text not null check (char_length(name) between 1 and 120),
  description text not null default '' check (char_length(description) <= 500),
  url text,
  pool_endpoint text,
  mining_order integer,
  rpc_host text,
  rpc_path text,
  rpc_role text,
  response_time_label text check (char_length(response_time_label) <= 40),
  display_order integer not null default 0 check (display_order between 0 and 100000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint infrastructure_link_https check (url is null or url ~ '^https://[^[:space:]]+$'),
  constraint infrastructure_rpc_host_format check (
    rpc_host is null or (
      char_length(rpc_host) <= 253
      and rpc_host ~ '^[a-z0-9][a-z0-9.-]*[a-z0-9]$'
      and rpc_host !~ '\.\.'
    )
  ),
  constraint infrastructure_rpc_path_format check (
    rpc_path is null or (char_length(rpc_path) <= 120 and rpc_path ~ '^/[a-zA-Z0-9/_-]*$')
  ),
  constraint infrastructure_canonical_fixed check (
    (id = 'canonical-rpc' and kind = 'rpc' and rpc_host = 'rpc.blockdag.engineering'
      and rpc_path = '/' and rpc_role = 'canonical')
    or (id <> 'canonical-rpc' and rpc_role is distinct from 'canonical')
  )
);

alter table public.infrastructure_resources
  add column if not exists pool_endpoint text;
alter table public.infrastructure_resources
  add column if not exists mining_order integer;
alter table public.infrastructure_resources
  drop constraint if exists infrastructure_resource_shape;
alter table public.infrastructure_resources
  add constraint infrastructure_resource_shape check (
    (kind = 'rpc' and url is null and pool_endpoint is null and mining_order is null and rpc_host is not null and rpc_path is not null
      and rpc_role in ('canonical', 'community', 'flagged', 'legacy'))
    or (kind = 'explorer' and url is not null and pool_endpoint is null and mining_order is null
      and rpc_host is null and rpc_path is null and rpc_role is null and response_time_label is null)
    or (kind = 'pool' and (url is not null or pool_endpoint is not null)
      and rpc_host is null and rpc_path is null and rpc_role is null and response_time_label is null)
  );
alter table public.infrastructure_resources
  drop constraint if exists infrastructure_pool_endpoint_format;
alter table public.infrastructure_resources
  add constraint infrastructure_pool_endpoint_format check (
    pool_endpoint is null or (char_length(pool_endpoint) <= 200
      and pool_endpoint ~ '^stratum\+tcp://[a-zA-Z0-9.-]+:[0-9]{2,5}$')
  );
alter table public.infrastructure_resources
  drop constraint if exists infrastructure_mining_order_range;
alter table public.infrastructure_resources
  add constraint infrastructure_mining_order_range check (mining_order between 0 and 100000);

create unique index if not exists infrastructure_rpc_endpoint_unique
  on public.infrastructure_resources (rpc_host, rpc_path) where kind = 'rpc';
create unique index if not exists infrastructure_resource_url_unique
  on public.infrastructure_resources (kind, url) where kind in ('explorer', 'pool');
create index if not exists infrastructure_resource_order
  on public.infrastructure_resources (kind, display_order, id);

alter table public.infrastructure_resources enable row level security;
revoke all on table public.infrastructure_resources from anon, authenticated, service_role, public;
grant select on table public.infrastructure_resources to anon, authenticated;
grant insert, update, delete on table public.infrastructure_resources to authenticated;

drop policy if exists "infrastructure: public reads" on public.infrastructure_resources;
create policy "infrastructure: public reads"
  on public.infrastructure_resources for select to anon, authenticated using (true);
drop policy if exists "infrastructure: admin inserts" on public.infrastructure_resources;
create policy "infrastructure: admin inserts"
  on public.infrastructure_resources for insert to authenticated
  with check (public.is_admin());
drop policy if exists "infrastructure: admin updates" on public.infrastructure_resources;
create policy "infrastructure: admin updates"
  on public.infrastructure_resources for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
drop policy if exists "infrastructure: admin deletes" on public.infrastructure_resources;
create policy "infrastructure: admin deletes"
  on public.infrastructure_resources for delete to authenticated using (public.is_admin());

insert into public.infrastructure_resources
  (id, kind, name, description, url, rpc_host, rpc_path, rpc_role,
   response_time_label, display_order)
values
  ('canonical-rpc', 'rpc', 'rpc.blockdag.engineering', 'The canonical public JSON-RPC endpoint the community operates.', null, 'rpc.blockdag.engineering', '/', 'canonical', null, 10),
  ('bdag-us-east', 'rpc', 'rpc.east.bdag-us.org', 'Community-run public RPC node (BDAG-US, east region).', null, 'rpc.east.bdag-us.org', '/', 'community', null, 20),
  ('bdag-us-west', 'rpc', 'rpc.west.bdag-us.org', 'Community-run public RPC node (BDAG-US, west region).', null, 'rpc.west.bdag-us.org', '/', 'community', null, 30),
  ('bdag-us-brazil', 'rpc', 'rpc.brazil.bdag-us.org', 'Community-run public RPC node (BDAG-US, Brazil region).', null, 'rpc.brazil.bdag-us.org', '/', 'community', null, 40),
  ('bdag-us-england', 'rpc', 'rpc.england.bdag-us.org', 'Community-run public RPC node (BDAG-US, England region).', null, 'rpc.england.bdag-us.org', '/', 'community', null, 50),
  ('cms', 'rpc', 'rpc.cms-mining-pool.net', 'CMS Mining Pool community public RPC node.', null, 'rpc.cms-mining-pool.net', '/', 'community', null, 60),
  ('dvdmining', 'rpc', 'rpc.dvdmining.com', 'Community-run public RPC node.', null, 'rpc.dvdmining.com', '/', 'community', null, 70),
  ('capedag', 'rpc', 'rpc.capedag.com', 'Community-run public RPC node.', null, 'rpc.capedag.com', '/', 'community', null, 80),
  ('rms', 'rpc', 'rms-bdag-rpc.de/api/rpc-live', 'RMS community public RPC node.', null, 'rms-bdag-rpc.de', '/api/rpc-live', 'community', null, 90),
  ('welshdag', 'rpc', 'rpc.welshdag.trade', 'WelshDAG community public RPC node.', null, 'rpc.welshdag.trade', '/', 'community', null, 100),
  ('bdagexplorer', 'rpc', 'rpc.bdagexplorer.com', 'BDAG Explorer community public RPC node.', null, 'rpc.bdagexplorer.com', '/', 'community', null, 110),
  ('bdagscan-fork', 'rpc', 'rpc.bdagscan.com', 'The fork. Claims chain ID 1404 but serves a diverged chain. Do not use it for balances, deposits, or mining.', null, 'rpc.bdagscan.com', '/', 'flagged', 'Fork', 120),
  ('works-legacy', 'rpc', 'rpc.blockdag.works', 'Retired legacy endpoint from older documentation.', null, 'rpc.blockdag.works', '/', 'legacy', 'Deprecated', 130),
  ('odins-explorer', 'explorer', 'Odin''s Explorer', '', 'https://odinsexplorer.app', null, null, null, null, 10),
  ('rms-chainpulse', 'explorer', 'RMS ChainPulse', '', 'https://rms-bdag-rpc.de/', null, null, null, null, 20),
  ('bdag-explorer', 'explorer', 'BDAG Explorer', '', 'https://explorer.bdagexplorer.com/', null, null, null, null, 30),
  ('welshdag-pool', 'pool', 'WelshDAG', '', 'https://welshdag.trade/', null, null, null, null, 10),
  ('capedag-pool', 'pool', 'CapeDAG', '', 'https://capedag.com', null, null, null, null, 20)
on conflict (id) do nothing;

insert into public.infrastructure_resources
  (id, kind, name, pool_endpoint, mining_order, display_order)
values
  ('bdag-us-east-pool', 'pool', 'BDAG-US East', 'stratum+tcp://east.bdag-us.org:3334', 10, 100),
  ('bdag-us-west-pool', 'pool', 'BDAG-US West', 'stratum+tcp://west.bdag-us.org:3334', 20, 110)
on conflict (id) do nothing;
update public.infrastructure_resources set
  pool_endpoint = 'stratum+tcp://pool.capedag.com:3334', mining_order = 30
where id = 'capedag-pool' and pool_endpoint is null;
update public.infrastructure_resources set
  pool_endpoint = 'stratum+tcp://stratum.welshdag.trade:3334', mining_order = 40
where id = 'welshdag-pool' and pool_endpoint is null;

-- Append-only operator activity. Only authenticated admins can read it.
create table if not exists public.admin_activity (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid not null,
  actor_email text not null,
  action text not null,
  entity_type text not null,
  entity_id text not null,
  entity_label text not null,
  occurred_at timestamptz not null default now()
);
create index if not exists admin_activity_recent on public.admin_activity (occurred_at desc, id desc);
alter table public.admin_activity enable row level security;
revoke all on table public.admin_activity from anon, authenticated, service_role, public;
grant select on table public.admin_activity to authenticated;
drop policy if exists "admin activity: admin reads" on public.admin_activity;
create policy "admin activity: admin reads" on public.admin_activity
  for select to authenticated using (public.is_admin());

create schema if not exists private;
create or replace function private.record_admin_activity()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  row_value jsonb;
  previous_value jsonb;
  event_action text;
  event_label text;
  actor_id uuid;
  actor_mail text;
begin
  actor_id := auth.uid();
  if actor_id is null or not public.is_admin() then
    return coalesce(new, old);
  end if;

  row_value := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  previous_value := case when tg_op = 'UPDATE' then to_jsonb(old) else null end;
  event_action := lower(tg_op);

  if tg_table_name in ('article_assets', 'project_assets') then
    if tg_op <> 'UPDATE' or row_value->>'state' is not distinct from previous_value->>'state'
      or row_value->>'state' not in ('approved', 'rejected') then
      return coalesce(new, old);
    end if;
    event_action := case when row_value->>'state' = 'approved' then 'approve' else 'reject' end;
    event_label := coalesce(row_value->>'alt_text', 'Cover image');
  elsif tg_table_name in ('news_articles', 'community_projects') then
    if tg_op = 'UPDATE' then
      if row_value->>'is_published' is distinct from previous_value->>'is_published' then
        event_action := case when row_value->>'is_published' = 'true' then 'publish' else 'unpublish' end;
      else
        event_action := 'edit';
      end if;
    end if;
    event_label := coalesce(row_value->>'title', row_value->>'name', 'Untitled');
  elsif tg_table_name = 'infrastructure_resources' then
    if tg_op = 'UPDATE' then event_action := 'edit'; end if;
    event_label := coalesce(row_value->>'name', 'Unnamed resource');
  elsif tg_table_name in ('contact_messages', 'suggestion_messages') then
    if tg_op <> 'DELETE' then return coalesce(new, old); end if;
    event_label := case when tg_table_name = 'contact_messages'
      then coalesce(row_value->>'name', 'Contact message')
      else coalesce(row_value->>'author_name', 'Suggestion') end;
  else
    return coalesce(new, old);
  end if;

  select email into actor_mail from auth.users where id = actor_id;
  if actor_mail is null then return coalesce(new, old); end if;
  insert into public.admin_activity
    (actor_user_id, actor_email, action, entity_type, entity_id, entity_label)
  values
    (actor_id, actor_mail, event_action, tg_table_name, row_value->>'id', event_label);
  return coalesce(new, old);
end;
$$;
revoke all on function private.record_admin_activity() from anon, authenticated, service_role, public;

drop trigger if exists admin_activity_infrastructure on public.infrastructure_resources;
create trigger admin_activity_infrastructure after insert or update or delete
  on public.infrastructure_resources for each row execute function private.record_admin_activity();
drop trigger if exists admin_activity_articles on public.news_articles;
create trigger admin_activity_articles after insert or update or delete
  on public.news_articles for each row execute function private.record_admin_activity();
drop trigger if exists admin_activity_article_assets on public.article_assets;
create trigger admin_activity_article_assets after update
  on public.article_assets for each row execute function private.record_admin_activity();
drop trigger if exists admin_activity_projects on public.community_projects;
create trigger admin_activity_projects after insert or update or delete
  on public.community_projects for each row execute function private.record_admin_activity();
drop trigger if exists admin_activity_project_assets on public.project_assets;
create trigger admin_activity_project_assets after update
  on public.project_assets for each row execute function private.record_admin_activity();
drop trigger if exists admin_activity_contacts on public.contact_messages;
create trigger admin_activity_contacts after delete
  on public.contact_messages for each row execute function private.record_admin_activity();
drop trigger if exists admin_activity_suggestions on public.suggestion_messages;
create trigger admin_activity_suggestions after delete
  on public.suggestion_messages for each row execute function private.record_admin_activity();
