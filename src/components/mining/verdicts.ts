import type { NodeVerdict } from "@/lib/chain/node-verdict";

/**
 * Verdict presentation, in one place.
 *
 * The node board now renders in two shapes — the seven full cards on The Chain
 * and the compact strip on Mining — and both draw the same chip. Kept as two
 * copies of the map, the two surfaces would eventually disagree about what a
 * fork looks like, and the one word a reader most needs to trust ("Fork
 * detected") would be the word that drifted. So it lives here and both import
 * it.
 */

export type VerdictUi = {
  /** Always rendered. Colour is never the only channel — every state has a word. */
  label: string;
  /** Dot fill for the chip's leading marker. */
  dot: string;
  /** Border + fill + text for the chip itself. */
  chip: string;
};

export const VERDICT_UI: Record<NodeVerdict, VerdictUi> = {
  canonical: {
    label: "In sync",
    dot: "bg-success shadow-[0_0_10px_rgba(64,221,130,0.7)]",
    chip: "border-success/30 bg-success/10 text-success",
  },
  behind: {
    // Orange, not red: a node that agrees on every block it has but lags the
    // head is stalled or syncing, and reads that way. Red is for the fork,
    // which only a settled block-hash mismatch can earn (node-verdict.ts).
    label: "Behind",
    dot: "bg-warn-orange",
    chip: "border-warn-orange/40 bg-warn-orange/10 text-warn-orange",
  },
  diverged: {
    // "Fork", not "Fork detected". The chip sits beside the endpoint's own
    // name, so the sentence a reader assembles is already "<that host>, fork",
    // and the extra word only softened it. This is the one chip on the site
    // that has to land on a first read.
    //
    // The host is deliberately not named in this comment: it may appear only
    // in site.ts and news-seed.ts, and a test scans all of src/ for it. That
    // guard caught this exact comment on the first run.
    label: "Fork",
    dot: "bg-error",
    chip: "border-error/40 bg-error/10 text-error",
  },
  "wrong-chain": {
    label: "Wrong chain",
    dot: "bg-error",
    chip: "border-error/40 bg-error/10 text-error",
  },
  degraded: {
    label: "Degraded",
    dot: "bg-warn-orange",
    chip: "border-warn-orange/40 bg-warn-orange/10 text-warn-orange",
  },
  offline: {
    label: "Offline",
    dot: "bg-outline",
    chip: "border-border-strong bg-elevated text-on-surface-variant",
  },
};
