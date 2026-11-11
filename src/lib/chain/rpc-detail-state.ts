/** Keep each last verified interval when one independent historical read fails. */
export function retainVerifiedBaselines(
  previous: readonly (number | null)[],
  observed: readonly (number | null)[],
): (number | null)[] {
  return observed.map((value, index) => value ?? previous[index] ?? null);
}

export type VerifiedBlockPage = { items: unknown[] };

function contiguousDescendingHeights(page: VerifiedBlockPage): number[] | null {
  const heights = page.items.map((item) => {
    const height = (item as { height?: unknown } | null)?.height;
    return Number.isSafeInteger(height) && (height as number) >= 0
      ? (height as number)
      : null;
  });
  if (heights.some((height) => height === null)) return null;
  const valid = heights as number[];
  for (let index = 1; index < valid.length; index += 1) {
    if (valid[index] !== valid[index - 1] - 1) return null;
  }
  return valid;
}

/**
 * The newest verified page is independently useful. The optional older page
 * only extends the rate window and may never erase the ticker, producer or
 * capacity data when an upstream rejects or times out on that older read.
 */
export function mergeVerifiedBlockPages(
  newest: VerifiedBlockPage | null,
  older: VerifiedBlockPage | null,
): VerifiedBlockPage | null {
  if (!newest) return null;
  const newestHeights = contiguousDescendingHeights(newest);
  if (!newestHeights || newestHeights.length === 0) return null;
  if (!older) return newest;

  const olderHeights = contiguousDescendingHeights(older);
  if (
    !olderHeights ||
    olderHeights.length === 0 ||
    olderHeights[0] !== newestHeights[newestHeights.length - 1] - 1
  ) {
    return newest;
  }
  return { items: [...newest.items, ...older.items] };
}
