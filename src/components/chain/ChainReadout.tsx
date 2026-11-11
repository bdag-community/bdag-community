"use client";

import { useSyncExternalStore, type ReactNode } from "react";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import { BlockTicker } from "@/components/chain/BlockTicker";
import { ChainStatusPill } from "@/components/chain/ChainStatusPill";
import {
  IntervalBaselines,
  type IntervalBaselineRow,
} from "@/components/chain/IntervalBaselines";
import { ProducerBars } from "@/components/chain/ProducerBars";
import { Button } from "@/components/ui/Button";
import { Section } from "@/components/ui/Section";
import { StatNumber } from "@/components/ui/StatNumber";
import type { NetworkStats } from "@/lib/chain/stats";
import { CHAIN, CHAIN_PAGE, STATS_SECTION } from "@/lib/content/site";

/**
 * The Chain page's single live-data source.
 *
 * Everything on /chain that moves is read from ONE /api/stats poll, held in
 * the module-scope store below. The store — rather than props threaded down
 * from a wrapper — is what makes that possible: the readout band, the block
 * ticker in the next section, the producer bars three sections further down
 * and the connect pulse near the foot of the page all subscribe to the same
 * snapshot, so the page opens exactly one interval no matter how many of
 * those pieces are on screen. The server already caches the snapshot for
 * twelve seconds and shares it between visitors; the browser must not undo
 * that discipline by polling it from four places at four cadences.
 *
 * The band itself renders section 3: the connection pill, the four numerals,
 * the two arcs and the baseline strip. Nothing below it fetches anything.
 */

const POLL_MS = 12_000;
const DASH = "—";
const grouped = new Intl.NumberFormat("en");

/**
 * The whole snapshot, exactly as stats.ts assembles it. This page adds no
 * client-side fields of its own: every figure below is read from the server's
 * one cached snapshot or derived from it in view, never re-fetched.
 */
export type ChainSnapshot = NetworkStats;

/* ---------------------------------------------------------------------------
 * The shared store — one poll, one extrapolation ticker, any number of readers
 * ------------------------------------------------------------------------- */

type ReadoutStatus = "checking" | "live" | "degraded";

type ReadoutState = {
  snapshot: ChainSnapshot | null;
  status: ReadoutStatus;
  /** Blocks extrapolated since the snapshot was taken. Capped; see below. */
  tick: number;
};

const EMPTY: ReadoutState = { snapshot: null, status: "checking", tick: 0 };

let state: ReadoutState = EMPTY;
const listeners = new Set<() => void>();
let pollTimer: ReturnType<typeof setInterval> | null = null;
let tickTimer: ReturnType<typeof setInterval> | null = null;
let lastFetchedAt: string | null = null;

function publish(next: Partial<ReadoutState>) {
  state = { ...state, ...next };
  for (const listener of listeners) listener();
}

/**
 * The between-polls height ticker.
 *
 * Blocks land faster than we poll, so a height frozen for twelve seconds
 * reads as a stalled chain. We advance it once per MEASURED interval and let
 * the next poll correct it to truth — but only up to two poll windows' worth
 * of blocks. That cap is the honesty: if the backend stops answering, the
 * number stops climbing instead of inventing progress for as long as the tab
 * is left open.
 */
function restartTicker(snapshot: ChainSnapshot) {
  if (tickTimer) {
    clearInterval(tickTimer);
    tickTimer = null;
  }
  if (snapshot.blockHeight === null) return;
  const per = Math.min(
    3000,
    Math.max(400, snapshot.measuredBlockTimeMs ?? CHAIN.blockIntervalFallbackMs),
  );
  const maxTicks = Math.floor((POLL_MS * 2) / per);
  tickTimer = setInterval(() => {
    if (document.hidden) return;
    if (state.tick < maxTicks) publish({ tick: state.tick + 1 });
  }, per);
}

