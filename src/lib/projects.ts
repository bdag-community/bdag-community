import "server-only";

import { unstable_cache } from "next/cache";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import { getPublicSupabase } from "@/lib/supabase/public";
import { getArticleAssetDelivery } from "@/lib/news/article-asset-delivery";
import {
  PROJECT_CATEGORIES,
  type ProjectCategory,
} from "@/lib/content/site";

/**
 * Community projects data access, the same shape as news.ts: Supabase when
 * wired, seed projects otherwise. Public reads use the cookie-free
 * publishable-key client (RLS: anonymous readers see PUBLISHED rows only),
 * and once the table has any published row, live content replaces the seed
 * entirely.
 *
 * Project card images ride the article asset delivery helper: its first
 * parameter is named articleId but it is simply the owning content id in the
 * shared news/published S3 key contract, and project covers are published
 * under the same prefix (see 0011_community_projects.sql).
 */

export const PUBLISHED_PROJECTS_CACHE_TAG = "published-projects";
const PUBLIC_PROJECTS_REVALIDATE_SECONDS = 600;

const PUBLIC_PROJECT_FIELDS =
  "id,name,description,url,category,author_name,published_at,published_asset_id,published_asset_alt_text";

export type CommunityProject = {
  /** Stable identity for list rendering: the DB row id, or a seed slug. */
  id: string;
  name: string;
  description: string;
  /** The external project address the showcase card links to. */
  url: string;
  category: ProjectCategory;
  authorName: string | null;
  imageUrl: string | null;
  imageSrcSet: string | null;
  imageAlt: string;
  publishedAt: string; // ISO
};

type ProjectRow = {
  id: string;
  name: string;
  description: string;
  url: string;
  category: string | null;
  author_name: string | null;
  published_at: string | null;
  published_asset_id: string | null;
  published_asset_alt_text: string | null;
};

const rowToProject = (row: ProjectRow): CommunityProject => {
  const delivery = getArticleAssetDelivery({
    articleId: row.id,
    assetId: row.published_asset_id,
    altText: row.published_asset_alt_text,
  });
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    url: row.url,
    category:
      row.category && row.category in PROJECT_CATEGORIES
        ? (row.category as ProjectCategory)
        : "utility",
    authorName: row.author_name,
    imageUrl: delivery?.imageUrl ?? null,
    imageSrcSet: delivery?.imageSrcSet ?? null,
    imageAlt: delivery?.imageAlt ?? "",
    publishedAt: row.published_at ?? new Date(0).toISOString(),
  };
};

async function fetchLiveProjects(): Promise<CommunityProject[] | null> {
  if (!hasSupabaseEnv()) return null;
  try {
    const supabase = getPublicSupabase();
    const { data, error } = await supabase
      .from("community_projects")
      .select(PUBLIC_PROJECT_FIELDS)
      .eq("is_published", true)
      .order("published_at", { ascending: false });
    if (error || !data) return null;
    return (data as ProjectRow[]).map(rowToProject);
  } catch {
    // Supabase unreachable: degrade to seed, never to an error page.
    return null;
  }
}

const getCachedPublishedProjects = unstable_cache(
  async (): Promise<CommunityProject[]> => {
    const live = await fetchLiveProjects();
    const seed = (await import("@/lib/content/projects-seed")).PROJECTS_SEED;
    const projects = live && live.length > 0 ? live : seed;
    return [...projects].sort((a, b) =>
      b.publishedAt.localeCompare(a.publishedAt),
    );
  },
  ["published-projects"],
  {
    tags: [PUBLISHED_PROJECTS_CACHE_TAG],
    revalidate: PUBLIC_PROJECTS_REVALIDATE_SECONDS,
  },
);

/** Published projects, newest first. Live table wins; seed is the fallback. */
export async function getPublishedProjects(): Promise<CommunityProject[]> {
  return getCachedPublishedProjects();
}
