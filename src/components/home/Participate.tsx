import Image from "next/image";
import { ArrowRight, ArrowUpRight, Sparkles } from "lucide-react";
import { Section } from "@/components/ui/Section";
import { Card } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { Button } from "@/components/ui/Button";
import { CopyRef } from "@/components/ui/CopyRef";
import { Reveal, RevealGroup, RevealItem } from "@/components/ui/Reveal";
import { SpineFrame } from "@/components/spine/SpineFrame";
import { ParticipationNode } from "@/components/home/ParticipationNode";
import {
  CHAIN,
  COMMUNITY_MINER_SELLER,
  DEVELOPMENT_SECTION,
  MINING_SECTION,
  OPEN_SOURCE,
  STAKING_SECTION,
} from "@/lib/content/site";

/**
 * The three participation paths — mine, stake, build. Mining leads with real
 * hardware imagery (shared family photography); staking and development sit
 * as a two-up pairing so the rhythm varies down the page (DESIGN.md: no
 * identical card grids back to back).
 */
export function Participate() {
  return (
    <>
      {/* ------------------------------- Mine ------------------------------ */}
      <Section as="section" aria-labelledby="mining-title">
        {/* Framed, because the chain crosses this section: it arrives on the
            top edge, the border carries it round, and it leaves the bottom
            centre to fork toward the two cards below. */}
        <div
          data-spine-frame="cross"
          className="relative isolate rounded-2xl border border-border/70 p-6 sm:p-8 lg:p-10"
        >
          <SpineFrame />
          <div className="grid items-center gap-10 lg:grid-cols-[1.1fr_1fr] lg:gap-16">
            <Reveal className="flex flex-col items-start gap-4">
              <p className="eyebrow">{MINING_SECTION.eyebrow}</p>
              <h2 id="mining-title" className="h2">
                {MINING_SECTION.title}
              </h2>
              <p className="lead">{MINING_SECTION.body}</p>
              <div className="mt-2 flex flex-wrap gap-4">
                <Button
                  href={MINING_SECTION.cta.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  trailingIcon={
                    <ArrowUpRight className="size-4" strokeWidth={2} aria-hidden />
                  }
                >
                  {MINING_SECTION.cta.label}
                </Button>
                <Button
                  href={MINING_SECTION.more.href}
                  variant="ghost"
                  trailingIcon={
                    <ArrowRight
                      className="size-4 transition-transform group-hover:translate-x-0.5"
                      strokeWidth={2}
                      aria-hidden
                    />
                  }
                >
                  {MINING_SECTION.more.label}
                </Button>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <span className="label-caps text-on-surface-variant">
                  Community seller
                </span>
                <Button
                  href={COMMUNITY_MINER_SELLER.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  variant="ghost"
                  trailingIcon={
                    <ArrowUpRight className="size-4" strokeWidth={2} aria-hidden />
                  }
                >
                  {COMMUNITY_MINER_SELLER.label}
                </Button>
              </div>
            </Reveal>

            <RevealGroup className="grid grid-cols-2 gap-4 sm:gap-5">
              {MINING_SECTION.devices.map((device) => (
                <RevealItem key={device.model}>
                  <Card interactive className="flex h-full flex-col gap-3 p-4">
                    <div className="relative aspect-[16/10] overflow-hidden rounded-xl border border-border/60 bg-elevated">
                      <Image
                        src={device.image}
                        alt={`BDAG ${device.model} ASIC miner`}
                        fill
                        sizes="(min-width: 1024px) 20vw, 45vw"
                        className="object-cover"
                      />
                    </div>
                    <div className="flex flex-col gap-1 px-1 pb-1">
                      <p className="h4 text-on-surface">{device.model}</p>
                      <p className="text-sm text-on-surface-variant">
                        {device.blurb}
                      </p>
                    </div>
                  </Card>
                </RevealItem>
              ))}
            </RevealGroup>
          </div>
        </div>
      </Section>

      {/* -------------------------- Stake + Build -------------------------- */}
      <Section as="section" aria-label="Staking and development">
        <RevealGroup className="grid gap-5 lg:grid-cols-2">
          <RevealItem>
            <Card
              data-spine-frame="branch"
              className="relative isolate flex h-full flex-col items-start gap-4 p-6 sm:p-8"
            >
              <SpineFrame />
              <p className="eyebrow">{STAKING_SECTION.eyebrow}</p>
              <h2 className="h3 text-on-surface">{STAKING_SECTION.title}</h2>
              <p className="body">{STAKING_SECTION.body}</p>
              <div className="flex flex-col gap-1.5">
                <p className="label-caps text-on-surface-variant">
                  {STAKING_SECTION.contractLabel}
                </p>
                <CopyRef value={CHAIN.stakingContract} label="staking contract" />
              </div>
              <Button
                href={STAKING_SECTION.more.href}
                variant="ghost"
                className="mt-auto"
                trailingIcon={
                  <ArrowRight
                    className="size-4 transition-transform group-hover:translate-x-0.5"
                    strokeWidth={2}
                    aria-hidden
                  />
                }
              >
                {STAKING_SECTION.more.label}
              </Button>
            </Card>
          </RevealItem>

          <RevealItem>
            <Card
              data-spine-frame="branch"
              className="relative isolate flex h-full flex-col items-start gap-4 p-6 sm:p-8"
            >
              <SpineFrame />
              <p className="eyebrow">{DEVELOPMENT_SECTION.eyebrow}</p>
              <h2 className="h3 text-on-surface">{DEVELOPMENT_SECTION.title}</h2>
              <p className="body">{DEVELOPMENT_SECTION.body}</p>
              <Chip className="border-accent-pink/30 bg-accent-pink/10 text-pink-soft">
                <Sparkles className="size-3.5" strokeWidth={1.75} aria-hidden />
                {DEVELOPMENT_SECTION.chip}
              </Chip>
              <div className="mt-auto flex flex-wrap items-center gap-3">
                <Button
                  href={DEVELOPMENT_SECTION.cta.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  variant="ghost"
                  trailingIcon={
                    <ArrowUpRight className="size-4" strokeWidth={2} aria-hidden />
                  }
                >
                  {DEVELOPMENT_SECTION.cta.label}
                </Button>
                <Button href={OPEN_SOURCE.href} variant="ghost" trailingIcon={<ArrowRight className="size-4" aria-hidden />}>
                  {OPEN_SOURCE.title}
                </Button>
                {/* What the community has already built, without waiting. */}
                <Button
                  href={DEVELOPMENT_SECTION.projectsLink.href}
                  variant="ghost"
                  trailingIcon={
                    <ArrowRight className="size-4" strokeWidth={2} aria-hidden />
                  }
                >
                  {DEVELOPMENT_SECTION.projectsLink.label}
                </Button>
              </div>
            </Card>
          </RevealItem>
        </RevealGroup>

        {/* Where the two arms come back together. Rendered inside the same
            Section so it shares the pair's column and centre line — the
            geometry gate checks that centre and falls back to the old square
            merge if a layout ever moves it off. */}
        <ParticipationNode />
      </Section>
    </>
  );
}
