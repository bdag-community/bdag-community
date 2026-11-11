import type { Metadata, Viewport } from "next";
import { Poppins, Inter, Geist_Mono } from "next/font/google";
import "./globals.css";
import { META_DESCRIPTIONS, SITE } from "@/lib/content/site";
import { JsonLd } from "@/components/seo/JsonLd";
import { organizationSchema, websiteSchema } from "@/lib/seo/structured-data";

// Display face: Poppins — the free stand-in for Gilroy (the Hiveon look).
// If a Gilroy webfont license is purchased, swap this import + the
// --font-display variable's source; nothing else changes.
//
// 600 and 700 only. Every display rule in globals.css is font-semibold or
// font-bold (.display, .h1-.h3 bold, .h3/.h4 semibold), and so is every
// hand-rolled font-display use left in the tree — 400 and 500 were downloaded
// AND render-priority preloaded on every page to style nothing at all.
const displayFace = Poppins({
  subsets: ["latin"],
  weight: ["600", "700"],
  variable: "--font-display",
  display: "swap",
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

// Data face: Geist Mono (2026-08-06, replacing JetBrains Mono) — same
// tabular digits for jitter-free live numerals, with a cleaner, less
// IDE-flavoured voice for eyebrows and labels.
const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

/**
 * Site-wide metadata defaults.
 *
 * Two things are load-bearing here and neither is obvious:
 *
 * 1. `canonical: "./"` and `openGraph.url: "./"`. A leading "./" is resolved
 *    against the PATHNAME BEING RENDERED, not against metadataBase — so this
 *    one declaration emits a correct per-route canonical for every public
 *    routes without every page file having to repeat itself, and any page that
 *    genuinely needs a different one just sets its own `alternates`.
 *    An absolute "/" here would have pointed every page at the home page,
 *    which is worse than having no canonical at all.
 *
 * 2. `openGraph` carries NO title and NO description on purpose. Next fills
 *    both from each route's own resolved metadata when openGraph omits them,
 *    so /mining gets "Mining · BDAG Community" and its own description. Naming
 *    them here would have frozen home's copy onto every share card.
 *
 * `twitter.card` is the only Twitter field set: title, description and image
 * all auto-fill from openGraph. The image itself is app/opengraph-image.tsx,
 * picked up as a file-based default for every route.
 */
export const metadata: Metadata = {
  metadataBase: new URL(SITE.url),
  title: {
    default: SITE.name,
    template: `%s · ${SITE.name}`,
  },
  description: META_DESCRIPTIONS.home,
  applicationName: SITE.name,
  alternates: { canonical: "./" },
  openGraph: {
    type: "website",
    siteName: SITE.name,
    locale: "en_GB",
    url: "./",
  },
  twitter: { card: "summary_large_image" },
};

/**
 * themeColor matches base-void so the iOS/Android browser chrome goes dark;
 * viewportFit=cover makes env(safe-area-inset-*) resolve non-zero so the
 * header/drawer/footer can pad around the notch + home indicator.
 */
export const viewport: Viewport = {
  themeColor: "#0E0715",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${displayFace.variable} ${inter.variable} ${geistMono.variable}`}
    >
      {/* No provider tree: v1 ships no wallet stack and no client query layer —
          pages fetch through server routes and plain fetch(). */}
      <body className="font-sans antialiased">
        {/* The publisher entity, declared once for the whole site. Every other
            JSON-LD node on every page references it by @id rather than
            re-declaring it, so there is exactly one Organization to resolve —
            and it is the one that says, in a field, that this site is not the
            official project. */}
        <JsonLd data={organizationSchema()} />
        <JsonLd data={websiteSchema()} />
        {children}
      </body>
    </html>
  );
}
