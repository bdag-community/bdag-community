import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";

const read = (relative) => {
  const url = new URL(relative, import.meta.url);
  return existsSync(url) ? readFileSync(url, "utf8") : "";
};

const actions = read("../src/app/(admin)/admin/news/actions.ts");
const panel = read("../src/components/admin/ArticleModerationPanel.tsx");
const editPage = read("../src/app/(admin)/admin/news/[id]/page.tsx");
const preview = read(
  "../src/app/(admin)/admin/news/[id]/assets/[assetId]/preview/route.ts",
);
const previewStorage = read(
  "../src/lib/aws/article-asset-preview.server.ts",
);
const previewDal = read("../src/lib/dal/admin-asset-preview.ts");
const middleware = read("../src/middleware.ts");
const site = read("../src/lib/content/site.ts");

test("admin replacement uploads issue one capability and keep image bytes out of server actions", () => {
  const actionAt = actions.indexOf(
    "export async function beginArticleAssetReplacementAction",
  );
  const nextActionAt = actions.indexOf("\nexport async function", actionAt + 1);
  const action = actions.slice(
    actionAt,
    nextActionAt === -1 ? actions.length : nextActionAt,
  );

  assert.ok(actionAt >= 0, "the replacement action must exist");
  const rpcAt = action.indexOf('"admin_begin_article_asset_replacement"');
  assert.ok(
    rpcAt >= 0 && action.indexOf("await requireAdmin()") < rpcAt,
    "the admin gate must run before the replacement RPC",
  );
  assert.match(action, /createArticleAssetCapability/);
  assert.match(action, /isArticleAssetContentType/);
  assert.match(action, /isArticleAssetByteSizeAllowed/);
  assert.match(action, /capability:\s*capability\.token/);
  assert.doesNotMatch(action, /\bFile\b|arrayBuffer|FormData/);
  assert.doesNotMatch(action, /objectKey|bucket|versionId|presignedUrl/);
});

