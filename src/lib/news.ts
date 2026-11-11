import "server-only";

import { unstable_cache } from "next/cache";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import { getPublicSupabase } from "@/lib/supabase/public";
import { getArticleAssetDelivery } from "@/lib/news/article-asset-delivery";
import { mergePublishedArticles } from "@/lib/news/merge-published";
import {
  ARTICLE_CATEGORIES,
  type ArticleCategory,
} from "@/lib/content/site";

/**
 * News data access — published Supabase articles plus code-managed articles.
 *
 * Public reads use a cookie-free publishable-key client (RLS: anonymous
 * readers may see PUBLISHED rows only; see supabase/migrations). The seed
 * seeds keep the site functional with zero infrastructure and remain public
 * when database articles are published. A live row with the same slug wins.
 */

export const PUBLISHED_NEWS_CACHE_TAG = "published-news";
const PUBLIC_NEWS_REVALIDATE_SECONDS = 600;

const PUBLIC_NEWS_SUMMARY_FIELDS =
  "id,slug,title,subtitle,description,category,published_at,published_asset_id,published_asset_alt_text";
const PUBLIC_NEWS_DETAIL_FIELDS =
  "id,slug,title,subtitle,description,category,body,body_html,author_name,submitted_by_community,published_at,published_asset_id,published_asset_alt_text";

export type NewsArticle = {
  slug: string;
  title: string;
  subtitle: string;
  /** Card + list summary (also the article lede). */
  description: string;
  /** One of the closed ARTICLE_CATEGORIES set, shown as a label on cards
   *  and on the article page. The DB check constraint and that map must
   *  always agree; an unknown value from a newer schema falls back to
   *  'news' rather than crashing the page. */
  category: ArticleCategory;
  /** Plain-text projection for legacy rows and non-HTML consumers. */
  body: string;
  /** Sanitized rich article markup, or null for a legacy seed/plain row. */
  bodyHtml: string | null;
  imageUrl: string | null;
  imageSrcSet: string | null;
  imageAlt: string;
  authorName: string | null;
  /** Provenance from the moderation flow: true when the article arrived
   *  through the community submission form. Decides the public byline. */
  submittedByCommunity: boolean;
  publishedAt: string; // ISO
};

export type NewsArticleSummary = Omit<
  NewsArticle,
  "body" | "bodyHtml" | "authorName" | "submittedByCommunity"
>;

type NewsSummaryRow = {
  id: string;
  slug: string;
  title: string;
  subtitle: string | null;
  description: string | null;
  category: string | null;
  published_at: string | null;
  published_asset_id: string | null;
  published_asset_alt_text: string | null;
};

type NewsRow = NewsSummaryRow & {
  body: string | null;
  body_html: string | null;
  author_name: string | null;
  submitted_by_community: boolean | null;
};

const rowToSummary = (row: NewsSummaryRow): NewsArticleSummary => {
  const delivery = getArticleAssetDelivery({
    articleId: row.id,
    assetId: row.published_asset_id,
    altText: row.published_asset_alt_text,
  });
  return {
    slug: row.slug,
    title: row.title,
    subtitle: row.subtitle ?? "",
    description: row.description ?? "",
    category:
      row.category && row.category in ARTICLE_CATEGORIES
        ? (row.category as ArticleCategory)
        : "news",
    imageUrl: delivery?.imageUrl ?? null,
    imageSrcSet: delivery?.imageSrcSet ?? null,
    imageAlt: delivery?.imageAlt ?? "",
    publishedAt: row.published_at ?? new Date(0).toISOString(),
  };
};

const rowToArticle = (row: NewsRow): NewsArticle => ({
  ...rowToSummary(row),
  body: row.body ?? "",
  bodyHtml: row.body_html,
  authorName: row.author_name,
  submittedByCommunity: row.submitted_by_community ?? false,
});

const articleToSummary = (article: NewsArticle): NewsArticleSummary => ({
  slug: article.slug,
  title: article.title,
  subtitle: article.subtitle,
  description: article.description,
  category: article.category,
  imageUrl: article.imageUrl,
  imageSrcSet: article.imageSrcSet,
  imageAlt: article.imageAlt,
  publishedAt: article.publishedAt,
});

async function fetchLiveSummaries(): Promise<NewsArticleSummary[] | null> {
  if (!hasSupabaseEnv()) return null;
  try {
    const supabase = getPublicSupabase();
    const query = supabase
      .from("news_articles")
      .select(PUBLIC_NEWS_SUMMARY_FIELDS)
      .eq("is_published", true)
      .order("published_at", { ascending: false });
    const { data, error } = await query;
    if (error || !data) return null;
    return (data as NewsSummaryRow[]).map(rowToSummary);
  } catch {
    // Supabase unreachable: degrade to seed, never to an error page.
    return null;
  }
}

async function fetchLiveArticle(
  slug: string,
): Promise<NewsArticle | null> {
  if (!hasSupabaseEnv()) return null;
  try {
    const supabase = getPublicSupabase();
    const { data, error } = await supabase
      .from("news_articles")
      .select(PUBLIC_NEWS_DETAIL_FIELDS)
      .eq("slug", slug)
      .eq("is_published", true)
      .maybeSingle();
    if (error || !data) return null;
    return rowToArticle(data as NewsRow);
  } catch {
    return null;
  }
}

const getCachedPublishedArticles = unstable_cache(
  async (limit?: number): Promise<NewsArticleSummary[]> => {
    const live = await fetchLiveSummaries();
    const seed = (await import("@/lib/content/news-seed")).NEWS_SEED;
    return mergePublishedArticles(live, seed.map(articleToSummary), limit);
  },
  ["published-news-summaries"],
  {
    tags: [PUBLISHED_NEWS_CACHE_TAG],
    revalidate: PUBLIC_NEWS_REVALIDATE_SECONDS,
  },
);

const getCachedArticleBySlug = unstable_cache(
  async (slug: string): Promise<NewsArticle | null> => {
    const live = await fetchLiveArticle(slug);
    if (live) return live;

    const seed = (await import("@/lib/content/news-seed")).NEWS_SEED;
    return seed.find((article) => article.slug === slug) ?? null;
  },
  ["published-news-article"],
  {
    tags: [PUBLISHED_NEWS_CACHE_TAG],
    revalidate: PUBLIC_NEWS_REVALIDATE_SECONDS,
  },
);

/** Published summaries, newest first. Live rows override matching seed slugs. */
export async function getPublishedArticles(
  limit?: number,
): Promise<NewsArticleSummary[]> {
  return getCachedPublishedArticles(limit);
}

/** One published article by slug, or null. */
export async function getArticleBySlug(
  slug: string,
): Promise<NewsArticle | null> {
  return getCachedArticleBySlug(slug);
}
