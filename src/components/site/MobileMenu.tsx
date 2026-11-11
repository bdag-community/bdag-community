"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import {
  Menu,
  X,
  ChevronRight,
  CircleHelp,
  Home,
  Network,
  Users,
  Cpu,
  Coins,
  Newspaper,
  Mail,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { HEADER_CTA, NAV_LINKS } from "@/lib/content/site";

/**
 * Mobile navigation drawer (lg:hidden). Hamburger toggles a full-width panel
 * that absolute-anchors below the sticky header. Modal: role=dialog +
 * aria-modal, backdrop, scroll-lock, Escape, focus moved in + trapped + restored.
 * Force-closes when the viewport crosses to desktop so the lock can't strand.
 */
/* One entry per NAV_LINKS href — a route missing from this map falls back to
   the chevron, which reads as an unfinished row rather than a design. */
const NAV_ICON: Record<string, LucideIcon> = {
  "/": Home,
  "/chain": Network,
  "/community": Users,
  "/mining": Cpu,
  "/staking": Coins,
  "/articles": Newspaper,
  "/faq": CircleHelp,
  "/contact": Mail,
};

export function MobileMenu() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const onChange = () => {
      if (mq.matches) setOpen(false);
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    if (!open) return;
    const trigger = triggerRef.current;
    const items = () =>
      Array.from(
        panelRef.current?.querySelectorAll<HTMLElement>("a, button") ?? [],
      );
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        return;
      }
      if (e.key === "Tab") {
        const list = items();
        if (list.length === 0) return;
        const first = list[0];
        const last = list[list.length - 1];
        // The panel container itself holds focus right after opening — treat it
        // as the leading boundary so Shift+Tab cannot escape to the backdrop.
        const atStart =
          document.activeElement === first ||
          document.activeElement === panelRef.current;
        if (e.shiftKey && atStart) {
          last.focus();
          e.preventDefault();
        } else if (!e.shiftKey && document.activeElement === last) {
          first.focus();
          e.preventDefault();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    // position:fixed lock (not overflow:hidden — unreliable on iOS, the page
    // rubber-bands behind the drawer). Preserve + restore the scroll position.
    const scrollY = window.scrollY;
    document.body.style.position = "fixed";
    document.body.style.top = `-${scrollY}px`;
    document.body.style.width = "100%";
    // Focus the panel CONTAINER, not the first link — mobile browsers treat a
    // scripted .focus() as keyboard-ish and paint the focus-visible ring.
    panelRef.current?.focus({ preventScroll: true });
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.position = "";
      document.body.style.top = "";
      document.body.style.width = "";
      window.scrollTo(0, scrollY);
      trigger?.focus({ preventScroll: true });
    };
  }, [open]);

  return (
    <div className="lg:hidden">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? "Close menu" : "Open menu"}
        aria-expanded={open}
        aria-controls="mobile-nav"
        className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-transparent text-on-surface-variant transition-colors hover:border-accent/20 hover:bg-accent/10 hover:text-accent-soft active:bg-accent/15 active:text-accent-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-base-void"
      >
        {open ? (
          <X className="size-6" aria-hidden />
        ) : (
          <Menu className="size-6" aria-hidden />
        )}
      </button>

      {open && (
        <>
          {/* Backdrop anchored BELOW the header (top-full) so it never dims the
              logo/hamburger — it shares the sticky header's stacking context.

              A div, not a button. As a button it was a second "Close menu"
              control in the tab order, identical in name to the X two stops
              earlier and invisible when focused, so a keyboard user met a
              phantom stop before the first nav link. Nothing is lost: Escape
              closes the drawer, the X closes the drawer, and a pointer user
              tapping outside still closes it here. aria-hidden keeps it out of
              the accessibility tree entirely, which is what a scrim is. */}
          <div
            aria-hidden
            onClick={() => setOpen(false)}
            className="absolute inset-x-0 top-full z-40 h-[100dvh] animate-fade-in bg-base-void/60 backdrop-blur-sm [animation-duration:200ms]"
          />
          <div
            ref={panelRef}
            id="mobile-nav"
            role="dialog"
            aria-modal="true"
            aria-label="Site menu"
            tabIndex={-1}
            className="absolute inset-x-0 top-full z-50 max-h-[calc(100dvh-5rem)] origin-top overflow-y-auto overscroll-contain animate-fade-up border-b border-border bg-base-void/95 backdrop-blur-md outline-none"
          >
            <ul className="flex flex-col px-4 py-1">
              {NAV_LINKS.map((link) => {
                const Icon = NAV_ICON[link.href] ?? ChevronRight;
                const active =
                  link.href === "/"
                    ? pathname === "/"
                    : pathname.startsWith(link.href);
                return (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      onClick={() => setOpen(false)}
                      aria-current={active ? "page" : undefined}
                      className={[
                        "flex min-h-[44px] items-center justify-between rounded border-b border-border/60 py-3 transition-colors active:text-accent-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-base-void",
                        active
                          ? "font-medium text-accent-soft"
                          : "text-on-surface hover:text-accent-soft",
                      ].join(" ")}
                    >
                      <span className="flex items-center gap-3">
                        <Icon
                          className="size-4 text-accent-soft"
                          strokeWidth={1.75}
                          aria-hidden
                        />
                        {link.label}
                      </span>
                      <ChevronRight
                        className="size-4 text-on-surface-variant"
                        strokeWidth={1.75}
                        aria-hidden
                      />
                    </Link>
                  </li>
                );
              })}
            </ul>
            <div className="px-4 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
              <Button
                href={HEADER_CTA.href}
                className="w-full"
                onClick={() => setOpen(false)}
              >
                {HEADER_CTA.label}
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
