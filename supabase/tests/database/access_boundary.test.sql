begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(28);

insert into auth.users (id, email, raw_user_meta_data)
values
  ('10000000-0000-4000-8000-000000000001', 'local-admin@example.invalid', '{}'),
  ('10000000-0000-4000-8000-000000000002', 'local-member@example.invalid', '{}');

update public.profiles
set is_admin = true
where user_id = '10000000-0000-4000-8000-000000000001';

insert into public.news_articles (
  id,
  slug,
  title,
  description,
  body,
  body_html,
  author_name,
  is_published,
  published_at
)
values
  (
    '20000000-0000-4000-8000-000000000001',
    'local-published',
    'Local published article',
    'Published test description',
    'Published body',
    '<p>Published body</p>',
    'Local author',
    true,
    now()
  ),
  (
    '20000000-0000-4000-8000-000000000002',
    'local-draft',
    'Local private draft',
    'Draft test description',
    'Draft body',
    '<p>Draft body</p>',
    null,
    false,
    null
  );

insert into public.contact_messages (id, name, email, topic, message)
values (
  '30000000-0000-4000-8000-000000000001',
  'Local sender',
  'sender@example.invalid',
  'Testing',
  'Private message'
);

select ok(
  has_schema_privilege('supabase_auth_admin', 'public', 'USAGE'),
  'the Auth service can use the public schema'
);
select ok(
  has_function_privilege(
    'supabase_auth_admin',
    'public.custom_access_token_hook(jsonb)',
    'EXECUTE'
  ),
  'the Auth service can execute the custom access-token hook'
);
select ok(
  not has_table_privilege('service_role', 'public.news_articles', 'INSERT')
  and not has_table_privilege('service_role', 'public.news_articles', 'SELECT')
  and not has_table_privilege('service_role', 'public.news_articles', 'UPDATE')
  and not has_table_privilege('service_role', 'public.news_articles', 'DELETE')
  and not has_table_privilege('service_role', 'public.news_articles', 'TRUNCATE'),
  'the secret-key role has no direct news table privilege after migration 0006'
);
select ok(
  has_function_privilege(
    'service_role',
    'public.create_community_article_draft(text,text,text,text,text,text,text,text,bigint,text,text)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'anon',
    'public.create_community_article_draft(text,text,text,text,text,text,text,text,bigint,text,text)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated',
    'public.create_community_article_draft(text,text,text,text,text,text,text,text,bigint,text,text)',
    'EXECUTE'
  ),
  'only the secret-key role can invoke the forced community-draft RPC'
);
select ok(
  has_table_privilege('service_role', 'public.contact_messages', 'INSERT'),
  'the secret-key role can insert a contact message'
);
select ok(
  not has_table_privilege('service_role', 'public.contact_messages', 'SELECT')
  and not has_table_privilege('service_role', 'public.contact_messages', 'UPDATE')
  and not has_table_privilege('service_role', 'public.contact_messages', 'DELETE')
  and not has_table_privilege('service_role', 'public.contact_messages', 'TRUNCATE'),
  'the secret-key role has no broader contact table privilege'
);
select ok(
  not has_table_privilege('anon', 'public.news_articles', 'TRUNCATE')
  and not has_table_privilege('authenticated', 'public.news_articles', 'TRUNCATE'),
  'public Data API roles cannot truncate news'
);

select is(
  public.custom_access_token_hook(
    jsonb_build_object(
      'user_id',
      '10000000-0000-4000-8000-000000000001',
      'claims',
      jsonb_build_object('app_metadata', '{}'::jsonb)
    )
  ) #>> '{claims,app_metadata,admin}',
  'true',
  'the hook mints admin true from the profile source of truth'
);
select is(
  public.custom_access_token_hook(
    jsonb_build_object(
      'user_id',
      '10000000-0000-4000-8000-000000000002',
      'claims',
      jsonb_build_object('app_metadata', jsonb_build_object('admin', true))
    )
  ) #>> '{claims,app_metadata,admin}',
  'false',
  'the hook overwrites a stale true claim after demotion'
);

