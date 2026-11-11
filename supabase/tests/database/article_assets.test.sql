begin;

set local role postgres;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(37);

select ok(
  (
    select relrowsecurity
    from pg_class
    where oid = 'public.article_assets'::regclass
  ),
  'article asset rows have RLS enabled'
);
select is(
  (
    select count(*)::integer
    from pg_policy
    where polrelid = 'public.article_assets'::regclass
  ),
  1,
  'article assets expose exactly one admin-select policy'
);
select ok(
  not has_table_privilege('anon', 'public.article_assets', 'SELECT')
  and not has_table_privilege('service_role', 'public.article_assets', 'SELECT')
  and not has_table_privilege('service_role', 'public.article_assets', 'INSERT')
  and not has_table_privilege('service_role', 'public.article_assets', 'UPDATE')
  and not has_table_privilege('service_role', 'public.article_assets', 'DELETE'),
  'anonymous and secret-key roles have no direct asset table access'
);
select ok(
  has_table_privilege('authenticated', 'public.article_assets', 'SELECT')
  and not has_table_privilege('authenticated', 'public.article_assets', 'INSERT')
  and not has_table_privilege('authenticated', 'public.article_assets', 'UPDATE')
  and not has_table_privilege('authenticated', 'public.article_assets', 'DELETE'),
  'authenticated users receive SELECT only before RLS is applied'
);
select ok(
  has_function_privilege(
    'service_role',
    'public.create_community_article_draft(text,text,text,text,text,text,text,text,bigint,text,text)',
    'EXECUTE'
  )
  and has_function_privilege(
    'service_role',
    'public.claim_article_asset_presign(text,text)',
    'EXECUTE'
  ),
  'the secret-key role can execute only the narrow asset workflow RPCs'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.create_community_article_draft(text,text,text,text,text,text,text,text,bigint,text,text)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated',
    'public.create_community_article_draft(text,text,text,text,text,text,text,text,bigint,text,text)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'anon',
    'public.claim_article_asset_presign(text,text)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated',
    'public.claim_article_asset_presign(text,text)',
    'EXECUTE'
  ),
  'public Data API roles cannot create drafts or claim upload capabilities'
);
select is(
  (
    select count(*)::integer
    from pg_proc
    where oid in (
      'public.create_community_article_draft(text,text,text,text,text,text,text,text,bigint,text,text)'::regprocedure,
      'public.claim_article_asset_presign(text,text)'::regprocedure
    )
      and prosecdef
      and pg_get_userbyid(proowner) = 'postgres'
  ),
  2,
  'both workflow RPCs are postgres-owned security definers'
);

set local role service_role;
select lives_ok(
  $$select * from public.create_community_article_draft(
    'Text only Step 9 draft',
    null,
    'A sufficiently detailed description for the text-only draft.',
    repeat('Text only body. ', 10),
    '<p>' || repeat('Text only body. ', 10) || '</p>',
    null,
    null,
    null,
    null,
    null,
    null
  )$$,
  'the narrow RPC creates a text-only community draft'
);
set local role postgres;
select is(
  (
    select count(*)::integer
    from public.news_articles
    where title = 'Text only Step 9 draft'
      and submitted_by_community
      and not is_published
      and published_at is null
      and image_url is null
      and category = 'community'
  ),
  1,
  'the text-only RPC forces the private community-draft fields'
);
select is(
  (
    select count(*)::integer
    from public.article_assets as asset
    join public.news_articles as article on article.id = asset.article_id
    where article.title = 'Text only Step 9 draft'
  ),
  0,
  'a text-only draft creates no asset metadata'
);

