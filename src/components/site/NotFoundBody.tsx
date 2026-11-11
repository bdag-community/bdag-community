import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Section } from "@/components/ui/Section";
import { Button } from "@/components/ui/Button";
import { NAV_LINKS, NOT_FOUND_PAGE } from "@/lib/content/site";

/**
 * The 404 body, shared by both not-found routes.
 *
 * There are two, and they catch different things. The one inside the (public)
 * group catches /news/<retired-slug> — the realistic case, since news/[slug]
 * calls notFound() — and inherits the header, footer and skip link from that
 * group's layout. The ROOT one catches everything the group never matches, and
 * has to supply that chrome itself. The page they render is the same page, so
 * it lives here rather than in two files that would drift.
 *
 * It opens the way the real pages open — eyebrow, h1 at a 22ch measure,
 * lead, all left-aligned — because arriving at a mistake should still look
 * like arriving at this site.
 */
const ROW =
  "group flex items-center justify-between gap-3 rounded-xl border border-border/60 " +
  "bg-container/40 px-4 py-3 text-sm text-on-surface transition-colors " +
  "hover:border-accent/40 hover:text-accent-soft " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent " +
  "focus-visible:ring-offset-2 focus-visible:ring-offset-base-void";

export function NotFoundBody() {
  return (
    <Section
      as="section"
      aria-labelledby="not-found-title"
      className="flex flex-col gap-10"
    >
      <div className="flex flex-col items-start gap-4">
        <p className="eyebrow animate-fade-in">{NOT_FOUND_PAGE.eyebrow}</p>
        <h1 id="not-found-title" className="h1 max-w-[22ch] animate-fade-up">
          {NOT_FOUND_PAGE.title}
        </h1>
        <p className="lead animate-fade-up [animation-delay:150ms]">
          {NOT_FOUND_PAGE.intro}
        </p>
      </div>

      <nav aria-label={NOT_FOUND_PAGE.linksTitle} className="flex flex-col gap-4">
        <h2 className="label-caps">{NOT_FOUND_PAGE.linksTitle}</h2>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {NAV_LINKS.filter((link) => link.href !== "/").map((link) => (
            <li key={link.href}>
              <Link href={link.href} className={ROW}>
                {link.label}
                <ArrowRight
                  className="size-4 shrink-0 text-accent-soft"
                  strokeWidth={2}
                  aria-hidden
                />
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <div>
        <Button href="/">{NOT_FOUND_PAGE.home}</Button>
      </div>
    </Section>
  );
}
