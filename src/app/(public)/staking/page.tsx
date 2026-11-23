import { TestnetLink } from "@/components/testnet/TestnetLink";
import type { Metadata } from "next";
import type { CSSProperties } from "react";
import { ArrowUpRight, Hourglass } from "lucide-react";
import { Section } from "@/components/ui/Section";
import { PageHero } from "@/components/site/PageHero";
import { StakingArt } from "@/components/site/PageHeroArt";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { CopyRef } from "@/components/ui/CopyRef";
import { Reveal, RevealGroup, RevealItem } from "@/components/ui/Reveal";
import { Disclaimer } from "@/components/site/Disclaimer";
import { MAINNET_EXPLORER_URL } from "@/lib/chain/mainnet-endpoints";
import { cn } from "@/lib/utils/cn";
import {
  CHAIN,
  META_DESCRIPTIONS,
  STAKING_PAGE,
  STATS_SECTION,
} from "@/lib/content/site";

export const metadata: Metadata = {
  title: "Staking",
  // Purpose-written, not the page intro: the intro is 235 characters and a
  // search result cuts it off mid-sentence at ~160.
  description: META_DESCRIPTIONS.staking,
};

/**
 * Staking — participation without hardware. Order: intro, the status card
 * first (the coming replacement and the explorer link), the candour block,
 * the on-chain facts (contract + pools, copyable),
 * how the contract works, and the non-affiliation disclaimer.
 */
