import type { ComponentPropsWithoutRef, CSSProperties, ReactNode } from "react";
import { RevealFrame } from "./RevealFrame";

/**
 * Content-first reveal shell.
 *
 * Frames are visible in the server render. The shared observer only arms
 * frames that have hydrated and are below the fold.
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
    <RevealFrame
      className={className}
      style={
        delay
          ? ({ "--reveal-delay": `${Math.round(delay * 1000)}ms` } as CSSProperties)
          : undefined
      }
    >
      {children}
    </RevealFrame>
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
    <RevealFrame
      data-reveal-group
      className={className}
      style={
        stagger !== 0.08
          ? ({ "--reveal-step": `${Math.round(stagger * 1000)}ms` } as CSSProperties)
          : undefined
      }
    >
      {children}
    </RevealFrame>
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
