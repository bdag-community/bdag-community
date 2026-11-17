begin;

set local role postgres;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(86);

insert into auth.users (id, email, raw_user_meta_data)
values
  ('71000000-0000-4000-8000-000000000001', 'moderation-admin@example.invalid', '{}'),
  ('71000000-0000-4000-8000-000000000002', 'moderation-member@example.invalid', '{}');
update public.profiles
set is_admin = true
where user_id = '71000000-0000-4000-8000-000000000001';

insert into public.news_articles (
  id, slug, title, description, body, body_html, is_published, published_at
) values
  (
    '72000000-0000-4000-8000-000000000001',
    'moderation-text',
    'Moderation text draft',
    null,
    null,
    null,
    false,
    null
  ),
  (
    '72000000-0000-4000-8000-000000000002',
    'moderation-sync',
    'Moderation asset draft',
    'A complete description for the asset-backed article.',
    'A complete body for the asset-backed article.',
    '<p>A complete body for the asset-backed article.</p>',
    false,
    null
  ),
  (
    '72000000-0000-4000-8000-000000000003',
    'moderation-existing-cover',
    'Article with an existing published cover',
    'A complete description for the published article.',
    'A complete body for the published article.',
    '<p>A complete body for the published article.</p>',
    true,
    statement_timestamp()
  ),
  (
    '72000000-0000-4000-8000-000000000004',
    'moderation-admin-draft-capability',
    'Admin-authored draft capability',
    'A complete description for the admin-authored draft.',
    'A complete body for the admin-authored draft.',
    '<p>A complete body for the admin-authored draft.</p>',
    false,
    null
  ),
  (
    '72000000-0000-4000-8000-000000000005',
    'moderation-expired-replacement',
    'Expired replacement retry',
    'A complete description for the replacement retry.',
    'A complete body for the replacement retry.',
    '<p>A complete body for the replacement retry.</p>',
    false,
    null
  ),
  (
    '72000000-0000-4000-8000-000000000006',
    'moderation-rejected-replay',
    'Rejected manifest replay',
    'A complete description for the rejected manifest.',
    'A complete body for the rejected manifest.',
    '<p>A complete body for the rejected manifest.</p>',
    false,
    null
  ),
  (
    '72000000-0000-4000-8000-000000000007',
    'moderation-published-community-capability',
    'Published community capability',
    'A complete description for the published community capability.',
    'A complete body for the published community capability.',
    '<p>A complete body for the published community capability.</p>',
    true,
    statement_timestamp()
  );

update public.news_articles
set submitted_by_community = true
where id = '72000000-0000-4000-8000-000000000007';

insert into public.article_assets (
  id, article_id, storage_environment, object_key, state,
  declared_content_type, declared_byte_size, alt_text,
  capability_digest, capability_expires_at, presigned_at,
  quarantine_version_id, moderated_by, moderated_at
) values
  (
    '73000000-0000-4000-8000-000000000002',
    '72000000-0000-4000-8000-000000000002',
    'development',
    'news/quarantine/72000000-0000-4000-8000-000000000002/73000000-0000-4000-8000-000000000002/original',
    'awaiting_upload',
    'image/png',
    2048,
    null,
    null,
    statement_timestamp() + interval '5 minutes',
    statement_timestamp(),
    null,
    null,
    null
  ),
  (
    '73000000-0000-4000-8000-000000000003',
    '72000000-0000-4000-8000-000000000003',
    'development',
    'news/quarantine/72000000-0000-4000-8000-000000000003/73000000-0000-4000-8000-000000000003/original',
    'published',
    'image/jpeg',
    4096,
    'A published community cover',
    null,
    statement_timestamp() + interval '5 minutes',
    statement_timestamp(),
    'published-source-version',
    '71000000-0000-4000-8000-000000000001',
    statement_timestamp()
  ),
  (
    '73000000-0000-4000-8000-000000000006',
    '72000000-0000-4000-8000-000000000006',
    'development',
    'news/quarantine/72000000-0000-4000-8000-000000000006/73000000-0000-4000-8000-000000000006/original',
    'awaiting_upload',
    'image/webp',
    3072,
    null,
    null,
    statement_timestamp() + interval '5 minutes',
    statement_timestamp(),
    null,
    null,
    null
  ),
  (
    '73000000-0000-4000-8000-000000000007',
    '72000000-0000-4000-8000-000000000007',
    'development',
    'news/quarantine/72000000-0000-4000-8000-000000000007/73000000-0000-4000-8000-000000000007/original',
    'awaiting_presign',
    'image/png',
    1024,
    null,
    repeat('7', 64),
    statement_timestamp() + interval '5 minutes',
    null,
    null,
    null,
    null
  );

insert into public.article_asset_derivatives (
  article_id, asset_id, storage_environment, variant_width, processed_key,
  processed_version_id, byte_size, checksum_sha256, width, height,
  published_key, published_version_id, published_at
)
select
  '72000000-0000-4000-8000-000000000003'::uuid,
  '73000000-0000-4000-8000-000000000003'::uuid,
  'development',
  variant_width,
  'news/processed/72000000-0000-4000-8000-000000000003/73000000-0000-4000-8000-000000000003/cover-' ||
    variant_width::text || 'x' || variant_height::text || '.webp',
  'processed-' || variant_width::text,
  variant_width,
  repeat(substr(variant_width::text, 1, 1), 64),
  variant_width,
  variant_height,
  'news/published/72000000-0000-4000-8000-000000000003/73000000-0000-4000-8000-000000000003/cover-' ||
    variant_width::text || 'x' || variant_height::text || '.webp',
  'published-' || variant_width::text,
  statement_timestamp()
