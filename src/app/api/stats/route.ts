import { compressedJson } from "@/app/api/_lib/compressed-json";
import { getNetworkStats } from "@/lib/chain/stats";

/**
 * GET /api/stats — the ONE place browsers read live network numbers from.
 *
 * All visitors share the server's 12s-TTL snapshot (see lib/chain/stats.ts),
 * so the rate-limited explorer API sees one origin poll regardless of traffic.
 * The CDN/proxy hint mirrors the same cadence.
 *
 * The body is gzipped when the caller accepts it — this is the largest thing
 * the site sends repeatedly, and it was going out uncompressed.
 */
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const stats = await getNetworkStats();
  return compressedJson(request, stats, {
    "Cache-Control": "public, s-maxage=12, stale-while-revalidate=60",
  });
}
