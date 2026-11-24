import { COMMUNITY_GITHUB_URL, COMMUNITY_CONTRIBUTING_URL, RELEASE_INDEX_URL, STACK_SOURCE_URL } from "../releases.ts";

/**
 * Single source of truth for ALL site copy, product data, chain constants,
 * and external URLs (data only — no JSX). Pages import from here and never
 * re-author copy; source-assertion tests enforce the invariants.
 *
 * Editorial standard (PRODUCT.md principles): evidence before promotion —
 * every fact here is verified on-chain / from the canonical endpoints, or is
 * explicitly marked approximate/mock for the owner to correct.
 */

export const SITE = {
  name: "BDAG Community",
  domain: "bdag.community",
  url: process.env.NEXT_PUBLIC_SITE_URL || "https://bdag.community",
  positioning:
    "We are the community that has been running BlockDAG Network from Genesis.",
  description:
    "The community that has been running BlockDAG Network from Genesis: transparent, decentralised, and open to everyone who wants to make this high-performing chain a success.",
} as const;

/**
 * Search-result descriptions, one per public route.
 *
 * These are NOT the page intros. Every route used to reuse its own `intro`
 * verbatim — 171 to 250 characters of prose written to be read after the
 * headline, on a page the reader has already chosen. A result snippet is read
 * before the reader has chosen anything, and Google gives it roughly 155
 * characters before it truncates mid-word. So each of these is written for
 * that job: what the page is, what is on it, and the one thing that
 * distinguishes it from the rest. All of them are under 160 characters.
 *
 * The chain rule applies here too: no measured figure appears in any of them.
 * Chain ID 1404 is a protocol constant, not a measurement, so it may.
 */
export const META_DESCRIPTIONS = {
  home: "The community that has run BlockDAG Network since Genesis. Live chain readings, mining, staking, and the canonical endpoints for chain ID 1404.",
  chain:
    "BlockDAG read live: block interval, how full the blocks are, who produces them, and every public RPC node checked from here, plus what we cannot tell you.",
  community:
    "Node operators, miners, stakers and builders keeping BlockDAG Network running. What we stand for, where we talk, and the ways you can take part.",
  mining:
    "Mine BlockDAG with an X30 or X100 ASIC. How proof of work secures the chain, where devices come from, and what to verify before you start.",
  staking:
    "Follow the launch of the new Mainnet staking site and contract, including plans for Legacy withdrawals and Staking V2.",
  faq: "Straight answers on the canonical chain, endpoints, mining safety, staking status, rewards, and where this site's numbers come from.",
  news: "Network updates, incidents, decisions and milestones from the people operating BlockDAG Network, written in the open by the community that runs it.",
  projects:
    "Explorers, dashboards, pools, and tools built by the BlockDAG community. Every project is vetted before listing, and anyone can submit their own.",
  contact:
    "Send the BlockDAG community a question about the network, mining, staking, development, or the checks exchanges and integrators need to make.",
} as const;

export const NAV_LINKS = [
  { label: "Home", href: "/" },
  // The technical spine sits ahead of the participation pages: what the chain
  // is comes before what you can do on it. Labelled "Chain", not "The Chain":
  // every other item in this bar is one word, and the article bought nothing
  // but width in the row that has the least to spare.
  { label: "Chain", href: "/chain" },
  { label: "Community", href: "/community" },
  { label: "Mining", href: "/mining" },
  { label: "Staking", href: "/staking" },
  { label: "Articles", href: "/articles" },
  { label: "FAQ", href: "/faq" },
  { label: "Contact", href: "/contact" },
] as const;

/** Persistent header action, distinct from the Community navigation link.
 *  Two words: it sits beside eight nav items in a sticky bar, and the long
 *  form wrapped or squeezed the row at tablet widths. The section it lands on
 *  keeps the full "Ways to take part" heading. */
export const HEADER_CTA = {
  label: "Take part",
  href: "/community#participate",
} as const;

/* ---------------------------------------------------------------------------
 * Chain constants — verified against the live network 2026-08-05.
 * ------------------------------------------------------------------------- */

export const CHAIN = {
  name: "BlockDAG Mainnet",
  chainId: 1404,
  chainIdHex: "0x57c",
  currency: { symbol: "BDAG", decimals: 18 },
  /** Canonical public JSON-RPC endpoint. */
  rpcUrl: "https://rpc.blockdag.engineering",
  /** Canonical explorer (Blockscout). */
  explorerUrl: "https://explorer.blockdag.engineering",
  /** Genesis block 0 timestamp, read from the chain itself (eth_getBlockByNumber 0x0). */
  genesisIso: "2026-02-10T22:03:00Z",
  genesisLabel: "10 Feb 2026",
  /**
   * Fallback block interval, in milliseconds, for the client-side height
   * ticker before a measured value arrives. It is a cadence hint and nothing
   * more — the interval this site DISPLAYS is always measured over a stated
   * window and comes back with that window attached.
   *
   * This replaces the old `blockTimeSeconds: 1`, which nothing consumed and
   * whose comment cited the explorer's average_block_time as its authority.
   * That field disagrees with every direct baseline we measure and moves
   * substantially between checks, so nothing on this site derives from it.
   */
  blockIntervalFallbackMs: 850,
  /**
   * The gas limit carried by every block header, read live and identical
   * across every block sampled. It is the only real denominator this chain
   * publishes. Held here for reference only: the capacity gauge reads its own
   * limit out of the sampled blocks and must never take its maximum from a
   * constant, or the day the chain raises the limit the dial starts lying.
   */
  blockGasLimit: 45_000_000,
  /** Native staking contract (source: community rebuild, app/lib/web3.ts). */
  stakingContract: "0x08Bd519F611556dC148e7BfFE8d6f078F23a8EF7",
  /** Registered staking pools. */
  stakingPools: [
    "0x82738c690ef80b2463346a17d988e2324058e9b8",
    "0x4be5b1a9100cf96dea7cca4109051ba015d56580",
    "0xd5f8df0a60bc1ff4636250b2a2dff319bf79b1f5",
    "0x12d8377d571cebf2da043fbcad94f4bd85157a78",
  ],
} as const;

/**
 * The two values a miner, wallet or integrator has to get right, labelled the
 * same way in all four places they render (home's fork warning, Community's
 * wallet-config card, Mining's endpoint callout, and The Chain's connect
 * card). Three of the four had them typed inline, so they had already drifted
 * apart from The Chain's pair — which keeps its own longer `rpcLabel` /
 * `chainIdLabel` on purpose, because that card is the reference and has the
 * width for "JSON-RPC endpoint".
 */
export const ENDPOINT_LABELS = {
  rpc: "Verified public RPC",
  chainId: "Chain ID",
} as const;

/* ---------------------------------------------------------------------------
 * Sibling sites + market venues
 * ------------------------------------------------------------------------- */

export const FAMILY_SITES = {
  miners: { label: "bdag.co", url: "https://bdag.co" },
  dev: { label: "bdag.dev", url: "https://bdag.dev", launching: true },
} as const;

/** Exchange venues listing BDAG (exact trade URLs; a link is not an endorsement). */
export const MARKETS = [
  { name: "P2B", url: "https://p2pb2b.com/trade/BDAG_USDT" },
  { name: "XT.COM", url: "https://www.xt.com/en/trade/bdag_usdt" },
  { name: "BitMart", url: "https://www.bitmart.com/trade/BDAG_USDT" },
  {
    name: "AscendEX",
    url: "https://ascendex.com/en/cashtrade-spottrading/usdt/bdag",
  },
] as const;

/* ---------------------------------------------------------------------------
 * Community channels. A live channel carries a URL and handle. Coming-soon
 * channels use `mock: true` until the community supplies their links.
 * ------------------------------------------------------------------------- */

export const CHANNELS = [
  {
    name: "Telegram",
    /** The public community group's handle changed to @BDAG_COMMUNITY_GROUP
     *  on 2026-09-28. The original invite below now serves the mining channel. */
    handle: "Join the group",
    url: "https://t.me/BDAG_COMMUNITY_GROUP",
    blurb: "The day-to-day conversation: miners, stakers, and node operators.",
    mock: false,
  },
  {
    name: "Telegram (Mining)",
    /** A private-group invite has no public @handle; the link says what it
     *  does instead. This was the original community invite (2026-08-13),
     *  repurposed as the dedicated mining channel. */
    handle: "Join the mining group",
    url: "https://t.me/+XTBIEkYZ1is5Zjg5",
    blurb: "Mining talk: X30 and X100 setup, pools, and payouts.",
    mock: false,
  },
  {
    name: "YouTube",
    handle: "@BDAGCommunity",
    url: "https://www.youtube.com/@BDAGCommunity",
    blurb: "Videos and updates from BDAG Community.",
    mock: false,
  },
  {
    name: "X (Twitter)",
    handle: "@1Bdag_Community",
    url: "https://x.com/1Bdag_Community",
    blurb: "Community announcements and network updates.",
    mock: false,
  },
  {
    name: "CoinMarketCap",
    handle: "@BDAGCommunity",
    url: "https://coinmarketcap.com/community/profile/BDAGCommunity/",
    blurb: "Follow BDAG Community posts on CoinMarketCap.",
    mock: false,
  },
  /* Temporarily hidden on Contact and Community pending Reddit verification
     (2026-10-07). Keep the supplied subreddit ready to restore.
  {
    name: "Reddit",
    handle: "r/1BDAG_COMMUNITY_",
    url: "https://www.reddit.com/r/1BDAG_COMMUNITY_/",
    blurb: "Longer threads and questions that outlive the chat scroll.",
    mock: false,
  },
  */
  {
    name: "LinkedIn",
    /** Official BlockDAG Network company page supplied by the owner
     *  (2026-09-17). */
    handle: "Follow BlockDAG Network",
    url: "https://www.linkedin.com/company/blockdag-network/",
    blurb: "Company updates, network milestones, and public announcements.",
    mock: false,
  },
  /* Coming-soon channels carry NO handle and NO url, on purpose: the old
     placeholder strings (an unowned discord.gg slug, an unregistered X
     handle) were fake data one rendering bug away from publication. A
     channel goes live by gaining handle + url and flipping mock: false,
     with a real invite in hand. */
  {
    name: "Discord",
    blurb: "Structured channels for mining, staking, development, and support.",
    mock: true,
  },
  {
    name: "GitHub",
    handle: "bdag-community",
    url: COMMUNITY_GITHUB_URL,
    blurb: "Browse the source, download releases and contribute changes.",
    mock: false,
  },
] as const;

export const OPEN_SOURCE = {
  href: "/community#open-source",
  title: "Build in the open",
  body: "Browse the component repositories on GitHub. To suggest a change, fork the relevant repository and open a pull request against its develop branch.",
  github: { label: "Browse GitHub repositories", href: COMMUNITY_GITHUB_URL },
  contribute: { label: "Contribute to the website", href: COMMUNITY_CONTRIBUTING_URL },
} as const;

export const RELEASES_PAGE = {
  href: "/releases",
  title: "Stack releases",
  description: "Download the BlockDAG Community Stack, verify SHA-256 checksums, and find the corresponding source and release notes.",
  intro: "Download the software for running a BlockDAG node or mining pool. Choose the archive for your Linux system and check it against its SHA-256 file before you install.",
  latest: "Latest published release",
  history: "Release history",
  notes: "Release notes on GitHub",
  qualification: "What was tested",
  checksum: "SHA-256",
  downloads: {
    amd64: { title: "Linux AMD64", detail: "For most 64-bit Intel and AMD systems.", label: "Download AMD64" },
    arm64: { title: "Linux ARM64", detail: "For 64-bit ARM systems.", label: "Download ARM64" },
    source: { title: "Corresponding source", detail: "Includes build inputs and third-party licence notices.", label: "Download source" },
  },
  all: { label: "All releases on GitHub", href: RELEASE_INDEX_URL },
  source: { label: "Browse stack source", href: STACK_SOURCE_URL },
  unavailable: "The latest release details are temporarily unavailable. Open GitHub for the published downloads and checksums.",
  assetsUnavailable: "Open the GitHub release notes to check which archives and checksum files are available.",
  historyUnavailable: "Release history is temporarily unavailable here.",
  firstRelease: "Earlier stable releases will appear here as they are published.",
  testnet: { label: "See the Testnet setup", href: "/testnet" },
} as const;

/** Official community inbox, verified by the owner on 2026-09-17. */
export const CONTACT_EMAIL = "hello@bdag.community";
export const CONTACT_EMAIL_MOCK: boolean = false;

/* ---------------------------------------------------------------------------
 * Home — hero
 * ------------------------------------------------------------------------- */

export const HERO = {
  /** Rotating identity words; the sequence resolves on the last entry. */
  rotatingWords: ["Engineers", "Enthusiasts", "Developers", "Miners", "Stakers"],
  /** The word the rotation resolves to — the point of the site. */
  finalWord: "Community",
  kicker: "BlockDAG Network · Chain ID 1404",
  headline: SITE.positioning,
  mission:
    "Built on the principles of decentralisation, transparency and open participation, this platform empowers the community with the insight and information needed to contribute to a stronger, high-performing chain.",
  /** Two nouns, not two instructions: the hero's own word resolves to
   *  "Community", and these are the two things this site is about. */
  ctaPrimary: { label: "The Community", href: "/community" },
  ctaSecondary: { label: "The Chain", href: "/chain" },
  /**
   * HeroNode's scroll affordance — stays ON-PAGE. It shared ctaSecondary.href
   * for as long as "The Chain" meant the #network band; now that /chain is a
   * page, the two have to part company. An element whose accessible name is
   * "Scroll to explore" must not navigate away.
   */
  scrollCue: { href: "#network", label: "Scroll to explore" },
} as const;

/** Screen-reader page h1 (the visual hero renders decoratively). */
export const HOME_HEADLINE =
  "BDAG Community: the community running BlockDAG Network from Genesis";

/* ---------------------------------------------------------------------------
 * Home — live network stats
 * ------------------------------------------------------------------------- */

export const STATS_SECTION = {
  eyebrow: "The network, live",
  title: "The pulse of BlockDAG",
  sub: "Read straight from the canonical chain.",
  viewAll: { label: "Open the explorer" },
  /** Displayed as plain text — deliberately NOT a link. */
  publicRpc: { label: "Public RPC endpoint" },
  /** Leads to the node status board, which now lives on The Chain. */
  viewAllNodes: { label: "The Chain, in detail", href: "/chain#nodes" },
  /**
   * MOVED HERE from the /chain boundary rail when that section was removed,
   * and it had to move rather than go: this band is the only place on the
   * site that draws a transaction total and an address total, and without
   * this sentence both are quoted as if the index behind them were complete.
   * It was previously the caption under the indexed-history gauge, which was
   * itself removed earlier.
   */
  floorNote:
    "The community explorer is still backfilling blocks behind the live head, so the transaction and address totals here are approximate floors rather than totals. A later indexer reading can correct an earlier estimate.",
  aggregateProvenance: {
    marker: "≈",
    labels: {
      tracked: "Counted from a verified checkpoint",
      extrapolated: "Projected from verified checkpoints",
      floor: "Latest approximate floor",
    },
    note: "Values marked ≈ use the latest saved chain-matched indexer observation above the trusted checkpoint. Community observations never advance the trusted checkpoint by themselves.",
  },
} as const;

