/** Keep code-managed articles visible; a published database row with the same
 * slug replaces its seed version. Apply the display limit after merging so a
 * limited Home query cannot show a stale seed beside a newer database copy. */
export function mergePublishedArticles<
  T extends { slug: string; publishedAt: string },
>(live: readonly T[] | null, seed: readonly T[], limit?: number): T[] {
  const bySlug = new Map<string, T>();
  for (const article of seed) bySlug.set(article.slug, article);
  for (const article of live ?? []) bySlug.set(article.slug, article);

  const merged = [...bySlug.values()].sort((a, b) =>
    b.publishedAt.localeCompare(a.publishedAt),
  );
  return limit === undefined ? merged : merged.slice(0, limit);
}
