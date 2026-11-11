/** The smallest audited batch ceiling among the automatic RPC sources. */
export const RPC_UPSTREAM_BATCH_LIMIT = 50;

export type RpcBatchChunk<T> = {
  offset: number;
  calls: readonly T[];
};

/**
 * Keep one logical request while respecting every verified provider's
 * upstream batch ceiling. Response IDs are local to each chunk and are
 * rebased by mergeRpcBatchChunk before callers see them.
 */
export function partitionRpcBatch<T>(
  calls: readonly T[],
): RpcBatchChunk<T>[] {
  const chunks: RpcBatchChunk<T>[] = [];
  for (let offset = 0; offset < calls.length; offset += RPC_UPSTREAM_BATCH_LIMIT) {
    chunks.push({
      offset,
      calls: calls.slice(offset, offset + RPC_UPSTREAM_BATCH_LIMIT),
    });
  }
  return chunks;
}

/** Merge one provider response without trusting out-of-range local IDs. */
export function mergeRpcBatchChunk<T>(
  target: Map<number, T>,
  chunk: RpcBatchChunk<unknown>,
  results: ReadonlyMap<number, T>,
): void {
  for (const [localId, result] of results) {
    if (
      !Number.isInteger(localId) ||
      localId < 0 ||
      localId >= chunk.calls.length
    ) {
      continue;
    }
    target.set(chunk.offset + localId, result);
  }
}

/**
 * Execute one logical request as sequential provider-safe chunks. A rejected
 * chunk rejects the whole logical request, so callers can never mistake a
 * partial source response for complete evidence.
 */
export async function executeRpcBatchChunks<TCall, TResult>(
  calls: readonly TCall[],
  requestChunk: (
    calls: readonly TCall[],
  ) => Promise<ReadonlyMap<number, TResult>>,
): Promise<Map<number, TResult>> {
  const merged = new Map<number, TResult>();
  for (const chunk of partitionRpcBatch(calls)) {
    const results = await requestChunk(chunk.calls);
    mergeRpcBatchChunk(merged, chunk, results);
  }
  return merged;
}