/* ---------------------------------------------------------------------------
 * Public RPC endpoints — checked live by /api/nodes (status + fork detection).
 * Hosts are rendered as text ONLY, never as an href — the fork must not
 * receive traffic from this site. Deliberately NO url field: the editorial
 * invariant (enforced by tests) is that no fork URL literal exists anywhere;
 * the server-side prober derives `https://<host><probePath>` at runtime.
 * ------------------------------------------------------------------------- */

export type NodeDef = {
  id: string;
  name: string;
  host: string;
  /** Path the server-side prober appends to https://<host>. */
  probePath: string;
  role: "canonical" | "community" | "flagged" | "legacy";
  /** Optional badge shown beside this host in the response-time comparison. */
  responseTimeLabel?: string;
  blurb: string;
};

export const NODES: readonly NodeDef[] = [
  {
    id: "canonical-rpc",
    name: "rpc.blockdag.engineering",
    host: "rpc.blockdag.engineering",
    probePath: "/",
    role: "canonical",
    blurb: "The canonical public JSON-RPC endpoint the community operates.",
  },
  {
    id: "bdag-us-east",
    name: "rpc.east.bdag-us.org",
    host: "rpc.east.bdag-us.org",
    probePath: "/",
    role: "community",
    blurb: "Community-run public RPC node (BDAG-US, east region).",
  },
  {
    id: "bdag-us-west",
    name: "rpc.west.bdag-us.org",
    host: "rpc.west.bdag-us.org",
    probePath: "/",
    role: "community",
    blurb: "Community-run public RPC node (BDAG-US, west region).",
  },
  {
    id: "bdag-us-brazil",
    name: "rpc.brazil.bdag-us.org",
    host: "rpc.brazil.bdag-us.org",
    probePath: "/",
    role: "community",
    blurb: "Community-run public RPC node (BDAG-US, Brazil region).",
  },
  {
    id: "bdag-us-england",
    name: "rpc.england.bdag-us.org",
    host: "rpc.england.bdag-us.org",
    probePath: "/",
    role: "community",
    blurb: "Community-run public RPC node (BDAG-US, England region).",
  },
  {
    id: "cms",
    name: "rpc.cms-mining-pool.net",
    host: "rpc.cms-mining-pool.net",
    probePath: "/",
    role: "community",
    blurb: "CMS Mining Pool community public RPC node.",
  },
  {
    id: "dvdmining",
    name: "rpc.dvdmining.com",
    host: "rpc.dvdmining.com",
    probePath: "/",
    role: "community",
    blurb: "Community-run public RPC node.",
  },
  {
    id: "capedag",
    name: "rpc.capedag.com",
    host: "rpc.capedag.com",
    probePath: "/",
    role: "community",
    blurb: "Community-run public RPC node.",
  },
  {
    id: "rms",
    name: "rms-bdag-rpc.de/api/rpc-live",
    host: "rms-bdag-rpc.de",
    probePath: "/api/rpc-live",
    role: "community",
    blurb: "RMS community public RPC node.",
  },
  {
    id: "welshdag",
    name: "rpc.welshdag.trade",
    host: "rpc.welshdag.trade",
    probePath: "/",
    role: "community",
    blurb: "WelshDAG community public RPC node.",
  },
  {
    id: "bdagexplorer",
    name: "rpc.bdagexplorer.com",
    host: "rpc.bdagexplorer.com",
    probePath: "/",
    role: "community",
    blurb: "BDAG Explorer community public RPC node.",
  },
  {
    id: "bdagscan-fork",
    name: "rpc.bdagscan.com",
    host: "rpc.bdagscan.com",
    probePath: "/",
    role: "flagged",
    responseTimeLabel: "Fork",
    blurb:
      "The fork. Claims chain ID 1404 but serves a diverged chain. Do not use it for balances, deposits, or mining.",
  },
  {
    id: "works-legacy",
    name: "rpc.blockdag.works",
    host: "rpc.blockdag.works",
    probePath: "/",
    role: "legacy",
    responseTimeLabel: "Deprecated",
    blurb: "Retired legacy endpoint from older documentation.",
  },
] as const;

export const NODES_SECTION = {
  eyebrow: "Nodes",
  title: "Public RPC nodes, checked live",
  sub: "Every known public BlockDAG RPC node, probed from this site with fork detection: an endpoint can claim chain ID 1404 and still serve the wrong chain. The block hashes give it away. A node that is merely behind still agrees on every block it has, and is marked behind, not fork.",
  /** Corrected: the probe cache in lib/chain/nodes.ts has a 20-second TTL. */
  refreshNote: "rechecks every 20 seconds",
  /** The one-line stand-in for `sub` where the board renders compact. */
  compactSub: "Live status of every public RPC endpoint, including the flagged one.",
  fullDetail: { label: "Full node detail", href: "/chain#nodes" },
  /**
   * The node card's own vocabulary, which was typed into <NodesPanel> rather
   * than sourced. These seven words are what the board actually claims about
   * an endpoint — "fully synced" in particular is an assertion, and an
   * assertion belongs where the rest of this site's assertions are reviewed.
   */
  cardLabels: {
    /** Shown on the verdict chip before the first probe returns. */
    checking: "Checking",
    /** Shown when the board could not complete its first probe. */
    unavailable: "Unavailable",
    head: "Head",
    behindBy: "Behind by",
    /** Unit for the behind-by figure: "{n} blocks". */
    blocksUnit: "blocks",
    sync: "Sync",
    synced: "fully synced",
    hashMatch: "Hash match",
    latency: "Latency",
  },
  statusLabels: {
    checking: "checking node status",
    live: "node status checked",
    stale: "showing the last successful node check",
    unavailable: "node status is unavailable",
  },
  retryNote: "retrying every 20 seconds",
} as const;

/* ---------------------------------------------------------------------------
 * Home — exchange / integrator warning (fork hygiene)
 * ------------------------------------------------------------------------- */

export const EXCHANGE_WARNING = {
  label: "Information for exchanges and integrators",
  title: "Only one BlockDAG Network is canonical",
  /**
   * ONE sentence, because nobody integrating a chain reads a wall of warning.
   *
   * It used to run to three sentences plus three bullets that restated them,
   * plus two more sentences of pinning advice — all of it true, almost none of
   * it read. "Same chain ID, different block hashes" is the entire technical
   * argument in six words, and it is the line an integrator can act on.
   *
   * The fork is NAMED and never linked — see the rule at the top of this file
   * and the test that enforces it. "Centralised" is the material point: the
   * problem is not that a second endpoint exists, it is that one party decides
   * what it serves and presents that as the network.
   */
  body:
    "Do not use rpc.bdagscan.com. It is a centralised fork: same chain ID, different block hashes, with closed mining that only recently came online. Balances and deposits read from it are not on the canonical chain.",
  /**
   * The evidence, and the pinning advice this card used to spell out, both
   * live on /chain — the connect block carries "copy them from here rather
   * than from an old tutorial or a forked repository", and the node board
   * carries the hash-depth check that proves the divergence. Cutting them here
   * shortened the card; the link is what keeps them one click away.
   */
  /** The three values an integrator has to get exactly right, together. */
  endpointsTitle: "Mainnet endpoints",
  rpcLabel: "Public RPC",
  explorerLabel: "Explorer",
  more: {
    label: "View more",
    /** Completes the accessible name — "View more" alone is a link nobody can
     *  act on out of context. It points at the node board, which is where the
     *  claim above is actually evidenced: every public endpoint probed, with
     *  block hashes compared at three depths. */
    context: " on every public endpoint, checked live",
    href: "/chain#nodes",
  },
  /**
   * The recommendation that costs us the dependency, in one line. All three
   * benefits survive the cut: you verify it yourself (decentralised), you stay
   * in sync, and nothing rate-limits you.
   */
  recommendTitle: "Run your own node",
  /** Rendered as a badge beside the heading, not as more prose. */
  recommendBadge: "Recommended",
  recommend:
    "No endpoint to trust, not even ours. You verify the chain yourself, stay in sync, and run unthrottled.",
  recommendCta: { label: "Run your own node", href: "/community#run-a-node" },
} as const;

/* ---------------------------------------------------------------------------
 * Home — timeline
 * Dates: Genesis is verified on-chain. Every event has an exact date and
 * carries `approx: false`. Set
 * `approx: true` on an event and restore the legend if a future date is
 * only estimated.
 * ------------------------------------------------------------------------- */

export type TimelineEvent = {
  when: string;
  approx: boolean;
  title: string;
  body: string;
};

export const TIMELINE: readonly TimelineEvent[] = [
  {
    when: "10 Feb 2026",
    approx: false,
    title: "Genesis",
    body: "Block 0 of BlockDAG Mainnet is mined at 22:03 UTC. The canonical public chain history begins at that block.",
  },
  {
    when: "15 July 2026",
    approx: false,
    title: "A public endpoint diverges",
    body: "rpc.bdagscan.com reports chain ID 1404, but its historical block hashes diverge from the canonical endpoint. The live node board checks that distinction rather than trusting chain ID alone.",
  },
  {
    when: "1 November 2026",
    approx: false,
    title: "Community Testnet opens",
    body: "The Community Testnet is available, and testers try the Development and Staking platforms and share their feedback.",
  },
  {
    when: "8 November 2026",
    approx: false,
    title: "DAO and Staking V2 Mainnet rollout begins",
    body: "The first Mainnet nodes move to the new release. The release will be made public once those nodes have demonstrated stable operation.",
  },
] as const;

export const TIMELINE_SECTION = {
  eyebrow: "How we got here",
  // Sentence case, like every other title on the site.
  title: "From Genesis to now",
  // The rail's live terminal: history ends at a pulsing "now".
  now: {
    when: "Today",
    title: "Exchange listings are next",
    body: "Once the DAO and Staking V2 upgrade is complete and stable, we’ll start exploring exchange listings. The live readings above show how the chain is progressing today.",
  },
} as const;

/* ---------------------------------------------------------------------------
 * Home — participation sections
 * ------------------------------------------------------------------------- */

export const MINING_SECTION = {
  eyebrow: "Mine",
  title: "Put real hardware behind the chain",
  body:
    "Current X30 and X100 availability is maintained at bdag.co. In-stock devices can be ordered there, and when stock is unavailable the next manufacturing round may be offered. Shipping is included, and import tax and fees are paid by the buyer.",
  cta: { label: "Check miner availability at bdag.co", url: FAMILY_SITES.miners.url },
  more: { label: "Read about mining", href: "/mining" },
  devices: [
    {
      model: "X30",
      image: "/x30-featured.png",
      blurb: "Review current X30 specifications and order terms at bdag.co.",
    },
    {
      model: "X100",
      image: "/x100-featured.png",
      blurb: "Review current X100 specifications and order terms at bdag.co.",
    },
  ],
} as const;

/** A third-party listing, separate from the bdag.co availability offer. */
export const COMMUNITY_MINER_SELLER = {
  title: "Community miner seller",
  lead: "Independent community seller offering X30 miners. BDAG Community does not handle this sale. Check the seller's price, stock, payment, delivery, and warranty terms before ordering.",
  label: "BDAG-US X30 listing",
  url: "https://bdag-us.org/buy-x30/",
} as const;

export const STAKING_SECTION = {
  eyebrow: "Stake",
  title: "Participation is not only hardware",
  body:
    "We want to encourage participation on BDAG not just through mining but through staking: a native staking reward mechanism built directly on chain. Variable rewards, non-custodial, no fixed return promised.",
  /** Above the contract address on the home card. Deliberately the same words
   *  as STAKING_PAGE.facts.contractLabel — it is the same fact, and the two
   *  surfaces should not describe it differently. */
  contractLabel: "Native staking contract",
  more: { label: "How staking works", href: "/staking" },
} as const;

export const DEVELOPMENT_SECTION = {
  eyebrow: "Build",
  title: "The chain is an invitation",
  body:
    "We want every developer, engineer, and participant with ideas to help create utility, improve the network, and use this chain optimally. A dedicated development hub is launching shortly at bdag.dev. The community stack source is on GitHub. The DAO will help the community review, vote on and fund improvements.",
  chip: "Open-source stack",
  cta: { label: "bdag.dev (launching shortly)", url: FAMILY_SITES.dev.url },
  /** The community is already building without waiting for the hub. This
   *  link surfaces those projects wherever the Build story renders (home
   *  card and /community#build). */
  projectsLink: { label: "See community projects", href: "/community/projects" },
} as const;

/**
 * The community projects cross-link card, shaped like MINING_SECTION and
 * STAKING_SECTION (eyebrow/title/body/more) so the chain page can map it
 * into its "Where to go next" cards without re-authoring copy.
 */
export const PROJECTS_SECTION = {
  eyebrow: "Projects",
  title: "Built by the community",
  body:
    "Explorers, dashboards, pools, and tools the community runs for this chain. Every listed project is vetted before it appears, and anyone can submit their own.",
  more: { label: "See community projects", href: "/community/projects" },
} as const;

export const NEWS_SECTION = {
  eyebrow: "Articles",
  title: "What the community is doing",
  viewAll: { label: "All articles", href: "/articles" },
} as const;

/* ---------------------------------------------------------------------------
 * Trust
 * ------------------------------------------------------------------------- */

/**
 * Canonical non-affiliation paragraph — rendered ONLY by <Disclaimer>.
 * First sentences shared with the bdag.co wording (the family's legal/trust
 * core); the closing sentence names THIS site's purpose.
 */
export const NON_AFFILIATION =
  "The BDAG Community is not affiliated with the team or parties that ran previous BDAG presales, previous ASIC miner sales, or previous order fulfilment. We did not receive payments for any previous BDAG or ASIC miner orders and cannot access, manage, refund, or fulfil any previous purchases. We are an independent group of supporters running this for the love of the project, and we invested significant contributions into the network ourselves. This site exists to keep the community transparent and informed about the network we run together, and to help anyone who wants to take part.";

export const RISK_SMALL_PRINT =
  "Participating in any blockchain network (running hardware, staking, or holding tokens) carries risk, including the loss of what you put in. Nothing on this site is financial advice, and no fixed return is promised anywhere on this network.";

