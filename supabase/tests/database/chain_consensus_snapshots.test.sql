begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(66);

select ok(
  (
    select relrowsecurity
    from pg_class
    where oid = 'public.chain_consensus_snapshots'::regclass
  ),
  'consensus snapshots have RLS enabled'
);
select is(
  (
    select count(*)::integer
    from pg_policy
    where polrelid = 'public.chain_consensus_snapshots'::regclass
  ),
  0,
  'consensus snapshots expose no RLS policy'
);
select ok(
  not has_table_privilege('anon', 'public.chain_consensus_snapshots', 'SELECT')
  and not has_table_privilege(
    'authenticated',
    'public.chain_consensus_snapshots',
    'SELECT'
  )
  and has_table_privilege(
    'service_role',
    'public.chain_consensus_snapshots',
    'SELECT'
  ),
  'only the secret-key role can read consensus snapshots'
);
select ok(
  not has_table_privilege(
    'service_role',
    'public.chain_consensus_snapshots',
    'INSERT,UPDATE,DELETE,TRUNCATE'
  ),
  'the secret-key role cannot mutate consensus snapshots directly'
);
select ok(
  has_function_privilege(
    'service_role',
    'public.publish_chain_consensus_snapshot(bigint,bigint,text,bigint,text,bigint,bigint,text[],text[],timestamp with time zone)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'anon',
    'public.publish_chain_consensus_snapshot(bigint,bigint,text,bigint,text,bigint,bigint,text[],text[],timestamp with time zone)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated',
    'public.publish_chain_consensus_snapshot(bigint,bigint,text,bigint,text,bigint,bigint,text[],text[],timestamp with time zone)',
    'EXECUTE'
  ),
  'consensus publication is service-role-only'
);
select ok(
  (
    select prosecdef and pg_get_userbyid(proowner) = 'postgres'
    from pg_proc
    where oid =
      'public.publish_chain_consensus_snapshot(bigint,bigint,text,bigint,text,bigint,bigint,text[],text[],timestamp with time zone)'::regprocedure
  ),
  'the consensus publication function is postgres-owned security definer'
);
select has_column(
  'public',
  'chain_aggregate_checkpoints',
  'source_id',
  'explorer aggregate checkpoints retain their source provenance'
);
select has_column(
  'public',
  'chain_aggregate_checkpoints',
  'verification_height',
  'explorer aggregate checkpoints retain their verification height'
);
select has_column(
  'public',
  'chain_aggregate_checkpoints',
  'verification_hash',
  'explorer aggregate checkpoints retain their verification hash'
);
select has_column(
  'public',
  'chain_aggregate_checkpoints',
  'canonical_transactions_floor',
  'the canonical transaction floor has an independent retention marker'
);
select has_column(
  'public',
  'chain_aggregate_checkpoints',
  'canonical_addresses_floor',
  'the canonical address floor has an independent retention marker'
);
select has_column(
  'public',
  'chain_aggregate_checkpoints',
  'canonical_supply_floor',
  'the canonical supply floor has an independent retention marker'
);
select ok(
  has_function_privilege(
    'service_role',
    'public.record_chain_aggregate_report_v2(bigint,text,bigint,bigint,numeric,boolean,boolean,boolean,text,bigint,text,timestamp with time zone)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'anon',
    'public.record_chain_aggregate_report_v2(bigint,text,bigint,bigint,numeric,boolean,boolean,boolean,text,bigint,text,timestamp with time zone)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated',
    'public.record_chain_aggregate_report_v2(bigint,text,bigint,bigint,numeric,boolean,boolean,boolean,text,bigint,text,timestamp with time zone)',
    'EXECUTE'
  ),
  'verified explorer report publication is service-role-only'
);
select ok(
  (
    select prosecdef
      and pg_get_userbyid(proowner) = 'postgres'
      and proconfig = array['search_path=""']
    from pg_proc
    where oid =
      'public.record_chain_aggregate_report_v2(bigint,text,bigint,bigint,numeric,boolean,boolean,boolean,text,bigint,text,timestamp with time zone)'::regprocedure
  ),
  'verified explorer publication is postgres-owned security definer with an empty search path'
);

