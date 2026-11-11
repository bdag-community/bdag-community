"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils/cn";

const EASE_OUT = (t: number) => 1 - Math.pow(1 - t, 3);

// Module scope, not the render body. Constructing an Intl.NumberFormat costs
// ~6.5 µs against ~0.24 µs to reuse one, and the render body runs once per
// rAF frame for the whole count-up on every numeral on the page — it was the
// single most expensive thing about a purely decorative animation.
// ChainReadout, ThroughputChart and ConnectPulse already do this.
const GROUPED = new Intl.NumberFormat("en");
const COMPACT = new Intl.NumberFormat("en", {
  notation: "compact",
  maximumFractionDigits: 2,
});

/**
 * Live numeral — "data is jewellery" (DESIGN.md). Counts up from 0 on first
 * scroll into view (~1.2s), then glides to each new value as live polling
 * updates it. Monospace + tabular-nums so digits never jitter sideways.
 *
 * The count-up is laid out so that it CANNOT move anything. tabular-nums keeps
 * each digit the same width, but the number of digits still grows as the value
 * counts (0 -> 17 -> 17,003,258), and that changed the numeral's width on
 * almost every frame. In a space-between band that re-distributed every cell
 * sixty times a second, and it fired the spine's cell ResizeObserver, which
 * rebuilt the whole circuit each time — the visible shudder was the layout
 * underneath the numbers, not the numbers. An invisible sizer holding the
 * FINAL value fixes the box before the animation starts.
 *
 * Accessibility: the animated span is aria-hidden; a visually-hidden sibling
 * always carries the current true value. Reduced motion renders values
 * directly with no tweening.
 */
export function StatNumber({
  value,
  format = "grouped",
  className,
}: {
  /** Current true value; null renders an em-dash placeholder. */
  value: number | null;
  /** grouped: 16,584,170 · compact: 93.77B */
  format?: "grouped" | "compact";
  className?: string;
}) {
  const reduced = useReducedMotion();
  const ref = useRef<HTMLSpanElement>(null);
  const [shown, setShown] = useState(0);
  // A tab that MOUNTS hidden (background open, automation) never fires the
  // intersection observer, so it counts as already-entered — the number then
  // renders true immediately and the count-up stays a visible-tab flourish.
  const [entered, setEntered] = useState(
    () => typeof document !== "undefined" && document.hidden,
  );
  // Last value the tween landed on — written only inside effects (never during
  // render), so a new tween can start from wherever the previous one stopped.
  const shownRef = useRef(0);

  // First-view trigger: don't start the count-up until the numeral is seen.
  useEffect(() => {
    if (reduced || entered) return;
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setEntered(true);
          io.disconnect();
        }
      },
      { rootMargin: "0px 0px -10% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [reduced, entered]);

  // Tween shown -> value whenever the target moves (first entry counts from 0).
  useEffect(() => {
    if (value === null) return;
    if (reduced) {
      // Reduced motion renders `value` directly (see `display`); just keep the
      // tween bookmark in sync — no re-render needed.
      shownRef.current = value;
      return;
    }
    if (!entered) return;
    // Hidden tabs get the truth without animation — rAF is throttled there,
    // so a tween would freeze at 0. Microtask keeps the update off the
    // effect's synchronous path (react-hooks/set-state-in-effect).
    if (document.hidden) {
      let cancelled = false;
      queueMicrotask(() => {
        if (cancelled) return;
        shownRef.current = value;
        setShown(value);
      });
      return () => {
        cancelled = true;
      };
    }
    const from = shownRef.current;
    if (from === value) return;
    const duration = from === 0 ? 1200 : 600;
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const next = Math.round(from + (value - from) * EASE_OUT(t));
      shownRef.current = next;
      setShown(next);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, entered, reduced]);

  const fmt = format === "compact" ? COMPACT : GROUPED;

  /**
   * The compact numeral's SETTLED unit, derived once per target (not per
   * frame — formatToParts is an Intl call, and the tick re-renders this body
   * ~60×/s). Counting up with plain COMPACT.format(shown) would ramp through a
   * SMALLER unit than the target — 94B arrives via 940.02M, seven glyphs wide
   * against the three the box was sized for — and overflow the reserved width.
   * Formatting the running value in the TARGET's unit instead keeps it 0B → 9B
   * → 94B, never wider than where it lands. Grouped numerals never do this: a
   * partial count has fewer digits than the total, so its box is never
   * exceeded.
   */
  const compactUnit = useMemo(() => {
    if (format !== "compact" || value === null) return null;
    const parts = COMPACT.formatToParts(value);
    const unit = parts
      .filter((p) => p.type === "compact")
      .map((p) => p.value)
      .join("");
    const frac = parts.find((p) => p.type === "fraction");
    const DIV: Record<string, number> = { K: 1e3, M: 1e6, B: 1e9, T: 1e12 };
    return { unit, div: DIV[unit] ?? 1, fracDigits: frac ? frac.value.length : 0 };
  }, [format, value]);

  let display: string;
  if (value === null) {
    display = "—";
  } else if (reduced) {
    display = fmt.format(value);
  } else if (compactUnit && shown !== value) {
    // Mid-count-up compact: same unit + fraction digits as the target.
    display =
      (shown / compactUnit.div).toFixed(compactUnit.fracDigits) +
      compactUnit.unit;
  } else {
    // Grouped count-up, or the settled compact value (exact Intl output).
    display = fmt.format(shown);
  }

  /** Where the count-up is going. This is what reserves the width. */
  const target = value === null ? "—" : fmt.format(value);

  const truth = value === null ? "unavailable" : GROUPED.format(value);

  return (
    <span ref={ref} className={cn("relative inline-block", className)}>
      {/* The sizer: in flow, invisible, and always the FINAL value, so the box
          is already as wide as the numeral will ever be and counting up cannot
          resize it. `invisible` and not `opacity-0` — it must not be a paint
          layer, only a measurement. */}
      <span aria-hidden className="invisible font-mono tabular-nums">
        {target}
      </span>
      {/* The animating numeral, out of flow so it cannot affect that box, and
          right-aligned inside it so the ones column never moves: digits fill
          leftward into width already reserved for them, instead of growing
          symmetrically out of the centre and sliding on every carry. At rest
          the two are identical widths, so the settled numeral is unchanged. */}
      <span
        aria-hidden
        className="absolute inset-0 text-right font-mono tabular-nums"
      >
        {display}
      </span>
      <span className="sr-only">{truth}</span>
    </span>
  );
}
