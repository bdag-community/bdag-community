import Link from "next/link";
import { COMMUNITY_VIEW_SWITCH } from "@/lib/content/site";
import { cn } from "@/lib/utils/cn";

/**
 * The Info | Projects switch at the top of the two community views. Same
 * pill-rail construction as the Chain primer selector, sized up and
 * centred: this control swaps the ENTIRE page view, so it reads as a page
 * decision rather than a section widget. It is a pair of links, not client
 * state, so each view keeps its own URL, metadata, and scroll anchors.
 */
export function CommunityViewSwitch({
  active,
}: {
  active: (typeof COMMUNITY_VIEW_SWITCH.items)[number]["key"];
}) {
  return (
    <nav
      aria-label={COMMUNITY_VIEW_SWITCH.label}
      className="mx-auto grid w-full max-w-[22rem] grid-cols-2 gap-2 rounded-full border border-border/70 bg-container/55 p-1.5 backdrop-blur-sm"
    >
      {COMMUNITY_VIEW_SWITCH.items.map((item) => {
        const isActive = item.key === active;
        return (
          <Link
            key={item.key}
            href={item.href}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "inline-flex min-h-[48px] items-center justify-center rounded-full border px-4 py-2 font-mono text-sm font-medium uppercase tracking-[0.16em] transition-colors duration-200",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-base-void",
              isActive
                ? "border-accent/55 bg-accent/15 text-on-surface shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]"
                : "border-transparent text-on-surface-variant hover:border-accent/25 hover:bg-accent/5 hover:text-accent-soft",
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
