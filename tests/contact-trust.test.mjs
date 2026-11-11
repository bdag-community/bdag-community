import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";

const read = (rel) => readFileSync(new URL(rel, import.meta.url), "utf8");
const site = read("../src/lib/content/site.ts");
const contactCopy = site.slice(
  site.indexOf("export const CONTACT_PAGE"),
  site.indexOf("} as const;", site.indexOf("export const CONTACT_PAGE")),
);

test("the verified community email is presented as an official contact route", () => {
  assert.match(site, /CONTACT_EMAIL\s*=\s*"hello@bdag\.community"/);
  assert.match(site, /CONTACT_EMAIL_MOCK:\s*boolean\s*=\s*false/);

  for (const rel of [
    "../src/app/(public)/contact/page.tsx",
    "../src/components/contact/ContactForm.tsx",
    "../src/components/site/Footer.tsx",
  ]) {
    const source = read(rel);
    assert.match(source, /CONTACT_EMAIL_MOCK/, rel + " must honour the mock flag.");
  }
});

test("contact copy does not promise an operator or a placeholder fallback", () => {
  assert.doesNotMatch(contactCopy, /will pick it up/i);
  assert.doesNotMatch(contactCopy, /we read everything/i);
  assert.doesNotMatch(contactCopy, /channels below instead/i);
  assert.match(contactCopy, /Never send a seed phrase/i);
  assert.match(contactCopy, /used only to review and respond/i);
  assert.doesNotMatch(contactCopy, /email address is being verified/i);
});

test("the form renders its privacy and secret-safety guidance", () => {
  const form = read("../src/components/contact/ContactForm.tsx");
  assert.match(form, /CONTACT_PAGE\.form\.privacy/);
  assert.match(form, /CONTACT_PAGE\.form\.safety/);
});
