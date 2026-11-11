begin;

set local role postgres;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(54);

insert into auth.users (id, email, raw_user_meta_data)
values
  ('81000000-0000-4000-8000-000000000001', 'projects-admin@example.invalid', '{}'),
  ('81000000-0000-4000-8000-000000000002', 'projects-member@example.invalid', '{}');
update public.profiles
set is_admin = true
where user_id = '81000000-0000-4000-8000-000000000001';

-- ---------------------------------------------------------------------------
-- Table boundary: RLS on, published-only for the public, admin sees all,
-- service_role has no direct table access.
-- ---------------------------------------------------------------------------

select ok(
  (select relrowsecurity from pg_class
   where oid = 'public.community_projects'::regclass),
  'community_projects has row level security enabled'
);
select ok(
  (select relrowsecurity from pg_class
   where oid = 'public.project_assets'::regclass),
  'project_assets has row level security enabled'
);
select ok(
  (select relrowsecurity from pg_class
   where oid = 'public.project_asset_derivatives'::regclass),
  'project_asset_derivatives has row level security enabled'
);
select ok(
  has_table_privilege('anon', 'public.community_projects', 'SELECT')
  and not has_table_privilege('anon', 'public.community_projects', 'INSERT'),
  'anon can only read community_projects'
);
select ok(
  not has_table_privilege('service_role', 'public.community_projects', 'SELECT')
  and not has_table_privilege('service_role', 'public.community_projects', 'INSERT')
  and not has_table_privilege('service_role', 'public.project_assets', 'SELECT'),
  'service_role has no direct project table access'
);
select ok(
  has_table_privilege('authenticated', 'public.project_assets', 'SELECT')
  and not has_table_privilege('authenticated', 'public.project_assets', 'INSERT')
  and not has_table_privilege('anon', 'public.project_assets', 'SELECT'),
  'project asset metadata is readable by authenticated sessions only'
);

-- ---------------------------------------------------------------------------
-- RPC grants: the anonymous boundary is service_role-only, the admin
-- workflow is authenticated-only, the finalizer is service_role-only.
-- ---------------------------------------------------------------------------

select ok(
  has_function_privilege(
    'service_role',
    'public.create_community_project_draft(text,text,text,text,text,text,text,bigint,text,text)',
    'EXECUTE'
  )
  and has_function_privilege(
    'service_role', 'public.claim_project_asset_presign(text,text)', 'EXECUTE'
  )
  and has_function_privilege(
    'service_role',
    'public.delete_community_project_after_asset_cleanup(uuid)',
    'EXECUTE'
  ),
  'the secret-key role can execute the narrow project workflow RPCs'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.create_community_project_draft(text,text,text,text,text,text,text,bigint,text,text)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated',
    'public.create_community_project_draft(text,text,text,text,text,text,text,bigint,text,text)',
    'EXECUTE'
  ),
  'anon and authenticated cannot execute the project draft RPC'
);
select is(
  (
    select count(*)::integer
    from unnest(array[
      'public.admin_create_community_project(text,text,text,text,text)',
      'public.admin_save_community_project(uuid,text,text,text,text,text)',
      'public.admin_begin_project_asset_replacement(uuid,text,text,bigint,text,text)',
      'public.admin_sync_project_asset_result(uuid,uuid,text,text,text,text,text,text,text,bigint,text,integer,integer,jsonb,text)',
      'public.admin_approve_project_asset(uuid,uuid,text)',
      'public.admin_reject_project_asset(uuid,uuid,text)',
      'public.admin_publish_community_project(uuid,uuid,jsonb)',
      'public.admin_unpublish_community_project(uuid)',
      'public.admin_delete_community_project(uuid)'
    ]) as workflow(signature)
    where has_function_privilege(
      'authenticated', signature::regprocedure, 'EXECUTE'
    )
  ),
  9,
  'authenticated sessions can reach all nine project workflow RPC boundaries'
);
select is(
  (
    select count(*)::integer
    from unnest(array[
      'public.admin_create_community_project(text,text,text,text,text)',
      'public.admin_save_community_project(uuid,text,text,text,text,text)',
      'public.admin_begin_project_asset_replacement(uuid,text,text,bigint,text,text)',
      'public.admin_sync_project_asset_result(uuid,uuid,text,text,text,text,text,text,text,bigint,text,integer,integer,jsonb,text)',
      'public.admin_approve_project_asset(uuid,uuid,text)',
      'public.admin_reject_project_asset(uuid,uuid,text)',
      'public.admin_publish_community_project(uuid,uuid,jsonb)',
      'public.admin_unpublish_community_project(uuid)',
      'public.admin_delete_community_project(uuid)'
    ]) as workflow(signature)
    where has_function_privilege('anon', signature::regprocedure, 'EXECUTE')
      or has_function_privilege(
        'service_role', signature::regprocedure, 'EXECUTE'
      )
  ),
  0,
  'anonymous and service roles have no grant on any project workflow RPC'
);

