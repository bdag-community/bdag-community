import { Section } from "@/components/ui/Section";
import { Disclaimer } from "@/components/site/Disclaimer";
import { Hero } from "@/components/home/Hero";
import { StatsBand } from "@/components/home/StatsBand";
import { ExchangeWarning } from "@/components/home/ExchangeWarning";
import { Timeline } from "@/components/home/Timeline";
import { Participate } from "@/components/home/Participate";
import { NewsPreview } from "@/components/home/NewsPreview";
import { Spine } from "@/components/spine/Spine";
import { HOME_HEADLINE } from "@/lib/content/site";

// Public news is regenerated in the background; this must remain a literal
// because Next validates route-segment revalidation values at build time.
export const revalidate = 600;

/**
 * Home — the community's front door. Order tells the story: who we are
 * (hero), proof the network is alive (stats), what integrators must know
 * (fork warning), how we got here (timeline), how to take part (mine/stake/
 * build), what we're saying (news), and who we are not (disclaimer).
 */
export default function HomePage() {
  return (
    <>
      {/* The spine is mounted HERE, not in the layout, because home is the only
          page that draws it: it is the hero's chain continued, and there is no
          hero to continue anywhere else. Mounting it in the layout put 295
          hydrated elements, 13.2 KB of SSR markup and ~25 KB of JS on six pages
          that had nothing for it to describe. It must be the first child of the
          fragment so it is the first child of <main> — <Spine> resolves its
          wrapper as main's parent, and being out of flow it takes no gap. */}
      <Spine />

      {/* The visual hero heading is decorative; this is the real page h1. */}
      <h1 className="sr-only">{HOME_HEADLINE}</h1>

      <Hero />
      <StatsBand />
      <ExchangeWarning />
      <Timeline />
      <Participate />
      <NewsPreview />

      <Section>
        <Disclaimer variant="banner" />
      </Section>
    </>
  );
}
