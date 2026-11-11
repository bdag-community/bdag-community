begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(8);

insert into public.news_articles (
  id, slug, title, description, body, body_html, is_published, published_at
) values
  (
    '83000000-0000-4000-8000-000000000001',
    'delete-managed-draft',
    'Delete managed draft',
    'A private article with managed asset metadata.',
    'A private article body.',
    '<p>A private article body.</p>',
    false,
    null
  ),
  (
    '83000000-0000-4000-8000-000000000002',
    'delete-published-article',
    'Delete published article',
    'A published article cannot be deleted directly.',
    'A published article body.',
    '<p>A published article body.</p>',
    true,
    statement_timestamp()
  );

insert into public.article_assets (
  id, article_id, storage_environment, asset_kind, object_key, state,
  declared_content_type, declared_byte_size, capability_digest,
  capability_expires_at, capability_purpose
) values (
  '84000000-0000-4000-8000-000000000001',
  '83000000-0000-4000-8000-000000000001',
  'development',
  'cover',
  'news/quarantine/83000000-0000-4000-8000-000000000001/84000000-0000-4000-8000-000000000001/original',
  'awaiting_presign',
  'image/png',
  100,
  repeat('b', 64),
  statement_timestamp() + interval '4 minutes',
  'admin_replacement'
);

select ok(
  has_function_privilege(
    'service_role',
    'public.delete_news_article_after_asset_cleanup(uuid)',
    'EXECUTE'
  ),
  'the service role can finalize a cleaned article deletion'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.delete_news_article_after_asset_cleanup(uuid)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated',
    'public.delete_news_article_after_asset_cleanup(uuid)',
    'EXECUTE'
  ),
  'public roles cannot invoke the cleanup finalizer'
);
select function_owner_is(
  'public',
  'delete_news_article_after_asset_cleanup',
  array['uuid'::name],
  'postgres',
  'the cleanup finalizer is owned by postgres'
);
select is(
  (
    select prosecdef from pg_proc
    where oid = 'public.delete_news_article_after_asset_cleanup(uuid)'::regprocedure
  ),
  true,
  'the cleanup finalizer is a security definer'
);

set local role service_role;
select throws_ok(
  $$select public.delete_news_article_after_asset_cleanup(
    '83000000-0000-4000-8000-000000000002'
  )$$,
  '22023',
  'unpublish article first',
  'a published article cannot be deleted by the cleanup finalizer'
);
select is(
  public.delete_news_article_after_asset_cleanup(
    '83000000-0000-4000-8000-000000000001'
  ),
  true,
  'a cleaned unpublished managed article can be deleted'
);
reset role;

select is(
  (
    select count(*)::integer from public.news_articles
    where id = '83000000-0000-4000-8000-000000000001'
  ),
  0,
  'the finalizer removes the article'
);
select is(
  (
    select count(*)::integer from public.article_assets
    where article_id = '83000000-0000-4000-8000-000000000001'
  ),
  0,
  'article deletion cascades its managed asset metadata'
);

select * from finish();
rollback;