-- ---------------------------------------------------------------------------
-- The rate limiter accepts the project scope with the article quota.
-- ---------------------------------------------------------------------------

set local role service_role;
select is(
  (select allowed from public.consume_submission_rate_limit(
    'project', repeat('a', 64)
  )),
  true,
  'the project rate-limit scope exists'
);
select is(
  (select remaining from public.consume_submission_rate_limit(
    'project', repeat('a', 64)
  )),
  1,
  'the project scope carries the article quota of three per day'
);
select ok(
  not (select allowed from (
    select allowed from public.consume_submission_rate_limit(
      'project', repeat('a', 64)
    )
    union all
    select allowed from public.consume_submission_rate_limit(
      'project', repeat('a', 64)
    )
    order by allowed asc
    limit 1
  ) as exhausted),
  'the fourth project submission in a window is limited'
);

-- ---------------------------------------------------------------------------
-- Draft creation through the anonymous boundary.
-- ---------------------------------------------------------------------------

select lives_ok(
  $$select * from public.create_community_project_draft(
    'Pgtap Draft Probe',
    'A public dashboard that reads the canonical chain and shows live network health.',
    'https://example-project.invalid/board',
    'information',
    'chainwatcher',
    null, null, null, null, null
  )$$,
  'a text-only community project draft can be created'
);
set local role postgres;
select ok(
  (
    select submitted_by_community
      and not is_published
      and published_at is null
      and published_asset_id is null
      and category = 'information'
      and author_name = 'chainwatcher'
    from public.community_projects
    where name = 'Pgtap Draft Probe'
  ),
  'the draft RPC forces the private community-draft fields'
);
set local role service_role;
select lives_ok(
  $$select * from public.create_community_project_draft(
    'Pgtap Asset Probe',
    'A setup helper that walks a new miner through pool configuration safely.',
    'https://example-mining.invalid/',
    'tooling',
    null,
    'development', 'image/webp', 2048, 'Mining helper artwork', repeat('b', 64)
  )$$,
  'a project draft with a cover capability can be created'
);
set local role postgres;
select is(
  (
    select count(*)::integer from public.project_assets asset
    join public.community_projects project on project.id = asset.project_id
    where project.name = 'Pgtap Asset Probe'
      and asset.state = 'awaiting_presign'
      and asset.capability_purpose = 'community_submission'
      and asset.object_key =
        'news/quarantine/' || project.id::text || '/' || asset.id::text || '/original'
  ),
  1,
  'the cover capability row carries the quarantine key contract'
);
set local role service_role;
select throws_ok(
  $$select * from public.create_community_project_draft(
    'X', 'Too short of a name should be rejected outright.',
    'https://example.invalid/x', 'utility', null,
    null, null, null, null, null
  )$$,
  '22023',
  'invalid project name',
  'a one-character project name is rejected'
);
select throws_ok(
  $$select * from public.create_community_project_draft(
    'Valid Name', 'A perfectly reasonable project description for testing.',
    'http://insecure.invalid/x', 'utility', null,
    null, null, null, null, null
  )$$,
  '22023',
  'invalid project url',
  'a non-https project url is rejected'
);
select throws_ok(
  format($f$select * from public.create_community_project_draft(
    'Valid Name', %L,
    'https://example.invalid/x', 'utility', null,
    null, null, null, null, null
  )$f$, repeat('x', 201)),
  '22023',
  'invalid project description',
  'a description past 200 characters is rejected'
);
select throws_ok(
  $$select * from public.create_community_project_draft(
    'Valid Name', 'A perfectly reasonable project description for testing.',
    'https://example.invalid/x', 'gossip', null,
    null, null, null, null, null
  )$$,
  '22023',
  'invalid project category',
  'a category outside the closed set is rejected'
);

