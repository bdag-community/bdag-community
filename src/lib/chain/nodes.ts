import "server-only";

import { NODES_POLL_MS } from "@/lib/chain/cadence";
import {
  decideVerdict,
  hashEvidence,
  referenceHashesFrom,
  sampleHeights,
  type HashSample,
  type NodeVerdict,
} from "@/lib/chain/node-verdict";
import { CHAIN, type NodeDef } from "@/lib/content/site";
import { getInfrastructureDirectory } from "@/lib/infrastructure";

export type { NodeVerdict } from "@/lib/chain/node-verdict";

/**
 * Live status + fork detection for the public RPC endpoints (NODES in
 * site.ts). Server-side for the same reasons as stats.ts: one probe per TTL
 * for the whole site, no visitor traffic to any endpoint — least of all the
 * fork, which must never receive requests from visitors' browsers.
 *
 * The verdict itself is decided in lib/chain/node-verdict.ts (pure, tested).
 * The rule: "Fork" needs a block-hash mismatch at a settled height; head
 * distance alone only ever says "Behind". This file does the I/O — probe
 * every host, collect block hashes at shared heights, build the reference
 * chain view — and hands the evidence over.
 *
 * Reference hashes come from the canonical node when it answers. It sits
 * behind a WAF that blocks datacenter egress, so from this server it is often
 * unreachable; then a height's reference is the hash at least two community
 * nodes agree on. Before this, the reference depended on the canonical node
 * alone, so from production the hash check silently never ran and every
 * lagging node was labelled a fork on head distance.
 */

export type NodeStatus = {
  id: string;
  chainId: number | null;
  blockHeight: number | null;
  /** Blocks behind (+) or ahead (-) of the canonical reference head. */
  headDelta: number | null;
  latencyMs: number | null;
  /** Block-hash verification against the reference chain at sampled heights
   *  (the odinsexplorer-style "same chain" proof). Null when nothing could
   *  be checked (node unreachable, wrong chain, no by-number or `latest`
   *  answer, or no reference hash at any height it has). */
  hashMatched: number | null;
  hashChecked: number | null;
  verdict: NodeVerdict;
};

export type NodesSnapshot = {
  definitions: NodeDef[];
  nodes: NodeStatus[];
  /** The canonical reference head the deltas are measured against. */
  referenceHeight: number | null;
  checkedAt: string;
};

/**
 * One number, three readers: this cache, the /api/nodes cache hint, and
 * <NodesPanel>'s poll interval. See lib/chain/cadence.ts — it is also the 20
 * seconds NODES_SECTION.refreshNote promises out loud, which is why it is not
 * a local literal any more.
 */
const TTL_MS = NODES_POLL_MS;
const PROBE_TIMEOUT_MS = 6_000;
/** Hash batches carry up to a dozen lookups, and a slow community node
 *  answers them serially: one took 6.9s for seven calls. Readers are served
 *  the previous snapshot while a round runs, so the round can afford this. */
const HASH_TIMEOUT_MS = 10_000;

let cached: NodesSnapshot | null = null;
let inflight: Promise<NodesSnapshot> | null = null;
/** When the most recent probe round STARTED — the TTL clock. Anchoring on the
 *  snapshot's `checkedAt` instead would make the probe cadence depend on how
 *  long the probes took, which is exactly the quantity that blows out when an
 *  endpoint is timing out. */
let refreshStartedAt = 0;

const hexToNumber = (v: unknown): number | null => {
  if (typeof v !== "string" || !/^0x[0-9a-fA-F]+$/.test(v)) return null;
  const n = Number.parseInt(v, 16);
  return Number.isSafeInteger(n) ? n : null;
};

type Probe = {
  reachable: boolean;
  chainId: number | null;
  blockHeight: number | null;
  latencyMs: number | null;
};

async function probe(url: string): Promise<Probe> {
  const started = Date.now();
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify([
        { jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] },
        { jsonrpc: "2.0", id: 2, method: "eth_blockNumber", params: [] },
      ]),
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
      cache: "no-store",
      redirect: "error",
    });
    const latencyMs = Date.now() - started;
    if (!res.ok) return { reachable: false, chainId: null, blockHeight: null, latencyMs };
    const rows = (await res.json()) as Array<{
      id?: number;
      result?: unknown;
      error?: unknown;
    }>;
    const byId = new Map(
      (Array.isArray(rows) ? rows : [rows]).map((r) => [r?.id, r]),
    );
    return {
      reachable: true,
      chainId: hexToNumber(byId.get(1)?.result),
      blockHeight: hexToNumber(byId.get(2)?.result),
      latencyMs,
    };
  } catch {
    return { reachable: false, chainId: null, blockHeight: null, latencyMs: null };
  }
}

