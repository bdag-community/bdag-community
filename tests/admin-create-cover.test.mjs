import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";

const read = (relative) => {
  const url = new URL(relative, import.meta.url);
  return existsSync(url) ? readFileSync(url, "utf8") : "";
};
const form = read("../src/components/admin/ArticleForm.tsx");
const actions = read("../src/app/(admin)/admin/news/actions.ts");
const uploaderPath = new URL("../src/lib/news/admin-cover-upload.ts", import.meta.url);

test("new admin articles accept one optional private cover without sending image bytes through an action", () => {
  assert.match(form, /id="article-cover-file"/);
  assert.match(form, /type="file"/);
  assert.match(form, /accept="image\/jpeg,image\/png,image\/webp"/);
  assert.match(form, /id="article-cover-alt"/);
  assert.match(form, /ARTICLE_ASSET_MAX_BYTES/);
  assert.match(form, /uploadAdminCover/);
  assert.match(form, /createdArticleId/);
  assert.match(form, /href=\{`\/admin\/news\/\$\{createdArticleId\}`\}/);
  assert.doesNotMatch(form, /imageUrl|objectKey|bucket/);
  assert.match(actions, /createArticleAction\([\s\S]*returnArticleId/);
  assert.match(actions, /await requireAdmin\(\)/);
  assert.match(actions, /"admin_create_news_article"/);
  assert.match(actions, /articleId: parsedArticleId\.data/);
  assert.doesNotMatch(actions.slice(actions.indexOf("export async function createArticleAction"), actions.indexOf("export async function updateArticleAction")), /\bFile\b|arrayBuffer|FormData/);
});

test("admin create upload validates file before issuing a capability", async () => {
  assert.ok(existsSync(uploaderPath));
  const { uploadAdminCover } = await import(uploaderPath);
  let started = false;
  const file = new File(["x"], "cover.gif", { type: "image/gif" });
  await assert.rejects(
    uploadAdminCover("article-id", file, "alt", {
      begin: async () => { started = true; throw Error("unexpected"); },
      sync: async () => ({ ok: true }),
      request: async () => { throw Error("unexpected"); },
    }),
    /unsupported cover/i,
  );
  assert.equal(started, false);
});

test("admin create upload uses a private conditional PUT and checks processing", async () => {
  const { uploadAdminCover } = await import(uploaderPath);
  const file = new File(["image bytes"], "cover.png", { type: "image/png" });
  const requests = [];
  const result = await uploadAdminCover("article-id", file, "A useful cover", {
    begin: async (id, metadata) => {
      assert.equal(id, "article-id");
      assert.deepEqual(metadata, { contentType: "image/png", byteSize: file.size, altText: "A useful cover" });
      return { ok: true, capability: "opaque", assetId: "asset-id" };
    },
    sync: async (id, assetId) => {
      assert.equal(id, "article-id");
      assert.equal(assetId, "asset-id");
      return { ok: true };
    },
    request: async (url, init) => {
      requests.push({ url, init });
      return requests.length === 1
        ? Response.json({ ok: true, upload: {
          url: "https://s3.eu-central-1.amazonaws.com/private-cover",
          method: "PUT", byteSize: file.size,
          headers: { "Content-Type": "image/png", "Content-Length": String(file.size), "If-None-Match": "*" },
        } })
        : new Response(null, { status: 200 });
    },
  });
  assert.deepEqual(result, { processed: true });
  assert.equal(requests.length, 2);
  assert.equal(requests[0].url, "/api/news/assets/presign");
  assert.deepEqual(JSON.parse(requests[0].init.body), { capability: "opaque" });
  assert.equal(requests[1].init.method, "PUT");
  assert.equal(requests[1].init.headers["If-None-Match"], "*");
  assert.equal(requests[1].init.body, file);
});

test("admin create upload rejects a presign response outside the trusted S3 origin", async () => {
  const { uploadAdminCover } = await import(uploaderPath);
  const file = new File(["image bytes"], "cover.png", { type: "image/png" });
  let requests = 0;
  await assert.rejects(
    uploadAdminCover("article-id", file, "alt", {
      begin: async () => ({ ok: true, capability: "opaque", assetId: "asset-id" }),
      sync: async () => ({ ok: true }),
      request: async () => {
        requests += 1;
        return Response.json({ ok: true, upload: {
          url: "https://attacker.example/upload", method: "PUT", byteSize: file.size,
          headers: { "Content-Type": "image/png", "Content-Length": String(file.size), "If-None-Match": "*" },
        } });
      },
    }),
    /presign/i,
  );
  assert.equal(requests, 1);
});
