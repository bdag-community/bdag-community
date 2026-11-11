# bdag-community

The public face of the BDAG Community — the community that has been running
BlockDAG Network from Genesis. Its intended public home is
**https://bdag.community**; no public deployment has been made yet.

Sibling of [bdag-miner-sales](https://github.com/DigiMountOrg/bdag-miner-sales)
(bdag.co): same stack, same brand family, its own "Stately Plum" design world
(see `DESIGN.md`; product truth in `PRODUCT.md`).

## Community guides and article buttons

`/guides` lists the three approved community PDFs (15 October 2026):

- `/guides/staking-and-dao` — community guide with FAQ (three pages).
- `/guides/staking-v2` — Staking V2 visual journey.
- `/guides/dao-and-development` — DAO and Development visual journey.

Each page has image previews, a text reading view, the unchanged original PDF
and a download link. The catalogue in `src/lib/content/community-guides.ts`
pins the PDF hashes. These documents describe the planned Mainnet experience;
they are not a live-launch announcement. The footer and sitemap include them.

Both **community submission** and **admin create/edit** articles use the same
rich-text editor. Use the square-arrow toolbar tool to enter button text and
a web URL, site path (for example `/guides/staking-v2`), or page anchor.
Select a button and reopen the tool to edit or remove it. Published buttons
open a new tab with `noopener noreferrer`; clicks inside the editor select
the button without navigating. Both write paths and the public renderer
sanitize the button markup. Existing moderation and publication rules are
unchanged; no database migration is needed.

## Stack

- **Next.js 16** (App Router, standalone output) · React 19 · TypeScript
- **Tailwind CSS 3.4** (tokens in `tailwind.config.ts`, mirrored in `globals.css`)
- **motion v12** for reveals + the hero identity sequence; a hand-rolled canvas
  DAG constellation (`src/components/home/DagField.tsx`)
- **Supabase (lightweight)** — news CMS, community draft intake, contact inbox,
  and admin auth. The site runs without it using seed news and honest form
  failure states.
- **Resend HTTP API** for server-only Suggestion Box email delivery when its
  sender, recipient, and API key are configured.
- **No wallet/web3 layer** in v1 by design.

## Live data

All chain numbers are served by `GET /api/stats` — a server-side aggregation of
the canonical RPC (`rpc.blockdag.engineering`, chain ID 1404) and Blockscout
(`explorer.blockdag.engineering`), cached 15s in-process so the rate-limited
explorer sees one origin poll regardless of traffic (`src/lib/chain/stats.ts`).
`GET /api/health` is the application-liveness contract used for deploy swaps.
Chain telemetry is monitored separately through `/api/stats`; transient quorum
recovery is logged in the browser console while the public chain identity stays
stable.

## Develop

```bash
npm install
npm run dev        # http://localhost:3002
npm test           # zero-dep source-assertion suite (node:test)
npm run lint
npx tsc --noEmit
```

Copy `.env.local.example` → `.env.local` to wire Supabase or suggestion email
(both optional for a first run). See `supabase/README.md` for project setup,
migrations, and the admin-claim hook. See
`SUPABASE-S3-INTEGRATION-RUNBOOK.md` before connecting external services.

## Production

```bash
docker compose --env-file .env.local up --build -d   # http://localhost:3011
```

The intended workflow deploys from `main` via `.github/workflows/deploy.yml`:
source is archived to the VM and built **on the server** (never cross-build
from Apple Silicon — Node segfaults under QEMU). The current `ops/deploy.sh`
still needs the start-before-stop safety work recorded in
`SITE-AUDIT-BACKLOG.md` before a first public deployment. CI (`ci.yml`) gates
PRs and `develop` with typecheck + lint + tests.

## Editorial rules

- All copy lives in `src/lib/content/site.ts` — pages never re-author it
  (enforced by `tests/`).
- Evidence before promotion: every number is live from the canonical chain or
  explicitly marked approximate/mock.
- `rpc.bdagscan.com` (the fork) appears only inside warning copy, never as a
  usable link.
- The non-affiliation disclaimer renders on every public surface via
  `<Disclaimer>`.
