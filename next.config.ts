import type { NextConfig } from "next";

/**
 * Content-Security-Policy — strict baseline for a content-first site.
 *
 * bdag-community deliberately ships NO wallet stack in v1, so the policy is
 * much tighter than bdag-miner-sales. All chain stats (RPC + Blockscout) are
 * fetched SERVER-SIDE by /api/stats and cached — the browser only ever talks
 * to this origin and Supabase. Adding any new external origin (analytics,
 * image CDN, fonts) requires an explicit entry in the right directive here.
 *
 * Per-directive rationale:
 *  - default-src 'self'        : deny-by-default; everything must opt in below.
 *  - connect-src               : Supabase REST/Auth (news + contact + admin).
 *                                No RPC/explorer origins on purpose — stats go
 *                                through our cached same-origin /api/stats.
 *  - img-src 'self' data:     : article artwork is site-owned. Managed
 *                                community assets stay private until the
 *                                controlled delivery origin is added.
 *  - script-src 'self' 'unsafe-inline' : KNOWN RELAXATION — Next's inline
 *                                runtime needs 'unsafe-inline'. 'unsafe-eval'
 *                                is added in DEVELOPMENT ONLY (Turbopack /
 *                                Fast Refresh); production stays strict.
 *  - style-src 'self' 'unsafe-inline'  : Tailwind/Next inject inline styles.
 *  - font-src 'self' data:     : next/font self-hosted + data: fallbacks.
 *  - frame-ancestors 'none'    : clickjacking defense (mirrors X-Frame-Options).
 */
const isDev = process.env.NODE_ENV !== "production";

function configuredAssetDeliveryOrigin(): string {
  const origin = process.env.ASSET_DELIVERY_ORIGIN ?? "";
  const environment = process.env.ASSET_STORAGE_ENVIRONMENT ?? "";
  if (!origin) return "";
  let parsed: URL;
  try {
    parsed = new URL(origin);
  } catch {
    throw new Error("ASSET_DELIVERY_ORIGIN must be an absolute HTTPS origin.");
  }
  const validDevelopment =
    environment === "development" &&
    /^https:\/\/[a-z0-9]{12,24}\.cloudfront\.net$/.test(origin);
  const validProduction =
    environment === "production" &&
    origin === "https://assets.bdag.community";
  if (
    parsed.protocol !== "https:" ||
    parsed.origin !== origin ||
    parsed.pathname !== "/" ||
    parsed.search ||
    parsed.hash ||
    (!validDevelopment && !validProduction)
  ) {
    throw new Error(
      "ASSET_DELIVERY_ORIGIN does not match the configured asset environment.",
    );
  }
  return origin;
}

const assetDeliveryOrigin = configuredAssetDeliveryOrigin();
const assetDeliveryHostname = assetDeliveryOrigin
  ? new URL(assetDeliveryOrigin).hostname
  : "";

const cspDirectives = [
  "default-src 'self'",
  // base-uri/form-action do NOT fall back to default-src; set them explicitly.
  // The app only posts same-origin (Next Server Actions) and never repoints
  // <base>, so 'self' is safe and closes an injected-<base>/form-hijack gap.
  "base-uri 'self'",
  "form-action 'self'",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://s3.eu-central-1.amazonaws.com",
  `img-src 'self' data:${assetDeliveryOrigin ? ` ${assetDeliveryOrigin}` : ""}`,
  `script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self' data:",
  "frame-src https://challenges.cloudflare.com",
  "frame-ancestors 'none'",
].join("; ");

const securityHeaders = [
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Content-Security-Policy", value: cspDirectives },
];

/**
 * Cache policy for everything in public/.
 *
 * These files are served with `Cache-Control: public, max-age=0` by default,
 * so /logo.svg — preloaded on every page and rendered twice in every article
 * card — is revalidated on every navigation, and the three seeded news images
 * (347 KB between them) are re-fetched by anyone who comes back.
 *
 * NOT `immutable`, and not a year. These filenames are hand-written and
 * unhashed: /logo.svg keeps its name when the logo changes, so an immutable
 * response would pin the old mark in a reader's browser until they cleared it.
 * A day fresh plus a week of stale-while-revalidate gets the repeat-visit win
 * and still lets a replaced asset land within a day.
 *
 * Files under /_next/static are hashed and Next already caches them
 * immutably — this entry is only about the hand-placed public/ assets.
 */
const publicAssetCacheHeaders = [
  {
    key: "Cache-Control",
    value: "public, max-age=86400, stale-while-revalidate=604800",
  },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  experimental: {
    serverActions: {
      bodySizeLimit: "1mb",
    },
  },
  // Self-contained server bundle for Docker (.next/standalone + server.js).
  output: "standalone",
  images: {
    remotePatterns: assetDeliveryHostname
      ? [
          {
            protocol: "https",
            hostname: assetDeliveryHostname,
            port: "",
            pathname: "/news/published/**",
          },
        ]
      : [],
  },
  async redirects() {
    return [
      // The public section renamed from News to Articles (2026-08-18). The
      // old URLs were live and indexed for about a week, so they 301 to the
      // new home forever rather than 404. DB tables, S3 prefixes, and the
      // /admin/news and /api/news paths keep the news name: those are
      // stable machine contracts, not reader-facing URLs.
      { source: "/news", destination: "/articles", permanent: true },
      {
        source: "/news/:path*",
        destination: "/articles/:path*",
        permanent: true,
      },
    ];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
      {
        // Extension-matched rather than path-matched: public/ is flat and its
        // contents are addressed from the site root, so there is no directory
        // prefix to key on.
        source: "/:all*(svg|png|jpg|jpeg|webp|avif|gif|ico|woff|woff2)",
        headers: publicAssetCacheHeaders,
      },
    ];
  },
};

export default nextConfig;
