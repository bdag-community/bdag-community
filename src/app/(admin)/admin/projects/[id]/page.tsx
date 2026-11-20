import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { ProjectForm } from "@/components/admin/ProjectForm";
import { ProjectPlacementForm } from "@/components/admin/ProjectPlacementForm";
import { ProjectModerationPanel } from "@/components/admin/ProjectModerationPanel";
import { ConfirmDeleteButton } from "@/components/admin/ConfirmDeleteButton";
import { requireAdmin } from "@/lib/dal/session";
import { getProjectById } from "@/lib/dal/admin-projects";
import { loadArticleAssetRuntimeConfig } from "@/lib/aws/article-asset-config.server";
import { deleteProjectAction } from "../actions";
import { ADMIN_PROJECTS_COPY } from "@/lib/content/site";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Edit project · Admin",
  description: "Vet, edit, or publish a community project.",
  // Never index an operator surface.
  robots: { index: false, follow: false },
};

/**
 * /admin/projects/[id] — vet, edit, publish, or delete one project.
 * requireAdmin()-gated; a non-uuid id or a missing row 404s rather than
 * erroring. Same page anatomy as the article editor so the operator only
 * has to learn one shape.
 */
export default async function EditProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();

  const { id } = await params;
  // Guard before the DB sees it: a non-uuid would be a Postgres type error.
  if (!z.string().uuid().safeParse(id).success) notFound();

  const project = await getProjectById(id);
  if (!project) notFound();

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <Link
          href="/admin/projects"
          className="focus-ring text-sm text-on-surface-variant transition-colors hover:text-accent-soft"
        >
          ← Projects
        </Link>
        <h1 className="h3 text-on-surface">Edit project</h1>
        <p className="break-all font-mono text-xs text-on-surface-variant">
          {project.url}
        </p>
      </header>

      <ProjectForm project={project} />

      {project.is_published ? (
        <ProjectPlacementForm
          id={project.id}
          featured={project.is_featured}
          focused={project.is_focused}
        />
      ) : (
        <p className="text-sm text-on-surface-variant">
          Publish this project to manage its homepage placement.
        </p>
      )}

      {/* The panel needs to know which environment's bucket THIS deployment
          reads, so it can say plainly when an image lives in the other one
          (both environments share one database but each has its own bucket). */}
      <ProjectModerationPanel
        project={project}
        runtimeStorageEnvironment={
          loadArticleAssetRuntimeConfig()?.storageEnvironment ?? null
        }
      />

      <section
        aria-label="Delete this project"
        className="flex max-w-2xl flex-wrap items-center justify-between gap-3 rounded-xl border border-error/30 p-4"
      >
        <p className="text-sm text-on-surface-variant">
          {project.is_published
            ? ADMIN_PROJECTS_COPY.assetModeration.deleteUnpublishFirst
            : ADMIN_PROJECTS_COPY.assetModeration.deleteDescription}
        </p>
        <ConfirmDeleteButton
          id={project.id}
          action={deleteProjectAction}
          label="Delete project"
          confirmPrompt="Delete this project and its managed images permanently?"
        />
      </section>
    </div>
  );
}