/* ---------------------------------------------------------------------------
 * The Chain page
 *
 * THE RULE THAT GOVERNS THIS OBJECT: no measured figure is ever written into
 * copy here. Every number the reader sees is interpolated at render time from
 * /api/stats or /api/chain-history into a {placeholder}. This is not style —
 * it is the fix for a specific failure. Earlier drafts of this page baked live
 * observations into prose ("the explorer says N ms", "the two gas prices
 * disagree by Nx", "the busiest day was N"), and every one of those sentences
 * was already false within a day of being written: the explorer's average
 * block time reads differently on almost every check, the gas-price sources
 * have since converged, and the real 31-day peak is an order of magnitude
 * above the figure that had been written down.
 *
 * Constants that ARE safe here, because they are protocol facts rather than
 * measurements: chain id 1404, 18 decimals, the 21,000 gas of a plain
 * transfer, and the 45,000,000 gas limit — and even the gas limit is READ
 * from the blocks by the gauge rather than taken from this file.
 *
 * There is no `mock: true` and no `approx: true` flag in this object, because
 * there is no invented number in it. Every figure is live, live-derived, an
 * on-chain constant, or explicitly framed as arithmetic. That is the point.
 * ------------------------------------------------------------------------- */

export const CHAIN_PAGE = {
  eyebrow: "The Chain",
  title: "A DAG under an EVM, secured by proof of work",

  primer: {
    selectorLabel: "Choose a part of the chain",
    items: [
      {
        key: "dag",
        short: "DAG",
        layer: "The shape",
        subtitle: "Directed Acyclic Graph",
        body: "Think of a DAG as a shared map of blocks instead of a single-file line. More than one valid block can be added around the same time, then the network agrees on the order they count in.",
      },
      {
        key: "evm",
        short: "EVM",
        layer: "The engine",
        subtitle: "Ethereum Virtual Machine",
        body: "This is the engine that runs apps and transactions. Once the network agrees on the block order, every node follows the same instructions so balances, transfers, and smart contracts reach the same result.",
      },
      {
        key: "pow",
        short: "POW",
        layer: "The protection",
        subtitle: "Proof of Work",
        body: "Miners spend real computing work to propose blocks. Every node can quickly check that work before accepting a block, which makes changing accepted history difficult and expensive.",
      },
    ],
  },

  shape: {
    /** Every other section opens eyebrow/h2/lead; without this one, shape read
     *  as a continuation of the hero rather than as its own landmark. NOT "The
     *  shape": the primer's DAG card already wears that as its layer label,
     *  and the two would have sat two sections apart saying the same words. */
    eyebrow: "Structure",
    title: "A one of a kind, high-performing chain",
    /**
     * THE CLAIM, THEN THE HANDOVER.
     *
     * This section used to open on mechanism ("a block on a linear chain names
     * one parent"). It now opens on what the combination BUYS, because the
     * mechanism is what the drawing underneath is for and a reader who has not
     * been told why to care will not watch it.
     *
     * WHAT IS AND IS NOT BEING CLAIMED. Each of the three sentences after the
     * heading is an architectural fact, not a benchmark: parallel blocks are
     * kept rather than discarded, the EVM runs existing tooling unchanged, and
     * proof of work is what secures the chain. None of them quotes a rate, a
     * block time or a comparison with a named chain, and none of them can go
     * stale. "Very few chains carry all three at once" is the strongest claim
     * here and it is a claim about architecture, which is checkable, rather
     * than about performance, which on this page would have to be measured.
     * Keep it that way: the live band directly below this section is where
     * numbers are allowed, and every one of them states its own window.
     */
    body: [
      "DAG + EVM + POW. Blocks arrive in parallel instead of single file, so work that a linear chain would throw away is kept. Every Ethereum tool, contract and wallet works against it unchanged. And real mining work is what secures it. Very few chains carry all three at once.",
      "The drawing below is how those three fit together, one step at a time.",
    ],
    /*
     * The standing figcaption was removed at the owner's request. It read
     * "The letters and the numbered order are examples. Time runs left to
     * right." and it is not missed: the drawing carries SCHEMATIC, NOT LIVE
     * DATA as its first text, the note under it opens "This is a schematic,
     * not a rendering", the figure's accessible name opens "Schematic drawn
     * with example letters", and nothing in the drawing is hash-shaped any
     * more. Direction is carried by the arrowheads and stated outright by
     * beat 02. Three disclosures and a fourth line was one too many.
     */
    /**
     * NON-NEGOTIABLE, and it renders beside the drawing rather than below it.
     * The head block returned by eth_getBlockByNumber carries a singular
     * parentHash and no multi-parent field of any kind, so the drawing shows
     * the design and cannot show the data. The page has to say that itself.
     *
     * Shortened from three sentences to two at the owner's request, and it now
     * renders behind an info icon. What went is the REASON: the sentence
     * saying the RPC returns a singular parentHash and that the multi-parent
     * structure therefore cannot be read off the live chain. That sentence is
     * the site's only statement of that limitation and a test pins it at
     * exactly one occurrence, so it was MOVED into boundary.items rather than
     * deleted. The disclosure itself, which is the part that must sit under
     * the drawing, is unchanged in force: this is not the data.
     */
    schematicNote:
      "This is a schematic, not a rendering. The drawing shows the protocol's design, and not the data.",
    diagram: {
      /**
       * The drawing's structural reading, carried by a single sr-only
       * role="img" span that sits OUTSIDE the .viz wrapper. Forced colours
       * sets .viz to display none, so a name living inside it would vanish for
       * the one reader who cannot work around its absence. That is ArcGauge's
       * rule.
       *
       * It opens with the caveat, so a listener meets "example" before any
       * content. One pass over the whole structure; a per-node reading of a
       * schematic is a maze, and the six steps carry the teaching anyway.
       */
      label:
        "Schematic drawn with example letters. Five blocks are drawn as circles joined by arrows, and every arrow points from a newer block back to an older one. Blocks D and E each point back to both B and C, so their arrows cross. One arrow that would lead back into C is drawn broken and crossed out. The four newest blocks then appear in one numbered line, and the EVM applies them in that order to turn the state it holds into the next state.",
      /**
       * THE TELL, and the first text in the drawing in DOM order and in
       * reading order. Stored uppercase because SVG text cannot be relied on
       * to honour text-transform in every engine. It stays inside the SVG
       * rather than becoming an HTML label above it so that it survives the
       * figure being screenshotted and pasted somewhere without its caption.
       *
       * It used to read EXAMPLE VALUES, which was the right banner for a
       * drawing full of hash-shaped strings. There is no hex digit anywhere in
       * this figure now: the blocks are the letters A to E and the order is
       * the digits 1 to 4. Nothing here can be pasted into an explorer,
       * matched against anything, or mistaken for the head-and-tail producer
       * addresses the live table prints a few hundred pixels below. That is a
       * stricter guarantee than a rhyming truncation was, and it is also the
       * version a reader who has never met a DAG can follow.
       */
      exampleLabel: "SCHEMATIC, NOT LIVE DATA",
      /** The label on the one arrow in the drawing that does not exist. It is
       *  drawn with a real gap and a cross through the gap, and its head is
       *  the only one in the figure pointing forward in time. Drawn that way
       *  on purpose: the acyclic argument had to survive stillness, so it is a
       *  mark rather than a gesture. */
      noLoopLabel: "NO WAY BACK",
      engineLabel: "EVM",
      /** Two chips with the same shape and the same grammar, which is what
       *  makes the hexagon read as a state machine rather than as a pipe: what
       *  comes out is what goes in next time. */
      stateIn: "state now",
      stateOut: "state next",
      /**
       * The six beats, in order, and the section's whole teaching surface. One
       * at a time under the drawing while it plays; all six as a numbered list
       * when nothing runs. Each line says what the drawing is doing at that
       * moment, in the present tense, so the sentence and the picture cannot
       * drift.
       *
       * The order is the one the linked reference uses: vertex and edge, then
       * directed, then acyclic. Then what a BlockDAG adds, then what consensus
       * does with it, then the state transition performed on the result.
       *
       * `label` is the whole vocabulary budget: vertex, edge, directed,
       * acyclic, parent, order. Each said once, beside the sentence that
       * defines it and beside the mark it names.
       */
      steps: [
        {
          n: "01",
          label: "Vertex and edge",
          body: "Each block is a circle, called a vertex. Each line joining two of them is an edge.",
        },
        {
          n: "02",
          label: "Directed",
          body: "Every edge points one way, from a newer block back to one that already exists.",
        },
        {
          n: "03",
          label: "Acyclic",
          body: "Follow the edges out of C and every step lands on an older block. Nothing leads back to C, so the graph cannot loop.",
        },
        {
          n: "04",
          label: "Two parents",
          body: "D and E each point back to two parents, so B and C both count. On a single-file chain one of them would have been thrown away.",
        },
        {
          n: "05",
          label: "One order",
          body: "Consensus lays the same four blocks out in one line. The block that would have lost the race is still there, at number two.",
        },
        {
          n: "06",
          label: "The EVM",
          body: "The EVM takes the state as it stands and applies those blocks in that order. Run it on any node and the next state comes out the same.",
        },
      ],
      /**
       * The transport. Deliberately NOT a segmented selector: the primer at
       * the top of this page already owns that control, that shape and that
       * mental model, and a second one two sections down would compete with
       * it. Back, play and next is a different affordance for a different job,
       * and a reader does not have to parse an ARIA role to tell a media
       * transport from a set of tabs.
       */
      transportLabel: "Step through the drawing",
      backLabel: "Back",
      playLabel: "Play",
      pauseLabel: "Pause",
      replayLabel: "Replay",
      nextLabel: "Next",
      stepTemplate: "Step {n} of {total}",
      /**
       * The five blocks. ONE array feeds the circles, the four ordered slots
       * and the forced-colours table, so the three cannot drift. A is the
       * earlier tip: its own parents are off the left edge, which the table
       * says in words and the drawing says with a fading stub, so nothing here
       * implies A is the first block that ever existed.
       */
      blocks: [
        { id: "A", refs: "earlier blocks, not drawn", order: "settled" },
        { id: "B", refs: "A", order: "1" },
        { id: "C", refs: "A", order: "2" },
        { id: "D", refs: "B and C", order: "3" },
        { id: "E", refs: "B and C", order: "4" },
      ],
      /** Headings for the forced-colours table, which carries the one thing
       *  the captions do not spell out block by block and only the drawing
       *  shows: which block points back to which. */
      fallbackColumns: ["Block", "Points back to", "Order"],
    },
  },

  readout: {
    eyebrow: "Live readout",
    title: "What the network is doing right now",
    sub: "Read from an independently verified RPC quorum and a chain-verified explorer, cached for twelve seconds and shared by every visitor. Every figure states the window it was measured over.",
    /** The `note` sub-labels are the honesty; they are never truncated. */
    stats: [
      { key: "blockHeight", label: "Block height", note: "extrapolated between polls" },
      { key: "blockInterval", label: "Block interval", note: "measured over 1,000,000 blocks" },
      { key: "tps", label: "Transactions per second", note: "measured over {window}" },
      { key: "peers", label: "Peers", note: "lower median from verified nodes" },
    ],
    liveLabel: "LIVE · CHAIN ID 1404",
    rpcLabel: "Public RPC",
    explorerCta: "Open the explorer",
    nodesCta: "Jump to the node board",
  },

  capacity: {
    title: "How full the blocks are",
    headlineLabel: "gas free in every block",
    subTemplate: "{pct} of the {limit} gas limit used",
    caption:
      "Each sampled block carries its gas limit in the header, so this reading has a real denominator. The empty arc is a measurement, not a rendering error.",
    maxNoteVaried: "Showing the highest gas limit in the sample.",
    windowTemplate: "sampled over blocks {from} to {to}",
    unavailable: "Waiting for block data.",
  },

  index: {
    title: "How much of the history is indexed",
    label: "Indexed by the explorer",
    caption:
      "The explorer is still backfilling blocks behind the live head, so transaction and address totals anywhere on this site are floors rather than totals.",
    unavailable: "The indexing status is not answering right now.",
  },

  interval: {
    eyebrow: "Timing",
    /**
     * This heading used to name the interval as a literal — a measured figure
     * baked into copy, on the one page whose entire claim is that it never
     * does that. (The figure is not repeated here, in words or in a comment,
     * for exactly that reason.) {interval} is filled from the longest baseline
     * the page has (the 1,000,000-block window), formatted to two decimals,
     * exactly like every other figure here.
     *
     * `titleUnmeasured` is what the heading says before that baseline exists.
     * A heading is an accessible name, so it must never render a raw
     * "{interval}" and must never count up from a placeholder: it has one
     * pre-measurement wording and one measured wording, and it changes once.
     */
    titleTemplate: "Blocks land about every {interval} seconds",
    titleUnmeasured: "Blocks land faster than their timestamps can show",
    /**
     * EMPTY, and kept as an empty array rather than deleted so a future editor
     * reaching for `interval.body` finds this note instead of an absent key.
     *
     * The Timing section that rendered these two paragraphs was removed at the
     * owner's request: the interval already reads in the live band above,
     * labelled with the window it was measured over. The first paragraph
     * explained WHY that window has to be so long, which is the one thing that
     * could not go with the section, so it moved verbatim into
     * CHAIN_PAGE.boundary.items. The second described the four baselines and
     * went with the strip that drew them.
     */
    body: [],
    /* The explorer's own average block time was described here at length and
     * then not shown. We still never display or derive from it, for the reason
     * the removed paragraph gave: it has come back materially different on
     * every check, with no relevant block changing in between. That is a
     * decision about our data, not something a reader has to be told. */
    baselineLabels: {
      server: "since this server started",
      tenK: "over 10,000 blocks",
      hundredK: "over 100,000 blocks",
      millionn: "over 1,000,000 blocks",
    },
    errorLabel: "quantisation error",
    /**
     * TWO GATES, TWO STRINGS. One string served both for a while and it could
     * only ever be right about one of them.
     *
     * `measuringTps` is the transactions-per-second stat, gated on
     * MIN_WINDOW_SECONDS in lib/chain/window.ts, which is one minute.
     *
     * `measuring` is the since-boot row of the interval baselines, gated on
     * MIN_BASELINE_BLOCKS, which is a thousand blocks, because timestamps here
     * are whole seconds and an interval only becomes meaningful over distance.
     * That is a quarter of an hour of chain, not a minute, and saying "a
     * minute" on that row would have been a promise the code cannot keep.
     *
     * Both stay vague about the count: a block figure here would be a measured
     * figure written into copy.
     */
    measuringTps: "measuring: needs about a minute of blocks",
    measuring: "measuring: needs a few thousand blocks",
  },

  pow: {
    eyebrow: "Proof of work",
    /**
     * A fixed heading, and the count on a line of its own beneath it.
     *
     * The heading used to carry the live producer count. It is this section's
     * aria-labelledby target, so the section's accessible name changed every
     * time the poll returned a different number — five times a minute, for a
     * screen-reader user re-orienting on a landmark that will not hold still.
     * The count is still on the page, one element lower, where it is read on
     * demand like every other numeral rather than announced as a name.
     */
    title: "Who produced the last fifty blocks",
    countTemplate: "{n} distinct producer addresses",
    /**
     * EMPTY, and deliberately kept as an empty array rather than deleted.
     * Both paragraphs moved verbatim into CHAIN_PAGE.boundary.items, because
     * the prose column they lived in was removed when the producer bars were
     * paired with the block table. The key stays so that a future editor who
     * reaches for `pow.body` finds this note rather than an absent property
     * and writes the caveats a second time.
     */
    body: [],
    windowLabel: "Latest producers",
    /**
     * MOVED INLINE from the boundary rail when that section was removed.
     *
     * Two facts, and the second is the site's ONLY statement that no BlockDAG
     * hashrate is derivable from this chain. A test pins it at exactly one
     * occurrence and it must not be shortened. It renders directly under the
     * producer bars, which is both the count it qualifies and the one place a
     * reader goes looking for a hashrate.
     */
    caveat:
      "One address can sit in front of thousands of machines, or in front of one, so this is a count of addresses rather than of miners. Difficulty in every block header on this chain reads 1, and total difficulty carries no usable information. There is no route from that to a hashrate, so this page shows no hashrate and no difficulty chart. Anyone quoting a BlockDAG hashrate is not reading it off this chain.",
    dayTemplate: "Distinct producer addresses in this trailing-day sample: {n}",
    dayNote:
      "A fixed sample spread across roughly the trailing day. It counts producer addresses, so one pool address may represent many miners.",
    more: { label: "Put hardware behind it", href: "/mining" },
  },

  evm: {
    eyebrow: "Execution",
    title: "What the blocks are carrying",
    /** The primer's EVM card already teaches determinism in plain language, and
     *  the removed opener ("Above the DAG, nothing is exotic") spent the
     *  hinge's line two sentences before the hinge landed. The hinge now opens
     *  the section and this is the only prose under it. */
    gasNote:
      "Gas meters the work, and BDAG pays the network fee even when the transaction concerns another token. A token balance alone is not enough to transact.",
    /** The hinge. This sentence is why DAG + PoW + EVM is one story and not a
     *  list of three features. Set it in .lead weight, text-on-surface. */
    hinge:
      "BlockDAG changes how blocks are produced and reconciled beneath the execution surface. Above it nothing is unusual: accounts, bytecode, storage, calls, logs, receipts and gas, on chain ID 1404, with the tools you already use.",
    /* The arithmetic ceiling lived here: gas limit divided by the 21,000 gas
     * of a plain transfer, then per second at the measured interval. It was
     * the longest string on the page and it withdrew its own number three
     * times over. Nobody can act on a figure we disclaim that hard, and a
     * screenshot of it without the caveats is the worst outcome this page has.
     * The gas limit still appears where it means something: the capacity dial
     * reads it from the block header. */
  },

  throughput: {
    title: "Daily transactions, thirty-one days",
    caption:
      "Complete days as the explorer recorded them. There is no total for the day in progress. Every bar shares one scale, with the busiest day in this window at the top.",
    latestTemplate:
      "{count} transactions on {date}, a daily average of {rate} per second.",
    peakTemplate:
      "The busiest of these thirty-one days was {count} on {date}, an average of {rate} per second. That is a record we have observed, not a capacity the network claims.",
    unavailable: "The daily history is unavailable right now.",
  },

  ticker: {
    title: "Latest blocks",
    columns: ["Height", "Age", "Producer", "Transactions", "Gas"],
    /** The last sentence is not decoration. Most blocks on this chain carry
     *  nothing, so a reader watching eight rows of zeros reasonably concludes
     *  the table is broken. It states the structural reason — which is true of
     *  any proof-of-work chain and cannot go stale — rather than quoting how
     *  often it happens, which would be a measured figure in copy. */
    note: "The last fifty blocks are read every twelve seconds and the eight newest are shown. Producer is the address in the block header. A block is produced whether or not there is anything to put in it, so an empty one is a normal reading.",
  },

  connect: {
    eyebrow: "Connect",
    title: "Point something at chain 1404",
    body: "Take the network values from this page rather than from an old tutorial or a forked repository. That is how people end up on the wrong network.",
    snippetTitle: "Wallet and integrator config",
    snippetNote:
      "Paste this into a wallet's custom-network form, or into an integration's chain registry.",
    liveOk: "network verified",
    liveDown: "live network reading unavailable",
    /**
     * The first ~12 seconds of every visit, before the first poll returns.
     *
     * <ConnectPulse> had no third state: it showed "not answering right now"
     * — and announced it, from a role="status" — while it had simply not
     * asked yet. That is an assertion about the canonical endpoint, made from
     * no evidence, on the card whose job is to be the endpoint you trust. The
     * dot already carried the distinction (pulsing outline vs warn-orange);
     * the words now carry it too. Branch on the `checking` variable that
     * component already computes.
     */
    liveChecking: "checking the network",
    verified: "chain id verified",
    unverified: "chain id unverified right now",
    /** Same defect, same line, same fix: "unverified right now" is a finding,
     *  and before the first response there is no finding yet. Pair this with
     *  liveChecking on the same `checking` branch. */
    verifyChecking: "chain id not checked yet",
  },

  nodes: {
    eyebrow: "Read the chain",
    title: "Every public RPC node, checked from here",
    sub: "An endpoint can answer with chain ID 1404 and still serve a different chain. We probe each known public endpoint from this site's server and compare its block history with the independently agreed head. Your browser never touches these endpoints, least of all the flagged one.",
    latencyTitle: "Response time",
    /** The RPC list came from a community member's aggregation work, and
     *  the section says so (2026-08-13). The name is their handle, spelled
     *  as they spell it. */
    credit: "Credit to community member odin's-explorer for aggregating these public RPCs.",
  },

  /**
   * One calibration rail, not two.
   *
   * "Reading the chain honestly" and "What this page cannot tell you" ran back
   * to back and did the same job — how to read what is above, and where it
   * stops. Three of the eleven items were restatements of copy that already
   * appears earlier and closer to the thing it qualifies:
   *   - "Hashrate and network difficulty" -> pow.body[1], which is now the ONLY
   *     statement of it and must not be shortened.
   *   - "The graph itself"                -> shape.schematicNote, beside the drawing.
   *   - "How many people are mining"      -> ticker.note and pow.body[0].
   *   - "Gas is paid in BDAG"             -> evm.body[1], in the section about gas.
   */
  /*
   * REMOVED at the owner's request: "THE BOUNDARY" rail, eight items of "how
   * to read this page, and where it stops". It was judged too extensive.
   *
   * Two of its items were not editorial and did not simply go. The
   * producer-address and no-hashrate caveats moved to CHAIN_PAGE.pow.caveat
   * and render under the producer bars; the explorer-index caveat moved to
   * STATS_SECTION.floorNote and renders under the home page totals it
   * qualifies, which is the only place on the site those totals are drawn.
   *
   * What DID go, so it can be asked for back rather than rediscovered: the
   * hash-versus-receipt distinction and the retry guidance for integrators;
   * the note that the peer count is not a count of the network and that no
   * uptime is claimed; the absence of a mempool figure and of any peak
   * throughput reading; the refusal to quote price, market cap or TVL; and
   * the sentence explaining that the RPC returns a singular parentHash, which
   * is why the drawing above is a schematic.
   */
} as const;

