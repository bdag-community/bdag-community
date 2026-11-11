import { forwardRef, type ComponentPropsWithoutRef } from "react";
import { cn } from "@/lib/utils/cn";

/**
 * Canonical text field — the SINGLE source of truth for input styling so the
 * checkout + admin fields stop drifting apart. Uses border-outline (AA non-text
 * contrast) and the app-standard `focus-visible:ring-2` (keyboard focus only,
 * not mouse-click — the same convention as Button/Card). `mono` switches to the
 * monospace face for hashes / addresses / amounts. Every native input/textarea
 * prop (type, required, pattern, aria-*, value, onChange…) passes straight
 * through; pass `className` to override width etc. (twMerge resolves conflicts).
 */
export const FIELD_BASE =
  "w-full min-h-[44px] rounded border border-outline bg-base-void px-3 py-2.5 " +
  "text-base text-on-surface placeholder:text-on-surface-variant " +
  "aria-[invalid=true]:border-warn-orange " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent " +
  "focus-visible:ring-offset-2 focus-visible:ring-offset-base-void md:text-sm";

type InputProps = ComponentPropsWithoutRef<"input"> & { mono?: boolean };

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { mono = false, className, ...props },
  ref,
) {
  return (
    <input
      ref={ref}
      className={cn(FIELD_BASE, mono && "font-mono", className)}
      {...props}
    />
  );
});

type TextareaProps = ComponentPropsWithoutRef<"textarea"> & { mono?: boolean };

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  function Textarea({ mono = false, className, ...props }, ref) {
    return (
      <textarea
        ref={ref}
        className={cn(FIELD_BASE, mono && "font-mono", className)}
        {...props}
      />
    );
  },
);