async function load() {
  try {
    const res = await fetch("/api/stats", { cache: "no-store" });
    if (!res.ok) throw new Error(String(res.status));
    const next = (await res.json()) as ChainSnapshot;
    // A new snapshot restarts the extrapolation from truth.
    const fresh = lastFetchedAt !== next.fetchedAt;
    lastFetchedAt = next.fetchedAt;
    publish({
      snapshot: next,
      status: next.stale ? "degraded" : "live",
      ...(fresh ? { tick: 0 } : null),
    });
    restartTicker(next);
  } catch {
    // Values are held, not blanked. The shared pill keeps the public chain
    // identity stable and records this degraded transition in DevTools.
    publish({ status: "degraded" });
  }
}

// Only the POLLING pauses while the tab is hidden; the first snapshot always
// loads, so a background-opened tab is already truthful when it is first seen.
function syncVisibility() {
  if (document.hidden) {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  } else {
    void load();
    pollTimer ??= setInterval(load, POLL_MS);
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (listeners.size === 1) {
    void load();
    if (!document.hidden) pollTimer ??= setInterval(load, POLL_MS);
    document.addEventListener("visibilitychange", syncVisibility);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size > 0) return;
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
    if (tickTimer) {
      clearInterval(tickTimer);
      tickTimer = null;
    }
    document.removeEventListener("visibilitychange", syncVisibility);
  };
}

/*
 * Two ways in, on purpose.
 *
 * publish() replaces the whole state object, and the extrapolation ticker
 * publishes roughly once a second. A component subscribed to that object
 * therefore re-renders for a value it never reads: with nine readers on this
 * page that was 639 renders a minute between them, 497 of which changed
 * nothing on screen — and each one re-ran motion's layout projection on the
 * eight ticker rows. The two fields that matter are read separately instead.
 * `state.snapshot` is only replaced when a poll returns (every twelve
 * seconds) and `status` is a short stable string, so both compare cleanly
 * under Object.is. Only the two components that actually print the
 * extrapolated height take the whole object and pay for the tick.
 */
const getSnapshot = () => state.snapshot;
const getStatus = () => state.status;
const getState = () => state;
const getServerSnapshot = (): ChainSnapshot | null => null;
const getServerStatus = (): ReadoutStatus => "checking";
const getServerState = () => EMPTY;

/**
 * Subscribe to the page's one live snapshot. Any client component under
 * /chain may call this — mounting a second reader costs nothing, because the
 * poll belongs to the module and not to the component that happened to mount
 * first. This is the reader for everything that shows a POLLED figure; it does
 * not re-render between polls.
 */
export function useChainSnapshot(): {
  snapshot: ChainSnapshot | null;
  status: ReadoutStatus;
  degraded: boolean;
} {
  const status = useSyncExternalStore(subscribe, getStatus, getServerStatus);
  return {
    snapshot: useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot),
    status,
    degraded: status === "degraded",
  };
}

/**
 * The same snapshot plus the extrapolated block height, for the two places
 * that print it — the readout numeral and the connect pulse. Both must show
 * the same climbing number or the page contradicts itself, which is why the
 * extrapolation lives in the store and not in either component. Everything
 * else on the page should use useChainSnapshot() and stay still between polls.
 */
export function useChainHeight(): {
  snapshot: ChainSnapshot | null;
  status: ReadoutStatus;
  degraded: boolean;
  height: number | null;
} {
  const current = useSyncExternalStore(subscribe, getState, getServerState);
  const base = current.snapshot?.blockHeight ?? null;
  return {
    snapshot: current.snapshot,
    status: current.status,
    degraded: current.status === "degraded",
    height: base === null ? null : base + current.tick,
  };
}

/* ---------------------------------------------------------------------------
 * Formatting — every one of these returns the em-dash for a missing value,
 * which is both the loading glyph and the failure glyph on this page.
 * ------------------------------------------------------------------------- */

