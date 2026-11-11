import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (relative) =>
  readFileSync(new URL(relative, import.meta.url), "utf8");

/**
 * The storage-environment boundary. One Supabase database serves BOTH the
 * local review stack (development) and bdag.community (production), but each
 * deployment holds credentials for its OWN S3 bucket only. A cover uploaded
 * from one environment is therefore unreachable from the other: preview
 * would 503, publish would fail after an S3 round trip, and the admin would
 * stare at a broken image with no explanation — which is exactly the report
 * that prompted this boundary. The admin UI now says it plainly and the
 * preview route fails closed up front.
 */

const dal = read("../src/lib/dal/admin.ts");
const panel = read("../src/components/admin/ArticleModerationPanel.tsx");
const editPage = read("../src/app/(admin)/admin/news/[id]/page.tsx");
const previewDal = read("../src/lib/dal/admin-asset-preview.ts");
const previewRoute = read(
  "../src/app/(admin)/admin/news/[id]/assets/[assetId]/preview/route.ts",
);
const site = read("../src/lib/content/site.ts");

test("the admin DAL exposes each asset's storage environment", () => {
  assert.match(dal, /storage_environment: "development" \| "production";/);
  assert.match(
    dal,
    /"id,state,storage_environment,alt_text,failure_reason,moderation_reason/,
    "getArticleById must select the asset environment",
  );
  assert.match(dal, /storage_environment: asset\.storage_environment,/);
});

test("the edit page tells the panel which environment this deployment runs in", () => {
  assert.match(editPage, /loadArticleAssetRuntimeConfig\(\)\?\.storageEnvironment \?\? null/);
  assert.match(editPage, /runtimeStorageEnvironment=/);
});

test("a mismatched cover gets an explanation instead of a broken preview", () => {
  assert.match(
    panel,
    /asset\.storage_environment !== runtimeStorageEnvironment/,
    "the panel must compare the asset environment to the runtime environment",
  );
  assert.match(panel, /copy\.environmentMismatch/);
  // The preview only renders when the environments match…
  assert.match(panel, /!environmentMismatch &&\s*\n\s*asset\.derivatives\.some/);
  // …and every S3-touching action stays hidden on a mismatch. Reject stays
  // available: it is a database-only decision.
  for (const gate of [
    'asset.state === "awaiting_upload" && !environmentMismatch',
    'asset.state === "ready" && !environmentMismatch',
    'asset.state === "approved" && !environmentMismatch',
  ]) {
    assert.ok(panel.includes(gate), `panel must gate: ${gate}`);
  }
  assert.ok(
    panel.includes('asset.state === "ready" || asset.state === "approved"'),
    "reject remains reachable regardless of environment",
  );
});

test("the mismatch copy lives in the content authority and names both environments", () => {
  assert.match(site, /environmentMismatch:\s*\n?\s*"This cover was uploaded from the \{assetEnvironment\} environment/);
  assert.match(site, /development: "local review \(development\)"/);
  assert.match(site, /production: "production \(bdag\.community\)"/);
});

test("the preview route 404s a cross-environment derivative before touching S3", () => {
  assert.match(previewDal, /storageEnvironment: "development" \| "production";/);
  assert.match(previewDal, /storage_environment,processed_key/);
  const guardAt = previewRoute.indexOf(
    "derivative.storageEnvironment !== runtimeEnvironment",
  );
  const s3At = previewRoute.indexOf("readArticleAssetPreview({");
  assert.ok(
    guardAt >= 0 && s3At > guardAt,
    "the environment guard must run before the S3 read",
  );
  assert.ok(
    previewRoute.slice(guardAt, s3At).includes("status: 404"),
    "a mismatch must answer 404, not 503",
  );
});
