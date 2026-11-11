import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  plainTextToArticleHtml,
  sanitizeArticleBody,
} from "../src/lib/news/rich-text.ts";

const read = (rel) => readFileSync(new URL(rel, import.meta.url), "utf8");

const editor = read("../src/components/news/RichTextEditor.tsx");
const richBody = read("../src/components/news/RichTextBody.tsx");
const richText = read("../src/lib/news/rich-text.ts");
const publicAction = read("../src/app/(public)/articles/submit/actions.ts");
const adminActions = read("../src/app/(admin)/admin/news/actions.ts");
const articlePage = read("../src/app/(public)/articles/[slug]/page.tsx");
const migration = read("../supabase/migrations/0002_news.sql");
const news = read("../src/lib/news.ts");
const adminDal = read("../src/lib/dal/admin.ts");
const publicForm = read("../src/components/news/CommunityArticleForm.tsx");
const adminForm = read("../src/components/admin/ArticleForm.tsx");
const site = read("../src/lib/content/site.ts");
const globals = read("../src/app/globals.css");

test("rich article HTML has one strict shared allowlist", () => {
  for (const tag of [
    "p",
    "h2",
    "h3",
    "strong",
    "em",
    "u",
    "blockquote",
    "ul",
    "ol",
    "li",
    "a",
    "br",
  ]) {
    assert.match(richText, new RegExp("\\b" + tag + "\\b"));
  }
  assert.match(richText, /allowedAttributes:[\s\S]*a:\s*\["href", "data-article-button", "target", "rel"\]/);
  assert.match(richText, /transformTags:/);
  assert.match(
    richText,
    /allowedSchemes:\s*\["http",\s*"https",\s*"mailto"\]/,
  );
  assert.match(richText, /allowProtocolRelative:\s*false/);
  const tagList = richText.slice(
    richText.indexOf("const ARTICLE_BODY_TAGS"),
    richText.indexOf("] as const;"),
  );
  assert.doesNotMatch(tagList, /\b(?:img|iframe|svg|style|script|form)\b/);
});

test("the sanitizer is pinned and covered against stored XSS classes", () => {
  const packageJson = JSON.parse(read("../package.json"));
  assert.equal(packageJson.dependencies?.["sanitize-html"], "2.17.6");
  assert.equal(
    packageJson.devDependencies?.["@types/sanitize-html"],
    "2.16.1",
  );

  const malicious = [
    '<script>alert("x")</script><p>Keep me</p>',
    '<img src=x onerror="alert(1)"><p>Keep me</p>',
    '<a href="javascript:alert(1)">Unsafe</a>',
    '<a href="data:text/html,unsafe">Unsafe</a>',
    '<svg><script>alert(1)</script></svg><p>Keep me</p>',
    '<iframe srcdoc="<script>alert(1)</script>"></iframe><p>Keep me</p>',
    '<xmp><img src=x onerror=alert(1)></xmp><p>Keep me</p>',
  ];
  for (const payload of malicious) {
    const clean = sanitizeArticleBody(payload);
    assert.doesNotMatch(
      clean.html,
      /script|onerror|javascript:|data:text|<svg|<iframe|<xmp/i,
    );
  }
});

test("the sanitizer preserves only the formatting the editor offers", () => {
  const safe = sanitizeArticleBody(
    '<h2>Heading</h2><p><strong>Bold</strong> and <em>italic</em> ' +
      '<u>underlined</u> with <a href="https://example.com">a link</a>.</p>' +
      "<blockquote>Quoted</blockquote><ul><li>One</li></ul>",
  );
  assert.match(safe.html, /<h2>Heading<\/h2>/);
  assert.match(safe.html, /<strong>Bold<\/strong>/);
  assert.match(safe.html, /<em>italic<\/em>/);
  assert.match(safe.html, /<u>underlined<\/u>/);
  assert.match(safe.html, /href="https:\/\/example\.com"/);
  assert.match(safe.html, /<blockquote>Quoted<\/blockquote>/);
  assert.match(safe.html, /<ul><li>One<\/li><\/ul>/);
  assert.equal(
    plainTextToArticleHtml("<script>not markup</script>\n\nSecond"),
    "<p>&lt;script&gt;not markup&lt;/script&gt;</p><p>Second</p>",
  );
  assert.equal(
    sanitizeArticleBody("<p>&amp;&amp; &lt;&gt;</p>").text,
    "&& <>",
  );
  assert.equal(
    sanitizeArticleBody(
      "<p>A <strong>bold</strong>,word</p><p>Second paragraph</p>",
    ).text,
    "A bold,word\nSecond paragraph",
  );
  const ampersands = "&".repeat(30_000);
  const expandedPlainBody = sanitizeArticleBody(
    plainTextToArticleHtml(ampersands),
  );
  assert.equal(expandedPlainBody.text, ampersands);
  assert.equal(expandedPlainBody.text.length, 30_000);
  const quotes = '"'.repeat(50_000);
  const maximumPlainBody = plainTextToArticleHtml(quotes);
  assert.ok(maximumPlainBody.length < 400_000);
  assert.equal(sanitizeArticleBody(maximumPlainBody).text, quotes);
});