set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
select is(
  (select count(*)::integer from public.news_articles),
  1,
  'anonymous readers see the published article only'
);
select is(
  (select count(*)::integer from public.news_articles where slug = 'local-draft'),
  0,
  'anonymous readers cannot see a draft'
);
select throws_ok(
  $$insert into public.news_articles (slug, title) values ('anon-insert', 'Denied')$$,
  '42501',
  'permission denied for table news_articles',
  'anonymous readers cannot insert news directly'
);
select throws_ok(
  $$update public.news_articles set is_published = true where slug = 'local-draft'$$,
  '42501',
  'permission denied for table news_articles',
  'anonymous readers cannot publish news directly'
);
select throws_ok(
  $$delete from public.news_articles where slug = 'local-draft'$$,
  '42501',
  'permission denied for table news_articles',
  'anonymous readers cannot delete news directly'
);
select throws_ok(
  $$select count(*) from public.contact_messages$$,
  '42501',
  'permission denied for table contact_messages',
  'anonymous readers cannot inspect contact messages'
);
reset role;

set local role authenticated;
set local request.jwt.claims =
  '{"sub":"10000000-0000-4000-8000-000000000002","role":"authenticated","app_metadata":{"admin":false}}';
select is(
  (select count(*)::integer from public.news_articles),
  1,
  'a non-admin member sees published news only'
);
select throws_ok(
  $$insert into public.news_articles (slug, title) values ('member-insert', 'Denied')$$,
  '42501',
  null,
  'a non-admin member cannot insert news'
);
select throws_ok(
  $$update public.news_articles set is_published = true where slug = 'local-draft'$$,
  '42501',
  'permission denied for table news_articles',
  'a non-admin member cannot update a draft directly'
);
select throws_ok(
  $$delete from public.news_articles where slug = 'local-draft'$$,
  '42501',
  'permission denied for table news_articles',
  'a non-admin member cannot delete a draft directly'
);
select is(
  (select count(*)::integer from public.news_articles where slug = 'local-draft'),
  0,
  'the denied mutations do not make a draft visible to the non-admin member'
);
select is(
  (select count(*)::integer from public.contact_messages),
  0,
  'a non-admin member cannot inspect contact messages'
);
reset role;

set local role authenticated;
set local request.jwt.claims =
  '{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated","app_metadata":{"admin":true}}';
select is(
  (select count(*)::integer from public.news_articles),
  2,
  'an admin can read published and draft news'
);
select lives_ok(
  $$select public.admin_create_news_article(
    'Admin-created draft', 'admin-created', null,
    'Admin-created draft description', 'Admin-created draft body',
    '<p>Admin-created draft body</p>', null
  )$$,
  'an admin can create news through the narrow RPC'
);
select lives_ok(
  $$select public.admin_save_news_article(
    '20000000-0000-4000-8000-000000000002',
    'Admin edited draft', 'local-draft', null,
    'Draft test description', 'Draft body', '<p>Draft body</p>', null
  )$$,
  'an admin can edit news through the narrow RPC'
);
select lives_ok(
  $$select public.admin_publish_news_article(
    '20000000-0000-4000-8000-000000000002', null, null
  );
  select public.admin_unpublish_news_article(
    '20000000-0000-4000-8000-000000000002'
  )$$,
  'an admin can publish and unpublish through separate RPCs'
);
select lives_ok(
  $$select public.admin_delete_news_article(
    (select id from public.news_articles where slug = 'admin-created')
  )$$,
  'an admin can delete an asset-free draft through the narrow RPC'
);
select is(
  (select count(*)::integer from public.contact_messages),
  1,
  'an admin can inspect contact messages'
);
select lives_ok(
  $$delete from public.contact_messages
    where id = '30000000-0000-4000-8000-000000000001'$$,
  'an admin can delete a contact message'
);
reset role;

select * from finish();
rollback;