from (values (640, 360), (1024, 576), (1600, 900))
as variants(variant_width, variant_height);

update public.news_articles
set
  published_asset_id = '73000000-0000-4000-8000-000000000003',
  published_asset_alt_text = 'A published community cover'
where id = '72000000-0000-4000-8000-000000000003';

create temporary table step10_manifest_payloads (
  fixture_name text primary key,
  payload jsonb not null
) on commit drop;
insert into step10_manifest_payloads (fixture_name, payload)
values (
  'ready',
  jsonb_build_array(
    jsonb_build_object(
      'variantWidth', 640, 'contentType', 'image/webp',
      'processedKey', 'news/processed/72000000-0000-4000-8000-000000000002/73000000-0000-4000-8000-000000000002/cover-640x360.webp',
      'processedVersionId', 'processed-640', 'byteSize', 640,
      'checksumSha256', repeat('b', 64), 'width', 640, 'height', 360
    ),
    jsonb_build_object(
      'variantWidth', 1024, 'contentType', 'image/webp',
      'processedKey', 'news/processed/72000000-0000-4000-8000-000000000002/73000000-0000-4000-8000-000000000002/cover-1024x576.webp',
      'processedVersionId', 'processed-1024', 'byteSize', 1024,
      'checksumSha256', repeat('c', 64), 'width', 1024, 'height', 576
    ),
    jsonb_build_object(
      'variantWidth', 1600, 'contentType', 'image/webp',
      'processedKey', 'news/processed/72000000-0000-4000-8000-000000000002/73000000-0000-4000-8000-000000000002/cover-1600x900.webp',
      'processedVersionId', 'processed-1600', 'byteSize', 1600,
      'checksumSha256', repeat('d', 64), 'width', 1600, 'height', 900
    )
  )
);
grant select on step10_manifest_payloads to authenticated;

select ok(
  (
    select relrowsecurity
    from pg_class
    where oid = 'public.article_asset_derivatives'::regclass
  ),
  'responsive derivative metadata has RLS enabled'
);
select ok(
  (
    select pg_get_constraintdef(oid) ~ 'width = variant_width'
    from pg_constraint
    where conrelid = 'public.article_asset_derivatives'::regclass
      and conname = 'article_asset_derivatives_width_check'
  )
  and (
    select pg_get_constraintdef(oid) ~
      'CASE variant_width[[:space:]]+WHEN 640 THEN 360[[:space:]]+WHEN 1024 THEN 576[[:space:]]+ELSE 900[[:space:]]+END'
    from pg_constraint
    where conrelid = 'public.article_asset_derivatives'::regclass
      and conname = 'article_asset_derivatives_height_check'
  ),
  'derivative rows enforce the exact 640x360, 1024x576, and 1600x900 dimensions'
);
select ok(
  not has_table_privilege('authenticated', 'public.news_articles', 'INSERT')
  and not has_table_privilege('authenticated', 'public.news_articles', 'UPDATE')
  and not has_table_privilege('authenticated', 'public.news_articles', 'DELETE'),
  'authenticated users have no direct news mutation privilege'
);
select ok(
  has_table_privilege('authenticated', 'public.article_asset_derivatives', 'SELECT')
  and not has_table_privilege('authenticated', 'public.article_asset_derivatives', 'INSERT')
  and not has_table_privilege('authenticated', 'public.article_asset_derivatives', 'UPDATE')
  and not has_table_privilege('authenticated', 'public.article_asset_derivatives', 'DELETE'),
  'authenticated users receive read-only derivative metadata before RLS'
);
select is(
  (
    select count(*)::integer
    from unnest(array[
      'public.admin_create_news_article(text,text,text,text,text,text,text,text)',
      'public.admin_save_news_article(uuid,text,text,text,text,text,text,text,text)',
      'public.admin_begin_article_asset_replacement(uuid,text,text,bigint,text,text)',
      'public.admin_sync_article_asset_result(uuid,uuid,text,text,text,text,text,text,text,bigint,text,integer,integer,jsonb,text)',
      'public.admin_approve_article_asset(uuid,uuid,text)',
      'public.admin_reject_article_asset(uuid,uuid,text)',
      'public.admin_publish_news_article(uuid,uuid,jsonb)',
      'public.admin_unpublish_news_article(uuid)',
      'public.admin_delete_news_article(uuid)'
    ]) as workflow(signature)
    where has_function_privilege(
      'authenticated', signature::regprocedure, 'EXECUTE'
    )
  ),
  9,
  'authenticated sessions can reach all nine admin workflow RPC boundaries'
);
select is(
  (
    select count(*)::integer
    from unnest(array[
      'public.admin_create_news_article(text,text,text,text,text,text,text,text)',
      'public.admin_save_news_article(uuid,text,text,text,text,text,text,text,text)',
      'public.admin_begin_article_asset_replacement(uuid,text,text,bigint,text,text)',
      'public.admin_sync_article_asset_result(uuid,uuid,text,text,text,text,text,text,text,bigint,text,integer,integer,jsonb,text)',
      'public.admin_approve_article_asset(uuid,uuid,text)',
      'public.admin_reject_article_asset(uuid,uuid,text)',
      'public.admin_publish_news_article(uuid,uuid,jsonb)',
      'public.admin_unpublish_news_article(uuid)',
      'public.admin_delete_news_article(uuid)'
    ]) as workflow(signature)
    where has_function_privilege('anon', signature::regprocedure, 'EXECUTE')
      or has_function_privilege(
        'service_role', signature::regprocedure, 'EXECUTE'
      )
  ),
  0,
  'anonymous and service roles have no grant on any admin workflow RPC'
);
select is(
  (
    select count(*)::integer
    from pg_proc as procedure
    cross join lateral aclexplode(
      coalesce(procedure.proacl, acldefault('f', procedure.proowner))
    ) as privilege
    where procedure.oid in (
      'public.admin_create_news_article(text,text,text,text,text,text,text,text)'::regprocedure,
      'public.admin_save_news_article(uuid,text,text,text,text,text,text,text,text)'::regprocedure,
      'public.admin_begin_article_asset_replacement(uuid,text,text,bigint,text,text)'::regprocedure,
      'public.admin_sync_article_asset_result(uuid,uuid,text,text,text,text,text,text,text,bigint,text,integer,integer,jsonb,text)'::regprocedure,
      'public.admin_approve_article_asset(uuid,uuid,text)'::regprocedure,
      'public.admin_reject_article_asset(uuid,uuid,text)'::regprocedure,
      'public.admin_publish_news_article(uuid,uuid,jsonb)'::regprocedure,
      'public.admin_unpublish_news_article(uuid)'::regprocedure,
      'public.admin_delete_news_article(uuid)'::regprocedure
    )
      and privilege.grantee = 0
      and privilege.privilege_type = 'EXECUTE'
  ),
  0,
  'PUBLIC has no implicit execute grant on any admin workflow RPC'
);
select is(
  (
    select count(*)::integer
    from pg_proc
    where proname like 'admin\_%' escape '\'
      and pronamespace = 'public'::regnamespace
      and prosecdef
      and pg_get_userbyid(proowner) = 'postgres'
  ),
  19,
  'all nineteen admin workflow RPCs (articles + projects) are postgres-owned security definers'
);

