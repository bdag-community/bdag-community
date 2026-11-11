import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowUpRight, Download } from "lucide-react";
import { Section } from "@/components/ui/Section";
import { Button } from "@/components/ui/Button";
import { COMMUNITY_GUIDES } from "@/lib/content/community-guides";
import { COMMUNITY_GUIDE_COPY as copy } from "@/lib/content/site";

type Props = { params: Promise<{ slug: string }> };

// Only the approved documents are routes; unknown slugs are never rendered.
export const dynamicParams = false;

export function generateStaticParams() {
  return COMMUNITY_GUIDES.map(({ slug }) => ({ slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const guide = COMMUNITY_GUIDES.find((entry) => entry.slug === slug);
  if (!guide) return {};
  return { title: guide.title, description: guide.description };
}

export default async function GuidePage({ params }: Props) {
  const { slug } = await params;
  const guide = COMMUNITY_GUIDES.find((entry) => entry.slug === slug);
  if (!guide) notFound();

  return (
    <Section as="article" aria-labelledby="guide-title" className="py-10 sm:py-16">
      <Link href="/guides" className="focus-ring inline-flex min-h-[44px] items-center gap-2 rounded text-sm text-accent-soft"><ArrowLeft className="size-4" aria-hidden />{copy.back}</Link>
      <header className="mt-7 max-w-4xl">
        <p className="eyebrow mb-4">{copy.planned}</p>
        <h1 id="guide-title" className="h1">{guide.title}</h1>
        <p className="body mt-5">{guide.description}</p>
        <p className="mt-4 text-sm leading-relaxed text-on-surface-variant">{copy.notice}</p>
        <div className="mt-7 flex flex-wrap gap-3">
          <Button href={guide.pdf} target="_blank" rel="noopener noreferrer" trailingIcon={<ArrowUpRight className="size-4" aria-hidden />}>{copy.openPdf}<span className="sr-only">{copy.newTab}</span></Button>
          <Button href={guide.pdf} download variant="ghost" leadingIcon={<Download className="size-4" aria-hidden />}>{copy.downloadPdf}</Button>
          <Button href="#reading-view" variant="ghost">{copy.readText}</Button>
        </div>
      </header>

      {/* Static previews work on mobile and without a PDF plugin or third-party viewer. Original PDFs remain unchanged. */}
      <div aria-label={copy.preview} className="mx-auto mt-10 max-w-[960px] space-y-6 sm:mt-14">
        {guide.pages.map((page, index) => (
          <figure key={page.src}>
            <Image src={page.src} alt={page.alt} width={page.width} height={page.height} loading={index === 0 ? "eager" : "lazy"} sizes="(max-width: 1024px) 100vw, 960px" className="h-auto w-full rounded-lg border border-border shadow-lg" />
            <figcaption className="mt-2 text-center font-mono text-xs text-on-surface-variant">{copy.pagePrefix} {index + 1} {copy.of} {guide.pages.length}</figcaption>
          </figure>
        ))}
      </div>

      <section id="reading-view" aria-labelledby="reading-title" className="mx-auto mt-16 max-w-[72ch] scroll-mt-28 border-t border-border pt-10">
        <h2 id="reading-title" className="h2">{copy.reading}</h2>
        <p className="body-sm mt-4">{copy.readingHelp}</p>
        {guide.reading.map((section, index) => (
          <section key={`${section.heading}-${index}`} className="mt-8">
            <h3 className="h3">{section.heading}</h3>
            {section.paragraphs.map((paragraph) => <p key={paragraph} className="body mt-4 whitespace-pre-line">{paragraph}</p>)}
          </section>
        ))}
      </section>
      <nav aria-label={copy.related} className="mt-16 flex flex-wrap gap-3 border-t border-border pt-8">
        {COMMUNITY_GUIDES.filter((entry) => entry.slug !== guide.slug).map((entry) => <Button key={entry.slug} href={`/guides/${entry.slug}`} variant="ghost">{entry.title}</Button>)}
      </nav>
    </Section>
  );
}
