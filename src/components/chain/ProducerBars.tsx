"use client";

/**
 * Who produced the blocks in the current window.
 *
 * The bars are scaled against the window itself — nine blocks out of fifty
 * draws a bar that is 18% of the track, not a full one. Scaling to the leading
 * producer would make the busiest address fill the rail and read as "this
 * address mined everything", which is the opposite of what the numbers say.
 * The window is a real denominator, one of the very few on this page, so it is
 * the one used.
 *
 * Structurally this is a description list, not a picture: the address is the
 * term and "9 of the last 50 blocks" is the definition. The bars are an
 * aria-hidden layer over the top, and they carry .viz so forced colours drop
 * them rather than painting seven identical system-coloured rectangles.
 */

export type ProducerCount = {
  /** Full producer address from the block header, 0x-prefixed. */
  address: string;
  /** Blocks it produced inside the window. */
  blocks: number;
};

export type ProducerBarsProps = {
  /** Null while the first snapshot is in flight, or when it failed. */
  producers: readonly ProducerCount[] | null;
  /** Blocks in the sampled window — the denominator the bars are drawn against. */
  windowBlocks: number | null;
  /**
   * Accessible text for each row, `{count}` and `{total}` interpolated. It is
   * the only sentence this component renders, and site.ts has no key for it
   * yet; pass one in rather than letting the default become the source of
   * truth.
   */
  countTemplate?: string;
};

const DEFAULT_COUNT_TEMPLATE = "{count} of the last {total} blocks";

/** 0x1f4a…9c2e — enough to tell producers apart, short enough to sit in a row. */
const truncate = (address: string) =>
  address.length > 12 ? `${address.slice(0, 6)}…${address.slice(-4)}` : address;

export function ProducerBars({
  producers,
  windowBlocks,
  countTemplate = DEFAULT_COUNT_TEMPLATE,
}: ProducerBarsProps) {
  // Highest count first, address as the tie-break so the order does not
  // reshuffle every twelve seconds among producers that are level.
  const rows = producers
    ? [...producers]
        .filter((p) => p.blocks > 0)
        .sort((a, b) => b.blocks - a.blocks || a.address.localeCompare(b.address))
    : null;

  // Fall back to the blocks we can actually account for if the window size did
  // not arrive; a bar has to be a fraction of something real.
  const total =
    windowBlocks ?? (rows ? rows.reduce((sum, p) => sum + p.blocks, 0) : 0);

  if (!rows || rows.length === 0 || total <= 0) {
    return <p className="font-mono text-sm text-on-surface-muted">—</p>;
  }

  return (
    <dl className="flex flex-col gap-3">
      {rows.map((producer) => {
        const width = Math.max(0, Math.min(100, (producer.blocks / total) * 100));
        const description = countTemplate
          .replace("{count}", String(producer.blocks))
          .replace("{total}", String(total));

        return (
          <div
            key={producer.address}
            className="grid grid-cols-1 items-center gap-x-4 gap-y-1 sm:grid-cols-[minmax(0,9rem)_minmax(0,1fr)]"
          >
            <dt className="min-w-0 break-all font-mono text-xs text-on-surface-variant">
              {truncate(producer.address)}
            </dt>
            <dd className="flex min-h-[1.5rem] items-center gap-3">
              <span
                aria-hidden
                className="viz h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-border/50"
              >
                {/* Live telemetry, so turquoise is correct here. */}
                <span
                  className="block h-full rounded-full bg-accent-teal"
                  style={{ width: `${width}%` }}
                />
              </span>
              <span
                aria-hidden
                className="w-6 shrink-0 text-right font-mono text-xs tabular-nums text-on-surface"
              >
                {producer.blocks}
              </span>
              {/* The bar and the bare numeral are the sighted reading; this is
                  the whole fact, and it is what a screen reader gets. */}
              <span className="sr-only">{description}</span>
            </dd>
          </div>
        );
      })}
    </dl>
  );
}