delete from public.chain_consensus_snapshots;
set local role service_role;

select throws_ok(
  $$select public.record_chain_aggregate_report_v2(100, 'explorer', 1000, 100, 10000, true, true, true, 'Invalid Source', 90, '0x' || repeat('f', 64), clock_timestamp())$$,
  '22023',
  'invalid explorer verification proof',
  'malformed explorer provenance fails closed'
);
select throws_ok(
  $$select public.record_chain_aggregate_report_v2(100, 'explorer', 1000, 100, 10000, false, false, false, 'community-blockscout', 90, '0x' || repeat('f', 64), clock_timestamp() + interval '6 minutes')$$,
  '22023',
  'invalid explorer verification proof',
  'a future-dated explorer observation fails closed'
);
select throws_ok(
  $$select public.record_chain_aggregate_report_v2(100, 'explorer', 1000, 100, 10000, false, false, false, 'community-blockscout', 90, '0x' || repeat('f', 64), null)$$,
  '22023',
  'invalid explorer verification proof',
  'an explorer observation time is required'
);
select lives_ok(
  $$select public.record_chain_aggregate_report_v2(
    100,
    'explorer',
    1000,
    100,
    10000.123456789,
    true,
    true,
    true,
    'community-blockscout',
    90,
    '0x' || repeat('f', 64),
    '2026-08-20T07:30:00Z'::timestamptz
  )$$,
  'a verified explorer report can be recorded'
);
select is(
  (
    select checkpoint.source_id
      || ':'
      || checkpoint.verification_height::text
      || ':'
      || checkpoint.verification_hash
    from public.chain_aggregate_checkpoints checkpoint
    where checkpoint.source_id = 'community-blockscout'
    order by checkpoint.captured_at desc, checkpoint.id desc
    limit 1
  ),
  'community-blockscout:90:0x' || repeat('f', 64),
  'a verified explorer report stores its source and exact chain proof'
);
select ok(
  (
    select not checkpoint.transactions_trusted
      and not checkpoint.addresses_trusted
      and not checkpoint.supply_trusted
    from public.chain_aggregate_checkpoints checkpoint
    where checkpoint.source_id = 'community-blockscout'
    order by checkpoint.captured_at desc, checkpoint.id desc
    limit 1
  ),
  'a community explorer cannot advance trusted monotonic aggregate floors'
);
select is(
  (
    select checkpoint.captured_at
    from public.chain_aggregate_checkpoints checkpoint
    where checkpoint.source_id = 'community-blockscout'
      and checkpoint.verification_height = 90
      and checkpoint.verification_hash = '0x' || repeat('f', 64)
    limit 1
  ),
  '2026-08-20T07:30:00Z'::timestamptz,
  'fallback ordering retains the bounded source observation time instead of insertion time'
);
select lives_ok(
  $$select public.record_chain_aggregate_report_v2(
    100,
    'explorer',
    1000,
    100,
    10000.123456789,
    false,
    false,
    false,
    'community-blockscout',
    90,
    '0x' || repeat('f', 64),
    '2026-08-20T07:30:00Z'::timestamptz
  )$$,
  'an identical explorer observation can be recorded idempotently'
);
select is(
  (
    select count(*)::integer
    from public.chain_aggregate_checkpoints checkpoint
    where checkpoint.source_id = 'community-blockscout'
      and checkpoint.verification_height = 90
      and checkpoint.verification_hash = '0x' || repeat('f', 64)
      and checkpoint.total_transactions = 1000
      and checkpoint.total_addresses = 100
      and checkpoint.coin_supply = 10000.12345679
  ),
  1,
  'an identical explorer observation occupies one history row'
);
select is(
  (
    select checkpoint.captured_at
    from public.chain_aggregate_checkpoints checkpoint
    where checkpoint.source_id = 'community-blockscout'
      and checkpoint.verification_height = 90
      and checkpoint.verification_hash = '0x' || repeat('f', 64)
      and checkpoint.coin_supply = 10000.12345679
  ),
  '2026-08-20T07:30:00Z'::timestamptz,
  'a duplicate observation keeps its original source timestamp'
);
select lives_ok(
  $$do $correction$
  begin
    perform public.record_chain_aggregate_report_v2(
      100,
      'explorer',
      9000,
      900,
      90000,
      false,
      false,
      false,
      'community-blockscout',
      90,
      '0x' || repeat('f', 64),
      '2026-08-20T07:31:00Z'::timestamptz
    );
    perform public.record_chain_aggregate_report_v2(
      100,
      'explorer',
      1000,
      100,
      10000.123456789,
      false,
      false,
      false,
      'community-blockscout',
      90,
      '0x' || repeat('f', 64),
      '2026-08-20T07:32:00Z'::timestamptz
    );
  end
  $correction$;$$,
  'a later observation can correct an inflated fallback back to an earlier value'
);
select is(
  (
    select concat_ws(
      ':',
      checkpoint.total_transactions,
      checkpoint.total_addresses,
      checkpoint.coin_supply,
      to_char(checkpoint.captured_at at time zone 'UTC', 'YYYY-MM-DD HH24:MI:SS')
    )
    from public.chain_aggregate_checkpoints checkpoint
    where checkpoint.source_id = 'community-blockscout'
      and checkpoint.verification_height = 90
      and checkpoint.verification_hash = '0x' || repeat('f', 64)
    order by checkpoint.captured_at desc, checkpoint.id desc
    limit 1
  ),
  '1000:100:10000.12345679:2026-08-20 07:32:00',
  'latest-observation selection sees the corrected fallback rather than the intervening inflation'
);
select lives_ok(
  $$select public.record_chain_aggregate_report_v2(
    200,
    'explorer',
    2000,
    200,
    20000,
    true,
    true,
    true,
    'canonical-explorer',
    190,
    '0x' || repeat('e', 64),
    '2026-08-20T08:00:00Z'::timestamptz
  )$$,
  'a canonical explorer report establishes durable trusted floors'
);
select is(
  (
    select (
      checkpoint.canonical_transactions_floor
      and checkpoint.canonical_addresses_floor
      and checkpoint.canonical_supply_floor
      and checkpoint.transactions_trusted
      and checkpoint.addresses_trusted
      and checkpoint.supply_trusted
    )
    from public.chain_aggregate_checkpoints checkpoint
    where checkpoint.source_id = 'canonical-explorer'
      and checkpoint.verification_hash = '0x' || repeat('e', 64)
  ),
  true,
  'the current canonical report is marked as the durable floor for all three aggregates'
);
select lives_ok(
  $$select public.record_chain_aggregate_report_v2(
    201,
    'explorer',
    null,
    201,
    null,
    false,
    true,
    false,
    'canonical-explorer',
    191,
    '0x' || repeat('d', 64),
    '2026-08-20T08:01:00Z'::timestamptz
  )$$,
  'a newer canonical address floor can move independently'
);
select lives_ok(
  $$select public.record_chain_aggregate_report_v2(
    202,
    'explorer',
    null,
    null,
    20002,
    false,
    false,
    true,
    'canonical-explorer',
    192,
    '0x' || repeat('c', 64),
    '2026-08-20T08:02:00Z'::timestamptz
  )$$,
  'a newer canonical supply floor can move independently'
);
select is(
  (
    select count(distinct checkpoint.id)::integer
    from public.chain_aggregate_checkpoints checkpoint
    where checkpoint.canonical_transactions_floor
      or checkpoint.canonical_addresses_floor
      or checkpoint.canonical_supply_floor
  ),
  3,
  'three independently advancing canonical fields retain three exact floor rows'
);
select lives_ok(
  $$select public.record_chain_aggregate_report(
    203,
    'explorer',
    2500,
    null,
    null,
    true,
    false,
    false
  )$$,
  'a blue-green legacy canonical writer can advance a trusted floor'
);
select is(
  (
    select checkpoint.total_transactions
    from public.chain_aggregate_checkpoints checkpoint
    where checkpoint.canonical_transactions_floor
  ),
  2500::bigint,
  'a trusted legacy advance moves the durable transaction marker'
);
select lives_ok(
  $$do $retention$
  declare
    observation integer;
  begin
    for observation in 1..55 loop
      perform public.record_chain_aggregate_report(
        200 + observation,
        'explorer',
        2000 + observation,
        200 + observation,
        20000 + observation,
        false,
        false,
        false
      );
    end loop;
  end
  $retention$;$$,
  'more than one rolling history window of legacy fallback observations can be recorded'
);
select is(
  (
    select concat_ws(
      ':',
      max(checkpoint.total_transactions)
        filter (where checkpoint.canonical_transactions_floor),
      max(checkpoint.total_addresses)
        filter (where checkpoint.canonical_addresses_floor),
      max(checkpoint.coin_supply)
        filter (where checkpoint.canonical_supply_floor)
    )
    from public.chain_aggregate_checkpoints checkpoint
  ),
  '2500:201:20002.00000000',
  'rolling fallback history cannot evict any trusted canonical aggregate floor'
);
select ok(
  (
    select count(*) <= 50
    from public.chain_aggregate_checkpoints checkpoint
    where checkpoint.record_kind = 'explorer_report'
  ),
  'durable floors and rolling fallback observations remain within the bounded history size'
);
reset role;
select lives_ok(
  $$delete from public.chain_aggregate_checkpoints
    where canonical_transactions_floor$$,
  'the global cleanup path can attempt to delete a durable floor safely'
);
select is(
  (
    select count(*)::integer
    from public.chain_aggregate_checkpoints
    where canonical_transactions_floor
  ),
  1,
  'the durable-floor trigger prevents deletion of the trusted transaction checkpoint'
);
set local role service_role;

