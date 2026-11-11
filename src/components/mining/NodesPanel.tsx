"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowRight } from "lucide-react";
import { NodeLatencyBars } from "@/components/chain/NodeLatencyBars";
import { VERDICT_UI } from "@/components/mining/verdicts";
import { Card } from "@/components/ui/Card";
import { NODES_POLL_MS } from "@/lib/chain/cadence";
import type { NodeStatus, NodesSnapshot } from "@/lib/chain/nodes";
import { NODES_SECTION, type NodeDef } from "@/lib/content/site";

// The client poll, the route's cache hint and the server's probe TTL are the
// same number, from one module. They used to be 10s, 10s and 20s, so half of
// these requests could only ever return bytes the client already had — 360
// requests an hour per open tab to learn 180 things.
const POLL_MS = NODES_POLL_MS;

/** Alt-tabbing back is a refetch, and alt-tabbing eight times in five seconds
 *  should not be eight. Anything inside this window is already in flight or
 *  was answered a moment ago. */
const MIN_REFETCH_MS = 2_000;

const numberFormat = new Intl.NumberFormat("en");

type PanelState = "checking" | "live" | "stale" | "unavailable";

/** Every word the board says about an endpoint lives in site.ts — "fully
 *  synced" in particular is an assertion, and assertions are reviewed there. */
const LABELS = NODES_SECTION.cardLabels;

/** The chip is the one thing both variants must render identically — a fork on
 *  Mining has to look and read exactly like the same fork on The Chain.
 *
 *  No live region here. The board's cards render side by side, and a live
 *  region per card announcing every verdict transition on the same poll is
 *  not several pieces of news, it is one piece of news read out over whatever
 *  the reader was actually doing. The panel keeps a single region below. */
function VerdictChip({
  status,
  panelState,
}: {
  status: NodeStatus | null;
  panelState: PanelState;
}) {
  const ui = status ? VERDICT_UI[status.verdict] : null;
  const waiting = panelState === "checking";
  return (
    <span
      className={[
        "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2 py-0.5 font-mono text-[11px] uppercase tracking-[0.14em]",
        ui ? ui.chip : "border-border bg-elevated text-on-surface-variant",
      ].join(" ")}
    >
      <span
        aria-hidden
        className={[
          "inline-block size-1.5 rounded-full",
          ui
            ? ui.dot
            : waiting
              ? "animate-pulse bg-outline"
              : "bg-warn-orange",
        ].join(" ")}
      />
      {ui ? ui.label : waiting ? LABELS.checking : LABELS.unavailable}
    </span>
  );
}

export type NodesPanelProps = {
  initialDefinitions: NodeDef[];
  /**
   * `"full"` is the board itself — one card per probed host plus the
   * response-time bars — and lives on The Chain. `"compact"` is the strip, one
   * row per host, that stays on
   * Mining, where the board is not the subject of the page but a reader who
   * arrived at /mining#nodes still deserves to land on the answer.
   */
  variant?: "full" | "compact";
};

/**
 * Node status board — live status + fork detection over the public RPC
 * endpoints (checked server-side via /api/nodes; visitors' browsers never
 * touch the endpoints, least of all the fork). Hosts render as TEXT, never
 * links, per the NODES `linkable` contract.
 *
 * Both variants start with server-rendered directory definitions, then use
 * the snapshot definitions after the first probe. Every known endpoint has a
 * row. The flagged one is never dropped for being
 * inconvenient and a fork is never zero-suppressed: if the compact strip is
 * the only board a reader sees, it still has to tell them the fork is out
 * there.
 */
