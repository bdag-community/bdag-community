begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(18);

select ok(
  (
    select relrowsecurity
    from pg_class
    where oid = 'public.chain_live_checkpoints'::regclass
  ),
  'canonical live checkpoints have RLS enabled'
);
select is(
  (
    select count(*)::integer
    from pg_policy
    where polrelid = 'public.chain_live_checkpoints'::regclass
  ),
  0,
  'canonical live checkpoints expose no RLS policy'
);
select ok(
  not has_table_privilege('anon', 'public.chain_live_checkpoints', 'SELECT')
  and not has_table_privilege(
    'authenticated',
    'public.chain_live_checkpoints',
    'SELECT'
  )
  and has_table_privilege(
    'service_role',
    'public.chain_live_checkpoints',
    'SELECT'
  ),
  'only the secret-key role can read canonical live checkpoints'
);
select ok(
  not has_table_privilege(
    'service_role',
    'public.chain_live_checkpoints',
    'INSERT,UPDATE,DELETE,TRUNCATE'
  ),
  'the secret-key role cannot mutate canonical live checkpoints directly'
);
select ok(
  has_function_privilege(
    'service_role',
    'public.persist_chain_live_checkpoint(bigint,bigint,bigint)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'anon',
    'public.persist_chain_live_checkpoint(bigint,bigint,bigint)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated',
    'public.persist_chain_live_checkpoint(bigint,bigint,bigint)',
    'EXECUTE'
  ),
  'canonical checkpoint writes are service-role-only'
);
select ok(
  (
    select prosecdef and pg_get_userbyid(proowner) = 'postgres'
    from pg_proc
    where oid =
      'public.persist_chain_live_checkpoint(bigint,bigint,bigint)'::regprocedure
  ),
  'the canonical checkpoint function is postgres-owned security definer'
);

set local role service_role;

select throws_ok(
  $$select public.persist_chain_live_checkpoint(-1, 1, 1)$$,
  '22023',
  'invalid live block height',
  'negative block heights fail closed'
);
select throws_ok(
  $$select public.persist_chain_live_checkpoint(100, -1, 1)$$,
  '22023',
  'invalid live peer count',
  'negative peer counts fail closed'
);
select throws_ok(
  $$select public.persist_chain_live_checkpoint(100, 1, -1)$$,
  '22023',
  'invalid live producer count',
  'negative producer counts fail closed'
);
select is(
  public.persist_chain_live_checkpoint(100, 23, 16),
  true,
  'a first canonical checkpoint is stored'
);
select is(
  (
    select (block_height = 100 and peers = 23 and active_miners = 16)
    from public.chain_live_checkpoints
    where singleton
  ),
  true,
  'the checkpoint stores all three canonical RPC tiles'
);
select is(
  public.persist_chain_live_checkpoint(99, 99, 99),
  false,
  'an older canonical height is rejected'
);
select is(
  (
    select (block_height = 100 and peers = 23 and active_miners = 16)
    from public.chain_live_checkpoints
    where singleton
  ),
  true,
  'a rejected update leaves the checkpoint unchanged'
);
select is(
  public.persist_chain_live_checkpoint(100, 20, 15),
  true,
  'the current height may refresh moving peer and producer counts'
);
select is(
  (
    select (peers = 20 and active_miners = 15)
    from public.chain_live_checkpoints
    where singleton
  ),
  true,
  'same-height moving values are stored exactly'
);
select is(
  public.persist_chain_live_checkpoint(101, null, null),
  true,
  'a newer partial canonical read advances the height'
);
select is(
  (
    select (block_height = 101 and peers = 20 and active_miners = 15)
    from public.chain_live_checkpoints
    where singleton
  ),
  true,
  'partial reads preserve the last verified moving values'
);
select is(
  (select count(*)::integer from public.chain_live_checkpoints),
  1,
  'the canonical fallback remains a singleton'
);

reset role;
select * from finish();
rollback;
