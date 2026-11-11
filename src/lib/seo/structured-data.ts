import {
  CHAIN,
  FAMILY_SITES,
  FAQ_PAGE,
  NON_AFFILIATION,
  SITE,
} from "@/lib/content/site";
import type { NewsArticle } from "@/lib/news";

/**
 * JSON-LD builders — the machine-readable half of every public page.
 *
 * The site already tells a reader, in careful prose, that chain ID 1404 is the
 * canonical BlockDAG and that this is not the official project site. A crawler
 * or an answer engine has to infer both from that prose. These nodes state
 * them as data instead, which is the whole point: this site's hardest problem
 * is being confused with a fork and with the original sales, and that is
 * exactly the kind of confusion structured data exists to settle.
 *
 * Every value comes from site.ts or from an already-published article. Nothing
 * is authored here — a second copy of a fact drifts from the first.
 */

const ORG_ID = `${SITE.url}/#organization`;
const SITE_ID = `${SITE.url}/#website`;

const abs = (path: string) => new URL(path, SITE.url).toString();

/**
 * The publisher entity, referenced by @id from every other node.
 *
 * `disambiguatingDescription` carries the non-affiliation paragraph verbatim,
 * because "is this the official BlockDAG site?" is the first question every
 * reader and every answer engine asks, and the honest answer is already
 * written. `sameAs` claims the sibling store as the same operator — one
 * organisation, two domains, stated rather than left to be guessed.
 */
export function organizationSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": ORG_ID,
    name: SITE.name,
    url: SITE.url,
    description: SITE.description,
    disambiguatingDescription: NON_AFFILIATION,
    logo: abs("/logo.svg"),
    sameAs: [FAMILY_SITES.miners.url],
  };
}

export function websiteSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": SITE_ID,
    url: SITE.url,
    name: SITE.name,
    description: SITE.description,
    inLanguage: "en-GB",
    publisher: { "@id": ORG_ID },
  };
}

/**
 * The canonical network, as data.
 *
 * There is no schema.org type for a blockchain, so this is a Thing with an
 * identifier — deliberately modest. It exists so that "which chain ID is
 * BlockDAG" has one machine-readable answer on this origin, since a fork
 * behind a central RPC is the reason the /chain page exists at all.
 */
export function chainSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "Thing",
    "@id": `${SITE.url}/chain#network`,
    name: CHAIN.name,
    description: `The canonical BlockDAG network, chain ID ${CHAIN.chainId}, run by ${SITE.name} since Genesis on ${CHAIN.genesisLabel}.`,
    identifier: [
      {
        "@type": "PropertyValue",
        name: "EVM chain ID",
        value: String(CHAIN.chainId),
      },
      {
        "@type": "PropertyValue",
        name: "Native currency",
        value: CHAIN.currency.symbol,
      },
      {
        "@type": "PropertyValue",
        name: "Canonical JSON-RPC endpoint",
        value: CHAIN.rpcUrl,
      },
      {
        "@type": "PropertyValue",
        name: "Canonical explorer",
        value: CHAIN.explorerUrl,
      },
    ],
    url: abs("/chain"),
    subjectOf: { "@id": ORG_ID },
  };
}

/** FAQPage built from the same items the page renders. */
export function faqPageSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "@id": abs("/faq#faq"),
    inLanguage: "en-GB",
    publisher: { "@id": ORG_ID },
    mainEntity: FAQ_PAGE.items.map((item) => {
      // Fold any extended answer into the machine-readable text so an answer
      // engine quotes the full response, not just the short lead.
      const long = (item as { long?: readonly string[] }).long ?? [];
      return {
        "@type": "Question",
        name: item.q,
        acceptedAnswer: { "@type": "Answer", text: [item.a, ...long].join(" ") },
      };
    }),
  };
}

/**
 * NewsArticle for a single published article.
 *
 * `dateModified` is deliberately `publishedAt`, not the request time: the
 * articles carry one published timestamp and no edit history, and inventing a
 * modification date to look fresh is the kind of claim this site does not
 * make. `author` follows the page's own provenance rule — a community
 * submission with a name is credited to that person, everything else to the
 * organisation, exactly as the byline renders it.
 */
export function newsArticleSchema(article: NewsArticle) {
  return {
    "@context": "https://schema.org",
    "@type": "NewsArticle",
    "@id": abs(`/articles/${article.slug}#article`),
    headline: article.title,
    description: article.description,
    datePublished: article.publishedAt,
    dateModified: article.publishedAt,
    inLanguage: "en-GB",
    isAccessibleForFree: true,
    mainEntityOfPage: { "@type": "WebPage", "@id": abs(`/articles/${article.slug}`) },
    author:
      article.submittedByCommunity && article.authorName
        ? { "@type": "Person", name: article.authorName }
        : { "@id": ORG_ID },
    publisher: { "@id": ORG_ID },
    ...(article.imageUrl
      ? {
          image: new URL(article.imageUrl, SITE.url).toString(),
        }
      : {}),
  };
}

/**
 * BreadcrumbList. Home is always position 1; a news article passes its own
 * trail so /articles sits between home and the article.
 */
export function breadcrumbSchema(
  trail: readonly { name: string; path: string }[],
) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: SITE.url },
      ...trail.map((crumb, i) => ({
        "@type": "ListItem",
        position: i + 2,
        name: crumb.name,
        item: abs(crumb.path),
      })),
    ],
  };
}
