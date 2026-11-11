import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";

const read = (rel) => readFileSync(new URL(rel, import.meta.url), "utf8");

test("ArcGauge keeps one accessible reading outside the forced-colors drawing", () => {
  const gauge = read("../src/components/chain/ArcGauge.tsx");
  const vizAt = gauge.indexOf('"viz relative mx-auto w-full"');
  assert.ok(vizAt > -1, "ArcGauge must keep the .viz drawing wrapper");

  const readings = [...gauge.matchAll(/<(?:span|svg)\b[\s\S]*?role="img"[\s\S]*?>/g)];
  assert.equal(
    readings.length,
    1,
    "the gauge must expose exactly one role=img reading",
  );
  assert.match(
    readings[0][0],
    /^<span\b/,
    "the accessible reading must not be the SVG hidden by forced-colors",
  );
  assert.ok(
    readings[0].index < vizAt,
    "the accessible reading must live outside .viz so forced-colors cannot hide it",
  );
  assert.match(
    readings[0][0],
    /aria-label=\{`\$\{label\}\. \$\{description\}`\}/,
    "the one reading must carry both the gauge label and its current value",
  );

  const svgTag = gauge.match(/<svg\b[\s\S]*?>/)?.[0] ?? "";
  assert.match(svgTag, /aria-hidden/, "the painted SVG must be decorative");
  assert.match(svgTag, /focusable="false"/, "the decorative SVG must not take focus");
  assert.doesNotMatch(svgTag, /role="img"|aria-label(?:ledby)?=/);

  const fallbackTag =
    gauge.match(/<dl\s+className="viz-fallback sr-only"[^>]*>/)?.[0] ?? "";
  assert.match(
    fallbackTag,
    /aria-hidden/,
    "the sighted forced-colors fallback must not duplicate the persistent reading",
  );
});

test("ContactForm moves focus to its success panel after submission", () => {
  const form = read("../src/components/contact/ContactForm.tsx");

  assert.match(form, /const successRef = useRef<HTMLDivElement>\(null\)/);
  const focusStatement =
    "if (state.ok === true) successRef.current?.focus();";
  const focusAt = form.indexOf(focusStatement);
  assert.ok(
    focusAt > -1,
    "a successful state transition must explicitly focus the replacement panel",
  );
  assert.match(
    form.slice(focusAt, focusAt + 100),
    /\}, \[state\.ok\]\);/,
    "the success-focus effect must follow the successful state transition",
  );

  const successPanel = form.slice(
    form.indexOf("if (state.ok === true)"),
    form.indexOf("return (\n    <form"),
  );
  assert.match(successPanel, /ref=\{successRef\}/);
  assert.match(successPanel, /role="status"/);
  assert.match(successPanel, /tabIndex=\{-1\}/);
});

test("ContactForm keeps focus on a failed storage result", () => {
  const form = read("../src/components/contact/ContactForm.tsx");
  assert.match(form, /const failureRef = useRef<HTMLDivElement>\(null\)/);
  assert.match(
    form,
    /if \(state\.ok === false\) failureRef\.current\?\.focus\(\)/,
  );

  const failurePanel = form.slice(
    form.indexOf("state.ok === false"),
    form.indexOf("<Button", form.indexOf("state.ok === false")),
  );
  assert.match(failurePanel, /ref=\{failureRef\}/);
  assert.match(failurePanel, /tabIndex=\{-1\}/);
});
