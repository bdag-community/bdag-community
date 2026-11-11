import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";

const form = readFileSync(
  new URL("../src/components/admin/ArticleForm.tsx", import.meta.url),
  "utf8",
);

test("article save feedback receives focus after the server responds", () => {
  assert.match(form, /feedbackRef = useRef<HTMLParagraphElement>/);
  assert.match(form, /feedbackRef\.current\?\.focus\(\)/);
  assert.match(form, /\[feedback\]/);
  assert.match(form, /ref=\{feedbackRef\}/);
  assert.match(form, /tabIndex=\{-1\}/);
});
