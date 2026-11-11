import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";

// Route-surface guard: the app's contract is its file map. A renamed or
// deleted route file breaks navigation (or the ops healthcheck) silently at
// build time — assert the map here, plus the two API behaviours ops depends
// on and the middleware's deliberately-limited role.

const read = (rel) => readFileSync(new URL(rel, import.meta.url), "utf8");
const exists = (rel) => existsSync(new URL(rel, import.meta.url).pathname);

test("all expected route files exist", () => {
  const routes = [
    "../src/app/(public)/page.tsx",
    "../src/app/(public)/chain/page.tsx",
    "../src/app/(public)/community/page.tsx",
    "../src/app/(public)/mining/page.tsx",
    "../src/app/(public)/staking/page.tsx",
    "../src/app/(public)/articles/page.tsx",
    "../src/app/(public)/articles/submit/page.tsx",
    "../src/app/(public)/articles/[slug]/page.tsx",
    "../src/app/(public)/faq/page.tsx",
    "../src/app/(public)/contact/page.tsx",
    "../src/app/api/stats/route.ts",
    // The node probe and the 31-day chart feed are route surfaces too: both
    // are polled by the client and neither was in this map before.
    "../src/app/api/nodes/route.ts",
    "../src/app/api/chain-history/route.ts",
    "../src/app/api/health/route.ts",
    "../src/app/api/news/assets/presign/route.ts",
    "../src/app/(admin)/layout.tsx",
    "../src/app/(admin)/admin/page.tsx",
    "../src/app/(admin)/admin/sign-in/page.tsx",
    "../src/app/(admin)/admin/news/new/page.tsx",
    "../src/app/(admin)/admin/news/[id]/page.tsx",
  ];
  const missing = routes.filter((r) => !exists(r));
  assert.deepEqual(missing, [], `missing route files: ${missing.join(", ")}`);
});

test("the SEO surfaces exist", () => {
  // All three returned 404 until this pass, so a shared link rendered as a
  // bare URL and no crawler was told anything about the site at all.
  const surfaces = [
    "../src/app/robots.ts",
    "../src/app/sitemap.ts",
    "../src/app/opengraph-image.tsx",
  ];
  const missing = surfaces.filter((r) => !exists(r));
  assert.deepEqual(missing, [], `missing SEO route files: ${missing.join(", ")}`);
});

test("robots.txt keeps crawlers out of /admin and /api", () => {
  const robots = read("../src/app/robots.ts");
  assert.match(robots, /disallow/i);
  assert.match(robots, /["']\/admin["']/, "the operator surface must be disallowed");
  // Crawling our own JSON spends the upstream RPC/explorer rate limit that the
  // caches in lib/chain exist to protect.
  assert.match(robots, /["']\/api\/["']/, "the API routes must be disallowed");
  assert.match(robots, /sitemap/i, "robots.txt must point at the sitemap");
});

test("the sitemap is derived from the nav, not a second list of routes", () => {
  const sitemap = read("../src/app/sitemap.ts");
  assert.match(
    sitemap,
    /NAV_LINKS/,
    "the nav and the sitemap are the same claim — two hand-kept copies drift.",
  );
});

test("the canonical is per-route, not per-site", () => {
  const layout = read("../src/app/layout.tsx");
  // "./" resolves against the pathname being rendered. An absolute "/" here
  // would point all seven routes at the home page, which is worse than having
  // no canonical at all — and it is a one-character regression.
  assert.match(layout, /canonical:\s*["']\.\/["']/);
});

test("both dead ends land on a page we designed", () => {
  // /news/<retired-slug> is the realistic 404 — news/[slug] calls notFound() —
  // and it used to render Next's stock page with no chrome and no way back.
  for (const rel of [
    "../src/app/(public)/not-found.tsx",
    "../src/app/global-error.tsx",
  ]) {
    assert.ok(exists(rel), `${rel} must exist`);
  }
  const globalError = read("../src/app/global-error.tsx");
  // global-error REPLACES the root layout: if it does not draw the document
  // itself, there is no document.
  assert.match(globalError, /<html/);
  assert.match(globalError, /<body/);
});

test("public and admin segments have designed loading and error states", () => {
  const surfaces = [
    "../src/app/(public)/loading.tsx",
    "../src/app/(public)/error.tsx",
    "../src/app/(admin)/loading.tsx",
    "../src/app/(admin)/error.tsx",
    "../src/components/site/RouteError.tsx",
    "../src/components/site/RouteLoading.tsx",
  ];
  const missing = surfaces.filter((r) => !exists(r));
  assert.deepEqual(
    missing,
    [],
    "missing route-state surfaces: " + missing.join(", "),
  );

  const routeError = read("../src/components/site/RouteError.tsx");
  assert.match(routeError, /role="alert"/);
  assert.match(routeError, /error\.digest/);
  assert.match(routeError, /onClick=\{reset\}/);

  const routeLoading = read("../src/components/site/RouteLoading.tsx");
  assert.match(routeLoading, /role="status"/);
  assert.match(routeLoading, /aria-live="polite"/);

  assert.match(
    read("../src/lib/content/site.ts"),
    /export const ROUTE_STATES/,
    "loading and error prose belongs in the shared content source.",
  );
});

test("/api/stats shares one origin poll via s-maxage", () => {
  const stats = read("../src/app/api/stats/route.ts");
  assert.match(stats, /Cache-Control/);
  assert.match(
    stats,
    /s-maxage=\d+/,
    "the stats route must set an s-maxage CDN hint mirroring the snapshot TTL.",
  );
});

test("/api/health proves app liveness without depending on chain telemetry", () => {
  const health = read("../src/app/api/health/route.ts");
  assert.match(health, /status:\s*200/);
  assert.match(health, /application:\s*true/);
  assert.doesNotMatch(health, /probeRpcHealth|chainId|blockHeight|503/);
});

test("middleware exists and stays coarse UX — it never imports the DAL", () => {
  assert.ok(exists("../src/middleware.ts"), "src/middleware.ts must exist");
  const mw = read("../src/middleware.ts");
  // Middleware is NOT the security boundary; authz lives in lib/dal. An
  // import here would tempt someone to trust it.
  assert.doesNotMatch(
    mw,
    /from\s+["'][^"']*\/dal\//,
    "middleware must not import from the DAL — real authz is server-side only.",
  );
});
