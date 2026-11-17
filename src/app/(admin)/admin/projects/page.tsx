import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { requireAdmin } from "@/lib/dal/session";
import { listAllProjects } from "@/lib/dal/admin-projects";
import {
  ADMIN_PROJECTS_COPY,
  PROJECT_CATEGORIES,
} from "@/lib/content/site";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Projects · Admin",
  description: "Vet and publish community projects.",
  // Never index an operator surface.
  robots: { index: false, follow: false },
};

/** UTC render for operator timestamps — no locale ambiguity between admins. */
const formatUtc = (iso: string): string => {
  const utc = new Date(iso).toISOString();
  return `${utc.slice(0, 10)} ${utc.slice(11, 16)} UTC`;
};

/**
 * /admin/projects — every community project, submissions included. A
 * community entry that is not yet published is a submission waiting for
 * vetting, so it wears "For review" rather than "Draft".
 */
export default async function AdminProjectsPage() {
  await requireAdmin();
  const projects = await listAllProjects();

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <h1 className="h3 text-on-surface">Projects</h1>
          <p className="text-sm text-on-surface-variant">
            Community submissions and admin-added projects. Rows open the
            editor.
          </p>
        </div>
        <Button href="/admin/projects/new">New project</Button>
      </header>

      {projects.length === 0 ? (
        <Card>
          <p className="text-sm text-on-surface-variant">
            No projects yet. The public showcase serves the seed projects
            until the first one is published here, and community submissions
            land in this list for review.
          </p>
        </Card>
      ) : (
        <Card className="max-w-3xl divide-y divide-border/60 p-0">
          {projects.map((project) => (
            <Link
              key={project.id}
              href={`/admin/projects/${project.id}`}
              className="block rounded-2xl p-4 transition-colors hover:bg-accent/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-base-void"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-medium text-on-surface">
                  {project.name}
                </span>
                <span className="flex flex-wrap items-center justify-end gap-2">
                  <Chip className="border-border bg-transparent text-on-surface-variant">
                    {PROJECT_CATEGORIES[
                      project.category as keyof typeof PROJECT_CATEGORIES
                    ] ?? PROJECT_CATEGORIES.utility}
                  </Chip>
                  {project.is_published && project.is_focused && <Chip>Focused</Chip>}
                  {project.is_published && project.is_featured && <Chip>Featured</Chip>}
                  {project.submitted_by_community ? (
                    <Chip className="border-accent/40 bg-accent/5 text-accent-soft">
                      {ADMIN_PROJECTS_COPY.communitySubmission}
                    </Chip>
                  ) : null}
                  {project.is_published ? (
                    <Chip>Published</Chip>
                  ) : (
                    <Chip className="border-warn-orange/40 bg-warn-orange/5 text-warn-orange">
                      For review
                    </Chip>
                  )}
                </span>
              </div>
              <p className="mt-1 flex flex-wrap gap-x-3 font-mono text-xs text-on-surface-variant">
                <span className="break-all">{project.url}</span>
                {project.published_at && (
                  <span>{formatUtc(project.published_at)}</span>
                )}
              </p>
            </Link>
          ))}
        </Card>
      )}
    </div>
  );
}
