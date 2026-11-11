import { ArrowRight } from "lucide-react";
import { Section } from "@/components/ui/Section";
import { Button } from "@/components/ui/Button";
import { RevealGroup, RevealItem, Reveal } from "@/components/ui/Reveal";
import { ArticleCard } from "@/components/news/ArticleCard";
import { getPublishedArticles } from "@/lib/news";
import { NEWS_SECTION } from "@/lib/content/site";

/** Latest three articles on Home (live table, or seed fallback). */
export async function NewsPreview() {
  const articles = await getPublishedArticles(3);
  if (articles.length === 0) return null;
  const spineRoles = articles.length === 3 ? ["left", "center", "right"] : [];

  return (
    <Section as="section" data-spine-news aria-labelledby="news-title">
      <div className="flex flex-col gap-8">
        <Reveal className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex flex-col gap-3">
            <p className="eyebrow">{NEWS_SECTION.eyebrow}</p>
            <h2 id="news-title" className="h2">
              {NEWS_SECTION.title}
            </h2>
          </div>
          <Button
            href={NEWS_SECTION.viewAll.href}
            variant="ghost"
            trailingIcon={
              <ArrowRight
                className="size-4 transition-transform group-hover:translate-x-0.5"
                strokeWidth={2}
                aria-hidden
              />
            }
          >
            {NEWS_SECTION.viewAll.label}
          </Button>
        </Reveal>

        <RevealGroup className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {articles.map((article, index) => (
            <RevealItem
              key={article.slug}
              {...(spineRoles[index]
                ? { "data-spine-news-card": spineRoles[index] }
                : {})}
            >
              <ArticleCard article={article} />
            </RevealItem>
          ))}
        </RevealGroup>
      </div>
    </Section>
  );
}