const formatDuration = (seconds: number): string => {
  const total = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m`;
  return `${total}s`;
};

/**
 * The two-span numeral pattern StatNumber established: the visible glyphs are
 * aria-hidden and a visually-hidden sibling carries the truth, so a screen
 * reader gets the value on demand instead of on every poll. Used for the
 * fractional readings StatNumber cannot express (an interval in milliseconds,
 * a rate below one per second).
 */
function Numeral({ display, truth }: { display: string; truth: string }) {
  return (
    <>
      <span aria-hidden className="font-mono tabular-nums">
        {display}
      </span>
      <span className="sr-only">{truth}</span>
    </>
  );
}

/** Matches StatNumber's word for a value we do not have. */
const UNAVAILABLE = "unavailable";

/* ---------------------------------------------------------------------------
 * The readout band — section 3
 * ------------------------------------------------------------------------- */

export function ChainReadout() {
  const { snapshot, status, height } = useChainHeight();
  const copy = CHAIN_PAGE.readout;

  // The headline interval is the longest baseline: a million blocks buys the
  // smallest quantisation error, and the cell's sub-label names that span.
  const intervalMs = snapshot?.intervalMillionMs ?? null;
  const tps = snapshot?.observedTps ?? null;
  const windowSeconds = snapshot?.windowSeconds ?? null;

  // The TPS sub-label always states the window it was measured over. Until the
  // accumulator has a window worth publishing, it says so instead — the note
  // is the honesty and it is never dropped, only replaced.
  const tpsNote =
    tps === null || windowSeconds === null
      ? CHAIN_PAGE.interval.measuringTps
      : copy.stats[2].note.replace("{window}", formatDuration(windowSeconds));

  /* The gas-capacity and indexed-history derivations lived here and are gone
     with the two arc gauges they fed. `capacityFraction`, `gasLimitPerBlock`,
     `gasLimitVaried`, `sampleFromHeight`, `sampleToHeight` and `indexedRatio`
     are all still on the snapshot and still fetched, because /api/stats serves
     other consumers; nothing here reads them any more. */

  // The strip's four rows share one axis, so they are built together here
  // rather than assembled inside it. The error bar is the quantisation error:
  // block timestamps are whole seconds, so an average over n blocks cannot be
  // tighter than 1000/n milliseconds, and that is what makes the bars shrink
  // visibly as the window lengthens. The since-boot row carries `measuring`
  // instead of a value until the server has watched enough blocks land.

  return (
    <section
      id="live"
      aria-labelledby="live-heading"
      className="full-bleed section-surface scroll-mt-24"
    >
      <Section className="flex flex-col gap-10 py-16 sm:py-20">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div className="flex flex-col gap-3">
            {/* Live telemetry wears turquoise (DESIGN.md accent roles). */}
            <p className="eyebrow text-teal-soft">{copy.eyebrow}</p>
            <h2 id="live-heading" className="h2">
              {copy.title}
            </h2>
            <p className="lead">{copy.sub}</p>
          </div>
          {/* The public label stays stable through quorum failover. Internal
              degraded transitions remain available in DevTools. */}
          <ChainStatusPill status={status} surface="chain" />
        </div>

        {/* lg+: space-between rather than equal tracks — a ten-digit height
            beside a two-digit peer count reads unevenly in equal columns. */}
        <dl className="grid grid-cols-1 gap-x-6 gap-y-8 min-[360px]:grid-cols-2 md:grid-cols-4 lg:flex lg:flex-wrap lg:items-end lg:justify-between lg:gap-x-10">
          <Cell label={copy.stats[0].label} note={copy.stats[0].note}>
            <StatNumber value={height} />
          </Cell>
          <Cell label={copy.stats[1].label} note={copy.stats[1].note}>
            <Numeral
              display={intervalMs === null ? DASH : `${intervalMs.toFixed(1)} ms`}
              truth={intervalMs === null ? UNAVAILABLE : `${intervalMs.toFixed(1)} ms`}
            />
          </Cell>
          <Cell label={copy.stats[2].label} note={tpsNote}>
            <Numeral
              display={tps === null ? DASH : tps.toFixed(2)}
              truth={tps === null ? UNAVAILABLE : tps.toFixed(2)}
            />
          </Cell>
          <Cell label={copy.stats[3].label} note={copy.stats[3].note}>
            <StatNumber value={snapshot?.peers ?? null} />
          </Cell>
        </dl>

        {/* The two arcs pair; the baseline strip does NOT sit beside them.
            It is four rows on one shared horizontal axis, so it is a
            wide-format instrument: squeezed into a third of the row its axis
            track collapses to nothing, the four dots bunch, and the two axis
            end-labels land on top of each other. It gets its own full-width
            row below, which is also the emphasis it deserves — it is the
            measurement the whole interval section is about. */}
        {/* The two arc gauges that stood here are gone at the owner's
            request: block gas capacity and the explorer's indexed ratio. Both
            were honest, but they were the page's largest objects and they sat
            between the numerals a reader came for and the block table.

            The indexed-history gauge carried the site's ONLY statement that
            transaction and address totals are floors rather than totals. That
            disclosure was not deleted with it; it moved verbatim into
            CHAIN_PAGE.boundary.items and renders in the boundary rail near the
            foot of this page. Do not remove it from there without putting it
            somewhere else first. */}

        <div className="flex flex-wrap items-center gap-x-6 gap-y-4 border-t border-border/60 pt-6">
          <Button
            href={CHAIN.explorerUrl}
            target="_blank"
            rel="noopener noreferrer"
            variant="ghost"
            trailingIcon={
              <ArrowUpRight className="size-4" strokeWidth={2} aria-hidden />
            }
          >
            {copy.explorerCta}
          </Button>
          {/* Plain text, not a link — this endpoint is for wallets and integrators
              to copy, not for a browser to open. Machine-facing, so teal. */}
          <p className="inline-flex min-h-[44px] items-center gap-1.5 font-mono text-sm text-on-surface-variant">
            {copy.rpcLabel}:{" "}
            <span className="text-teal-soft">{STATS_SECTION.publicRpc.host}</span>
          </p>
          <a
            href="#nodes"
            className="focus-ring group inline-flex min-h-[44px] items-center gap-1.5 text-sm font-medium text-accent-soft transition-colors hover:text-on-surface"
          >
            {copy.nodesCta}
            <ArrowRight
              className="size-4 transition-transform group-hover:translate-x-0.5"
              strokeWidth={2}
              aria-hidden
            />
          </a>
        </div>
      </Section>
    </section>
  );
}

/**
 * One numeral cell. The `note` under each value states how the number was
 * measured; it wraps to as many lines as it needs and is never truncated,
 * because the qualifier is the honesty and a clipped qualifier is a claim we
 * did not make.
 */
function Cell({
  label,
  note,
  children,
}: {
  label: string;
  note: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5 text-center">
      <dt className="label-caps text-on-surface-variant">{label}</dt>
      <dd className="flex flex-col gap-1.5 text-2xl font-semibold text-on-surface sm:text-3xl md:text-4xl">
        <span>{children}</span>
        <span className="block text-[11px] font-normal leading-snug text-on-surface-variant sm:text-xs">
          {note}
        </span>
      </dd>
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * The presentational readers — same snapshot, placed elsewhere on the page
 * ------------------------------------------------------------------------- */

/** Section 4's ticker, fed from the readout's poll rather than its own. */
export function ChainTicker() {
  const { snapshot } = useChainSnapshot();
  return <BlockTicker recentBlocks={snapshot?.recentBlocks ?? null} />;
}

/**
 * The four interval baselines, as their own block.
 *
 * It used to be a Card inside the readout band while the copy explaining what
 * its shape means sat two sections lower, under a heading about timing. The
 * strip belongs with that explanation, so it moved. Nothing else changed: this
 * reads the SAME module-scope store the band does, so there is no second poll
 * and no second head on the page. Deliberately not a dial either, because
 * nothing on this chain declares a target interval, so there is no denominator
 * an arc could honestly use.
 */
export function ChainIntervalStrip() {
  const { snapshot } = useChainSnapshot();
  const labels = CHAIN_PAGE.interval.baselineLabels;
  const serverBlocks = snapshot?.windowBlocks ?? null;
  const serverMs = snapshot?.measuredBlockTimeMs ?? null;
  const baselines: IntervalBaselineRow[] = [
    {
      key: "server",
      label: labels.server,
      blocks: serverBlocks,
      ms: serverMs,
      errorMs: serverMs !== null && serverBlocks ? 1000 / serverBlocks : null,
      note: serverMs === null ? CHAIN_PAGE.interval.measuring : undefined,
    },
    {
      key: "tenK",
      label: labels.tenK,
      blocks: 10_000,
      ms: snapshot?.intervalTenKMs ?? null,
      errorMs: 1000 / 10_000,
    },
    {
      key: "hundredK",
      label: labels.hundredK,
      blocks: 100_000,
      ms: snapshot?.intervalHundredKMs ?? null,
      errorMs: 1000 / 100_000,
    },
    {
      key: "million",
      label: labels.millionn,
      blocks: 1_000_000,
      ms: snapshot?.intervalMillionMs ?? null,
      errorMs: 1000 / 1_000_000,
    },
  ];
  return <IntervalBaselines baselines={baselines} />;
}

/** Section 6's producer bars. The denominator is the sampled page those counts
 *  came from — summed here rather than assumed to be fifty, so the bars stay
 *  fractions of something the snapshot can actually account for. */
export function ChainProducerBars() {
  const { snapshot } = useChainSnapshot();
  const producers = snapshot?.producers ?? null;
  return (
    <ProducerBars
      producers={producers}
      windowBlocks={
        producers === null
          ? null
          : producers.reduce((total, p) => total + p.blocks, 0)
      }
    />
  );
}

/**
 * Section 5's heading, which changes exactly once.
 *
 * The interval is the page's headline measurement, so the heading quotes it —
 * but a heading is an accessible name, and a name that counts is a name a
 * screen-reader user cannot re-orient on. So there are two wordings and one
 * transition between them: before the million-block baseline exists the
 * heading says what we know without it, and once the baseline arrives it says
 * the figure and then holds still. The figure comes from that baseline alone
 * and never from a shorter window, because the numeral in the band above is
 * read off the same field and the two must not disagree by a hundredth.
 */
export function ChainIntervalHeading({
  id,
  className,
}: {
  id?: string;
  className?: string;
}) {
  const { snapshot } = useChainSnapshot();
  const ms = snapshot?.intervalMillionMs ?? null;
  return (
    <h2 id={id} className={className}>
      {ms === null
        ? CHAIN_PAGE.interval.titleUnmeasured
        : CHAIN_PAGE.interval.titleTemplate.replace(
            "{interval}",
            (ms / 1000).toFixed(2),
          )}
    </h2>
  );
}

/**
 * Section 6's heading, and the live count beneath it.
 *
 * The count used to be interpolated into the heading itself, which is this
 * section's aria-labelledby target — so the landmark's accessible name changed
 * every time the poll returned a different number, five times a minute. The
 * heading is now fixed copy and the count is a sibling line outside it, where
 * it is read on demand like every other numeral on this page. Both are
 * returned together because they are one live reading with a title, and
 * splitting them into two components would mean two subscriptions to say one
 * thing. The fragment's two children become flex items of the caller's column,
 * which is why neither carries spacing of its own.
 *
 * The number is a plain formatted string, not a StatNumber: a value that
 * counts up from zero next to a heading reads as the heading counting.
 */
/**
 * The live producer count, and ONLY the count.
 *
 * It used to render `pow.title` as an <h2> above the count, because it stood
 * at the top of a section of its own. That section is gone: the bars now sit
 * beside the block table under a "Latest producers" heading, and a second
 * heading inside the card said the same thing twice and put a stray <h2> in
 * the outline. The count is deliberately not the section's aria-labelledby
 * target and is not in a live region: a landmark whose name changes five times
 * a minute is a landmark nobody can return to.
 */
export function ChainProducerHeading({ className }: { className?: string }) {
  const { snapshot } = useChainSnapshot();
  const n = snapshot?.producersInWindow ?? null;
  return (
    <p className={className ?? "body-sm text-on-surface"}>
      {CHAIN_PAGE.pow.countTemplate.replace(
        "{n}",
        n === null ? DASH : grouped.format(n),
      )}
    </p>
  );
}