test("both article write paths sanitize before database writes", () => {
  const publicSanitizeAt = publicAction.indexOf(
    "const safeBodyBeforeValidation = sanitizeArticleBody(",
  );
  const publicWriteAt = publicAction.indexOf(
    '"create_community_article_draft"',
  );
  assert.ok(publicSanitizeAt >= 0 && publicSanitizeAt < publicWriteAt);
  assert.match(publicAction, /p_body_html:\s*sanitizedBody\.html/);
  assert.match(publicAction, /p_body:\s*sanitizedBody\.text/);
  assert.doesNotMatch(
    publicAction,
    /values:\s*\{[^}]*body:\s*values\.body/s,
  );

  const validationStart = adminActions.indexOf(
    "function validateArticleForSave",
  );
  const validationEnd = adminActions.indexOf("const firstIssue", validationStart);
  assert.ok(validationStart >= 0 && validationEnd > validationStart);
  const validation = adminActions.slice(validationStart, validationEnd);
  assert.match(validation, /const sanitizedBody = sanitizeArticleBody\(/);
  assert.match(
    validation,
    /sanitizedBody\.text\.length\s*>\s*ARTICLE_BODY_MAX_TEXT_LENGTH/,
  );

  const rpcInputStart = adminActions.indexOf("const rpcInput =");
  const rpcInputEnd = adminActions.indexOf(
    "export async function createArticleAction",
    rpcInputStart,
  );
  assert.ok(rpcInputStart >= 0 && rpcInputEnd > rpcInputStart);
  const rpcInput = adminActions.slice(rpcInputStart, rpcInputEnd);
  assert.match(rpcInput, /p_body:\s*body\.text\s*\|\|\s*null/);
  assert.match(rpcInput, /p_body_html:\s*body\.html\s*\|\|\s*null/);

  for (const [actionName, rpcName] of [
    ["createArticleAction", "admin_create_news_article"],
    ["updateArticleAction", "admin_save_news_article"],
  ]) {
    const start = adminActions.indexOf(`export async function ${actionName}`);
    const next = adminActions.indexOf("\nexport async function", start + 1);
    assert.ok(start >= 0, `${actionName} must exist`);
    const action = adminActions.slice(
      start,
      next === -1 ? adminActions.length : next,
    );
    const validateAt = action.indexOf(
      "const validation = validateArticleForSave(parsed.data)",
    );
    const writeAt = action.indexOf(`.rpc("${rpcName}"`);
    assert.ok(
      validateAt >= 0 && writeAt > validateAt,
      `${actionName} must validate sanitized content before ${rpcName}`,
    );
  }
});

test("rich content is sanitized again at the sole public HTML sink", () => {
  assert.match(richBody, /sanitizeArticleBody/);
  assert.match(
    richBody,
    /dangerouslySetInnerHTML=\{\{\s*__html:\s*safeBody\.html/,
  );
  assert.equal((richBody.match(/dangerouslySetInnerHTML/g) ?? []).length, 1);
  assert.match(articlePage, /<RichTextBody/);
  assert.doesNotMatch(articlePage, /dangerouslySetInnerHTML/);
});

test("rich HTML is explicit storage, never guessed from legacy plain text", () => {
  assert.match(migration, /body_html\s+text/i);
  assert.match(migration, /add column if not exists body_html text/i);
  assert.match(news, /bodyHtml:\s*string \| null/);
  assert.match(news, /body_html:\s*string \| null/);
  assert.match(news, /bodyHtml:\s*row\.body_html/);
  assert.match(adminDal, /body_html:\s*string \| null/);
  assert.match(adminDal, /body_html/);
  assert.match(adminDal, /sanitizeArticleBody/);
  assert.match(adminDal, /plainTextToArticleHtml/);
  assert.doesNotMatch(adminForm, /@\/lib\/news\/rich-text/);
  assert.doesNotMatch(news, /startsWith\(["']</);
});

test("the shared editor is SSR-safe and remains usable without JavaScript", () => {
  const packageJson = JSON.parse(read("../package.json"));
  for (const pkg of [
    "@tiptap/react",
    "@tiptap/pm",
    "@tiptap/starter-kit",
  ]) {
    assert.equal(packageJson.dependencies?.[pkg], "3.30.0");
  }
  assert.match(editor, /immediatelyRender:\s*false/);
  assert.match(editor, /<textarea/);
  assert.match(editor, /name=\{name\}/);
  assert.match(editor, /fallbackValue/);
  assert.match(editor, /name\s*\?\s*\(/);
  assert.match(editor, /defaultValue=\{fallbackValue \?\? initialValue\}/);
  assert.doesNotMatch(editor, /bodyInputRef/);
  assert.match(editor, /value=\{editorHtml\}/);
  assert.match(editor, /setEditorHtml\(html\)/);
  assert.match(editor, /<EditorContent/);
  assert.match(editor, /role="toolbar"/);
  assert.match(editor, /"aria-multiline":\s*"true"/);
  assert.match(editor, /aria-pressed/);
  assert.match(editor, /type="button"/);
  assert.match(editor, /min-h-\[44px\]/);
  assert.match(editor, /RICH_TEXT_COPY\.heading2/);
  assert.match(editor, /RICH_TEXT_COPY\.heading3/);
  assert.match(editor, /ArrowLeft/);
  assert.match(editor, /ArrowRight/);
  assert.match(editor, /tabIndex=\{index === toolbarIndex \? 0 : -1\}/);
  assert.match(editor, /event\.altKey && event\.key === "F10"/);
  assert.match(editor, /ctx\.defaultValidate\(url\)/);
  assert.doesNotMatch(editor, /Heading 1|Image|Video|Embed|Code block/);
  assert.match(publicForm, /<RichTextEditor/);
  assert.match(publicForm, /fallbackValue=\{state\.bodyFallback\}/);
  assert.match(adminForm, /<RichTextEditor/);
  assert.match(adminForm, /fallbackValue=\{article\?\.body \?\? ""\}/);
  const adminEditor = adminForm.slice(
    adminForm.indexOf("<RichTextEditor"),
    adminForm.indexOf("/>", adminForm.indexOf("<RichTextEditor")) + 2,
  );
  assert.doesNotMatch(adminEditor, /name=/);
  assert.match(publicAction, /bodyFallback:\s*safeBodyBeforeValidation\.text/);
  assert.match(publicAction, /ARTICLE_BODY_MAX_PUBLIC_HTML_LENGTH/);
  assert.match(publicAction, /ARTICLE_BODY_MAX_TEXT_LENGTH/);
  assert.match(globals, /\.rich-text-editor/);
  assert.match(globals, /\.rich-text-body/);
});

test("article submission states the public conduct boundary", () => {
  assert.match(site, /conduct:/);
  assert.match(site, /obscene content/i);
  assert.match(site, /vulgar language/i);
  assert.match(site, /hate speech/i);
  assert.match(publicForm, /copy\.conduct/);
  assert.match(site, /bodyTooLong:/);
  assert.match(site, /bodyEmpty:/);
  assert.match(site, /authorNameMax:/);
  assert.match(adminActions, /ADMIN_NEWS_COPY\.bodyTooLong/);
  assert.match(adminActions, /ADMIN_NEWS_COPY\.bodyEmpty/);
  assert.match(adminActions, /ADMIN_NEWS_COPY\.authorNameMax/);
  assert.match(adminForm, /ADMIN_NEWS_COPY\.optional/);
  const bodyAt = publicForm.indexOf("<RichTextEditor");
  const conductAt = publicForm.indexOf("copy.conduct");
  const submitAt = publicForm.indexOf("copy.submitLabel");
  assert.ok(bodyAt >= 0 && bodyAt < conductAt && conductAt < submitAt);
  assert.doesNotMatch(
    site.slice(site.indexOf("submission:"), site.indexOf("ADMIN_NEWS_COPY")),
    /—/,
  );
});
