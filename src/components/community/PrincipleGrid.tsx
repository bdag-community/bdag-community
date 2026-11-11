import type { CSSProperties } from "react";
import { RevealGroup, RevealItem } from "@/components/ui/Reveal";
import { cn } from "@/lib/utils/cn";
import { COMMUNITY_PAGE } from "@/lib/content/site";

/**
 * Hairline placement for the principles 2x2 — dividers live BETWEEN cells
 * (mobile: stacked rows; sm+: a centre cross), never boxed around the outside
 * (DESIGN.md: hairline edges, not four identical icon cards).
 */
const PRINCIPLE_CELLS = [
  "sm:pr-10",
  "border-t border-border/60 sm:border-l sm:border-t-0 sm:pl-10",
  "border-t border-border/60 sm:pr-10",
  "border-t border-border/60 sm:border-l sm:pl-10",
] as const;

/**
 * The four principles as a 2x2 whose dividers are the composition.
 *
 * This is the one page on the site where the layout is literally the subject:
 * four independent cells meeting at a point. So the arrival is simultaneous
 * (stagger 0) rather than sequential — a sequence would say "first this, then
 * that", and the claim is that these four hold at once — and the lit copy of
 * the divider is drawn outward from the meeting point rather than from an end.
 *
 * The cross is sm-only. Below 640 the 2x2 does not exist and neither does a
 * cross: the cells stack and the existing border-t between rows carries the
 * division, unlit, exactly as it does today.
 */
export function PrincipleGrid() {
  return (
    <RevealGroup
      className="relative mt-4 grid sm:auto-rows-fr sm:grid-cols-2"
      stagger={0}
    >
      {COMMUNITY_PAGE.principles.map((principle, i) => (
        <RevealItem
          key={principle.title}
          className={cn("flex flex-col gap-3 py-8", PRINCIPLE_CELLS[i])}
        >
          {/* Purely ordinal and aria-hidden, so `outline` is the right weight
              here — it is not informational text. */}
          <span aria-hidden className="font-mono text-sm text-outline">
            {`0${i + 1}`}
          </span>
          <h3 className="h3">{principle.title}</h3>
          <p className="body">{principle.body}</p>
        </RevealItem>
      ))}

      {/* The two arms come LAST on purpose: the stagger rules key off
          `> [data-reveal-item]:nth-child(n)`, and :nth-child counts every
          sibling, so anything placed ahead of the cells would silently shift
          their index. They are aria-hidden overlays with no pointer events, so
          painting them above the text costs nothing.

          sm:auto-rows-fr on the grid is what makes `top-1/2` honest: with
          auto-height rows the two rows differ and the lit arm would float free
          of the border-t it is supposed to be a copy of. Equal rows put the
          row boundary exactly at 50%. */}
      <span
        aria-hidden
        data-edge
        className="pointer-events-none absolute left-0 top-1/2 hidden w-full sm:block"
        style={
          { "--edge-origin": "center", "--edge-len": "100%" } as CSSProperties
        }
      />
      <span
        aria-hidden
        data-edge
        data-axis="y"
        className="pointer-events-none absolute left-1/2 top-0 hidden h-full sm:block"
        style={
          {
            "--edge-origin": "center",
            "--edge-len": "100%",
            "--edge-draw": "460ms",
          } as CSSProperties
        }
      />
    </RevealGroup>
  );
}