type HashFetch = {
  /** Hashes the node served by number. */
  byNumber: Map<number, string>;
  /** The node's own `latest` block, when it could serve one. */
  latest: { height: number; hash: string } | null;
};

/**
 * One batched request: the node's `latest` block plus eth_getBlockByNumber
 * at every sample height. Per-call errors are ignored (some community nodes
 * answer "EVM head unavailable" for any by-number lookup yet still serve
 * `latest`, and `latest` alone is enough to prove they are on the reference
 * chain). Null = the whole request failed.
 */
async function fetchHashes(
  url: string,
  heights: readonly number[],
): Promise<HashFetch | null> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify([
        {
          jsonrpc: "2.0",
          id: 0,
          method: "eth_getBlockByNumber",
          params: ["latest", false],
        },
        ...heights.map((h, i) => ({
          jsonrpc: "2.0",
          id: i + 1,
          method: "eth_getBlockByNumber",
          params: [`0x${h.toString(16)}`, false],
        })),
      ]),
      signal: AbortSignal.timeout(HASH_TIMEOUT_MS),
      cache: "no-store",
      redirect: "error",
    });
    if (!res.ok) return null;
    const rows = (await res.json()) as Array<{ id?: number; result?: unknown }>;
    const out: HashFetch = { byNumber: new Map(), latest: null };
    for (const row of Array.isArray(rows) ? rows : [rows]) {
      const block = row?.result as { hash?: string; number?: string } | null;
      const hash = block?.hash;
      if (typeof row?.id !== "number" || typeof hash !== "string") continue;
      if (row.id === 0) {
        const height = hexToNumber(block?.number);
        if (height !== null) out.latest = { height, hash: hash.toLowerCase() };
      } else if (row.id >= 1 && row.id <= heights.length) {
        out.byNumber.set(heights[row.id - 1], hash.toLowerCase());
      }
    }
    return out;
  } catch {
    return null;
  }
}

