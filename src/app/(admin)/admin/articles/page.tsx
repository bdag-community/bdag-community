import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { requireAdmin } from "@/lib/dal/session";
import { listAllArticles } from "@/lib/dal/admin";
import { ADMIN_NEWS_COPY, ARTICLE_CATEGORIES } from "@/lib/content/site";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Articles · Admin",
  description: "Manage BDAG Community articles.",
  // Never index an operator surface.
  robots: { index: false, follow: false },
};

/** UTC render for operator timestamps — no locale ambiguity between admins. */
const formatUtc = (iso: string): string => {
  const utc = new Date(iso).toISOString();
  return `${utc.slice(0, 10)} ${utc.slice(11, 16)} UTC`;
};

/**
 * /admin/articles — every article, drafts included, moved out of the
 * dashboard into its own area view. Each row opens the /admin/news editor.
 */
export default async function AdminArticlesPage() {
  await requireAdmin();
  const articles = await listAllArticles();

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <h1 className="h3 text-on-surface">Articles</h1>
          <p className="text-sm text-on-surface-variant">
            Every article, drafts included. Rows open the editor.
          </p>
        </div>
        <Button href="/admin/news/new">New article</Button>
      </header>

      {articles.length === 0 ? (
        <Card>
          <p className="text-sm text-on-surface-variant">
            No database articles yet. The original code-managed articles
            remain public, but are not editable here.
          </p>
        </Card>
      ) : (
        <Card className="max-w-3xl divide-y divide-border/60 p-0">
          {articles.map((article) => (
            <Link
              key={article.id}
              href={`/admin/news/${article.id}`}
              className="block rounded-2xl p-4 transition-colors hover:bg-accent/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-base-void"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-medium text-on-surface">
                  {article.title}
                </span>
                <span className="flex flex-wrap items-center justify-end gap-2">
                  <Chip className="border-border bg-transparent text-on-surface-variant">
                    {ARTICLE_CATEGORIES[
                      article.category as keyof typeof ARTICLE_CATEGORIES
                    ] ?? ARTICLE_CATEGORIES.news}
                  </Chip>
                  {article.submitted_by_community ? (
                    <Chip className="border-accent/40 bg-accent/5 text-accent-soft">
                      {ADMIN_NEWS_COPY.communitySubmission}
                    </Chip>
                  ) : null}
                  {article.is_published ? (
                    <Chip>Published</Chip>
                  ) : (
                    <Chip className="border-border bg-transparent text-on-surface-variant">
                      Draft
                    </Chip>
                  )}
                </span>
              </div>
              <p className="mt-1 flex flex-wrap gap-x-3 font-mono text-xs text-on-surface-variant">
                <span>/articles/{article.slug}</span>
                {article.published_at && (
                  <span>{formatUtc(article.published_at)}</span>
                )}
              </p>
            </Link>
          ))}
        </Card>
      )}
    </div>
  );
}
