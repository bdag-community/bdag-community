import type { ComponentPropsWithoutRef, ElementType } from "react";
import { cn } from "@/lib/utils/cn";

/**
 * Layout wrapper (DESIGN.md "Layout & Spacing").
 *
 * Constrains content to the 1440px site max-width, left-aligned, with
 * responsive horizontal padding (16px mobile / 32px desktop).
 * Polymorphic via `as` so it can wrap a <main>, <section>, <footer>, etc.
 *
 * The safe-area inset is carried at EVERY breakpoint, not just below md. A
 * notched iPhone held in landscape is 852-932px wide — comfortably past md —
 * and its inset is 44-59px on the leading edge, so `md:px-8` alone put the
 * first character of every line under the notch and made viewportFit:"cover"
 * (root layout) a liability rather than a feature. max() means the inset only
 * ever wins where it is bigger than the design padding, so nothing moves on a
 * device that has no notch.
 */
export type SectionProps = ComponentPropsWithoutRef<"div"> & {
  as?: ElementType;
};

export function Section({
  as: Tag = "div",
  className,
  ...rest
}: SectionProps) {
  return (
    <Tag
      className={cn(
        "mx-auto w-full max-w-site px-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] text-left md:px-[max(2rem,env(safe-area-inset-left))] md:pr-[max(2rem,env(safe-area-inset-right))]",
        className,
      )}
      {...rest}
    />
  );
}