set local role authenticated;
set local request.jwt.claims =
  '{"sub":"71000000-0000-4000-8000-000000000002","role":"authenticated","app_metadata":{"admin":false}}';
select is(
  (select count(*)::integer from public.article_asset_derivatives),
  0,
  'a non-admin sees no private derivative metadata'
);
select throws_ok(
  $$select public.admin_create_news_article(
    'Denied', 'denied', null, null, null, null, null
  )$$,
  '42501',
  'admin access required',
  'a non-admin cannot create an article through the admin RPC'
);
select throws_ok(
  $$select public.admin_sync_article_asset_result(
    '72000000-0000-4000-8000-000000000002',
    '73000000-0000-4000-8000-000000000002',
    'development', 'changed', 'version', 'changed', 'manifest',
    'rejected', null, null, null, null, null, null, 'decode-failed'
  )$$,
  '42501',
  'admin access required',
  'a non-admin cannot sync a processor manifest'
);
select throws_ok(
  $$select public.admin_save_news_article(
    '72000000-0000-4000-8000-000000000001',
    'Denied', 'denied', null, null, null, null, null
  )$$,
  '42501',
  'admin access required',
  'a non-admin cannot save an article through the admin RPC'
);
select throws_ok(
  $$select public.admin_begin_article_asset_replacement(
    '72000000-0000-4000-8000-000000000001',
    'development', 'image/png', 100, null, repeat('1', 64)
  )$$,
  '42501',
  'admin access required',
  'a non-admin cannot begin an asset replacement'
);
select throws_ok(
  $$select public.admin_approve_article_asset(
    '72000000-0000-4000-8000-000000000002',
    '73000000-0000-4000-8000-000000000002',
    'Denied alt text'
  )$$,
  '42501',
  'admin access required',
  'a non-admin cannot approve an asset'
);
select throws_ok(
  $$select public.admin_reject_article_asset(
    '72000000-0000-4000-8000-000000000002',
    '73000000-0000-4000-8000-000000000002',
    'Denied rejection reason'
  )$$,
  '42501',
  'admin access required',
  'a non-admin cannot reject an asset'
);
select throws_ok(
  $$select public.admin_publish_news_article(
    '72000000-0000-4000-8000-000000000002', null, null
  )$$,
  '42501',
  'admin access required',
  'a non-admin cannot publish an article'
);
select throws_ok(
  $$select public.admin_unpublish_news_article(
    '72000000-0000-4000-8000-000000000003'
  )$$,
  '42501',
  'admin access required',
  'a non-admin cannot unpublish an article'
);
select throws_ok(
  $$select public.admin_delete_news_article(
    '72000000-0000-4000-8000-000000000001'
  )$$,
  '42501',
  'admin access required',
  'a non-admin cannot delete an article'
);

set local role postgres;
set local role authenticated;
set local request.jwt.claims =
  '{"sub":"71000000-0000-4000-8000-000000000001","role":"authenticated","app_metadata":{"admin":true}}';
