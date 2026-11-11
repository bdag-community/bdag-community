-- 0015_chain_consensus_snapshots.sql
-- Durable authority for an independently operated RPC quorum.
--
-- Migration 0014 remains intact for blue-green compatibility. This isolated
-- singleton accepts only chain 1404 snapshots backed by at least two distinct
-- RPC sources and two distinct operators. Older heads can never replace a
-- newer accepted head.

alter table public.chain_aggregate_checkpoints
  add column if not exists source_id text,
  add column if not exists verification_height bigint,
  add column if not exists verification_hash text,
  add column if not exists canonical_transactions_floor boolean not null default false,
  add column if not exists canonical_addresses_floor boolean not null default false,
  add column if not exists canonical_supply_floor boolean not null default false;

alter table public.chain_aggregate_checkpoints
  add constraint chain_aggregate_explorer_proof_shape_check check (
    (
      source_id is null
      and verification_height is null
      and verification_hash is null
    )
    or (
      record_kind = 'explorer_report'
      and source_id ~ '^[a-z0-9][a-z0-9-]{0,79}$'
      and verification_height >= 0
      and verification_height <= height
      and verification_hash ~ '^0x[0-9a-fA-F]{64}$'
    )
  );

alter table public.chain_aggregate_checkpoints
  add constraint chain_aggregate_durable_floor_shape_check check (
    (not canonical_transactions_floor or transactions_trusted)
    and (not canonical_addresses_floor or addresses_trusted)
    and (not canonical_supply_floor or supply_trusted)
  );

update public.chain_aggregate_checkpoints checkpoint
set canonical_transactions_floor = true
where checkpoint.id = (
  select candidate.id
  from public.chain_aggregate_checkpoints candidate
  where candidate.record_kind = 'explorer_report'
    and candidate.transactions_trusted
  order by candidate.total_transactions desc nulls last,
    candidate.height desc,
    candidate.captured_at desc,
    candidate.id desc
  limit 1
);

update public.chain_aggregate_checkpoints checkpoint
set canonical_addresses_floor = true
where checkpoint.id = (
  select candidate.id
  from public.chain_aggregate_checkpoints candidate
  where candidate.record_kind = 'explorer_report'
    and candidate.addresses_trusted
  order by candidate.total_addresses desc nulls last,
    candidate.height desc,
    candidate.captured_at desc,
    candidate.id desc
  limit 1
);

update public.chain_aggregate_checkpoints checkpoint
set canonical_supply_floor = true
where checkpoint.id = (
  select candidate.id
  from public.chain_aggregate_checkpoints candidate
  where candidate.record_kind = 'explorer_report'
    and candidate.supply_trusted
  order by candidate.coin_supply desc nulls last,
    candidate.height desc,
    candidate.captured_at desc,
    candidate.id desc
  limit 1
);

create function public.preserve_chain_aggregate_durable_floor()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.canonical_transactions_floor
    or old.canonical_addresses_floor
    or old.canonical_supply_floor then
    return null;
  end if;
  return old;
end;
$$;

alter function public.preserve_chain_aggregate_durable_floor() owner to postgres;
revoke all on function public.preserve_chain_aggregate_durable_floor()
  from anon, authenticated, service_role, public;

create trigger preserve_chain_aggregate_durable_floor_before_delete
before delete on public.chain_aggregate_checkpoints
for each row execute function public.preserve_chain_aggregate_durable_floor();

create function public.prune_chain_aggregate_history()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_durable_count integer;
  v_recent_limit integer;
