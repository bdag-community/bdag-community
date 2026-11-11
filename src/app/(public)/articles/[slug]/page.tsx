import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Section } from "@/components/ui/Section";
import { Disclaimer } from "@/components/site/Disclaimer";
import { ArticleImage } from "@/components/news/ArticleImage";
import { RichTextBody } from "@/components/news/RichTextBody";
import { ShareRow } from "@/components/news/ShareRow";
import { getArticleBySlug, getPublishedArticles } from "@/lib/news";
import {
  ARTICLE_CATEGORIES,
  META_DESCRIPTIONS,
  NEWS_PAGE,
  NEWS_SECTION,
  SITE,
} from "@/lib/content/site";
import { JsonLd } from "@/components/seo/JsonLd";
import {
  breadcrumbSchema,
  newsArticleSchema,
} from "@/lib/seo/structured-data";

// Keep article HTML cacheable across readers and refresh it every ten minutes
// (or immediately after an admin write through the shared news cache tag).
export const revalidate = 600;

type Props = { params: Promise<{ slug: string }> };

export async function generateStaticParams() {
  const articles = await getPublishedArticles();
  return articles.map(({ slug }) => ({ slug }));
}

const dateFormat = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const article = await getArticleBySlug(slug);
  // A slug that resolves to nothing renders notFound(), but generateMetadata
  // runs first and still has to describe something — the index it came from.
  if (!article)
    return { title: NEWS_PAGE.eyebrow, description: META_DESCRIPTIONS.news };
  return {
    title: article.title,
    description: article.description,
    /**
     * An article is not a "website", and the difference is not cosmetic: an
     * og:type of article is what carries the publication date into a share
     * card and onto a news surface.
     *
     * Every shared field is restated here, and that repetition is load-bearing
     * rather than sloppy. Metadata from nested segments is merged SHALLOWLY —
     * a nested `openGraph` REPLACES the root layout's object outright, it does
     * not merge into it. Declaring only `type` and `publishedTime` therefore
     * silently dropped siteName, locale and url from every article's card,
     * which is the sort of regression nothing visible reveals. Anything added
     * to the root layout's openGraph has to be added here too.
     *
     * `url: "./"` resolves against the pathname being rendered, so it is this
     * article's own URL, matching the canonical the root layout emits.
     */
    openGraph: {
      type: "article",
      siteName: SITE.name,
      locale: "en_GB",
      url: "./",
      title: article.title,
      description: article.description,
      publishedTime: article.publishedAt,
      // Omitted rather than set empty when the article has no artwork, so
      // whatever default the segment provides still applies. NOT VERIFIED for
      // the no-image case: every article currently carries artwork, so the
      // fallback path has never actually rendered. Worst case is an article
      // card with no image, never a wrong one.
      ...(article.imageUrl ? { images: [article.imageUrl] } : {}),
    },
  };
}

/**
 * Single article — a quiet reading page: mono date, display title, subtitle
 * as the lede, optional image, then the body in a comfortable 68ch measure.
 * Ends on the shared non-affiliation disclaimer (every public surface).
 */
export default async function ArticlePage({ params }: Props) {
  const { slug } = await params;
  const article = await getArticleBySlug(slug);
  if (!article) notFound();

  return (
    <Section as="article" aria-labelledby="article-title">
      {/* NewsArticle: headline, publication date and byline as data. Article
          body HTML never enters the schema — only the fields the page header
          already renders. */}
      <JsonLd data={newsArticleSchema(article)} />
      <JsonLd
        data={breadcrumbSchema([
          { name: NEWS_PAGE.eyebrow, path: "/articles" },
          { name: article.title, path: `/articles/${article.slug}` },
        ])}
      />
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-8">
        <Link
          href="/articles"
          className="focus-ring inline-flex min-h-[44px] w-fit items-center gap-2 text-sm text-on-surface-variant transition-colors hover:text-accent-soft"
        >
          <ArrowLeft className="size-4" strokeWidth={2} aria-hidden />
          {NEWS_SECTION.viewAll.label}
        </Link>

        <header className="flex flex-col gap-4">
          {/* Same category-then-date line the cards wear, so the label the
              reader clicked through on is the label the article confirms. */}
          <p className="label-caps text-on-surface-variant">
            <span className="text-accent-soft">
              {ARTICLE_CATEGORIES[article.category]}
            </span>
            <span aria-hidden> · </span>
            <time dateTime={article.publishedAt}>
              {dateFormat.format(new Date(article.publishedAt))}
            </time>
          </p>
          <h1 id="article-title" className="h1">
            {article.title}
          </h1>
          {/* Provenance (2026-08-13): the moderation column decides the
              label, never the presence of a name — an admin article with a
              byline must not read as a community submission, and a nameless
              community submission must not read as admin. */}
          <p className="text-sm text-on-surface-variant">
            {article.submittedByCommunity ? (
              article.authorName ? (
                <>
                  {NEWS_PAGE.publishedByCommunity}{" "}
                  <span className="font-medium text-on-surface">
                    {article.authorName}
                  </span>
                </>
              ) : (
                NEWS_PAGE.publishedByCommunityAnon
              )
            ) : article.authorName ? (
              <>
                {NEWS_PAGE.publishedBy}{" "}
                <span className="font-medium text-on-surface">
                  {article.authorName}
                </span>
              </>
            ) : (
              NEWS_PAGE.publishedByAdmin
            )}
          </p>
          {article.subtitle ? <p className="lead">{article.subtitle}</p> : null}
        </header>

        <ArticleImage
          src={article.imageUrl}
          srcSet={article.imageSrcSet}
          alt={article.imageAlt}
          priority
          // The reading column is capped at max-w-3xl (768px), so the image
          // never renders wider than that however big the window gets.
          sizes="(min-width: 768px) 768px, 100vw"
          className="aspect-[16/9] rounded-2xl"
          markClassName="bottom-4 left-4 h-8"
        />

        <RichTextBody html={article.bodyHtml} plainText={article.body} />

        <ShareRow slug={article.slug} title={article.title} />

        <Disclaimer variant="banner" />
      </div>
    </Section>
  );
}
