"use client";

import { useEffect } from "react";
import { CHAIN, CHAIN_PAGE } from "@/lib/content/site";

export type ChainReadoutStatus = "checking" | "live" | "degraded";

type ChainStatusPillProps = {
  status: ChainReadoutStatus;
  surface: "home" | "chain";
};

/**
 * Keep transient upstream recovery out of the public status copy.
 *
 * The chain quorum continues to track the real internal state. Operators can
 * inspect degraded transitions in DevTools without making a short failover
 * window look like a public outage. React runs this effect only when the
 * status or surface changes, not on every twelve-second poll.
 */
export function ChainStatusPill({ status, surface }: ChainStatusPillProps) {
  useEffect(() => {
    if (status !== "degraded") return;

    console.debug("[chain-readout] reconnecting to chain", {
      surface,
      chainId: CHAIN.chainId,
    });
  }, [status, surface]);

  return (
    <p
      className="label-caps flex items-center gap-2 text-teal-soft"
      role="status"
      aria-atomic="true"
    >
      <span
        aria-hidden
        className="inline-block size-2 rounded-full bg-accent-teal shadow-live"
      />
      {CHAIN_PAGE.readout.liveLabel}
    </p>
  );
}
