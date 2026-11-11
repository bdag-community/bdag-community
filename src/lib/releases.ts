/**
 * The node stack's latest release, resolved from the release page itself.
 *
 * WHY THIS EXISTS. The community page used to name one release in copy. That
 * release was superseded two days after it was published and the page had no
 * way of knowing — exactly the failure this site's whole content rule exists
 * to prevent ("no measured figure written into copy"). A version number is a
 * measured figure like any other.
 *
 * WHAT THE RELEASE PAGE ACTUALLY OFFERS. There is no index of releases: the
 * directory listing 404s, and so do releases.json, index.json and sitemap.xml.
 * The repository behind it is not public either, so its tags cannot be read.
 * What the site does publish is:
 *   - a root page whose <link rel="canonical"> always points at the CURRENT
 *     release directory, and
 *   - a release-manifest.json inside each release directory.
 * So "the latest" is resolvable in two hops, and nothing older is enumerable.
 * That is the whole ceiling, and this module does not pretend otherwise.
 *
 * The manifest is served with `access-control-allow-origin: *` and
 * `cache-control: max-age=600`, so this could run in the browser — it is done
 * on the server anyway, for the same reason every other reading on this site
 * is: one fetch shared by every visitor rather than one per reader.
 */

/** The only host this module will talk to. */
const BASE = "https://blockdagengineering.github.io/bdag-ipfs-release-page";

/** Matches the release page's own cache-control, so we never poll it harder
 *  than it expects to be read. */
export const RELEASE_REVALIDATE_SECONDS = 600;

export type NodeRelease = {
  /** e.g. "2.0.0-community-rescue-rc.62" */
  version: string;
  /** Monotonic release counter from the manifest. */
  sequence: number | null;
  /** ISO timestamp, or null when the manifest omits it. */
  publishedAt: string | null;
  /** Canonical URL for THIS release. */
  url: string;
};

/** The root always redirects to the current release; this is that entry point,
 *  and it is what the page links so a reader can never land on a stale one. */
export const RELEASE_INDEX_URL = `${BASE}/`;

/**
 * Pull the current release directory out of the root page.
 *
 * The root is a meta-refresh shim with a matching <link rel="canonical">. Only
 * a RELATIVE path of exactly the shape the page publishes is accepted — this
 * is parsed from a remote document, so an absolute URL or anything with a
 * traversal segment in it is discarded rather than followed.
 */
function releaseDirFrom(html: string): string | null {
  const canonical = /<link[^>]+rel="canonical"[^>]+href="([^"]+)"/i.exec(html);
  const refresh = /<meta[^>]+http-equiv="refresh"[^>]+url=([^"'>\s]+)/i.exec(html);
  const raw = canonical?.[1] ?? refresh?.[1];
  if (!raw) return null;
  const match = /^releases\/([A-Za-z0-9._-]+)\/index\.html$/.exec(raw.trim());
  return match ? match[1] : null;
}

/**
 * The current release, or null if the page cannot be read.
 *
 * Null is a first-class answer, not an error: the section it feeds renders its
 * link and its instructions regardless, and simply says nothing about a
 * version it could not confirm.
 */
export async function getLatestRelease(): Promise<NodeRelease | null> {
  try {
    const rootRes = await fetch(RELEASE_INDEX_URL, {
      next: { revalidate: RELEASE_REVALIDATE_SECONDS },
    });
    if (!rootRes.ok) return null;

    const dir = releaseDirFrom(await rootRes.text());
    if (!dir) return null;

    const url = `${BASE}/releases/${dir}/`;
    const manifestRes = await fetch(`${url}release-manifest.json`, {
      next: { revalidate: RELEASE_REVALIDATE_SECONDS },
    });
    if (!manifestRes.ok) return null;

    const manifest: unknown = await manifestRes.json();
    const release = (manifest as { release?: Record<string, unknown> } | null)
      ?.release;
    if (!release) return null;

    // Only a published release is ever surfaced. A draft or withdrawn build
    // appearing on the community page as "the latest" would be worse than
    // showing no version at all.
    if (release.status !== undefined && release.status !== "published") {
      return null;
    }

    const version =
      typeof release.version === "string" ? release.version : dir;
    return {
      version,
      sequence:
        typeof release.sequence === "number" && Number.isFinite(release.sequence)
          ? release.sequence
          : null,
      publishedAt:
        typeof release.published_at === "string" ? release.published_at : null,
      url,
    };
  } catch {
    return null;
  }
}
