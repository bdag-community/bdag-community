import type { ComponentPropsWithoutRef } from "react";
import { cn } from "@/lib/utils/cn";

/**
 * Glass surface (staking-style): translucent two-tone fill + blur + faint
 * purple hairline + soft dark lift, larger radius.
 * - `glow`        — active purple halo + solid border.
 * - `interactive` — opt-in hover lift (focal cards only; never form/admin cards).
 *
 * The `p-5` in the base is a floor, not a decision: every public call site
 * overrides it (`p-6 sm:p-8` for content cards, `p-4` for dense rows). Left as
 * it is on purpose — a `size` prop would touch ~25 call sites to move zero
 * pixels. If you are reading this because a card's padding looks wrong, the
 * answer is in the call site's className, not here.
 */
export type CardProps = ComponentPropsWithoutRef<"div"> & {
  glow?: boolean;
  interactive?: boolean;
};

export function Card({
  glow = false,
  interactive = false,
  className,
  ...rest
}: CardProps) {
  return (
    <div
      className={cn(
        "glass-card rounded-2xl border border-accent/15 p-5 shadow-[0_10px_34px_-14px_rgba(14,7,21,0.75)] backdrop-blur-md",
        // Hover goes further than it used to: the chain's own arrival now
        // uses what WAS the hover treatment (border-accent/40 + glow-sm) on
        // every News card at once, so a pointer needs somewhere brighter to
        // land or hovering a lit card would do nothing visible.
        interactive &&
          "transition-all duration-200 hover:-translate-y-0.5 hover:border-accent-soft/75 hover:shadow-glow focus-within:-translate-y-0.5 focus-within:border-accent-soft/75 focus-within:shadow-glow",
        glow && "border-accent shadow-glow-sm",
        className,
      )}
      {...rest}
    />
  );
}
