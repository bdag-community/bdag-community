import type { Metadata } from "next";
import Link from "next/link";
import { ArticleForm } from "@/components/admin/ArticleForm";
import { requireAdmin } from "@/lib/dal/session";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "New article · Admin",
  description: "Write a new BDAG Community news article.",
  // Never index an operator surface.
  robots: { index: false, follow: false },
};

/**
 * /admin/news/new — create an article. requireAdmin()-gated; the form posts
 * to createArticleAction, which redirects to the edit page on success.
 */
export default async function NewArticlePage() {
  await requireAdmin();

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <Link
          href="/admin"
          className="focus-ring text-sm text-on-surface-variant transition-colors hover:text-accent-soft"
        >
          ← Dashboard
        </Link>
        <h1 className="h3 text-on-surface">New article</h1>
        <p className="text-sm text-on-surface-variant">
          Save a private draft, with an optional cover image. Review the cover and publish on the next page.
        </p>
      </header>

      <ArticleForm />
    </div>
  );
}
