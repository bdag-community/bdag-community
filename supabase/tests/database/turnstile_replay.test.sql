begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(13);

select ok(
  (
    select relrowsecurity
    from pg_class
    where oid = 'public.submission_token_claims'::regclass
  ),
  'token claims have RLS enabled'
);
select is(
  (
    select count(*)::integer
    from pg_policy
    where polrelid = 'public.submission_token_claims'::regclass
  ),
  0,
  'token claims expose no RLS policy'
);
select ok(
  not has_table_privilege('anon', 'public.submission_token_claims', 'SELECT')
  and not has_table_privilege('authenticated', 'public.submission_token_claims', 'SELECT')
  and not has_table_privilege('service_role', 'public.submission_token_claims', 'SELECT'),
  'no Data API role can inspect token claims'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.claim_submission_token(text)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated',
    'public.claim_submission_token(text)',
    'EXECUTE'
  ),
  'public Data API roles cannot claim tokens'
);
select ok(
  has_function_privilege(
    'service_role',
    'public.claim_submission_token(text)',
    'EXECUTE'
  ),
  'the secret-key role can claim tokens'
);

set local role service_role;
select throws_ok(
  $$select public.claim_submission_token('not-a-digest')$$,
  '22023',
  'invalid token fingerprint',
  'malformed token fingerprints fail closed'
);
select is(
  public.claim_submission_token(repeat('e', 64)),
  true,
  'the first verified-token claim succeeds'
);
select is(
  public.claim_submission_token(repeat('e', 64)),
  false,
  'an immediate replay is rejected'
);
reset role;
select is(
  (
    select count(*)::integer
    from public.submission_token_claims
    where fingerprint = repeat('e', 64)
  ),
  1,
  'a duplicate claim never creates another row'
);
set local role service_role;
select is(
  public.claim_submission_token(repeat('f', 64)),
  true,
  'a different verified token remains available'
);
reset role;

select ok(
  (
    select expires_at <= claimed_at + interval '10 minutes'
      and expires_at > claimed_at
    from public.submission_token_claims
    where fingerprint = repeat('e', 64)
  ),
  'token claims live for no more than ten minutes'
);

insert into public.submission_token_claims (
  fingerprint,
  claimed_at,
  expires_at
) values (
  repeat('d', 64),
  now() - interval '20 minutes',
  now() - interval '10 minutes'
);
select is(
  public.delete_expired_submission_rate_limits(),
  1::bigint,
  'retention cleanup removes an expired token claim'
);
select is(
  (
    select count(*)::integer
    from public.submission_token_claims
    where fingerprint = repeat('d', 64)
  ),
  0,
  'the expired token claim is gone'
);

select * from finish();
rollback;
