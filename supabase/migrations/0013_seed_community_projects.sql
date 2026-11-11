-- 0013_seed_community_projects.sql
-- Promote the four seed projects from frontend fallback data to real
-- published rows. The showcase serves the code seed only while the table
-- has no published rows, and live rows REPLACE the seed entirely, so the
-- first real publication would silently drop these four verified listings.
-- Inserting them here makes the database the source of truth from day one;
-- the code seed stays behind as the no-database fallback for fresh clones.
--
-- These are operator-added directory entries, not community submissions,
-- so submitted_by_community is false. Every URL was verified reachable
-- before listing (community resource directory, 2026-08-13 to 2026-08-17).
-- The insert is guarded per URL so a re-run cannot duplicate a row, and a
-- row an admin has since edited or unpublished is left alone.

insert into public.community_projects (
  name, description, url, category, author_name,
  submitted_by_community, is_published, published_at
)
select
  seed.name,
  seed.description,
  seed.url,
  seed.category,
  null,
  false,
  true,
  seed.published_at
from (
  values
    (
      'Odin''s Explorer',
      'A community block explorer that reads the canonical chain directly over RPC. Blocks, transactions, addresses, and a live public node board.',
      'https://odinsexplorer.app',
      'information',
      timestamptz '2026-08-14 09:00:00+00'
    ),
    (
      'RMS ChainPulse',
      'A community explorer and chain monitor for BlockDAG Mainnet with live block and transaction views.',
      'https://rms-bdag-rpc.de/',
      'information',
      timestamptz '2026-08-17 09:00:00+00'
    ),
    (
      'WelshDAG',
      'A community mining pool for BlockDAG Mainnet that also runs its own public RPC endpoint.',
      'https://welshdag.trade/',
      'infrastructure',
      timestamptz '2026-08-16 09:00:00+00'
    ),
    (
      'CapeDAG',
      'A community mining pool and public RPC endpoint following canonical BlockDAG Mainnet.',
      'https://capedag.com',
      'infrastructure',
      timestamptz '2026-08-17 09:00:00+00'
    )
) as seed(name, description, url, category, published_at)
where not exists (
  select 1 from public.community_projects existing
  where existing.url = seed.url
);
