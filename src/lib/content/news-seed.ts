import type { NewsArticle } from "@/lib/news";

/**
 * Code-managed articles — remain public alongside published database rows.
 * These are real, verifiable community events. A published database article
 * with the same slug overrides its version here; other articles can be
 * created and managed through /admin.
 */
export const NEWS_SEED: NewsArticle[] = [
  {
    slug: "six-months-from-genesis",
    category: "info",
    title: "BlockDAG Mainnet since Genesis",
    subtitle: "A simple guide to the public chain record",
    description:
      "BlockDAG Mainnet began on 10 February 2026. Its public record lets anyone inspect blocks, transactions, addresses, and contract activity.",
    body: [
      "BlockDAG Mainnet began with block 0 on 10 February 2026 at 22:03 UTC. The timestamp comes from the canonical chain record.",
      "The explorer lets anyone inspect blocks, transaction hashes, wallet activity, and contract events. Counts change as the chain grows, so this site shows live figures instead of freezing them into an article.",
      "When accuracy matters, use the canonical explorer and RPC endpoint. Chain ID 1404 is one check, but it cannot identify the correct history by itself. Compare block hashes before relying on balances or deposits.",
    ].join("\n\n"),
    bodyHtml: null,
    imageUrl: "/news-from-genesis.webp",
    imageSrcSet: null,
    imageAlt: "",
    authorName: null,
    submittedByCommunity: false,
    publishedAt: "2026-08-05T09:00:00Z",
  },
  {
    slug: "canonical-endpoints-for-exchanges",
    category: "info",
    title: "Exchanges: use the canonical endpoints",
    subtitle: "A practical check before deposits and withdrawals",
    description:
      "Exchange and custody integrations should use the canonical RPC endpoint, confirm chain ID 1404, and compare block hashes before moving funds.",
    body: [
      "Use the live Mainnet wallet configuration at https://bdag.community/chain#connect for the currently verified RPC endpoints and explorer.",
      "Start by checking eth_chainId for 1404. Then compare recent and historical block hashes. Chain ID 1404 is necessary but not sufficient because another network can reuse the same number.",
      "Pin the approved endpoints in configuration, monitor the chain head, and pause deposits if block hashes diverge. Test a small transfer before opening normal deposits or withdrawals.",
    ].join("\n\n"),
    bodyHtml: null,
    imageUrl: "/news-exchanges.webp",
    imageSrcSet: null,
    imageAlt: "",
    authorName: null,
    submittedByCommunity: false,
    publishedAt: "2026-07-28T09:00:00Z",
  },
  {
    slug: "x30-x100-miners-available",
    category: "info",
    title: "X30 and X100 miners: what to check",
    subtitle: "Hardware details, pool setup, and buyer checks",
    description:
      "Before buying an X30 or X100 miner, confirm current specifications and terms at bdag.co, then choose a pool that follows canonical Mainnet.",
    body: [
      "bdag.co is the maintained source for X30 and X100 availability, specifications, pricing, manufacturing terms, shipping, and import costs. Check those details before you buy.",
      "These ASIC miners connect to a pool through Stratum. They do not connect to the public JSON-RPC endpoint. Pool setup needs a 0x payout address, never a seed phrase or private key.",
      "Before running a miner, confirm the pool follows canonical BlockDAG Mainnet. Review its fees and payout rules, then watch the first payouts before leaving the device unattended.",
    ].join("\n\n"),
    bodyHtml: null,
    imageUrl: "/news-miners.webp",
    imageSrcSet: null,
    imageAlt: "",
    authorName: null,
    submittedByCommunity: false,
    publishedAt: "2026-07-24T09:00:00Z",
  },
  {
    slug: "staking-what-it-is-and-isnt",
    category: "info",
    title: "Native staking: what it is and what it isn't",
    subtitle: "How contract staking works and what to verify",
    description:
      "Native BDAG staking uses an on-chain contract for pools, rewards, claims, cooldowns, and unstaking. Rewards are variable and never guaranteed.",
    body: [
      "Native staking is an on-chain interaction with the staking contract. You choose a registered pool and review each wallet request. Every action is wallet-signed.",
      "The contract governs the position, including rewards, claims, cooldowns, and unstaking. Rewards are variable. Native staking is not a fixed-return product, a risk-free savings account, or an off-chain promise.",
      "Before staking, verify the contract address and pool on the staking page. Keep enough BDAG for transaction fees, read each wallet prompt, and remember that smart-contract and network risk still apply.",
    ].join("\n\n"),
    bodyHtml: null,
    imageUrl: "/news-staking.png",
    imageSrcSet: null,
    imageAlt: "Stacked digital coins illuminated by a violet beam in a dark hall.",
    authorName: null,
    submittedByCommunity: false,
    publishedAt: "2026-07-15T09:00:00Z",
  },
];
