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
 * Article card: image (or the DAG-mark placeholder art), category, publish
 * date, title,
 * subtitle, description. The whole card is one link; the inner heading keeps
 * the accessible name tight. <ArticleImage> carries the community mark, so a
 * shared card is recognisably ours wherever it lands.
 */
export function ArticleCard({ article }: { article: NewsArticleSummary }) {
  return (
    <Card interactive className="group/card relative flex h-full flex-col gap-4 p-4">
      <ArticleImage
        src={article.imageUrl}
        srcSet={article.imageSrcSet}
        alt={article.imageAlt}
        className="aspect-[16/9]"
      />

      <div className="flex flex-1 flex-col gap-2 px-1 pb-1">
        {/* Category then date, one label-caps line: the label answers "what
            kind of piece is this" before the reader commits to the title. */}
        <p className="label-caps text-on-surface-variant">
          <span className="text-accent-soft">
            {ARTICLE_CATEGORIES[article.category]}
          </span>
          <span aria-hidden> · </span>
          <time dateTime={article.publishedAt}>
            {dateFormat.format(new Date(article.publishedAt))}
          </time>
        </p>
        <h3 className="h4 text-on-surface">
          <Link
            href={`/articles/${article.slug}`}
            className="focus-ring after:absolute after:inset-0 after:rounded-2xl"
          >
            {article.title}
          </Link>
        </h3>
        {article.subtitle ? (
          <p className="text-sm font-medium text-accent-soft">
            {article.subtitle}
          </p>
        ) : null}
        <p className="line-clamp-3 text-sm leading-relaxed text-on-surface-variant">
          {article.description}
        </p>
      </div>
    </Card>
  );
}