select throws_ok(
  $$select public.publish_chain_consensus_snapshot(1, 100, repeat('0', 66), 1, 'rpc-a', 1, 90, array['rpc-a', 'rpc-b'], array['op-a', 'op-b'], clock_timestamp())$$,
  '22023',
  'invalid consensus chain id',
  'a non-BlockDAG chain fails closed'
);
select throws_ok(
  $$select public.publish_chain_consensus_snapshot(1404, -1, '0x' || repeat('a', 64), 1, 'rpc-a', 1, 0, array['rpc-a', 'rpc-b'], array['op-a', 'op-b'], clock_timestamp())$$,
  '22023',
  'invalid consensus block height',
  'a negative block height fails closed'
);
select throws_ok(
  $$select public.publish_chain_consensus_snapshot(1404, 100, '0x1234', 1, 'rpc-a', 1, 90, array['rpc-a', 'rpc-b'], array['op-a', 'op-b'], clock_timestamp())$$,
  '22023',
  'invalid consensus block hash',
  'a malformed anchor hash fails closed'
);
select throws_ok(
  $$select public.publish_chain_consensus_snapshot(1404, 100, '0x' || repeat('a', 64), -1, 'rpc-a', 1, 90, array['rpc-a', 'rpc-b'], array['op-a', 'op-b'], clock_timestamp())$$,
  '22023',
  'invalid consensus peer count',
  'a negative peer count fails closed'
);
select throws_ok(
  $$select public.publish_chain_consensus_snapshot(1404, 100, '0x' || repeat('a', 64), 1, 'rpc-c', 1, 90, array['rpc-a', 'rpc-b'], array['op-a', 'op-b'], clock_timestamp())$$,
  '22023',
  'invalid consensus peer source',
  'the peer reading must identify a quorum source'
);
select throws_ok(
  $$select public.publish_chain_consensus_snapshot(1404, 100, '0x' || repeat('a', 64), 1, 'rpc-a', -1, 90, array['rpc-a', 'rpc-b'], array['op-a', 'op-b'], clock_timestamp())$$,
  '22023',
  'invalid consensus producer count',
  'a negative producer count fails closed'
);
select throws_ok(
  $$select public.publish_chain_consensus_snapshot(1404, 100, '0x' || repeat('a', 64), 1, 'rpc-a', 1, null, array['rpc-a', 'rpc-b'], array['op-a', 'op-b'], clock_timestamp())$$,
  '22023',
  'invalid consensus miner sample',
  'a producer count needs its deterministic sample anchor'
);
select throws_ok(
  $$select public.publish_chain_consensus_snapshot(1404, 100, '0x' || repeat('a', 64), 1, 'rpc-a', 1, 101, array['rpc-a', 'rpc-b'], array['op-a', 'op-b'], clock_timestamp())$$,
  '22023',
  'invalid consensus miner sample',
  'the producer sample cannot be ahead of the resolved head'
);
select throws_ok(
  $$select public.publish_chain_consensus_snapshot(1404, 100, '0x' || repeat('a', 64), 1, 'rpc-a', 1, 90, array['rpc-a'], array['op-a', 'op-b'], clock_timestamp())$$,
  '22023',
  'insufficient consensus RPC sources',
  'a single RPC source is not quorum'
);
select throws_ok(
  $$select public.publish_chain_consensus_snapshot(1404, 100, '0x' || repeat('a', 64), 1, 'rpc-a', 1, 90, array['rpc-a', ' '], array['op-a', 'op-b'], clock_timestamp())$$,
  '22023',
  'invalid consensus RPC source',
  'blank RPC source identifiers fail closed'
);
select throws_ok(
  $$select public.publish_chain_consensus_snapshot(1404, 100, '0x' || repeat('a', 64), 1, 'rpc-a', 1, 90, array['rpc-a', 'rpc-b'], array['op-a'], clock_timestamp())$$,
  '22023',
  'insufficient consensus RPC operators',
  'a single operator is not independent quorum'
);
select throws_ok(
  $$select public.publish_chain_consensus_snapshot(1404, 100, '0x' || repeat('a', 64), 1, 'rpc-a', 1, 90, array['rpc-a', 'rpc-b'], array['op-a', null], clock_timestamp())$$,
  '22023',
  'invalid consensus RPC operator',
  'null operator identifiers fail closed'
);
select throws_ok(
  $$select public.publish_chain_consensus_snapshot(1404, 100, '0x' || repeat('a', 64), 1, 'rpc-a', 1, 90, array['rpc-a', 'rpc-b'], array['op-a', 'op-b'], null)$$,
  '22023',
  'invalid consensus observation time',
  'the source observation time is required'
);
select throws_ok(
  $$select public.publish_chain_consensus_snapshot(1404, 100, '0x' || repeat('a', 64), 1, 'rpc-a', 1, 90, array['rpc-a', 'rpc-b'], array['op-a', 'op-b'], clock_timestamp() + interval '6 minutes')$$,
  '22023',
  'invalid consensus observation time',
  'an unreasonably future observation time fails closed'
);

