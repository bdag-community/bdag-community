import { ProjectCard } from "@/components/projects/ProjectCard";
import { ParticipationNode } from "@/components/home/ParticipationNode";
import { Button } from "@/components/ui/Button";
import { Reveal, RevealGroup, RevealItem } from "@/components/ui/Reveal";
import { Section } from "@/components/ui/Section";
import { PROJECTS_SECTION } from "@/lib/content/site";
import { getPublishedProjects } from "@/lib/projects";

export async function ProjectSpotlight() {
  const projects = await getPublishedProjects();
  const focused = projects.find((project) => project.focused);
  const featured = projects
    .filter((project) => project.featured && project.id !== focused?.id)
    .slice(0, 2);

  if (!focused && featured.length === 0) return null;

  return (
    <Section as="section" aria-labelledby="community-projects-title">
      <div className="flex flex-col gap-5">
        <Reveal className="flex flex-wrap items-end justify-between gap-4">
          <h2 id="community-projects-title" className="h2">
            {PROJECTS_SECTION.title}
          </h2>
          <Button href={PROJECTS_SECTION.more.href} variant="ghost">
            {PROJECTS_SECTION.more.label}
          </Button>
        </Reveal>
        {focused && (
          <Reveal>
            <ProjectCard project={focused} spotlight />
          </Reveal>
        )}
        {featured.length > 0 && (
          <RevealGroup className="grid gap-5 sm:grid-cols-2">
            {featured.map((project) => (
              <RevealItem key={project.id} data-spine-featured-project>
                <ProjectCard project={project} />
              </RevealItem>
            ))}
          </RevealGroup>
        )}
        {focused && featured.length === 2 && <ParticipationNode section="projects" />}
      </div>
    </Section>
  );
}