test("the moderation panel uploads directly through the conditional intake route", () => {
  assert.notEqual(panel, "", "the moderation panel must exist");
  assert.match(panel, /type="file"/);
  assert.doesNotMatch(panel, /multiple/);
  const fileAt = panel.indexOf('id="admin-cover-file"');
  const fileEnd = panel.indexOf("/>", fileAt);
  assert.ok(fileAt >= 0 && fileEnd > fileAt);
  assert.doesNotMatch(
    panel.slice(fileAt, fileEnd),
    /\bname=/,
    "the file must not be submitted through a server action",
  );
  assert.match(panel, /beginArticleAssetReplacementAction/);
  assert.match(panel, /fetch\("\/api\/news\/assets\/presign"/);
  assert.match(panel, /"If-None-Match"/);
  assert.match(panel, /body:\s*file/);
  assert.match(panel, /syncArticleAssetResultAction/);
  assert.match(panel, /approveArticleAssetAction/);
  assert.match(panel, /rejectArticleAssetAction/);
  assert.match(panel, /publishArticleAction/);
  assert.match(panel, /unpublishArticleAction/);
  assert.doesNotMatch(
    panel,
    /object_key|processed_key|processed_version_id|published_key|published_version_id/i,
  );
});

test("a successful browser upload automatically checks for its processor result", () => {
  const putAt = panel.indexOf("const uploadResponse = await fetch");
  const syncAt = panel.indexOf("syncArticleAssetResultAction", putAt);
  const refreshAt = panel.indexOf("router.refresh()", syncAt);

  assert.ok(putAt >= 0 && syncAt > putAt && refreshAt > syncAt);
  assert.match(actions, /assetId:\s*parsedAssetId\.data/);
  assert.match(panel, /PROCESSOR_SYNC_ATTEMPTS/);
  assert.match(panel, /PROCESSOR_SYNC_DELAY_MS/);
  assert.match(panel, /copy\.replacementProcessed/);
  assert.match(panel, /copy\.replacementProcessing/);
  assert.match(panel, /copy\.awaitingUploadHelp/);
  assert.doesNotMatch(site, /awaiting_upload:\s*"Uploaded, waiting for processor sync"/);
});

test("processed cover previews expose UUIDs only and fail closed behind admin auth", () => {
  assert.notEqual(preview, "", "the private preview route must exist");
  const handlerAt = preview.indexOf("export async function GET");
  const gateAt = preview.indexOf("await getAdminSession()", handlerAt);
  const lookupAt = preview.indexOf("getAdminArticleAssetPreviewRecord", gateAt);
  const streamAt = preview.indexOf("readArticleAssetPreview", lookupAt);
  assert.ok(gateAt >= 0 && lookupAt > gateAt && streamAt > lookupAt);
  assert.doesNotMatch(preview, /requireAdmin|\/admin\/sign-in|NextResponse\.redirect/);
  assert.match(preview, /z\.string\(\)\.uuid\(\)/);
  assert.match(preview, /Cache-Control["']?:\s*["']private, no-store, max-age=0/);
  assert.match(preview, /Referrer-Policy["']?:\s*["']no-referrer/);
  assert.match(preview, /Content-Type["']?:\s*["']image\/webp/);
  assert.match(preview, /X-Content-Type-Options["']?:\s*["']nosniff/);
  assert.match(preview, /new Response\(image\.body/);
  assert.doesNotMatch(
    preview,
    /createArticleAssetPreviewUrl|getSignedUrl|Location|status:\s*30[1278]/,
  );
  assert.doesNotMatch(preview, /searchParams|get\(["'](?:key|versionId)["']\)/);
  assert.match(middleware, /isArticleAssetPreviewPath/);
  assert.match(middleware, /!isArticleAssetPreviewPath/);
});

test("the preview DAL fails closed and reads only the 1024 derivative", () => {
  assert.notEqual(previewDal, "", "the narrow preview DAL must exist");
  assert.match(previewDal, /import "server-only"/);
  const gateAt = previewDal.indexOf("await getAdminSession()");
  const queryAt = previewDal.indexOf('.from("article_asset_derivatives")');
  assert.ok(gateAt >= 0 && queryAt > gateAt);
  assert.match(previewDal, /\.eq\("variant_width", 1024\)/);
  assert.match(previewDal, /processed_key,processed_version_id,byte_size,checksum_sha256/);
  assert.doesNotMatch(
    previewDal,
    /requireAdmin|redirect\(|object_key|quarantine_version_id|published_key/,
  );
});

test("same-origin preview storage reads one exact, bounded processed WebP version", () => {
  assert.notEqual(previewStorage, "", "the server-only preview reader must exist");
  assert.match(previewStorage, /import "server-only"/);
  assert.match(previewStorage, /GetObjectCommand/);
  assert.match(previewStorage, /cover-1024x576\.webp/);
  assert.match(previewStorage, /Key:\s*input\.processedKey/);
  assert.match(previewStorage, /VersionId:\s*input\.processedVersionId/);
  assert.match(previewStorage, /ContentType\s*!==\s*"image\/webp"/);
  assert.match(previewStorage, /ContentLength/);
  assert.match(previewStorage, /PREVIEW_MAX_BYTES/);
  assert.match(previewStorage, /derivative-sha256/);
  assert.match(previewStorage, /checksumSha256/);
  assert.match(previewStorage, /boundedWebStream/);
  assert.doesNotMatch(
    previewStorage,
    /getSignedUrl|presign|https?:\/\/|ResponseContentType/i,
  );
});

test("the article edit page wires the moderation panel without storage coordinates", () => {
  assert.match(editPage, /<ArticleModerationPanel/);
  assert.match(editPage, /article=\{article\}/);
  assert.doesNotMatch(editPage, /object_key|processed_key|version_id/);
});

test("all new moderation labels remain in the content authority", () => {
  assert.match(site, /replacementTitle:/);
  assert.match(site, /previewAlt:/);
  assert.match(panel, /ADMIN_NEWS_COPY\.assetModeration/);
  assert.doesNotMatch(panel, />[ \t]*[A-Za-z][^<\n]*<\/[A-Za-z]/);
});

test("failed and rejected candidates explain their bounded review state", () => {
  assert.match(panel, /asset\.failure_reason/);
  assert.match(panel, /asset\.moderation_reason/);
  assert.match(panel, /copy\.processorReasonLabel/);
  assert.match(panel, /copy\.reviewReasonLabel/);
  assert.match(panel, /copy\.replacementAfterFailure/);
  assert.match(site, /processorReasonLabel:/);
  assert.match(site, /reviewReasonLabel:/);
  assert.match(site, /replacementAfterFailure:/);
});
