import type { ComponentPropsWithoutRef } from "react";
import { cn } from "@/lib/utils/cn";

/**
 * Status/label pill. label-caps typography (mono, uppercase, wide tracking),
 * faint purple fill + soft-purple text + hairline. `gap-1.5` lets a small
 * leading icon sit next to the label.
 */
export type ChipProps = ComponentPropsWithoutRef<"span">;

export function Chip({ className, ...rest }: ChipProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1",
        "font-mono text-xs uppercase tracking-[0.18em]",
        "border border-accent/20 bg-accent/10 text-accent-soft",
        className,
      )}
      {...rest}
    />
  );
}