set local role service_role;
select lives_ok(
  $$select * from public.create_community_article_draft(
    'Asset Step 9 draft',
    'Private cover workflow',
    'A sufficiently detailed description for the asset-backed draft.',
    repeat('Asset-backed body. ', 10),
    '<p>' || repeat('Asset-backed body. ', 10) || '</p>',
    'Local contributor',
    'development',
    'image/png',
    1234,
    '  A private test cover  ',
    repeat('a', 64)
  )$$,
  'the narrow RPC atomically creates a draft and its cover metadata'
);
set local role postgres;
select is(
  (
    select count(*)::integer
    from public.article_assets as asset
    join public.news_articles as article on article.id = asset.article_id
    where article.title = 'Asset Step 9 draft'
      and article.submitted_by_community
      and not article.is_published
      and article.published_at is null
      and article.image_url is null
      and asset.storage_environment = 'development'
      and asset.asset_kind = 'cover'
      and asset.state = 'awaiting_presign'
      and asset.declared_content_type = 'image/png'
      and asset.declared_byte_size = 1234
      and asset.alt_text = 'A private test cover'
      and asset.capability_digest = repeat('a', 64)
      and asset.presigned_at is null
  ),
  1,
  'asset metadata is environment-bound, private, trimmed, and unclaimed'
);
select ok(
  (
    select asset.object_key =
      'news/quarantine/' || article.id::text || '/' || asset.id::text || '/original'
    from public.article_assets as asset
    join public.news_articles as article on article.id = asset.article_id
    where article.title = 'Asset Step 9 draft'
  ),
  'the database generates the exact UUID-only quarantine key'
);
select throws_ok(
  $$update public.article_assets
    set object_key = object_key || '/changed'
    where capability_digest = repeat('a', 64)$$,
  '23514',
  null,
  'the generated quarantine key cannot be changed'
);
select throws_ok(
  $$update public.article_assets
    set state = 'awaiting_upload'
    where capability_digest = repeat('a', 64)$$,
  '23514',
  null,
  'workflow state cannot advance without consuming the capability'
);
select ok(
  (
    select asset.capability_expires_at > asset.created_at
      and asset.capability_expires_at <= asset.created_at + interval '5 minutes'
    from public.article_assets as asset
    join public.news_articles as article on article.id = asset.article_id
    where article.title = 'Asset Step 9 draft'
  ),
  'the database owns the five-minute capability deadline'
);

set local role service_role;
select throws_ok(
  $$select * from public.create_community_article_draft(
    'Partial asset Step 9 draft', null,
    'A sufficiently detailed description for an invalid partial asset.',
    repeat('Partial asset body. ', 10),
    '<p>' || repeat('Partial asset body. ', 10) || '</p>',
    null, null, null, null, null, repeat('b', 64)
  )$$,
  '22023',
  'invalid article asset',
  'a partial asset bundle fails with the intentional validation code'
);
set local role postgres;
select is(
  (
    select count(*)::integer
    from public.news_articles
    where title = 'Partial asset Step 9 draft'
  ),
  0,
  'a rejected partial bundle leaves no article row'
);
select is(
  (
    select count(*)::integer
    from public.article_assets
    where capability_digest = repeat('b', 64)
  ),
  0,
  'a rejected partial bundle leaves no asset row'
);

set local role service_role;
select throws_ok(
  $$select * from public.create_community_article_draft(
    'Malformed asset Step 9 draft', null,
    'A sufficiently detailed description for an invalid digest.',
    repeat('Malformed asset body. ', 10),
    '<p>' || repeat('Malformed asset body. ', 10) || '</p>',
    null, 'development', 'image/png', 1234, null, 'not-a-digest'
  )$$,
  '22023',
  'invalid article asset',
  'a malformed capability digest fails closed'
);
select throws_ok(
  $$select * from public.claim_article_asset_presign(repeat('a', 64), null)$$,
  '22023',
  'invalid storage environment',
  'a null storage environment fails with the intentional validation code'
);
select is(
  (
    select count(*)::integer
    from public.claim_article_asset_presign(repeat('a', 64), 'production')
  ),
  0,
  'a production runtime cannot redeem a development capability'
);
select is(
  (
    select count(*)::integer
    from public.claim_article_asset_presign(repeat('c', 64), 'development')
  ),
  0,
  'an altered capability digest returns no claim material'
);
select is(
  (
    select count(*)::integer
    from public.claim_article_asset_presign(repeat('a', 64), 'development')
  ),
  1,
  'the first valid capability claim succeeds'
);
set local role postgres;
select ok(
  (
    select asset.state = 'awaiting_upload'
      and asset.presigned_at is not null
      and asset.capability_digest is null
    from public.article_assets as asset
    join public.news_articles as article on article.id = asset.article_id
    where article.title = 'Asset Step 9 draft'
  ),
  'a successful claim atomically consumes the digest and advances state'
);
set local role service_role;
select is(
  (
    select count(*)::integer
    from public.claim_article_asset_presign(repeat('a', 64), 'development')
  ),
  0,
  'the same capability cannot issue a second presign'
);
set local role postgres;

