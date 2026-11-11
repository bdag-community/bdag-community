begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(32);

select ok(
  (
    select relrowsecurity
    from pg_class
    where oid = 'public.submission_rate_limits'::regclass
  ),
  'submission rate-limit rows have RLS enabled'
);
select is(
  (
    select count(*)::integer
    from pg_policy
    where polrelid = 'public.submission_rate_limits'::regclass
  ),
  0,
  'submission rate-limit rows expose no RLS policy'
);

select ok(
  not has_table_privilege('anon', 'public.submission_rate_limits', 'SELECT')
  and not has_table_privilege('authenticated', 'public.submission_rate_limits', 'SELECT')
  and not has_table_privilege('service_role', 'public.submission_rate_limits', 'SELECT'),
  'no Data API role can inspect rate-limit rows'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.consume_submission_rate_limit(text,text)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated',
    'public.consume_submission_rate_limit(text,text)',
    'EXECUTE'
  ),
  'public Data API roles cannot consume rate limits'
);
select ok(
  has_function_privilege(
    'service_role',
    'public.consume_submission_rate_limit(text,text)',
    'EXECUTE'
  ),
  'the secret-key role can consume rate limits'
);
select ok(
  not has_function_privilege(
    'service_role',
    'public.delete_expired_submission_rate_limits()',
    'EXECUTE'
  ),
  'the secret-key role cannot run retention cleanup directly'
);

set local role service_role;
select throws_ok(
  $$select * from public.consume_submission_rate_limit('unknown', repeat('a', 64))$$,
  '22023',
  'invalid rate-limit scope',
  'unknown scopes fail closed'
);
select throws_ok(
  $$select * from public.consume_submission_rate_limit('article', 'not-a-digest')$$,
  '22023',
  'invalid rate-limit fingerprint',
  'malformed fingerprints fail closed'
);

select is(
  (select allowed from public.consume_submission_rate_limit('article', repeat('a', 64))),
  true,
  'article request one is allowed'
);
select is(
  (select allowed from public.consume_submission_rate_limit('article', repeat('a', 64))),
  true,
  'article request two is allowed'
);
select is(
  (select allowed from public.consume_submission_rate_limit('article', repeat('a', 64))),
  true,
  'article request three is allowed'
);
select is(
  (select allowed from public.consume_submission_rate_limit('article', repeat('a', 64))),
  false,
  'article request four is denied'
);
select is(
  (select allowed from public.consume_submission_rate_limit('article', repeat('b', 64))),
  true,
  'a different article fingerprint remains available'
);

select is(
  (select allowed from public.consume_submission_rate_limit('suggestion', repeat('a', 64))),
  true,
  'suggestion request one remains independent from article exhaustion'
);
select is(
  (select allowed from public.consume_submission_rate_limit('suggestion', repeat('a', 64))),
  true,
  'suggestion request two is allowed'
);
select is(
  (select allowed from public.consume_submission_rate_limit('suggestion', repeat('a', 64))),
  true,
  'suggestion request three is allowed'
);
select is(
  (select allowed from public.consume_submission_rate_limit('suggestion', repeat('a', 64))),
  true,
  'suggestion request four is allowed'
);
select is(
  (select allowed from public.consume_submission_rate_limit('suggestion', repeat('a', 64))),
  true,
  'suggestion request five is allowed'
);
select is(
  (select allowed from public.consume_submission_rate_limit('suggestion', repeat('a', 64))),
  false,
  'suggestion request six is denied'
);

select is(
  (select allowed from public.consume_submission_rate_limit('contact', repeat('a', 64))),
  true,
  'contact request one remains independent'
);
select is(
  (select allowed from public.consume_submission_rate_limit('contact', repeat('a', 64))),
  true,
  'contact request two is allowed'
);
select is(
  (select allowed from public.consume_submission_rate_limit('contact', repeat('a', 64))),
  true,
  'contact request three is allowed'
);
select is(
  (select allowed from public.consume_submission_rate_limit('contact', repeat('a', 64))),
  true,
  'contact request four is allowed'
);
select is(
  (select allowed from public.consume_submission_rate_limit('contact', repeat('a', 64))),
  true,
  'contact request five is allowed'
);
select is(
  (select allowed from public.consume_submission_rate_limit('contact', repeat('a', 64))),
  false,
  'contact request six is denied'
);

select is(
  (select allowed from public.consume_submission_rate_limit('challenge', repeat('c', 64))),
  true,
  'the shared challenge counter is available'
);
reset role;

insert into public.submission_rate_limits (
  scope,
  fingerprint,
  window_start,
  request_count,
  expires_at
) values (
  'challenge',
  repeat('d', 64),
  now() - interval '20 minutes',
  1,
  now() - interval '10 minutes'
);
select is(
  public.delete_expired_submission_rate_limits(),
  1::bigint,
  'retention cleanup removes an expired synthetic row'
);
select is(
  (
    select count(*)::integer
    from public.submission_rate_limits
    where fingerprint = repeat('d', 64)
  ),
  0,
  'the expired synthetic row is gone'
);

select is(
  (
    select count(*)::integer
    from cron.job
    where jobname = 'bdag-community-submission-rate-retention'
  ),
  1,
  'one named retention job exists'
);
select is(
  (
    select schedule
    from cron.job
    where jobname = 'bdag-community-submission-rate-retention'
  ),
  '17 * * * *',
  'retention cleanup is scheduled hourly'
);
select is(
  (
    select active
    from cron.job
    where jobname = 'bdag-community-submission-rate-retention'
  ),
  true,
  'the retention job is active'
);
select is(
  (
    select command
    from cron.job
    where jobname = 'bdag-community-submission-rate-retention'
  ),
  'select public.delete_expired_submission_rate_limits();',
  'the retention job runs only the narrow cleanup function'
);

select * from finish();
rollback;
