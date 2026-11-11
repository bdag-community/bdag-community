import { NextResponse } from "next/server";

/**
 * GET /api/health — the application liveness contract.
 *
 * The deploy gate must prove this process can answer, not inherit the uptime
 * of a third-party RPC. Chain availability remains visible through /api/stats,
 * where the public UI keeps its stable chain identity while DevTools records
 * transient quorum recovery.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const body = {
    ok: true,
    checkedAt: new Date().toISOString(),
    checks: {
      application: true,
    },
  };
  return NextResponse.json(body, { status: 200 });
}
