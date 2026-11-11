import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, ArrowUpRight, Download, ShieldCheck } from "lucide-react";
import { Section } from "@/components/ui/Section";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { CopyRef } from "@/components/ui/CopyRef";
import { Reveal, RevealGroup, RevealItem } from "@/components/ui/Reveal";
import { Disclaimer } from "@/components/site/Disclaimer";
import { ChannelCard } from "@/components/community/ChannelCard";
import { PageHero } from "@/components/site/PageHero";
import { CommunityArt } from "@/components/site/PageHeroArt";
import { CopySnippet } from "@/components/community/CopySnippet";
import { PrincipleGrid } from "@/components/community/PrincipleGrid";
import { CommunityViewSwitch } from "@/components/community/CommunityViewSwitch";
import { SuggestionDisclosure } from "@/components/community/SuggestionDisclosure";
import { NodesPanel } from "@/components/mining/NodesPanel";
import { getLatestRelease } from "@/lib/releases";
import { getInfrastructureDirectory } from "@/lib/infrastructure";
import {
  CHAIN,
  CHANNELS,
  COMMUNITY_PAGE,
  DEVELOPMENT_SECTION,
  ENDPOINT_LABELS,
  META_DESCRIPTIONS,
  NODES_SECTION,
  WALLET_CONFIG_SNIPPET,
} from "@/lib/content/site";

export const metadata: Metadata = {
  title: "Community",
  description: META_DESCRIPTIONS.community,
};
export const dynamic = "force-dynamic";

/**
 * Community — who we are and how to find us. Order: intro (the claim), the
 * principles behind it, where we talk (channels being finalised — handles are
 * placeholders, never live links), concrete ways in, and the #build block
 * (development story + the wallet config integrators paste), then the
 * non-affiliation disclaimer.
 */
/** Same format the news cards use, so dates read the same across the site. */
const releaseDate = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

