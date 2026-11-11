import type { Metadata } from "next";
import { PackageOpen } from "lucide-react";
import { Section } from "@/components/ui/Section";
import { PageHero } from "@/components/site/PageHero";
import { ProjectsArt } from "@/components/site/PageHeroArt";
import { Card } from "@/components/ui/Card";
import { Reveal, RevealGroup, RevealItem } from "@/components/ui/Reveal";
import { Disclaimer } from "@/components/site/Disclaimer";
import { Button } from "@/components/ui/Button";
import { CommunityViewSwitch } from "@/components/community/CommunityViewSwitch";
import { ProjectCard } from "@/components/projects/ProjectCard";
import { getPublishedProjects } from "@/lib/projects";
import { META_DESCRIPTIONS, PROJECTS_PAGE } from "@/lib/content/site";

export const metadata: Metadata = {
  title: PROJECTS_PAGE.eyebrow,
  description: META_DESCRIPTIONS.projects,
};

// Published projects are safe to share across readers: the data client is
// cookie-free and RLS exposes published rows only (same rule as /articles).
export const revalidate = 600;

/**
 * The Projects view of the community section. /community and this page are
 * the two sides of one switch: Info is the who-we-are page, Projects is the
 * what-we-built showcase. The switch at the top swaps the whole view, so it
 * renders before the hero on both pages.
 */
export default async function CommunityProjectsPage() {
  const projects = await getPublishedProjects();

  return (
    <>
      {/* ------------------------------ Switch ------------------------------ */}
      {/* A plain wrapper, not a named region: the switch is its own nav
          landmark and a second landmark with the same name would read as a
          duplicate to assistive tech. */}
      <Section as="div">
        <CommunityViewSwitch active="projects" />
      </Section>

      {/* ------------------------------- Hero ------------------------------- */}
      <Section as="section" aria-labelledby="projects-title">
        <PageHero
          titleId="projects-title"
          title={PROJECTS_PAGE.title}
          subtitle={PROJECTS_PAGE.subtitle}
          intro={PROJECTS_PAGE.intro}
          art={<ProjectsArt />}
          label="projects"
        />
      </Section>

      {/* ----------------------------- Projects ----------------------------- */}
      <Section>
        <Reveal className="mb-8 flex flex-col items-start justify-between gap-4 border-b border-border/60 pb-6 sm:flex-row sm:items-center">
          <p className="body max-w-[58ch]">
            {PROJECTS_PAGE.submission.invitation}
          </p>
          <Button href={PROJECTS_PAGE.submission.cta.href} className="shrink-0">
            {PROJECTS_PAGE.submission.cta.label}
          </Button>
        </Reveal>
        {/* Keeps the outline h1 then h2 then the h3 card names. */}
        <h2 className="sr-only">{PROJECTS_PAGE.listHeading}</h2>
        {projects.length > 0 ? (
          <RevealGroup className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {projects.map((project) => (
              <RevealItem key={project.id}>
                <ProjectCard project={project} />
              </RevealItem>
            ))}
          </RevealGroup>
        ) : (
          /* Same honest empty state register as /articles: a showcase waiting
             for its first entries is a normal state, not a fault. */
          <Reveal>
            <Card className="flex flex-col items-start gap-4 p-6 sm:p-8">
              <span
                aria-hidden
                className="flex size-10 items-center justify-center rounded-full border border-border-strong bg-elevated"
              >
                <PackageOpen
                  className="size-5 text-accent-soft"
                  strokeWidth={1.75}
                />
              </span>
              <p className="lead max-w-[46ch]">{PROJECTS_PAGE.empty}</p>
            </Card>
          </Reveal>
        )}
      </Section>

      {/* ------------------------------ Legal ------------------------------- */}
      <Section as="section" aria-label="Legal">
        <Disclaimer variant="banner" />
      </Section>
    </>
  );
}
