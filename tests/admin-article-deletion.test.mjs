import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";

const read = (relative) => {
  const url = new URL(relative, import.meta.url);
  return existsSync(url) ? readFileSync(url, "utf8") : "";
};

const migration = read("../supabase/migrations/0008_suggestion_inbox.sql");
const actions = read("../src/app/(admin)/admin/news/actions.ts");
const editPage = read("../src/app/(admin)/admin/news/[id]/page.tsx");
const storage = read("../src/lib/aws/article-asset-moderation.server.ts");
const template = read("../infra/aws/s3-foundation.template.json");
const verifier = read("../ops/verify-s3-foundation.sh");

test("the edit page offers one confirmed delete action even with asset history", () => {
  assert.match(editPage, /<ConfirmDeleteButton/);
  assert.match(editPage, /action=\{deleteArticleAction\}/);
  assert.doesNotMatch(editPage, /article\.assets\?\.length\s*\?/);
  assert.match(editPage, /ADMIN_NEWS_COPY\.assetModeration\.deleteDescription/);
});

test("managed-asset deletion cleans exact versions before the service-only database RPC", () => {
  const actionAt = actions.indexOf("export async function deleteArticleAction");
  const action = actions.slice(actionAt);
  const gateAt = action.indexOf("await requireAdmin()");
  const articleAt = action.indexOf("getArticleById");
  const cleanupAt = action.indexOf("deleteArticleAssetVersions");
  const rpcAt = action.indexOf('"delete_news_article_after_asset_cleanup"');

  assert.ok(
    actionAt >= 0 && gateAt >= 0 && articleAt > gateAt && cleanupAt > articleAt && rpcAt > cleanupAt,
  );
  assert.match(action, /article\.is_published/);
  assert.match(action, /getAdminArticleAssetStorageRecord/);
  assert.match(action, /getAdminSupabase/);
  assert.match(action, /ADMIN_NEWS_COPY\.assetModeration\.deleteUnpublishFirst/);
  assert.match(storage, /export async function deleteArticleAssetVersions/);
  assert.match(storage, /buildArticleAssetDeletionTargets/);
  assert.match(storage, /new DeleteObjectCommand/);
  assert.match(storage, /VersionId:\s*target\.versionId/);
  assert.doesNotMatch(storage, /ListObjects|DeleteObjectsCommand/);
});

test("the cleanup finalizer is service-only and still refuses published articles", () => {
  assert.match(
    migration,
    /create or replace function public\.delete_news_article_after_asset_cleanup\(/,
  );
  assert.match(migration, /security definer/);
  assert.match(migration, /set search_path = ''/);
  assert.match(
    migration,
    /delete_news_article_after_asset_cleanup[\s\S]*?is_published[\s\S]*?unpublish article first/i,
  );
  assert.match(
    migration,
    /revoke all on function public\.delete_news_article_after_asset_cleanup\(uuid\)[\s\S]*?from anon, authenticated, service_role, public/,
  );
  assert.match(
    migration,
    /grant execute on function public\.delete_news_article_after_asset_cleanup\(uuid\)[\s\S]*?to service_role/,
  );
  assert.doesNotMatch(
    migration,
    /grant execute on function public\.delete_news_article_after_asset_cleanup\(uuid\)[\s\S]*?to authenticated/,
  );
});

test("the moderator can delete exact managed versions without gaining raw reads or broad deletes", () => {
  const parsed = JSON.parse(template);
  const statements =
    parsed.Resources.ModeratorUser.Properties.Policies[0].PolicyDocument.Statement;
  const cleanup = statements.find(
    ({ Sid }) => Sid === "DeleteExactManagedAssetVersions",
  );
  assert.ok(cleanup);
  assert.deepEqual(cleanup.Action, "s3:DeleteObjectVersion");
  const resources = cleanup.Resource.map((resource) => resource["Fn::Sub"]);
  assert.deepEqual(resources.sort(), [
    "${AssetBucket.Arn}/news/processed/*",
    "${AssetBucket.Arn}/news/published/*",
    "${AssetBucket.Arn}/news/quarantine/*",
  ]);
  assert.match(verifier, /s3:DeleteObjectVersion[^\n]*news\/quarantine/);
  assert.match(verifier, /s3:DeleteObjectVersion[^\n]*news\/processed/);
  assert.match(verifier, /s3:GetObject[^\n]*news\/quarantine[^\n]*implicitDeny/);
  assert.match(verifier, /s3:DeleteObject[^\n]*news\/published[^\n]*implicitDeny/);
});

test("deletion targets accept only canonical keys and exact version pairs", async () => {
  const contract = await import("../src/lib/aws/article-asset-deletion.ts");
  const articleId = "10000000-0000-4000-8000-000000000001";
  const assetId = "20000000-0000-4000-8000-000000000001";
  const record = {
    id: assetId,
    articleId,
    storageEnvironment: "development",
    objectKey: `news/quarantine/${articleId}/${assetId}/original`,
    quarantineVersionId: "quarantine-version",
    resultManifestKey: `news/processed/${articleId}/${assetId}/result.json`,
    resultManifestVersionId: "manifest-version",
    derivatives: [640, 1024, 1600].map((width) => {
      const height = width === 640 ? 360 : width === 1024 ? 576 : 900;
      return {
        variantWidth: width,
        processedKey: `news/processed/${articleId}/${assetId}/cover-${width}x${height}.webp`,
        processedVersionId: `processed-${width}`,
        publishedKey: `news/published/${articleId}/${assetId}/cover-${width}x${height}.webp`,
        publishedVersionId: `published-${width}`,
      };
    }),
  };

  const targets = contract.buildArticleAssetDeletionTargets(articleId, [record]);
  assert.equal(targets.length, 8);
  assert.throws(
    () =>
      contract.buildArticleAssetDeletionTargets(articleId, [
        { ...record, objectKey: "news/quarantine/changed/original" },
      ]),
    /invalid/i,
  );
  assert.throws(
    () =>
      contract.buildArticleAssetDeletionTargets(articleId, [
        { ...record, resultManifestVersionId: null },
      ]),
    /invalid/i,
  );
});
