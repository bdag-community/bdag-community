import assert from "node:assert/strict";
import test from "node:test";
import * as releases from "../src/lib/releases.ts";
const { getLatestRelease, getReleaseHistory } = releases;

const repo = "https://github.com/bdag-community/bdag-stack-releases";
const tag = "stack-v0.1.0";
const runtime = "pool-stack-docker-stack-v0.1.0-linux-amd64.zip";
const source = "bdag-community-stack-v0.1.0-source.zip";

function asset(name, overrides = {}) {
  return { name, state: "uploaded", browser_download_url: `${repo}/releases/download/${tag}/${name}`, ...overrides };
}

const published = {
  tag_name: tag,
  name: "BDAG Community Stack v0.1.0",
  draft: false,
  prerelease: false,
  published_at: "2026-11-20T11:39:35Z",
  body: "## Qualification\n\nThe arm64 checks ran under emulation.\n\n## Credits\n\nThank you.",
  assets: [
    asset(runtime), asset(`${runtime}.sha256`),
    asset(source), asset(`${source}.sha256`),
    asset("pool-stack-docker-stack-v0.1.0-linux-arm64.zip", {
      browser_download_url: "https://example.com/arm64.zip",
    }),
  ],
};

test("shows only downloads with a matching checksum and the publisher's qualification", async (t) => {
  const fetch = t.mock.method(globalThis, "fetch", async () => Response.json(published));
  const release = await getLatestRelease();

  assert.equal(fetch.mock.calls[0].arguments[0], "https://api.github.com/repos/bdag-community/bdag-stack-releases/releases/latest");
  assert.equal(fetch.mock.calls[0].arguments[1].next.revalidate, 600);
  assert.equal(release.version, "v0.1.0");
  assert.equal(release.qualification, "The arm64 checks ran under emulation.");
  assert.deepEqual(release.downloads.map(({ kind }) => kind), ["amd64", "source"]);
  assert.equal(release.downloads[0].checksumUrl, `${repo}/releases/download/${tag}/${runtime}.sha256`);
});

test("release history excludes drafts, prereleases, and ambiguous release tags", async (t) => {
  t.mock.method(globalThis, "fetch", async () => Response.json([
    { ...published, draft: true },
    { ...published, prerelease: true },
    { ...published, tag_name: "../latest" },
    published,
  ]));
  assert.deepEqual((await getReleaseHistory()).map(({ tag }) => tag), [tag]);
});

test("latest release is unavailable when GitHub errors or marks it as a prerelease", async (t) => {
  const fetch = t.mock.method(globalThis, "fetch", async () => new Response(null, { status: 503 }));
  assert.equal(await getLatestRelease(), null);
  assert.equal(await getReleaseHistory(), null);
  fetch.mock.mockImplementation(async () => Response.json({ ...published, prerelease: true }));
  assert.equal(await getLatestRelease(), null);
});