-- ---------------------------------------------------------------------------
-- Presign claim is one-shot and environment-bound.
-- ---------------------------------------------------------------------------

select is(
  (select count(*)::integer from public.claim_project_asset_presign(
    repeat('b', 64), 'development'
  )),
  1,
  'an unexpired project capability claims exactly one presign'
);
select is(
  (select count(*)::integer from public.claim_project_asset_presign(
    repeat('b', 64), 'development'
  )),
  0,
  'a project capability cannot be claimed twice'
);
set local role postgres;
select ok(
  (
    select asset.state = 'awaiting_upload'
      and asset.capability_digest is null
      and asset.presigned_at is not null
    from public.project_assets asset
    join public.community_projects project on project.id = asset.project_id
    where project.name = 'Pgtap Asset Probe'
  ),
  'the claim flips the asset to awaiting_upload and burns the digest'
);

-- ---------------------------------------------------------------------------
-- Admin workflow: non-admins are refused, admins can manage and publish.
-- ---------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims =
  '{"sub":"81000000-0000-4000-8000-000000000002","role":"authenticated","app_metadata":{"admin":false}}';
select throws_ok(
  $$select public.admin_create_community_project(
    'Denied', 'This creation attempt must be refused by the RPC.',
    'https://example.invalid/denied', 'utility', null
  )$$,
  '42501',
  'admin access required',
  'a non-admin cannot create a project through the admin RPC'
);
select throws_ok(
  $$select public.admin_publish_community_project(
    '82000000-0000-4000-8000-000000000001', null, null
  )$$,
  '42501',
  'admin access required',
  'a non-admin cannot publish a project'
);
select throws_ok(
  $$select public.admin_save_community_project(
    '82000000-0000-4000-8000-000000000001',
    'Denied', 'This save attempt must be refused by the RPC boundary.',
    'https://example.invalid/denied', 'utility', null
  )$$,
  '42501',
  'admin access required',
  'a non-admin cannot save a project'
);
select throws_ok(
  $$select public.admin_begin_project_asset_replacement(
    '82000000-0000-4000-8000-000000000001',
    'development', 'image/png', 1024, null, repeat('9', 64)
  )$$,
  '42501',
  'admin access required',
  'a non-admin cannot begin a project asset replacement'
);
select throws_ok(
  $$select public.admin_sync_project_asset_result(
    '82000000-0000-4000-8000-000000000001',
    '83000000-0000-4000-8000-000000000001',
    'development', 'changed', 'version', 'changed', 'manifest',
    'rejected', null, null, null, null, null, null, 'decode_failed'
  )$$,
  '42501',
  'admin access required',
  'a non-admin cannot sync a project processor manifest'
);
select throws_ok(
  $$select public.admin_approve_project_asset(
    '82000000-0000-4000-8000-000000000001',
    '83000000-0000-4000-8000-000000000001',
    'Denied alt text'
  )$$,
  '42501',
  'admin access required',
  'a non-admin cannot approve a project image'
);
select throws_ok(
  $$select public.admin_reject_project_asset(
    '82000000-0000-4000-8000-000000000001',
    '83000000-0000-4000-8000-000000000001',
    'Denied reason'
  )$$,
  '42501',
  'admin access required',
  'a non-admin cannot reject a project image'
);
select throws_ok(
  $$select public.admin_unpublish_community_project(
    '82000000-0000-4000-8000-000000000001'
  )$$,
  '42501',
  'admin access required',
  'a non-admin cannot unpublish a project'
);
select is(
  (
    select count(*)::integer from public.community_projects
    where name like 'Pgtap %'
  ),
  0,
  'a non-admin session sees no drafts through RLS'
);

set local request.jwt.claims =
  '{"sub":"81000000-0000-4000-8000-000000000001","role":"authenticated","app_metadata":{"admin":true}}';
