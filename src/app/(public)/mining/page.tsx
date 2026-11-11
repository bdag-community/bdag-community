import type { Metadata } from "next";
import type { CSSProperties } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, ArrowUpRight, Download, ShieldCheck } from "lucide-react";
import { Section } from "@/components/ui/Section";
import { CopyRef } from "@/components/ui/CopyRef";
import { PageHero } from "@/components/site/PageHero";
import { MiningArt } from "@/components/site/PageHeroArt";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Reveal, RevealGroup, RevealItem } from "@/components/ui/Reveal";
import { Disclaimer } from "@/components/site/Disclaimer";
import { NodesPanel } from "@/components/mining/NodesPanel";
import { getInfrastructureDirectory } from "@/lib/infrastructure";
import {
  COMMUNITY_MINER_SELLER,
  META_DESCRIPTIONS,
  MINING_PAGE,
  NODES_SECTION,
  STAKING_SECTION,
} from "@/lib/content/site";

export const metadata: Metadata = {
  title: "Mining",
  // Purpose-written, not the page intro: the intro is 244 characters and a
  // search result cuts it off mid-sentence.
  description: META_DESCRIPTIONS.mining,
};
export const dynamic = "force-dynamic";

/**
 * Mining — real hardware behind the chain. Order: intro, the two devices as
 * alternating feature rows (shared family photography, not a card grid),
 * availability & delivery, the box-to-blocks steps with an honest pool-config
 * boundary, the staking cross-link, and the non-affiliation disclaimer.
 */
