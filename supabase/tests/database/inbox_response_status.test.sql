begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(13);

insert into auth.users (id, email, raw_user_meta_data)
values
  ('91000000-0000-4000-8000-000000000001', 'reply-admin@example.invalid', '{}'),
  ('91000000-0000-4000-8000-000000000002', 'reply-member@example.invalid', '{}');
update public.profiles set is_admin = true
where user_id = '91000000-0000-4000-8000-000000000001';

set local role service_role;
insert into public.contact_messages (id, name, email, topic, message)
values ('92000000-0000-4000-8000-000000000001', 'Contact', 'contact@example.invalid', 'general', 'Hello');
insert into public.suggestion_messages (id, author_name, reply_email, suggestion)
values ('92000000-0000-4000-8000-000000000002', 'Suggester', 'suggestion@example.invalid', 'A useful community suggestion');
reset role;

select ok(
  has_column_privilege('authenticated', 'public.contact_messages', 'responded_at', 'UPDATE')
  and not has_column_privilege('authenticated', 'public.contact_messages', 'responded_by', 'UPDATE')
  and not has_column_privilege('authenticated', 'public.contact_messages', 'message', 'UPDATE'),
  'only the contact response status is writable by an authenticated role'
);
select ok(
  has_column_privilege('authenticated', 'public.suggestion_messages', 'responded_at', 'UPDATE')
  and not has_column_privilege('authenticated', 'public.suggestion_messages', 'responded_by', 'UPDATE')
  and not has_column_privilege('authenticated', 'public.suggestion_messages', 'suggestion', 'UPDATE'),
  'only the suggestion response status is writable by an authenticated role'
);
select ok(
  not has_column_privilege('anon', 'public.contact_messages', 'responded_at', 'UPDATE')
  and not has_column_privilege('anon', 'public.suggestion_messages', 'responded_at', 'UPDATE'),
  'anonymous clients cannot update either status'
);

set local role authenticated;
set local request.jwt.claims =
  '{"sub":"91000000-0000-4000-8000-000000000002","role":"authenticated","app_metadata":{"admin":false}}';
select lives_ok(
  $$update public.contact_messages set responded_at = now()$$,
  'a non-admin contact update is safely filtered by RLS'
);
select lives_ok(
  $$update public.suggestion_messages set responded_at = now()$$,
  'a non-admin suggestion update is safely filtered by RLS'
);
reset role;

select ok(
  (select responded_at is null from public.contact_messages where id = '92000000-0000-4000-8000-000000000001')
  and (select responded_at is null from public.suggestion_messages where id = '92000000-0000-4000-8000-000000000002'),
  'non-admin attempts leave both messages unresponded'
);

set local role authenticated;
set local request.jwt.claims =
  '{"sub":"91000000-0000-4000-8000-000000000001","role":"authenticated","app_metadata":{"admin":true}}';
select lives_ok(
  $$update public.contact_messages set responded_at = '2000-01-01' where id = '92000000-0000-4000-8000-000000000001'$$,
  'an admin can mark a contact message responded'
);
select lives_ok(
  $$update public.suggestion_messages set responded_at = '2000-01-01' where id = '92000000-0000-4000-8000-000000000002'$$,
  'an admin can mark a suggestion responded'
);
select ok(
  (select responded_at > '2026-01-01' and responded_by = '91000000-0000-4000-8000-000000000001'
    from public.contact_messages where id = '92000000-0000-4000-8000-000000000001')
  and (select responded_at > '2026-01-01' and responded_by = '91000000-0000-4000-8000-000000000001'
    from public.suggestion_messages where id = '92000000-0000-4000-8000-000000000002'),
  'the database records its own timestamp and verified actor for both'
);
select is(
  (select count(*)::integer from public.admin_activity
    where action = 'respond' and entity_type in ('contact_messages', 'suggestion_messages')),
  2,
  'both response changes appear in admin activity'
);
select lives_ok(
  $$update public.contact_messages set responded_at = null where id = '92000000-0000-4000-8000-000000000001'$$,
  'an admin can unmark a contact message'
);
select lives_ok(
  $$update public.suggestion_messages set responded_at = null where id = '92000000-0000-4000-8000-000000000002'$$,
  'an admin can unmark a suggestion'
);
select ok(
  (select responded_at is null and responded_by is null from public.contact_messages where id = '92000000-0000-4000-8000-000000000001')
  and (select responded_at is null and responded_by is null from public.suggestion_messages where id = '92000000-0000-4000-8000-000000000002')
  and (select count(*) = 2 from public.admin_activity where action = 'unrespond'),
  'unmarking clears both metadata fields and records both reversals'
);
reset role;

select * from finish();
rollback;
