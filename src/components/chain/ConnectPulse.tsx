"use client";

import { useChainHeight } from "@/components/chain/ChainReadout";
import { CHAIN, CHAIN_PAGE } from "@/lib/content/site";
import { cn } from "@/lib/utils/cn";

const DASH = "—";
const grouped = new Intl.NumberFormat("en");

/**
 * The live hairline inside the connect card: is the endpoint you are about to
 * copy answering right now, what head is it at, and does it identify as the
 * chain this page says it is.
 *
 * It reads the readout's snapshot rather than fetching its own. The four
 * values above it are configuration and never change; this line is the only
 * thing in that card that moves, and it must move on the same twelve-second
 * beat as everything else on the page — a second poller at a second cadence
 * would show a different head to the one in the band a screen higher up, and
 * two different heads on one page is worse than no head at all.
 */
export function ConnectPulse() {
  const { snapshot, degraded, height } = useChainHeight();
  const copy = CHAIN_PAGE.connect;

  // Before the first response we know nothing, and BOTH readings below say so
  // rather than reporting a finding. This card's whole job is to be the
  // endpoint you trust, so for the first twelve seconds of every visit it must
  // not assert that the canonical RPC is silent or that its chain id failed to
  // match — it has not asked yet. The dot already carried the distinction
  // (outline and pulsing for "still asking", warn-orange for "asked and got
  // nothing back"); the words carry it too now.
  const checking = snapshot === null && !degraded;
  const answering = snapshot !== null && !degraded && snapshot.blockHeight !== null;
  const verified = answering && snapshot.chainId === CHAIN.chainId;

  return (
    <p className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-xs text-on-surface-variant">
      {/* The live region covers the state words only, and holds no numeral.
          "It started answering again" is worth interrupting someone for; a
          head that moves every twelve seconds is not, so the height below sits
          outside this element and is read on demand like every other figure. */}
      <span
        role="status"
        aria-atomic="true"
        className={cn(
          "inline-flex items-center gap-2",
          answering ? "text-teal-soft" : "text-on-surface-variant",
        )}
      >
        <span
          aria-hidden
          className={cn(
            "inline-block size-2 rounded-full",
            answering
              ? "bg-accent-teal shadow-live"
              : checking
                ? "animate-pulse bg-outline"
                : "bg-warn-orange",
          )}
        />
        {answering ? copy.liveOk : checking ? copy.liveChecking : copy.liveDown}
      </span>

      <span aria-hidden className="text-outline">
        ·
      </span>

      {/* Deliberately outside the status region: this number changes on every
          poll, and a height announced five times a minute is not information,
          it is interruption. It is read on demand like every other numeral. */}
      <span>
        {CHAIN_PAGE.readout.stats[0].label}{" "}
        <span className="tabular-nums text-on-surface">
          {height === null ? DASH : grouped.format(height)}
        </span>
      </span>

      <span aria-hidden className="text-outline">
        ·
      </span>

      <span>
        {verified
          ? copy.verified
          : checking
            ? copy.verifyChecking
            : copy.unverified}
      </span>
    </p>
  );
}
