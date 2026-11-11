import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";

const read = (rel) => readFileSync(new URL(rel, import.meta.url), "utf8");

const publicClient = read("../src/lib/supabase/public.ts");
const news = read("../src/lib/news.ts");
const homePage = read("../src/app/(public)/page.tsx");
const newsPage = read("../src/app/(public)/articles/page.tsx");
const articlePage = read("../src/app/(public)/articles/[slug]/page.tsx");
const middleware = read("../src/middleware.ts");
const adminDal = read("../src/lib/dal/admin.ts");

test("public news reads use a cookie-free anonymous Supabase client", () => {
  assert.match(publicClient, /import ["']server-only["']/);
  assert.match(publicClient, /createClient/);
  assert.match(publicClient, /NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY/);
  assert.match(publicClient, /autoRefreshToken:\s*false/);
  assert.match(publicClient, /persistSession:\s*false/);
  assert.match(publicClient, /detectSessionInUrl:\s*false/);
  assert.doesNotMatch(
    publicClient,
    /from\s+["']next\/headers["']|cookies\s*\(|SUPABASE_SECRET_KEY|getServerSupabase|getAdminSupabase/,
  );

  assert.match(news, /getPublicSupabase/);
  assert.doesNotMatch(news, /getServerSupabase|cookies\(/);
});

test("public article lists select summaries and apply the Home limit after merging", () => {
  const summaryFields = news.match(
    /const PUBLIC_NEWS_SUMMARY_FIELDS\s*=\s*["']([^"']+)["']/,
  );
  assert.ok(summaryFields, "the public summary projection must be explicit");
  assert.equal(
    summaryFields[1],
    "id,slug,title,subtitle,description,category,published_at,published_asset_id,published_asset_alt_text",
  );

  const summaryQuery = news.slice(
    news.indexOf("async function fetchLiveSummaries"),
    news.indexOf("async function fetchLiveArticle"),
  );
  assert.match(summaryQuery, /\.select\(PUBLIC_NEWS_SUMMARY_FIELDS\)/);
  assert.match(summaryQuery, /\.eq\(["']is_published["'],\s*true\)/);
  assert.match(summaryQuery, /\.order\(["']published_at["']/);
  assert.doesNotMatch(summaryQuery, /\.limit\(/);
  assert.doesNotMatch(summaryQuery, /\.slice\(/);

  assert.match(news, /fetchLiveSummaries\(\)/);
  assert.match(news, /mergePublishedArticles\(live, seed\.map\(articleToSummary\), limit\)/);
  assert.match(read("../src/components/home/NewsPreview.tsx"), /getPublishedArticles\(3\)/);
});

test("public article detail fetches one published slug without loading the list", () => {
  const detailFields = news.match(
    /const PUBLIC_NEWS_DETAIL_FIELDS\s*=\s*["']([^"']+)["']/,
  );
  assert.ok(detailFields, "the public detail projection must be explicit");
  assert.equal(
    detailFields[1],
    "id,slug,title,subtitle,description,category,body,body_html,author_name,submitted_by_community,published_at,published_asset_id,published_asset_alt_text",
  );

  const detailQuery = news.slice(
    news.indexOf("async function fetchLiveArticle"),
    news.indexOf("const getCachedPublishedArticles"),
  );
  assert.match(detailQuery, /\.select\(PUBLIC_NEWS_DETAIL_FIELDS\)/);
  assert.match(detailQuery, /\.eq\(["']slug["'],\s*slug\)/);
  assert.match(detailQuery, /\.eq\(["']is_published["'],\s*true\)/);
  assert.match(detailQuery, /\.maybeSingle\(\)/);
  assert.doesNotMatch(detailQuery, /getPublishedArticles|\.find\(/);
});

test("seed article URLs remain available alongside published database rows", () => {
  const detailQuery = news.slice(
    news.indexOf("async function fetchLiveArticle"),
    news.indexOf("const getCachedPublishedArticles"),
  );
  assert.doesNotMatch(detailQuery, /databaseHasPublishedRows/);
  assert.doesNotMatch(detailQuery, /\.select\(["']slug["']\)/);

  const cachedDetail = news.slice(
    news.indexOf("const getCachedArticleBySlug"),
    news.indexOf("export async function getPublishedArticles"),
  );
  assert.match(cachedDetail, /if \(live\) return live/);
  assert.match(cachedDetail, /seed\.find\(\(article\) => article\.slug === slug\)/);
  assert.doesNotMatch(cachedDetail, /databaseHasPublishedRows/);
});

test("public news routes use literal ten-minute ISR and prebuild article slugs", () => {
  for (const source of [homePage, newsPage, articlePage]) {
    assert.match(source, /export const revalidate = 600;/);
    assert.doesNotMatch(source, /force-dynamic/);
  }
  assert.match(articlePage, /export async function generateStaticParams\(\)/);
  assert.match(articlePage, /getPublishedArticles\(\)/);
  assert.match(news, /const PUBLIC_NEWS_REVALIDATE_SECONDS = 600;/);
  assert.match(news, /tags:\s*\[PUBLISHED_NEWS_CACHE_TAG\]/);
  assert.match(news, /revalidate:\s*PUBLIC_NEWS_REVALIDATE_SECONDS/);
});

test("authenticated Supabase clients remain scoped to admin requests", () => {
  assert.match(middleware, /matcher:\s*\[?\s*["']\/admin\/:path\*["']/);
  assert.doesNotMatch(middleware, /negative lookahead|_next\/static/);
  assert.match(adminDal, /getServerSupabase/);
  assert.doesNotMatch(adminDal, /getPublicSupabase/);
});

test("admin mutations invalidate every cached public article slug", () => {
  const actions = read("../src/app/(admin)/admin/news/actions.ts");
  assert.match(actions, /updateTag\(PUBLISHED_NEWS_CACHE_TAG\)/);
  assert.match(actions, /revalidatePath\(["']\/articles\/\[slug\]["'],\s*["']page["']\)/);

  assert.doesNotMatch(actions, /\.(?:insert|update|delete)\(/);

  for (const [name, rpc] of [
    ["createArticleAction", "admin_create_news_article"],
    ["updateArticleAction", "admin_save_news_article"],
    ["publishArticleAction", "admin_publish_news_article"],
    ["unpublishArticleAction", "admin_unpublish_news_article"],
    ["deleteArticleAction", "admin_delete_news_article"],
  ]) {
    const start = actions.indexOf(`export async function ${name}`);
    assert.ok(start >= 0, `${name} must exist`);
    const next = actions.indexOf("export async function", start + 1);
    const action = actions.slice(start, next === -1 ? undefined : next);
    const writeAt = action.indexOf(`.rpc("${rpc}"`);
    const revalidateAt = action.indexOf("revalidateNews(");
    assert.ok(writeAt >= 0, `${name} must call ${rpc}`);
    assert.ok(revalidateAt >= 0, `${name} must invalidate public news`);
    assert.ok(writeAt < revalidateAt, `${name} must write before invalidation`);
  }
});