select throws_ok(
  $$insert into public.news_articles (slug, title) values ('direct-admin', 'Denied')$$,
  '42501',
  'permission denied for table news_articles',
  'an admin cannot bypass workflow RPCs with a direct insert'
);
select throws_ok(
  $$select public.admin_begin_article_asset_replacement(
    null, 'development', 'image/png', 1024, null, repeat('1', 64)
  )$$,
  '22023',
  'invalid article asset',
  'replacement rejects a null article id explicitly'
);
select throws_ok(
  $$select public.admin_begin_article_asset_replacement(
    '72000000-0000-4000-8000-000000000004',
    null, 'image/png', 1024, null, repeat('1', 64)
  )$$,
  '22023',
  'invalid article asset',
  'replacement rejects a null storage environment explicitly'
);
select throws_ok(
  $$select public.admin_begin_article_asset_replacement(
    '72000000-0000-4000-8000-000000000004',
    'development', null, 1024, null, repeat('1', 64)
  )$$,
  '22023',
  'invalid article asset',
  'replacement rejects a null content type explicitly'
);
select throws_ok(
  $$select public.admin_begin_article_asset_replacement(
    '72000000-0000-4000-8000-000000000004',
    'development', 'image/png', null, null, repeat('1', 64)
  )$$,
  '22023',
  'invalid article asset',
  'replacement rejects a null byte size explicitly'
);
select throws_ok(
  $$select public.admin_begin_article_asset_replacement(
    '72000000-0000-4000-8000-000000000004',
    'development', 'image/png', 1024, null, null
  )$$,
  '22023',
  'invalid article asset',
  'replacement rejects a null capability digest explicitly'
);
select throws_ok(
  $$select public.admin_save_news_article(
    '72000000-0000-4000-8000-000000000003',
    'Article with an existing published cover',
    'moderation-existing-cover', null, null,
    'A complete body for the published article.',
    '<p>A complete body for the published article.</p>', null
  )$$,
  '22023',
  'published article is incomplete',
  'a published article cannot have its description cleared'
);
select throws_ok(
  $$select public.admin_save_news_article(
    '72000000-0000-4000-8000-000000000003',
    'Article with an existing published cover',
    'moderation-existing-cover', null,
    'A complete description for the published article.',
    '   ', null, null
  )$$,
  '22023',
  'published article is incomplete',
  'a published article cannot have its body cleared'
);
select ok(
  (
    select is_published
      and description = 'A complete description for the published article.'
      and body = 'A complete body for the published article.'
    from public.news_articles
    where id = '72000000-0000-4000-8000-000000000003'
  ),
  'rejected published edits leave the existing article content unchanged'
);
select throws_ok(
  $$select public.admin_create_news_article(
    'Category outside the set', 'moderation-category-invalid',
    null, null, null, null, null, 'gossip'
  )$$,
  '22023',
  'invalid article category',
  'a category outside the closed set is rejected'
);
select lives_ok(
  $$select public.admin_create_news_article(
    'Category defaults to news', 'moderation-category-default',
    null, null, null, null, null
  ),
  public.admin_create_news_article(
    'Category can be chosen', 'moderation-category-chosen',
    null, null, null, null, null, 'projects'
  )$$,
  'an admin can create articles with and without an explicit category'
);
set local role postgres;
select is(
  (
    select category from public.news_articles
    where slug = 'moderation-category-default'
  ),
  'news',
  'an article created without a category defaults to news'
);
select is(
  (
    select category from public.news_articles
    where slug = 'moderation-category-chosen'
  ),
  'projects',
  'an article created with an explicit category keeps it'
);
set local role authenticated;
select lives_ok(
  $$select public.admin_begin_article_asset_replacement(
    '72000000-0000-4000-8000-000000000004',
    'development', 'image/png', 1024,
    'An admin draft replacement cover', repeat('1', 64)
  )$$,
  'an admin-authored draft can receive a replacement upload capability'
);
set local role postgres;
set local role service_role;
select is(
  (
    select count(*)::integer
    from public.claim_article_asset_presign(repeat('1', 64), 'development')
  ),
  1,
  'an admin replacement capability can be claimed for an admin-authored draft'
);
set local role postgres;
select ok(
  (
    select state = 'awaiting_upload'
      and capability_purpose = 'admin_replacement'
      and capability_digest is null
      and presigned_at is not null
    from public.article_assets
    where article_id = '72000000-0000-4000-8000-000000000004'
  ),
  'the admin draft capability is consumed into one private upload candidate'
);
set local role service_role;
select is(
  (
    select count(*)::integer
    from public.claim_article_asset_presign(repeat('1', 64), 'development')
  ),
  0,
  'an admin draft capability is one-shot'
);
select is(
  (
    select count(*)::integer
    from public.claim_article_asset_presign(repeat('7', 64), 'development')
  ),
  0,
  'a legacy community capability remains unusable after its parent is published'
);
set local role postgres;
set local role authenticated;
set local request.jwt.claims =
  '{"sub":"71000000-0000-4000-8000-000000000001","role":"authenticated","app_metadata":{"admin":true}}';
select lives_ok(
  $$select public.admin_begin_article_asset_replacement(
    '72000000-0000-4000-8000-000000000005',
    'development', 'image/jpeg', 2048, null, repeat('2', 64)
  )$$,
  'an initial replacement capability is created for the retry fixture'
);
set local role postgres;
update public.article_assets
set
  created_at = statement_timestamp() - interval '10 minutes',
  capability_expires_at = statement_timestamp() - interval '5 minutes'
where article_id = '72000000-0000-4000-8000-000000000005'
  and capability_digest = repeat('2', 64);
set local role authenticated;
set local request.jwt.claims =
  '{"sub":"71000000-0000-4000-8000-000000000001","role":"authenticated","app_metadata":{"admin":true}}';
select lives_ok(
  $$select public.admin_begin_article_asset_replacement(
    '72000000-0000-4000-8000-000000000005',
    'development', 'image/jpeg', 2048, null, repeat('3', 64)
  )$$,
  'an expired waiting replacement can be superseded by a fresh capability'
);
set local role postgres;
select ok(
  (
    select count(*) = 1
    from public.article_assets
    where article_id = '72000000-0000-4000-8000-000000000005'
      and state = 'superseded'
      and capability_digest is null
      and presigned_at is not null
      and presigned_at < capability_expires_at
  )
  and (
    select count(*) = 1
    from public.article_assets
    where article_id = '72000000-0000-4000-8000-000000000005'
      and state = 'awaiting_presign'
      and capability_digest = repeat('3', 64)
  ),
  'expired retry preserves a constraint-valid history and one active candidate'
);
set local role service_role;
select is(
  (
    select count(*)::integer
    from public.claim_article_asset_presign(repeat('3', 64), 'development')
  ),
  1,
  'the fresh retry capability can be claimed once'
);
set local role postgres;
set local role authenticated;
set local request.jwt.claims =
  '{"sub":"71000000-0000-4000-8000-000000000001","role":"authenticated","app_metadata":{"admin":true}}';