export default async function MiningPage() {
  const infrastructure = await getInfrastructureDirectory();
  return (
    <>
      {/* ------------------------------- Hero ------------------------------- */}
      <Section as="section" aria-labelledby="mining-title">
        <PageHero
          titleId="mining-title"
          title={MINING_PAGE.title}
          subtitle={MINING_PAGE.subtitle}
          intro={MINING_PAGE.intro}
          art={<MiningArt />}
          label="mining"
        />
      </Section>

      {/* ------------------------- Device showcase -------------------------- */}
      <Section as="section" aria-label="ASIC miners">
        <div className="flex flex-col gap-16 lg:gap-20">
          {MINING_PAGE.devices.map((device, i) => (
            <div
              key={device.model}
              className="grid items-center gap-8 lg:grid-cols-2 lg:gap-16"
            >
              {/* Rows alternate image side so the showcase reads as a
                  sequence, not a grid. */}
              <Reveal className={i % 2 === 1 ? "lg:order-2" : undefined}>
                <div className="relative aspect-video overflow-hidden rounded-2xl border border-border/60 bg-elevated">
                  <Image
                    src={device.image}
                    alt={`${device.model} ASIC miner`}
                    fill
                    sizes="(min-width: 1024px) 45vw, 92vw"
                    className="object-cover"
                    priority={i === 0}
                  />
                </div>
              </Reveal>
              <Reveal
                delay={0.08}
                className="flex flex-col items-start gap-3"
              >
                {/* The model names the row, so the model is the heading. It
                    used to be a label-caps line above an <h2> that held the
                    tagline, which meant the page's heading outline read
                    "Compact. Efficient. Relentless." and "The ultimate mining
                    machine" — two slogans a reader skimming headings cannot
                    tell apart, and neither of which says which device it is.
                    The tagline keeps its place and its punch; it just stops
                    pretending to be structure. */}
                <h2 className="h2">{device.model}</h2>
                <p className="lead">{device.tagline}</p>
                <p className="body">{device.body}</p>
              </Reveal>
            </div>
          ))}
        </div>
      </Section>

      {/* --------------------- Availability & delivery ----------------------- */}
      <Section as="section" aria-labelledby="availability-heading">
        <div className="grid gap-10 lg:grid-cols-[1fr_1.2fr] lg:gap-16">
          <Reveal className="flex flex-col items-start gap-6">
            <h2 id="availability-heading" className="h2">
              {MINING_PAGE.availability.title}
            </h2>
            <Button
              href={MINING_PAGE.availability.cta.url}
              target="_blank"
              rel="noopener noreferrer"
              trailingIcon={
                <ArrowUpRight className="size-4" strokeWidth={2} aria-hidden />
              }
            >
              {MINING_PAGE.availability.cta.label}
            </Button>
          </Reveal>

          <RevealGroup className="divide-y divide-border/60 border-y border-border/60">
            {MINING_PAGE.availability.points.map((point) => (
              <RevealItem key={point} className="flex items-start gap-3 py-4">
                <span
                  aria-hidden
                  className="mt-[7px] size-1.5 shrink-0 rounded-full bg-gradient-accent"
                />
                <p className="text-sm leading-relaxed text-on-surface sm:text-base">
                  {point}
                </p>
              </RevealItem>
            ))}
          </RevealGroup>
        </div>
      </Section>

      {/* --------------------- Independent community seller -------------- */}
      <Section
        as="section"
        id="community-seller"
        aria-labelledby="community-seller-heading"
        className="scroll-mt-24"
      >
        <Reveal className="flex max-w-3xl flex-col items-start gap-5">
          <h2 id="community-seller-heading" className="h2">
            {COMMUNITY_MINER_SELLER.title}
          </h2>
          <p className="lead max-w-[62ch]">{COMMUNITY_MINER_SELLER.lead}</p>
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
        </Reveal>
      </Section>

      {/* ------------------------ From box to blocks ------------------------ */}
      <section
        aria-labelledby="steps-heading"
        className="full-bleed section-surface"
      >
        <Section className="flex flex-col gap-10 py-16 sm:py-20">
          <Reveal className="flex flex-col gap-4">
            <h2 id="steps-heading" className="h2">
              {MINING_PAGE.steps.title}
            </h2>
            <p className="lead max-w-[62ch]">{MINING_PAGE.steps.lead}</p>
          </Reveal>

          {/* A vertical sequence, not a row: you cannot do step two before
              step one, and two of these carry something extra. 120ms between
              them, slower than the site's 70ms default, because this is the
              one group on the page that is genuinely ordered. */}
          <RevealGroup className="flex flex-col gap-5" stagger={0.12}>
            {MINING_PAGE.steps.items.map((step, i) => (
              <RevealItem
                key={step.title}
                className="relative flex flex-col gap-3 border-t border-border/60 pt-5"
              >
                {/* The hairline each step already sits on, lit under the step
                    as it arrives. The dark border stays; this is a copy drawn
                    over it, so no-JS and reduced-motion render the page
                    exactly as before. Full width and flush at both ends: a
                    machine advancing one detent at a time. */}
                <span
                  aria-hidden
                  data-edge
                  style={{ "--edge-len": "100%" } as CSSProperties}
                />
                <span aria-hidden className="font-mono text-sm text-pink-soft">
                  {`0${i + 1}`}
                </span>
                <h3 className="h3 text-on-surface">
                  <span className="sr-only">{`Step ${i + 1}: `}</span>
                  {step.title}
                </h3>
                <p className="body max-w-[68ch]">{step.body}</p>
                {/* Only the node step carries one, and it goes to the page
                    that owns that walkthrough rather than repeating it. */}
                {"more" in step && step.more ? (
                  <Link
                    href={step.more.href}
                    className="focus-ring group inline-flex min-h-[44px] items-center gap-1.5 text-sm font-medium text-accent-soft transition-colors hover:text-on-surface"
                  >
                    {step.more.label}
                    <ArrowRight
                      className="size-4 transition-transform group-hover:translate-x-0.5"
                      strokeWidth={2}
                      aria-hidden
                    />
                  </Link>
                ) : null}
              </RevealItem>
            ))}
          </RevealGroup>

          {/* The recommended path, same offer as the node page makes, for the
              full sequence rather than the node alone. */}
          <Reveal>
            <Card className="flex flex-col gap-4 p-6 sm:p-8">
              <p className="label-caps text-accent-soft">
                {MINING_PAGE.agent.title}
              </p>
              <p className="body-sm max-w-[68ch]">{MINING_PAGE.agent.body}</p>
              <p className="flex items-start gap-2.5 text-sm text-on-surface">
                <ShieldCheck
                  className="mt-0.5 size-4 shrink-0 text-accent-teal"
                  strokeWidth={1.75}
                  aria-hidden
                />
                {MINING_PAGE.agent.safety}
              </p>
              <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:gap-8">
                <Button
                  href={MINING_PAGE.agent.download.href}
                  download
                  trailingIcon={
                    <Download className="size-4" strokeWidth={2} aria-hidden />
                  }
                >
                  {MINING_PAGE.agent.download.label}
                </Button>
                <div className="flex min-w-0 flex-col gap-1.5">
                  <p className="label-caps text-on-surface-variant">
                    {MINING_PAGE.agent.linkLabel}
                  </p>
                  <CopyRef
                    value={MINING_PAGE.agent.url}
                    label="onboarding brief link"
                  />
                </div>
              </div>
            </Card>
          </Reveal>

          {/* ASICs use a pool's Stratum endpoint, not the public JSON-RPC.
              The pool now arrives with the node's mining profile, so this
              routes to the runbook that configures it rather than promising a
              guide of our own. */}
          <Reveal>
            <div className="rounded-2xl border border-accent/25 bg-accent/5 p-6">
              <p className="label-caps text-accent-soft">
                {MINING_PAGE.endpoints.title}
              </p>
              <p className="body-sm mt-3 max-w-[72ch]">
                {MINING_PAGE.endpoints.note}
              </p>
              <div className="mt-5 flex flex-wrap items-center gap-3">
                <Button
                  href={MINING_PAGE.endpoints.support.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  variant="ghost"
                  trailingIcon={
                    <ArrowUpRight className="size-4" strokeWidth={2} aria-hidden />
                  }
                >
                  {MINING_PAGE.endpoints.support.label}
                </Button>
                <Link
                  href={MINING_PAGE.endpoints.more.href}
                  className="focus-ring group inline-flex min-h-[44px] items-center gap-1.5 text-sm font-medium text-accent-soft transition-colors hover:text-on-surface"
                >
                  {MINING_PAGE.endpoints.more.label}
                  <ArrowRight
                    className="size-4 transition-transform group-hover:translate-x-0.5"
                    strokeWidth={2}
                    aria-hidden
                  />
                </Link>
              </div>
            </div>
          </Reveal>
        </Section>
      </section>

      {/* -------------------------- Public pools --------------------------- */}
      {/* The alternative to running the full stack above: pools run by
          independent community operators. Endpoints are copyable text, never
          links, because stratum+tcp is a miner's scheme, not a browser's. */}
      <Section
        as="section"
        id="public-pools"
        aria-labelledby="public-pools-heading"
        className="scroll-mt-24"
      >
        <div className="flex max-w-3xl flex-col gap-8">
          <Reveal className="flex flex-col gap-4">
            <h2 id="public-pools-heading" className="h2">
              {MINING_PAGE.publicPools.title}
            </h2>
            <p className="lead max-w-[62ch]">{MINING_PAGE.publicPools.lead}</p>
          </Reveal>
          <Reveal>
            <Card className="p-6 sm:p-8">
              <ul className="flex flex-col divide-y divide-border/60">
                {infrastructure.miningPools.map((pool) => (
                  <li
                    key={pool.endpoint}
                    className="flex flex-col gap-1.5 py-4 first:pt-0 last:pb-0"
                  >
                    <p className="label-caps">{pool.name}</p>
                    <CopyRef
                      value={pool.endpoint}
                      label={`${pool.name} pool endpoint`}
                    />
                  </li>
                ))}
              </ul>
            </Card>
          </Reveal>
        </div>
      </Section>

      {/* ------------------------ Node status board ------------------------- */}
      {/* The full board lives on /chain, with the explanation it
          always needed around it. What stays here is the compact strip, under
          the same id, so every existing /mining#nodes link still lands on a
          live board, and so a fork detection is never something you have to
          leave this page to find out about.

          It sits BELOW the setup sequence now. Someone arriving on /mining is
          deciding whether to mine and how to start; endpoint health is what
          they check afterwards, not the second thing they read. The anchor is
          unchanged, so the links into it are unaffected. */}
      <Section as="section" aria-labelledby="nodes-heading" id="nodes" className="scroll-mt-24">
        {/* gap-8, matching /chain's copy of this identical block. The two are
            the same section — eyebrow, h2, sub, board — and they were 8px
            apart for no reason anyone could name. */}
        <div className="flex flex-col gap-8">
          <Reveal className="flex flex-col gap-3">
            {/* Live telemetry wears turquoise (DESIGN.md accent roles). */}
            <p className="eyebrow text-teal-soft">{NODES_SECTION.eyebrow}</p>
            <h2 id="nodes-heading" className="h2">
              {NODES_SECTION.title}
            </h2>
            <p className="body">{NODES_SECTION.compactSub}</p>
          </Reveal>
          {/* Renders its own "Full node detail →" link to /chain#nodes. */}
          <NodesPanel variant="compact" initialDefinitions={infrastructure.rpcs} />
        </div>
      </Section>

      {/* ------------------------ Staking cross-link ------------------------ */}
      <Section as="section" aria-labelledby="staking-crosslink-heading">
        <Reveal>
          <Card className="flex flex-col items-start gap-6 p-6 sm:p-8 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex max-w-[60ch] flex-col gap-2">
              <p className="eyebrow">{STAKING_SECTION.eyebrow}</p>
              <h2
                id="staking-crosslink-heading"
                className="h3 text-on-surface"
              >
                {STAKING_SECTION.title}
              </h2>
              <p className="body">{STAKING_SECTION.body}</p>
            </div>
            <Button
              href={STAKING_SECTION.more.href}
              variant="ghost"
              className="shrink-0"
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
        </Reveal>
      </Section>

      {/* The legal close uses the same prominent trust treatment as Home. */}
      <Section as="section" aria-label="Legal">
        <Disclaimer variant="banner" />
      </Section>
    </>
  );
}
