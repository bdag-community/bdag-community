import type { Metadata } from "next";
import { ArrowRight, FileText } from "lucide-react";
import { Section } from "@/components/ui/Section";
import { Button } from "@/components/ui/Button";
import { COMMUNITY_GUIDES } from "@/lib/content/community-guides";
import { COMMUNITY_GUIDE_COPY as copy } from "@/lib/content/site";

export const metadata: Metadata = {
  title: copy.title,
  description: copy.description,
};

export default function GuidesPage() {
  return (
    <Section as="section" aria-labelledby="guides-title" className="py-14 sm:py-20">
      <p className="eyebrow mb-4">{copy.eyebrow}</p>
      <h1 id="guides-title" className="h1">{copy.title}</h1>
      <p className="body mt-5 max-w-[62ch]">{copy.intro}</p>
      <p className="mt-5 max-w-[68ch] text-sm leading-relaxed text-on-surface-variant">{copy.notice}</p>
      <div className="mt-12 grid gap-6 lg:grid-cols-3">
        {COMMUNITY_GUIDES.map((guide) => (
          <article key={guide.slug} className="flex flex-col rounded-2xl border border-border bg-container/60 p-6 sm:p-8">
            <FileText className="mb-6 size-8 text-accent-soft" aria-hidden />
            <p className="eyebrow mb-3">{guide.pages.length === 1 ? copy.visualJourney : copy.guideAndFaq} · {guide.pages.length} {guide.pages.length === 1 ? copy.page : copy.pages}</p>
            <h2 className="h3">{guide.title}</h2>
            <p className="body-sm mt-4 flex-1">{guide.description}</p>
            <Button href={`/guides/${guide.slug}`} variant="ghost" className="mt-7 self-start" trailingIcon={<ArrowRight className="size-4" aria-hidden />} aria-label={`${copy.readPrefix}${guide.title}`}>{copy.read}</Button>
          </article>
        ))}
      </div>
    </Section>
  );
}
