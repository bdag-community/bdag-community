-- 0009_chain_aggregates.sql
-- Durable explorer reports and the transaction counting cursor.
--
-- Explorer reports remain append only for audit. The singleton cursor advances
-- only when both its height and running total are monotonic. Public roles have
-- no policy and no table access.

create table if not exists public.chain_aggregate_checkpoints (
  id                   uuid primary key default gen_random_uuid(),
  record_kind          text not null,
  height               bigint not null,
  height_source        text,
  total_transactions   bigint,
  total_addresses      bigint,
  coin_supply          numeric(30, 8),
  transactions_trusted boolean not null default false,
  addresses_trusted    boolean not null default false,
  supply_trusted       boolean not null default false,
  running_total        bigint,
  captured_at          timestamptz not null default statement_timestamp(),
  constraint chain_aggregate_record_kind_check
    check (record_kind in ('explorer_report', 'transaction_cursor')),
  constraint chain_aggregate_height_check
    check (height >= 0),
  constraint chain_aggregate_height_source_check
    check (height_source is null or height_source in ('explorer', 'rpc')),
  constraint chain_aggregate_values_check
    check (
      (total_transactions is null or total_transactions >= 0)
      and (total_addresses is null or total_addresses >= 0)
      and (coin_supply is null or coin_supply > 0)
      and (running_total is null or running_total >= 0)
    ),
  constraint chain_aggregate_shape_check
    check (
      (
        record_kind = 'explorer_report'
        and height_source is not null
        and running_total is null
      )
      or
      (
        record_kind = 'transaction_cursor'
        and height_source is null
        and total_transactions is null
        and total_addresses is null
        and coin_supply is null
        and not transactions_trusted
        and not addresses_trusted
        and not supply_trusted
        and running_total is not null
      )
    )
);

create index if not exists chain_aggregate_reports_captured_idx
  on public.chain_aggregate_checkpoints (captured_at desc)
  where record_kind = 'explorer_report';

create unique index if not exists chain_aggregate_cursor_singleton_idx
  on public.chain_aggregate_checkpoints (record_kind)
  where record_kind = 'transaction_cursor';

revoke all on table public.chain_aggregate_checkpoints
from anon, authenticated, service_role, public;
grant usage on schema public to service_role;
grant select on table public.chain_aggregate_checkpoints to service_role;

alter table public.chain_aggregate_checkpoints enable row level security;

create or replace function public.record_chain_aggregate_report(
  p_height bigint,
  p_height_source text,
  p_total_transactions bigint,
  p_total_addresses bigint,
  p_coin_supply numeric,
  p_transactions_trusted boolean,
  p_addresses_trusted boolean,
  p_supply_trusted boolean
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
  if p_height is null or p_height < 0 then
    raise exception using errcode = '22023', message = 'invalid aggregate height';
  end if;
  if p_height_source is null or p_height_source not in ('explorer', 'rpc') then
    raise exception using errcode = '22023', message = 'invalid height source';
  end if;

  lock table public.chain_aggregate_checkpoints in share row exclusive mode;

  v_transactions_trusted :=
    coalesce(p_transactions_trusted, false)
    and p_total_transactions is not null
    and p_total_transactions >= 0
    and not exists (
      select 1
      from public.chain_aggregate_checkpoints previous
      where (
          previous.record_kind = 'explorer_report'
          and previous.transactions_trusted
          and (
            previous.height > p_height
            or previous.total_transactions > p_total_transactions
          )
        )
        or (
          previous.record_kind = 'transaction_cursor'
          and (
            previous.height > p_height
            or previous.running_total > p_total_transactions
          )
        )
    );

  v_addresses_trusted :=
    coalesce(p_addresses_trusted, false)
    and p_total_addresses is not null
    and p_total_addresses >= 0
    and not exists (
      select 1
      from public.chain_aggregate_checkpoints previous
      where previous.record_kind = 'explorer_report'
        and previous.addresses_trusted
        and (
          previous.height > p_height
          or previous.total_addresses > p_total_addresses
        )
    );

  v_supply_trusted :=
    coalesce(p_supply_trusted, false)
    and p_coin_supply is not null
    and p_coin_supply > 0
    and p_coin_supply <= 150000000000
    and not exists (
      select 1
      from public.chain_aggregate_checkpoints previous
      where previous.record_kind = 'explorer_report'
        and previous.supply_trusted
        and (
          previous.height > p_height
          or previous.coin_supply > p_coin_supply
        )
    );

  insert into public.chain_aggregate_checkpoints as inserted_report (
    record_kind,
    height,
    height_source,
    total_transactions,
    total_addresses,
    coin_supply,
    transactions_trusted,
    addresses_trusted,
    supply_trusted,
    captured_at
  ) values (
    'explorer_report',
    p_height,
    p_height_source,
    p_total_transactions,
    p_total_addresses,
    p_coin_supply,
    v_transactions_trusted,
    v_addresses_trusted,
    v_supply_trusted,
    clock_timestamp()
  )
  returning inserted_report.id into v_id;

  delete from public.chain_aggregate_checkpoints old_report
  where old_report.record_kind = 'explorer_report'
    and old_report.id not in (
      select recent.id
      from public.chain_aggregate_checkpoints recent
      where recent.record_kind = 'explorer_report'
      order by recent.captured_at desc, recent.id desc
      limit 50
    );

  return query
  select
    v_id,
    v_transactions_trusted,
    v_addresses_trusted,
    v_supply_trusted;
end;
$$;

alter function public.record_chain_aggregate_report(
  bigint, text, bigint, bigint, numeric, boolean, boolean, boolean
) owner to postgres;
revoke all on function public.record_chain_aggregate_report(
  bigint, text, bigint, bigint, numeric, boolean, boolean, boolean
) from anon, authenticated, service_role, public;
grant execute on function public.record_chain_aggregate_report(
  bigint, text, bigint, bigint, numeric, boolean, boolean, boolean
) to service_role;

create or replace function public.advance_chain_transaction_cursor(
  p_height bigint,
  p_running_total bigint
)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if p_height is null or p_height < 0 then
    raise exception using errcode = '22023', message = 'invalid cursor height';
  end if;
  if p_running_total is null or p_running_total < 0 then
    raise exception using errcode = '22023', message = 'invalid cursor total';
  end if;

  insert into public.chain_aggregate_checkpoints as current_cursor (
    record_kind,
    height,
    running_total
  ) values (
    'transaction_cursor',
    p_height,
    p_running_total
  )
  on conflict (record_kind)
    where record_kind = 'transaction_cursor'
  do update set
    height = excluded.height,
    running_total = excluded.running_total,
    captured_at = statement_timestamp()
  where current_cursor.height < excluded.height
    and current_cursor.running_total <= excluded.running_total;

  return found;
end;
$$;

alter function public.advance_chain_transaction_cursor(bigint, bigint)
owner to postgres;
revoke all on function public.advance_chain_transaction_cursor(bigint, bigint)
from anon, authenticated, service_role, public;
grant execute on function public.advance_chain_transaction_cursor(bigint, bigint)
to service_role;
