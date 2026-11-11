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
 * Community projects — the second public-submission content type. These
 * tests hold it to the same bar as articles: the abuse pattern on the
 * anonymous action, draft forcing in SQL, admin-gated RPC ordering, the
 * shared S3 key contract, and the copy authority.
 */

const migration = read("../supabase/migrations/0011_community_projects.sql");
const action = read(
  "../src/app/(public)/community/projects/submit/actions.ts",
);
const form = read("../src/components/projects/CommunityProjectForm.tsx");
const site = read("../src/lib/content/site.ts");
const adminActions = read("../src/app/(admin)/admin/projects/actions.ts");
const panel = read("../src/components/admin/ProjectModerationPanel.tsx");
const CATEGORIES = ["utility", "infrastructure", "information", "tooling", "community"];

test("the projects surface exists end to end", () => {
  for (const file of [
    "../src/app/(public)/community/projects/page.tsx",
    "../src/app/(public)/community/projects/submit/page.tsx",
    "../src/app/(public)/community/projects/submit/actions.ts",
    "../src/components/projects/CommunityProjectForm.tsx",
    "../src/components/projects/ProjectCard.tsx",
    "../src/components/community/CommunityViewSwitch.tsx",
    "../src/app/api/projects/assets/presign/route.ts",
    "../src/app/(admin)/admin/projects/page.tsx",
    "../src/app/(admin)/admin/projects/new/page.tsx",
    "../src/app/(admin)/admin/projects/[id]/page.tsx",
    "../src/app/(admin)/admin/projects/[id]/assets/[assetId]/preview/route.ts",
    "../src/app/(admin)/admin/projects/actions.ts",
    "../src/lib/projects.ts",
    "../src/lib/content/projects-seed.ts",
    "../src/lib/dal/admin-projects.ts",
    "../supabase/migrations/0011_community_projects.sql",
  ]) {
    assert.ok(exists(file), `${file} must exist`);
  }
});