/* ---------------------------------------------------------------------------
 * Community page
 * ------------------------------------------------------------------------- */

export const COMMUNITY_PAGE = {
  /**
   * The hero is a sibling of /chain's: one display word, a subtitle under it,
   * the description, and a glass orb beside it. No eyebrow, because the
   * display word IS "Community" and an eyebrow above it would say it twice.
   */
  eyebrow: "Community",
  title: "Community",
  /** The old title, demoted to the line under the word it used to be. */
  subtitle: "A network built by the people who love it.",
  intro:
    "BDAG Community has no head office. It has node operators, miners in garages and data halls, stakers, builders, and people who believe a high-performing chain should belong to its participants. This page is how you find us.",
  /** Deliberately quiet — it renders in the label-caps register, not as an
   *  h2 in display type. The principles themselves are the loud part. */
  principlesTitle: "What we stand for",
  principles: [
    {
      title: "Evidence before promotion",
      body: "Every number we publish is read live from the canonical chain or clearly labelled. If we cannot verify it, we do not say it.",
    },
    {
      title: "Decentralisation is the point",
      body: "More independent nodes, miners, and voices make the network stronger. We would rather grow operators than followers.",
    },
    {
      title: "Transparent by default",
      body: "Decisions, incidents, and changes get explained in the open, including the uncomfortable ones.",
    },
    {
      title: "For the love of the project",
      body: "Nobody here is owed anything by you. We invested in this network ourselves and run this site because we want it to succeed.",
    },
  ],
  channelsTitle: "Where we talk",
  channelsNote:
    "Join the Telegram groups, follow community updates, and find our source and releases on GitHub.",
  /** The whole visible state of a `mock: true` channel: the full card wears
   *  it as the chip (and renders no handle line at all), the compact list
   *  shows it where a live channel shows its link. Placeholder handles are
   *  gone from the data, so this label is all a coming-soon card says. */
  channelMockChip: "Coming soon",
  /** Heading on the wallet/integrator config card. */
  walletConfigTitle: "Wallet configuration",

  suggestionBox: {
    /** The collapsed trigger. The form mounts on click (2026-08-13), so this
     *  label is the whole visible invitation on page load. */
    openLabel: "Open the suggestion box",
    eyebrow: "Suggestion box",
    title: "Help shape this community",
    body: "See something we should improve, build, explain, or investigate? Send it here. A name or username and a reply email are optional.",
    optional: "Optional",
    authorNameLabel: "Name or username",
    replyEmailLabel: "Reply email",
    suggestionLabel: "Your suggestion",
    suggestionHint:
      "Include enough context for someone receiving the email to understand the idea.",
    safety:
      "Never include a seed phrase, private key, password, or recovery code.",
    privacy:
      "Your name and reply email are used only to understand and respond to this suggestion.",
    submitLabel: "Send suggestion",
    success:
      "Your suggestion has been saved for the community team. Thank you.",
    failure:
      "Your suggestion could not be saved. Please keep a copy and try again later.",
    honeypotLabel: "Website",
    emailSubject: "New bdag.community suggestion",
    emailLabels: {
      authorName: "Name or username",
      replyEmail: "Reply email",
      suggestion: "Suggestion",
      notProvided: "Not provided",
    },
    validation: {
      authorNameMax: "Please keep the name or username under 120 characters.",
      replyEmailMax: "Please keep the reply email under 320 characters.",
      replyEmailInvalid: "That reply email does not look valid.",
      suggestionMin: "Please write at least 10 characters.",
      suggestionMax: "Please keep the suggestion under 4,000 characters.",
    },
  },

  /**
   * Run your own node.
   *
   * Three steps, in the order you actually do them, with the hardware and the
   * release link sitting inside the step that needs them. It used to open with
   * two long question-and-answer cards arguing why you should trust us; those
   * are becoming articles, and this section is now instructions.
   *
   * House style here, and it is deliberate: no em dashes, no "it is not X, it
   * is Y", no three-part flourishes. Plain sentences that tell someone what to
   * do. Nothing quotes a measured figure either: the release page is the
   * source for the version displayed here.
   */
  runNode: {
    eyebrow: "Run a node",
    title: "Run your own node",
    lead: "Running your own node means you read the chain directly instead of trusting someone else's endpoint, including ours. It takes three steps and hardware most people already have.",
    steps: [
      {
        n: "01",
        title: "Check the hardware",
        body: "A node validates the chain rather than mining it, so the requirements are modest. Storage is the part that matters most.",
      },
      {
        n: "02",
        title: "Get the release",
        body: "Find the current community build, its checksums and release notes. Choose the archive for your system.",
      },
      {
        n: "03",
        title: "Install and sync",
        body: "Follow the installation instructions for the release you verified. Your node is ready when it is in sync and holding peers. You can run it without mining.",
      },
    ],
    hardware: {
      title: "Recommended specs",
      items: [
        { label: "Processor", value: "Intel i3 or i5, or equivalent" },
        { label: "Memory", value: "16 GB DDR3 or better" },
        { label: "Storage", value: "256 GB SSD or NVMe" },
      ],
      storageNote:
        "A spinning disk cannot keep pace with the chain, so a node on one never finishes syncing.",
    },
    agent: {
      title: "Recommended: let an agent do it",
      body: "Install an AI agent on the node, give it access to the machine, and point it at the release. Download the onboarding brief below and hand it over. It collects what only you know, your hardware and your storage, then walks the agent through installing the stack and syncing the chain.",
      /** Not a suggestion, and not buried in the file: anyone handing an agent
       *  access to their machine should read it before they start. */
      safety:
        "It never needs a seed phrase or a private key. Running a node needs no key material at all, and the brief tells the agent to refuse a secret if you offer one.",
      download: {
        label: "Download node-onboarding.md",
        href: "/node-onboarding.md",
      },
      linkLabel: "Or give the agent this link",
      url: "https://bdag.community/node-onboarding.md",
    },
    release: {
      label: "Browse stack releases",
      href: RELEASES_PAGE.href,
      currentLabel: "Latest published release",
      unavailable: "Open the releases page for published downloads and checksums.",
    },
  },
  waysTitle: "Ways to take part",
  ways: [
    {
      title: "Run a miner",
      body: "Review the hardware options, current availability, and what to verify before configuring a mining pool.",
      href: "/mining",
      cta: "Explore mining",
    },
    {
      title: "Stake BDAG",
      body: "Review the native contract, registered pools, variable rewards, and lifecycle caveats.",
      href: "/staking",
      cta: "Read about staking",
    },
    {
      title: "Build with us",
      body: "Explore the community repositories and propose improvements to the software.",
      href: OPEN_SOURCE.href,
      cta: "Explore open source",
    },
    {
      title: "Spread the word",
      body: "Follow the articles and help keep exchanges and integrators on the canonical endpoints.",
      href: "/articles",
      cta: "Read the articles",
    },
  ],

  /**
   * Community-created public explorers, from the community resource
   * directory (2026-08-13, updated 2026-08-17). The canonical explorer
   * keeps its place in the chain reference; these are additional,
   * independently run windows onto the same chain. Every entry is verified
   * reachable before it is listed (the dead explore.*.bdag-us.org pair
   * taught that lesson).
   */
  explorers: {
    title: "Public explorers",
    lead: "Check our community-created public explorers, independent windows onto the same chain, each run by its own operator. They read the live head straight from the public RPC nodes.",
    items: [
      { name: "Odin's Explorer", url: "https://odinsexplorer.app" },
      { name: "RMS ChainPulse", url: "https://rms-bdag-rpc.de/" },
      { name: "BDAG Explorer", url: "https://explorer.bdagexplorer.com/" },
    ],
  },
  publicMining: {
    title: "Public mining",
    lead: "Compare independent community mining services and review live pool status before choosing where to point your miner.",
    items: [
      { name: "WelshDAG", url: "https://welshdag.trade/" },
      { name: "CapeDAG", url: "https://capedag.com" },
    ],
  },
} as const;