export default function StakingPage() {
  return (
    <>
      {/* ------------------------------- Hero ------------------------------- */}
      <Section as="section" aria-labelledby="staking-title">
        <PageHero
          titleId="staking-title"
          title={STAKING_PAGE.title}
          subtitle={STAKING_PAGE.subtitle}
          intro={STAKING_PAGE.intro}
          art={<StakingArt />}
          label="staking"
        />
      </Section>

      <Section><TestnetLink headingLevel={2} /></Section>

      {/* ------------------------- Status, up front ------------------------- */}
      {/* Keep the launch status above the contract explanation. */}
      <Section as="section" aria-labelledby="status-heading">
        <Reveal>
          <div className="rounded-2xl border border-accent/30 bg-accent/5 p-6 sm:p-8">
            <div className="flex flex-col gap-3">
              <h2 id="status-heading" className="h3 flex items-start gap-3">
                <Hourglass
                  className="mt-1 size-5 shrink-0 text-accent-soft sm:mt-1.5"
                  strokeWidth={1.75}
                  aria-hidden
                />
                {STAKING_PAGE.status.title}
              </h2>
              {/* max-w-none is load-bearing: .body and .body-sm bake a 68ch
                  measure in globals.css, and the owner wants this card's copy
                  to run the card's whole width (2026-08-13). */}
              <p className="body max-w-none">{STAKING_PAGE.status.body}</p>
              <p className="body-sm max-w-none">
                {STAKING_PAGE.status.meanwhile}
              </p>
              <div className="mt-2">
                <Button
                  href={MAINNET_EXPLORER_URL}
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
                  {STATS_SECTION.viewAll.label}
                </Button>
              </div>
            </div>
          </div>
        </Reveal>
      </Section>

      {/* ------------------------- Candour, up front ------------------------ */}
      <section
        aria-labelledby="honest-heading"
        className="full-bleed section-surface"
      >
        <Section className="grid gap-10 py-16 sm:py-20 lg:grid-cols-[1fr_1.6fr] lg:gap-16">
          <Reveal>
            <h2 id="honest-heading" className="h2 max-w-[16ch]">
              {STAKING_PAGE.honest.title}
            </h2>
          </Reveal>

          {/* Each point carries a gradient node — the timeline's Genesis mark,
              reused as a stamp of things we stand behind. */}
          <RevealGroup className="flex flex-col">
            {STAKING_PAGE.honest.points.map((point, i) => (
              <RevealItem
                key={point}
                className={cn(
                  "flex items-start gap-4 py-6",
                  i > 0 && "border-t border-border/60",
                )}
              >
                <span
                  aria-hidden
                  className="mt-[0.55rem] size-[11px] shrink-0 rounded-full bg-gradient-accent shadow-glow-sm"
                />
                <p className="max-w-[56ch] text-base leading-relaxed text-on-surface sm:text-lg">
                  {point}
                </p>
              </RevealItem>
            ))}
          </RevealGroup>
        </Section>
      </section>

      {/* --------------------------- On-chain facts -------------------------- */}
      <Section as="section" aria-labelledby="facts-heading">
        <div className="flex max-w-3xl flex-col gap-8">
          <Reveal>
            <h2 id="facts-heading" className="h2">
              {STAKING_PAGE.facts.title}
            </h2>
          </Reveal>

          <Reveal>
            <Card className="flex flex-col gap-5 p-6 sm:p-8">
              <div className="flex flex-col gap-1.5">
                <p className="label-caps">{STAKING_PAGE.facts.contractLabel}</p>
                <CopyRef
                  value={CHAIN.stakingContract}
                  label="staking contract"
                />
              </div>

              <div className="flex flex-col gap-1.5 border-t border-border/60 pt-5">
                <p className="label-caps">{STAKING_PAGE.facts.poolsLabel}</p>
                {/* /60 is the site's one divider alpha; this list was the only
                    /40 anywhere, and read a shade fainter than its own card. */}
                <ul className="flex flex-col divide-y divide-border/60">
                  {CHAIN.stakingPools.map((pool, i) => (
                    <li key={pool} className="flex items-center gap-4 py-2.5">
                      <span
                        aria-hidden
                        className="font-mono text-xs text-outline"
                      >
                        {`0${i + 1}`}
                      </span>
                      <CopyRef value={pool} label={`staking pool ${i + 1}`} />
                    </li>
                  ))}
                </ul>
              </div>
            </Card>
          </Reveal>
        </div>
      </Section>

      {/* ---------------------------- How it works --------------------------- */}
      <Section as="section" aria-labelledby="how-heading">
        <div className="flex flex-col gap-10">
          <Reveal>
            <h2 id="how-heading" className="h2">
              {STAKING_PAGE.how.title}
            </h2>
          </Reveal>

          {/* Vertical DAG rail (the timeline's cousin) with mono step numerals
              — deliberately not the mining page's three-column band.

              The rail is drawn twice, and that is the point. The outer div is
              the rail this page has always had: it carries the gradient, it is
              never transformed, and it therefore still paints with JS off, with
              the reveal chunk failed, and under reduced motion. The inner span
              is the lit copy that draws downward as the group arrives — the
              same "dark line stays, bright line is laid over it" grammar the
              mining steps and the community cross use. Putting [data-edge] on
              the rail itself would have made the rail its own animation: it
              rests at scaleY(0), so anyone who never gets the runtime would
              lose 302px of structure that renders today.

              The lit copy takes --edge-len: 100% because it is sized by its
              parent; the parent is still sized by top-4/bottom-8. It stays the
              group's first child so the numerals' :nth-child ladder and the
              paint order (rail behind the opaque numeral discs) are unchanged. */}
          <RevealGroup
            className="relative flex max-w-3xl flex-col gap-10 sm:gap-12"
            stagger={0.09}
          >
            <div
              aria-hidden
              className="absolute bottom-8 left-4 top-4 w-px bg-gradient-to-b from-accent/60 via-border to-border/30"
            >
              <span
                data-edge
                data-axis="y"
                style={{ "--edge-len": "100%" } as CSSProperties}
              />
            </div>
            {STAKING_PAGE.how.items.map((step, i) => (
              <RevealItem
                key={step.title}
                className="relative flex items-start gap-5 sm:gap-6"
              >
                {/* step-num, not tl-dot.is-lit: <Spine> writes .is-lit onto
                    .tl-dot elements, so borrowing that class would let the
                    home page's rail light numerals on this one. */}
                <span
                  aria-hidden
                  className="step-num flex size-8 shrink-0 items-center justify-center rounded-full border border-border-strong bg-elevated font-mono text-xs text-accent-soft"
                >
                  {`0${i + 1}`}
                </span>
                <div className="flex flex-col gap-2 pt-1">
                  <h3 className="h3">
                    <span className="sr-only">{`Step ${i + 1}: `}</span>
                    {step.title}
                  </h3>
                  <p className="body">{step.body}</p>
                </div>
              </RevealItem>
            ))}
          </RevealGroup>
        </div>
      </Section>

      {/* The legal close uses the same prominent trust treatment as Home. */}
      <Section as="section" aria-label="Legal">
        <Disclaimer variant="banner" />
      </Section>
    </>
  );
}