select is(
  (
    select count(*)::integer from public.community_projects
    where name like 'Pgtap %'
  ),
  2,
  'an admin session sees every draft'
);
select lives_ok(
  $$select public.admin_create_community_project(
    'Pgtap Node Atlas',
    'An operator-maintained map of public BlockDAG nodes and their versions.',
    'https://example-atlas.invalid/', 'infrastructure', 'atlas-crew'
  )$$,
  'an admin can create a project directly'
);
select throws_ok(
  $$select public.admin_create_community_project(
    'Bad Category', 'A project description of a reasonable length here.',
    'https://example.invalid/bad', 'marketing', null
  )$$,
  '22023',
  'invalid project category',
  'the admin create RPC rejects categories outside the set'
);
set local role postgres;
select ok(
  (
    select not submitted_by_community and category = 'infrastructure'
    from public.community_projects
    where name = 'Pgtap Node Atlas'
  ),
  'an admin-created project is not marked as a community submission'
);
set local role authenticated;
select ok(
  (
    select public.admin_save_community_project(
      id,
      'Pgtap Node Atlas',
      'An operator-maintained map of public BlockDAG nodes, versions, and health.',
      'https://example-atlas.invalid/',
      'information',
      'atlas-crew'
    )
    from public.community_projects
    where name = 'Pgtap Node Atlas'
  ),
  'an admin can save project edits including the category'
);
set local role postgres;
select is(
  (select category from public.community_projects where name = 'Pgtap Node Atlas'),
  'information',
  'the saved category sticks'
);

set local role authenticated;
select ok(
  (
    select public.admin_publish_community_project(id, null, null)
    from public.community_projects
    where name = 'Pgtap Node Atlas'
  ),
  'an admin can publish a project without a cover'
);
set local role postgres;
select ok(
  (
    select is_published and published_at is not null
    from public.community_projects
    where name = 'Pgtap Node Atlas'
  ),
  'publication stamps the published state pair'
);

set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
select is(
  (
    select count(*)::integer from public.community_projects
    where name like 'Pgtap %'
  ),
  1,
  'anonymous readers see only the published project'
);
select is(
  (
    select name from public.community_projects
    where name like 'Pgtap %'
    limit 1
  ),
  'Pgtap Node Atlas',
  'the published project is the one the public reads'
);

set local role authenticated;
set local request.jwt.claims =
  '{"sub":"81000000-0000-4000-8000-000000000001","role":"authenticated","app_metadata":{"admin":true}}';
select throws_ok(
  $$select public.admin_delete_community_project(
    (select id from public.community_projects where name = 'Pgtap Node Atlas')
  )$$,
  '22023',
  'unpublish project first',
  'a published project cannot be deleted'
);
select ok(
  (
    select public.admin_unpublish_community_project(id)
    from public.community_projects
    where name = 'Pgtap Node Atlas'
  ),
  'an admin can unpublish a project'
);
select ok(
  (
    select public.admin_delete_community_project(id)
    from public.community_projects
    where name = 'Pgtap Node Atlas'
  ),
  'an unpublished project without assets can be deleted'
);
select throws_ok(
  $$select public.admin_delete_community_project(
    (select id from public.community_projects where name = 'Pgtap Asset Probe')
  )$$,
  '22023',
  'asset cleanup required',
  'a project with recorded assets requires the cleanup path'
);

-- ---------------------------------------------------------------------------
-- Takedown and republish regressions: unpublishing must supersede a pending
-- replacement candidate instead of colliding with the one-active-candidate
-- index, and republishing the same cover must be accepted as an idempotent
-- re-promotion instead of dead-ending.
-- ---------------------------------------------------------------------------

set local role postgres;
insert into public.community_projects (
  id, name, description, url, category, submitted_by_community,
  is_published, published_at
) values (
  '92000000-0000-4000-8000-000000000001',
  'Pgtap Takedown Probe',
  'A published fixture project used to prove the takedown stays unblocked.',
  'https://example-takedown.invalid/',
  'utility',
  false,
  true,
  statement_timestamp()
);
insert into public.project_assets (
  id, project_id, storage_environment, asset_kind, object_key, state,
  declared_content_type, declared_byte_size, alt_text,
  capability_digest, capability_expires_at, presigned_at,
  quarantine_version_id, moderated_by, moderated_at
) values
  (
    '93000000-0000-4000-8000-000000000001',
    '92000000-0000-4000-8000-000000000001',
    'development',
    'cover',
    'news/quarantine/92000000-0000-4000-8000-000000000001/93000000-0000-4000-8000-000000000001/original',
    'published',
    'image/webp',
    4096,
    'A published fixture cover',
    null,
    statement_timestamp() + interval '4 minutes',
    statement_timestamp(),
    'takedown-source-version',
    '81000000-0000-4000-8000-000000000001',
    statement_timestamp()
  ),
  (
    '93000000-0000-4000-8000-000000000002',
    '92000000-0000-4000-8000-000000000001',
    'development',
    'cover',
    'news/quarantine/92000000-0000-4000-8000-000000000001/93000000-0000-4000-8000-000000000002/original',
    'ready',
    'image/png',
    2048,
    null,
    null,
    statement_timestamp() + interval '4 minutes',
    statement_timestamp(),
    'candidate-source-version',
    null,
    null
  );