export default async function CommunityPage() {
  // Resolved on the server and shared by every visitor, on the release page's
  // own ten-minute cache. Null is a normal answer — the section renders its
  // link and its instructions either way and simply claims no version.
  const [release, infrastructure] = await Promise.all([getLatestRelease(), getInfrastructureDirectory()]);

  return (
    <>
      {/* ------------------------------ Switch ------------------------------ */}
      {/* Info | Projects. This page is the Info side; the Projects side lives
          at /community/projects and wears the same switch. */}
      {/* A plain wrapper, not a named region: the switch is its own nav
          landmark (see the projects view for the same rationale). */}
      <Section as="div">
        <CommunityViewSwitch active="info" />
      </Section>

      {/* ------------------------------- Hero ------------------------------- */}
      <Section as="section" aria-labelledby="community-title">
        <PageHero
          titleId="community-title"
          title={COMMUNITY_PAGE.title}
          subtitle={COMMUNITY_PAGE.subtitle}
          intro={COMMUNITY_PAGE.intro}
          art={<CommunityArt />}
          label="community"
        />
      </Section>

      {/* ---------------------------- Principles ---------------------------- */}
      <Section as="section" aria-labelledby="principles-heading">
        {/* Deliberately quiet: an h2 in the label-caps register, because the
            principles themselves are the loud part (see site.ts). */}
        <h2 id="principles-heading" className="label-caps">
          {COMMUNITY_PAGE.principlesTitle}
        </h2>
        <PrincipleGrid />
      </Section>

      {/* ----------------------------- Channels ----------------------------- */}
      <Section as="section" aria-labelledby="channels-heading">
        <div className="flex flex-col gap-8">
          <Reveal className="flex flex-col gap-3">
            <h2 id="channels-heading" className="h2">
              {COMMUNITY_PAGE.channelsTitle}
            </h2>
            <p className="lead">{COMMUNITY_PAGE.channelsNote}</p>
          </Reveal>

          <RevealGroup className="grid gap-5 sm:grid-cols-2">
            {CHANNELS.map((channel) => (
              <RevealItem key={channel.name}>
                <ChannelCard channel={channel} variant="full" />
              </RevealItem>
            ))}
          </RevealGroup>
        </div>
      </Section>

      {/* -------------------------- Ways to take part ----------------------- */}
      <Section
        as="section"
        id="participate"
        aria-labelledby="ways-heading"
        className="scroll-mt-24"
      >
        <div className="flex flex-col gap-8">
          <Reveal>
            <h2 id="ways-heading" className="h2">
              {COMMUNITY_PAGE.waysTitle}
            </h2>
          </Reveal>

          {/* Two columns, not four: at four these cards were the only p-5 on
              the site and the only lg:grid-cols-4, which made them read as a
              different, cheaper kind of card than everything around them. */}
          <RevealGroup className="grid gap-5 sm:grid-cols-2">
            {COMMUNITY_PAGE.ways.map((way) => (
              <RevealItem key={way.title}>
                {/* Whole card is one link (ArticleCard pattern): the heading
                    link stretches over the card via after:inset-0. */}
                <Card
                  interactive
                  className="relative flex h-full flex-col gap-2.5 p-6"
                >
                  <h3 className="h4">
                    <Link
                      href={way.href}
                      className="focus-ring after:absolute after:inset-0 after:rounded-2xl"
                    >
                      {way.title}
                    </Link>
                  </h3>
                  <p className="text-sm leading-relaxed text-on-surface-variant">
                    {way.body}
                  </p>
                  <p className="mt-auto inline-flex items-center gap-1.5 pt-4 text-sm font-medium text-accent-soft">
                    {way.cta}
                    <ArrowRight className="size-4" strokeWidth={2} aria-hidden />
                  </p>
                </Card>
              </RevealItem>
            ))}
          </RevealGroup>
        </div>
      </Section>

      {/* --------------------- Build (development story) -------------------- */}
      <Section
        as="section"
        id="build"
        aria-labelledby="build-heading"
        className="scroll-mt-24"
      >
        {/* min-w-0 on both children, not decoration: a grid item's automatic
            minimum size is its min-content width, and the wallet-config <pre>
            has a 640px longest line. Without it the single column at 375px is
            sized to that line, both items inflate to 642px, and everything past
            the viewport is eaten silently by html { overflow-x: clip } — the
            card's right edge, and the right half of the <pre>'s own scroll
            region, which is the thing that is supposed to be scrollable. */}
        <div className="grid gap-10 lg:grid-cols-[1.05fr_1fr] lg:gap-16">
          <Reveal className="min-w-0 flex flex-col items-start gap-4">
            <p className="eyebrow">{DEVELOPMENT_SECTION.eyebrow}</p>
            <h2 id="build-heading" className="h2">
              {DEVELOPMENT_SECTION.title}
            </h2>
            <p className="lead">{DEVELOPMENT_SECTION.body}</p>
            <div className="mt-2 flex flex-wrap items-center gap-3">
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
              {/* The community is already building: the Projects view. */}
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
          </Reveal>

          {/* The config integrators paste — the safe path is the easy path. */}
          <Reveal delay={0.1} className="min-w-0">
            <Card className="flex h-full flex-col gap-4 p-6">
              <p className="label-caps">{COMMUNITY_PAGE.walletConfigTitle}</p>
              <CopySnippet value={WALLET_CONFIG_SNIPPET} label="wallet config" />
              <dl className="grid gap-x-8 gap-y-3 border-t border-border/60 pt-4 sm:grid-cols-2">
                <div className="flex flex-col gap-1">
                  <dt className="label-caps">{ENDPOINT_LABELS.rpc}</dt>
                  <dd>
                    <CopyRef value={`${CHAIN.rpcUrl}/`} label="RPC URL" />
                  </dd>
                </div>
                <div className="flex flex-col gap-1">
                  <dt className="label-caps">{ENDPOINT_LABELS.chainId}</dt>
                  <dd>
                    <CopyRef
                      value={`${CHAIN.chainId} (${CHAIN.chainIdHex})`}
                      label="chain ID"
                    />
                  </dd>
                </div>
              </dl>
            </Card>
          </Reveal>
        </div>
      </Section>

      {/* ------------------------ Public RPC nodes ------------------------- */}
      <Section
        as="section"
        aria-labelledby="nodes-heading"
        id="nodes"
        className="scroll-mt-24"
      >
        <div className="flex flex-col gap-8">
          <Reveal className="flex flex-col gap-3">
            <p className="eyebrow text-teal-soft">{NODES_SECTION.eyebrow}</p>
            <h2 id="nodes-heading" className="h2">
              {NODES_SECTION.title}
            </h2>
            <p className="body">{NODES_SECTION.compactSub}</p>
          </Reveal>
          <NodesPanel variant="compact" initialDefinitions={infrastructure.rpcs} />
        </div>
      </Section>

      {/* ------------------------- Run your own node ------------------------ */}
      {/* The destination of the exchange warning's recommendation, so the
          anchor is load-bearing: EXCHANGE_WARNING.recommendCta points at
          /community#run-a-node from both of that card's placements.

          Laid out as a vertical sequence rather than a row of cards. Three
          columns invite reading in any order, and two of these steps carry
          attachments (the hardware table, the release link) that a third of
          the width would cramp. Top to bottom, the order is unambiguous and
          each step has room for the thing it needs. */}
      <Section
        as="section"
        id="run-a-node"
        aria-labelledby="run-a-node-heading"
        className="scroll-mt-24"
      >
        <div className="flex flex-col gap-10">
          <Reveal className="flex flex-col items-start gap-4">
            <p className="eyebrow">{COMMUNITY_PAGE.runNode.eyebrow}</p>
            <h2 id="run-a-node-heading" className="h2">
              {COMMUNITY_PAGE.runNode.title}
            </h2>
            <p className="lead max-w-[62ch]">{COMMUNITY_PAGE.runNode.lead}</p>
          </Reveal>

          <RevealGroup className="flex flex-col gap-5">
            {COMMUNITY_PAGE.runNode.steps.map((step, index) => (
              <RevealItem key={step.n}>
                <Card className="flex flex-col gap-5 p-6 sm:p-8">
                  {/* Number and title on one line, so the sequence is legible
                      before any of the detail under it. */}
                  <div className="flex items-baseline gap-4">
                    <span
                      aria-hidden
                      className="font-mono text-sm text-accent-soft"
                    >
                      {step.n}
                    </span>
                    <h3 className="h4 text-on-surface">{step.title}</h3>
                  </div>
                  <p className="body-sm max-w-[68ch]">{step.body}</p>

                  {/* Step one carries the specs, step two carries the link.
                      Keeping each attachment inside the step that needs it is
                      what removed the old "copy the release link above" —
                      an instruction that pointed at another part of the page. */}
                  {index === 0 ? (
                    <p className="label-caps border-t border-border/60 pt-5 text-on-surface-variant">
                      {COMMUNITY_PAGE.runNode.hardware.title}
                    </p>
                  ) : null}
                  {index === 0 ? (
                    <dl className="grid gap-x-8 gap-y-3 sm:grid-cols-3">
                      {COMMUNITY_PAGE.runNode.hardware.items.map((item) => (
                        <div key={item.label} className="flex flex-col gap-1">
                          <dt className="label-caps text-on-surface-variant">
                            {item.label}
                          </dt>
                          <dd className="font-mono text-sm text-on-surface">
                            {item.value}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  ) : null}
                  {index === 0 ? (
                    <p className="caption max-w-[68ch]">
                      {COMMUNITY_PAGE.runNode.hardware.storageNote}
                    </p>
                  ) : null}

                  {index === 1 ? (
                    <div className="flex flex-col gap-5 border-t border-border/60 pt-5 sm:flex-row sm:gap-10">
                      {/* min-w-0: the URL is one long unbreakable token and a
                          flex item's automatic minimum size is its content. */}
                      <div className="flex min-w-0 flex-col gap-1.5">
                        <p className="label-caps text-on-surface-variant">
                          {COMMUNITY_PAGE.runNode.release.label}
                        </p>
                        <CopyRef
                          value={COMMUNITY_PAGE.runNode.release.url}
                          label="release page link"
                        />
                      </div>
                      {/* The version is READ, never typed: the first draft of
                          this section named a release that had already been
                          superseded. When the manifest cannot be reached we
                          say where the truth lives instead of guessing. */}
                      <div className="flex min-w-0 flex-col gap-1.5">
                        <p className="label-caps text-on-surface-variant">
                          {release
                            ? COMMUNITY_PAGE.runNode.release.currentLabel
                            : COMMUNITY_PAGE.runNode.release.label}
                        </p>
                        {release ? (
                          <p className="font-mono text-sm text-on-surface">
                            {release.version}
                            {release.publishedAt ? (
                              <>
                                {" · "}
                                <time dateTime={release.publishedAt}>
                                  {releaseDate.format(
                                    new Date(release.publishedAt),
                                  )}
                                </time>
                              </>
                            ) : null}
                          </p>
                        ) : (
                          <p className="body-sm">
                            {COMMUNITY_PAGE.runNode.release.unavailable}
                          </p>
                        )}
                      </div>
                    </div>
                  ) : null}
                  {index === 1 ? (
                    <p className="caption">
                      {COMMUNITY_PAGE.runNode.release.historyNote}
                    </p>
                  ) : null}

                  {/* The recommended path for step three: hand the whole job
                      to an agent running on the operator's own machine. The
                      brief is GENERATED at /mining-onboarding.md so the
                      endpoints and the release it names track the rest of the
                      site, and it carries no install commands of its own. */}
                  {index === 2 ? (
                    <div className="flex flex-col gap-4 border-t border-border/60 pt-5">
                      <p className="label-caps text-accent-soft">
                        {COMMUNITY_PAGE.runNode.agent.title}
                      </p>
                      <p className="body-sm max-w-[68ch]">
                        {COMMUNITY_PAGE.runNode.agent.body}
                      </p>
                      {/* Not buried in the file: anyone giving an agent access
                          to their machine should see this before they start. */}
                      <p className="flex items-start gap-2.5 text-sm text-on-surface">
                        <ShieldCheck
                          className="mt-0.5 size-4 shrink-0 text-accent-teal"
                          strokeWidth={1.75}
                          aria-hidden
                        />
                        {COMMUNITY_PAGE.runNode.agent.safety}
                      </p>
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:gap-8">
                        <Button
                          href={COMMUNITY_PAGE.runNode.agent.download.href}
                          download
                          trailingIcon={
                            <Download
                              className="size-4"
                              strokeWidth={2}
                              aria-hidden
                            />
                          }
                        >
                          {COMMUNITY_PAGE.runNode.agent.download.label}
                        </Button>
                        <div className="flex min-w-0 flex-col gap-1.5">
                          <p className="label-caps text-on-surface-variant">
                            {COMMUNITY_PAGE.runNode.agent.linkLabel}
                          </p>
                          <CopyRef
                            value={COMMUNITY_PAGE.runNode.agent.url}
                            label="onboarding brief link"
                          />
                        </div>
                      </div>
                    </div>
                  ) : null}
                </Card>
              </RevealItem>
            ))}
          </RevealGroup>
        </div>
      </Section>

      {/* ------------------------- Public explorers ------------------------ */}
      {/* Independently run windows onto the same chain, listed after the
          node walkthrough because they are what a fresh operator checks a
          node against. External links, new tab. */}
      <Section
        as="section"
        id="explorers"
        aria-labelledby="explorers-heading"
        className="scroll-mt-24"
      >
        <div className="flex max-w-3xl flex-col gap-8">
          <Reveal className="flex flex-col gap-4">
            <h2 id="explorers-heading" className="h2">
              {COMMUNITY_PAGE.explorers.title}
            </h2>
            <p className="lead max-w-[62ch]">{COMMUNITY_PAGE.explorers.lead}</p>
          </Reveal>
          <RevealGroup className="flex flex-wrap items-center gap-3">
            {infrastructure.explorers.map((explorer) => (
              <RevealItem key={explorer.url}>
                <Button
                  href={explorer.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  variant="ghost"
                  trailingIcon={
                    <ArrowUpRight
                      className="size-4"
                      strokeWidth={2}
                      aria-hidden
                    />
                  }
                >
                  {explorer.name}
                </Button>
              </RevealItem>
            ))}
          </RevealGroup>
        </div>
      </Section>

      {/* -------------------------- Public mining ------------------------- */}
      <Section
        as="section"
        id="public-mining"
        aria-labelledby="public-mining-heading"
        className="scroll-mt-24"
      >
        <div className="flex max-w-3xl flex-col gap-8">
          <Reveal className="flex flex-col gap-4">
            <h2 id="public-mining-heading" className="h2">
              {COMMUNITY_PAGE.publicMining.title}
            </h2>
            <p className="lead max-w-[62ch]">{COMMUNITY_PAGE.publicMining.lead}</p>
          </Reveal>
          <RevealGroup className="flex flex-wrap items-center gap-3">
            {infrastructure.communityPools.map((service) => (
              <RevealItem key={service.url}>
                <Button
                  href={service.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  variant="ghost"
                  trailingIcon={
                    <ArrowUpRight
                      className="size-4"
                      strokeWidth={2}
                      aria-hidden
                    />
                  }
                >
                  {service.name}
                </Button>
              </RevealItem>
            ))}
          </RevealGroup>
        </div>
      </Section>

      {/* -------------------------- Suggestion box ------------------------- */}
      <Section
        as="section"
        id="suggestions"
        aria-labelledby="suggestions-heading"
        className="scroll-mt-24"
      >
        <div className="grid items-start gap-10 lg:grid-cols-[minmax(0,0.78fr)_minmax(0,1.22fr)] lg:gap-16">
          <Reveal className="flex min-w-0 flex-col items-start gap-4">
            <p className="eyebrow">{COMMUNITY_PAGE.suggestionBox.eyebrow}</p>
            <h2 id="suggestions-heading" className="h2">
              {COMMUNITY_PAGE.suggestionBox.title}
            </h2>
            <p className="lead">{COMMUNITY_PAGE.suggestionBox.body}</p>
          </Reveal>

          {/* Collapsed by default: the trigger button is all that renders
              until someone asks for the form (SuggestionDisclosure). */}
          <Reveal delay={0.1} className="min-w-0">
            <SuggestionDisclosure />
          </Reveal>
        </div>
      </Section>

      {/* The legal close uses the same prominent trust treatment as Home. */}
      <Section as="section" aria-label="Legal">
        <Disclaimer variant="banner" />
      </Section>
    </>
  );
}
