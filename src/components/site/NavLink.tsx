"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Desktop nav link with an active-route indicator (underline + aria-current).
 * Client component (usePathname) so the server Header stays a server
 * component.
 *
 * The underline is a SOLID #e08cff, not the brand gradient. A three-stop
 * gradient inside a 2px bar about forty pixels wide cannot resolve its own
 * stops: it renders as an indeterminate smear that changes hue with the
 * width of the word above it, so "Home" and "Community" were different
 * colours. One colour reads as one state.
 */
export function NavLink({ href, label }: { href: string; label: string }) {
  const pathname = usePathname();
  const active = href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={[
        "relative inline-flex min-h-[44px] items-center rounded px-1 py-2 transition-colors duration-150",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-base-void",
        "after:absolute after:-bottom-0.5 after:left-1 after:right-1 after:h-0.5 after:origin-left after:rounded-full after:bg-accent-glow after:transition-transform after:duration-200",
        active
          ? "text-on-surface after:scale-x-100"
          : "text-on-surface-variant after:scale-x-0 hover:text-accent-soft hover:after:scale-x-100",
      ].join(" ")}
    >
      {label}
    </Link>
  );
}
