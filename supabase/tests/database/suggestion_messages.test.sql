begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(12);

insert into auth.users (id, email, raw_user_meta_data)
values
  ('81000000-0000-4000-8000-000000000001', 'suggestion-admin@example.invalid', '{}'),
  ('81000000-0000-4000-8000-000000000002', 'suggestion-member@example.invalid', '{}');

update public.profiles
set is_admin = true
where user_id = '81000000-0000-4000-8000-000000000001';

select has_table(
  'public',
  'suggestion_messages',
  'the private suggestion inbox exists'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.suggestion_messages'::regclass),
  'the suggestion inbox has RLS enabled'
);
select ok(
  has_table_privilege('service_role', 'public.suggestion_messages', 'INSERT')
  and not has_table_privilege('service_role', 'public.suggestion_messages', 'SELECT')
  and not has_table_privilege('service_role', 'public.suggestion_messages', 'UPDATE')
  and not has_table_privilege('service_role', 'public.suggestion_messages', 'DELETE')
  and not has_table_privilege('service_role', 'public.suggestion_messages', 'TRUNCATE'),
  'the service role can insert suggestions and has no broader table privilege'
);
select ok(
  not has_table_privilege('anon', 'public.suggestion_messages', 'INSERT')
  and not has_table_privilege('anon', 'public.suggestion_messages', 'SELECT')
  and not has_table_privilege('anon', 'public.suggestion_messages', 'DELETE'),
  'anonymous clients have no suggestion inbox privileges'
);
select ok(
  has_table_privilege('authenticated', 'public.suggestion_messages', 'SELECT')
  and has_table_privilege('authenticated', 'public.suggestion_messages', 'DELETE')
  and not has_table_privilege('authenticated', 'public.suggestion_messages', 'INSERT')
  and not has_table_privilege('authenticated', 'public.suggestion_messages', 'UPDATE'),
  'authenticated clients receive only the admin-filtered inbox operations'
);

set local role service_role;
select lives_ok(
  $$insert into public.suggestion_messages (
    id, author_name, reply_email, suggestion
  ) values (
    '82000000-0000-4000-8000-000000000001',
    'Local suggester',
    'suggestion@example.invalid',
    'Please add a concise guide to running a node.'
  )$$,
  'the service role can store a validated suggestion'
);
reset role;

set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
select throws_ok(
  $$select count(*) from public.suggestion_messages$$,
  '42501',
  'permission denied for table suggestion_messages',
  'anonymous readers cannot inspect suggestions'
);
reset role;

set local role authenticated;
set local request.jwt.claims =
  '{"sub":"81000000-0000-4000-8000-000000000002","role":"authenticated","app_metadata":{"admin":false}}';
select is(
  (select count(*)::integer from public.suggestion_messages),
  0,
  'a non-admin member sees no suggestions'
);
select lives_ok(
  $$delete from public.suggestion_messages$$,
  'a non-admin delete is safely filtered by RLS'
);
reset role;

set local role authenticated;
set local request.jwt.claims =
  '{"sub":"81000000-0000-4000-8000-000000000001","role":"authenticated","app_metadata":{"admin":true}}';
select is(
  (select count(*)::integer from public.suggestion_messages),
  1,
  'an admin can inspect suggestions'
);
select lives_ok(
  $$delete from public.suggestion_messages
    where id = '82000000-0000-4000-8000-000000000001'$$,
  'an admin can delete a suggestion'
);
select is(
  (select count(*)::integer from public.suggestion_messages),
  0,
  'the admin delete removes the suggestion'
);
reset role;

select * from finish();
rollback;
