import { compressedJson } from "@/app/api/_lib/compressed-json";
import { NODES_POLL_S } from "@/lib/chain/cadence";
import { getNodesStatus } from "@/lib/chain/nodes";

/**
 * GET /api/nodes — live status + fork detection for the public RPC
 * endpoints. Same discipline as /api/stats: the server probes once per TTL
 * for all visitors; browsers never contact the endpoints directly (especially
 * not the fork).
 *
 * The TTL, the cache hint below and the client's poll interval are the same
 * number, imported from lib/chain/cadence. They used to be three different
 * ones — 20s, 10s and 10s — and the doc comment here claimed a fourth (30s),
 * which is how you can tell nobody could hold all four in their head.
 *
 * The body is gzipped when the caller accepts it (71% of it was overhead).
 */
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const snapshot = await getNodesStatus();
  return compressedJson(request, snapshot, {
    "Cache-Control": `public, s-maxage=${NODES_POLL_S}, stale-while-revalidate=60`,
  });
}