select lives_ok(
  $$select public.admin_save_news_article(
    '72000000-0000-4000-8000-000000000001',
    'Moderation text draft', 'moderation-text', null,
    'A complete text-only description.',
    'A complete text-only body.',
    '<p>A complete text-only body.</p>',
    'Community editor'
  )$$,
  'the generic save RPC edits content only'
);
select ok(
  (
    select not is_published and published_at is null and image_url is null
    from public.news_articles
    where id = '72000000-0000-4000-8000-000000000001'
  ),
  'generic save cannot publish or attach an arbitrary image'
);
select lives_ok(
  $$select public.admin_publish_news_article(
    '72000000-0000-4000-8000-000000000001', null, null
  )$$,
  'a complete text-only article can publish'
);
select ok(
  (
    select is_published and published_at is not null and published_asset_id is null
    from public.news_articles
    where id = '72000000-0000-4000-8000-000000000001'
  ),
  'text publication updates all publication fields atomically'
);
select lives_ok(
  $$select public.admin_unpublish_news_article(
    '72000000-0000-4000-8000-000000000001'
  )$$,
  'unpublish is a separate RPC'
);
select ok(
  (
    select not is_published and published_at is null and published_asset_id is null
    from public.news_articles
    where id = '72000000-0000-4000-8000-000000000001'
  ),
  'unpublish hides the article atomically'
);
select throws_ok(
  $$select public.admin_sync_article_asset_result(
    '72000000-0000-4000-8000-000000000002',
    '73000000-0000-4000-8000-000000000002',
    null,
    'news/quarantine/72000000-0000-4000-8000-000000000002/73000000-0000-4000-8000-000000000002/original',
    'source-v1',
    'news/processed/72000000-0000-4000-8000-000000000002/73000000-0000-4000-8000-000000000002/result.json',
    'manifest-v1', 'ready', 'image/png', 2048, repeat('a', 64), 1200, 800,
    '[]'::jsonb, null
  )$$,
  '22023',
  'invalid asset result',
  'manifest sync rejects a null storage environment explicitly'
);
select throws_ok(
  $$select public.admin_sync_article_asset_result(
    '72000000-0000-4000-8000-000000000002',
    '73000000-0000-4000-8000-000000000002',
    'development',
    'news/quarantine/72000000-0000-4000-8000-000000000002/73000000-0000-4000-8000-000000000002/original',
    'source-v1', null, 'manifest-v1', 'ready', 'image/png', 2048,
    repeat('a', 64), 1200, 800,
    (select payload from step10_manifest_payloads where fixture_name = 'ready'),
    null
  )$$,
  '22023',
  'invalid asset result',
  'manifest sync rejects a null result key explicitly'
);
select throws_ok(
  $$select public.admin_sync_article_asset_result(
    '72000000-0000-4000-8000-000000000002',
    '73000000-0000-4000-8000-000000000002',
    'development',
    'news/quarantine/changed',
    'source-v1',
    'news/processed/72000000-0000-4000-8000-000000000002/73000000-0000-4000-8000-000000000002/result.json',
    'manifest-v1', 'ready', 'image/png', 2048, repeat('a', 64), 1200, 800,
    '[]'::jsonb, null
  )$$,
  'P0002',
  'asset not found',
  'manifest sync binds the exact database-owned quarantine key'
);
select throws_ok(
  $$select public.admin_sync_article_asset_result(
    '72000000-0000-4000-8000-000000000002',
    '73000000-0000-4000-8000-000000000002',
    'development',
    'news/quarantine/72000000-0000-4000-8000-000000000002/73000000-0000-4000-8000-000000000002/original',
    'source-v1',
    'news/processed/72000000-0000-4000-8000-000000000002/73000000-0000-4000-8000-000000000002/result.json',
    'manifest-v1', 'ready', 'image/png', 2048, repeat('a', 64), 1200, 800,
    (
      select jsonb_agg(jsonb_build_object(
        'variantWidth', malformed_width,
        'contentType', 'image/webp',
        'processedKey', 'news/processed/invalid',
        'processedVersionId', 'processed-version',
        'byteSize', 100,
        'checksumSha256', repeat('b', 64),
        'width', 100,
        'height', 100
      ))
      from (values
        ('999999999999999999999999999999999999'),
        ('1024'),
        ('1600')
      ) as malformed(malformed_width)
    ),
    null
  )$$,
  '22023',
  'invalid asset derivative',
  'numeric overflow in derivative JSON fails with the controlled validation code'
);
select throws_ok(
  $$select public.admin_sync_article_asset_result(
    '72000000-0000-4000-8000-000000000002',
    '73000000-0000-4000-8000-000000000002',
    'development',
    'news/quarantine/72000000-0000-4000-8000-000000000002/73000000-0000-4000-8000-000000000002/original',
    'source-v1',
    'news/processed/72000000-0000-4000-8000-000000000002/73000000-0000-4000-8000-000000000002/result.json',
    'manifest-v1', 'ready', 'image/png', 2048, repeat('a', 64), 1200, 800,
    (
      select jsonb_agg(jsonb_build_object(
        'variantWidth', 640,
        'contentType', 'image/webp',
        'processedKey', 'news/processed/72000000-0000-4000-8000-000000000002/73000000-0000-4000-8000-000000000002/cover-640x360.webp',
        'processedVersionId', 'processed-640',
        'byteSize', 640,
        'checksumSha256', repeat('b', 64),
        'width', 640,
        'height', 360
      ))
      from generate_series(1, 3)
    ),
    null
  )$$,
  '22023',
  'invalid asset derivative',
  'duplicate derivative variants fail with the controlled validation code'
);
select throws_ok(
  $$select public.admin_sync_article_asset_result(
    '72000000-0000-4000-8000-000000000002',
    '73000000-0000-4000-8000-000000000002',
    'development',
    'news/quarantine/72000000-0000-4000-8000-000000000002/73000000-0000-4000-8000-000000000002/original',
    'source-v1',
    'news/processed/72000000-0000-4000-8000-000000000002/73000000-0000-4000-8000-000000000002/result.json',
    'manifest-v1', 'ready', 'image/png', 2048, repeat('a', 64), 1200, 800,
    (
      select jsonb_set(payload, '{0,variantWidth}', to_jsonb('640'::text))
      from step10_manifest_payloads where fixture_name = 'ready'
    ),
    null
  )$$,
  '22023',
  'invalid asset derivative',
  'a string-typed derivative width fails with the controlled validation code'
);
select throws_ok(
  $$select public.admin_sync_article_asset_result(
    '72000000-0000-4000-8000-000000000002',
    '73000000-0000-4000-8000-000000000002',
    'development',
    'news/quarantine/72000000-0000-4000-8000-000000000002/73000000-0000-4000-8000-000000000002/original',
    'source-v1',
    'news/processed/72000000-0000-4000-8000-000000000002/73000000-0000-4000-8000-000000000002/result.json',
    'manifest-v1', 'ready', 'image/png', 2048, repeat('a', 64), 1200, 800,
    (
      select jsonb_set(payload, '{0,width}', '639'::jsonb)
      from step10_manifest_payloads where fixture_name = 'ready'
    ),
    null
  )$$,
  '22023',
  'invalid asset derivative',
  'each derivative must have its exact policy width and height'
);
select lives_ok(
  $$select public.admin_sync_article_asset_result(
    '72000000-0000-4000-8000-000000000002',
    '73000000-0000-4000-8000-000000000002',
    'development',
    'news/quarantine/72000000-0000-4000-8000-000000000002/73000000-0000-4000-8000-000000000002/original',
    'source-v1',
    'news/processed/72000000-0000-4000-8000-000000000002/73000000-0000-4000-8000-000000000002/result.json',
    'manifest-v1', 'ready', 'image/png', 2048, repeat('a', 64), 1200, 800,
    (select payload from step10_manifest_payloads where fixture_name = 'ready'),
    null
  )$$,
  'an admin can sync one validated immutable success manifest'
);
select ok(
  (
    select state = 'ready'
      and detected_content_type = 'image/png'
      and quarantine_version_id = 'source-v1'
      and result_manifest_version_id = 'manifest-v1'
      and processing_attempts = 1
    from public.article_assets
    where id = '73000000-0000-4000-8000-000000000002'
  ),
  'manifest sync records exact source and result identity'
);
select is(
  (
    select count(*)::integer
    from public.article_asset_derivatives
    where asset_id = '73000000-0000-4000-8000-000000000002'
      and variant_width in (640, 1024, 1600)
      and content_type = 'image/webp'
  ),
  3,
  'manifest sync records all three responsive WebP derivatives'
);
select lives_ok(
  $$select public.admin_sync_article_asset_result(
    '72000000-0000-4000-8000-000000000002',
    '73000000-0000-4000-8000-000000000002',
    'development',
    'news/quarantine/72000000-0000-4000-8000-000000000002/73000000-0000-4000-8000-000000000002/original',
    'source-v1',
    'news/processed/72000000-0000-4000-8000-000000000002/73000000-0000-4000-8000-000000000002/result.json',
    'manifest-v1', 'ready', 'image/png', 2048, repeat('a', 64), 1200, 800,
    (select payload from step10_manifest_payloads where fixture_name = 'ready'),
    null
  )$$,
  'an exact ready-manifest replay is an idempotent success'
);
select ok(
  (
    select processing_attempts = 1
    from public.article_assets
    where id = '73000000-0000-4000-8000-000000000002'
  )
  and (
    select count(*) = 3
    from public.article_asset_derivatives
    where asset_id = '73000000-0000-4000-8000-000000000002'
  ),
  'a ready replay does not increment attempts or duplicate derivatives'
);
select throws_ok(
  $$select public.admin_sync_article_asset_result(
    '72000000-0000-4000-8000-000000000002',
    '73000000-0000-4000-8000-000000000002',
    'development',
    'news/quarantine/72000000-0000-4000-8000-000000000002/73000000-0000-4000-8000-000000000002/original',
    'source-v1',
    'news/processed/72000000-0000-4000-8000-000000000002/73000000-0000-4000-8000-000000000002/result.json',
    'manifest-v2', 'ready', 'image/png', 2048, repeat('a', 64), 1200, 800,
    (select payload from step10_manifest_payloads where fixture_name = 'ready'),
    null
  )$$,
  '22023',
  'asset result already committed',
  'a conflicting ready manifest version cannot overwrite committed state'
);
select throws_ok(
  $$select public.admin_sync_article_asset_result(
    '72000000-0000-4000-8000-000000000002',
    '73000000-0000-4000-8000-000000000002',
    'development',
    'news/quarantine/72000000-0000-4000-8000-000000000002/73000000-0000-4000-8000-000000000002/original',
    'source-v1',
    'news/processed/72000000-0000-4000-8000-000000000002/73000000-0000-4000-8000-000000000002/result.json',
    'manifest-v1', 'rejected', null, null, null, null, null,
    '[]'::jsonb, 'decode_failed'
  )$$,
  '22023',
  'asset result already committed',
  'a conflicting result status cannot replace a committed ready manifest'
);
select throws_ok(
  $$select public.admin_sync_article_asset_result(
    '72000000-0000-4000-8000-000000000006',
    '73000000-0000-4000-8000-000000000006',
    'development',
    'news/quarantine/72000000-0000-4000-8000-000000000006/73000000-0000-4000-8000-000000000006/original',
    'rejected-source-v1',
    'news/processed/72000000-0000-4000-8000-000000000006/73000000-0000-4000-8000-000000000006/result.json',
    'rejected-manifest-v1', 'rejected', null, null, null, null, null,
    '[]'::jsonb, 'decode-failed'
  )$$,
  '22023',
  'invalid asset failure',
  'an obsolete hyphenated processor failure code is rejected'
);
select ok(
  (
    select state = 'awaiting_upload'
      and processing_attempts = 0
      and result_manifest_version_id is null
    from public.article_assets
    where id = '73000000-0000-4000-8000-000000000006'
  ),
  'an invalid failure code leaves the upload candidate uncommitted'
);
select lives_ok(
  $$select public.admin_sync_article_asset_result(
    '72000000-0000-4000-8000-000000000006',
    '73000000-0000-4000-8000-000000000006',
    'development',
    'news/quarantine/72000000-0000-4000-8000-000000000006/73000000-0000-4000-8000-000000000006/original',
    'rejected-source-v1',
    'news/processed/72000000-0000-4000-8000-000000000006/73000000-0000-4000-8000-000000000006/result.json',
    'rejected-manifest-v1', 'rejected', null, null, null, null, null,
    '[]'::jsonb, 'decode_failed'
  )$$,
  'a canonical snake-case processor failure is committed'
);
select lives_ok(
  $$select public.admin_sync_article_asset_result(
    '72000000-0000-4000-8000-000000000006',
    '73000000-0000-4000-8000-000000000006',
    'development',
    'news/quarantine/72000000-0000-4000-8000-000000000006/73000000-0000-4000-8000-000000000006/original',
    'rejected-source-v1',
    'news/processed/72000000-0000-4000-8000-000000000006/73000000-0000-4000-8000-000000000006/result.json',
    'rejected-manifest-v1', 'rejected', null, null, null, null, null,
    '[]'::jsonb, 'decode_failed'
  )$$,
  'an exact rejected-manifest replay is an idempotent success'
);
select ok(
  (
    select state = 'failed'
      and processing_attempts = 1
      and failure_reason = 'decode_failed'
      and result_manifest_version_id = 'rejected-manifest-v1'
    from public.article_assets
    where id = '73000000-0000-4000-8000-000000000006'
  ),
  'a rejected replay does not increment attempts or alter the canonical failure'
);
select throws_ok(
  $$select public.admin_sync_article_asset_result(
    '72000000-0000-4000-8000-000000000006',
    '73000000-0000-4000-8000-000000000006',
    'development',
    'news/quarantine/72000000-0000-4000-8000-000000000006/73000000-0000-4000-8000-000000000006/original',
    'rejected-source-v1',
    'news/processed/72000000-0000-4000-8000-000000000006/73000000-0000-4000-8000-000000000006/result.json',
    'rejected-manifest-v2', 'rejected', null, null, null, null, null,
    '[]'::jsonb, 'decode_failed'
  )$$,
  '22023',
  'asset result already committed',
  'a conflicting rejected manifest version cannot overwrite committed state'
);
select throws_ok(
  $$select public.admin_approve_article_asset(
    '72000000-0000-4000-8000-000000000002',
    '73000000-0000-4000-8000-000000000002',
    '   '
  )$$,
  '22023',
  'meaningful alt text required',
  'approval rejects empty alt text'
);
select lives_ok(
  $$select public.admin_approve_article_asset(
    '72000000-0000-4000-8000-000000000002',
    '73000000-0000-4000-8000-000000000002',
    'A magenta network diagram'
  )$$,
  'an admin can approve a ready cover with meaningful alt text'
);
select throws_ok(
  $$select public.admin_publish_news_article(
    '72000000-0000-4000-8000-000000000002',
    '73000000-0000-4000-8000-000000000002',
    '[]'::jsonb
  )$$,
  '22023',
  'invalid asset promotion',
  'atomic publication rejects an incomplete promotion result'
);
select throws_ok(
  $$select public.admin_publish_news_article(
    '72000000-0000-4000-8000-000000000002',
    '73000000-0000-4000-8000-000000000002',
    jsonb_build_array(
      jsonb_build_object('variantWidth', 'not-a-number'),
      jsonb_build_object('variantWidth', 1024),
      jsonb_build_object('variantWidth', 1600)
    )
  )$$,
  '22023',
  'invalid asset promotion',
  'non-numeric promotion JSON fails with the controlled validation code'
);
select throws_ok(
  $$select public.admin_publish_news_article(
    '72000000-0000-4000-8000-000000000002',
    '73000000-0000-4000-8000-000000000002',
    jsonb_build_array(
      jsonb_build_object('variantWidth', '999999999999999999999999999999999999'),
      jsonb_build_object('variantWidth', 1024),
      jsonb_build_object('variantWidth', 1600)
    )
  )$$,
  '22023',
  'invalid asset promotion',
  'promotion integer overflow fails with the controlled validation code'
);
select throws_ok(
  $$select public.admin_publish_news_article(
    '72000000-0000-4000-8000-000000000002',
    '73000000-0000-4000-8000-000000000002',
    jsonb_build_array(
      jsonb_build_object(
        'variantWidth', 640,
        'publishedKey', 'news/published/72000000-0000-4000-8000-000000000002/73000000-0000-4000-8000-000000000002/cover-640x360.webp',
        'publishedVersionId', 'published-640'
      ),
      jsonb_build_object(
        'variantWidth', 640,
        'publishedKey', 'news/published/72000000-0000-4000-8000-000000000002/73000000-0000-4000-8000-000000000002/cover-640x360.webp',
        'publishedVersionId', 'published-640-again'
      ),
      jsonb_build_object(
        'variantWidth', 1600,
        'publishedKey', 'news/published/72000000-0000-4000-8000-000000000002/73000000-0000-4000-8000-000000000002/cover-1600x900.webp',
        'publishedVersionId', 'published-1600'
      )
    )
  )$$,
  '22023',
  'invalid asset promotion',
  'duplicate promotion variants cannot satisfy publication'
);
select lives_ok(
  $$select public.admin_publish_news_article(
    '72000000-0000-4000-8000-000000000002',
    '73000000-0000-4000-8000-000000000002',
    jsonb_build_array(
      jsonb_build_object(
        'variantWidth', 640,
        'publishedKey', 'news/published/72000000-0000-4000-8000-000000000002/73000000-0000-4000-8000-000000000002/cover-640x360.webp',
        'publishedVersionId', 'published-640'
      ),
      jsonb_build_object(
        'variantWidth', 1024,
        'publishedKey', 'news/published/72000000-0000-4000-8000-000000000002/73000000-0000-4000-8000-000000000002/cover-1024x576.webp',
        'publishedVersionId', 'published-1024'
      ),
      jsonb_build_object(
        'variantWidth', 1600,
        'publishedKey', 'news/published/72000000-0000-4000-8000-000000000002/73000000-0000-4000-8000-000000000002/cover-1600x900.webp',
        'publishedVersionId', 'published-1600'
      )
    )
  )$$,
  'promotion metadata, asset state, and article publication commit together'
);
select ok(
  (
    select article.is_published
      and article.published_asset_id = asset.id
      and article.published_asset_alt_text = asset.alt_text
      and article.image_url is null
      and asset.state = 'published'
    from public.news_articles as article
    join public.article_assets as asset
      on asset.id = article.published_asset_id
    where article.id = '72000000-0000-4000-8000-000000000002'
  ),
  'article and managed cover publication commit as one database transition'
);
select lives_ok(
  $$select public.admin_begin_article_asset_replacement(
    '72000000-0000-4000-8000-000000000003',
    'development', 'image/jpeg', 1024, null, repeat('f', 64)
  )$$,
  'a published cover can receive a private replacement candidate'
);
select ok(
  (
    select state = 'published'
    from public.article_assets
    where id = '73000000-0000-4000-8000-000000000003'
  )
  and (
    select published_asset_id = '73000000-0000-4000-8000-000000000003'
    from public.news_articles
    where id = '72000000-0000-4000-8000-000000000003'
  ),
  'starting a replacement leaves the current public cover attached'
);
select is(
  (
    select count(*)::integer
    from public.article_assets
    where article_id = '72000000-0000-4000-8000-000000000003'
      and state = 'awaiting_presign'
  ),
  1,
  'replacement creates exactly one active private candidate'
);
set local role postgres;
set local role service_role;
select is(
  (
    select count(*)::integer
    from public.claim_article_asset_presign(repeat('f', 64), 'development')
  ),
  1,
  'an admin replacement capability can be claimed while the article is published'
);
set local role postgres;
select ok(
  (
    select state = 'published'
    from public.article_assets
    where id = '73000000-0000-4000-8000-000000000003'
  )
  and (
    select published_asset_id = '73000000-0000-4000-8000-000000000003'
    from public.news_articles
    where id = '72000000-0000-4000-8000-000000000003'
  )
  and (
    select count(*) = 1
    from public.article_assets
    where article_id = '72000000-0000-4000-8000-000000000003'
      and state = 'awaiting_upload'
      and capability_purpose = 'admin_replacement'
  ),
  'claiming the replacement leaves the old published cover attached'
);
set local role service_role;
select is(
  (
    select count(*)::integer
    from public.claim_article_asset_presign(repeat('f', 64), 'development')
  ),
  0,
  'a published-parent admin replacement capability is one-shot'
);
set local role postgres;
set local role authenticated;
set local request.jwt.claims =
  '{"sub":"71000000-0000-4000-8000-000000000001","role":"authenticated","app_metadata":{"admin":true}}';