begin
  if new.record_kind <> 'explorer_report' then
    return new;
  end if;

  if new.transactions_trusted then
    update public.chain_aggregate_checkpoints checkpoint
    set canonical_transactions_floor = checkpoint.id = new.id
    where checkpoint.canonical_transactions_floor or checkpoint.id = new.id;
  end if;
  if new.addresses_trusted then
    update public.chain_aggregate_checkpoints checkpoint
    set canonical_addresses_floor = checkpoint.id = new.id
    where checkpoint.canonical_addresses_floor or checkpoint.id = new.id;
  end if;
  if new.supply_trusted then
    update public.chain_aggregate_checkpoints checkpoint
    set canonical_supply_floor = checkpoint.id = new.id
    where checkpoint.canonical_supply_floor or checkpoint.id = new.id;
  end if;

  select count(*)::integer
  into v_durable_count
  from public.chain_aggregate_checkpoints checkpoint
  where checkpoint.record_kind = 'explorer_report'
    and (
      checkpoint.canonical_transactions_floor
      or checkpoint.canonical_addresses_floor
      or checkpoint.canonical_supply_floor
    );
  v_recent_limit := greatest(0, 50 - v_durable_count);

  delete from public.chain_aggregate_checkpoints old_report
  where old_report.record_kind = 'explorer_report'
    and not old_report.canonical_transactions_floor
    and not old_report.canonical_addresses_floor
    and not old_report.canonical_supply_floor
    and old_report.id not in (
      select recent.id
      from public.chain_aggregate_checkpoints recent
      where recent.record_kind = 'explorer_report'
        and not recent.canonical_transactions_floor
        and not recent.canonical_addresses_floor
        and not recent.canonical_supply_floor
      order by recent.captured_at desc, recent.id desc
      limit v_recent_limit
    );

  return new;
end;
$$;

alter function public.prune_chain_aggregate_history() owner to postgres;
revoke all on function public.prune_chain_aggregate_history()
  from anon, authenticated, service_role, public;

create trigger prune_chain_aggregate_history_after_insert
after insert on public.chain_aggregate_checkpoints
for each row execute function public.prune_chain_aggregate_history();

