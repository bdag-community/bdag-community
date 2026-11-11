import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { test } from "node:test";

const read = (relativePath) =>
  readFileSync(new URL(relativePath, import.meta.url), "utf8");

const articleImage = read("../src/components/news/ArticleImage.tsx");
const news = read("../src/lib/news.ts");
const nextConfig = read("../next.config.ts");

test("Step 11 renders only site artwork and validated managed delivery images", () => {
  assert.match(articleImage, /src\.startsWith\("\/"\)/);
  assert.match(articleImage, /<Image[\s\S]*?src=\{src\}/);
  assert.match(articleImage, /managed[\s\S]*?<img/);
  assert.match(nextConfig, /img-src 'self' data:[\s\S]*assetDeliveryOrigin/);
  assert.match(nextConfig, /remotePatterns/);
  assert.doesNotMatch(nextConfig, /hostname:\s*["']\*["']/);
});

test("live public news uses managed asset identity and never image_url", () => {
  const summaryFields = news.slice(
    news.indexOf("const PUBLIC_NEWS_SUMMARY_FIELDS"),
    news.indexOf("export type NewsArticle"),
  );
  assert.doesNotMatch(summaryFields, /image_url/);
  assert.match(summaryFields, /published_asset_id/);
  assert.match(summaryFields, /published_asset_alt_text/);
  assert.match(news, /imageUrl:\s*delivery\?\.imageUrl\s*\?\?\s*null/);
});
