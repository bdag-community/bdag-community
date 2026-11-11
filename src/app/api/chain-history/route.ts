import { compressedJson } from "@/app/api/_lib/compressed-json";
import { getChainHistory } from "@/lib/chain/history";

/**
 * GET /api/chain-history — the 31-day daily-transaction series.
 *
 * Same shape as /api/stats: all visitors share one server-side snapshot so
 * the rate-limited explorer sees a single origin poll regardless of traffic.
 * The cadence is the difference — this series gains one point per day, so the
 * cache hint is half an hour with a day of stale-while-revalidate behind it.
 * A browser polling this every thirty minutes still costs the explorer at
 * most one request an hour.
 *
 * Thirty-one dates and thirty-one integers compress harder than anything else
 * here — 78% of the body was repetition — so it goes out gzipped.
 */
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const history = await getChainHistory();
  return compressedJson(request, history, {
    "Cache-Control": "public, s-maxage=1800, stale-while-revalidate=86400",
  });
}