create or replace function public.record_chain_aggregate_report_v2(
  p_height bigint,
  p_height_source text,
  p_total_transactions bigint,
  p_total_addresses bigint,
  p_coin_supply numeric,
  p_transactions_trusted boolean,
  p_addresses_trusted boolean,
  p_supply_trusted boolean,
  p_source_id text,
  p_verification_height bigint,
  p_verification_hash text,
  p_observed_at timestamptz
)
returns table (
  id uuid,
  transactions_trusted boolean,
  addresses_trusted boolean,
  supply_trusted boolean
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_transactions_trusted boolean;
  v_addresses_trusted boolean;
  v_supply_trusted boolean;
begin
  if p_source_id is null
    or p_source_id !~ '^[a-z0-9][a-z0-9-]{0,79}$'
    or p_verification_height is null
    or p_verification_height < 0
    or p_verification_height > p_height
    or p_verification_hash is null
    or p_verification_hash !~ '^0x[0-9a-fA-F]{64}$'
    or p_observed_at is null
    or p_observed_at > clock_timestamp() + interval '5 minutes' then
    raise exception using
      errcode = '22023',
      message = 'invalid explorer verification proof';
  end if;

  lock table public.chain_aggregate_checkpoints in share row exclusive mode;

  select checkpoint.id,
    checkpoint.transactions_trusted,
    checkpoint.addresses_trusted,
    checkpoint.supply_trusted
  into v_id,
    v_transactions_trusted,
    v_addresses_trusted,
    v_supply_trusted
  from public.chain_aggregate_checkpoints checkpoint
  where checkpoint.record_kind = 'explorer_report'
    and checkpoint.height = p_height
    and checkpoint.height_source = p_height_source
    and checkpoint.source_id = p_source_id
    and checkpoint.verification_height = p_verification_height
    and checkpoint.verification_hash = lower(p_verification_hash)
    and checkpoint.captured_at = p_observed_at
    and checkpoint.total_transactions is not distinct from p_total_transactions
    and checkpoint.total_addresses is not distinct from p_total_addresses
    and checkpoint.coin_supply is not distinct from
      p_coin_supply::numeric(30, 8)
  order by checkpoint.captured_at desc, checkpoint.id desc
  limit 1;

  if found then
    return query select
      v_id,
      v_transactions_trusted,
      v_addresses_trusted,
      v_supply_trusted;
    return;
  end if;

  select recorded.id,
    recorded.transactions_trusted,
    recorded.addresses_trusted,
    recorded.supply_trusted
  into strict v_id,
    v_transactions_trusted,
    v_addresses_trusted,
    v_supply_trusted
  from public.record_chain_aggregate_report(
    p_height,
    p_height_source,
    p_total_transactions,
    p_total_addresses,
    p_coin_supply,
    p_transactions_trusted and p_source_id = 'canonical-explorer',
    p_addresses_trusted and p_source_id = 'canonical-explorer',
    p_supply_trusted and p_source_id = 'canonical-explorer'
  ) as recorded;

  update public.chain_aggregate_checkpoints
  set source_id = p_source_id,
    verification_height = p_verification_height,
    verification_hash = lower(p_verification_hash),
    captured_at = p_observed_at
  where chain_aggregate_checkpoints.id = v_id;

  if v_transactions_trusted then
    update public.chain_aggregate_checkpoints checkpoint
    set canonical_transactions_floor = checkpoint.id = v_id
    where checkpoint.canonical_transactions_floor or checkpoint.id = v_id;
  end if;
  if v_addresses_trusted then
    update public.chain_aggregate_checkpoints checkpoint
    set canonical_addresses_floor = checkpoint.id = v_id
    where checkpoint.canonical_addresses_floor or checkpoint.id = v_id;
  end if;
  if v_supply_trusted then
    update public.chain_aggregate_checkpoints checkpoint
    set canonical_supply_floor = checkpoint.id = v_id
    where checkpoint.canonical_supply_floor or checkpoint.id = v_id;
  end if;

  delete from public.chain_aggregate_checkpoints old_report
  where old_report.record_kind = 'explorer_report'
    and not old_report.canonical_transactions_floor
    and not old_report.canonical_addresses_floor
    and not old_report.canonical_supply_floor
    and old_report.id not in (
      select recent.id
      from public.chain_aggregate_checkpoints recent
      where recent.record_kind = 'explorer_report'
        and not recent.canonical_transactions_floor
        and not recent.canonical_addresses_floor
        and not recent.canonical_supply_floor
      order by recent.captured_at desc, recent.id desc
      limit 47
    );

  return query select
    v_id,
    v_transactions_trusted,
    v_addresses_trusted,
    v_supply_trusted;
end;
$$;

alter function public.record_chain_aggregate_report_v2(
  bigint, text, bigint, bigint, numeric, boolean, boolean, boolean,
  text, bigint, text, timestamptz
) owner to postgres;
revoke all on function public.record_chain_aggregate_report_v2(
  bigint, text, bigint, bigint, numeric, boolean, boolean, boolean,
  text, bigint, text, timestamptz
) from anon, authenticated, service_role, public;
grant execute on function public.record_chain_aggregate_report_v2(
  bigint, text, bigint, bigint, numeric, boolean, boolean, boolean,
  text, bigint, text, timestamptz
) to service_role;

create table if not exists public.chain_consensus_snapshots (
  singleton            boolean primary key default true check (singleton),
  chain_id              bigint not null default 1404 check (chain_id = 1404),
  block_height          bigint not null check (block_height >= 0),
  block_hash            text not null check (
    block_hash ~ '^0x[0-9a-fA-F]{64}$'
  ),
  peers                 bigint check (peers is null or peers >= 0),
  peer_source           text,
  active_miners         bigint check (
    active_miners is null or active_miners >= 0
  ),
  miner_sample_anchor   bigint check (
    miner_sample_anchor is null or miner_sample_anchor >= 0
  ),
  rpc_source_ids        text[] not null check (
    cardinality(rpc_source_ids) >= 2
  ),
  rpc_operator_ids      text[] not null check (
    cardinality(rpc_operator_ids) >= 2
  ),
  rpc_observed_at       timestamptz not null,
  published_at          timestamptz not null default statement_timestamp(),
  constraint chain_consensus_peer_shape_check check (
    (peers is null and peer_source is null)
    or (peers is not null and peer_source is not null)
  ),
  constraint chain_consensus_miner_shape_check check (
    (active_miners is null and miner_sample_anchor is null)
    or (
      active_miners is not null
      and miner_sample_anchor is not null
      and miner_sample_anchor <= block_height
    )
  )
);

revoke all on table public.chain_consensus_snapshots
from anon, authenticated, service_role, public;
grant usage on schema public to service_role;
grant select on table public.chain_consensus_snapshots to service_role;

alter table public.chain_consensus_snapshots enable row level security;

create or replace function public.publish_chain_consensus_snapshot(
  p_chain_id bigint,
  p_block_height bigint,
  p_block_hash text,
  p_peers bigint,
  p_peer_source text,
  p_active_miners bigint,
  p_miner_sample_anchor bigint,
  p_rpc_source_ids text[],
  p_rpc_operator_ids text[],
  p_rpc_observed_at timestamptz
)
returns setof public.chain_consensus_snapshots
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_snapshot public.chain_consensus_snapshots%rowtype;
  v_source_ids text[];
  v_operator_ids text[];
begin
  if p_chain_id is distinct from 1404 then
    raise exception using
      errcode = '22023',
      message = 'invalid consensus chain id';
  end if;
  if p_block_height is null or p_block_height < 0 then
    raise exception using
      errcode = '22023',
      message = 'invalid consensus block height';
  end if;
  if p_block_hash is null or p_block_hash !~ '^0x[0-9a-fA-F]{64}$' then
    raise exception using
      errcode = '22023',
      message = 'invalid consensus block hash';
  end if;
  if p_peers is not null and p_peers < 0 then
    raise exception using
      errcode = '22023',
      message = 'invalid consensus peer count';
  end if;
  if p_active_miners is not null and p_active_miners < 0 then
    raise exception using
      errcode = '22023',
      message = 'invalid consensus producer count';
  end if;
  if p_rpc_observed_at is null
    or p_rpc_observed_at > clock_timestamp() + interval '5 minutes' then
    raise exception using
      errcode = '22023',
      message = 'invalid consensus observation time';
  end if;

  if p_rpc_source_ids is null or exists (
    select 1
    from unnest(p_rpc_source_ids) as sources(source_id)
    where source_id is null or btrim(source_id) = ''
  ) then
    raise exception using
      errcode = '22023',
      message = 'invalid consensus RPC source';
  end if;
  if (
    select count(distinct btrim(source_id)) < 2
    from unnest(p_rpc_source_ids) as sources(source_id)
  ) then
    raise exception using
      errcode = '22023',
      message = 'insufficient consensus RPC sources';
  end if;

  if p_rpc_operator_ids is null or exists (
    select 1
    from unnest(p_rpc_operator_ids) as operators(operator_id)
    where operator_id is null or btrim(operator_id) = ''
  ) then
    raise exception using
      errcode = '22023',
      message = 'invalid consensus RPC operator';
  end if;
  if (
    select count(distinct btrim(operator_id)) < 2
    from unnest(p_rpc_operator_ids) as operators(operator_id)
  ) then
    raise exception using
      errcode = '22023',
      message = 'insufficient consensus RPC operators';
  end if;

  select array_agg(distinct btrim(source_id) order by btrim(source_id))
  into v_source_ids
  from unnest(p_rpc_source_ids) as sources(source_id);

  select array_agg(distinct btrim(operator_id) order by btrim(operator_id))
  into v_operator_ids
  from unnest(p_rpc_operator_ids) as operators(operator_id);

  if (
    (p_peers is null and p_peer_source is not null)
    or (
      p_peers is not null
      and (
        p_peer_source is null
        or btrim(p_peer_source) = ''
        or not (btrim(p_peer_source) = any(v_source_ids))
      )
    )
  ) then
    raise exception using
      errcode = '22023',
      message = 'invalid consensus peer source';
  end if;

  if (
    (p_active_miners is null and p_miner_sample_anchor is not null)
    or (
      p_active_miners is not null
      and (
        p_miner_sample_anchor is null
        or p_miner_sample_anchor < 0
        or p_miner_sample_anchor > p_block_height
      )
    )
  ) then
    raise exception using
      errcode = '22023',
      message = 'invalid consensus miner sample';
  end if;

  insert into public.chain_consensus_snapshots as current_snapshot (
    singleton,
    chain_id,
    block_height,
    block_hash,
    peers,
    peer_source,
    active_miners,
    miner_sample_anchor,
    rpc_source_ids,
    rpc_operator_ids,
    rpc_observed_at,
    published_at
  ) values (
    true,
    1404,
    p_block_height,
    lower(p_block_hash),
    p_peers,
    case when p_peers is null then null else btrim(p_peer_source) end,
    p_active_miners,
    p_miner_sample_anchor,
    v_source_ids,
    v_operator_ids,
    p_rpc_observed_at,
    clock_timestamp()
  )
  on conflict (singleton) do update
  set
    chain_id = excluded.chain_id,
    block_height = excluded.block_height,
    block_hash = excluded.block_hash,
    peers = case
      when excluded.peers is not null then excluded.peers
      when current_snapshot.peer_source = any(excluded.rpc_source_ids)
        then current_snapshot.peers
      else null
    end,
    peer_source = case
      when excluded.peers is not null then excluded.peer_source
      when current_snapshot.peer_source = any(excluded.rpc_source_ids)
        then current_snapshot.peer_source
      else null
    end,
    active_miners = coalesce(
      excluded.active_miners,
      current_snapshot.active_miners
    ),
    miner_sample_anchor = case
      when excluded.active_miners is null
        then current_snapshot.miner_sample_anchor
      else excluded.miner_sample_anchor
    end,
    rpc_source_ids = excluded.rpc_source_ids,
    rpc_operator_ids = excluded.rpc_operator_ids,
    rpc_observed_at = case
      when current_snapshot.block_height < excluded.block_height
        then excluded.rpc_observed_at
      else greatest(
        current_snapshot.rpc_observed_at,
        excluded.rpc_observed_at
      )
    end,
    published_at = clock_timestamp()
  where current_snapshot.block_height < excluded.block_height
    or (
      current_snapshot.block_height = excluded.block_height
      and current_snapshot.block_hash = excluded.block_hash
      and excluded.rpc_observed_at >= current_snapshot.rpc_observed_at
    )
  returning * into v_snapshot;

  if not found then
    select *
    into strict v_snapshot
    from public.chain_consensus_snapshots
    where singleton;

    if v_snapshot.block_height = p_block_height
      and v_snapshot.block_hash <> lower(p_block_hash) then
      raise exception using
        errcode = '22023',
        message = 'conflicting consensus block hash';
    end if;
  end if;

  return next v_snapshot;
  return;
end;
$$;

alter function public.publish_chain_consensus_snapshot(
  bigint,
  bigint,
  text,
  bigint,
  text,
  bigint,
  bigint,
  text[],
  text[],
  timestamptz
) owner to postgres;
revoke all on function public.publish_chain_consensus_snapshot(
  bigint,
  bigint,
  text,
  bigint,
  text,
  bigint,
  bigint,
  text[],
  text[],
  timestamptz
) from anon, authenticated, service_role, public;
grant execute on function public.publish_chain_consensus_snapshot(
  bigint,
  bigint,
  text,
  bigint,
  text,
  bigint,
  bigint,
  text[],
  text[],
  timestamptz
) to service_role;
