begin;

set local role postgres;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(8);

insert into auth.users (id, email, raw_user_meta_data)
values ('81000000-0000-4000-8000-000000000011', 'placement-admin@example.invalid', '{}');
update public.profiles set is_admin = true
where user_id = '81000000-0000-4000-8000-000000000011';

insert into public.community_projects (id, name, description, url, is_published, published_at)
values
  ('81000000-0000-4000-8000-000000000021', 'Placement first', 'A public project for the placement test.', 'https://placement-first.invalid', true, now()),
  ('81000000-0000-4000-8000-000000000022', 'Placement second', 'Another public project for the placement test.', 'https://placement-second.invalid', true, now()),
  ('81000000-0000-4000-8000-000000000023', 'Placement draft', 'An unpublished project for the placement test.', 'https://placement-draft.invalid', false, null);

select has_function('public', 'admin_set_project_placement', array['uuid','boolean','boolean']);
select ok(
  not has_function_privilege('anon', 'public.admin_set_project_placement(uuid,boolean,boolean)', 'execute'),
  'anonymous visitors cannot execute the placement RPC'
);

set local role authenticated;
set local request.jwt.claims = '{"role":"authenticated","sub":"81000000-0000-4000-8000-000000000012"}';
select throws_ok(
  $$select public.admin_set_project_placement('81000000-0000-4000-8000-000000000021', true, true)$$,
  '42501', 'admin access required', 'ordinary authenticated users cannot change placement'
);

set local request.jwt.claims = '{"role":"authenticated","sub":"81000000-0000-4000-8000-000000000011","app_metadata":{"admin":true}}';
select is(
  public.admin_set_project_placement('81000000-0000-4000-8000-000000000021', true, true),
  true, 'an admin can feature and focus a published project'
);
select is(
  public.admin_set_project_placement('81000000-0000-4000-8000-000000000022', false, true),
  true, 'an admin can switch focus'
);
select is(
  public.admin_set_project_placement('81000000-0000-4000-8000-000000000023', true, true),
  false, 'a draft cannot replace a published focus'
);
select is(
  (select id::text from public.community_projects where is_focused),
  '81000000-0000-4000-8000-000000000022', 'only the second project is focused'
);
select ok(
  (select is_featured and not is_focused from public.community_projects
   where id = '81000000-0000-4000-8000-000000000021'),
  'switching focus preserves the old project’s featured flag'
);

select * from finish();
rollback;
