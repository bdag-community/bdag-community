const ORGANISATION = "bdag-community";
const REPOSITORY = "bdag-stack-releases";
const GITHUB_RELEASES = `https://api.github.com/repos/${ORGANISATION}/${REPOSITORY}/releases`;

export const COMMUNITY_GITHUB_URL = `https://github.com/${ORGANISATION}`;
export const COMMUNITY_CONTRIBUTING_URL = `${COMMUNITY_GITHUB_URL}/bdag-community/blob/develop/CONTRIBUTING.md`;
export const RELEASE_INDEX_URL = `${COMMUNITY_GITHUB_URL}/${REPOSITORY}/releases`;
export const STACK_SOURCE_URL = `${COMMUNITY_GITHUB_URL}/bdag-stack-source`;
export const RELEASE_REVALIDATE_SECONDS = 600;

export type ReleaseDownload = {
  kind: "amd64" | "arm64" | "source";
  url: string;
  checksumUrl: string;
};

export type NodeRelease = {
  tag: string;
  title: string;
  version: string;
  publishedAt: string;
  url: string;
  downloads: ReleaseDownload[];
  qualification: string;
};

const PACKAGE_TYPES = [
  { kind: "amd64", name: /^pool-stack-docker-[-\w.]+-linux-amd64\.zip$/ },
  { kind: "arm64", name: /^pool-stack-docker-[-\w.]+-linux-arm64\.zip$/ },
  { kind: "source", name: /^bdag-community-stack-[-\w.]+-source\.zip$/ },
] as const;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function readDownloads(release: Record<string, unknown>, tag: string): ReleaseDownload[] {
  if (!Array.isArray(release.assets)) return [];

  const downloadBase = `${RELEASE_INDEX_URL}/download/${tag}/`;
  const assets = new Map<string, string>();
  for (const entry of release.assets) {
    const asset = asRecord(entry);
    if (!asset || asset.state !== "uploaded" || typeof asset.name !== "string") continue;
    if (!/^[\w.-]+$/.test(asset.name) || asset.name === "." || asset.name === "..") continue;
    const url = `${downloadBase}${asset.name}`;
    if (asset.browser_download_url === url) assets.set(asset.name, url);
  }

  const downloads: ReleaseDownload[] = [];
  for (const { kind, name } of PACKAGE_TYPES) {
    const matches = [...assets.keys()].filter((file) => name.test(file) && assets.has(`${file}.sha256`));
    if (matches.length !== 1) continue;
    const file = matches[0];
    downloads.push({ kind, url: `${downloadBase}${file}`, checksumUrl: `${downloadBase}${file}.sha256` });
  }
  return downloads;
}

function readRelease(value: unknown): NodeRelease | null {
  const release = asRecord(value);
  if (!release || release.draft !== false || release.prerelease !== false) return null;

  const tag = release.tag_name;
  if (typeof tag !== "string" || !/^stack-v\d+\.\d+\.\d+(?:\+[\w.-]+)?$/.test(tag)) return null;

  const publishedAt = release.published_at;
  if (typeof publishedAt !== "string" || !Number.isFinite(Date.parse(publishedAt))) return null;

  // Show the publisher's qualification beside the downloads. Render it as text.
  const qualification = typeof release.body === "string"
    ? release.body.split(/^#{1,6}[ \t]+Qualification[ \t]*\r?$/mi)[1]?.split(/^#{1,6}[ \t]/m)[0]?.trim() ?? ""
    : "";

  const version = tag.slice("stack-".length);
  return {
    tag,
    title: typeof release.name === "string" && release.name.trim() ? release.name : version,
    version,
    publishedAt,
    url: `${RELEASE_INDEX_URL}/tag/${tag}`,
    downloads: readDownloads(release, tag),
    qualification,
  };
}

async function readGithub(suffix: string): Promise<unknown> {
  try {
    const response = await fetch(`${GITHUB_RELEASES}${suffix}`, {
      headers: { Accept: "application/vnd.github+json" },
      next: { revalidate: RELEASE_REVALIDATE_SECONDS },
      signal: AbortSignal.timeout(4_000),
      redirect: "error",
    });
    return response.ok ? await response.json() : null;
  } catch {
    return null;
  }
}

export async function getLatestRelease(): Promise<NodeRelease | null> {
  return readRelease(await readGithub("/latest"));
}

export async function getReleaseHistory(): Promise<NodeRelease[] | null> {
  const response = await readGithub("?per_page=20");
  if (!Array.isArray(response)) return null;
  return response.flatMap((entry) => {
    const release = readRelease(entry);
    return release ? [release] : [];
  }).sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt));
}
