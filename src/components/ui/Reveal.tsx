import type { ComponentPropsWithoutRef, CSSProperties, ReactNode } from "react";

/**
 * Content-first reveal shell.
 *
 * The resting state IS the final state: nothing here is hidden by CSS. Only
 * <RevealRuntime> may add `.is-armed`, and it only ever arms blocks that are
 * already below the fold. So a page with no JS, a page whose chunk failed, and
 * a page in reduced motion all render exactly what the site rendered before
 * this file existed. That guarantee is structural, not a promise.
 *
 * Server component on purpose. This used to be "use client" + motion/react and
 * it produced literally zero pixels of animation on ~50 call sites while
 * dragging 130.7 KB raw / 42.6 KB gz of motion onto five routes — because
 * `initial={false}` makes whileInView animate from the target state.
 */
export function Reveal({
  children,
  delay = 0,
  className,
}: {
  children: ReactNode;
  /** Seconds, to match the old motion API. Mapped to --reveal-delay. */
  delay?: number;
  className?: string;
}) {
  return (
    <div
      data-reveal
      className={className}
      style={
        delay
          ? ({ "--reveal-delay": `${Math.round(delay * 1000)}ms` } as CSSProperties)
          : undefined
      }
    >
      {children}
    </div>
  );
}

/**
 * Stagger container. ONE observed element for the whole group — the items are
 * driven off the group's class, never observed themselves. A per-item observer
 * plus a per-item delay reads as lag on a tall list; a group observer plus an
 * nth-child delay reads as a sequence, which is what it is.
 */
export function RevealGroup({
  children,
  stagger = 0.08,
  className,
}: {
  children: ReactNode;
  /** Seconds. Mapped to --reveal-step. */
  stagger?: number;
  className?: string;
}) {
  return (
    <div
      data-reveal
      data-reveal-group
      className={className}
      style={
        stagger !== 0.08
          ? ({ "--reveal-step": `${Math.round(stagger * 1000)}ms` } as CSSProperties)
          : undefined
      }
    >
      {children}
    </div>
  );
}

/** Never observed. Styled entirely off its group's `.is-armed` / `.is-in`. */
export function RevealItem({
  children,
  className,
  ...rest
}: ComponentPropsWithoutRef<"div">) {
  return (
    <div {...rest} data-reveal-item className={className}>
      {children}
    </div>
  );
}