insert into public.project_asset_derivatives (
  project_id, asset_id, storage_environment, variant_width, content_type,
  processed_key, processed_version_id, byte_size, checksum_sha256,
  width, height, published_key, published_version_id, published_at
)
select
  '92000000-0000-4000-8000-000000000001'::uuid,
  '93000000-0000-4000-8000-000000000001'::uuid,
  'development',
  variant_width,
  'image/webp',
  'news/processed/92000000-0000-4000-8000-000000000001/93000000-0000-4000-8000-000000000001/cover-' ||
    variant_width::text || 'x' || variant_height::text || '.webp',
  'processed-' || variant_width::text,
  variant_width,
  repeat(substr(variant_width::text, 1, 1), 64),
  variant_width,
  variant_height,
  'news/published/92000000-0000-4000-8000-000000000001/93000000-0000-4000-8000-000000000001/cover-' ||
    variant_width::text || 'x' || variant_height::text || '.webp',
  'published-' || variant_width::text,
  statement_timestamp()
from (values (640, 360), (1024, 576), (1600, 900))
as variants(variant_width, variant_height);
update public.community_projects
set
  published_asset_id = '93000000-0000-4000-8000-000000000001',
  published_asset_alt_text = 'A published fixture cover'
where id = '92000000-0000-4000-8000-000000000001';

set local role authenticated;
set local request.jwt.claims =
  '{"sub":"81000000-0000-4000-8000-000000000001","role":"authenticated","app_metadata":{"admin":true}}';
select ok(
  (select public.admin_unpublish_community_project(
    '92000000-0000-4000-8000-000000000001'
  )),
  'the takedown succeeds despite a pending replacement candidate'
);
set local role postgres;
select is(
  (select state from public.project_assets
   where id = '93000000-0000-4000-8000-000000000002'),
  'superseded',
  'the pending candidate is superseded by the takedown'
);
select ok(
  (
    select asset.state = 'approved' and not project.is_published
    from public.project_assets asset
    join public.community_projects project on project.id = asset.project_id
    where asset.id = '93000000-0000-4000-8000-000000000001'
  ),
  'the published cover demotes to approved and the project is down'
);

set local role authenticated;
select ok(
  (select public.admin_publish_community_project(
    '92000000-0000-4000-8000-000000000001',
    '93000000-0000-4000-8000-000000000001',
    (
      select jsonb_agg(jsonb_build_object(
        'variantWidth', variant_width,
        'publishedKey', published_key,
        'publishedVersionId', published_version_id
      ))
      from public.project_asset_derivatives
      where asset_id = '93000000-0000-4000-8000-000000000001'
    )
  )),
  'republishing the same cover is an idempotent re-promotion'
);
set local role postgres;
select ok(
  (
    select project.is_published
      and project.published_asset_id = '93000000-0000-4000-8000-000000000001'
      and asset.state = 'published'
    from public.community_projects project
    join public.project_assets asset on asset.id = project.published_asset_id
    where project.id = '92000000-0000-4000-8000-000000000001'
  ),
  'the project is live again with the same cover'
);

-- ---------------------------------------------------------------------------
-- The service-role finalizer deletes only after the app cleaned storage.
-- ---------------------------------------------------------------------------

set local role postgres;
delete from public.project_assets
where project_id = (
  select id from public.community_projects where name = 'Pgtap Asset Probe'
);
-- service_role has no table SELECT, so hand it the target id through a
-- transaction-local setting instead of a subquery it cannot run.
select set_config('test.finalizer_target', id::text, true)
from public.community_projects
where name = 'Pgtap Draft Probe';
set local role service_role;
select ok(
  (
    select public.delete_community_project_after_asset_cleanup(
      current_setting('test.finalizer_target')::uuid
    )
  ),
  'the finalizer deletes an unpublished draft after asset cleanup'
);
set local role postgres;
select is(
  (
    select count(*)::integer from public.community_projects
    where name = 'Pgtap Draft Probe'
  ),
  0,
  'the finalized project row is gone'
);

select * from finish();
rollback;