set local role service_role;
select lives_ok(
  $$select * from public.create_community_article_draft(
    'Expired asset Step 9 draft', null,
    'A sufficiently detailed description for an expired capability.',
    repeat('Expired asset body. ', 10),
    '<p>' || repeat('Expired asset body. ', 10) || '</p>',
    null, 'development', 'image/jpeg', 4321, null, repeat('d', 64)
  )$$,
  'an expiry test fixture starts as a valid private asset draft'
);
set local role postgres;
update public.article_assets as asset
set
  created_at = statement_timestamp() - interval '10 minutes',
  capability_expires_at = statement_timestamp() - interval '5 minutes'
from public.news_articles as article
where article.id = asset.article_id
  and article.title = 'Expired asset Step 9 draft';
set local role service_role;
select is(
  (
    select count(*)::integer
    from public.claim_article_asset_presign(repeat('d', 64), 'development')
  ),
  0,
  'an expired capability returns no claim material'
);
set local role postgres;

set local role service_role;
select lives_ok(
  $$select * from public.create_community_article_draft(
    'Published asset Step 9 draft', null,
    'A sufficiently detailed description for a published-parent check.',
    repeat('Published parent body. ', 10),
    '<p>' || repeat('Published parent body. ', 10) || '</p>',
    null, 'development', 'image/webp', 2222, null, repeat('e', 64)
  )$$,
  'a published-parent test fixture starts private'
);
set local role postgres;
update public.news_articles
set is_published = true, published_at = statement_timestamp()
where title = 'Published asset Step 9 draft';
set local role service_role;
select is(
  (
    select count(*)::integer
    from public.claim_article_asset_presign(repeat('e', 64), 'development')
  ),
  0,
  'a capability cannot be claimed after its parent is published'
);
select throws_ok(
  $$insert into public.news_articles (slug, title) values ('service-direct-news', 'Denied')$$,
  '42501',
  'permission denied for table news_articles',
  'the secret-key role cannot bypass the draft RPC with a direct news insert'
);
select throws_ok(
  $$insert into public.article_assets (
    article_id, storage_environment, object_key, declared_content_type,
    declared_byte_size, capability_digest, capability_expires_at
  ) values (
    gen_random_uuid(), 'development', 'news/quarantine/denied', 'image/png',
    1, repeat('f', 64), statement_timestamp() + interval '5 minutes'
  )$$,
  '42501',
  'permission denied for table article_assets',
  'the secret-key role cannot insert asset metadata directly'
);
set local role postgres;

insert into auth.users (id, email, raw_user_meta_data)
values
  ('60000000-0000-4000-8000-000000000001', 'asset-admin@example.invalid', '{}'),
  ('60000000-0000-4000-8000-000000000002', 'asset-member@example.invalid', '{}');
update public.profiles
set is_admin = true
where user_id = '60000000-0000-4000-8000-000000000001';

set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
select throws_ok(
  $$select count(*) from public.article_assets$$,
  '42501',
  'permission denied for table article_assets',
  'anonymous readers cannot inspect private asset metadata'
);
set local role postgres;
set local role authenticated;
set local request.jwt.claims =
  '{"sub":"60000000-0000-4000-8000-000000000002","role":"authenticated","app_metadata":{"admin":false}}';
select is(
  (select count(*)::integer from public.article_assets),
  0,
  'a non-admin member sees no private asset metadata'
);
set local role postgres;
set local role authenticated;
set local request.jwt.claims =
  '{"sub":"60000000-0000-4000-8000-000000000001","role":"authenticated","app_metadata":{"admin":true}}';
select ok(
  (select count(*)::integer from public.article_assets) >= 3,
  'an authenticated admin can inspect private asset metadata'
);
set local role postgres;

create temporary table step9_deleted_asset on commit drop as
select asset.id
from public.article_assets as asset
join public.news_articles as article on article.id = asset.article_id
where article.title = 'Expired asset Step 9 draft';
select lives_ok(
  $$delete from public.news_articles where title = 'Expired asset Step 9 draft'$$,
  'deleting a parent draft succeeds'
);
select is(
  (
    select count(*)::integer
    from public.article_assets
    where id in (select id from step9_deleted_asset)
  ),
  0,
  'deleting a parent draft cascades its asset metadata'
);

select * from finish();
rollback;
