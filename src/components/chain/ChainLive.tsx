"use client";

import { ThroughputChart } from "@/components/chain/ThroughputChart";
import { useChainSnapshot } from "@/components/chain/ChainReadout";
import { CHAIN_PAGE } from "@/lib/content/site";

/**
 * The small live readers the page needs outside the readout band.
 *
 * /chain is a server component, so anything that has to see the snapshot needs
 * a client boundary of its own. These four are it. Every one of them reads the
 * SAME store ChainReadout owns — mounting them costs no extra request, because
 * the poll belongs to that module rather than to whichever component happened
 * to mount first. Nothing here fetches, and nothing here may be given its own
 * interval: two pollers at two cadences would put two different heads on one
 * page, which is worse than showing no head at all.
 */

const DASH = "—";
const grouped = new Intl.NumberFormat("en");


/* ---------------------------------------------------------------------------
 * Section 6 — the 24-hour producer floor
 * ------------------------------------------------------------------------- */

/**
 * The accumulator's count, with the sentence that makes it honest attached.
 * It is a floor and it resets on deploy, and the note saying so is not
 * optional decoration — without it the number reads as a census of miners.
 */
export function ChainProducerDay() {
  const { snapshot } = useChainSnapshot();
  const n = snapshot?.activeMiners ?? null;
  return (
    <div className="flex flex-col gap-1.5">
      <p className="body-sm text-on-surface">
        {CHAIN_PAGE.pow.dayTemplate.replace(
          "{n}",
          n === null ? DASH : grouped.format(n),
        )}
      </p>
      <p className="caption">{CHAIN_PAGE.pow.dayNote}</p>
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * Section 7 — the chart, the three EVM readings, and the arithmetic ceiling
 * ------------------------------------------------------------------------- */

/**
 * The 31-day chart. It polls /api/chain-history on its own thirty-minute beat,
 * which is as fast as a day's total can change, and takes nothing from the
 * page's snapshot: the "observed by this server" line it used to be handed was
 * a third rate figure beside the band's own TPS numeral and the chart's daily
 * averages, measured over a third window.
 */
export function ChainThroughput({ className }: { className?: string }) {
  return <ThroughputChart className={className} />;
}
