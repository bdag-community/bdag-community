import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";

const read = (rel) => readFileSync(new URL(rel, import.meta.url), "utf8");

/**
 * PWA basics: a web app manifest (app/manifest.ts, emitted by Next as
 * /manifest.webmanifest and auto-linked), installable icons, and colours
 * that agree with the surface the site actually paints. Standalone display
 * is the point — an installed app has no browser chrome, which also
 * sidesteps the URL-bar height squeeze on the home hero.
 */

test("the web app manifest carries the PWA basics", () => {
  const manifest = read("../src/app/manifest.ts");
  assert.match(manifest, /display: "standalone"/);
  assert.match(manifest, /start_url: "\/"/);
  // One name source: SITE, never a second literal that can drift.
  assert.match(manifest, /name: SITE\.name/);
  // Splash and title bar sit on base-void, and must agree with the viewport
  // themeColor in layout.tsx (case aside, it is the same colour).
  assert.match(manifest, /background_color: "#0e0715"/i);
  assert.match(manifest, /theme_color: "#0e0715"/i);
  const layout = read("../src/app/layout.tsx");
  assert.match(layout, /themeColor: "#0E0715"/i);
});

test("every icon the manifest names ships, plus the apple touch icon", () => {
  const manifest = read("../src/app/manifest.ts");
  for (const icon of [
    "icon-192.png",
    "icon-512.png",
    "icon-maskable-512.png",
  ]) {
    assert.match(manifest, new RegExp(icon.replace(/\./g, "\\.")));
    assert.ok(
      existsSync(new URL(`../public/${icon}`, import.meta.url)),
      `${icon} must ship in public/`,
    );
  }
  // Launchers that crop to circles need a full-bleed icon with the mark in
  // the safe zone; the manifest must say which one that is.
  assert.match(manifest, /purpose: "maskable"/);
  // iOS ignores the manifest icons; the apple touch icon is the file-based
  // app/apple-icon.png convention, auto-linked by Next.
  assert.ok(
    existsSync(new URL("../src/app/apple-icon.png", import.meta.url)),
    "apple-icon.png must ship in src/app/",
  );
});