/* ---------------------------------------------------------------------------
 * Mining page
 * ------------------------------------------------------------------------- */

export const MINING_PAGE = {
  eyebrow: "Mining",
  /** The hero's display word. The old title is the subtitle under it: an
   *  eyebrow reading "Mining" above a word reading "Mining" said it twice. */
  title: "Mining",
  subtitle: "Mine BlockDAG with dedicated hardware.",
  intro:
    "BlockDAG Mainnet uses proof of work from ASIC miners. This page covers the X30 and X100, current availability, and the pool, reward-address, and network checks to complete before a device starts mining.",
  devices: [
    {
      model: "BDAG X30",
      image: "/x30-featured.png",
      tagline: "A compact ASIC model",
      body: "Review current X30 specifications, availability, and order terms at bdag.co before ordering.",
    },
    {
      model: "BDAG X100",
      image: "/x100-featured.png",
      tagline: "ASIC hardware for BlockDAG mining",
      body: "Review current X100 specifications, availability, and order terms at bdag.co before ordering.",
    },
  ],
  availability: {
    title: "Availability and delivery",
    points: [
      "Both models are sold through bdag.co while stock lasts.",
      "Out of stock? Secure a device from the next manufacturing round.",
      "Devices ship directly from our manufacturer, with shipping included.",
      "Import tax and fees are paid by the buyer on arrival.",
    ],
    cta: { label: "Check availability at bdag.co", url: FAMILY_SITES.miners.url },
  },
  /**
   * The whole path, in the order you walk it.
   *
   * This section and Community's "Run your own node" were covering the same
   * ground from two directions: that one is now node-only, and the node steps
   * live here as part of the sequence a miner actually needs, because on this
   * stack the pool arrives with the node's mining profile. Steps two and three
   * are deliberately brief and defer to /community#run-a-node rather than
   * restating a hardware table that would then have to be kept in two places.
   */
  steps: {
    title: "From box to blocks",
    lead: "A miner needs somewhere to send its work. On this stack that is your own node: the mining profile brings the pool with it, and the miner connects to that.",
    items: [
      {
        title: "Get a device",
        body: "Order an X30 or X100 at bdag.co. Delivery comes direct from the manufacturer.",
      },
      {
        title: "Run a node",
        body: "An Intel i3 or i5, 16 GB of memory and a 256 GB SSD are enough. Install the community stack and let it sync from genesis. This is the same node anyone can run, so the full walkthrough lives on the community page.",
        more: { label: "Run your own node", href: "/community#run-a-node" },
      },
      {
        title: "Enable the mining profile",
        body: "Choose the mining pool deployment and let the node sync before connecting an ASIC. Use a public 0x reward address you control.",
      },
      {
        title: "Connect the miner",
        body: "An ASIC connects to a Stratum endpoint, not the public JSON-RPC, so it points at the pool your node now runs. Reach it over your local network, then watch for accepted work and the first block credited to your reward address.",
      },
    ],
  },

  /**
   * The agent route, same shape as Community's but for the full path. The
   * brief is generated at /mining-onboarding.md from the canonical network
   * and the latest published stack release.
   */
  agent: {
    title: "Recommended: let an agent do it",
    body: "Install an AI agent on the node, give it access to the machine, and point it at the release. Download the onboarding brief below and hand it over. It collects what only you know, your hardware, your miner's MAC address and your public payout address, then walks the agent through the stack, the pool and the miner.",
    safety:
      "It never needs a seed phrase or a private key. Mining pays out to a public address, and the brief tells the agent to refuse a secret if you offer one.",
    download: {
      label: "Download mining-onboarding.md",
      href: "/mining-onboarding.md",
    },
    linkLabel: "Or give the agent this link",
    url: "https://bdag.community/mining-onboarding.md",
  },

  endpoints: {
    title: "Set up a mining pool",
    release: { label: "Browse stack releases", href: RELEASES_PAGE.href },
    note: "Connect your ASIC to the mining pool's Stratum endpoint. Use the configuration instructions for the stack release you installed and a public 0x reward address you control.",
    support: { label: "Miner details at bdag.co", url: FAMILY_SITES.miners.url },
    more: { label: "Open the chain reference", href: "/chain" },
  },

  /**
   * The alternative to the sequence above: pools run by independent
   * community operators, from the community resource directory
   * (2026-08-13, updated 2026-08-17). Endpoints render as copyable text,
   * never links, because stratum+tcp is a miner's scheme, not a browser's.
   */
  publicPools: {
    title: "Public mining pools",
    lead: "Don't want to run your own node? Join a public mining pool. These pools are run by independent community operators, not by this site. A pool needs the 0x payout address your miner works for and nothing else.",
    items: [
      { name: "BDAG-US East", endpoint: "stratum+tcp://east.bdag-us.org:3334" },
      { name: "BDAG-US West", endpoint: "stratum+tcp://west.bdag-us.org:3334" },
      { name: "CapeDAG", endpoint: "stratum+tcp://pool.capedag.com:3334" },
      { name: "WelshDAG", endpoint: "stratum+tcp://stratum.welshdag.trade:3334" },
    ],
  },

} as const;

/* ---------------------------------------------------------------------------
 * Staking page
 * ------------------------------------------------------------------------- */

export const STAKING_PAGE = {
  eyebrow: "Staking",
  title: "Staking",
  subtitle: "Back the network with stake, no hardware required.",
  intro:
    "Staking will let anyone help secure BlockDAG and earn native rewards. The mechanism lives entirely on chain: epochs, pools, and reward distribution are contract logic, not promises.",
  status: {
    title: "A new way to stake, coming soon",
    body: "We are building a new staking page with a new contract behind it. The release addresses the issues in the current contract and includes a way out of it, so you will be able to unstake, then stake on the new contract and earn rewards going forward. We will announce it here when it is ready.",
    meanwhile: "You can view the Legacy staking contract and registered pools in the explorer.",
  },
  honest: {
    title: "What we will and won't tell you",
    points: [
      "Rewards are variable. No fixed return is promised. Anyone quoting you a guaranteed APY on this network is not speaking for it.",
      "Staking is non-custodial by design: staking and unstaking are wallet-signed actions, and the contract applies the position lifecycle and cooldown rules.",
      "Epochs advance on chain, and rewards follow the contract's schedule, not a marketing calendar.",
    ],
  },
  facts: {
    title: "On-chain facts",
    contractLabel: "Native staking contract",
    poolsLabel: "Registered staking pools",
  },
  how: {
    title: "How the contract works",
    items: [
      {
        title: "Sign from your own wallet",
        body: "Your wallet signs the staking action. The contract receives the stake and records the resulting position.",
      },
      {
        title: "Stake goes into a pool",
        body: "A stake enters a registered pool through the native contract. The minimum is enforced on chain.",
      },
      {
        title: "Earn each epoch",
        body: "Rewards accrue per epoch under the on-chain schedule. Claims and unstaking follow the contract's current rules.",
      },
    ],
  },
} as const;

/* ---------------------------------------------------------------------------
 * FAQ page
 * ------------------------------------------------------------------------- */

/**
 * The questions the community actually fields, answered in the site's own
 * Each answer points to the relevant evidence, guide or setup instructions.
 * Rules that bind this block: no venue endorsements, no fixed-return
 * language, no fork URLs, and the mining answer must carry the key-material
 * safety line reader-side.
 */
