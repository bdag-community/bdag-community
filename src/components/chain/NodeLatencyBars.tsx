"use client";

import { VERDICT_UI } from "@/components/mining/verdicts";
import type { NodesSnapshot } from "@/lib/chain/nodes";
import { CHAIN_PAGE, type NodeDef } from "@/lib/content/site";

/**
 * Response time per public RPC node — one round trip, measured from this
 * site's server.
 *
 * Two decisions carry this component.
 *
 * (1) The scale is the tallest bar in the CURRENT snapshot, rounded up to the
 * next 100 ms, and that number is printed at the end of the axis. There is no
 * absolute standard for "a fast RPC node" and inventing one (500 ms? 1000 ms?)
 * would put a made-up denominator underneath a real measurement. Relative to
 * this snapshot, stated as such, is the honest scale.
 *
 * (2) Only canonical and community endpoints get the live turquoise. Flagged
 * and retired ones are drawn in grey no matter how quickly they answer,
 * because teal on this site means "live and good" and a fast fork is still a
 * fork. Speed is not endorsement, and a reader skimming bar colours must not
 * be able to read it as one. NodeStatus carries no role — role lives in the
 * directory definitions — so the snapshot is joined to it by id, as NodesPanel
 * already does.
 */

export type NodeLatencyBarsProps = {
  /** The same snapshot NodesPanel is polling; no second poller is opened. */
  snapshot: NodesSnapshot | null;
  initialDefinitions: NodeDef[];
};

/** Grey for the endpoints we would not have anyone use. */
const FILL_BY_ROLE: Record<NodeDef["role"], string> = {
  canonical: "bg-accent-teal",
  community: "bg-accent-teal",
  flagged: "bg-outline",
  legacy: "bg-outline",
};

export function NodeLatencyBars({ snapshot, initialDefinitions }: NodeLatencyBarsProps) {
  const statusById = new Map(snapshot?.nodes.map((n) => [n.id, n]) ?? []);
  const definitions = snapshot?.definitions ?? initialDefinitions;

  const measured = definitions.map(
    (node) => statusById.get(node.id)?.latencyMs ?? null,
  ).filter((ms): ms is number => ms !== null);

  // Next 100 ms above the slowest answer in this snapshot. The floor of 100
  // keeps the axis sane if every node happens to answer in single digits.
  const scaleMax =
    measured.length > 0
      ? Math.max(100, Math.ceil(Math.max(...measured) / 100) * 100)
      : null;

  return (
    <div className="flex flex-col gap-4">
      <h3 className="h4 text-on-surface">{CHAIN_PAGE.nodes.latencyTitle}</h3>

      <dl className="flex flex-col gap-3">
        {definitions.map((node) => {
          const status = statusById.get(node.id) ?? null;
          const latency = status?.latencyMs ?? null;
          const width =
            latency !== null && scaleMax !== null
              ? Math.max(0, Math.min(100, (latency / scaleMax) * 100))
              : 0;

          return (
            <div
              key={node.id}
              className="grid grid-cols-1 items-center gap-x-4 gap-y-1 sm:grid-cols-[minmax(0,15rem)_minmax(0,1fr)]"
            >
              <dt className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 font-mono text-xs text-on-surface-variant">
                <span className="min-w-0 break-all">{node.name}</span>
                {node.responseTimeLabel ? (
                  <span
                    className={[
                      "inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-[0.14em]",
                      node.role === "flagged"
                        ? "border-error/40 bg-error/10 text-error"
                        : "border-border-strong bg-elevated text-on-surface-variant",
                    ].join(" ")}
                  >
                    {node.responseTimeLabel}
                  </span>
                ) : null}
              </dt>
              <dd className="flex min-h-[1.5rem] items-center gap-3">
                {latency !== null ? (
                  // .viz: forced colours drop the whole bar rather than paint
                  // it in the system foreground, where every node would look
                  // identical. The millisecond value beside it never leaves.
                  <span
                    aria-hidden
                    className="viz h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-border/50"
                  >
                    <span
                      className={[
                        "block h-full rounded-full transition-[width] duration-[400ms] ease-out",
                        FILL_BY_ROLE[node.role],
                      ].join(" ")}
                      style={{ width: `${width}%` }}
                    />
                  </span>
                ) : (
                  // No answer, so no bar to draw. The verdict word goes here
                  // instead — the same chip the board above uses, so the two
                  // readings of the same node can never contradict each other.
                  <span
                    aria-hidden
                    className={[
                      "inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 font-mono text-[11px] uppercase tracking-[0.14em]",
                      status
                        ? VERDICT_UI[status.verdict].chip
                        : "border-border bg-elevated text-on-surface-variant",
                    ].join(" ")}
                  >
                    {status ? VERDICT_UI[status.verdict].label : "Checking"}
                  </span>
                )}
                <span className="ml-auto shrink-0 font-mono text-xs tabular-nums text-on-surface">
                  {latency !== null ? `${latency} ms` : "—"}
                </span>
              </dd>
            </div>
          );
        })}
      </dl>

      {/* The axis, aligned under the bar column at sm+. Screen readers already
          have every exact value from the <dl>, so this is decoration for the
          sighted reading only.

          The zero at the left end is gone: a bar chart that grows rightward
          from a shared left edge already says where zero is, and printing it
          only drew the eye to the least informative point on the scale. The
          upper bound stays, because that one is not implied by anything. */}
      <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-[minmax(0,15rem)_minmax(0,1fr)]">
        <span aria-hidden className="hidden sm:block" />
        <p
          aria-hidden
          className="flex items-center justify-end font-mono text-[11px] tabular-nums text-outline"
        >
          <span>{scaleMax !== null ? `${scaleMax} ms` : "—"}</span>
        </p>
      </div>
    </div>
  );
}