select lives_ok(
  $$select public.admin_unpublish_news_article(
    '72000000-0000-4000-8000-000000000002'
  )$$,
  'an image article can be unpublished before asset rejection'
);
select lives_ok(
  $$select public.admin_reject_article_asset(
    '72000000-0000-4000-8000-000000000002',
    '73000000-0000-4000-8000-000000000002',
    'The cover does not meet editorial requirements.'
  )$$,
  'a rejected cover leaves its article text intact'
);
select ok(
  exists (
    select 1 from public.news_articles
    where id = '72000000-0000-4000-8000-000000000002'
  )
  and (
    select state = 'rejected'
    from public.article_assets
    where id = '73000000-0000-4000-8000-000000000002'
  ),
  'asset rejection never deletes article text'
);
select throws_ok(
  $$select public.admin_delete_news_article(
    '72000000-0000-4000-8000-000000000002'
  )$$,
  '22023',
  'asset cleanup required',
  'article deletion cannot orphan managed asset objects'
);
select lives_ok(
  $$select public.admin_delete_news_article(
    '72000000-0000-4000-8000-000000000001'
  )$$,
  'an asset-free unpublished article can be deleted'
);
select is(
  (
    select count(*)::integer from public.news_articles
    where id = '72000000-0000-4000-8000-000000000001'
  ),
  0,
  'asset-free deletion removes the intended article only'
);

set local role postgres;
select * from finish();
rollback;