export const FAQ_PAGE = {
  eyebrow: "FAQ",
  title: "FAQ",
  subtitle: "The questions the community answers every week.",
  intro:
    "Find out how to use the network, try Testnet and follow the rollout of Staking V2 and community governance.",
  items: [
    {
      id: "is-this-official",
      q: "Is this the official BlockDAG site?",
      a: "bdag.community is an independent site run by the community that has operated the network since Genesis. It is not run by the team or parties that ran the original pre-sales and miner sales. Our goal is to make this chain better together.",
      more: { label: "Ask the operators", href: "/contact" },
    },
    {
      id: "which-chain-is-real",
      q: "Which chain is the real BlockDAG?",
      a: "The canonical network is chain ID 1404, the one this community has run since Genesis. A separate operation runs a fork of it behind a central RPC. The node board reads both live, so you can compare them yourself instead of taking either side's word.",
      long: [
        "The two histories share the same genesis and every block up to 316,001. They split at block 316,002 on 17 February 2026, and from there they carry different balances and different block hashes even though both still answer to chain ID 1404. That is why the chain ID on its own settles nothing.",
        "Two dates get confused, and they describe different events. The block hashes first diverged at block 316,002 on 17 February 2026. The two histories then ran side by side until they separated in operation around 15 July 2026, near block 14,394,144, after which their blocks stopped sharing timestamps and each advanced on its own. Independent community RPCs run by different operators agree on the same live head, while the forked endpoint lags well behind and in recent samples was extended by a single producer address. We describe what the chain records and leave motive to the evidence.",
        "You can check this yourself in about a minute. Ask two independent RPCs for the block hash and state root at the same old block, for example block 13,700,000. Matching values mean a shared history. Different values mean they are not the same chain. The node board runs this comparison for you and shows both sides live.",
      ],
      more: { label: "See the node board", href: "/chain#nodes" },
    },
    {
      id: "different-balances",
      q: "Why does my balance show on one explorer but not another?",
      a: "Because each explorer is a window onto one node's history, and right now two histories both answer to chain ID 1404. The forked endpoint serves a separate, lagging history, so a balance there will not appear on the community chain by switching an RPC setting.",
      long: [
        "The two histories share everything up to block 316,001 and diverge at block 316,002. From there they hold different balances and different transactions. A transaction recorded on one is simply not on the other, which is why the same wallet can read differently depending on which endpoint answers.",
        "There is no automatic import between them. Copying balances across without a defined, audited reconciliation could double count claims or dilute existing holders, so it is not something anyone can or should do by flipping a setting. If you are comparing figures, fix a block and check the block hash and state root on two independent RPCs first.",
      ],
      more: { label: "See the node board", href: "/chain#nodes" },
    },
    {
      id: "which-endpoints",
      q: "Which endpoints should I use?",
      a: "Use the verified Mainnet RPC and explorer on the chain page for chain ID 1404. For testing apps or contracts, use the separate Community Testnet configuration on chain ID 1043.",
      long: [
        "Chain ID 1404 by itself is not enough, because the forked network reports 1404 too. The real check is to compare the block hash and state root at the same old block across two independently run RPCs, or better, to run your own node. The node board does this comparison for you.",
        "Be careful with anyone who asks you to switch your wallet to a different RPC to fix, secure, or upgrade something. Changing your endpoint is the usual way people get quietly routed onto the fork. Take the canonical endpoints from this site yourself rather than from a message.",
      ],
      more: { label: "Get the endpoints", href: "/chain#connect" },
    },
    {
      id: "try-testnet",
      q: "How can I try the Community Testnet?",
      a: "Create a dedicated test wallet, add BDAG Community Testnet (chain ID 1043) and get test BDAG from the faucet. Use the same account to try staking, explore the Development platform and test community apps.",
      more: { label: "Set up your Testnet wallet", href: "/testnet#network" },
    },
    {
      id: "testnet-faucet",
      q: "How do I get test BDAG?",
      a: "Enter your public Testnet wallet address on the faucet page and complete the human verification. The faucet sends 1,000 test BDAG per wallet every 24 hours, subject to its daily cap. Test BDAG has no monetary value.",
      more: { label: "Open the Testnet faucet", href: "/testnet#faucet" },
    },
    {
      id: "testnet-node",
      q: "Can I run a Community Testnet node?",
      a: "Yes. Use the public seed listed on the Testnet page. Ask the team for the current verified Linux AMD64 build, paired snapshot and setup instructions. Verify the package signature, checksums and shared checkpoint before enabling mining.",
      more: { label: "Read the Testnet node instructions", href: "/testnet#nodes" },
    },
    {
      id: "how-to-verify",
      q: "How can I check any of this myself?",
      a: "Do not take a personality's word, check the chain. Fix a checkpoint, a block number with its block hash, its state root, and the time, then ask two independently run RPCs the same question. Chain ID on its own proves nothing, because both histories report chain ID 1404.",
      long: [
        "For a which chain question, compare the block hash and state root at the same old block on several independent RPCs. For an admin power question, read the contract's owner from its storage and look at the functions it actually exposes.",
        "For a claim that funds were taken, ask for the transaction hash and decode who sent what to whom. Being unable to move funds is not the same as someone else moving them. For a claim about a person, remember that an address is not a person without a signed message or other proof. The node board and the community endpoints give you what you need to run these checks.",
      ],
      more: { label: "See the node board", href: "/chain#nodes" },
    },
    {
      id: "can-blocklist-take-coins",
      q: "Can the blocklist owner take, move, or freeze my coins?",
      a: "It can stop a listed address from transacting, but it cannot take your coins. Freezing and confiscation are not the same thing. The blocklist has no function that transfers, spends, seizes, redirects, mints, or burns anyone's balance, and your wallet's own key stays the only key that can sign for it.",
      long: [
        "The complete powers the blocklist exposes are narrow: add or remove an address from the list, do that in batches, and hand the contract's ownership to someone else. The selective list adds one more power, restricting which destinations a flagged sender may use. None of these move funds, and a restricted wallet still has to sign its own transactions.",
        "What gives the list force is miners, not the owner. Enforcing nodes refuse blocked transfers, gas funding, and rewards, and miners adopted that rule through block signalling, met with 1,514 of 2,000 blocks. The owner cannot manufacture that signal by holding the contract.",
        "The stated plan is to move this control to audited community governance, a disclosed multisig with a timelock, then a DAO. Until those on-chain transfers happen, it is a roadmap, not a finished fact.",
      ],
      more: { label: "See the node board", href: "/chain#nodes" },
    },
    {
      id: "can-blocklist-stop-mining",
      q: "Can the blocklist switch off my miner or change difficulty?",
      a: "No. Nothing in the network can disconnect a miner, remove hashpower, ban a machine from the peer to peer network, or change difficulty. The only mining related power is narrow: a reward address on the blocklist can be refused protocol rewards on enforcing nodes, and a miner can simply point their payout at another address that is not listed.",
      long: [
        "This is the same limit as the funds question. The list decides which addresses enforcing nodes will pay and transact with, and nothing more. It cannot reach your equipment, your hashrate, or the mining algorithm.",
        "Because a miner can move to an unblocked payout address, blocking a single pool payout address does not stop that pool from mining. Difficulty, block selection, and the proof of work rules all live in the node software that miners choose to run, not in any admin contract.",
      ],
      more: { label: "Set up a miner", href: "/mining" },
    },
    {
      id: "is-there-a-god-wallet",
      q: "Is there one god wallet that controls everything?",
      a: "No. No single address controls the whole network. The blocklist and the staking contract have different owners, and an ordinary account cannot rewrite the rules, change difficulty, create coins, change the reward split, or spend other people's balances. Real consensus changes only happen when miners choose to run new software.",
      long: [
        "The two administrative roles sit at different externally owned accounts, so owning the blocklist does not give anyone control of staking, and neither one can touch mining rules.",
        "An externally owned account, one with no contract code at the address, does not prove that one person holds one key. It can be operated through multi party signing, a hardware module, or a custodian with multiple approvers. That is a transparency point, not proof of a single controller.",
        "On the specific claim of a hidden admin that restores itself, a legacy administrator address does sit in two predeploy slots, but both hold zero balance, and its one migration step can only run once at a single preset block, so it cannot re-trigger on later blocks. Ownership is ordinary mutable storage and has already been transferred on-chain once, which is the opposite of something hard coded that needs a new chain to change.",
        "The concentration of admin power today is real and acknowledged. The answer to it is to transfer those roles to disclosed, timelocked, audited community governance, and to publish the transactions when it happens.",
      ],
      more: { label: "See the node board", href: "/chain#nodes" },
    },
    {
      id: "how-upgrades-decided",
      q: "How are network upgrades decided? Do I get to vote?",
      a: "Miners signal support for consensus upgrades in the blocks they mine. Each upgrade has a defined signalling window, threshold and activation delay. The Development platform gives eligible miners and stakers a separate way to vote on community proposals.",
      long: [
        "An earlier enforcement upgrade reached 1,514 signals in a 2,000-block window. Check the published release instructions for the parameters of a new upgrade.",
        "A DAO vote can approve a proposal. Changes to consensus rules also follow the network upgrade process.",
      ],
      more: { label: "Read the community governance guide", href: "/guides/dao-and-development" },
    },
    {
      id: "roadmap-to-dao",
      q: "Is control moving to the community?",
      a: "That is the goal of the phased DAO rollout. Phase 1 gives the community a process to propose improvements, review work and vote. You can try the Development platform on Testnet today. The Mainnet release will confirm the roles and permissions that apply in production.",
      long: [
        "Network-wide CORE proposals use both voting groups. The Phase 1 rules combine 70 percent mining support and 30 percent staking support, with each group meeting its own requirements. Mining-only and staking-only proposals go to their respective groups.",
      ],
      more: { label: "Explore the DAO and Development guide", href: "/guides/dao-and-development" },
    },
    {
      id: "earn-voting-power",
      q: "How do I earn DAO voting power?",
      a: "Eligible mining or Staking V2 rewards earned in one epoch give you voting power in the following epoch. Your voting power expires when that voting epoch ends. The Development platform shows your eligibility and available votes. Claiming a voting receipt is optional.",
      more: { label: "See what you can test in Development", href: "/testnet#platforms" },
    },
    {
      id: "is-code-open-source",
      q: "Is the node software open source? Can I run it myself?",
      a: "Yes. The BlockDAG Community Stack source is public. The release page has Linux packages, corresponding source and SHA-256 verification files. You can use them to run your own node and verify the chain yourself.",
      more: { label: "See downloads and source", href: RELEASES_PAGE.href },
    },
    {
      id: "staying-safe",
      q: "How do I keep myself safe, and what should I never do?",
      a: "The community, and any real mining, staking, or claim step, will never ask for your seed phrase, private key, or recovery code. Treat any such request as a scam. Be just as careful with anyone telling you to switch your RPC, migrate, or unstake to secure, upgrade, or claim your BDAG, because that is how people get routed onto the fork or drained. The community will never message you asking you to move your funds.",
      long: [
        "For any wallet action, open the relevant platform from this site and verify the network, destination and action in your wallet before signing. Follow the published Mainnet release instructions for Legacy and V2 staking.",
        "Keep your own records instead of handing over control: your wallet addresses, transaction hashes, the RPC you used, the time you read it, the block number and hash, and any receipts. If you need help with a specific balance or purchase, share those details through a private support channel, never in a public group where anyone can copy them.",
        "For any new migration or claim relating to an old purchase, verify who operates it, which contract it uses and what the eligibility rules are before signing.",
      ],
      more: { label: "Ask the operators", href: "/contact" },
    },
    {
      id: "can-i-stake",
      q: "Can I stake right now?",
      a: "You can try Staking V2 today on Community Testnet, including choosing a pool, staking, unstaking and claiming. Check the staking page for updates on the new Mainnet staking site.",
      more: { label: "Read the staking status", href: "/staking" },
    },
    {
      id: "legacy-staking-withdrawals",
      q: "What happens to my existing Legacy stake?",
      a: "Under the Mainnet rollout plan, Legacy V1 keeps its current contract on chain ID 1404. To withdraw, unstake, wait for the existing unbonding period and claim your available BDAG back to your wallet. If you choose to stake in the separate V2 contract, that starts a fresh bonding period.",
      long: [
        "We tested both flows on the same Community Testnet, including a complete unstake and claim from each contract. The platform shows when each withdrawal becomes available.",
      ],
      more: { label: "Read the Legacy and V2 staking guide", href: "/guides/staking-and-dao" },
    },
    {
      id: "staking-pool-offline",
      q: "Can I withdraw my V2 stake if my mining pool goes offline?",
      a: "Yes. Your V2 position is held by the staking contract. You can request an unstake, wait for any applicable bonding and unbonding periods, then claim through the contract even if the pool stops mining. Future rewards depend on the pool producing eligible blocks.",
      more: { label: "See how V2 withdrawals work", href: "/guides/staking-v2" },
    },
    {
      id: "how-to-mine",
      q: "How do I start mining?",
      a: "BlockDAG is mined with X30 and X100 ASICs pointed at a pool: run your own with the community stack, or join a public pool listed on the mining page. Setup needs a public payout address you control and never a seed phrase or a private key. Treat any request for either as a scam.",
      more: { label: "Set up a miner", href: "/mining" },
    },
    {
      id: "are-rewards-guaranteed",
      q: "Are rewards guaranteed?",
      a: "No. Rewards are variable by design, for mining and staking alike, and nothing on this network promises a fixed return. If someone quotes you a guaranteed rate, that promise is theirs, not the network's.",
      long: [
        "Variable has a concrete meaning here. Mining and staking pay a per-block reward that the protocol sets and steps down on a fixed schedule, and that reward is split between miners and staking. So the rate is bounded and slowly shrinking rather than open ended, and it is never a promised return.",
        "Any daily or weekly figure you see is a rate illustration, not a guaranteed total. The real amount for a period comes from what the blocks actually produced. The supply and emission answers on this page explain the schedule in more detail.",
      ],
      more: { label: "What we will and won't tell you", href: "/staking" },
    },
    {
      id: "current-supply",
      q: "How should I read BDAG supply figures?",
      a: "Check the date, block height and definition behind any supply figure. Issued supply includes the genesis allocation and rewards already created. Effective available supply deducts frozen balances and can change with what the calculation counts as locked.",
      long: [
        "Four different numbers get mixed up, so it helps to separate them. Genesis supply is the 100 billion created at launch. Issued supply is genesis plus all mining and staking rewards actually created. Effective circulating supply is issued supply minus what is frozen, staked, vested, or otherwise unavailable. Maximum supply is the most that current rules could ever produce.",
        "Frozen balances are conditionally excluded, not destroyed. They still exist and could move again if a future community decision unfreezes them, so a good dashboard labels them frozen, never burned.",
      ],
      more: { label: "Watch the live readout", href: "/chain#live" },
    },
    {
      id: "emission-schedule",
      q: "Will BDAG inflate forever?",
      a: "No. New BDAG is created as a mining and staking reward each block, split 70 percent to miners and 30 percent toward staking, and that reward shrinks on a set schedule. Most of the coins that will ever exist are issued in the first twenty to thirty years, and issuance keeps falling after that.",
      long: [
        "The reward steps down by a small fraction after each fixed interval of network blocks, so the drop is gradual rather than a sudden halving. Measured against the effective supply, new issuance is roughly 6.6 percent in the first year and declines from there.",
        "The schedule is driven by block count, not by the calendar, so faster or slower block production shifts the dates. The correct figure for any period is obtained by reading the reward each block actually recorded, not by assuming a flat rate.",
      ],
      more: { label: "Watch the live readout", href: "/chain#live" },
    },
    {
      id: "are-fees-burned",
      q: "Are fees burned? Is BDAG deflationary?",
      a: "Not from what has been reviewed. There is no confirmed protocol path that burns fees, so BDAG should not be called deflationary today. Frozen coins are a separate thing: they are held out of circulation while a freeze is enforced, but they still exist and are not destroyed.",
      long: [
        "Frozen and burned are easy to confuse and are not the same. A frozen balance is conditionally excluded, and it could move again if a future community decision unfreezes it. A real burn means the coins are removed from spendable supply for good, which needs clear code and chain evidence, not just a label.",
        "A supply dashboard done properly keeps these apart, showing issued, available, frozen, staked, vested or escrowed, and irreversibly burned as separate lines. Anyone reporting frozen coins as burned is overstating what happened.",
      ],
      more: { label: "Watch the live readout", href: "/chain#live" },
    },
    {
      id: "where-numbers-come-from",
      q: "Where do this site's numbers come from?",
      a: "Every figure is read by this site's own server. Live chain data needs matching block hashes from independent RPC operators. Indexer-only totals from a chain-matched community explorer stay approximate and never advance the trusted checkpoint by themselves.",
      long: [
        "Every headline figure is tied to a fixed checkpoint: a block number, its block hash, its state root, and the UTC time it was read. Publishing those four things is what lets anyone reproduce the same number on their own node and get the same answer.",
        "Live figures need matching block hashes from independent RPC operators before this site treats them as trusted. A number that comes from only one chain-matched explorer is shown as approximate and never advances the trusted checkpoint on its own.",
      ],
      more: { label: "Watch the live readout", href: "/chain#live" },
    },
    {
      id: "new-sale-or-tge",
      q: "Is another presale or token sale coming?",
      a: "The community runs no token sale and does not speak for any issuer. On the community chain, new BDAG is created only as mining and staking rewards, so there is no community presale, second presale, or token generation event. A sale label by itself does not mint native coins or change the supply rules.",
      long: [
        "No reviewed evidence supports a 300 billion supply figure under the current rules, and the exact lifetime maximum is still being finalised from the code, so treat any hard number with care. Reaching a different native supply would take a consensus change that miners adopt, a hard fork, or a separately defined asset.",
        "If any party advertises a new official BDAG sale, treat it as a separate entity's offer, not as something this community endorses, and verify it independently before sending anything.",
      ],
      more: { label: "Ask the operators", href: "/contact" },
    },
    {
      id: "buy-on-exchange",
      q: "Can I buy BDAG on an exchange?",
      a: "The community plans to explore exchange listings once the DAO and Staking V2 upgrade is stable. This site does not endorse venues. If you are checking an existing BDAG market, verify that the venue supports deposits and withdrawals on the community’s Mainnet using the chain page.",
      long: [
        "The chain ID check is necessary but not enough, because the forked network also reports chain ID 1404. A venue handling real BDAG should pin fixed checkpoints, the genesis hash, the block 316,002 hash, and a recent community head, and verify them against independent RPCs before crediting deposits or releasing withdrawals.",
        "Whether a specific balance or purchase is safe, and whether you can claim, is a separate question that depends on the venue or the original issuer, not on this community. The exchange warning and the claims answer on this page cover that.",
      ],
      more: { label: "Read the exchange warning", href: "/chain#exchange-warning-title" },
    },
    {
      id: "exchange-and-claims",
      q: "I bought BDAG on an exchange, presale, or swap. Is it safe, and can I claim?",
      a: "The community keeps the chain running, but it does not run the exchanges, the original sales, or the claim contracts, so it cannot guarantee an individual balance or promise a claim. Those belong to the venue or the original issuer. Keep your records, and never sign a migration transaction because a chat message told you to.",
      long: [
        "An exchange controls its own customer ledger and decides what it honours. An original sale or claim is an obligation of whoever made and funded it. A technical report can explain why two histories show different data, but it cannot decide who has a contractual entitlement.",
        "Preserve the things that let a case be reconciled later, the wallet addresses, transaction hashes, the RPC used, timestamps, receipts, and your purchase or trade records.",
        "Any legitimate future claim route should publish who is responsible, the exact contract, the snapshot it uses, the eligibility rule, how it funds itself, and a safe way to test before anyone signs anything.",
      ],
      more: { label: "Read the exchange warning", href: "/chain#exchange-warning-title" },
    },
    {
      id: "how-can-i-help",
      q: "How can I help?",
      a: "Test Staking and Development, report what you find, run a node, contribute an article or submit a project. For feedback, tell us which page you were using, what you tried and what happened.",
      more: { label: "Take part", href: "/community#participate" },
    },
    {
      id: "community-built",
      q: "What has the community built?",
      a: "Community projects include explorers, dashboards, mining pools, verification tools and browser gaming. Browse the project directory or submit your own BlockDAG project for review.",
      more: { label: "See community projects", href: "/community/projects" },
    },
  ],
} as const;

/* ---------------------------------------------------------------------------
 * News page
 * ------------------------------------------------------------------------- */

/**
 * The public Articles section. Internal names keep the news_* heritage (the
 * DB table is news_articles, the S3 prefixes are news/*) because those are
 * stable contracts; everything a reader sees says Articles.
 */
export const ARTICLE_CATEGORIES = {
  news: "News",
  update: "Update",
  community: "Community",
  info: "Info",
  projects: "Projects",
} as const;

export type ArticleCategory = keyof typeof ARTICLE_CATEGORIES;

