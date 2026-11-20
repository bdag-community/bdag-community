import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, ChevronDown } from "lucide-react";
import { Section } from "@/components/ui/Section";
import { PageHero } from "@/components/site/PageHero";
import { FaqArt } from "@/components/site/PageHeroArt";
import { RevealGroup, RevealItem } from "@/components/ui/Reveal";
import { Disclaimer } from "@/components/site/Disclaimer";
import { FaqHashSync, FaqPermalink } from "@/components/faq/FaqDeepLink";
import { cn } from "@/lib/utils/cn";
import { FAQ_PAGE, META_DESCRIPTIONS } from "@/lib/content/site";
import { JsonLd } from "@/components/seo/JsonLd";
import { breadcrumbSchema, faqPageSchema } from "@/lib/seo/structured-data";

export const metadata: Metadata = {
  title: "FAQ",
  description: META_DESCRIPTIONS.faq,
};

/**
 * FAQ — the questions the community actually fields, each answer ending at
 * the page that evidences it.
 *
 * Native <details>/<summary> disclosure, deliberately: a server component
 * whose answers ship in the DOM (findable by in-page search, present with no
 * JS), with open/closed state that costs nothing to keep. The chevron follows
 * the element's own `open` attribute via group-open, so there is no state to
 * desynchronise. Named group (group/item) because the related link inside the
 * panel carries the house `group` class for its arrow nudge, and the two must
 * not hear each other's hovers; the optional nested "full explanation" uses a
 * second named group (group/more) for the same reason.
 *
 * The only client code is FaqDeepLink, a small progressive-enhancement island:
 * it opens the question named in the URL hash on load, and mirrors the open
 * question back into the address bar so a reader can copy a link that lands on
 * that answer. With JS off, every answer still expands and every anchor still
 * resolves; the URL simply stops following along.
 *
 * Weighed and accepted: an h2 inside <summary> is exposed inconsistently as
 * a heading by some AT and browser pairings (summary maps to a button-like
 * role, and a few combinations flatten the nested heading). The questions
 * stay focusable, named, and announced expanded or collapsed everywhere,
 * which is the part the page cannot do without; the alternative (APG
 * accordion, h2 > button[aria-expanded]) buys reliable heading navigation
 * at the price of the client bundle and hand-rolled state this page was
 * built to avoid. Print: closed details would print the questions and no
 * answers, so the print block in globals.css forces details content
 * visible and hides the chevron.
 */
export default function FaqPage() {
  return (
    <>
      {/* Structured data uses the same questions and answers as the page. */}
      <JsonLd data={faqPageSchema()} />
      <JsonLd data={breadcrumbSchema([{ name: "FAQ", path: "/faq" }])} />

      {/* ------------------------------- Hero ------------------------------- */}
      <Section as="section" aria-labelledby="faq-title">
        <PageHero
          titleId="faq-title"
          title={FAQ_PAGE.title}
          subtitle={FAQ_PAGE.subtitle}
          intro={FAQ_PAGE.intro}
          art={<FaqArt />}
          label="answers"
        />
      </Section>

      {/* ---------------------------- The answers ---------------------------- */}
      <Section as="section" aria-label="Questions and answers">
        {/* Opens the question named in the URL hash and keeps the address bar
            in step with what is open. Renders nothing. */}
        <FaqHashSync />
        <RevealGroup className="flex max-w-3xl flex-col" stagger={0.06}>
          {FAQ_PAGE.items.map((item, i) => {
            // long lives on only some items; read it without narrowing the
            // as-const union member by member.
            const long =
              (item as { long?: readonly string[] }).long ?? [];
            return (
              <RevealItem
                key={item.id}
                className={cn(i > 0 && "border-t border-border/60")}
              >
                <details
                  id={item.id}
                  data-faq="question"
                  className="group/item scroll-mt-24"
                >
                  <summary className="focus-ring flex cursor-pointer list-none items-center justify-between gap-4 py-5 [&::-webkit-details-marker]:hidden">
                    <h2 className="h4">{item.q}</h2>
                    <ChevronDown
                      className="size-5 shrink-0 text-outline transition-transform group-open/item:rotate-180"
                      strokeWidth={1.75}
                      aria-hidden
                    />
                  </summary>
                  <div className="flex flex-col items-start gap-4 pb-6">
                    <p className="body">{item.a}</p>

                    {long.length > 0 && (
                      <details className="group/more w-full">
                        <summary className="focus-ring inline-flex cursor-pointer list-none items-center gap-1.5 text-sm font-medium text-accent-soft [&::-webkit-details-marker]:hidden">
                          <ChevronDown
                            className="size-4 shrink-0 transition-transform group-open/more:rotate-180"
                            strokeWidth={2}
                            aria-hidden
                          />
                          <span className="group-open/more:hidden">
                            Read the full explanation
                          </span>
                          <span className="hidden group-open/more:inline">
                            Show less
                          </span>
                        </summary>
                        <div className="mt-3 flex flex-col gap-3 border-l border-border/60 pl-4">
                          {long.map((para, j) => (
                            <p key={j} className="body text-on-surface-variant">
                              {para}
                            </p>
                          ))}
                        </div>
                      </details>
                    )}

                    <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
                      <Link
                        href={item.more.href}
                        className="focus-ring group inline-flex items-center gap-1.5 text-sm font-medium text-accent-soft"
                      >
                        {item.more.label}
                        <ArrowRight
                          className="size-4 transition-transform group-hover:translate-x-0.5"
                          strokeWidth={2}
                          aria-hidden
                        />
                      </Link>
                      <FaqPermalink id={item.id} />
                    </div>
                  </div>
                </details>
              </RevealItem>
            );
          })}
        </RevealGroup>
      </Section>

      {/* The legal close uses the same prominent trust treatment as Home,
          because two of the answers touch money. */}
      <Section as="section" aria-label="Legal">
        <Disclaimer variant="banner" />
      </Section>
    </>
  );
}
