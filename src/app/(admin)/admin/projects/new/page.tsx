import type { Metadata } from "next";
import Link from "next/link";
import { ProjectForm } from "@/components/admin/ProjectForm";
import { requireAdmin } from "@/lib/dal/session";

export const metadata: Metadata = {
  title: "New project · Admin",
  description: "Add a community project to BDAG Community.",
  // Never index an operator surface.
  robots: { index: false, follow: false },
};

/**
 * /admin/projects/new — add a project directly (a vetted project the admin
 * lists on the community's behalf). Saved unpublished until published from
 * the edit page.
 */
export default async function NewProjectPage() {
  await requireAdmin();

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <Link
          href="/admin/projects"
          className="focus-ring text-sm text-on-surface-variant transition-colors hover:text-accent-soft"
        >
          ← Projects
        </Link>
        <h1 className="h3 text-on-surface">New project</h1>
        <p className="text-sm text-on-surface-variant">
          Saved for review until you publish it from the edit page.
        </p>
      </header>

      <ProjectForm />
    </div>
  );
}
