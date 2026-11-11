import type { MetadataRoute } from "next";
import { META_DESCRIPTIONS, SITE } from "@/lib/content/site";

/**
 * Web app manifest — the PWA basics. Installed displays run standalone
 * (no browser chrome), which also sidesteps the in-browser URL-bar height
 * squeeze on the home hero. Colours match the viewport themeColor in
 * layout.tsx (base-void), so the installed splash and title bar sit on the
 * same surface the site paints.
 *
 * Icons: the plain pair keeps icon.svg's rounded corners; the maskable one
 * is full-bleed with the mark held inside the safe zone, so launchers that
 * crop to circles or squircles never clip the mark.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: SITE.name,
    short_name: "BDAG",
    description: META_DESCRIPTIONS.home,
    start_url: "/",
    display: "standalone",
    background_color: "#0e0715",
    theme_color: "#0e0715",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      {
        src: "/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
