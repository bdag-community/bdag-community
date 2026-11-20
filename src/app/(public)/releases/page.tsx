import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight, Download } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Section } from "@/components/ui/Section";
import { OPEN_SOURCE, RELEASES_PAGE as copy } from "@/lib/content/site";
import { getLatestRelease, getReleaseHistory } from "@/lib/releases";

export const metadata: Metadata = {
  title: copy.title,
  description: copy.description,
  alternates: { canonical: copy.href },
};

export const revalidate = 600;

const date = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeZone: "UTC",
});

const textLink = "focus-ring inline-flex min-h-[44px] items-center gap-1.5 text-sm font-medium text-accent-soft hover:text-on-surface";

export default async function ReleasesPage() {
  const [latest, history] = await Promise.all([getLatestRelease(), getReleaseHistory()]);
  const past = history?.filter(({ tag }) => tag !== latest?.tag);

  return (
    <>
      <Section as="section" className="flex flex-col gap-6 pt-14 sm:pt-20" aria-labelledby="releases-title">
        <h1 id="releases-title" className="h1">{copy.title}</h1>
        <p className="lead max-w-[62ch]">{copy.intro}</p>
        <div className="flex flex-wrap gap-3">
          <Button href={copy.all.href} target="_blank" rel="noopener noreferrer" variant="ghost" trailingIcon={<ArrowUpRight className="size-4" aria-hidden />}>
            {copy.all.label}
          </Button>
          <Button href={copy.source.href} target="_blank" rel="noopener noreferrer" variant="ghost" trailingIcon={<ArrowUpRight className="size-4" aria-hidden />}>
            {copy.source.label}
          </Button>
        </div>
      </Section>

      <Section as="section" className="pt-8 sm:pt-12" aria-labelledby="latest-release">
        <Card className="flex flex-col gap-6 border-t-accent/60 p-6 sm:p-8">
          <div className="flex flex-col gap-2">
            {latest && <p className="eyebrow text-teal-soft">{copy.latest}</p>}
            <h2 id="latest-release" className="h2 break-words">{latest?.title ?? copy.latest}</h2>
            {latest && (
              <time className="font-mono text-sm text-on-surface-variant" dateTime={latest.publishedAt}>
                {date.format(new Date(latest.publishedAt))}
              </time>
            )}
          </div>
          {latest ? (
            <>
              {latest.downloads.length > 0 ? (
                <ul className="grid gap-4 md:grid-cols-3">
                  {latest.downloads.map(({ kind, url, checksumUrl }) => (
                    <li key={kind} className="flex min-w-0 flex-col items-start gap-3 rounded-xl border border-border/70 bg-base-void/40 p-4 sm:p-5">
                      <h3 className="h4">{copy.downloads[kind].title}</h3>
                      <p className="body-sm flex-1">{copy.downloads[kind].detail}</p>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                        <Button href={url} leadingIcon={<Download className="size-4 shrink-0" aria-hidden />}>
                          {copy.downloads[kind].label}
                        </Button>
                        <a href={checksumUrl} className={textLink} aria-label={`${copy.downloads[kind].title} ${copy.checksum}`}>
                          {copy.checksum}
                        </a>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : <p className="body-sm">{copy.assetsUnavailable}</p>}
              {latest.qualification && (
                <aside className="rounded-xl border border-border/70 bg-elevated/40 p-4 sm:p-5">
                  <h3 className="h4">{copy.qualification}</h3>
                  <p className="body-sm mt-3 max-w-[88ch] whitespace-pre-line break-words">{latest.qualification}</p>
                </aside>
              )}
              <a href={latest.url} target="_blank" rel="noopener noreferrer" className={`${textLink} self-start`}>
                {copy.notes}
                <ArrowUpRight className="size-4" aria-hidden />
              </a>
            </>
          ) : <p className="body-sm">{copy.unavailable}</p>}
        </Card>
      </Section>

      <Section as="section" className="pt-10 sm:pt-14" aria-labelledby="release-history">
        <h2 id="release-history" className="h2 mb-5">{copy.history}</h2>
        {past?.length ? (
          <ul className="divide-y divide-border/60 border-y border-border/60">
            {past.map((release) => (
              <li key={release.tag} className="flex flex-wrap items-center justify-between gap-x-5 gap-y-1 py-2">
                <a href={release.url} target="_blank" rel="noopener noreferrer" className={textLink}>
                  {release.title}
                  <ArrowUpRight className="size-4 shrink-0" aria-hidden />
                </a>
                <time dateTime={release.publishedAt} className="font-mono text-sm text-on-surface-variant">
                  {date.format(new Date(release.publishedAt))}
                </time>
              </li>
            ))}
          </ul>
        ) : <p className="body-sm">{past ? copy.firstRelease : copy.historyUnavailable}</p>}
        <div className="mt-6 flex flex-wrap gap-x-6 gap-y-1">
          <Link href={OPEN_SOURCE.href} className={textLink}>{OPEN_SOURCE.title}</Link>
          <Link href={copy.testnet.href} className={textLink}>{copy.testnet.label}</Link>
        </div>
      </Section>
    </>
  );
}
