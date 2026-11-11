import type { MetadataRoute } from "next";
import { NAV_LINKS, SITE } from "@/lib/content/site";
import { getPublishedArticles } from "@/lib/news";
import { COMMUNITY_GUIDES } from "@/lib/content/community-guides";

/**
 * /sitemap.xml — previously a 404.
 *
 * The route list is NAV_LINKS, not a second copy of it. The nav and the
 * sitemap are the same claim ("these are the public pages"), and two hand-kept
 * lists of the same claim drift; adding a page to the nav now adds it here.
 *
 * Individual news articles used to be deliberately absent, to keep sitemap
 * generation independent of the news source. That reasoning no longer holds:
 * `generateStaticParams` in news/[slug] already calls getPublishedArticles()
 * at build time, so the build reads that source either way — and leaving the
 * articles out meant the only pages on this site with a publication date, the
 * ones a news or AI-answer surface most wants to find, were the ones never
 * submitted. The shared article list keeps code-managed articles beside the
 * published database rows; if Supabase is unreachable, those original pages
 * still remain in the sitemap instead of failing the build.
 *
 * `lastModified` appears on articles and NOWHERE else, and that asymmetry is
 * the point. An article has a real publication date. A nav page does not have
 * an edit date at all, and the build time this file used to stamp on all eight
 * was not a substitute for one: every unrelated deployment restamped the whole
 * site as freshly modified, telling a crawler that everything changed whenever
 * anything did. Google reads lastmod as the last *significant* update and
 * discounts the signal from a site whose dates move without its content.
 * Omitting the field is the honest answer where there is no date to give.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const pages = NAV_LINKS.map((link) => ({
    url: new URL(link.href, SITE.url).toString(),
    // /articles gains rows; the other pages change when we change them.
    changeFrequency: link.href === "/articles" ? ("daily" as const) : ("weekly" as const),
    // Home is the entry point; /chain is the page the whole site is evidence
    // for. Everything else sits one step below both.
    priority: link.href === "/" ? 1 : link.href === "/chain" ? 0.9 : 0.8,
  }));

  // The Projects view is a sub-view of /community rather than a nav item, so
  // it rides along here the same way article pages do: a known route that is
  // not in NAV_LINKS but should still be crawled.
  const projectsView = [
    { url: new URL("/testnet", SITE.url).toString(), changeFrequency: "weekly" as const, priority: 0.7 },
    {
      url: new URL("/community/projects", SITE.url).toString(),
      changeFrequency: "weekly" as const,
      priority: 0.8,
    },
  ];

  const articles = (await getPublishedArticles()).map((article) => ({
    url: new URL(`/articles/${article.slug}`, SITE.url).toString(),
    lastModified: new Date(article.publishedAt),
    // A published article is finished writing. It is here to be found once,
    // not re-crawled daily.
    changeFrequency: "monthly" as const,
    priority: 0.6,
  }));

  const guides = ["/guides", ...COMMUNITY_GUIDES.map(({ slug }) => `/guides/${slug}`)].map((path) => ({
    url: new URL(path, SITE.url).toString(),
    changeFrequency: "monthly" as const,
    priority: 0.6,
  }));

  return [...pages, ...projectsView, ...guides, ...articles];
}
