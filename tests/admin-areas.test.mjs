import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";

const read = (relative) => {
  const url = new URL(relative, import.meta.url);
  return existsSync(url) ? readFileSync(url, "utf8") : "";
};
const exists = (relative) =>
  existsSync(new URL(relative, import.meta.url));

/**
 * The admin area structure: a dashboard that routes attention plus one
 * dedicated view per content area, all behind the same DAL boundary. The
 * nav is chrome, never a gate — every page calls requireAdmin() itself.
 */

const layout = read("../src/app/(admin)/layout.tsx");
const nav = read("../src/components/admin/AdminNav.tsx");
const dashboard = read("../src/app/(admin)/admin/page.tsx");

test("every admin area has its own view", () => {
  for (const file of [
    "../src/app/(admin)/admin/page.tsx",
    "../src/app/(admin)/admin/articles/page.tsx",
    "../src/app/(admin)/admin/projects/page.tsx",
    "../src/app/(admin)/admin/inbox/page.tsx",
    "../src/app/(admin)/admin/suggestions/page.tsx",
  ]) {
    assert.ok(exists(file), `${file} must exist`);
  }
});

test("the nav is signed-in chrome and grants nothing", () => {
  assert.match(layout, /\{user && <AdminNav \/>\}/);
  // The layout still does not gate; the doctrine comment survives.
  assert.match(layout, /does NOT gate/);
  for (const href of [
    "/admin",
    "/admin/articles",
    "/admin/projects",
    "/admin/inbox",
    "/admin/suggestions",
  ]) {
    assert.ok(nav.includes(`href: "${href}"`), `nav must list ${href}`);
  }
  // Editing an article under /admin/news keeps Articles highlighted.
  assert.match(nav, /"\/admin\/news"/);
  assert.match(nav, /aria-current=\{active \? "page" : undefined\}/);
  assert.doesNotMatch(nav, /requireAdmin|getAdminSession/);
});

test("every area page gates itself before reading", () => {
  for (const [file, query] of [
    ["../src/app/(admin)/admin/articles/page.tsx", "listAllArticles()"],
    ["../src/app/(admin)/admin/projects/page.tsx", "listAllProjects()"],
    [
      "../src/app/(admin)/admin/inbox/page.tsx",
      "listContactMessages(INBOX_LIMIT + 1, topic)",
    ],
    [
      "../src/app/(admin)/admin/suggestions/page.tsx",
      "listSuggestionMessages(INBOX_LIMIT + 1)",
    ],
  ]) {
    const source = read(file);
    const gateAt = source.indexOf("await requireAdmin()");
    const queryAt = source.indexOf(query);
    assert.ok(
      gateAt >= 0 && queryAt > gateAt,
      `${file} must call requireAdmin before ${query}`,
    );
    assert.match(source, /robots: \{ index: false, follow: false \}/);
  }
});

test("the dashboard routes attention instead of hosting the work", () => {
  const gateAt = dashboard.indexOf("await requireAdmin()");
  const queryAt = dashboard.indexOf("listAllArticles()");
  assert.ok(gateAt >= 0 && queryAt > gateAt);
  for (const href of [
    "/admin/articles",
    "/admin/projects",
    "/admin/inbox",
    "/admin/suggestions",
  ]) {
    assert.ok(
      dashboard.includes(`"${href}"`),
      `the dashboard must link ${href}`,
    );
  }
  // The number that matters: community submissions waiting on a decision.
  assert.match(dashboard, /attentionCount/);
  assert.match(dashboard, /submitted_by_community/);
  // The inboxes cap their own views at 50; the overview only probes counts.
  assert.match(dashboard, /OVERVIEW_INBOX_PROBE = 51/);
  assert.match(dashboard, /"50\+"/);
});

test("the middleware image carve-out covers both preview families", () => {
  const middleware = read("../src/middleware.ts");
  assert.match(
    middleware,
    /\/\^\\\/admin\\\/\(\?:news\|projects\)\\\/\[\^\/\]\+\\\/assets\\\/\[\^\/\]\+\\\/preview\$\//,
  );
});
