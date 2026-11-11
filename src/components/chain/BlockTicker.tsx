"use client";

import { memo, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { motion, useReducedMotion } from "motion/react";
import { CHAIN_PAGE } from "@/lib/content/site";
import { cn } from "@/lib/utils/cn";

/** How many of the fifty blocks in the snapshot we actually show. */
const ROWS = 8;
/** The age column re-reads the clock every second; it is text, not motion. */
const AGE_TICK_MS = 1_000;
/**
 * The screen-reader summary is a heartbeat, not a stream. Blocks land about
 * once a SECOND — the poll is every twelve — so announcing arrivals would make
 * the page unusable. The summary is rewritten at most this often no matter how
 * fast blocks come.
 */
const HEARTBEAT_MS = 30_000;
/** Per-row delay in the refresh sweep. Eight rows at 45ms read as one gesture
 *  down the table; much more and the last row lands after the eye has left. */
const SWEEP_STEP_S = 0.045;
const DASH = "—";

/**
 * One block, as the ticker needs it — structurally the snapshot's
 * `RecentBlock`, restated here rather than imported so this component depends
 * on a shape and not on a server-only module. Every field is allowed to be
 * null because the row still has to render when one of them is missing.
 */
export type TickerBlock = {
  height: number;
  /** ISO timestamp of the block header. */
  timestamp: string;
  /** The address in the header. Not a person, and not necessarily a machine. */
  producer: string | null;
  transactions: number | null;
  gasUsed: number | null;
};

export type BlockTickerProps = {
  /** Newest first. Null until the first snapshot arrives. */
  recentBlocks: TickerBlock[] | null;
  className?: string;
};

const nf = new Intl.NumberFormat("en");

/* ---------------------------------------------------------------------------
 * The age clock
 *
 * Ages have to tick every second — that ageing IS this table's failure signal
 * — but holding the clock in this component's state would re-render the whole
 * table once a second to change eight words, restarting every row's refresh
 * sweep as it went. So the clock lives outside the table: a module-scope store
 * that only the age cells subscribe to. One second now brings eight text
 * updates and nothing else, and the rows re-render only when a block arrives.
 *
 * It runs only while something is subscribed, and it holds still while the tab
 * is hidden, in the same discipline as the snapshot poller.
 * ------------------------------------------------------------------------- */

let clockNow = Date.now();
const clockListeners = new Set<() => void>();
let clockTimer: ReturnType<typeof setInterval> | null = null;

function subscribeClock(listener: () => void) {
  clockListeners.add(listener);
  clockTimer ??= setInterval(() => {
    if (document.hidden) return;
    clockNow = Date.now();
    for (const l of clockListeners) l();
  }, AGE_TICK_MS);
  return () => {
    clockListeners.delete(listener);
    if (clockListeners.size === 0 && clockTimer) {
      clearInterval(clockTimer);
      clockTimer = null;
    }
  };
}

const getClock = () => clockNow;
/** Unreachable in practice — no block has arrived during a server render, so
 *  the server draws skeleton rows and no age cell exists to ask. */
const getServerClock = () => clockNow;

/** 0x1f4a…9c2e — enough to recognise a repeat producer, short enough to sit
 *  in a column on a phone. The full address is not printed anywhere. */
function shortAddress(address: string): string {
  return address.length <= 12
    ? address
    : `${address.slice(0, 6)}…${address.slice(-4)}`;
}

function ageLabel(iso: string, now: number): string {
  const at = Date.parse(iso);
  if (!Number.isFinite(at)) return DASH;
  const seconds = Math.max(0, Math.round((now - at) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m ago`;
}

const CELL = "px-3 py-2.5 align-middle";
/** Rows six to eight only exist where there is height for them. Done in CSS
 *  because a JS breakpoint would hydrate to a different row count than the
 *  server rendered. */
const ROW = cn(
  "border-b border-l-2 border-border/40 border-l-transparent",
  "[&:nth-child(n+6)]:hidden sm:[&:nth-child(n+6)]:table-row",
  // Inside the card, a rule on the final row lands directly on the card's own
  // border and reads as a doubled line. The last VISIBLE row differs by
  // breakpoint, because rows six to eight only exist from sm up.
  "[&:nth-child(5)]:border-b-0 sm:[&:nth-child(5)]:border-b sm:last:border-b-0",
);

/**
 * The one cell that changes between polls. It subscribes to the shared clock
 * itself, so the row around it never has to re-render to keep it honest.
 */
function Age({ iso }: { iso: string }) {
  const now = useSyncExternalStore(subscribeClock, getClock, getServerClock);
  return <time dateTime={iso}>{ageLabel(iso, now)}</time>;
}

/**
 * One block's row.
 *
 * Memoised on the height, because that is the only thing about a row that can
 * change: the snapshot arrives as freshly parsed JSON every twelve seconds, so
 * every block object is a new reference even when it describes the same block,
 * and a shallow comparison would re-render — and re-measure — all eight rows
 * for nothing. Height is unique per row and per block, which makes it the
 * whole identity.
 */
const BlockRow = memo(
  function BlockRow({
    block,
    index,
    isNewest,
    reduced,
    producerLabel,
  }: {
    block: TickerBlock;
    /** Row position, which is its place in the refresh sweep. */
    index: number;
    isNewest: boolean;
    reduced: boolean;
    /** The producer column's heading, repeated inside the cell. */
    producerLabel: string;
  }) {
    const rowClass = cn(ROW, isNewest && "border-l-accent-teal");
    const cells = (
      <>
        <td className={cn(CELL, "font-mono tabular-nums text-teal-soft")}>
          {nf.format(block.height)}
        </td>
        <td className={cn(CELL, "text-on-surface-variant")}>
          <Age iso={block.timestamp} />
        </td>
        <td className={cn(CELL, "font-mono text-on-surface-variant")}>
          {block.producer !== null ? (
            <>
              <span aria-hidden>{shortAddress(block.producer)}</span>
              {/* The bare hex reads as noise on its own; naming the column
                  inside the cell gives it a subject. */}
              <span className="sr-only">
                {producerLabel} {shortAddress(block.producer)}
              </span>
            </>
          ) : (
            DASH
          )}
        </td>
        {/* A zero here is a READING, not a gap — the chain produces a block
            whether or not there is anything to put in it, and most of them
            carry nothing. So zero keeps its numeral (a dash would claim we
            could not read it) but drops to muted, and a block that is actually
            carrying something comes up in full contrast and teal. Without
            that, eight rows of "0" read as an instrument that has died. */}
        <td
          className={cn(
            CELL,
            "text-right font-mono tabular-nums",
            block.transactions ? "text-teal-soft" : "text-on-surface-muted",
          )}
        >
          {block.transactions !== null ? nf.format(block.transactions) : DASH}
        </td>
        <td
          className={cn(
            CELL,
            "hidden text-right font-mono tabular-nums sm:table-cell",
            block.gasUsed ? "text-on-surface" : "text-on-surface-muted",
          )}
        >
          {block.gasUsed !== null ? nf.format(block.gasUsed) : DASH}
        </td>
      </>
    );

    if (reduced) return <tr className={rowClass}>{cells}</tr>;

    return (
      <motion.tr
        className={rowClass}
        // Background ONLY. Not opacity, not y, not `layout`:
        //
        //  - `layout` and `y` both animate via `transform`, and a transform on
        //    a <tr> fights the table's own layout algorithm — it was the source
        //    of the wobble this table used to have on every poll.
        //  - opacity would blank the row it is refreshing. Every visible row is
        //    replaced on every poll (blocks land ~1/s, the poll is 12s), so
        //    fading them would mean the whole table dips to nothing and back
        //    twelve seconds apart. The numbers never leave now; the sweep just
        //    passes over them.
        //
        // The flash rides on top of the static border and decays to nothing;
        // the border is what still says "newest" once it has gone.
        initial={false}
        animate={{
          backgroundColor: [
            isNewest ? "rgba(44,224,206,0.14)" : "rgba(44,224,206,0.07)",
            "rgba(44,224,206,0)",
          ],
        }}
        transition={{
          duration: isNewest ? 1.1 : 0.75,
          delay: index * SWEEP_STEP_S,
          ease: "easeOut",
        }}
      >
        {cells}
      </motion.tr>
    );
  },
  (a, b) =>
    a.block.height === b.block.height &&
    a.isNewest === b.isNewest &&
    a.index === b.index &&
    a.reduced === b.reduced &&
    a.producerLabel === b.producerLabel,
);

/** The placeholder row, at the real row height with an em-dash in every cell,
 *  so the table never collapses and then shoves the page down when the first
 *  snapshot lands. */
function SkeletonRow() {
  return (
    <tr className={ROW}>
      <td className={cn(CELL, "font-mono tabular-nums text-teal-soft")}>
        {DASH}
      </td>
      <td className={cn(CELL, "text-on-surface-variant")}>
        <span className="font-mono">{DASH}</span>
      </td>
      <td className={cn(CELL, "font-mono text-on-surface-variant")}>{DASH}</td>
      <td
        className={cn(CELL, "text-right font-mono tabular-nums text-on-surface")}
      >
        {DASH}
      </td>
      <td
        className={cn(
          CELL,
          "hidden text-right font-mono tabular-nums text-on-surface-variant sm:table-cell",
        )}
      >
        {DASH}
      </td>
    </tr>
  );
}

/**
 * The last eight blocks, as a real table.
 *
 * It does not poll. ChainReadout holds the page's single /api/stats interval
 * and hands the blocks down, because two components polling the same endpoint
 * on two cadences is how a page starts showing itself two different heights.
 *
 * The newest row is marked by a STATIC left border. That is the whole point of
 * the marker: "newest" has to be legible to someone who has switched motion
 * off and to someone reading in a forced-colours palette, and neither of them
 * will ever see the flash. The flash is a garnish laid on top of the border
 * for everyone else — never a replacement for it.
 */
export function BlockTicker({ recentBlocks, className }: BlockTickerProps) {
  const copy = CHAIN_PAGE.ticker;
  const reduced = Boolean(useReducedMotion());
  const [heartbeat, setHeartbeat] = useState("");
  const latestRef = useRef<{ height: number; iso: string } | null>(null);

  const blocks = recentBlocks?.slice(0, ROWS) ?? null;
  const newest = blocks?.[0] ?? null;
  const newestHeight = newest?.height ?? null;
  const newestTimestamp = newest?.timestamp ?? null;
  const hasBlock = newestHeight !== null && newestTimestamp !== null;

  // A side channel for the announcer below. It has to be able to read the
  // newest block without its cadence being torn down and restarted every time
  // one lands, which is what a dependency would do.
  useEffect(() => {
    latestRef.current =
      newestHeight === null || newestTimestamp === null
        ? null
        : { height: newestHeight, iso: newestTimestamp };
  }, [newestHeight, newestTimestamp]);

  // The throttled summary, on one cadence that arrivals never reset. Labels
  // come from the column headings, so the line reads as data with names
  // attached rather than as a sentence we invented. The first block is
  // announced as soon as there is one; after that the summary is rewritten at
  // most every HEARTBEAT_MS no matter how fast blocks come.
  useEffect(() => {
    if (!hasBlock) return;
    const announce = () => {
      const latest = latestRef.current;
      if (latest === null || document.hidden) return;
      setHeartbeat(
        `${copy.columns[0]} ${nf.format(latest.height)}. ${copy.columns[1]} ${ageLabel(
          latest.iso,
          Date.now(),
        )}.`,
      );
    };
    announce();
    const id = setInterval(announce, HEARTBEAT_MS);
    return () => clearInterval(id);
  }, [hasBlock, copy.columns]);

  const rows: (TickerBlock | null)[] =
    blocks ?? Array.from({ length: ROWS }, () => null);

  return (
    <div className={cn("flex flex-col", className)}>
      {/* A scroll container has to be reachable by keyboard: at narrow widths
          the gas column is off to the right and, without a tab stop, nobody
          driving the page from the keyboard can bring it into view (WCAG
          2.1.1). It is named as a region so the stop announces what it is,
          rather than as an anonymous group. There is no aria-live here — this
          list inserts a row every few seconds and any live region on it would
          talk over the rest of the page; the throttled summary at the foot is
          the announcement. */}
      <div
        role="region"
        aria-label={copy.title}
        tabIndex={0}
        className="focus-ring overflow-x-auto"
      >
        <table className="w-full border-collapse text-sm">
          <caption className="sr-only">{copy.title}</caption>
          {/* A quiet band, not a colour: it separates the labels from the
              numerals without competing with the teal the heights wear. */}
          <thead className="bg-white/[0.02]">
            <tr className="border-b border-border/60">
              <th
                scope="col"
                className={cn(
                  CELL,
                  "label-caps text-left font-normal text-on-surface-variant",
                )}
              >
                {copy.columns[0]}
              </th>
              <th
                scope="col"
                className={cn(
                  CELL,
                  "label-caps text-left font-normal text-on-surface-variant",
                )}
              >
                {copy.columns[1]}
              </th>
              <th
                scope="col"
                className={cn(
                  CELL,
                  "label-caps text-left font-normal text-on-surface-variant",
                )}
              >
                {copy.columns[2]}
              </th>
              <th
                scope="col"
                className={cn(
                  CELL,
                  "label-caps text-right font-normal text-on-surface-variant",
                )}
              >
                {copy.columns[3]}
              </th>
              {/* Gas is the first thing to go when the width runs out — it is
                  the least useful of the five at a glance. */}
              <th
                scope="col"
                className={cn(
                  CELL,
                  "label-caps hidden text-right font-normal text-on-surface-variant sm:table-cell",
                )}
              >
                {copy.columns[4]}
              </th>
            </tr>
          </thead>
          <tbody>
            {/* No <AnimatePresence>. It kept every outgoing row mounted while
                its replacement entered, and because the whole visible set turns
                over on every poll that meant the tbody held SIXTEEN rows for
                the length of the exit — measured at 365px -> 693px -> 365px,
                so this section doubled in height and snapped back every twelve
                seconds. Rows are replaced in one commit now and the table is
                always exactly {ROWS} tall. */}
            {rows.map((block, i) =>
              block === null ? (
                <SkeletonRow key={`slot-${i}`} />
              ) : (
                <BlockRow
                  key={block.height}
                  block={block}
                  index={i}
                  isNewest={i === 0}
                  reduced={reduced}
                  producerLabel={copy.columns[2]}
                />
              ),
            )}
          </tbody>
        </table>
      </div>

      <p
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      >
        {heartbeat}
      </p>
    </div>
  );
}
