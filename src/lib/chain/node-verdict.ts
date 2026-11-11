/**
 * Pure verdict logic for the public node board. No `server-only`, no fetch,
 * no content import: this module holds the decision and nothing else, so the
 * tests can load it directly and the prober in nodes.ts stays about I/O.
 *
 * The rule this encodes, in one sentence: an endpoint is a fork only when it
 * serves a different block hash than the reference chain at a height both
 * sides consider settled. Head distance alone never proves a fork — a node
 * that is merely behind still agrees on every block it has — so distance
 * alone can only ever say "behind".
 *
 * Verdicts:
 * - canonical  : chain ID 1404, head within BEHIND_BLOCKS of the reference
 *                head, and no settled hash mismatch.
 * - behind     : chain ID 1404, agrees with the reference chain at every
 *                shared height it could be checked at (or could not be
 *                checked at all), but its head lags by more than
 *                BEHIND_BLOCKS. Stalled or still syncing — not a fork.
 * - diverged   : claims chain ID 1404 but a settled block hash differs from
 *                the reference chain. This is the fork verdict, and the only
 *                way to earn it is a hash mismatch.
 * - wrong-chain: answers a different chain ID.
 * - degraded   : reachable but cannot serve chainId + head.
 * - offline    : unreachable.
 */

export type NodeVerdict =
  | "canonical"
  | "behind"
  | "diverged"
  | "wrong-chain"
  | "degraded"
  | "offline";

/** A healthy mirror lags seconds; ~10 minutes of blocks is "behind". */
export const BEHIND_BLOCKS = 600;

/** Depths below the reference head where block hashes are cross-checked. */
export const HASH_SAMPLE_DEPTHS = [100, 1_000, 10_000, 50_000] as const;

/**
 * A hash mismatch counts as fork proof only this far below BOTH heads. Nearer
 * the tip two honest nodes can briefly disagree while the DAG settles, and a
 * board that says "Fork" about a settling tip is a board nobody trusts.
 */
export const SETTLED_DEPTH = 64;

/**
 * For a node that is behind, the fixed depths may all sit above its head, so
 * it also gets sampled just below its own head (and at its head, so a node
 * that can only serve `latest` still has a reference hash to be checked
 * against). 100 keeps the sample past SETTLED_DEPTH.
 */
export const OWN_HEAD_SAMPLE_DEPTH = 100;

/** Cap on heights fetched per node in one batch (well under the RPC limit). */
export const MAX_SAMPLE_HEIGHTS = 48;

/** One block hash a node reported at a height. */
export type HashSample = {
  height: number;
  hash: string;
  /**
   * true  — looked up by number, so this is the node's settled view.
   * false — the node's own `latest` tip. A match here proves it is on the
   *         reference chain; a mismatch here proves nothing (it may just be
   *         a tip the DAG has not settled yet, or an orphan a stalled node is
   *         sitting on), so it can never be fork proof on its own.
   */
  byNumber: boolean;
};

export type HashEvidence = {
  matched: number;
  checked: number;
  /** A by-number mismatch at a height settled on both sides. */
  forkProven: boolean;
};

/** Heights every reachable node is asked for, sorted highest first. */
export function sampleHeights(
  referenceHeight: number | null,
  nodeHeights: readonly (number | null)[],
): number[] {
  if (referenceHeight === null) return [];
  const heights = new Set<number>();
  for (const depth of HASH_SAMPLE_DEPTHS) {
    const h = referenceHeight - depth;
    if (h > 0) heights.add(h);
  }
  for (const head of nodeHeights) {
    if (head === null || head <= 0) continue;
    // Only a node the fixed depths might not cover needs its own samples.
    if (referenceHeight - head <= OWN_HEAD_SAMPLE_DEPTH) continue;
    heights.add(head);
    if (head - OWN_HEAD_SAMPLE_DEPTH > 0) heights.add(head - OWN_HEAD_SAMPLE_DEPTH);
  }
  return [...heights].sort((a, b) => b - a).slice(0, MAX_SAMPLE_HEIGHTS);
}

/**
 * The reference hash per height. The canonical node's answer wins outright
 * when it gave one. Where it could not (it sits behind a WAF that blocks
 * datacenter egress, so from this server it is often unreachable), a height
 * takes the hash that at least two community voters agree on and that
 * strictly beats every rival; a split vote yields no reference at that
 * height, and no reference means no verdict either way.
 */
export function referenceHashesFrom(
  canonical: ReadonlyMap<number, string> | null,
  voters: readonly ReadonlyMap<number, string>[],
): Map<number, string> {
  const reference = new Map<number, string>();
  const heights = new Set<number>();
  for (const [h] of canonical ?? []) heights.add(h);
  for (const voter of voters) for (const [h] of voter) heights.add(h);

  for (const h of heights) {
    const fromCanonical = canonical?.get(h);
    if (fromCanonical) {
      reference.set(h, fromCanonical);
      continue;
    }
    const tally = new Map<string, number>();
    for (const voter of voters) {
      const hash = voter.get(h);
      if (hash) tally.set(hash, (tally.get(hash) ?? 0) + 1);
    }
    const ranked = [...tally.entries()].sort((a, b) => b[1] - a[1]);
    const [best, runnerUp] = ranked;
    if (best && best[1] >= 2 && (!runnerUp || runnerUp[1] < best[1])) {
      reference.set(h, best[0]);
    }
  }
  return reference;
}

/** Compare one node's samples against the reference. Null = nothing checked. */
export function hashEvidence(
  samples: readonly HashSample[],
  reference: ReadonlyMap<number, string>,
  referenceHeight: number,
  nodeHeight: number,
): HashEvidence | null {
  let matched = 0;
  let checked = 0;
  let forkProven = false;
  for (const sample of samples) {
    const ref = reference.get(sample.height);
    if (!ref) continue;
    checked += 1;
    if (ref === sample.hash) {
      matched += 1;
      continue;
    }
    const settled =
      sample.byNumber &&
      referenceHeight - sample.height >= SETTLED_DEPTH &&
      nodeHeight - sample.height >= SETTLED_DEPTH;
    if (settled) forkProven = true;
  }
  return checked > 0 ? { matched, checked, forkProven } : null;
}

export type VerdictInput = {
  reachable: boolean;
  chainId: number | null;
  blockHeight: number | null;
  expectedChainId: number;
  referenceHeight: number | null;
  evidence: HashEvidence | null;
  /**
   * The endpoint the site has already documented as the fork. It keeps the
   * fork verdict when a probe round produced no hash evidence at all, rather
   * than being presented as merely "behind" for the length of one upstream
   * hiccup. The moment evidence exists, the evidence decides — for it too.
   */
  flagged: boolean;
};

export function decideVerdict(input: VerdictInput): NodeVerdict {
  const { reachable, chainId, blockHeight, expectedChainId, referenceHeight } =
    input;
  if (!reachable) return "offline";
  if (chainId === null && blockHeight === null) return "degraded";
  if (chainId !== null && chainId !== expectedChainId) return "wrong-chain";
  if (blockHeight === null) return "degraded";

  if (input.evidence?.forkProven) return "diverged";
  if (input.flagged && input.evidence === null) return "diverged";

  if (referenceHeight !== null && referenceHeight - blockHeight > BEHIND_BLOCKS) {
    return "behind";
  }
  return "canonical";
}
