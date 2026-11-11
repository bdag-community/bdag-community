begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(23);

select ok(
  (
    select relrowsecurity
    from pg_class
    where oid = 'public.chain_aggregate_checkpoints'::regclass
  ),
  'chain aggregate rows have RLS enabled'
);
select is(
  (
    select count(*)::integer
    from pg_policy
    where polrelid = 'public.chain_aggregate_checkpoints'::regclass
  ),
  0,
  'chain aggregate rows expose no RLS policy'
);
select ok(
  not has_table_privilege('anon', 'public.chain_aggregate_checkpoints', 'SELECT')
  and not has_table_privilege(
    'authenticated',
    'public.chain_aggregate_checkpoints',
    'SELECT'
  )
  and has_table_privilege(
    'service_role',
    'public.chain_aggregate_checkpoints',
    'SELECT'
  ),
  'only the secret-key role can read aggregate rows'
);
select ok(
  not has_table_privilege(
    'service_role',
    'public.chain_aggregate_checkpoints',
    'INSERT,UPDATE,DELETE,TRUNCATE'
  ),
  'the secret-key role cannot mutate aggregate rows directly'
);
select ok(
  has_function_privilege(
    'service_role',
    'public.record_chain_aggregate_report(bigint,text,bigint,bigint,numeric,boolean,boolean,boolean)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'anon',
    'public.record_chain_aggregate_report(bigint,text,bigint,bigint,numeric,boolean,boolean,boolean)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated',
    'public.record_chain_aggregate_report(bigint,text,bigint,bigint,numeric,boolean,boolean,boolean)',
    'EXECUTE'
  ),
  'report writes are service-role-only'
);
select ok(
  has_function_privilege(
    'service_role',
    'public.advance_chain_transaction_cursor(bigint,bigint)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'anon',
    'public.advance_chain_transaction_cursor(bigint,bigint)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated',
    'public.advance_chain_transaction_cursor(bigint,bigint)',
    'EXECUTE'
  ),
  'cursor writes are service-role-only'
);
select ok(
  (
    select prosecdef and pg_get_userbyid(proowner) = 'postgres'
    from pg_proc
    where oid =
      'public.record_chain_aggregate_report(bigint,text,bigint,bigint,numeric,boolean,boolean,boolean)'::regprocedure
  ),
  'the report function is postgres-owned security definer'
);
select ok(
  (
    select prosecdef and pg_get_userbyid(proowner) = 'postgres'
    from pg_proc
    where oid =
      'public.advance_chain_transaction_cursor(bigint,bigint)'::regprocedure
  ),
  'the cursor function is postgres-owned security definer'
);

set local role service_role;

select throws_ok(
  $$select public.record_chain_aggregate_report(-1, 'rpc', 1, 1, 1, true, true, true)$$,
  '22023',
  'invalid aggregate height',
  'negative report heights fail closed'
);
select throws_ok(
  $$select public.record_chain_aggregate_report(1, 'browser', 1, 1, 1, true, true, true)$$,
  '22023',
  'invalid height source',
  'unknown height sources fail closed'
);
select lives_ok(
  $$select public.record_chain_aggregate_report(100, 'explorer', 1000, 100, 10000, true, true, true)$$,
  'a valid report is recorded'
);
select is(
  (
    select transactions_trusted and addresses_trusted and supply_trusted
    from public.chain_aggregate_checkpoints
    where record_kind = 'explorer_report'
    order by captured_at desc, id desc
    limit 1
  ),
  true,
  'the first monotonic report is trusted'
);
select is(
  public.advance_chain_transaction_cursor(100, 1000),
  true,
  'the transaction cursor is seeded'
);
select is(
  public.advance_chain_transaction_cursor(99, 1100),
  false,
  'a lower cursor height is rejected'
);
select is(
  public.advance_chain_transaction_cursor(100, 1100),
  false,
  'the same cursor height cannot be rewritten'
);
select is(
  public.advance_chain_transaction_cursor(101, 999),
  false,
  'a higher cursor height cannot lower its running total'
);
select is(
  public.advance_chain_transaction_cursor(101, 1002),
  true,
  'a monotonic cursor advance succeeds'
);
select is(
  (
    select height::integer
    from public.chain_aggregate_checkpoints
    where record_kind = 'transaction_cursor'
  ),
  101,
  'the cursor stores the highest accepted height'
);

select lives_ok(
  $$select public.record_chain_aggregate_report(99, 'rpc', 1100, 110, 10100, true, true, true)$$,
  'a stale report remains auditable'
);
select is(
  (
    select transactions_trusted or addresses_trusted or supply_trusted
    from public.chain_aggregate_checkpoints
    where record_kind = 'explorer_report' and height = 99 and total_transactions = 1100
    limit 1
  ),
  false,
  'a stale-height report cannot become trusted'
);
select is(
  (
    select transactions_trusted or addresses_trusted or supply_trusted
    from public.record_chain_aggregate_report(
      98,
      'rpc',
      1200,
      120,
      10200,
      true,
      true,
      true
    )
  ),
  false,
  'the report RPC returns its authoritative downgraded trust flags'
);

do $retention$
begin
  for counter in 1..55 loop
    perform public.record_chain_aggregate_report(
      200 + counter,
      'rpc',
      2000 + counter,
      200 + counter,
      20000 + counter,
      true,
      true,
      true
    );
  end loop;
end;
$retention$;

select is(
  (
    select count(*)::integer
    from public.chain_aggregate_checkpoints
    where record_kind = 'explorer_report'
  ),
  50,
  'report retention keeps exactly the newest fifty rows'
);
select is(
  (
    select min(height)::integer
    from public.chain_aggregate_checkpoints
    where record_kind = 'explorer_report'
  ),
  206,
  'retention removes the oldest report rows'
);

reset role;
select * from finish();
rollback;
