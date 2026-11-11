import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";

const read = (relative) => {
  const url = new URL(relative, import.meta.url);
  return existsSync(url) ? readFileSync(url, "utf8") : "";
};

const migration = read("../supabase/migrations/0006_article_assets.sql");
const action = read("../src/app/(public)/articles/submit/actions.ts");
const form = read("../src/components/news/CommunityArticleForm.tsx");
const route = read("../src/app/api/news/assets/presign/route.ts");
const presigner = read("../src/lib/aws/article-asset-presign.server.ts");
const presignerCore = read("../src/lib/aws/article-asset-presign.ts");
const envExample = read("../.env.local.example");
const nextConfig = read("../next.config.ts");
const dockerfile = read("../Dockerfile");
const compose = read("../docker-compose.yml");
const deploy = read("../ops/deploy.sh");
const site = read("../src/lib/content/site.ts");
const product = read("../PRODUCT.md");
const runbook = read("../SUPABASE-S3-INTEGRATION-RUNBOOK.md");

test("migration 0006 creates a private environment-bound asset workflow", () => {
  assert.notEqual(migration, "", "forward migration 0006 must exist");
  assert.match(migration, /create table if not exists public\.article_assets/);
  assert.match(migration, /storage_environment[\s\S]*development[\s\S]*production/i);
  assert.match(migration, /asset_kind[\s\S]*cover/i);
  assert.match(migration, /unique\s*\(article_id, asset_kind\)/i);
  assert.match(migration, /news\/quarantine\/[\s\S]*article_id[\s\S]*id/i);
  assert.match(migration, /declared_content_type/);
  assert.match(migration, /declared_byte_size/);
  assert.match(migration, /capability_digest/);
  assert.match(migration, /capability_expires_at/);
  assert.match(migration, /presigned_at/);
  assert.match(migration, /alter table public\.article_assets enable row level security/);
  assert.match(
    migration,
    /revoke all on table public\.article_assets[\s\S]*anon, authenticated, service_role, public/i,
  );
  assert.match(migration, /grant select on table public\.article_assets to authenticated/i);
  assert.match(migration, /for select to authenticated[\s\S]*public\.is_admin\(\)/i);
  assert.doesNotMatch(migration, /for (?:insert|update|delete) to anon/i);
});

test("draft and asset creation plus presign claiming are narrow service-only RPCs", () => {
  for (const name of [
    "create_community_article_draft",
    "claim_article_asset_presign",
  ]) {
    assert.match(migration, new RegExp(`create or replace function public\\.${name}\\(`));
    assert.match(
      migration,
      new RegExp(`alter function public\\.${name}\\([\\s\\S]*?owner to postgres`),
    );
    assert.match(
      migration,
      new RegExp(`grant execute on function public\\.${name}\\([\\s\\S]*?to service_role`),
    );
  }
  assert.match(migration, /security definer/);
  assert.match(migration, /set search_path = ''/);
  assert.match(migration, /submitted_by_community[\s\S]*true/i);
  assert.match(migration, /is_published[\s\S]*false/i);
  assert.match(migration, /published_at[\s\S]*null/i);
  assert.match(migration, /image_url[\s\S]*null/i);
  assert.match(migration, /revoke all on table public\.news_articles from service_role/i);
  assert.match(migration, /p_storage_environment is null[\s\S]*p_asset_content_type is null[\s\S]*p_asset_byte_size is null/i);
  assert.match(migration, /v_capability_expires_at := v_now \+ interval '5 minutes'/i);
  assert.doesNotMatch(migration, /p_capability_expires_at/);
  assert.match(
    migration,
    /storage_environment = p_storage_environment[\s\S]*capability_expires_at > statement_timestamp\(\)[\s\S]*presigned_at is null/i,
  );
});

