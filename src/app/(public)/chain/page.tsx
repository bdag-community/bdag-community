import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Info } from "lucide-react";
import { Section } from "@/components/ui/Section";
import { Card } from "@/components/ui/Card";
import { Reveal, RevealGroup, RevealItem } from "@/components/ui/Reveal";
import { Disclaimer } from "@/components/site/Disclaimer";
import { ExchangeWarning } from "@/components/home/ExchangeWarning";
import { MainnetWalletConfig } from "@/components/chain/MainnetConnection";
import { NodesPanel } from "@/components/mining/NodesPanel";
import { ChainPrimer } from "@/components/chain/ChainPrimer";
import { DagSchematic } from "@/components/chain/DagSchematic";
import {
  ChainProducerBars,
  ChainProducerHeading,
  ChainReadout,
  ChainTicker,
} from "@/components/chain/ChainReadout";
import {
  ChainProducerDay,
  ChainThroughput,
} from "@/components/chain/ChainLive";
import { ConnectPulse } from "@/components/chain/ConnectPulse";
import {
  CHAIN_PAGE,
  META_DESCRIPTIONS,
  MINING_SECTION,
  PROJECTS_SECTION,
  STAKING_SECTION,
} from "@/lib/content/site";
import { JsonLd } from "@/components/seo/JsonLd";
import { getInfrastructureDirectory } from "@/lib/infrastructure";
import { breadcrumbSchema, chainSchema } from "@/lib/seo/structured-data";

export const metadata: Metadata = {
  title: "The Chain",
  // The interactive primer is written for someone already on the page; the
  // compact description is written for search and share results instead.
  description: META_DESCRIPTIONS.chain,
};
export const dynamic = "force-dynamic";

/**
 * The Chain — the live instrument first, the architecture second, the
 * boundary last. Order: a plain-language DAG / EVM / proof-of-work primer so
 * the numbers land on a reader who has never heard of any of them; the shape
 * (prose, the schematic, its caveat and the architecture reference); the
 * readout (numerals + the two honest gauges + the interval baselines); the
 * latest blocks and their producers; the node board, so a reader who has just
 * seen live numbers can immediately see which endpoints those numbers can be
 * checked against; then timing and execution, where each live number earns its
 * explanation; the canonical endpoints; one boundary rail covering how to read
 * the page and where it stops; and the non-affiliation disclaimer.
 *
 * Two rules this page exists to honour. (1) No gauge without a real
 * denominator: block gas limit is the only ceiling this chain publishes, so
 * it gets the only dial. (2) No measured figure is ever written into copy —
 * site.ts holds templates with {placeholders}; the numbers are interpolated
 * live. See CHAIN_PAGE's header comment.
 *
 * A third rule, learned the hard way and now pinned by test ("the page says
 * each thing once"): a caveat belongs in ONE place, the one closest to what it
 * qualifies. This page had grown two calibration sections in a row and four
 * disclosures stated twice — the hash/receipt distinction as both a pull quote
 * and a card, the no-hashrate note in both the producers section and the
 * boundary rail, the schematic caveat beside the drawing and again eight
 * screens later. A reader told the same thing four times stops reading.
 *
 * This file is a server component and stays one. Every live figure arrives in
 * the browser through ChainReadout's single /api/stats poll (plus the chart's
 * own half-hourly read of /api/chain-history), the same way Home and Mining
 * already work. The page itself reads the admin-managed RPC directory so a
 * removed endpoint cannot linger in the initial server-rendered board.
 */
