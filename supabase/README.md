# Supabase — bdag-community

The database holds the things that must change without a deploy: news and
community drafts, project and suggestion moderation, contact messages, admin
auth, shared last-known-good chain telemetry, and the public infrastructure
directory. Editorial copy and trusted chain consensus configuration remain in code.

Article bodies keep a plain-text projection in `body` and sanitized rich text
in `body_html`. Both community and admin write paths sanitize before storage,
and the public reader sanitizes again before rendering. Never write raw visitor
HTML directly to either column.

Migrations here are **CLI-tracked and are the only way the schema is applied**.
Never paste schema SQL into the dashboard editor. The committed `config.toml`
contains only the secret-free local project ID, ports, and local Auth hook. The
hosted project reference remains in ignored `supabase/.temp/` metadata created
by `supabase link` and must never be copied into `config.toml`.

## 1. Create the project

1. Create the project in the approved organisation and region, then keep its
   database password in the system credential store.
2. Project Settings → API Keys: copy the Project URL, publishable key, and
   secret key into `.env.local`:

   ```bash
   NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<publishable key>
   SUPABASE_SECRET_KEY=<secret key>   # server-only; never NEXT_PUBLIC_
   ```

## 2. Apply the migrations

```bash
npx supabase login
npx supabase link --project-ref <ref>
npx supabase start
npx supabase db reset --local --no-seed
npx supabase test db --local
npx supabase db lint --local --level warning
npx supabase db push --linked --dry-run
npx supabase db push --linked
```

`db push` records applied migrations in the project, so future migrations apply
incrementally. Never run `supabase db reset --linked` against this production
project. Migrations `0001` through `0015` are already applied and must not be
edited. Make every later schema change in another forward migration.

## 3. Enable email + password auth

Dashboard → Authentication → Sign In / Up → **Email**: enable the provider.
For a handful of hand-created operator accounts you can turn **off** "Confirm
email" (accounts are created by you, below), or leave it on and confirm each.

## 4. Register the Custom Access Token hook

Dashboard → Authentication → Hooks → **Customize Access Token (JWT) Claims
hook** → Postgres function → select `public.custom_access_token_hook` → Enable.

Without this step nobody ever gets the `app_metadata.admin` claim, and every
admin surface fails closed (deliberately).

## 5. Create the first admin

1. Dashboard → Authentication → Users → Add user → email + a unique password.
   (The `on_auth_user_created` trigger creates the matching `profiles` row.)
2. Promote the profile through an authenticated operator database channel:

   ```sql
   update public.profiles set is_admin = true
   where email = 'operator@example.com';
   ```

3. **Sign out and back in.** The admin claim is minted into the JWT at sign-in
   by the hook — an already-issued session never gains it. The same applies
   any time `is_admin` changes.

Then sign in at `/admin/sign-in`.

## Notes

- **No env, no crash**: without the `NEXT_PUBLIC_SUPABASE_*` vars the site
  serves seed news, the contact form falls back to channels, and
  `/admin/sign-in` explains that Supabase is not configured.
- **RLS and narrow RPCs are the admin boundary**: admin reads run through the
  RLS-bound server client, while authenticated security-definer RPCs perform
  the explicit save, moderation, and publication transitions. The secret key
  is used only by narrow server actions for contact intake, forced unpublished
  drafts, and one-shot asset capabilities. Public clients receive no direct
  insert, update, or delete policy for news.
- **Public news is anonymous and cacheable**: published list/detail reads use
  the cookie-free publishable-key client in `src/lib/supabase/public.ts`.
  Authenticated SSR clients and session refresh stay on `/admin`; shared news
  data and public routes revalidate every ten minutes or after an admin write.
- **Chain readings retain their provenance**: `0015` stores an RPC quorum only
  after at least two distinct sources and operators agree on chain 1404 and the
  exact block height and hash. It records the agreeing source and operator IDs,
  the source of the node-local peer reading, and the anchor for the deterministic
  producer sample. Explorer aggregates are stored with explorer provenance only
  after the explorer block hash matches the same RPC quorum. These service-role
  tables and write functions have no public access.
- `supabase/migrations/` inventory:
  - `0001` identity profiles, `is_admin()`, JWT hook, and signup trigger.
  - `0002` news, RLS, and the `updated_at` trigger.
  - `0003` the deny-by-default contact inbox.
  - `0004` pseudonymous submission limits and hourly retention cleanup.
  - `0005` HMAC-only atomic Turnstile replay claims and retention cleanup.
  - `0006` private article-asset metadata plus narrow draft and
    conditional-upload capability RPCs.
  - `0007` private processing result synchronization, admin moderation, and
    publication RPCs.
  - `0008` the private suggestion inbox plus deletion after managed article
    asset cleanup.
  - `0009` append-only chain aggregate reports and the monotonic transaction
    counting cursor.
  - `0010` the closed article-category set and category-aware writer RPCs.
  - `0011` community projects, private project assets and derivatives, and the
    project moderation and publication RPCs.
  - `0012` the 200-character project-description limit and matching writers.
  - `0013` the idempotent initial set of published community projects.
  - `0014` the legacy single-source live checkpoint retained for deployment
    compatibility.
  - `0015` the independently operated RPC quorum snapshot and chain-verified
    explorer provenance for aggregate reports.
  - `20260928114244` the admin-managed public infrastructure directory and
    append-only admin activity log. Its seed preserves the existing 13 RPCs,
    three explorers, two community mining links, and four miner endpoints.
  - `20260928115848` precise activity ordering and parent titles on asset
    approvals/rejections.