select is(
  (
    select block_height
    from public.publish_chain_consensus_snapshot(
      1404,
      100,
      '0x' || repeat('a', 64),
      23,
      'rpc-b',
      16,
      80,
      array['rpc-b', 'rpc-a', 'rpc-a'],
      array['op-b', 'op-a', 'op-a'],
      '2026-08-20T08:00:00Z'::timestamptz
    )
  ),
  100::bigint,
  'a valid independent quorum seeds the singleton'
);
select is(
  (
    select (
      chain_id = 1404
      and block_hash = '0x' || repeat('a', 64)
      and peers = 23
      and peer_source = 'rpc-b'
      and active_miners = 16
      and miner_sample_anchor = 80
      and rpc_source_ids = array['rpc-a', 'rpc-b']
      and rpc_operator_ids = array['op-a', 'op-b']
      and rpc_observed_at = '2026-08-20T08:00:00Z'::timestamptz
      and published_at is not null
    )
    from public.chain_consensus_snapshots
    where singleton
  ),
  true,
  'the accepted snapshot stores normalized provenance and observation time'
);
select is(
  (
    select block_height
    from public.publish_chain_consensus_snapshot(
      1404,
      99,
      '0x' || repeat('9', 64),
      99,
      'rpc-a',
      99,
      70,
      array['rpc-a', 'rpc-b'],
      array['op-a', 'op-b'],
      '2026-08-20T09:00:00Z'::timestamptz
    )
  ),
  100::bigint,
  'an older publication returns the authoritative current height'
);
select is(
  (
    select (
      peers = 23
      and active_miners = 16
      and rpc_observed_at = '2026-08-20T08:00:00Z'::timestamptz
    )
    from public.chain_consensus_snapshots
    where singleton
  ),
  true,
  'a rejected older publication cannot refresh moving fields or observation time'
);
select is(
  (
    select peers
    from public.publish_chain_consensus_snapshot(
      1404,
      100,
      '0x' || repeat('a', 64),
      20,
      'rpc-a',
      15,
      81,
      array['rpc-a', 'rpc-c'],
      array['op-a', 'op-c'],
      '2026-08-20T10:00:00Z'::timestamptz
    )
  ),
  20::bigint,
  'the same anchor can refresh moving fields from a new quorum'
);
select is(
  (
    select (
      active_miners = 15
      and miner_sample_anchor = 81
      and rpc_observed_at = '2026-08-20T10:00:00Z'::timestamptz
    )
    from public.chain_consensus_snapshots
    where singleton
  ),
  true,
  'a same-height refresh preserves its exact source observation time'
);
select is(
  (
    select peers
    from public.publish_chain_consensus_snapshot(
      1404,
      100,
      '0x' || repeat('a', 64),
      99,
      'rpc-a',
      99,
      81,
      array['rpc-a', 'rpc-c'],
      array['op-a', 'op-c'],
      '2026-08-20T09:30:00Z'::timestamptz
    )
  ),
  20::bigint,
  'an older same-height observation returns the newer moving fields'
);
select is(
  (
    select (
      active_miners = 15
      and rpc_observed_at = '2026-08-20T10:00:00Z'::timestamptz
    )
    from public.chain_consensus_snapshots
    where singleton
  ),
  true,
  'an older same-height observation cannot regress miners or observation time'
);
select throws_ok(
  $$select public.publish_chain_consensus_snapshot(1404, 100, '0x' || repeat('b', 64), 20, 'rpc-a', 15, 81, array['rpc-a', 'rpc-c'], array['op-a', 'op-c'], clock_timestamp())$$,
  '22023',
  'conflicting consensus block hash',
  'a split view at the current height fails closed'
);
select is(
  (
    select block_height
    from public.publish_chain_consensus_snapshot(
      1404,
      101,
      '0x' || repeat('b', 64),
      null,
      null,
      null,
      null,
      array['rpc-a', 'rpc-c'],
      array['op-a', 'op-c'],
      '2026-08-20T11:00:00Z'::timestamptz
    )
  ),
  101::bigint,
  'a newer independent quorum advances the canonical anchor'
);
select is(
  (
    select (
      block_hash = '0x' || repeat('b', 64)
      and peers = 20
      and peer_source = 'rpc-a'
      and active_miners = 15
      and miner_sample_anchor = 81
      and rpc_observed_at = '2026-08-20T11:00:00Z'::timestamptz
    )
    from public.chain_consensus_snapshots
    where singleton
  ),
  true,
  'a partial newer quorum preserves the last verified moving readings'
);
select is(
  (
    select (
      peers is null
      and peer_source is null
      and active_miners = 15
      and miner_sample_anchor = 81
      and rpc_source_ids = array['rpc-c', 'rpc-d']
    )
    from public.publish_chain_consensus_snapshot(
      1404,
      102,
      '0x' || repeat('c', 64),
      null,
      null,
      null,
      null,
      array['rpc-c', 'rpc-d'],
      array['op-c', 'op-d'],
      '2026-08-20T12:00:00Z'::timestamptz
    )
  ),
  true,
  'a new quorum cannot inherit a peer reading from a departed source'
);
select is(
  (
    select rpc_observed_at
    from public.publish_chain_consensus_snapshot(
      1404,
      103,
      '0x' || repeat('d', 64),
      11,
      'rpc-c',
      null,
      null,
      array['rpc-c', 'rpc-d'],
      array['op-c', 'op-d'],
      '2026-08-20T11:30:00Z'::timestamptz
    )
  ),
  '2026-08-20T11:30:00Z'::timestamptz,
  'a higher head keeps its own observation time instead of inheriting the older head timestamp'
);
select is(
  (select count(*)::integer from public.chain_consensus_snapshots),
  1,
  'the resolved consensus remains a singleton'
);

reset role;
select * from finish();
rollback;
