import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";

const read = (relative) => {
  const url = new URL(relative, import.meta.url);
  return existsSync(url) ? readFileSync(url, "utf8") : "";
};

const migration = read("../supabase/migrations/0007_article_moderation.sql");
const actions = read("../src/app/(admin)/admin/news/actions.ts");
const form = read("../src/components/admin/ArticleForm.tsx");
const moderation = read("../src/components/admin/ArticleModerationPanel.tsx");
const editPage = read("../src/app/(admin)/admin/news/[id]/page.tsx");
const preview = read(
  "../src/app/(admin)/admin/news/[id]/assets/[assetId]/preview/route.ts",
);
const dal = read("../src/lib/dal/admin.ts");
const site = read("../src/lib/content/site.ts");
const moderationStorage = read(
  "../src/lib/aws/article-asset-moderation.server.ts",
);
const previewStorage = read(
  "../src/lib/aws/article-asset-preview.server.ts",
);
const resultContract = read("../src/lib/aws/article-asset-result.ts");
const envExample = read("../.env.local.example");

test("forward migration 0007 adds exact private WebP derivatives and durable history", () => {
  assert.notEqual(migration, "", "forward migration 0007 must exist");
  assert.match(
    migration,
    /create table if not exists public\.article_asset_derivatives/,
  );
  assert.match(migration, /variant_width[\s\S]*640[\s\S]*1024[\s\S]*1600/i);
  assert.match(migration, /content_type[\s\S]*image\/webp/i);
  assert.match(migration, /checksum_sha256/);
  assert.match(migration, /processed_version_id/);
  assert.match(migration, /published_version_id/);
  assert.match(migration, /cover-[\s\S]*640[\s\S]*360[\s\S]*\.webp/i);
  assert.match(migration, /unique\s*\(asset_id, variant_width\)/i);
  assert.match(migration, /drop constraint if exists article_assets_one_kind_per_article/i);
  assert.match(migration, /'approved'/);
  assert.match(migration, /'superseded'/);
  assert.match(migration, /where state in \([\s\S]*'awaiting_presign'[\s\S]*'approved'/i);
  assert.match(migration, /where state = 'published'/i);
  assert.doesNotMatch(migration, /delete from public\.article_assets/i);
});

test("authenticated admins mutate news only through narrowly named RPCs", () => {
  assert.match(
    migration,
    /revoke insert, update, delete on table public\.news_articles from authenticated/i,
  );
  for (const policy of ["admins insert", "admins update", "admins delete"]) {
    assert.match(migration, new RegExp(`drop policy if exists "news: ${policy}"`));
  }

  for (const name of [
    "admin_create_news_article",
    "admin_save_news_article",
    "admin_begin_article_asset_replacement",
    "admin_approve_article_asset",
    "admin_reject_article_asset",
    "admin_publish_news_article",
    "admin_unpublish_news_article",
    "admin_delete_news_article",
  ]) {
    assert.match(
      migration,
      new RegExp(`create or replace function public\\.${name}\\(`),
    );
    assert.match(
      migration,
      new RegExp(`alter function public\\.${name}\\([\\s\\S]*?owner to postgres`),
    );
    assert.match(
      migration,
      new RegExp(`grant execute on function public\\.${name}\\([\\s\\S]*?to authenticated`),
    );
  }
  assert.match(migration, /security definer/);
  assert.match(migration, /set search_path = ''/);
  assert.match(migration, /auth\.uid\(\)/);
  assert.match(migration, /public\.is_admin\(\)/);
});

test("the decoder stays database-blind and admins sync immutable manifest results", () => {
  assert.match(
    migration,
    /create or replace function public\.admin_sync_article_asset_result\(/,
  );
  assert.match(
    migration,
    /grant execute on function public\.admin_sync_article_asset_result\([\s\S]*?to authenticated/,
  );
  assert.match(migration, /processing_attempts/);
  assert.match(migration, /storage_environment = p_storage_environment/);
  assert.match(migration, /object_key = p_object_key/);
  assert.match(migration, /quarantine_version_id = p_quarantine_version_id/);
  assert.match(migration, /jsonb_array_length\(p_derivatives\) <> 3/);
  assert.match(migration, /p_result_status = 'rejected'/);
  assert.match(migration, /failure_reason in \(/);
  for (const code of [
    "animated_image",
    "decode_failed",
    "dimensions_exceeded",
    "file_too_large",
    "malformed_container",
    "metadata_not_stripped",
    "output_limit",
    "pixel_limit_exceeded",
    "size_mismatch",
    "type_mismatch",
    "unsupported_type",
  ]) {
    assert.match(migration, new RegExp(`'${code}'`));
    assert.match(resultContract, new RegExp(`"${code}"`));
  }
  assert.doesNotMatch(migration, /char_length\(btrim\(p_failure_reason\)\).*1000/);
  assert.doesNotMatch(
    migration,
    /grant execute on function public\.admin_sync_article_asset_result[\s\S]*?to service_role/i,
  );
  assert.doesNotMatch(migration, /claim_article_asset_processing/);
  assert.doesNotMatch(migration, /complete_article_asset_processing/);
  assert.doesNotMatch(migration, /fail_article_asset_processing/);
});

test("publication is atomic, image-safe, and keeps the current cover during replacement", () => {
  assert.match(migration, /add column if not exists published_asset_id uuid/);
  assert.match(migration, /foreign key \(id, published_asset_id\)/i);
  assert.match(migration, /image_url is null/i);
  assert.match(migration, /is_published[\s\S]*published_at is not null/i);
  assert.match(migration, /published_asset_id is null or is_published/i);
  assert.match(migration, /char_length\(btrim\(alt_text\)\) >= 5/i);
  assert.match(
    migration,
    /admin_publish_news_article[\s\S]*description[\s\S]*body[\s\S]*state in \('approved', 'published'\)[\s\S]*state = 'published'/i,
  );
  assert.match(
    migration,
    /admin_begin_article_asset_replacement[\s\S]*state = 'published'/i,
  );
});

test("admin save and publication controls are separate and never accept an arbitrary image URL", () => {
  assert.doesNotMatch(actions, /\bimageUrl\b|\bisPublished\b|\bpublishedAt\b/);
  assert.doesNotMatch(form, /article-image|type="url"|Published \(visible/);
  assert.doesNotMatch(form, /\bimageUrl\b|\bisPublished\b|\bpublishedAt\b/);
  assert.match(actions, /\.rpc\("admin_create_news_article"/);
  assert.match(actions, /\.rpc\("admin_save_news_article"/);
  assert.match(actions, /\.rpc\("admin_approve_article_asset"/);
  assert.match(actions, /\.rpc\("admin_reject_article_asset"/);
  assert.match(actions, /\.rpc\("admin_publish_news_article"/);
  assert.match(actions, /\.rpc\("admin_unpublish_news_article"/);
  assert.match(actions, /approveArticleAssetAction/);
  assert.match(actions, /rejectArticleAssetAction/);
  assert.match(actions, /publishArticleAction/);
  assert.match(actions, /unpublishArticleAction/);
  assert.match(dal, /article_assets/);
  assert.match(dal, /article_asset_derivatives/);
});

test("admin previews expose IDs only, require admin, and cannot be cached", () => {
  assert.notEqual(moderation, "", "moderation UI must exist");
  assert.match(editPage, /<ArticleModerationPanel/);
  assert.notEqual(preview, "", "private preview route must exist");
  assert.match(preview, /getAdminSession/);
  assert.doesNotMatch(preview, /requireAdmin/);
  assert.match(actions, /export type ActionSuccess = \{ ok: true; message: string \}/);
  assert.doesNotMatch(actions, /presignedUrl|previewUrl:\s*string|objectKey:\s*string/);
  assert.doesNotMatch(form, /object_key|processed_key|published_key|https:\/\/s3/i);
});

test("admin storage validates result.json with a separate fail-closed credential", () => {
  assert.match(moderationStorage, /import "server-only"/);
  assert.match(
    moderationStorage,
    /process\.env\.ASSET_MODERATION_S3_ACCESS_KEY_ID/,
  );
  assert.match(
    moderationStorage,
    /process\.env\.ASSET_MODERATION_S3_SECRET_ACCESS_KEY/,
  );
  assert.doesNotMatch(
    moderationStorage,
    /process\.env\.ASSET_S3_ACCESS_KEY_ID|process\.env\.ASSET_S3_SECRET_ACCESS_KEY/,
  );
  assert.match(moderationStorage, /GetObjectCommand/);
  assert.doesNotMatch(
    moderationStorage,
    /HeadObjectCommand\(\{[\s\S]*?Key:\s*input\.sourceKey/,
  );
  assert.match(moderationStorage, /CopyObjectCommand/);
  assert.match(moderationStorage, /DeleteObjectCommand/);
  assert.match(resultContract, /schemaVersion:\s*z\.literal\(1\)/);
  assert.match(resultContract, /keySha256/);
  assert.match(resultContract, /versionId:\s*z\.string\(\)/);
  assert.match(resultContract, /versionIdSha256/);
  assert.match(moderationStorage, /timingSafeEqual/);
  assert.match(
    moderationStorage,
    /manifest\.status === "ready"[\s\S]*?\["image\/jpeg", "image\/png", "image\/webp"\]\.includes\([\s\S]*?manifest\.source\.declaredContentType[\s\S]*?manifest\.source\.declaredContentType !== input\.declaredContentType/,
  );
  assert.match(moderationStorage, /AbortSignal\.timeout/);
  assert.match(moderationStorage, /IfNoneMatch:\s*"\*"/);
  assert.match(moderationStorage, /CopySourceVersionId/);
  assert.match(resultContract, /\?versionId=\$\{encodeURIComponent\(/);
  assert.doesNotMatch(resultContract, /encodeURIComponent\([\s\S]{0,80}\?versionId/);
  assert.doesNotMatch(moderationStorage, /GetObjectAttributesCommand|getSignedUrl/);
  assert.match(previewStorage, /GetObjectCommand/);
  assert.doesNotMatch(previewStorage, /getSignedUrl|ResponseContentDisposition|expiresIn/);
  assert.doesNotMatch(moderationStorage, /console\.(?:log|error)/);
  assert.match(envExample, /^ASSET_MODERATION_S3_ACCESS_KEY_ID=$/m);
  assert.match(envExample, /^ASSET_MODERATION_S3_SECRET_ACCESS_KEY=$/m);
});

test("promotion cleanup deletes only versions created by the current attempt", () => {
  assert.match(
    moderationStorage,
    /export type PublishedDerivative = Readonly<\{[\s\S]*?created: boolean;/,
  );

  const promotionStart = moderationStorage.indexOf(
    "export async function promoteArticleAssetDerivatives",
  );
  const deletionStart = moderationStorage.indexOf(
    "export async function deletePublishedArticleAssetVersions",
    promotionStart,
  );
  assert.ok(promotionStart >= 0 && deletionStart > promotionStart);
  const promotion = moderationStorage.slice(promotionStart, deletionStart);
  const createdFalseAt = promotion.indexOf("let created = false");
  const copyAt = promotion.indexOf("new CopyObjectCommand");
  const createdTrueAt = promotion.indexOf("created = true", copyAt);
  const recoveryAt = promotion.indexOf("if (!isPreconditionFailed(error))");
  assert.ok(
    createdFalseAt >= 0 &&
      copyAt > createdFalseAt &&
      createdTrueAt > copyAt &&
      recoveryAt > createdTrueAt,
  );
  assert.equal(
    (moderationStorage.match(/\.filter\(\(\{ created \}\) => created\)/g) ?? [])
      .length,
    2,
  );
});

test("all moderation interface copy comes from site.ts and contains no em dash", () => {
  assert.match(site, /assetModeration:/);
  assert.match(actions, /ADMIN_NEWS_COPY\.assetModeration/);
  assert.match(form, /ADMIN_NEWS_COPY/);
  const start = site.indexOf("export const ADMIN_NEWS_COPY");
  const end = site.indexOf("} as const;", start);
  assert.ok(start >= 0 && end > start);
  assert.doesNotMatch(site.slice(start, end), /—/);
});
