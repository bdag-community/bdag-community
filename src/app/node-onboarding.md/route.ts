import { buildOnboarding } from "@/lib/onboarding";
import { getLatestRelease, RELEASE_REVALIDATE_SECONDS } from "@/lib/releases";

/**
 * /node-onboarding.md — the node onboarding brief.
 *
 * A thin route over buildOnboarding: the document itself is shared with the
 * other scope so the two cannot drift on the safety rules, the release
 * authority or the canonical network. See src/lib/onboarding.ts.
 */

/**
 * A LITERAL, not the imported constant. Next requires route segment config to
 * be statically analysable, and `export const revalidate = SOME_IMPORT` fails
 * the build at "Collecting page data" with "Invalid segment configuration
 * export", after a successful compile, which is why it is easy to miss.
 * Kept equal to RELEASE_REVALIDATE_SECONDS by test.
 */
export const revalidate = 600;

export async function GET() {
  const release = await getLatestRelease();
  return new Response(buildOnboarding(release, "node"), {
    headers: {
      "content-type": "text/markdown; charset=utf-8",
      // Meant to be downloaded and handed to an agent on the operator's own
      // machine, so it saves rather than rendering in a tab.
      "content-disposition": 'attachment; filename="node-onboarding.md"',
      "cache-control": `public, max-age=0, s-maxage=${RELEASE_REVALIDATE_SECONDS}`,
    },
  });
}
