import type { CommunityProject } from "@/lib/projects";

/**
 * Seed projects, served whenever the community_projects table has no
 * published rows (the same live-replaces-seed rule as news-seed.ts). These
 * four are the community-run services already listed and verified reachable
 * in the /community directory sections, so the showcase is honest from day
 * one: nothing here is invented, and every URL was checked before listing.
 */
export const PROJECTS_SEED: CommunityProject[] = [
  {
    id: "seed-odins-explorer",
    name: "Odin's Explorer",
    description:
      "A community block explorer that reads the canonical chain directly over RPC. Blocks, transactions, addresses, and a live public node board.",
    url: "https://odinsexplorer.app",
    category: "information",
    authorName: null,
    imageUrl: null,
    imageSrcSet: null,
    imageAlt: "",
    publishedAt: "2026-08-14T09:00:00Z",
    featured: false,
    focused: false,
  },
  {
    id: "seed-rms-chainpulse",
    name: "RMS ChainPulse",
    description:
      "A community explorer and chain monitor for BlockDAG Mainnet with live block and transaction views.",
    url: "https://rms-bdag-rpc.de/",
    category: "information",
    authorName: null,
    imageUrl: null,
    imageSrcSet: null,
    imageAlt: "",
    publishedAt: "2026-08-17T09:00:00Z",
    featured: false,
    focused: false,
  },
  {
    id: "seed-welshdag",
    name: "WelshDAG",
    description:
      "A community mining pool for BlockDAG Mainnet that also runs its own public RPC endpoint.",
    url: "https://welshdag.trade/",
    category: "infrastructure",
    authorName: null,
    imageUrl: null,
    imageSrcSet: null,
    imageAlt: "",
    publishedAt: "2026-08-16T09:00:00Z",
    featured: false,
    focused: false,
  },
  {
    id: "seed-capedag",
    name: "CapeDAG",
    description:
      "A community mining pool and public RPC endpoint following canonical BlockDAG Mainnet.",
    url: "https://capedag.com",
    category: "infrastructure",
    authorName: null,
    imageUrl: null,
    imageSrcSet: null,
    imageAlt: "",
    publishedAt: "2026-08-17T09:00:00Z",
    featured: false,
    focused: false,
  },
];
