import { type NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { hasSupabaseEnv } from "@/lib/supabase/env";

/**
 * Admin-only session-refresh middleware (+ COARSE route gating only).
 *
 * ⚠️  Middleware is NOT the security boundary. It can be bypassed (direct
 *     Server Action invocation, races) and must not be trusted for
 *     authorization. Real authz lives in the server-only Data Access Layer
 *     (lib/dal/session.ts: verifySession / getAdminSession / requireAdmin),
 *     which derives identity from the server-verified JWT.
 *
 * Responsibilities here, and ONLY here:
 *  1. Refresh the Supabase session cookie so the JWT stays fresh.
 *  2. Coarse redirect: send unauthenticated visitors from /admin/* to
 *     /admin/sign-in. This is UX, not a trust boundary — the DAL re-checks
 *     (and checks ADMIN, which this deliberately does not).
 *
 * With no Supabase env (fresh clone, preview build) this is a harmless
 * no-op: no cookies to refresh, and /admin/* falls through to the DAL,
 * which redirects to the sign-in page's "not configured" notice.
 */
export async function middleware(request: NextRequest) {
  if (!hasSupabaseEnv()) return NextResponse.next();

  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Refreshes the session if expired. Do NOT add code between createServerClient
  // and getUser() — auth tokens can be missed otherwise.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  // Image subrequests must fail as an image response, never receive sign-in
  // HTML. Each route performs the full getAdminSession() authorization check.
  const isArticleAssetPreviewPath =
    /^\/admin\/(?:news|projects)\/[^/]+\/assets\/[^/]+\/preview$/.test(pathname);

  // Coarse gate ONLY: /admin/* except sign-in and the independently gated
  // private preview response.
  const isGatedPath =
    pathname.startsWith("/admin") &&
    pathname !== "/admin/sign-in" &&
    !isArticleAssetPreviewPath;

  if (!user && isGatedPath) {
    const url = request.nextUrl.clone();
    url.pathname = "/admin/sign-in";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  // Public routes never need a visitor session. Keeping this admin-only avoids
  // an Auth round trip and prevents cookies from making public HTML dynamic.
  matcher: ["/admin/:path*"],
};
