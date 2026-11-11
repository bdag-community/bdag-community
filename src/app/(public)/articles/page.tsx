import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Newspaper } from "lucide-react";
import { Section } from "@/components/ui/Section";
import { PageHero } from "@/components/site/PageHero";
import { NewsArt } from "@/components/site/PageHeroArt";
import { Card } from "@/components/ui/Card";
import { Reveal, RevealGroup, RevealItem } from "@/components/ui/Reveal";
import { Disclaimer } from "@/components/site/Disclaimer";
import { ArticleCard } from "@/components/news/ArticleCard";
import { FeaturedArticle } from "@/components/news/FeaturedArticle";
import { Button } from "@/components/ui/Button";
import { getPublishedArticles } from "@/lib/news";
import {
  CHAIN_PAGE,
  COMMUNITY_PAGE,
  HERO,
  META_DESCRIPTIONS,
  NEWS_PAGE,
} from "@/lib/content/site";

export const metadata: Metadata = {
  title: NEWS_PAGE.eyebrow,
  // Not the intro: a result snippet is read before the reader has chosen the
  // page, so it gets its own purpose-written line (site.ts META_DESCRIPTIONS).
  description: META_DESCRIPTIONS.news,
};

// Public news is safe to share across readers because its data client is
// cookie-free and RLS exposes published rows only.
export const revalidate = 600;

/**
 * Where a reader goes when there is nothing new to read.
 *
 * /news is the one page whose content can legitimately be empty, and it is
 * also the page most likely to be reached from a shared link months after the
 * article that was shared. Both cases need somewhere to go, so the pair is
 * rendered whether or not there are articles.
 *
 * Every string is site.ts's. The bodies are the two routes' search
 * descriptions rather than their intros because an intro is written to be
 * read *on* its own page — both say "this page", which is false here.
 */
const READ_NEXT = [
  {
    title: CHAIN_PAGE.title,
    body: META_DESCRIPTIONS.chain,
    more: HERO.ctaSecondary,
  },
  {
    // The SUBTITLE, not the title: CHAIN_PAGE.title beside it is a full
    // sentence, and Community's title is now the single display word "Community",
    // which would read as a label next to a claim.
    title: COMMUNITY_PAGE.subtitle,
    body: META_DESCRIPTIONS.community,
    more: HERO.ctaPrimary,
  },
] as const;

/**
 * News index — the latest article leads wide (FeaturedArticle), the rest sit
 * in the familiar card grid. With no articles at all the page stays honest
 * with the NEWS_PAGE.empty state instead of an empty grid, and the two
 * cross-links below it mean an empty page is still a way into the site.
 *
 * The intro opens in the same three beats as the other six pages: eyebrow
 * fades in, headline rises, lead follows 150ms behind.
 */
export default async function NewsPage() {
  const [featured, ...rest] = await getPublishedArticles();

  return (
    <>
      {/* ------------------------------- Hero ------------------------------- */}
      <Section as="section" aria-labelledby="articles-title">
        <PageHero
          titleId="articles-title"
          title={NEWS_PAGE.title}
          subtitle={NEWS_PAGE.subtitle}
          intro={NEWS_PAGE.intro}
          art={<NewsArt />}
          label="articles"
        />
      </Section>

      {/* ----------------------------- Articles ----------------------------- */}
      <Section>
        <Reveal className="mb-8 flex flex-col items-start justify-between gap-4 border-b border-border/60 pb-6 sm:flex-row sm:items-center">
          <p className="body max-w-[58ch]">{NEWS_PAGE.submission.invitation}</p>
          <Button href={NEWS_PAGE.submission.cta.href} className="shrink-0">
            {NEWS_PAGE.submission.cta.label}
          </Button>
        </Reveal>
        {featured ? (
          <div className="flex flex-col gap-5">
            <Reveal>
              <FeaturedArticle article={featured} />
            </Reveal>
            {rest.length > 0 ? (
              <RevealGroup className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
                {rest.map((article) => (
                  <RevealItem key={article.slug}>
                    <ArticleCard article={article} />
                  </RevealItem>
                ))}
              </RevealGroup>
            ) : null}
          </div>
        ) : (
          /* The empty state is a card, not a dashed box: an archive waiting for
             its first entry is a normal state of this site, not a fault. The
             ringed mark is the staking numeral's treatment, so the shape is
             one the reader has already seen. */
          <Reveal>
            <Card className="flex flex-col items-start gap-4 p-6 sm:p-8">
              <span
                aria-hidden
                className="flex size-10 items-center justify-center rounded-full border border-border-strong bg-elevated"
              >
                <Newspaper
                  className="size-5 text-accent-soft"
                  strokeWidth={1.75}
                />
              </span>
              <p className="lead max-w-[46ch]">{NEWS_PAGE.empty}</p>
            </Card>
          </Reveal>
        )}
      </Section>

      {/* --------------------------- Cross-links ---------------------------- */}
      <Section as="section" aria-label="Where to go next">
        <RevealGroup className="grid gap-5 lg:grid-cols-2">
          {READ_NEXT.map((next) => (
            <RevealItem key={next.more.href}>
              <Card
                interactive
                className="relative flex h-full flex-col items-start gap-2.5 p-6 sm:p-8"
              >
                {/* Whole card is one link (the ArticleCard pattern): the
                    heading link stretches over the card via after:inset-0. */}
                <h2 className="h3">
                  <Link
                    href={next.more.href}
                    className="focus-ring after:absolute after:inset-0 after:rounded-2xl"
                  >
                    {next.title}
                  </Link>
                </h2>
                <p className="body">{next.body}</p>
                <p className="mt-auto inline-flex items-center gap-1.5 pt-4 text-sm font-medium text-accent-soft">
                  {next.more.label}
                  <ArrowRight className="size-4" strokeWidth={2} aria-hidden />
                </p>
              </Card>
            </RevealItem>
          ))}
        </RevealGroup>
      </Section>

      {/* ------------------------------ Legal ------------------------------- */}
      {/* The disclaimer renders on every public surface. /news was the one
          route that did not have it, and the test that enforces the rule had
          the same hole. Both are closed now. */}
      <Section as="section" aria-label="Legal">
        <Disclaimer variant="banner" />
      </Section>
    </>
  );
}
