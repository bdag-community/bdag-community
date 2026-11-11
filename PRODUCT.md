# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Next.js 16 (App Router, standalone output) + React 19 + Tailwind CSS 3.4 + TypeScript, motion v12 for animation, lightweight Supabase (content workflows + admin auth + shared last-known-good chain telemetry), plus a server-only Resend adapter for suggestion email. Deliberately mirrors the bdag-miner-sales stack minus its entire wallet/web3 layer — v1 ships no wallet connect. Docker deploy behind Caddy (same ops pattern as bdag-miner-sales); dev port 3002, compose port 3011.

## Users

- **Community members** (engineers, enthusiasts, developers, miners, stakers) who already hold BDAG or run hardware, arriving to check network status, news, and how to participate more.
- **Newcomers** evaluating whether the network and its community are real and trustworthy after the fork confusion.
- **Exchanges and integrators** verifying which endpoints are canonical (a named audience for the RPC warning).
- **Admins** (a handful of community operators) reviewing community drafts and publishing news via a protected admin area.

## Product Purpose

The public face of the community that has run BlockDAG Network since Genesis. It exists to be transparent and informative to everyone contributing to the chain, and to grow participation: join the channels, mine (X30/X100 via bdag.co), stake via the native on-chain mechanism, and build (bdag.dev, upcoming DAO + open-sourcing). Success = visitors trust the canonical network and take one of those participation paths.

## Positioning

"We are the community that has been running BlockDAG Network from Genesis." An independent collective — NOT a company, NOT the original BlockDAG presale team (non-affiliation is a legal/trust commitment rendered on every page). The claim nobody else can truthfully copy: we operate the canonical network — https://rpc.blockdag.engineering + https://explorer.blockdag.engineering — while rpc.bdagscan.com is a fork exhibiting minting of additional tokens, funds extracted from staking contracts, and resale/compression of tokens. Decentralisation and for-the-love-of-the-project transparency are the ethos.

## Operating Context

- Canonical chain: BlockDAG Mainnet, chain ID 1404, native BDAG (18 decimals), ~1s blocks, Genesis block 0 mined 2026-02-10T22:03:00Z (verified on-chain).
- Live data sources: server-side JSON-RPC quorum across a fixed allowlist of independently operated endpoints, with rpc.blockdag.engineering as the public-facing canonical endpoint. Each automatic source must prove chain ID 1404, the pinned canonical block, and an exact head height and hash shared by at least one other operator. Explorer aggregates prefer explorer.blockdag.engineering, may fall back to a fixed community Blockscout source only after an indexed block hash matches the RPC quorum, and fall back to the shared last-known-good database snapshot during outages.
- Chain facts on hand: native staking contract 0x08Bd519F611556dC148e7BfFE8d6f078F23a8EF7 + 4 staking pools; exchange venues P2B, XT.COM, BitMart, AscendEX (+ LBank, Coinstore); coin supply ≈93.77B BDAG.
- Sibling sites: bdag.co (miner sales, live), bdag.dev (development hub, launching shortly), this site at bdag.community.

## Capabilities and Constraints

- Pages: Home, Chain, Community, Mining, Staking, News, public article submission, and Contact.
- Home carries: rotating-identity hero (Engineers/Enthusiasts/Developers/Miners/Stakers → Community) with animated background; animated live stats (peers, block height, chain ID, + explorer/RPC links); exchange RPC warning; timeline; mining/staking/development sections; news cards; non-affiliation.
- News: any community member can submit a private draft with an optional name
  or username; only an admin can edit or publish it. Article bodies use a
  restricted rich-text editor for headings, emphasis, links, quotations, and
  lists. Content is sanitized on every write and again before public rendering.
  A contributor may attach one optional JPEG, PNG, or WebP cover up to 5 MiB.
  The browser sends it through a five-minute conditional upload to private S3
  quarantine after the text draft is saved. The original is never public. An
  isolated processor creates controlled private WebP derivatives for
  same-origin admin preview and approval. Approved managed covers use immutable
  responsive variants through private-origin controlled delivery; arbitrary
  rich-text embeds remain unsupported. Published articles render an optional
  byline. The site degrades gracefully to seed articles when Supabase env is
  absent.