export function NodesPanel({ variant = "full", initialDefinitions }: NodesPanelProps) {
  const [snapshot, setSnapshot] = useState<NodesSnapshot | null>(null);
  const [panelState, setPanelState] = useState<PanelState>("checking");
  const [agoSeconds, setAgoSeconds] = useState<number | null>(null);
  const lastLoadAt = useRef(0);

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;
    let cancelled = false;

    const load = async () => {
      const startedAt = Date.now();
      if (startedAt - lastLoadAt.current < MIN_REFETCH_MS) return;
      lastLoadAt.current = startedAt;
      try {
        const res = await fetch("/api/nodes", { cache: "no-store" });
        if (!res.ok) throw new Error(String(res.status));
        const next = (await res.json()) as NodesSnapshot;
        if (!cancelled) {
          setSnapshot(next);
          setPanelState("live");
        }
      } catch {
        if (!cancelled) {
          // A later failure keeps the last successful readings but marks them
          // stale. A first-load failure has no readings to stand behind.
          setPanelState((current) =>
            current === "live" || current === "stale" ? "stale" : "unavailable",
          );
        }
      }
    };

    const start = () => {
      timer ??= setInterval(load, POLL_MS);
    };
    const stop = () => {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    };
    const sync = () => {
      if (document.hidden) {
        stop();
      } else {
        void load();
        start();
      }
    };

    void load();
    if (!document.hidden) start();
    document.addEventListener("visibilitychange", sync);
    return () => {
      cancelled = true;
      stop();
      document.removeEventListener("visibilitychange", sync);
    };
  }, []);

  // "Checked Xs ago" ticker (1s cadence, cheap).
  useEffect(() => {
    if (!snapshot) return;
    const update = () =>
      setAgoSeconds(
        Math.max(0, Math.round((Date.now() - Date.parse(snapshot.checkedAt)) / 1000)),
      );
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [snapshot]);

  const statusById = new Map(snapshot?.nodes.map((n) => [n.id, n]) ?? []);
  const definitions = snapshot?.definitions ?? initialDefinitions;
  const headOf = (status: NodeStatus | null) =>
    status?.blockHeight !== null && status?.blockHeight !== undefined
      ? numberFormat.format(status.blockHeight)
      : "—";
  const statusLabel = NODES_SECTION.statusLabels[panelState];
  const cadenceLabel =
    panelState === "unavailable"
      ? NODES_SECTION.retryNote
      : NODES_SECTION.refreshNote;

  return (
    <div className="flex flex-col gap-5">
      {variant === "compact" ? (
        <>
          {/* One card, one rail. The compact strip answers exactly two
              questions per endpoint — is it the right chain, and how far along
              is it — and drops blurbs, behind-by, hash match and latency to
              the full board rather than shrinking them into illegibility. */}
          <Card className="p-0">
            <ul className="divide-y divide-border/60">
              {definitions.map((node) => {
                const status = statusById.get(node.id) ?? null;
                return (
                  <li
                    key={node.id}
                    className="flex min-h-[44px] flex-wrap items-center gap-x-3 gap-y-2 px-5 py-2.5"
                  >
                    <p className="min-w-0 flex-1 basis-40 break-all font-mono text-xs text-on-surface">
                      {node.name}
                    </p>
                    <VerdictChip status={status} panelState={panelState} />
                    <span className="ml-auto shrink-0 font-mono text-sm tabular-nums text-on-surface-variant">
                      {headOf(status)}
                    </span>
                  </li>
                );
              })}
            </ul>
          </Card>

          <Link
            href={NODES_SECTION.fullDetail.href}
            className="focus-ring group inline-flex min-h-[44px] items-center gap-1.5 self-start text-sm font-medium text-accent-soft transition-colors hover:text-on-surface"
          >
            {NODES_SECTION.fullDetail.label}
            <ArrowRight
              className="size-4 transition-transform group-hover:translate-x-0.5"
              strokeWidth={2}
              aria-hidden
            />
          </Link>
        </>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {definitions.map((node) => {
              const status = statusById.get(node.id) ?? null;
              return (
                <Card key={node.id} className="flex h-full flex-col gap-3 p-5">
                  {/* Wrap-capable header: long hostnames + the status chip must
                      never clip at the card edge — the chip drops to its own line
                      when the title needs the width. */}
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                    <p className="h4 min-w-0 break-all">{node.name}</p>
                    <VerdictChip status={status} panelState={panelState} />
                  </div>

                  <p className="text-sm leading-relaxed text-on-surface-variant">
                    {node.blurb}
                  </p>

                  {/* These labels are 10-12px and they carry the reading, so
                      they take the AA-safe muted token rather than `outline`,
                      which is a border colour and fails on this surface. */}
                  <dl className="mt-auto flex flex-col gap-1.5 border-t border-border/60 pt-3">
                    <div className="flex items-baseline justify-between gap-3">
                      <dt className="label-caps text-on-surface-muted">
                        {LABELS.head}
                      </dt>
                      <dd className="font-mono text-sm tabular-nums text-on-surface">
                        {headOf(status)}
                      </dd>
                    </div>
                    {status?.headDelta !== null &&
                    status?.headDelta !== undefined &&
                    Math.abs(status.headDelta) > 2 ? (
                      <div className="flex items-baseline justify-between gap-3">
                        <dt className="label-caps text-on-surface-muted">
                          {LABELS.behindBy}
                        </dt>
                        <dd
                          className={[
                            "font-mono text-sm tabular-nums",
                            status.verdict === "diverged"
                              ? "text-error"
                              : "text-on-surface-variant",
                          ].join(" ")}
                        >
                          {numberFormat.format(Math.abs(status.headDelta))}{" "}
                          {LABELS.blocksUnit}
                        </dd>
                      </div>
                    ) : status?.verdict === "canonical" ? (
                      <div className="flex items-baseline justify-between gap-3">
                        <dt className="label-caps text-on-surface-muted">
                          {LABELS.sync}
                        </dt>
                        <dd className="font-mono text-sm text-success">
                          {LABELS.synced}
                        </dd>
                      </div>
                    ) : null}
                    {status?.hashChecked !== null &&
                    status?.hashChecked !== undefined &&
                    status.hashChecked > 0 ? (
                      <div className="flex items-baseline justify-between gap-3">
                        <dt className="label-caps text-on-surface-muted">
                          {LABELS.hashMatch}
                        </dt>
                        <dd
                          className={[
                            "font-mono text-sm tabular-nums",
                            status.hashMatched === status.hashChecked
                              ? "text-success"
                              : "text-error",
                          ].join(" ")}
                        >
                          {status.hashMatched}/{status.hashChecked} heights
                        </dd>
                      </div>
                    ) : null}
                    <div className="flex items-baseline justify-between gap-3">
                      <dt className="label-caps text-on-surface-muted">
                        {LABELS.latency}
                      </dt>
                      <dd className="font-mono text-sm tabular-nums text-on-surface-variant">
                        {status?.latencyMs !== null && status?.latencyMs !== undefined
                          ? `${status.latencyMs} ms`
                          : "—"}
                      </dd>
                    </div>
                  </dl>
                </Card>
              );
            })}
          </div>

          {/* Fed the snapshot this component is already polling — the bars must
              not open a second interval against the same endpoint. */}
          <NodeLatencyBars snapshot={snapshot} initialDefinitions={initialDefinitions} />
        </>
      )}

      {/* Only a successful current probe wears turquoise. The second-by-second
          age is visual-only so this one live region announces state changes,
          not a countdown sixty times a minute. */}
      <p
        className={[
          "label-caps flex flex-wrap items-center gap-2",
          panelState === "live" ? "text-teal-soft" : "text-on-surface-variant",
        ].join(" ")}
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        <span
          aria-hidden
          className={[
            "inline-block size-2 rounded-full",
            panelState === "checking"
              ? "animate-pulse bg-outline"
              : panelState === "live"
                ? "bg-accent-teal shadow-live"
                : "bg-warn-orange",
          ].join(" ")}
        />
        <span aria-hidden>
          {statusLabel}
          {agoSeconds === null ? "" : ` · last checked ${agoSeconds}s ago`} ·{" "}
          {cadenceLabel}
        </span>
        <span className="sr-only">
          {statusLabel}. {cadenceLabel}.
        </span>
      </p>
    </div>
  );
}