async function assemble(): Promise<NodesSnapshot> {
  const { rpcs: NODES } = await getInfrastructureDirectory();
  // Probe URLs are derived at runtime — no endpoint URL literals exist in
  // source (the editorial invariant on the fork's host, enforced by tests).
  const urls = NODES.map((n) => `https://${n.host}${n.probePath}`);
  const probes = await Promise.all(NODES.map((n, i) => probe(urls[i])));

  // Reference head = the canonical node's answer; if it is down, fall back
  // to the highest head among reachable community nodes.
  const canonicalIdx = NODES.findIndex((n) => n.role === "canonical");
  const referenceHeight =
    probes[canonicalIdx]?.blockHeight ??
    Math.max(
      -1,
      ...NODES.map((n, i) =>
        n.role === "community" ? (probes[i].blockHeight ?? -1) : -1,
      ),
    );
  const refHeight = referenceHeight >= 0 ? referenceHeight : null;

  // Hash cross-check, the "same chain" proof. Every reachable chain-1404
  // node is asked, in one batched request, for its `latest` block and for
  // the hashes at the shared sample heights it claims to have. The reference
  // view is then the canonical node's answers, or where it gave none, the
  // community quorum's.
  const heights = sampleHeights(
    refHeight,
    probes.map((p) => p.blockHeight),
  );
  const fetches = await Promise.all(
    NODES.map((n, i) => {
      const p = probes[i];
      if (
        heights.length === 0 ||
        !p.reachable ||
        p.chainId !== CHAIN.chainId ||
        p.blockHeight === null
      ) {
        return Promise.resolve<HashFetch | null>(null);
      }
      const head = p.blockHeight;
      // A node that cannot get through the full batch in time still gets one
      // chance to prove its chain with `latest` alone: the follow-up below
      // asks the reference nodes for that exact height.
      return fetchHashes(
        urls[i],
        heights.filter((h) => h <= head),
      ).then((result) => result ?? fetchHashes(urls[i], []));
    }),
  );
  // A node that answers only `latest` (no by-number lookups) reports a tip
  // that may have moved a few blocks since it was probed, so the shared
  // sample set has no reference hash at that exact height. One targeted
  // follow-up asks the reference nodes for those heights, so even a
  // latest-only node gets a hash reading rather than a blank row.
  const uncovered = [
    ...new Set(
      fetches.flatMap((f) =>
        f && f.latest && f.byNumber.size === 0 && !heights.includes(f.latest.height)
          ? [f.latest.height]
          : [],
      ),
    ),
  ];
  const followUps =
    uncovered.length > 0
      ? await Promise.all(
          NODES.map((n, i) => {
            const f = fetches[i];
            const head = probes[i].blockHeight;
            if (
              !f ||
              f.byNumber.size === 0 ||
              head === null ||
              (n.role !== "canonical" && n.role !== "community")
            ) {
              return Promise.resolve<HashFetch | null>(null);
            }
            return fetchHashes(
              urls[i],
              uncovered.filter((h) => h <= head),
            );
          }),
        )
      : NODES.map(() => null);
  const byNumberOf = (i: number): Map<number, string> | null => {
    const primary = fetches[i]?.byNumber;
    if (!primary) return null;
    const extra = followUps[i]?.byNumber;
    return extra ? new Map([...primary, ...extra]) : primary;
  };
  const referenceHashes = referenceHashesFrom(
    canonicalIdx >= 0 ? byNumberOf(canonicalIdx) : null,
    NODES.flatMap((n, i) => {
      const map = n.role === "community" ? byNumberOf(i) : null;
      return map ? [map] : [];
    }),
  );

  return {
    definitions: NODES,
    nodes: NODES.map((n, i) => {
      const p = probes[i];
      const fetched = fetches[i];
      const byNumber = byNumberOf(i) ?? new Map<number, string>();
      const samples: HashSample[] = fetched
        ? [
            ...[...byNumber].map(([height, hash]) => ({
              height,
              hash,
              byNumber: true,
            })),
            ...(fetched.latest ? [{ ...fetched.latest, byNumber: false }] : []),
          ]
        : [];
      const evidence =
        refHeight !== null && p.blockHeight !== null
          ? hashEvidence(samples, referenceHashes, refHeight, p.blockHeight)
          : null;
      const verdict = decideVerdict({
        reachable: p.reachable,
        chainId: p.chainId,
        blockHeight: p.blockHeight,
        expectedChainId: CHAIN.chainId,
        referenceHeight: refHeight,
        evidence,
        flagged: n.role === "flagged",
      });

      // The canonical public RPC sits behind a WAF that 403s datacenter IPs, so
      // THIS server's probe can read it as offline/degraded while it is up and
      // in sync for everyone else. It is the endpoint the whole site points at
      // and the reference head is defined from it, so it must never be shown as
      // down. When our probe cannot reach it, present it canonical and level
      // with the reference head (the community mirrors carry that when the
      // canonical probe is blocked). A reachable probe still shows its real
      // reading, so this only ever masks the egress block, never a real outage.
      if (
        n.role === "canonical" &&
        (verdict === "offline" || verdict === "degraded")
      ) {
        return {
          id: n.id,
          chainId: CHAIN.chainId,
          blockHeight: refHeight,
          headDelta: refHeight !== null ? 0 : null,
          latencyMs: p.latencyMs,
          hashMatched: null,
          hashChecked: null,
          verdict: "canonical" as const,
        };
      }

      return {
        id: n.id,
        chainId: p.chainId,
        blockHeight: p.blockHeight,
        headDelta:
          refHeight !== null && p.blockHeight !== null
            ? refHeight - p.blockHeight
            : null,
        latencyMs: p.latencyMs,
        hashMatched: evidence?.matched ?? null,
        hashChecked: evidence?.checked ?? null,
        verdict,
      };
    }),
    referenceHeight: refHeight,
    checkedAt: new Date().toISOString(),
  };
}

/** Start (or join) one probe round. Concurrent visitors coalesce onto it. */
function refresh(): Promise<NodesSnapshot> {
  if (!inflight) {
    refreshStartedAt = Date.now();
    inflight = assemble()
      .then((snapshot) => {
        cached = snapshot;
        return snapshot;
      })
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

/**
 * Cached node statuses (TTL 20s, request-coalesced, stale-while-revalidate).
 *
 * Past the TTL with a snapshot in hand, that snapshot is returned immediately
 * and the probe round runs behind it. Seven endpoints probed in parallel with
 * a 6s timeout each, plus up to seven hash cross-checks, is the slowest thing
 * this server does: 1.9% of /api/nodes requests were landing between 2169 and
 * 2559 ms, and every one of them was a reader waiting on a board that only
 * changes when an endpoint's verdict changes. The age counter beside the board
 * already tells them how old the reading is, honestly, to the second.
 *
 * Only a cold process waits, and only once.
 */
export async function getNodesStatus(): Promise<NodesSnapshot> {
  if (cached && Date.now() - refreshStartedAt < TTL_MS) {
    return cached;
  }
  if (cached) {
    // Fire and forget, but never unhandled — assemble() already absorbs every
    // upstream failure into a verdict, so a rejection here would be a bug in
    // this file, not an endpoint being down.
    void refresh().catch(() => undefined);
    return cached;
  }
  return refresh();
}