export const NEWS_PAGE = {
  eyebrow: "Articles",
  title: "Articles",
  subtitle: "Transparent and informative, in writing.",
  intro:
    "Network updates, incidents, decisions, and milestones, written by the people operating the chain.",
  empty: "No articles yet. The first updates are being written.",
  /** Byline labels (2026-08-13). Provenance comes from the moderation
   *  column, never from whether a name happens to be set: an admin article
   *  with a byline must not read as a community submission. */
  publishedByCommunity: "Published by community member",
  publishedByCommunityAnon: "Published by a community member",
  publishedBy: "Published by",
  publishedByAdmin: "Published by admin",
  share: {
    title: "Share this article",
    /** CopyRef's accessible label for the canonical article URL. */
    copyLabel: "article link",
  },
  submission: {
    cta: { label: "Write an article", href: "/articles/submit" },
    invitation:
      "Have something useful to share with the BlockDAG community? Submit it for review.",
    metadataTitle: "Submit an article",
    metadataDescription:
      "Submit an article to BDAG Community as a private draft for an admin to review before publication.",
    title: "Write",
    subtitle: "Bring a useful story to the community.",
    intro:
      "Share an update, explanation, lesson, or point of view. Your submission stays private until an admin reviews and publishes it.",
    backLabel: "Back to articles",
    backHref: "/articles",
    artLabel: "article",
    reviewTitle: "How publishing works",
    formTitle: "Submit your draft",
    reviewBody:
      "Submitting creates a private draft. An admin can review and edit it, and only an admin can publish it on the site.",
    reviewNote:
      "You may add one optional cover image. It stays private in quarantine until the moderation workflow accepts it.",
    form: {
      optional: "Optional",
      authorNameLabel: "Your name or username",
      titleLabel: "Article title",
      subtitleLabel: "Subtitle",
      descriptionLabel: "Summary",
      descriptionHint:
        "A short description for the articles list and search results.",
      bodyLabel: "Article body",
      bodyHint:
        "Use the toolbar to format headings, emphasis, links, quotations, lists, and buttons. The square-arrow tool adds a button with your own text and link.",
      coverImageLabel: "Cover image",
      coverImageHint:
        "Optional. Choose one JPEG, PNG, or WebP image up to 5 MiB. The original remains private and is never published directly.",
      assetAltTextLabel: "Cover image description",
      assetAltTextHint:
        "Optional for submission. Describe the image for readers who cannot see it. An admin must provide this before publishing the image.",
      assetUploadUploading:
        "Your private draft is saved. Uploading the cover image to private quarantine.",
      assetUploadComplete:
        "Your private draft and cover image are saved for admin review. The image is not public.",
      assetUploadFailed:
        "Your private draft was saved, but the cover image was not uploaded. Do not resubmit the article. An admin can add an image later.",
      conduct:
        "Keep submissions respectful and suitable for a public community site. We do not publish obscene content, vulgar language, hate speech, harassment, threats, sexually explicit material, or personal attacks.",
      safety:
        "Never include a seed phrase, private key, password, recovery code, or personal information you do not want published.",
      privacy:
        "Your article and your chosen name or username, if supplied, become public only if an admin publishes the draft.",
      submitLabel: "Submit for review",
      success:
        "Article submitted as a private draft. An admin must review and publish it before it appears on the site.",
      failure:
        "Your article was not submitted. The review inbox is not connected yet or could not be reached. Your text is still in the form.",
      honeypotLabel: "Website",
      validation: {
        authorNameMax:
          "Please keep the name or username under 120 characters.",
        titleMin: "Please write a title of at least 5 characters.",
        titleMax: "Please keep the title under 200 characters.",
        subtitleMax: "Please keep the subtitle under 300 characters.",
        descriptionMin: "Please write a summary of at least 20 characters.",
        descriptionMax: "Please keep the summary under 1,000 characters.",
        bodyMin: "Please write at least 100 characters for the article body.",
        bodyMax: "Please keep the article body under 50,000 characters.",
        assetType: "Choose a JPEG, PNG, or WebP cover image.",
        assetSize: "Keep the cover image at or below 5 MiB.",
        assetAltTextMax:
          "Please keep the cover image description under 300 characters.",
      },
    },
  },
} as const;

/**
 * Community project categories. Same discipline as ARTICLE_CATEGORIES: a
 * closed set that must agree with the check constraint in
 * 0011_community_projects.sql, shown as a label on every project card.
 */
export const PROJECT_CATEGORIES = {
  utility: "Utility",
  infrastructure: "Infrastructure",
  information: "Information",
  tooling: "Tooling",
  community: "Community",
} as const;

export type ProjectCategory = keyof typeof PROJECT_CATEGORIES;

/**
 * The Info | Projects switch at the top of the two community views. It is a
 * pair of links, not client state: each view is its own route, so the switch
 * survives reloads, deep links, and crawlers.
 */
export const COMMUNITY_VIEW_SWITCH = {
  label: "Community view",
  items: [
    { key: "info", label: "Info", href: "/community" },
    { key: "projects", label: "Projects", href: "/community/projects" },
  ],
} as const;

export const PROJECTS_PAGE = {
  eyebrow: "Projects",
  title: "Projects",
  subtitle: "Built by the community, for the chain.",
  intro:
    "Explorers, dashboards, pools, and tools that people in this community run for BlockDAG Network. Every listing was submitted, vetted, and published by hand.",
  empty: "No projects are listed yet. The first submissions are being reviewed.",
  /** Screen-reader heading over the grid, so the outline never jumps from
   *  the page h1 straight to the h3 card names. */
  listHeading: "Community projects",
  /** Card CTA line. The whole card links out to the project itself. */
  visitLabel: "Visit project",
  submittedBy: "Submitted by",
  submission: {
    cta: { label: "Submit your project", href: "/community/projects/submit" },
    invitation:
      "Built something useful for the BlockDAG community? Add it to the showcase.",
    metadataTitle: "Submit a project",
    metadataDescription:
      "Submit a community project to BDAG Community as a private entry for an admin to vet before it is listed.",
    title: "Submit",
    subtitle: "Show the community what you built.",
    intro:
      "Tell us what your project does and where it lives. Your submission stays private until an admin reviews and publishes it.",
    backLabel: "Back to projects",
    backHref: "/community/projects",
    artLabel: "project",
    reviewTitle: "How listing works",
    formTitle: "Tell us about your project",
    reviewBody:
      "Submitting creates a private entry. An admin reviews it, may adjust the wording or category, and only an admin can publish it to the showcase.",
    reviewNote:
      "You may add one optional project image. It stays private in quarantine until the moderation workflow accepts it.",
    form: {
      optional: "Optional",
      nameLabel: "Project name",
      urlLabel: "Project link",
      urlHint: "The https address people should visit.",
      categoryLabel: "Category",
      categoryHint: "Pick the closest fit. An admin can adjust it during review.",
      authorNameLabel: "Your name or username",
      descriptionLabel: "Description",
      descriptionHint:
        "What the project does and why it helps, up to 200 characters. This is the text on the card.",
      coverImageLabel: "Project image",
      coverImageHint:
        "Optional. Choose one JPEG, PNG, or WebP image up to 5 MiB. It is processed into a 16 by 9 card image and the original stays private.",
      assetAltTextLabel: "Image description",
      assetAltTextHint:
        "Optional for submission. Describe the image for readers who cannot see it. An admin must provide this before publishing the image.",
      assetUploadUploading:
        "Your private entry is saved. Uploading the project image to private quarantine.",
      assetUploadComplete:
        "Your private entry and project image are saved for admin review. The image is not public.",
      assetUploadFailed:
        "Your private entry was saved, but the project image was not uploaded. Do not resubmit the project. An admin can add an image later.",
      conduct:
        "Keep submissions respectful and suitable for a public community site. We do not list projects that mislead users, promise returns, or impersonate other services.",
      safety:
        "Never include a seed phrase, private key, password, recovery code, or personal information you do not want published.",
      privacy:
        "Your project details and your chosen name or username, if supplied, become public only if an admin publishes the entry.",
      submitLabel: "Submit for review",
      success:
        "Project submitted as a private entry. An admin must review and publish it before it appears in the showcase.",
      failure:
        "Your project was not submitted. The review inbox is not connected yet or could not be reached. Your text is still in the form.",
      honeypotLabel: "Website",
      validation: {
        nameMin: "Please write a project name of at least 2 characters.",
        nameMax: "Please keep the project name under 80 characters.",
        descriptionMin: "Please write a description of at least 20 characters.",
        descriptionMax: "Please keep the description under 200 characters.",
        urlInvalid: "Please give the full https address of the project.",
        urlMax: "Please keep the project link under 300 characters.",
        authorNameMax:
          "Please keep the name or username under 120 characters.",
        categoryInvalid: "Pick one of the listed categories.",
        assetType: "Choose a JPEG, PNG, or WebP project image.",
        assetSize: "Keep the project image at or below 5 MiB.",
        assetAltTextMax:
          "Please keep the image description under 300 characters.",
      },
    },
  },
} as const;

export const ADMIN_NEWS_COPY = {
  communitySubmission: "Community submission",
  optional: "Optional",
  categoryLabel: "Category",
  categoryHelp: "Shown as a label on the public article and its cards.",
  categoryInvalid: "Pick one of the listed categories.",
  authorNameLabel: "Author name or username",
  authorNameHelp: "Optional. This appears beneath the public article title.",
  authorNameMax: "Keep the author name or username under 120 characters.",
  bodyLabel: "Body",
  bodyHelp:
    "Use the toolbar to format headings, emphasis, links, quotations, lists, and buttons. The square-arrow tool adds a button with your own text and link.",
  bodyTooLong: "The article body is too long.",
  bodyEmpty: "The article body is empty.",
  descriptionRequired: "A description is required before publishing.",
  bodyRequired: "An article body is required before publishing.",
  titleRequired: "A title is required.",
  slugRequired: "A slug is required.",
  slugInvalid: "Slugs use lowercase letters, digits, and single hyphens.",
  subtitleMax: "Keep the subtitle under 300 characters.",
  descriptionMax: "Keep the description under 1,000 characters.",
  checkValues: "Please check the form values.",
  slugTaken: "That slug is already in use. Pick another.",
  saveFailed: "The article could not be saved. Try again, or sign out and back in.",
  saved: "Article changes saved.",
  createCoverTitle: "Cover image",
  createCoverHint:
    "Choose a cover while creating the article. The draft is saved first, then the image uploads to private quarantine for review. It will not be published automatically.",
  createCoverUploading: "Article draft saved. Uploading the private cover now…",
  createCoverSaved: "The article draft has been saved.",
  createCoverFailed:
    "The article draft was saved, but its cover did not finish uploading. Open the saved article to retry. Do not create the article again.",
  invalidId: "Invalid article id.",
  deleteFailed:
    "The article could not be deleted. Unpublish it and clean up its image first.",
  assetModeration: {
    sectionTitle: "Cover image moderation",
    sectionIntro:
      "Processed covers stay private here while an admin reviews them. Publishing the article is a separate decision.",
    publicationTitle: "Publication",
    draftStatus: "Private draft",
    publishedStatus: "Published",
    publishTextOnly: "Publish without a cover",
    publishWithCover: "Publish with this cover",
    replacePublishedCover: "Replace the published cover",
    unpublish: "Unpublish article",
    replacementTitle: "Add or replace the cover",
    replacementBody:
      "Choose one JPEG, PNG, or WebP image up to 5 MiB. The original goes directly to private quarantine and never passes through the application server.",
    replacementLabel: "New cover image",
    replacementHint:
      "A current published cover stays live until you approve and publish its replacement.",
    replacementAltLabel: "Cover image description",
    replacementAltHint:
      "Optional now. A meaningful description of at least 5 characters is required before approval.",
    replacementUpload: "Upload private cover",
    replacementUploading: "Uploading private cover",
    replacementReady: "The private cover upload is ready.",
    replacementProcessed:
      "The cover upload and processing finished. Review the preview below.",
    replacementProcessing:
      "The cover upload finished and processing is still running. Use Sync processor result shortly.",
    replacementInvalid: "Choose a supported cover image up to 5 MiB.",
    replacementUnavailable:
      "Private cover uploads are not configured on this environment.",
    replacementFailed: "The private cover upload could not be started.",
    replacementPutFailed:
      "The private upload did not finish. Choose the image again to create a fresh upload.",
    noAssets: "No cover has been submitted for this article.",
    /** Shown instead of the preview when the cover's stored files live in
     *  the other environment's bucket. One database serves both the local
     *  review stack and bdag.community, but each runs against its own S3
     *  bucket, so a cover is only previewable, approvable, and publishable
     *  from the environment it was uploaded in. Without this message the
     *  admin just sees a broken image and a publish button that fails. */
    environmentMismatch:
      "This cover was uploaded from the {assetEnvironment} environment, so its image files live in that environment's private bucket. This admin runs in the {runtimeEnvironment} environment and cannot preview, approve, or publish it. Open the article in the {assetEnvironment} admin to manage this cover, or upload it again from here to use it in this environment.",
    environmentNames: {
      development: "local review (development)",
      production: "production (bdag.community)",
    },
    candidateLabel: "Cover candidate",
    statusLabel: "Status",
    createdLabel: "Submitted",
    processedLabel: "Processed",
    dimensionsLabel: "Processed sizes",
    previewAlt: "Processed cover image preview",
    previewUnavailable: "A processed preview is not available yet.",
    processorReasonLabel: "Processor result",
    reviewReasonLabel: "Admin review note",
    replacementAfterFailure:
      "This candidate cannot be published. Upload a new private cover to continue.",
    awaitingUploadHelp:
      "If this status remains after a minute, the browser upload did not finish. Choose the image again to retry.",
    deleteDescription:
      "Deleting removes the article and its exact managed image versions. There is no undo.",
    deleteUnpublishFirst:
      "Unpublish this article before deleting it.",
    deleteStorageFailed:
      "The managed images could not be cleaned up, so the article was not deleted.",
    failureLabels: {
      animated_image: "Animated images are not accepted.",
      decode_failed: "The image could not be decoded safely.",
      dimensions_exceeded: "The image dimensions exceed the accepted limit.",
      file_too_large: "The uploaded object exceeds the accepted size.",
      malformed_container: "The image container is malformed.",
      metadata_not_stripped: "The processed image retained disallowed metadata.",
      output_limit: "A safe derivative could not be produced within the size limit.",
      pixel_limit_exceeded: "The decoded image exceeds the accepted pixel limit.",
      size_mismatch: "The uploaded object size does not match the submission.",
      type_mismatch: "The detected image type does not match the submission.",
      unsupported_type: "The uploaded object is not a supported image type.",
      unknown: "The image processor rejected this candidate.",
    },
    syncLabel: "Sync processor result",
    syncingLabel: "Syncing processor result",
    approveLabel: "Approve cover",
    approvingLabel: "Approving cover",
    rejectLabel: "Reject cover",
    rejectingLabel: "Rejecting cover",
    altLabel: "Approved cover description",
    altHint:
      "Describe the purpose or important content of the image for readers who cannot see it.",
    reasonLabel: "Rejection reason",
    reasonHint: "Record why this cover is not suitable for publication.",
    working: "Saving moderation decision",
    actionFailed: "The moderation action could not be completed.",
    stateLabels: {
      awaiting_presign: "Waiting for upload approval",
      awaiting_upload: "Waiting for file upload or processing",
      processing: "Processing",
      ready: "Ready for review",
      approved: "Approved",
      rejected: "Rejected by an admin",
      failed: "Processor rejected this image",
      published: "Published cover",
      superseded: "Superseded",
    },
    notFound: "The cover image record could not be found.",
    synced: "The processor result is ready for review.",
    syncFailed: "The processor result could not be verified yet.",
    altRequired: "Write a meaningful cover image description of at least 5 characters.",
    approveFailed: "The cover image could not be approved.",
    approved: "Cover image approved.",
    reasonRequired: "Write a rejection reason of at least 5 characters.",
    rejectFailed: "The cover image could not be rejected.",
    rejected: "Cover image rejected. The article text is unchanged.",
    publishFailed: "The article could not be published.",
    published: "Article published.",
    unpublishFailed: "The article could not be unpublished.",
    unpublished: "Article unpublished.",
  },
} as const;

