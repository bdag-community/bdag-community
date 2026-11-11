import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { ArticleForm } from "@/components/admin/ArticleForm";
import { ArticleModerationPanel } from "@/components/admin/ArticleModerationPanel";
import { ConfirmDeleteButton } from "@/components/admin/ConfirmDeleteButton";
import { requireAdmin } from "@/lib/dal/session";
import { getArticleById } from "@/lib/dal/admin";
import { loadArticleAssetRuntimeConfig } from "@/lib/aws/article-asset-config.server";
import { deleteArticleAction } from "../actions";
import { ADMIN_NEWS_COPY } from "@/lib/content/site";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Edit article · Admin",
  description: "Edit a BDAG Community news article.",
  // Never index an operator surface.
  robots: { index: false, follow: false },
};

/**
 * /admin/news/[id] — edit or delete one article. requireAdmin()-gated; a
 * non-uuid id or a missing row 404s rather than erroring. Delete goes
 * through the two-step ConfirmDeleteButton into deleteArticleAction, which
 * redirects back to the dashboard.
 */
export default async function EditArticlePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();

  const { id } = await params;
  // Guard before the DB sees it: a non-uuid would be a Postgres type error.
  if (!z.string().uuid().safeParse(id).success) notFound();

  const article = await getArticleById(id);
  if (!article) notFound();

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <Link
          href="/admin"
          className="focus-ring text-sm text-on-surface-variant transition-colors hover:text-accent-soft"
        >
          ← Dashboard
        </Link>
        <h1 className="h3 text-on-surface">Edit article</h1>
        <p className="font-mono text-xs text-on-surface-variant">
          /articles/{article.slug}
        </p>
      </header>

      <ArticleForm article={article} />

      {/* The panel needs to know which environment's bucket THIS deployment
          reads, so it can say plainly when a cover lives in the other one
          instead of rendering a broken preview (both environments share one
          database but each has its own private S3 bucket). */}
      <ArticleModerationPanel
        article={article}
        runtimeStorageEnvironment={
          loadArticleAssetRuntimeConfig()?.storageEnvironment ?? null
        }
      />

      <section
        aria-label="Delete this article"
        className="flex max-w-2xl flex-wrap items-center justify-between gap-3 rounded-xl border border-error/30 p-4"
      >
        <p className="text-sm text-on-surface-variant">
          {article.is_published
            ? ADMIN_NEWS_COPY.assetModeration.deleteUnpublishFirst
            : ADMIN_NEWS_COPY.assetModeration.deleteDescription}
        </p>
        <ConfirmDeleteButton
          id={article.id}
          action={deleteArticleAction}
          label="Delete article"
          confirmPrompt="Delete this article and its managed images permanently?"
        />
      </section>
    </div>
  );
}
