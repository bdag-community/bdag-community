import { ArrowUpRight } from "lucide-react";
import type { CommunityProject } from "@/lib/projects";
import { Card } from "@/components/ui/Card";
import { ArticleImage } from "@/components/news/ArticleImage";
import { PROJECT_CATEGORIES, PROJECTS_PAGE } from "@/lib/content/site";

/**
 * Project card: image (or the DAG-mark placeholder art), category, name,
 * description, submitter. The whole card is one EXTERNAL link straight to
 * the project, following the ArticleCard stretched-link pattern with the
 * ArrowUpRight external idiom the community directory buttons already use.
 */
export function ProjectCard({ project }: { project: CommunityProject }) {
  return (
    <Card
      interactive
      className="group/card relative flex h-full flex-col gap-4 p-4"
    >
      <ArticleImage
        src={project.imageUrl}
        srcSet={project.imageSrcSet}
        alt={project.imageAlt}
        className="aspect-[16/9]"
      />

      <div className="flex flex-1 flex-col gap-2 px-1 pb-1">
        <p className="label-caps text-on-surface-variant">
          <span className="text-accent-soft">
            {PROJECT_CATEGORIES[project.category]}
          </span>
        </p>
        <h3 className="h4 text-on-surface">
          <a
            href={project.url}
            target="_blank"
            rel="noopener noreferrer"
            className="focus-ring after:absolute after:inset-0 after:rounded-2xl"
          >
            {project.name}
          </a>
        </h3>
        {/* Same three-line clamp as ArticleCard, so a long description can
            never stretch its card past the row. The full text still travels
            in the data; the card is a teaser for the external link. */}
        <p className="line-clamp-3 text-sm leading-relaxed text-on-surface-variant">
          {project.description}
        </p>
        {project.authorName ? (
          <p className="text-sm text-on-surface-variant">
            {PROJECTS_PAGE.submittedBy}{" "}
            <span className="font-medium text-on-surface">
              {project.authorName}
            </span>
          </p>
        ) : null}
        <p className="mt-auto inline-flex items-center gap-1.5 pt-2 text-sm font-medium text-accent-soft">
          {PROJECTS_PAGE.visitLabel}
          <ArrowUpRight className="size-4" strokeWidth={2} aria-hidden />
        </p>
      </div>
    </Card>
  );
}