test("the public project action wears the full abuse pattern in order", () => {
  const honeypotAt = action.indexOf('formData.get("website")');
  const validateAt = action.indexOf("schema.safeParse");
  const protectionAt = action.indexOf('protectPublicSubmission("project"');
  const sideEffectAt = action.indexOf(
    '"create_community_project_draft"',
    protectionAt,
  );
  assert.ok(honeypotAt >= 0, "the honeypot check must exist");
  assert.ok(
    honeypotAt < validateAt,
    "the honeypot must short-circuit before validation",
  );
  assert.ok(
    validateAt < protectionAt,
    "validation must run before the abuse pipeline",
  );
  assert.ok(
    protectionAt >= 0 && sideEffectAt > protectionAt,
    "the draft RPC must run only after protection allows",
  );
  assert.match(action, /formData\.get\("cf-turnstile-response"\)/);
  assert.match(action, /payloadFits\(/);
  assert.match(action, /formError\?: string/);
  // The anonymous boundary can create one private entry and nothing else.
  assert.match(action, /getAdminSupabase/);
  assert.doesNotMatch(action, /requireAdmin|\.update\(|\.delete\(/);
  assert.doesNotMatch(action, /\.from\("community_projects"\)/);
  assert.doesNotMatch(action, /formData\.get\("isPublished"\)|formData\.get\("publishedAt"\)/);
});

test("the project form carries the house submission scaffolding", () => {
  assert.match(form, /<TurnstileWidget/);
  assert.match(form, /action="submit_project"/);
  assert.match(form, /attempt=\{state\.attempt\}/);
  assert.match(form, /onVerifiedChange=\{handleVerifiedChange\}/);
  assert.match(form, /!humanVerified/);
  assert.match(form, /name="website"/);
  assert.match(form, /tabIndex=\{-1\}/);
  assert.match(form, /role="alert"/);
  assert.match(form, /role="status"/);
  assert.match(form, /summaryRef\.current\?\.focus\(\)/);
  assert.match(form, /successRef\.current\?\.focus\(\)/);
  assert.match(form, /failureRef\.current\?\.focus\(\)/);
  for (const name of ["name", "url", "category", "description", "authorName"]) {
    assert.ok(
      form.includes(`name="${name}"`),
      `the form must post a ${name} field`,
    );
  }
  // One file input, uploaded straight to S3 via the projects presign route.
  assert.match(form, /type="file"/);
  assert.match(form, /\/api\/projects\/assets\/presign/);
  assert.match(form, /"If-None-Match"/);
  assert.match(form, /https:\/\/s3\.eu-central-1\.amazonaws\.com/);
});

test("migration 0011 forces private community drafts", () => {
  const draftAt = migration.indexOf("create_community_project_draft");
  const slice = migration.slice(draftAt, migration.indexOf("$$;", draftAt));
  assert.match(slice, /true,\s*\n\s*false,\s*\n\s*null/);
  assert.match(slice, /'community_submission'/);
  assert.match(
    slice,
    /'news\/quarantine\/' \|\| v_project_id::text/,
    "project covers ride the shared quarantine key contract",
  );
});

test("the category set agrees between site.ts, SQL, and the DB constraint", () => {
  const mapAt = site.indexOf("export const PROJECT_CATEGORIES = {");
  assert.ok(mapAt >= 0, "site.ts must export PROJECT_CATEGORIES");
  const map = site.slice(mapAt, site.indexOf("} as const;", mapAt));
  // EXACT set equality, both directions: a category added to either side
  // without the other must fail here, not at runtime.
  const mapKeys = [...map.matchAll(/^  (\w+): "/gm)].map((m) => m[1]);
  assert.deepEqual(
    [...mapKeys].sort(),
    [...CATEGORIES].sort(),
    "PROJECT_CATEGORIES must hold exactly the closed set",
  );
  // The same five values appear in every SQL list: the table constraint plus
  // the three validating RPCs (draft, admin create, admin save).
  const sqlList = `'${CATEGORIES.join("', '")}'`;
  const occurrences = migration.split(sqlList).length - 1;
  assert.equal(
    occurrences,
    4,
    "the migration must enumerate the closed set in the constraint and all three writer RPCs",
  );
});

test("the project rate-limit scope exists with the article quota", () => {
  assert.match(
    migration,
    /check \(scope in \('challenge', 'article', 'suggestion', 'contact', 'project'\)\)/,
  );
  assert.match(migration, /when 'project' then\s*\n\s*v_limit := 3;\s*\n\s*v_window := interval '24 hours';/);
  const fingerprint = read("../src/lib/abuse/fingerprint.ts");
  assert.match(fingerprint, /\| "project";/);
  const boundary = read("../src/lib/abuse/public-submission.server.ts");
  assert.match(boundary, /project: "submit_project",/);
});

test("project RPC grants follow the boundary doctrine", () => {
  // The anonymous boundary and the finalizer are secret-key only.
  for (const grant of [
    /grant execute on function public\.create_community_project_draft\([\s\S]{0,120}\) to service_role;/,
    /grant execute on function public\.claim_project_asset_presign\(text, text\)\s*\nto service_role;/,
    /grant execute on function public\.delete_community_project_after_asset_cleanup\(uuid\)\s*\nto service_role;/,
  ]) {
    assert.match(migration, grant);
  }
  // The admin workflow is authenticated-only, and every function self-checks.
  for (const rpc of [
    "admin_create_community_project",
    "admin_save_community_project",
    "admin_begin_project_asset_replacement",
    "admin_sync_project_asset_result",
    "admin_approve_project_asset",
    "admin_reject_project_asset",
    "admin_publish_community_project",
    "admin_unpublish_community_project",
    "admin_delete_community_project",
  ]) {
    assert.ok(
      migration.includes(rpc),
      `migration must define ${rpc}`,
    );
  }
  const definers = migration.match(/security definer/g) ?? [];
  const searchPaths = migration.match(/set search_path = ''/g) ?? [];
  assert.ok(
    definers.length >= 13 && searchPaths.length >= 13,
    "every project RPC must pin security definer and an empty search_path",
  );
});

test("admin project actions gate before every RPC", () => {
  for (const marker of [
    '"admin_create_community_project"',
    '"admin_save_community_project"',
    '"admin_publish_community_project"',
    '"admin_delete_community_project"',
  ]) {
    const rpcAt = adminActions.indexOf(marker);
    assert.ok(rpcAt >= 0, `${marker} must be called`);
    const fnAt = adminActions.lastIndexOf("export async function", rpcAt);
    const gateAt = adminActions.indexOf("await requireAdmin()", fnAt);
    assert.ok(
      gateAt > fnAt && gateAt < rpcAt,
      `requireAdmin must precede ${marker}`,
    );
  }
  // Sensitive S3 coordinates stay out of the client contract.
  assert.match(
    adminActions,
    /export type ActionSuccess = \{ ok: true; message: string \}/,
  );
  assert.doesNotMatch(adminActions, /presignedUrl|objectKey: string/);
});

test("the project capability context is distinct from the article one", () => {
  const capability = read("../src/lib/projects/project-asset-capability.ts");
  assert.match(
    capability,
    /bdag-community:project-asset-capability:v1/,
    "a project digest must never be mistakable for an article digest",
  );
});

test("the projects presign route carries the article route's full contract", () => {
  const presign = read("../src/app/api/projects/assets/presign/route.ts");
  assert.match(presign, /digestProjectAssetCapability/);
  assert.match(presign, /"claim_project_asset_presign"/);
  // Same narrow request surface as /api/news/assets/presign.
  assert.match(presign, /request\.headers\.get\("origin"\) !== config\.expectedOrigin/);
  assert.match(presign, /startsWith\("application\/json"\)/);
  assert.match(presign, /REQUEST_MAX_BYTES = 8 \* 1024/);
  assert.match(presign, /capability: z\.string\(\)\.max\(100\)/);
  assert.match(presign, /upload_expires_in_seconds: z\.number\(\)\.int\(\)\.min\(1\)\.max\(300\)/);
  // The SigV4 presigner and its key validation are the shared, tested ones.
  assert.match(presign, /createArticleAssetUploadRequest/);
  assert.match(presign, /getAdminSupabase/);
  assert.doesNotMatch(presign, /requireAdmin|getAdminSession/);
});

test("takedown and republish stay unblocked in the SQL", () => {
  // Unpublish must supersede any pending replacement candidate before
  // demoting the published cover, or the one-active-candidate index aborts
  // the takedown. Both content types carry the guard.
  const unpublishGuards = migration.split(
    "and state in (\n        'awaiting_presign', 'awaiting_upload', 'processing', 'ready', 'approved'\n      )",
  ).length - 1;
  assert.ok(
    unpublishGuards >= 2,
    "both unpublish RPCs must supersede pending candidates first",
  );
  // Republication must treat an exact re-promotion of already-published
  // derivative coordinates as an idempotent no-op.
  const idempotent = migration.split(
    "published_at = coalesce(published_at, statement_timestamp())",
  ).length - 1;
  assert.ok(
    idempotent >= 2,
    "both publish RPCs must accept an exact re-promotion",
  );
});

test("the project preview route fails closed like the article one", () => {
  const preview = read(
    "../src/app/(admin)/admin/projects/[id]/assets/[assetId]/preview/route.ts",
  );
  assert.match(preview, /getAdminSession/);
  assert.doesNotMatch(preview, /requireAdmin/);
  const guardAt = preview.indexOf(
    "derivative.storageEnvironment !== runtimeEnvironment",
  );
  const s3At = preview.indexOf("readArticleAssetPreview({");
  assert.ok(
    guardAt >= 0 && s3At > guardAt,
    "the environment guard must run before the S3 read",
  );
  assert.match(preview, /Cache-Control[\s\S]{0,40}private, no-store/);
});

test("the moderation panel gates S3 actions on environment match", () => {
  assert.match(panel, /asset\.storage_environment !== runtimeStorageEnvironment/);
  assert.match(panel, /copy\.environmentMismatch/);
  for (const gate of [
    'asset.state === "awaiting_upload" && !environmentMismatch',
    'asset.state === "ready" && !environmentMismatch',
    'asset.state === "approved" && !environmentMismatch',
  ]) {
    assert.ok(panel.includes(gate), `panel must gate: ${gate}`);
  }
  assert.match(panel, /\/api\/projects\/assets\/presign/);
  assert.match(panel, /\/admin\/projects\/\$\{project\.id\}\/assets\/\$\{asset\.id\}\/preview/);
});

test("the Info | Projects switch is a pair of routes, worn by both views", () => {
  const community = read("../src/app/(public)/community/page.tsx");
  const projects = read("../src/app/(public)/community/projects/page.tsx");
  assert.match(community, /<CommunityViewSwitch active="info" \/>/);
  assert.match(projects, /<CommunityViewSwitch active="projects" \/>/);
  const sw = read("../src/components/community/CommunityViewSwitch.tsx");
  assert.match(sw, /aria-current=\{isActive \? "page" : undefined\}/);
  assert.doesNotMatch(sw, /"use client"/);
  const switchCopy = site.slice(
    site.indexOf("export const COMMUNITY_VIEW_SWITCH"),
    site.indexOf("} as const;", site.indexOf("export const COMMUNITY_VIEW_SWITCH")),
  );
  assert.match(switchCopy, /href: "\/community"/);
  assert.match(switchCopy, /href: "\/community\/projects"/);
});

test("the projects view is reachable from every applicable surface", () => {
  // Home Build card and community #build share DEVELOPMENT_SECTION.
  assert.match(site, /projectsLink: \{ label: "See community projects", href: "\/community\/projects" \}/);
  const participate = read("../src/components/home/Participate.tsx");
  assert.match(participate, /DEVELOPMENT_SECTION\.projectsLink\.href/);
  const community = read("../src/app/(public)/community/page.tsx");
  assert.match(community, /DEVELOPMENT_SECTION\.projectsLink\.href/);
  // Chain cross-links card.
  const chain = read("../src/app/(public)/chain/page.tsx");
  assert.match(chain, /\[MINING_SECTION, STAKING_SECTION, PROJECTS_SECTION\]/);
  // Footer and FAQ.
  const footer = read("../src/components/site/Footer.tsx");
  assert.match(footer, /href: "\/community\/projects"/);
  const faqSlice = site.slice(site.indexOf("export const FAQ_PAGE"));
  assert.match(faqSlice, /What has the community built\?/);
  // Sitemap and llms.txt carry the non-nav route.
  assert.match(read("../src/app/sitemap.ts"), /\/community\/projects/);
  assert.match(read("../src/app/llms.txt/route.ts"), /\/community\/projects/);
});

test("the public data path and cards render vetted projects honestly", () => {
  const projects = read("../src/lib/projects.ts");
  assert.match(projects, /import "server-only"/);
  assert.match(projects, /\.eq\("is_published", true\)/);
  assert.match(projects, /row\.category in PROJECT_CATEGORIES/);
  const card = read("../src/components/projects/ProjectCard.tsx");
  assert.match(card, /PROJECT_CATEGORIES\[project\.category\]/);
  assert.match(card, /rel="noopener noreferrer"/);
  assert.match(card, /target="_blank"/);
  // Every seed project declares a category and an https URL.
  const seed = read("../src/lib/content/projects-seed.ts");
  const names = seed.match(/name: "/g) ?? [];
  const ids = seed.match(/id: "seed-/g) ?? [];
  const categories = seed.match(/category: "/g) ?? [];
  const urls = seed.match(/url: "https:\/\//g) ?? [];
  assert.ok(names.length >= 1, "the seed must not be empty");
  assert.equal(ids.length, names.length, "every seed needs a stable id");
  assert.equal(categories.length, names.length, "every seed needs a category");
  assert.equal(urls.length, names.length, "every seed link must be https");
});

test("project admin copy shares the moderation mechanics with articles", () => {
  const adminCopyAt = site.indexOf("export const ADMIN_PROJECTS_COPY");
  assert.ok(adminCopyAt >= 0);
  const slice = site.slice(adminCopyAt, site.indexOf("} as const;", adminCopyAt));
  assert.match(
    slice,
    /\.\.\.ADMIN_NEWS_COPY\.assetModeration,/,
    "shared mechanics copy must come from one authority",
  );
  assert.match(slice, /unpublish: "Unpublish project"/);
  assert.doesNotMatch(slice, /—/);
});