test("the public action sends metadata only after abuse protection and never accepts asset authority", () => {
  const protectionAt = action.indexOf('protectPublicSubmission("article"');
  const rpcAt = action.indexOf('"create_community_article_draft"');
  assert.ok(protectionAt >= 0 && protectionAt < rpcAt);
  const assetValidationAt = action.indexOf("isArticleAssetContentType(");
  assert.ok(assetValidationAt >= 0 && assetValidationAt < protectionAt);
  assert.match(action, /assetContentType/);
  assert.match(action, /assetByteSize/);
  assert.match(action, /assetAltText/);
  assert.match(action, /createArticleAssetCapability/);
  assert.match(action, /loadArticleAssetRuntimeConfig\(\)/);
  assert.doesNotMatch(action, /formData\.get\(["'](?:assetId|articleId|objectKey|bucket|storageEnvironment)["']/);
  assert.doesNotMatch(action, /arrayBuffer\(|instanceof File|\.from\("news_articles"\)/);
});

test("the browser offers exactly one unnamed cover and keeps bytes out of the Server Action", () => {
  assert.match(form, /type="file"/);
  assert.match(form, /accept="image\/jpeg,image\/png,image\/webp"/);
  assert.match(form, /name="assetContentType"/);
  assert.match(form, /name="assetByteSize"/);
  assert.match(form, /name="assetAltText"/);
  const fileInputIdAt = form.indexOf('id="submission-cover-image"');
  const fileInputStart = form.lastIndexOf("<Input", fileInputIdAt);
  const fileInputEnd = form.indexOf("/>", fileInputIdAt);
  const fileInput = form.slice(fileInputStart, fileInputEnd + 2);
  assert.notEqual(fileInput, "");
  assert.doesNotMatch(fileInput, /\bname=/);
  assert.doesNotMatch(form, /multiple/);
  assert.match(form, /fetch\([\s\S]*?\/api\/news\/assets\/presign/);
  assert.match(form, /method:\s*"PUT"/);
  assert.match(form, /uploadOrigin === "https:\/\/s3\.eu-central-1\.amazonaws\.com"/);
  assert.match(form, /headers\?\.\["If-None-Match"\] === "\*"/);
  assert.match(form, /role=\{failed \? "alert" : "status"\}/);
  const uploadFetchAt = form.indexOf("presignBody.upload.url");
  const uploadFetchEnd = form.indexOf("});", uploadFetchAt);
  assert.doesNotMatch(
    form.slice(uploadFetchAt, uploadFetchEnd),
    /cache:\s*"no-store"/,
  );
  assert.match(form, /copy\.asset[\s\S]*copy\.success/);
});

test("the presign endpoint is Node-only, same-origin, bounded, one-shot, and never cached", () => {
  assert.notEqual(route, "", "the presign route must exist");
  assert.match(route, /export const runtime = "nodejs"/);
  assert.match(route, /export const dynamic = "force-dynamic"/);
  assert.match(route, /request\.headers\.get\("origin"\)/);
  assert.match(route, /request\.body\?\.getReader\(\)/);
  assert.match(route, /8 \* 1024/);
  assert.match(route, /digestArticleAssetCapability/);
  assert.match(route, /claim_article_asset_presign/);
  assert.match(route, /upload_expires_in_seconds/);
  assert.match(route, /abortSignal\(AbortSignal\.timeout\(8_000\)\)/);
  assert.match(route, /Cache-Control[\s\S]*no-store/);
  assert.doesNotMatch(route, /console\.(?:log|error)|searchParams/);
});

test("S3 credentials remain runtime-only and the browser can reach only the exact regional upload origin", () => {
  for (const name of [
    "ASSET_STORAGE_ENVIRONMENT",
    "ASSET_S3_REGION",
    "ASSET_S3_BUCKET",
    "ASSET_S3_ACCESS_KEY_ID",
    "ASSET_S3_SECRET_ACCESS_KEY",
  ]) {
    assert.match(envExample, new RegExp(`^${name}=`, "m"));
    assert.doesNotMatch(
      [form, nextConfig, dockerfile, compose, deploy].join("\n"),
      new RegExp(`NEXT_PUBLIC_${name}`),
    );
  }
  assert.match(presigner, /import "server-only"/);
  assert.match(presignerCore, /forcePathStyle:\s*true/);
  assert.match(presignerCore, /IfNoneMatch:\s*"\*"/);
  assert.match(presignerCore, /ContentLength/);
  assert.match(nextConfig, /https:\/\/s3\.eu-central-1\.amazonaws\.com/);
  assert.doesNotMatch(nextConfig, /https:\/\/\*\.s3/);
  assert.doesNotMatch(
    [dockerfile, compose, deploy].join("\n"),
    /ASSET_S3_ACCESS_KEY_ID.*build-arg|ASSET_S3_SECRET_ACCESS_KEY.*build-arg/i,
  );
});

test("all new asset and DDoS copy and rollout requirements live in the content authority and runbook", () => {
  assert.match(site, /coverImageLabel/);
  assert.match(site, /assetUploadComplete/);
  assert.match(site, /assetUploadFailed/);
  assert.match(site, /assetAltTextLabel/);
  assert.match(product, /one optional JPEG, PNG, or WebP cover up to 5 MiB/i);
  assert.match(product, /private S3[\s\S]*original is never public/i);
  assert.match(product, /immutable[\s\S]*private-origin controlled delivery/i);
  assert.match(runbook, /direct S3 access[\s\S]*denied/i);
  assert.match(runbook, /DDoS-protected[\s\S]*delivery layer/i);
  assert.match(runbook, /Cloudflare-proxied[\s\S]*Xneelo origin/i);
  assert.match(runbook, /only Cloudflare[\s\S]*(?:IP|Tunnel)/i);
});
