import Link from "next/link";
import type { ReactNode } from "react";
import { Section } from "@/components/ui/Section";
import { AdminNav } from "@/components/admin/AdminNav";
import { SignOutButton } from "@/components/admin/SignOutButton";
import { verifySession } from "@/lib/dal/session";

/**
 * (admin) route-group chrome — Operate mode: quiet, scannable, form-first.
 * Logo + an "Admin" label and (when signed in) sign-out; deliberately NOT the
 * public Header/Footer (no marketing nav, no gradient moments, no Disclaimer
 * banner — this is an internal operator surface, not a public trust surface).
 *
 * This layout does NOT gate: /admin/sign-in lives inside the group and must
 * render signed-out. Every admin PAGE gates itself via requireAdmin() — the
 * DAL is the security boundary, never layout or middleware.
 */
export default async function AdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  // Safe without Supabase env (resolves null) — the chrome must never crash.
  const user = await verifySession();

  return (
    <>
      <header className="border-b border-border bg-base-void/80">
        <Section
          as="div"
          className="flex items-center justify-between gap-4 py-2"
        >
          <div className="flex items-center gap-3">
            <Link
              href="/"
              aria-label="BDAG Community, home"
              className="flex h-11 shrink-0 items-center rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-base-void"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo.svg" alt="" className="h-8 w-auto" />
            </Link>
            <span className="label-caps border-l border-border pl-3 text-on-surface-variant">
              Admin
            </span>
          </div>
          {user && <SignOutButton email={user.email ?? null} />}
        </Section>
      </header>

      {/* Area navigation is chrome for signed-in operators only. It grants
          nothing: every page behind these links still calls requireAdmin(). */}
      {user && <AdminNav />}

      <Section as="main" className="py-10">
        {children}
      </Section>
    </>
  );
}
