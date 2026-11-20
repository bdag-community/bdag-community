import { ArrowUpRight } from "lucide-react";
import type { CommunityProject } from "@/lib/projects";
import { Card } from "@/components/ui/Card";
import { ArticleImage } from "@/components/news/ArticleImage";
import { PROJECT_CATEGORIES, PROJECTS_PAGE } from "@/lib/content/site";
import { cn } from "@/lib/utils/cn";

/**
 * Project card: image (or the DAG-mark placeholder art), category, name,
 * description, submitter. The whole card is one EXTERNAL link straight to
 * the project, following the ArticleCard stretched-link pattern with the
 * ArrowUpRight external idiom the community directory buttons already use.
 */
export function ProjectCard({
  project,
  spotlight = false,
}: {
  project: CommunityProject;
  spotlight?: boolean;
}) {
  return (
    <Card
      interactive
      data-spine-project-spotlight={spotlight || undefined}
      className={cn(
        "group/card relative flex h-full flex-col gap-4 p-4",
        spotlight && "border-accent/40 md:grid md:grid-cols-[2fr_3fr] md:items-center md:gap-8 md:p-5",
      )}
    >
      <ArticleImage
        src={project.imageUrl}
        srcSet={project.imageSrcSet}
        alt={project.imageAlt}
        className={cn("aspect-video", spotlight && "md:order-2")}
        sizes={spotlight ? "(min-width: 768px) 55vw, 100vw" : undefined}
      />

      <div className={cn(
        "flex flex-1 flex-col gap-2 px-1 pb-1",
        spotlight && "md:gap-4 md:py-6 md:pl-5",
      )}>
        <p className="label-caps text-on-surface-variant">
          <span className="text-accent-soft">
            {spotlight ? "Project spotlight" : PROJECT_CATEGORIES[project.category]}
          </span>
        </p>
        <h3 className={cn(spotlight ? "h3" : "h4", "text-on-surface")}>
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
        <p className={spotlight ? "body" : "line-clamp-3 text-sm leading-relaxed text-on-surface-variant"}>
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
