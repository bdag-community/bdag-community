import type { MetadataRoute } from "next";
import { SITE } from "@/lib/content/site";
import { AI_SEARCH_AGENTS, AI_TRAINING_AGENTS } from "@/lib/seo/ai-crawlers";

/**
 * Surfaces no crawler should walk.
 *  - /admin is an operator surface. It is already gated by the DAL, so this is
 *    not a security control (robots.txt never is) — it keeps a sign-in page
 *    out of search results.
 *  - /api/* is this site's own JSON, fetched by its own pages. A crawler
 *    walking those routes spends the upstream RPC/explorer rate limit that the
 *    caches in lib/chain exist to protect, and returns nothing a reader wants.
 */
const PRIVATE_PATHS = ["/admin", "/api/"];

/**
 * /robots.txt — previously a 404, so every crawler was inventing its own
 * policy for this origin. The sitemap line is the whole reason a crawler reads
 * this file at all.
 *
 * The two AI groups split crawlers by what they actually do; which agent
 * belongs where, and why GPTBot / ClaudeBot / Google-Extended are refusals
 * rather than allowances, is argued in lib/seo/ai-crawlers.ts.
 *
 * Both AI groups repeat PRIVATE_PATHS rather than inheriting them. A narrower
 * user-agent group replaces the "*" group for the agents it names — it does
 * not stack on top of it — so a group that listed only `allow: "/"` would
 * quietly re-open /admin to exactly the agents it was written to welcome.
 *
 * This file states a policy; it does not enforce one. A crawler that ignores
 * robots.txt is unaffected by anything here, and blocking that is a CDN
 * concern.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: PRIVATE_PATHS,
      },
      {
        userAgent: [...AI_SEARCH_AGENTS],
        allow: "/",
        disallow: PRIVATE_PATHS,
      },
      {
        userAgent: [...AI_TRAINING_AGENTS],
        disallow: "/",
      },
    ],
    sitemap: new URL("/sitemap.xml", SITE.url).toString(),
    host: SITE.url,
  };
}