export default async function ChainPage() {
  const infrastructure = await getInfrastructureDirectory();
  return (
    <>
      {/* Chain ID, currency and the canonical endpoints as data. The page
          argues this in prose for a reader; a crawler asked "which chain ID
          is BlockDAG" should not have to infer it from the argument. */}
      <JsonLd data={chainSchema()} />
      <JsonLd data={breadcrumbSchema([{ name: "The Chain", path: "/chain" }])} />

      {/* ----------------------------- Primer ------------------------------ */}
      <Section as="section" aria-labelledby="chain-title">
        <ChainPrimer />
      </Section>

      {/* ---------------------------- The shape ----------------------------- */}
      {/* Deliberately NOT banded. A reader who has never met a DAG needs this
          before the wall of numbers, and it should feel like the page talking
          to them rather than a pull-out they can skip. */}
      <Section
        as="section"
        id="shape"
        aria-labelledby="shape-heading"
        className="scroll-mt-24"
      >
        <div className="flex flex-col gap-8">
          <Reveal className="flex flex-col gap-4">
            <p className="eyebrow">{CHAIN_PAGE.shape.eyebrow}</p>
            <h2 id="shape-heading" className="h2">
              {CHAIN_PAGE.shape.title}
            </h2>
            {CHAIN_PAGE.shape.body.map((paragraph) => (
              <p key={paragraph} className="body">
                {paragraph}
              </p>
            ))}
          </Reveal>

          {/* Server component, zero JS. Everything that moves in it is a CSS
              keyframe, gated on this <Reveal>'s `.is-in`. It renders its own
              <figure> and <figcaption> — do not add a second caption here. */}
          <Reveal className="w-full max-w-6xl">
            <DagSchematic />
          </Reveal>

          {/* The caveat, small, immediately beneath the drawing. It used to
              be an accent callout box, which gave a disclaimer more visual
              weight than the thing it disclaims. Its POSITION is still not
              negotiable and is pinned by test: the RPC returns a singular
              parentHash, so a multi-parent picture that is not disclosed as a
              schematic is the biggest honesty trap on this page. Small is
              fine. Absent, or below the fold, is not.

              The icon is decoration and is aria-hidden: the sentence is the
              disclosure and has to survive on its own for anyone who cannot
              see the glyph. `shrink-0` and the top margin keep it on the first
              line rather than centring it against a wrapped paragraph. */}
          <Reveal>
            <p className="caption flex max-w-[76ch] items-start gap-2">
              <Info
                className="mt-[0.15rem] size-4 shrink-0 text-outline"
                strokeWidth={1.75}
                aria-hidden
              />
              <span>{CHAIN_PAGE.shape.schematicNote}</span>
            </p>
          </Reveal>
        </div>
      </Section>

      {/* --------------------------- Live readout --------------------------- */}
      {/* The page's ONE poller. It renders its own full-bleed <section id="live">
          with the connection pill, the four numerals, both arcs and the
          baseline strip; everything live below this point subscribes to the
          snapshot it already holds. */}
      <ChainReadout />

      {/* --------------------------- Latest blocks -------------------------- */}
      {/* Pulled up against the readout band. <main> puts gap-20/sm:gap-24
          between every top-level section, and the band adds its own
          py-16/sm:py-20 on top of that, so the distance from the last live
          numeral to this heading was roughly double every other section break
          on the page. The negative margin cancels the band's bottom padding
          and leaves a clear band of space under the tint. This table reads the
          same snapshot the band above it does, so sitting closer to it is also
          the right relationship. */}
      <Section
        as="section"
        aria-labelledby="ticker-heading"
        className="-mt-12 sm:-mt-16"
      >
        {/* Two readings of the same fifty blocks, side by side on a desktop
            and stacked on a phone: what landed, and who produced it. They were
            four sections apart, which meant a reader met the producer count
            long after the table it is counted from. The bars column is
            narrower because it is a distribution rather than a record. */}
        <div className="grid gap-10 lg:grid-cols-[1.35fr_1fr] lg:gap-12">
        {/* min-w-0 is load-bearing (same reason as the connect snippet below):
            a grid item's automatic minimum size is its min-content width, and
            the block table's is ~450px. Without it the single-column grid at
            phone widths is sized to that table, the page inflates past the
            viewport, and the row scrolls the document instead of scrolling
            inside its own overflow-x-auto frame. */}
        <div className="flex min-w-0 flex-col gap-5">
          {/* Set as an eyebrow, not as a display h2: the table under it is the
              content and a display heading would compete with it. It wears
              .eyebrow rather than .label-caps so it carries the same colour as
              every other section title on the page. It was the one caps
              heading here painted grey, which read as a table caption rather
              than as the start of a section. Still an h2: the heading order is
              the document's structure, not its type scale. */}
          <h2 id="ticker-heading" className="eyebrow">
            {CHAIN_PAGE.ticker.title}
          </h2>
          {/* The table sits on a real surface now. Bare, capped at 68ch, it
              stopped halfway across the column and read as unfinished markup
              rather than as the instrument it is — every other live reading on
              this page is framed. `p-0` because the table brings its own cell
              padding, and `overflow-hidden` so the scroll container's corners
              follow the card's radius. */}
          <Card className="max-w-3xl overflow-hidden p-0">
            <ChainTicker />
          </Card>
          <p className="caption max-w-[72ch]">{CHAIN_PAGE.ticker.note}</p>
        </div>

        {/* The producer bars, moved up from the proof-of-work section. Its
            prose column was removed at the owner's request; the two caveats
            that column carried (a producer address is not a miner, and no
            hashrate can be read off this chain) moved into the boundary rail
            rather than being deleted with it.

            The live count keeps its own heading and is deliberately NOT this
            section's aria-labelledby target: a landmark whose name changes
            five times a minute is a landmark nobody can return to. */}
        <section
          id="producers"
          aria-labelledby="producers-heading"
          className="flex scroll-mt-24 flex-col gap-5"
        >
          <h2 id="producers-heading" className="eyebrow">
            {CHAIN_PAGE.pow.windowLabel}
          </h2>
          <Card className="flex flex-col gap-5 p-5 sm:p-6">
            <ChainProducerHeading />
            <ChainProducerBars />
            <ChainProducerDay />
            {/* Both caveats were boundary-rail items until that rail was
                removed. They are inline here rather than gone because this is
                the one place on the site a reader goes looking for a hashrate,
                and the second sentence is the site's ONLY statement that no
                BlockDAG hashrate can be read off this chain. Test-pinned at
                exactly one occurrence; do not shorten. */}
            <p className="caption border-t border-border/60 pt-4">
              {CHAIN_PAGE.pow.caveat}
            </p>
          </Card>
        </section>
        </div>
      </Section>

      {/* ------------------------ Node status board ------------------------- */}
      <Section
        as="section"
        id="nodes"
        aria-labelledby="nodes-heading"
        className="scroll-mt-24"
      >
        <div className="flex flex-col gap-8">
          <Reveal className="flex flex-col gap-3">
            {/* Live telemetry wears turquoise (DESIGN.md accent roles). */}
            <p className="eyebrow text-teal-soft">{CHAIN_PAGE.nodes.eyebrow}</p>
            <h2 id="nodes-heading" className="h2">
              {CHAIN_PAGE.nodes.title}
            </h2>
            {/* Why the check is possible at all is now part of this sentence
                rather than a second paragraph restating it. */}
            <p className="lead">{CHAIN_PAGE.nodes.sub}</p>
          </Reveal>
          {/* The panel renders the latency bars, the freshness line and the
              flagged-endpoint note itself. Do not add a second set here. */}
          <NodesPanel variant="full" initialDefinitions={infrastructure.rpcs} />
          <p className="caption">{CHAIN_PAGE.nodes.credit}</p>
        </div>
      </Section>

      {/* ---------------------------- Execution ---------------------------- */}
      <Section
        as="section"
        id="capacity"
        aria-labelledby="evm-heading"
        className="scroll-mt-24"
      >
        <div className="flex flex-col gap-10">
          <Reveal className="flex flex-col items-start gap-4">
            <p className="eyebrow">{CHAIN_PAGE.evm.eyebrow}</p>
            <h2 id="evm-heading" className="h2">
              {CHAIN_PAGE.evm.title}
            </h2>
            {/* The hinge OPENS the section now. It is the sentence that makes
                DAG, proof of work and the EVM one story rather than a list of
                three features, and the paragraph that used to precede it spent
                its opening line two sentences early. */}
            <p className="lead text-on-surface">{CHAIN_PAGE.evm.hinge}</p>
            <p className="body">{CHAIN_PAGE.evm.gasNote}</p>
          </Reveal>

          {/* Renders its own h3, caption, the three labelled facts and both
              notes. The page must not repeat any of them. */}
          <Reveal>
            <ChainThroughput />
          </Reveal>

        </div>
      </Section>

      {/* --------------------------- Connect -------------------------------- */}
      <section
        id="connect"
        aria-labelledby="connect-heading"
        className="full-bleed section-surface scroll-mt-24"
      >
        <Section className="flex flex-col gap-10 py-16 sm:py-20">
          <Reveal className="flex flex-col gap-3">
            <p className="eyebrow">{CHAIN_PAGE.connect.eyebrow}</p>
            <h2 id="connect-heading" className="h2">
              {CHAIN_PAGE.connect.title}
            </h2>
            <p className="lead">{CHAIN_PAGE.connect.body}</p>
          </Reveal>

          {/* ONE card. The four-value endpoint list that used to sit beside
              this was deleted with the compact fork card: the fork warning
              below now carries Public RPC, Explorer and Chain ID exactly as it
              does on Home, and an integrator reading two lists of the same
              values has to check whether they agree.

              min-w-0 is load-bearing: a grid item's automatic minimum size is
              its min-content width, and this snippet's <pre> has a 640px
              longest line. Without it the column at 375px is sized to that
              line, the card inflates past the viewport, and html { overflow-x:
              clip } eats the overhang without ever showing a scrollbar. */}
          <Reveal className="min-w-0 max-w-3xl">
            <Card className="flex flex-col gap-4 p-6 sm:p-8">
              <h3 className="h4 text-on-surface">
                {CHAIN_PAGE.connect.snippetTitle}
              </h3>
              <p className="body-sm">{CHAIN_PAGE.connect.snippetNote}</p>
              <MainnetWalletConfig />
              {/* The one thing on this page that moves: is the endpoint you are
                  about to paste answering, and does it still identify as the
                  chain this page describes. It stays here rather than moving
                  into the shared fork card because it reads the snapshot, and
                  only ChainReadout.tsx may touch /api/stats. */}
              <div className="border-t border-border/60 pt-4">
                <ConnectPulse />
              </div>
            </Card>
          </Reveal>
        </Section>
      </section>

      {/* ---------------- Information for exchanges and integrators --------- */}
      {/* Home's card, unchanged and unwrapped. It brings its own <Section>,
          its own reveal and its own h2, so it is a named landmark an exchange
          can scan to rather than a note tucked inside another section. Its
          "View more" points at #nodes, which now sits ABOVE it, just before
          Timing. The link still lands: the id moved with the section. */}
      <ExchangeWarning />

      {/* --------------------------- Cross-links ---------------------------- */}
      <Section as="section" aria-label="Where to go next">
        {/* Three ways onward: participate with hardware, with stake, or
            with what the community has already built. */}
        <RevealGroup className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {[MINING_SECTION, STAKING_SECTION, PROJECTS_SECTION].map((section) => (
            <RevealItem key={section.title}>
              <Card
                interactive
                className="relative flex h-full flex-col items-start gap-2.5 p-6 sm:p-8"
              >
                <p className="eyebrow">{section.eyebrow}</p>
                {/* Whole card is one link (the ArticleCard pattern): the
                    heading link stretches over the card via after:inset-0. */}
                <h2 className="h3 text-on-surface">
                  <Link
                    href={section.more.href}
                    className="focus-ring after:absolute after:inset-0 after:rounded-2xl"
                  >
                    {section.title}
                  </Link>
                </h2>
                <p className="body">{section.body}</p>
                <p className="mt-auto inline-flex items-center gap-1.5 pt-4 text-sm font-medium text-accent-soft">
                  {section.more.label}
                  <ArrowRight className="size-4" strokeWidth={2} aria-hidden />
                </p>
              </Card>
            </RevealItem>
          ))}
        </RevealGroup>
      </Section>

      {/* The legal close uses the same prominent trust treatment as Home. */}
      <Section as="section" aria-label="Legal">
        <Disclaimer variant="banner" />
      </Section>
    </>
  );
}