/**
 * Admin copy for the projects workflow. The asset moderation block reuses
 * ADMIN_NEWS_COPY.assetModeration wholesale (the cover pipeline is the same
 * machinery) and overrides only the strings that name the content type, so
 * the two panels can never drift apart on the shared mechanics.
 */
export const ADMIN_PROJECTS_COPY = {
  communitySubmission: "Community submission",
  optional: "Optional",
  nameLabel: "Project name",
  nameInvalid: "A project name of 2 to 80 characters is required.",
  urlLabel: "Project link",
  urlHelp: "The public https address the showcase card links to.",
  urlInvalid: "The project link must be a full https address.",
  categoryLabel: "Category",
  categoryHelp: "Shown as a label on the public project card.",
  categoryInvalid: "Pick one of the listed categories.",
  descriptionLabel: "Description",
  descriptionHelp: "The card text, up to 200 characters.",
  descriptionInvalid: "A description of 20 to 200 characters is required.",
  authorNameLabel: "Author name or username",
  authorNameHelp: "Optional. Shown as the submitter on the public card.",
  authorNameMax: "Keep the author name or username under 120 characters.",
  checkValues: "Please check the form values.",
  saveFailed: "The project could not be saved. Try again, or sign out and back in.",
  saved: "Project changes saved.",
  invalidId: "Invalid project id.",
  deleteFailed:
    "The project could not be deleted. Unpublish it and clean up its image first.",
  assetModeration: {
    ...ADMIN_NEWS_COPY.assetModeration,
    sectionIntro:
      "Processed images stay private here while an admin reviews them. Publishing the project is a separate decision.",
    environmentMismatch:
      "This image was uploaded from the {assetEnvironment} environment, so its files live in that environment's private bucket. This admin runs in the {runtimeEnvironment} environment and cannot preview, approve, or publish it. Open the project in the {assetEnvironment} admin to manage this image, or upload it again from here to use it in this environment.",
    rejected: "Image rejected. The project entry is unchanged.",
    publishTextOnly: "Publish without an image",
    publishWithCover: "Publish with this image",
    replacePublishedCover: "Replace the published image",
    unpublish: "Unpublish project",
    noAssets: "No image has been submitted for this project.",
    candidateLabel: "Image candidate",
    deleteDescription:
      "Deleting removes the project and its exact managed image versions. There is no undo.",
    deleteUnpublishFirst: "Unpublish this project before deleting it.",
    deleteStorageFailed:
      "The managed images could not be cleaned up, so the project was not deleted.",
    publishFailed: "The project could not be published.",
    published: "Project published.",
    unpublishFailed: "The project could not be unpublished.",
    unpublished: "Project unpublished.",
  },
} as const;

export const COMMUNITY_GUIDE_COPY = {
  title: "Community guides",
  description: "Explore the planned Staking V2 and DAO experience: a community guide with FAQs and two visual journeys you can read or download.",
  eyebrow: "Learn what comes next",
  intro: "A simple introduction to Staking V2, community governance and the platforms being built around them. Read the guides here or keep a PDF to share.",
  notice: "These guides describe the planned Mainnet experience. Final launch details will be published with the release.",
  visualJourney: "Visual journey",
  guideAndFaq: "Guide and FAQ",
  page: "page",
  pages: "pages",
  read: "Read guide",
  readPrefix: "Read ",
  back: "All community guides",
  planned: "Planned Mainnet experience",
  openPdf: "Open PDF",
  newTab: " (new tab)",
  downloadPdf: "Download PDF",
  readText: "Read as text",
  preview: "Document preview",
  pagePrefix: "Page",
  of: "of",
  reading: "Reading view",
  readingHelp: "The guide in a text-friendly format, for smaller screens and screen readers.",
  related: "Related community guides",
} as const;

export const RICH_TEXT_COPY = {
  toolbarSuffix: " formatting",
  heading2: "Heading 2",
  heading3: "Heading 3",
  bold: "Bold",
  italic: "Italic",
  underline: "Underline",
  bulletList: "Bulleted list",
  orderedList: "Numbered list",
  quotation: "Quotation",
  link: "Link",
  linkPrompt: "Link address",
  linkInvalid: "Enter a valid web, email, site-relative, or page link.",
  button: "Insert or edit button",
  buttonText: "Button text",
  buttonUrl: "Button link",
  buttonHelp: "Use a full https:// address or a site path such as /guides/staking-v2. Buttons open in a new tab. Select an existing button, then use this tool to edit or remove it.",
  buttonTextInvalid: "Enter button text (1–120 characters).",
  buttonUrlInvalid: "Enter a valid http:// or https:// link, a site path starting with /, or a page anchor starting with #. Do not include spaces or login details.",
  insertButton: "Insert button",
  updateButton: "Update button",
  removeButton: "Remove button",
  cancelButton: "Cancel",
  undo: "Undo",
  redo: "Redo",
  readySuffix: " rich text editor ready.",
} as const;

export const ABUSE_PROTECTION_COPY = {
  label: "Human verification",
  privacy:
    "Cloudflare Turnstile checks this submission for automated abuse. We do not send your form text, name, or email address to Turnstile.",
  privacyLinkLabel: "Read Cloudflare's Turnstile privacy information.",
  privacyUrl: "https://www.cloudflare.com/turnstile-privacy-policy/",
  retention:
    "We keep only a one-way connection identifier and counter, and delete each counter within 24 hours after its window closes.",
  javascriptRequired:
    "JavaScript is required to complete human verification. Nothing was submitted or sent without it.",
  verificationRequired:
    "Complete human verification and submit the form again. Nothing was submitted or sent.",
  expired:
    "Human verification expired. Complete it again before submitting.",
  unavailable:
    "Human verification is unavailable. Nothing was submitted or sent. Please try again later.",
  rateLimited:
    "Too many submissions were received from this connection. Nothing was submitted or sent. Please try again later.",
  payloadTooLarge:
    "This submission is too large to process. Nothing was submitted or sent.",
} as const;

/* ---------------------------------------------------------------------------
 * Contact page
 * ------------------------------------------------------------------------- */

export const CONTACT_PAGE = {
  eyebrow: "Contact",
  title: "Contact",
  subtitle: "Talk to the people running the network.",
  intro:
    "Questions about the network, mining, staking, or participation? Need to verify something for an exchange or integration? Send a message for community operators to review.",
  form: {
    nameLabel: "Your name",
    emailLabel: "Email address",
    topicLabel: "Topic",
    /** These strings ARE the stored values: contact/actions.ts builds its
     *  z.enum() straight from this tuple, so a row already in the database
     *  keeps whatever wording was current when it was written. */
    topics: [
      "General",
      "Mining",
      "Staking",
      "Development",
      "Gaming",
      "Exchanges and integrators",
      "Press",
      "AMA",
    ],
    messageLabel: "Message",
    safety: "Never send a seed phrase, private key, password, or recovery code.",
    privacy:
      "Your name, email, topic, and message are used only to review and respond to this enquiry.",
    submitLabel: "Send message",
    success: "Message received. Thank you.",
    failure: "We could not store your message. Please try again later.",
  },
  channelsTitle: "Official contact routes",
  emailPending:
    "Email the community directly at hello@bdag.community.",
} as const;

/* ---------------------------------------------------------------------------
 * 404
 *
 * Rendered by BOTH not-found routes: the one inside the (public) group (which
 * catches /news/<retired-slug>, the realistic case, since news/[slug] calls
 * notFound()) and the ROOT one, which catches everything the group never
 * matches — a mistyped path, a link to a page that never existed. Before the
 * root route existed those landed on Next's stock white page: no header, no
 * footer, no way back into the site.
 *
 * This copy used to live inside not-found.tsx as a deliberate house-rule
 * exception, because site.ts was owned by one agent during the pass that wrote
 * that page. It belongs here, so here it is.
 * ------------------------------------------------------------------------- */

export const NOT_FOUND_PAGE = {
  eyebrow: "404",
  title: "That page is not here",
  intro:
    "The link may be old, or the piece it pointed at may have been taken down. Everything this site publishes is on one of these pages.",
  linksTitle: "Where to go instead",
  home: "Back to home",
} as const;

/* ---------------------------------------------------------------------------
 * Route loading and recoverable error boundaries
 * ------------------------------------------------------------------------- */

export const ROUTE_STATES = {
  public: {
    loading: "Loading this page",
    eyebrow: "Page unavailable",
    title: "This page could not load",
    body: "The rest of the site is still available. Try this page again, or return home.",
    retry: "Try again",
    home: "Back to home",
  },
  admin: {
    loading: "Loading the admin view",
    eyebrow: "Admin view unavailable",
    title: "This admin view could not load",
    body: "Try the request again. If it keeps failing, keep the reference below for diagnosis.",
    retry: "Try again",
    home: "Back to the public site",
  },
  reference: "Reference",
} as const;

/* Shared Community Testnet. Public wallet data only; node admission stays private. */
export const TESTNET = {
  title: "Testnet",
  subtitle: "Try what comes next, together",
  intro: "Our shared testing ground for Staking V2, community governance and apps built on BlockDAG. Explore the platforms, try the journeys and help us improve them before Mainnet.",
  description: "Connect to BDAG Community Testnet, try Staking V2 and DAO proposals, and find the network configuration and node access steps for chain 1043.",
  notice: "Test BDAG has no monetary value. This is a separate network from Mainnet. Use a dedicated test wallet and never send real BDAG to it.",
  network: {
    name: "BDAG Community Testnet", chainId: 1043, chainIdHex: "0x413",
    currency: { name: "Test BDAG", symbol: "BDAG", decimals: 18 },
    rpcUrl: "https://testnet-staking.bdag.co/rpc",
    fallbackRpcUrl: "https://testnet-api.bdag.co/rpc",
    nativeGenesis: "0x06d7950592aa0319de5e81bc29a7ac283010274a5ca2561f319ab1bdb8b222df",
    evmGenesis: "0x58d97c1c16a3ff988105c2bd101b2f473103cc2ef7106ade3296647de65a1663",
    evmGenesisStateRoot: "0xba6c20f5d0f78f8f636d6f96888608b06e81398efb2f5b8163c695229d8e4488",
  },
  setup: {
    eyebrow: "Your wallet, connected",
    title: "Add the testing network",
    body: "Use the button in a browser with MetaMask, or add the network manually with the details alongside it. On a phone, open this page inside MetaMask’s browser.",
    add: "Add to MetaMask", pending: "Check your wallet…",
    sent: "Network details sent to your wallet. Complete its prompt, then select BDAG Community Testnet.",
    manual: "Manual setup works too: in MetaMask, open Networks → Add a custom network and enter these values. The currency symbol is BDAG. The network name and chain ID distinguish these test coins from Mainnet.",
    steps: [
      { title: "Use a test account", body: "Create a fresh account, or import the test wallet you received privately from the team. Keep its private key or recovery phrase to yourself." },
      { title: "Add chain 1043", body: "Approve the network details in your wallet. Select BDAG Community Testnet before connecting to either testing platform." },
      { title: "Get test BDAG", body: "Request test funds from the faucet below, then connect to a platform. You can use the same account for Staking and Development." },
    ],
    explorer: "There is no dedicated Testnet explorer yet. Leave the explorer field blank and use your wallet’s Activity view for transaction details. Mainnet explorers do not show this chain.",
  },
  labels: { name: "Network name", chain: "Chain ID", currency: "Currency symbol", rpc: "Primary RPC", fallback: "Alternative RPC", fingerprint: "Network fingerprint", nativeGenesis: "Native genesis hash", genesis: "EVM genesis hash", stateRoot: "Genesis state root" },
  platformsTitle: "Put it to the test",
  platformsIntro: "Both platforms use the same network and account. Every balance, stake and proposal here is for testing.",
  platforms: [
    { kind: "staking", title: "Staking", tag: "Legacy + Staking V2", body: "Choose a pool, stake test BDAG, follow rewards and try unstaking and claiming. Existing Legacy positions can exit on the same network while your new V2 stake stays separate.", href: "https://testnet-staking.bdag.co/", cta: "Try Staking", detail: "New V2 stakes start their own bonding period. The app reads the waiting periods from the chain." },
    { kind: "development", title: "Development", tag: "Community proposals + DAO", body: "Explore proposals, check earned voting power and try the community review process. Register as a developer, follow decisions and see how accepted work moves forward.", href: "https://testnet-development.bdag.co/", cta: "Try Development", detail: "Voting power comes from eligible rewards. It becomes usable in the following voting epoch and expires when that epoch ends." },
  ],
  operators: {
    eyebrow: "Help run the network", title: "Bring a node to Testnet",
    body: "Connect through our public seed without ZeroTier or individual peer approval. Get the verified Testnet build and paired chain snapshot from the team, then follow its installation guide.",
    publicSeed: "/ip4/154.70.222.46/tcp/18160/p2p/16Uiu2HAmD78L3GVeqrXN4M2nk9fRmYZxrNC9vddWY5W2mbpSir2Z",
    steps: [
      { title: "Prepare your device", body: "Use a supported Linux AMD64 device with an SSD and enough space for both chain databases. Keep your node identity and backups private." },
      { title: "Receive the current package", body: "The team supplies the approved build, verification details and setup instructions for this network. Verify the signature and checksums before installing." },
      { title: "Join and verify", body: "Connect to the public seed below, then verify the genesis and a shared checkpoint. Keep mining disabled until synchronization and mining checks pass." },
    ],
    cta: "Ask about running a node", href: "/contact",
    note: "This is a node-to-node connection, not a wallet RPC. The verified package and paired snapshot are supplied by the team. Downloads are not yet self-service. Existing nodes can keep their configuration. The X30 continues mining for now. CPU and GPU mining will be qualified separately.",
  },
  feedback: { title: "Help make the next release better", body: "Collect your findings in one message: the page, steps you followed, what you expected and what happened. Include your browser and transaction hash when available. Never include a private key or recovery phrase.", cta: "Send feedback", href: "/contact" },
  link: { title: "Try it on Testnet", body: "Explore Staking V2 and the Development platform with test BDAG. Wallet setup and access details are on our Testnet page.", cta: "Explore Testnet", href: "/testnet" },
} as const;
