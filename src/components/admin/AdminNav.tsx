"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils/cn";

/**
 * Admin area navigation — one row of quiet text links under the admin
 * header. Rendered only for signed-in operators (the layout decides), and
 * purely chrome: every page still gates itself through the DAL.
 *
 * Active state: exact match for the dashboard, prefix match for the areas,
 * with the legacy /admin/news editor routes highlighting Articles so the
 * operator never loses their place while editing.
 */
const AREAS = [
  { label: "Dashboard", href: "/admin", prefixes: ["/admin"] },
  {
    label: "Articles",
    href: "/admin/articles",
    prefixes: ["/admin/articles", "/admin/news"],
  },
  { label: "Projects", href: "/admin/projects", prefixes: ["/admin/projects"] },
  { label: "Infrastructure", href: "/admin/infrastructure", prefixes: ["/admin/infrastructure"] },
  { label: "Activity", href: "/admin/activity", prefixes: ["/admin/activity"] },
  { label: "Inbox", href: "/admin/inbox", prefixes: ["/admin/inbox"] },
  {
    label: "Suggestions",
    href: "/admin/suggestions",
    prefixes: ["/admin/suggestions"],
  },
] as const;

export function AdminNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="Admin areas" className="border-b border-border bg-base-void/60">
      <div className="mx-auto w-full max-w-site overflow-x-auto px-4 md:px-8">
        <ul className="flex items-center gap-1">
          {AREAS.map((area) => {
            const active =
              area.href === "/admin"
                ? pathname === "/admin"
                : area.prefixes.some(
                    (prefix) =>
                      pathname === prefix || pathname.startsWith(`${prefix}/`),
                  );
            return (
              <li key={area.href} className="shrink-0">
                <Link
                  href={area.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "relative inline-flex min-h-[44px] items-center px-3 text-sm font-medium transition-colors",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-base-void",
                    "after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:rounded-full",
                    active
                      ? "text-on-surface after:bg-accent-glow"
                      : "text-on-surface-variant after:bg-transparent hover:text-accent-soft",
                  )}
                >
                  {area.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </nav>
  );
}
