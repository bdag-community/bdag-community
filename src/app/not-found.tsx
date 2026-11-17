import { Header } from "@/components/site/Header";
import { Footer } from "@/components/site/Footer";
import { NotFoundBody } from "@/components/site/NotFoundBody";

/**
 * The ROOT 404 — everything the (public) group never matches.
 *
 * Next only reaches a group's not-found.tsx for routes that resolve INTO that
 * group, so /news/<retired-slug> gets the group's one and a mistyped path like
 * /totaly-unmached got Next's stock white page instead: no header, no footer,
 * no way back, and nothing that looks like this site. This closes that.
 *
 * The chrome is assembled here rather than inherited, because a root
 * not-found renders inside the ROOT layout (html, body, fonts, tokens) and
 * never sees the (public) layout. It deliberately mirrors that layout: same
 * skip link, same header, same `main` with tabIndex={-1} so the skip link
 * moves focus in Safari, same footer.
 *
 * This page renders its content without scroll reveals or the chain animation.
 */
export default function RootNotFound() {
  return (
    <>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded-full focus:bg-gradient-accent focus:px-5 focus:py-2.5 focus:text-sm focus:font-semibold focus:text-on-primary"
      >
        Skip to content
      </a>
      <Header />
      <main
        id="main"
        tabIndex={-1}
        className="flex min-h-[60vh] flex-col gap-20 pb-4 pt-10 sm:gap-24"
      >
        <NotFoundBody />
      </main>
      <Footer />
    </>
  );
}
