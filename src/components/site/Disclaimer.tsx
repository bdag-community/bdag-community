import { Info } from "lucide-react";
import { SpineFrame } from "@/components/spine/SpineFrame";
import { NON_AFFILIATION } from "@/lib/content/site";

/**
 * The ONE component that renders the canonical non-affiliation paragraph.
 *
 * TRUST-09 requires this disclaimer on every public surface (Home, Product,
 * Checkout, Payment confirmation, Terms step, Footer, FAQ). Every one of
 * those surfaces reuses THIS component — pages must never re-author the
 * non-affiliation copy. The text comes from site.ts (PRD §3, line 27).
 *
 * `variant` controls the surface only, never wording:
 * - banner: the prominent, labelled treatment shared by every public page.
 * - footer: small print inside the footer's separate legal summary.
 */
export type DisclaimerVariant = "banner" | "footer";

export function Disclaimer({
  variant = "banner",
}: {
  variant?: DisclaimerVariant;
}) {
  if (variant === "banner") {
    return (
      // The chain ends here: it runs down the middle of the page, behind
      // whatever is in the way, and this section's own border is the last
      // thing it draws. Teal, like the exchange warning — both are the
      // "read this before you act" surfaces (DESIGN.md warning surfaces).
      <section
        role="note"
        aria-label="Non-affiliation disclaimer"
        data-spine-frame="cross"
        data-spine-hue="teal"
        className="relative isolate rounded-xl border border-accent-teal/45 bg-base-void/60 p-4"
      >
        <SpineFrame />
        <p className="label-caps flex items-center gap-1.5 text-accent-teal">
          <Info className="size-3.5 shrink-0" strokeWidth={1.75} aria-hidden />
          Not affiliated
        </p>
        <p className="mt-2 text-sm text-on-surface">{NON_AFFILIATION}</p>
      </section>
    );
  }

  return (
    <p
      role="note"
      aria-label="Non-affiliation disclaimer"
      className="text-xs text-on-surface-variant"
    >
      {NON_AFFILIATION}
    </p>
  );
}