- Community submissions must suit a public site. Obscene content, vulgar
  language, hate speech, harassment, threats, sexually explicit material, and
  personal attacks are not published.
- Community: a Suggestion Box validates anonymous suggestions and delivers them through a server-only email adapter when the provider, sender, and recipient are configured. Missing delivery configuration is reported honestly and never presented as success.
- Contact: form → Supabase inbox with graceful fallback; links to Telegram/Discord/X/GitHub (mock URLs until real ones provided — marked as such, do not invent real handles).
- V1 has NO wallet connect; staking/mining pages are informational + live data, linking out.
- Timeline events after Genesis (exchange listings, blocking of suspicious wallets tied to the staking-contract treasury, emergence of the fork) are dated approximately at month level, editable in the content module — real dates to be corrected by the owner later. [assumption: approved 2026-08-05]
- All copy lives in a single data-only content module (src/lib/content/site.ts pattern, enforced by source-assertion tests).

## Brand Commitments

- Same logo family as bdag-miner-sales: /public/logo.svg is the BDAG COMMUNITY lockup (white wordmark + purple DAG-wave mark); icon.svg favicon derives from the mark.
- Visual kinship with bdag-miner-sales is binding: bdag-community is its "big brother" — shared DNA, must not be too similar. Dark Elegant Purple background world with Magenta (Pink) hues pushed further than the sibling. Elegant > industrial: this site reads statelier and more refined than the hardware-sales site.
- Fonts: Poppins (display — free Gilroy stand-in per the Hiveon direction, 2026-08-05) / Inter (body) / JetBrains Mono (data) — the family system.
- Voice: first-person plural, honest, precise, non-promotional. No fixed-APY promises, no invented partnerships/testimonials. The non-affiliation disclaimer (adapted from miner-sales NON_AFFILIATION) appears on every public surface.

## Evidence on Hand

- Live chain interfaces: RPC methods eth_chainId, eth_blockNumber, eth_getBlockByNumber, net_peerCount, and eth_syncing; Blockscout /api/v2/stats, per-height block data, indexing status, and /api/v1?module=stats&action=coinsupply. Availability is checked live and never assumed from this document.
- Reusable verified copy/facts in a sibling internal project (canonical-endpoint hygiene, honest staking framing, chain config) and the miner-sales content module.
- NO public source exists for: total node count (RPC peer count is node-local), a miners list endpoint, dates of exchange listings/wallet blocking/fork. The mining-pool tile is a deterministic distinct-producer sample over quorum-verified blocks, not a total. Do not fabricate these.
- No og-image assets exist yet in the family; product photography (X30/X100) lives in bdag-miner-sales/public.

## Product Principles

1. **Evidence before promotion** — every number on the site comes from a fork-safe RPC quorum, a chain-verified explorer report, or a clearly labeled last-known-good snapshot; nothing invented.
2. **Canonical-endpoint hygiene** — rpc/explorer.blockdag.engineering remain the public-facing defaults. Automatic telemetry fallbacks are fixed in server code and must prove the pinned chain and matching block hashes. bdagscan.com appears only inside the warning, never as a link target for use.
3. **Participation over spectacle** — every section lands on a concrete way to take part (join, mine, stake, build).
4. **Independence is the trust story** — non-affiliation and for-the-love-of-the-project framing are features, not fine print.
5. **Lightweight by design** — Supabase stores content workflows, admin state, and shared last-known-good chain readings. Endpoint selection and verification remain in code.

## Accessibility & Inclusion

WCAG AA floor inherited from the sibling system: AA contrast on all body text (accent-soft class of tokens for small text on dark), visible focus rings, 44px touch targets, full reduced-motion fallbacks (the animated hero, counters, and background must all degrade), semantic landmarks + skip link.
