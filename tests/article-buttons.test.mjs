import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { sanitizeArticleBody } from "../src/lib/news/rich-text.ts";
import { validateArticleButton } from "../src/lib/news/article-button.ts";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

test("button fields trim input and require a bounded label and web or internal URL", () => {
  assert.deepEqual(validateArticleButton(" Read guide ", " /guides/staking-v2 "), { ok: true, label: "Read guide", href: "/guides/staking-v2" });
  for (const text of ["", " ", "x".repeat(121)]) assert.deepEqual(validateArticleButton(text, "/guides"), { ok: false, field: "label" });
  for (const href of ["", "guides", "https://", "/ guide", "https://example.com/\nscript", "javascript:alert(1)", "//example.com", "/\\example.com", "https://u:p@example.com", "https://example.com/" + "a".repeat(2048)]) {
    assert.deepEqual(validateArticleButton("Read", href), { ok: false, field: "href" });
  }
  assert.deepEqual(validateArticleButton("Read", "https://example.com/a?b=1#c"), { ok: true, label: "Read", href: "https://example.com/a?b=1#c" });
});

test("article buttons survive save, public rendering and reopening with safe new-tab attributes", () => {
  for (const href of ["/guides/staking-v2", "https://example.com/learn?from=article", "#next"]) {
    const input = `<p>Before</p><a data-article-button="true" href="${href}">Read the guide</a><p>After</p>`;
    const saved = sanitizeArticleBody(input);
    assert.match(saved.html, /data-article-button="true"/);
    assert.match(saved.html, /target="_blank"/);
    assert.match(saved.html, /rel="noopener noreferrer"/);
    assert.ok(saved.html.includes(`href="${href}"`));
    assert.equal(saved.text, "Before\nRead the guide\nAfter");
    assert.deepEqual(sanitizeArticleBody(saved.html), saved);
  }
});

test("button links cannot carry executable schemes, arbitrary styling or opener access", () => {
  for (const href of ["javascript:alert(1)", "data:text/html,unsafe", "//evil.test", "/\\evil.test", "mailto:a@example.com", "https://user:password@example.com"]) {
    const saved = sanitizeArticleBody(`<a data-article-button="true" href="${href}" target="_self" rel="opener" class="evil" style="position:fixed" onclick="alert(1)">Read</a>`);
    assert.doesNotMatch(saved.html, /data-article-button|href=|target=|rel=|class=|style=|onclick/);
    assert.equal(saved.text, "Read");
  }
  const safe = sanitizeArticleBody('<a data-article-button="true" href="/guides" target="_self" rel="opener" class="evil" style="position:fixed">Read</a>');
  assert.doesNotMatch(safe.html, /_self|opener"|class=|style=/);
  assert.match(safe.html, /target="_blank"/);
  assert.match(safe.html, /rel="noopener noreferrer"/);
  assert.equal(sanitizeArticleBody('<a href="/guides" target="_blank" class="button">Ordinary link</a>').html, '<a href="/guides">Ordinary link</a>');
});

test("both authoring paths expose the same button controls without an admin-only flag", () => {
  for (const path of ["../src/components/news/CommunityArticleForm.tsx", "../src/components/admin/ArticleForm.tsx"]) {
    assert.match(read(path), /<RichTextEditor/);
  }
  const editor = read("../src/components/news/RichTextEditor.tsx");
  assert.match(editor, /ArticleButton/);
  assert.match(editor, /RICH_TEXT_COPY\.buttonText/);
  assert.match(editor, /RICH_TEXT_COPY\.buttonUrl/);
  assert.match(editor, /RICH_TEXT_COPY\.removeButton/);
  assert.match(editor, /validateArticleButton/);
  assert.match(editor, /handleDOMEvents:[\s\S]*click:[\s\S]*closest\('[^']*data-article-button/);
  assert.doesNotMatch(editor, /isAdmin|adminOnly/);
  assert.match(read("../src/app/globals.css"), /a\[data-article-button="true"\]/);
});
