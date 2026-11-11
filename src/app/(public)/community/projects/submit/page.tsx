import type { Metadata } from "next";
import { ArrowLeft, FileCheck2 } from "lucide-react";
import { CommunityProjectForm } from "@/components/projects/CommunityProjectForm";
import { Disclaimer } from "@/components/site/Disclaimer";
import { PageHero } from "@/components/site/PageHero";
import { ProjectsArt } from "@/components/site/PageHeroArt";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Reveal } from "@/components/ui/Reveal";
import { Section } from "@/components/ui/Section";
import { PROJECTS_PAGE } from "@/lib/content/site";

export const metadata: Metadata = {
  title: PROJECTS_PAGE.submission.metadataTitle,
  description: PROJECTS_PAGE.submission.metadataDescription,
  robots: { index: false, follow: true },
};

export default function SubmitProjectPage() {
  return (
    <>
      <Section as="section" aria-labelledby="submit-project-title">
        <PageHero
          titleId="submit-project-title"
          title={PROJECTS_PAGE.submission.title}
          subtitle={PROJECTS_PAGE.submission.subtitle}
          intro={PROJECTS_PAGE.submission.intro}
          art={<ProjectsArt />}
          label={PROJECTS_PAGE.submission.artLabel}
        />
      </Section>

      <Section as="section" aria-labelledby="project-form-heading">
        <div className="grid items-start gap-10 lg:grid-cols-[minmax(0,0.72fr)_minmax(0,1.28fr)] lg:gap-16">
          <Reveal className="flex min-w-0 flex-col items-start gap-4">
            <Button
              href={PROJECTS_PAGE.submission.backHref}
              variant="ghost"
              leadingIcon={
                <ArrowLeft className="size-4" strokeWidth={2} aria-hidden />
              }
            >
              {PROJECTS_PAGE.submission.backLabel}
            </Button>
            <p className="eyebrow">{PROJECTS_PAGE.submission.reviewTitle}</p>
            <h2 id="project-form-heading" className="h2">
              {PROJECTS_PAGE.submission.formTitle}
            </h2>
            <p className="lead">{PROJECTS_PAGE.submission.reviewBody}</p>
            <p className="flex items-start gap-2.5 text-sm leading-relaxed text-on-surface-variant">
              <FileCheck2
                className="mt-0.5 size-4 shrink-0 text-accent-soft"
                strokeWidth={1.75}
                aria-hidden
              />
              {PROJECTS_PAGE.submission.reviewNote}
            </p>
          </Reveal>

          <Reveal delay={0.1} className="min-w-0">
            <Card className="p-6 sm:p-8">
              <CommunityProjectForm />
            </Card>
          </Reveal>
        </div>
      </Section>

      <Section as="section" aria-label="Legal">
        <Disclaimer variant="banner" />
      </Section>
    </>
  );
}
