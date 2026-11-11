import Image from "next/image";
import { ArrowRight } from "lucide-react";
import { Section } from "@/components/ui/Section";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { DagField } from "@/components/home/DagField";
import { HeroNode } from "@/components/home/HeroNode";
import { WordRotate } from "@/components/home/WordRotate";
import { HERO } from "@/lib/content/site";

/**
 * Home hero — full-bleed over the DAG constellation (DagField), with the
 * identity sequence resolving into "Community". The visual heading is
 * decorative (aria-hidden); the page's sr-only h1 carries the meaning.
 * Server component; DagField/WordRotate are its client leaves.
 */
export function Hero() {
  return (
    <section
      data-spine-hero
      /* No bottom border. The chain crosses this edge, and a hairline ruled
         across it read as a line the design had not asked for; the band below
         already separates itself with its own surface. */
      className="full-bleed relative -mt-10 overflow-hidden"
    >
      {/* Animated DAG background + legibility scrims. */}
      <div aria-hidden className="absolute inset-0">
        {/* Storm sky, the furthest-back layer: in front of the page colour
            and behind every chain. The purple swirl won the A/B on
            2026-08-13 (the blue-violet lightning sky is deleted) and runs
            at 0.75, the owner's pick after 0.15, 0.3 and 0.4. Arbitrary-value
            opacity so a missing scale step cannot silently drop the class
            and paint the sky at full strength. */}
        <Image
          src="/hero-storm-b.webp"
          alt=""
          fill
          priority
          sizes="100vw"
          className="object-cover opacity-[0.75]"
        />
        <DagField />
        {/* Bottom-up scrim keeps copy readable over the constellation. */}
        <div className="absolute inset-0 bg-gradient-to-t from-base-void via-base-void/40 to-transparent" />
        {/* Soft magenta bloom, centred on the BLOCK rather than on the hero.
            `hero-node-bloom` follows the same responsive 70%/92.5% anchor as
            the node and canvas, so the material light cannot drift from the
            point every chain aims at. */}
        <div className="hero-node-bloom absolute left-1/2 h-[18.2rem] w-[29.4rem] max-w-full -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent-magenta/10 blur-[77px]" />
      </div>

      {/* Full device height minus the sticky header (44px row + 32px padding
          + 1px border = 77px — keep in sync with Header.tsx) so the fold
          lands exactly on the hero's bottom edge. */}
      {/* z-10 keeps the copy and CTAs ABOVE the hero block, so its invisible
          hit area cannot steal a click from the primary button on short
          viewports where 70% down lands on the CTA row. The container itself
          passes pointer events through — otherwise this full-width box would
          swallow every click meant for the block — while each child takes
          them back, so text still selects and buttons still click. */}
      <Section className="hero-content pointer-events-none relative z-10 flex min-h-[calc(100svh-77px)] flex-col items-start justify-center gap-7 py-24 [&>*]:pointer-events-auto">
        <Chip className="animate-fade-in">{HERO.kicker}</Chip>

        {/* Decorative display heading: "BDAG" + the identity word sequence. */}
        <p aria-hidden className="display animate-fade-up">
          BDAG
          <br />
          <WordRotate />
        </p>

        <p className="lead max-w-[52ch] animate-fade-up text-on-surface [animation-delay:150ms]">
          {HERO.headline}
        </p>
        <p className="body max-w-[58ch] animate-fade-up [animation-delay:250ms]">
          {HERO.mission}
        </p>

        <div className="hero-actions mt-2 flex flex-wrap items-center gap-4 animate-fade-up [animation-delay:350ms]">
          <Button
            href={HERO.ctaPrimary.href}
            size="lg"
            trailingIcon={
              <ArrowRight
                className="size-4 transition-transform group-hover:translate-x-0.5"
                strokeWidth={2}
                aria-hidden
              />
            }
          >
            {HERO.ctaPrimary.label}
          </Button>
          <Button href={HERO.ctaSecondary.href} variant="ghost" size="lg">
            {HERO.ctaSecondary.label}
          </Button>
        </div>
      </Section>

      {/* The scroll affordance is now a BLOCK: one hollow ring at 30% up from
          the hero's bottom edge — the point every chain in the field aims at —
          with the chain descending from it into the site-wide spine. */}
      <HeroNode />
    </section>
  );
}
