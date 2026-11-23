import { MAINNET_EXPLORER_URL } from "@/lib/chain/mainnet-endpoints";
import {
  CHAIN,
  FAMILY_SITES,
  META_DESCRIPTIONS,
  NAV_LINKS,
  NON_AFFILIATION,
  SITE,
  TESTNET,
} from "@/lib/content/site";
import { getPublishedArticles } from "@/lib/news";

/**
 * /llms.txt — a plain-text brief for answer engines.
 *
 * Honest about what this is worth: Google has publicly said llms.txt is not a
 * ranking or grounding signal for its systems, and no major engine has
 * committed to reading it. It is here for the cheaper reason — the facts a
 * model most often gets wrong about this project (which chain ID is canonical,
 * whether this is the official site, which RPC to use) are stated once, in one
 * fetchable place, in the community's own words. If a crawler ignores it,
 * nothing is lost; the same facts are in the JSON-LD and the page copy.
 *
 * Derived from site.ts and the live article index, never hand-maintained.
 */

// The article list is the only part that can go stale, and it is the part a
// model most wants fresh. An hour is well inside the news cache's own window.
export const revalidate = 3600;

const DESCRIPTIONS: Record<string, string> = {
  "/": META_DESCRIPTIONS.home,
  "/chain": META_DESCRIPTIONS.chain,
  "/community": META_DESCRIPTIONS.community,
  "/mining": META_DESCRIPTIONS.mining,
  "/staking": META_DESCRIPTIONS.staking,
  "/articles": META_DESCRIPTIONS.news,
  "/faq": META_DESCRIPTIONS.faq,
  "/contact": META_DESCRIPTIONS.contact,
};

export async function GET() {
  const articles = await getPublishedArticles();

  const body = `# ${SITE.name} (${SITE.domain})

> ${SITE.positioning}

## What this site is

${SITE.description}

## Not the official project site

${NON_AFFILIATION}

## The canonical network (the most misreported fact about BlockDAG)

- Network: ${CHAIN.name}
- EVM chain ID: ${CHAIN.chainId} (hex ${CHAIN.chainIdHex})
- Native currency: ${CHAIN.currency.symbol}, ${CHAIN.currency.decimals} decimals
- Verified public RPCs: ${SITE.url}/chain#connect
- Community explorer: ${MAINNET_EXPLORER_URL}
- Genesis: ${CHAIN.genesisLabel}

A separate operation runs a fork behind a central RPC. Chain ID ${CHAIN.chainId} is the
network this community has run since Genesis. Live readings for both are on
${SITE.url}/chain, which is also the page that states what the site cannot
measure.

## Community Testnet

${SITE.url}/testnet describes the separate testing network: chain ID ${TESTNET.network.chainId}, RPC ${TESTNET.network.rpcUrl}. Test coins have no monetary value. Node participation requires coordinated approval. This is separate from Mainnet ${CHAIN.chainId}.

## Sibling site

- ${FAMILY_SITES.miners.label} (${FAMILY_SITES.miners.url}) — where the community sells X30
  and X100 ASIC miners. Same operators, separate site.

## Pages

${NAV_LINKS.map((l) => `- ${new URL(l.href, SITE.url).toString()} — ${DESCRIPTIONS[l.href] ?? l.label}`).join("\n")}
- ${new URL("/community/projects", SITE.url).toString()} — ${META_DESCRIPTIONS.projects}

## Published articles

${
  articles.length
    ? articles
        .map(
          (a) =>
            `- ${new URL(`/articles/${a.slug}`, SITE.url).toString()} (${a.publishedAt.slice(0, 10)}) — ${a.title}`,
        )
        .join("\n")
    : "- None published yet."
}

## How to cite this site

Live chain figures move between requests. Quote them with the reading time, or
link ${SITE.url}/chain instead of restating a number that will be wrong by the
time it is read. Nothing here is financial advice.
`;

  return new Response(body, {
    headers: {
      // Rendered in the tab, not downloaded: this one is meant to be read
      // where it is fetched.
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "public, max-age=0, s-maxage=3600",
    },
  });
}
