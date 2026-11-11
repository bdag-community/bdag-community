import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { SignInForm } from "@/components/admin/SignInForm";
import { SignOutButton } from "@/components/admin/SignOutButton";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import { getAdminSession, verifySession } from "@/lib/dal/session";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Admin sign-in",
  description: "Operator sign-in for the BDAG Community admin area.",
  // Never index an operator surface.
  robots: { index: false, follow: false },
};

/**
 * /admin/sign-in — the one (admin) page that renders signed-out. Three honest
 * states: Supabase not configured (notice, no crash), signed in without the
 * admin claim (explain + sign out), or the email+password form.
 *
 * Admin-surface copy lives HERE, not in site.ts — site.ts is the frozen
 * public content module and admin chrome must never touch it.
 */
const NOT_CONFIGURED = {
  title: "Supabase is not configured",
  body:
    "This deployment has no NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, so the admin area is inactive. The public site keeps working on seed content. Setup steps live in supabase/README.md.",
} as const;

const NO_ADMIN_ACCESS = {
  title: "Signed in, but not an admin",
  body:
    "This account has no admin access. If it was granted just now, sign out and back in. The admin claim only lands on a fresh session.",
} as const;

export default async function SignInPage() {
  if (!hasSupabaseEnv()) {
    return (
      <div className="mx-auto w-full max-w-md">
        <Card className="space-y-3 p-6">
          <h1 className="h3 text-on-surface">{NOT_CONFIGURED.title}</h1>
          <p className="body-sm">{NOT_CONFIGURED.body}</p>
        </Card>
      </div>
    );
  }

  // Already an admin? Straight to work.
  if (await getAdminSession()) redirect("/admin");

  // Signed in without the claim — honest dead end, not a silent form loop.
  const user = await verifySession();
  if (user) {
    return (
      <div className="mx-auto w-full max-w-md">
        <Card className="space-y-4 p-6">
          <h1 className="h3 text-on-surface">{NO_ADMIN_ACCESS.title}</h1>
          <p className="body-sm">
            You are signed in as{" "}
            <span className="font-mono text-on-surface">{user.email}</span>.
          </p>
          <p className="body-sm">{NO_ADMIN_ACCESS.body}</p>
          <SignOutButton email={null} />
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-md space-y-6">
      <header className="space-y-1">
        <p className="label-caps text-on-surface-variant">Operators only</p>
        <h1 className="h3 text-on-surface">Sign in to the admin area</h1>
      </header>
      <Card className="p-6">
        <SignInForm />
      </Card>
    </div>
  );
}
