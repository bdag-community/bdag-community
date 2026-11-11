-- 0014_chain_live_checkpoints.sql
-- Durable last-known-good values for the three canonical RPC tiles.
--
-- The public site reads rpc.blockdag.engineering live. This singleton is only
-- the cold-start/outage fallback, so an older block height can never replace a
-- newer one. Peer and producer counts may legitimately move in either direction
-- and are refreshed whenever the canonical height is current or newer.

create table if not exists public.chain_live_checkpoints (
  singleton      boolean primary key default true check (singleton),
  block_height   bigint not null check (block_height >= 0),
  peers          bigint check (peers is null or peers >= 0),
  active_miners  bigint check (active_miners is null or active_miners >= 0),
  captured_at    timestamptz not null default statement_timestamp()
);

revoke all on table public.chain_live_checkpoints
from anon, authenticated, service_role, public;
grant usage on schema public to service_role;
grant select on table public.chain_live_checkpoints to service_role;

alter table public.chain_live_checkpoints enable row level security;

create or replace function public.persist_chain_live_checkpoint(
  p_block_height bigint,
  p_peers bigint,
  p_active_miners bigint
)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_changed boolean;
begin
  if p_block_height is null or p_block_height < 0 then
    raise exception using errcode = '22023', message = 'invalid live block height';
  end if;
  if p_peers is not null and p_peers < 0 then
    raise exception using errcode = '22023', message = 'invalid live peer count';
  end if;
  if p_active_miners is not null and p_active_miners < 0 then
    raise exception using errcode = '22023', message = 'invalid live producer count';
  end if;

  insert into public.chain_live_checkpoints as current_checkpoint (
    singleton,
    block_height,
    peers,
    active_miners,
    captured_at
  ) values (
    true,
    p_block_height,
    p_peers,
    p_active_miners,
    clock_timestamp()
  )
  on conflict (singleton) do update
  set
    block_height = excluded.block_height,
    peers = coalesce(excluded.peers, current_checkpoint.peers),
    active_miners = coalesce(
      excluded.active_miners,
      current_checkpoint.active_miners
    ),
    captured_at = excluded.captured_at
  where current_checkpoint.block_height <= excluded.block_height;

  get diagnostics v_changed = row_count;
  return v_changed;
end;
$$;

alter function public.persist_chain_live_checkpoint(bigint, bigint, bigint)
owner to postgres;
revoke all on function public.persist_chain_live_checkpoint(bigint, bigint, bigint)
from anon, authenticated, service_role, public;
grant execute on function public.persist_chain_live_checkpoint(bigint, bigint, bigint)
to service_role;
