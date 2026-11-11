import Link from "next/link";
import type { NewsArticleSummary } from "@/lib/news";
import { ARTICLE_CATEGORIES } from "@/lib/content/site";
import { Card } from "@/components/ui/Card";
import { ArticleImage } from "@/components/news/ArticleImage";

const dateFormat = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

/**
 * Lead-story card for the top of /articles: the latest article set wide, image
 * beside text instead of the stacked ArticleCard. Same one-link cover pattern
 * as ArticleCard (the heading link covers the whole card); h2 keeps the page
 * heading order intact under the /articles h1.
 */
export function FeaturedArticle({ article }: { article: NewsArticleSummary }) {
  return (
    <Card
      interactive
      className="group/card relative grid gap-5 p-4 md:grid-cols-[1.15fr_1fr] md:gap-8 md:p-5"
    >
      <ArticleImage
        src={article.imageUrl}
        srcSet={article.imageSrcSet}
        alt={article.imageAlt}
        priority
        // The lead story runs full width on mobile and takes the wider half of
        // a 1.15fr/1fr split from md up, inside the 1440px site measure.
        sizes="(min-width: 1440px) 740px, (min-width: 768px) 52vw, 100vw"
        className="aspect-[16/9] md:aspect-auto md:min-h-[16rem]"
        markClassName="md:bottom-4 md:left-4 md:h-7"
      />

      <div className="flex flex-col justify-center gap-3 px-1 pb-1 md:py-2">
        <p className="label-caps text-on-surface-variant">
          <span className="text-accent-soft">
            {ARTICLE_CATEGORIES[article.category]}
          </span>
          <span aria-hidden> · </span>
          <time dateTime={article.publishedAt}>
            {dateFormat.format(new Date(article.publishedAt))}
          </time>
        </p>
        <h2 className="h3 text-on-surface">
          <Link
            href={`/articles/${article.slug}`}
            className="focus-ring after:absolute after:inset-0 after:rounded-2xl"
          >
            {article.title}
          </Link>
        </h2>
        {article.subtitle ? (
          <p className="text-sm font-medium text-accent-soft">
            {article.subtitle}
          </p>
        ) : null}
        <p className="line-clamp-3 text-sm leading-relaxed text-on-surface-variant md:line-clamp-4">
          {article.description}
        </p>
      </div>
    </Card>
  );
}
