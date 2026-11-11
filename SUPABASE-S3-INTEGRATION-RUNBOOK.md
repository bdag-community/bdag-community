# Supabase, Email, and S3 Integration Runbook

Status: steps 1 through 11 complete; step 12 is not started
Last completed step: 11
Next authorised step: 12 only
Last updated: 2026-08-13

## Stop rule

Do not begin or advance a step until the owner says exactly `Next step`.

When that prompt arrives, work only on the next authorised step. At the end of
that step:

1. Record the evidence gathered.
2. Record any configuration changed, without recording secret values.
3. Record the rollback path.
4. Update `Last completed step` and `Next authorised step` above.
5. Stop and wait for another `Next step` prompt.

Steps 1 through 11 are complete. The production Cloudflare account, widget,
durable limiter, replay claim, company-controlled administrator, 2FA,
production narrow-layout check, and temporary-harness cleanup are verified.
The private S3 foundation now supports conditional quarantine intake. Only the
development identity has one runtime credential; production remains
credential-free. the owner chose to configure the optional AWS Budget manually
later, and CloudWatch request monitoring remains deferred to Step 12. Private
image processing and authenticated admin moderation are active in development.
Controlled asset delivery is now active behind private-origin CloudFront
distributions, including TLS for `assets.bdag.community`. Production has no
asset objects or runtime credentials. The Cloudflare site proxy, Xneelo origin
lock, production rollout, and production asset credentials remain Step 12 work.

## Current application baseline

- `/news/submit` accepts an optional name or username plus a rich-text article.
- The public article action generates its own slug and inserts only:
  `submitted_by_community = true`, `is_published = false`,
  `published_at = null`, and `image_url = null`.
- Public clients have no direct news insert, update, or delete grant. Narrow
  server actions use secret-key clients only through purpose-built forced-draft
  and capability RPCs.
- Admin reads remain authenticated and RLS-bound. Admin mutations use explicit
  authenticated security-definer RPCs; arbitrary image URLs and direct table
  writes are not publication paths.
- Published articles show the optional `Written by` byline.
- The Community Suggestion Box validates input and calls a server-only Resend
  HTTP adapter. Recipient, sender, subject, and credentials are not client
  inputs.
- With no Supabase or Resend configuration, both forms preserve the visitor's
  text and state plainly that nothing was submitted or sent.
- Public article image intake can place one optional cover in the private
  development quarantine bucket. The development processor converts accepted
  originals into controlled private WebP derivatives for authenticated review.
  Approved derivatives use immutable managed keys and are delivered only
  through the controlled asset hostname while the S3 origin remains private.
- Honeypots, Turnstile, and durable database-backed limits now protect all
  three anonymous write paths. Public enablement still waits for the remaining
  asset-integration steps and the Step 12 rollout and operations checks.

## Target boundaries

### Ownership

- This independent community project falls outside DigiMount entirely.
- Existing Supabase and Xneelo resources may use the accounts approved by
  the owner, but that operational choice does not make DigiMount the project
  owner.
- S3 buckets, CloudFront distributions, IAM identities, Lambda processors,
  budgets, and alarms belong in the BlockDAG Engineering AWS account. They
  must not be created in or billed to a DigiMount AWS account.

### Supabase

- Supabase stores news, community drafts, contact messages, admin identity,
  and later asset metadata.
- Anonymous database clients can read published news only.
- Narrow server actions may create contact messages and forced community
  drafts with the secret-key role.
- Admin reads and mutations use the authenticated, RLS-bound client.
- The current Supabase publishable key is stored as
  `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. It is the only Supabase key exposed
  to browser code.
- The current Supabase secret key is stored as `SUPABASE_SECRET_KEY`. It
  remains runtime-only, bypasses RLS, and never receives a `NEXT_PUBLIC_`
  prefix.

### Suggestion email

- Resend is the adapter currently implemented in code.
- The destination, sender, and subject are fixed by server configuration.
- Visitor input is placed in a plain-text body, never an HTML template.
- The form reports success only after the provider returns a 2xx response.
- A provider acceptance means queued for delivery, not read by an operator.

### S3 assets

- Community rich-text submissions may include one optional cover once Step 9
  passes its evidence gate.
- Untrusted uploads land in a private quarantine prefix.
- The S3 bucket keeps Block Public Access enabled.
- A five-minute conditional presigned PUT binds the exact generated key,
  declared content type, declared byte size, and `If-None-Match: *`. The bucket
  policy rejects writes that omit that first-write precondition.
- Uploaded bytes are decoded, re-encoded, stripped of metadata, and checked
  before an admin can publish them.
- Published assets are served only through the platform's controlled,
  DDoS-protected delivery layer while S3 stays private. Browser-visible images
  remain publicly retrievable through that layer, but the S3 origin is never
  exposed for direct public reads.
- Database rows store object keys and workflow state. They do not treat a
  visitor-supplied URL as trusted.

## Step 1: lock owner decisions

No cloud mutation occurs in this step.

### Decision record

| Decision | Outcome | Status |
| --- | --- | --- |
| Supabase organisation | `the Supabase organisation`, verified live as the organisation containing `bdag-miner-sales` | Resolved |
| Supabase project | One production project named `bdag-community`, using the organisation's second Free-plan slot | Resolved |
| Supabase region | Stockholm (`eu-north-1`), verified live on `bdag-miner-sales` | Resolved |
| Supabase environments | A single hosted production Supabase project shared by local `develop` and the production runtime; there is no separate hosted preview project | Resolved |
| Local database safety | Validate migrations against the local Supabase stack before remote application; never run `supabase db reset --linked`, destructive remote seeds, or destructive remote test resets | Resolved |
| Supabase key format | Use current publishable and secret keys, with `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` and server-only `SUPABASE_SECRET_KEY` | Resolved |
| First administrator | `the administrator email (held out of this doc)`; create the user only in Step 3 after the schema and access-token hook exist | Resolved |
| Administrator credential | Generate a unique password in the owner's password manager at account-creation time. No password value is recorded in chat-derived project files, source, logs, or this runbook | Resolved |
| Xneelo hosting | Reuse the existing Xneelo Cloud account, Cloud project, and VM at `the Xneelo VM`; keep the separate directory, container, environment file, and loopback port already prepared | Resolved |
| Public hostname | `bdag.community` is canonical; `www.bdag.community` redirects permanently to the apex | Resolved |
| AWS account and billing | The BlockDAG Engineering account and Europe (Frankfurt) (`eu-central-1`) region are verified. Budget and alarm recipients and thresholds remain unapproved; the owner will configure the optional budget manually later | Foundation resolved in Step 8; monitoring deferred to Step 12 |
| Supabase and S3 environment parity | Keep one shared hosted Supabase project, but use separate development and production asset buckets | Resolved in Step 8 |
| Suggestion recipient and sender | Recipient `admin@bdag.community`; sender `BDAG Community Suggestions <suggestions@send.bdag.community>` | Resolved in Step 6 |
| Email provider | Resend Free with an Ireland (`eu-west-1`) sending domain and one domain-scoped sending key | Resolved in Step 6 |
| Cover image scope | One optional cover; declared JPEG, PNG, or static WebP; 1 byte through 5 MiB at intake. Actual type, animation, and dimensions are verified in Step 10 | Resolved for Step 9 |
| Alt text | Optional at community intake, trimmed to 300 characters; meaningful alt text is mandatory before an image can be published in Step 10 | Resolved for Step 9 |
| Asset delivery protection | Direct public S3 access stays denied. Published assets must use the platform's controlled, DDoS-protected delivery layer | Resolved as a Step 11 gate |
| Site DDoS protection | Public DNS must be Cloudflare-proxied and the Xneelo origin must accept only Cloudflare IP ranges or traffic through an approved Cloudflare Tunnel | Resolved as a Step 12 gate |
| Public asset hostname | `assets.bdag.community` with TLS and isolated delegated DNS | Resolved in Step 11 |
| Asset retention | Quarantine objects expire after seven days, rejected objects after 30 days, and incomplete multipart uploads after one day | Resolved in Step 8 |
| Abuse protection | Cloudflare Turnstile Managed plus durable Supabase rate and replay boundaries across article, suggestion, and contact submissions. The `bdag-community-production` widget is restricted to `bdag.community`; `admin@bdag.community` is an active account-wide Super Administrator with 2FA active | Resolved in Step 7 |
| Image processor | Isolated S3-triggered Lambda with private immutable processor results | Resolved in Step 10 |

### Owners

| Owner | Responsibility |
| --- | --- |
| the owner | Supabase and Xneelo billing owner |
| BlockDAG Engineering | AWS account and S3/CloudFront owner; named billing operator to be confirmed in the S3 phase |
| the owner | Email and DNS owner until explicitly delegated |
| the owner | Content moderation owner until explicitly delegated |

Evidence recorded on 2026-08-12:

- the owner approved the Supabase, hosting, canonical-domain, current-key, and
  administrator-email decisions in this task.
- the owner clarified that the project falls outside DigiMount entirely and
  that all future S3-related infrastructure belongs to BlockDAG Engineering.
- The historical `bdag-miner-sales` planning record named `DigimountAI` and
  London (`eu-west-2`), but the live dashboard is authoritative and instead
  shows `the Supabase organisation` and Stockholm (`eu-north-1`). the owner
  approved proceeding with the live values.
- Live read-only Xneelo checks found both isolated containers already running:
  `bdag-miner-sales` on `127.0.0.1:3000` and `bdag-community` on
  `127.0.0.1:3001`. The VM had about 2.9 GB available memory and 15 GB free
  disk.
- Live DNS still points the apex at the shared-hosting placeholder while `www`
  points at the Cloud VM. No DNS record was changed.
- The posted administrator password was rejected because it was weak and
  exposed in conversation history. No password value was copied into a file,
  command, environment, or external service.

Configuration changed: this decision record and its repository test only.

Rollback: revert the Step 1 documentation and test change. There is no cloud
rollback because this step changed no external state.

## Step 2: create and link the production Supabase project

Status: Complete (2026-08-12)

- In the Supabase dashboard, confirm that the existing `bdag-miner-sales`
  project belongs to `the Supabase organisation` and uses Stockholm
  (`eu-north-1`).
- Create `bdag-community` as the organisation's second Free-plan project in
  that same region. Do not apply migrations in this step.
- Install and pin the Supabase CLI as a project development dependency, then
  initialise only the local CLI metadata required for linking.
- Record its project reference outside source control.
- Put the project URL, publishable key, and secret key in an untracked local
  environment file as `NEXT_PUBLIC_SUPABASE_URL`,
  `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, and `SUPABASE_SECRET_KEY`. Never
  paste secret values into this runbook or chat.
- Use `supabase link --project-ref <ref>` so the link stays local.
- Confirm that no project reference or secret enters a tracked file.
- Inspect the remote schema before applying anything.

Evidence recorded on 2026-08-12:

- The live project is `bdag-community` in `the Supabase organisation`, Stockholm
  (`eu-north-1`), and reported `ACTIVE_HEALTHY`.
- Project creation kept the Data API enabled, disabled automatic exposure of
  new tables, and kept Automatic RLS enabled.
- Supabase CLI `2.113.0` is pinned as an exact development dependency. The
  authenticated CLI reports this repository as linked to the intended project.
- The project reference is present only in ignored local Supabase metadata and
  is not recorded in this runbook or another tracked project file.
- `.env.local` is ignored, mode `0600`, and contains the project URL,
  publishable key, secret key, and canonical site URL. Only environment names,
  never values, were inspected during verification.
- The database credential is stored in macOS Keychain under the
  `bdag-community Supabase database` service. During setup, dashboard
  automation and a CLI dry-run each exposed a then-current database credential
  in task output. Each exposed credential was immediately rotated. The final
  credential was generated independently, stored in Keychain, and successfully
  used for a fresh read-only connection.
- `supabase migration list --linked` shows local migrations `0001`, `0002`,
  and `0003` with no matching remote versions. All three local migrations
  remain unapplied remotely.
- No migration push, SQL schema mutation, administrator creation, DNS change,
  email-provider change, or AWS operation occurred.
- `npm audit` reports three existing high findings in the Next.js dependency
  tree, not in Supabase CLI. The exact paired Next.js remediation is deferred
  to a separately tested framework upgrade.

Configuration changed:

- Created the hosted Supabase Free-plan project with the security defaults
  listed above.
- Created one named Supabase CLI access token and linked this checkout locally.
- Added the ignored local environment values and macOS Keychain database
  credential.
- Pinned Supabase CLI `2.113.0` and explicitly ignored `.env.local` and
  `supabase/.temp/`.

Evidence required:

- Redacted CLI output showing the intended project is linked.
- `git status --short` proving no secret or project-specific config is tracked.
- A redacted environment-key inventory showing names only.

Rollback:

- Unlink the local CLI project.
- Remove the untracked local environment file.
- Revoke the named CLI token and rotate the project API keys if local
  credential custody is ever in doubt.
- Do not delete the hosted project automatically. If creation used the wrong
  organisation or region, stop and ask the owner to authorise deletion after
  proving the project is empty.

## Step 3: apply migrations and prove the security boundary

Status: Complete (2026-08-12)

- Recreate the database locally and apply all migrations there first.
- Apply the migrations in order to the linked production project only after
  local recreation passes.
- Register the custom access-token hook.
- Create the approved administrator with a newly generated password and issue
  a fresh session after the admin flag is set.
- Do not edit applied migration files after this point. Future schema changes
  get a new migration.
- Run live negative and positive tests:

  1. Anonymous can read a published article.
  2. Anonymous cannot read a draft.
  3. Anonymous cannot insert, update, publish, or delete a news row directly.
  4. The public server action can insert a community draft only.
  5. That draft has a server-generated slug, no image, no publication time,
     and `is_published = false`.
  6. A non-admin authenticated user cannot read or mutate drafts.
  7. An admin can read, edit, publish, unpublish, and delete the draft.
  8. Publishing exposes the article and optional byline to anonymous reads.
  9. Contact messages remain invisible to anonymous and non-admin clients.

Evidence required:

- Migration history output.
- Redacted request/response matrix for all nine tests.
- A fresh-token check proving admin access is claim-bound.

Evidence recorded on 2026-08-12:

- `supabase db reset --local --no-seed` recreated the isolated local database
  and applied `0001`, `0002`, and `0003` in order. `supabase db lint --local`
  reported no schema errors. The local stack uses the committed
  `bdag-community-local` configuration and dedicated `5532x` ports.
- The persistent local pgTAP suite passed all 28 checks. It covers exact table
  grants, anonymous published-only reads, non-admin denial, admin CRUD,
  contact-message privacy, JWT hook promotion, and stale-claim demotion.
- Real local Auth sign-ins minted `admin=true` for an admin and `admin=false`
  for a member. A fresh sign-in after demotion minted `admin=false`.
- The full house gate passed before the production write with 227 tests plus
  TypeScript, lint, production build, and `git diff --check`, all at exit code
  zero.
- The linked dry run showed exactly `0001_identity.sql`, `0002_news.sql`, and
  `0003_contact.sql`, with no seed or role file. The production push completed
  for that exact set. Migration history now shows `0001`, `0002`, and `0003`
  on both local and remote sides.
- The hosted custom access-token hook is Enabled and points to the Postgres
  function `public.custom_access_token_hook`.
- Exactly one approved administrator was created for
  `the administrator email (held out of this doc)`. Its newly generated credential is stored in macOS
  Keychain under service `bdag-community admin`. No credential value is in
  source, logs, or this runbook.
- A hosted fresh token carried `app_metadata.admin=true`, and the authenticated
  client could read drafts through RLS. A controlled demotion produced a fresh
  token with `admin=false` and removed draft access; re-promotion produced a
  fresh token with `admin=true` again.
- The redacted hosted request matrix passed all nine required boundaries:

  | Boundary | Result |
  | --- | --- |
  | Anonymous reads a published article and its optional byline | PASS |
  | Anonymous cannot read a draft | PASS |
  | Anonymous direct insert, update/publish, and delete | DENIED |
  | Real public Server Action inserts a community draft | PASS |
  | Public draft is server-generated, image-free, unpublished, and has no publication time | PASS |
  | Non-admin reads published only and cannot mutate drafts | PASS |
  | Admin reads, inserts, edits, publishes, unpublishes, and deletes | PASS |
  | Publishing exposes the row and unpublishing hides it | PASS |
  | Contact message is hidden from anonymous and non-admin, visible to admin | PASS |

- The real public form was tested only after forcing a foreground browser
  paint. It reported private-draft success, and the stored row matched every
  forced-draft invariant before deletion.
- All tagged production test rows and the temporary non-admin account were
  removed. A final cleanup query found zero tagged news, contact, and temporary
  profile rows. The approved administrator remained promoted.

Configuration changed:

- Applied migrations `0001` through `0003` to the linked production database.
- Enabled the hosted custom access-token hook.
- Created and promoted the approved administrator.
- Replaced the retired anon/service-role environment contract with the current
  publishable/secret contract across the app and Docker build.
- Added a committed secret-free local Supabase configuration and a persistent
  pgTAP boundary suite.

Operational rule from this point:

- Do not edit applied migrations `0001`, `0002`, or `0003`. Every future
  schema or grant change must be a new forward migration.

Rollback:

- Demote the approved operator with `is_admin = false`, then sign out on all
  devices or revoke the user's active sessions so no old admin token remains.
- Disable the hosted custom access-token hook if token minting is unsafe.
- Remove the Supabase runtime variables from the application environment to
  fail closed while the boundary is repaired.
- Remove any tagged test rows and delete any temporary Auth users. Step 3
  already completed this cleanup.
- Correct a schema or grant mistake with a new forward migration. Do not edit
  applied migrations `0001`, `0002`, or `0003`, and never reset the linked
  production database.

## Step 4: complete the public-news data path before cutover

Status: Complete (2026-08-12)

This step closes Priority 1 audit item 11 before Supabase becomes the public
news source.

- Add a cookie-free anonymous server client for public published-news reads.
- Keep authenticated Supabase clients on admin routes only.
- Split summary and detail queries so list routes do not fetch every article
  body.
- Apply database-side `.limit()` for Home previews.
- Fetch one article with slug equality and `maybeSingle()`.
- Add tagged caching or ISR with explicit literal revalidation values.
- Prove Home remains static when Supabase environment variables are present.
- Verify the Step 3 publishable/secret environment contract remains intact
  while the public read client is separated.
- Re-run the full gate and rebuild Docker with the production Supabase values.

Evidence required:

- Build route classification with Supabase enabled.
- Query-shape tests and a live published/draft visibility check.
- Before/after response headers and payload measurements for Home, News, and
  one article.

Evidence recorded on 2026-08-12:

- Added a server-only, cookie-free publishable-key client for public reads.
  It disables session persistence, token refresh, and URL session detection,
  and has no access to `SUPABASE_SECRET_KEY` or an authenticated cookie.
- Public list queries now select summary fields without `body`, `body_html`,
  `author_name`, or another detail-only field. Home applies `.limit(3)` in
  PostgREST. Detail reads select one published row with slug equality and
  `maybeSingle()`.
- The existing source rule remains intact: seed news is the complete fallback
  only until the database has any published row. A missing live slug does not
  expose an old seed article after live publishing begins.
- Public news data uses one shared cache tag and a literal 600-second
  revalidation interval. Successful admin creates, updates, publishes,
  unpublishes, and deletes invalidate the shared tag plus every affected route.
- Supabase Auth middleware now matches `/admin/:path*` only. The authenticated,
  cookie-aware client remains in the admin DAL and admin actions; public page
  requests do not refresh or attach an operator session.
- Six query-shape and boundary tests pass. They pin the cookie-free client,
  exact summary/detail projections, database limit, slug lookup, literal ISR,
  admin-only middleware, and shared invalidation.
- With production Supabase variables present, the optimized build classified
  Home and News as static ISR and the four current article slugs as SSG, all
  with ten-minute revalidation. Before Step 4 all three route classes were
  dynamic.
- A live redacted matrix inserted one temporary published row and one draft.
  The anonymous summary and detail clients saw the published row, the draft
  remained invisible, and the summary response contained no body fields. A
  fresh admin claim removed both rows; final remaining rows were zero.
- The live test also confirmed the Step 3 least-privilege boundary: the
  secret-key intake role could insert the controlled rows but could not delete
  them. Cleanup therefore used the authenticated admin policy.
- The rebuilt review container is healthy on `http://localhost:3011`.
  Home, News, and one article each returned `x-nextjs-cache: HIT` and
  `Cache-Control: s-maxage=600, stale-while-revalidate=31535400`.
- Before and after measurements used 25 warm compressed requests against the
  production Docker build:

  | Route | Before wire bytes | After wire bytes | Before p50 TTFB | After p50 TTFB |
  | --- | ---: | ---: | ---: | ---: |
  | Home | 39,707 | 23,157 | 24.610 ms | 4.479 ms |
  | News | 28,430 | 14,727 | 14.678 ms | 3.378 ms |
  | Article | 22,065 | 11,308 | 17.539 ms | 3.088 ms |

Configuration changed:

- Added the anonymous public Supabase client and split public summary/detail
  access in the news DAL.
- Added literal ten-minute ISR to Home, News, and article routes, plus static
  parameters for the current article slugs.
- Added shared news-cache invalidation to admin mutations.
- Narrowed session middleware to admin routes.
- The runtime key names remain `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` and
  server-only `SUPABASE_SECRET_KEY`. No secret value or project reference was
  added to source.

Rollback:

- Remove the Supabase runtime variables to return to seed news without
  deleting hosted content.
- Revert only the isolated Step 4 data-path changes if the cache contract
  fails. Keep applied migrations `0001` through `0003` untouched.
- If cached public HTML is unsafe, remove the public runtime variables and
  restart the application before investigating. Do not widen the public client
  to use cookies or the secret key.

## Step 5: verify the complete article moderation journey

Status: Complete (2026-08-12)

- Submit a draft from a signed-out browser with and without a byline.
- Confirm the submitter cannot obtain a draft URL or publication control.
- Confirm the admin dashboard labels it as a community submission.
- Edit it as an admin, publish it, and verify the optional byline beneath the
  title.
- Unpublish it and prove public access disappears.
- Test failure states with Supabase unreachable and confirm entered values are
  preserved.
- Test keyboard focus, error summaries, narrow layouts, and a forced
  foreground paint in the browser.

Evidence required:

- Redacted database rows before and after publication.
- Foreground browser screenshots at desktop and mobile widths.
- Exact full-gate exit code and Docker health state.

Evidence recorded on 2026-08-12:

- A foreground, signed-out browser submitted two uniquely tagged drafts, one
  with an optional byline and one without. Both success states received focus.
  The form exposed no slug, draft link, admin link, image field, or publication
  control.
- The redacted database state before moderation showed exactly two community
  drafts. Both were unpublished with no image. The named row held the supplied
  byline; the second row stored a null author. Both public detail routes
  rendered the not-found boundary and neither title appeared on News.
- The authenticated admin dashboard labelled both rows `Community submission`
  and `Draft`. The named row was edited, given a reviewed slug and WYSIWYG H2
  plus list formatting, and published through the RLS-bound admin action.
- The redacted database state after publication showed the same exact row as
  published with a publication timestamp, retained byline, allowed H2/list
  markup, and no disallowed markup. The public article rendered its edited
  title, `Written by` line, heading, paragraph, and list.
- Unpublishing returned focused `Saved as a draft.` feedback. The public detail
  route then rendered not found without exposing its title or byline, and
  neither tagged title appeared on News.
- A separate temporary local container with empty runtime Supabase variables
  exercised the honest unavailable-provider state without touching the hosted
  project or the review container. The failure panel received focus, and the
  name, title, subtitle, summary, and complete rich body matched the entered
  values exactly. The temporary container was removed.
- Keyboard checks proved `Alt+F10` enters the article toolbar, arrow navigation
  moves its single tab stop, `End` skips disabled undo/redo controls, validation
  focuses the error summary, and its title link focuses the title input.
- Foreground browser evidence was measured at a 1280-pixel desktop viewport and
  a genuine 390-pixel mobile viewport. Both had `visibilityState = visible`,
  title, byline, rich heading, and list content. The mobile layout used a
  343-pixel content box inside a 375-pixel document client width, with no
  horizontal overflow. A misleading stitched full-page capture was discarded;
  only foreground viewport captures and DOM layout measurements were accepted.
- The normal browser environment did not expose `requestAnimationFrame`, so no
  timing claim relies on it. Foreground visibility, a real hydrated editor and
  admin interaction, forced layout reads, and viewport screenshots form the
  paint evidence instead.
- The full house gate passed 242 tests and completed at exit code zero, and the production Docker
  image was rebuilt with the ignored Supabase environment file. The review
  container was healthy after the rebuild.

| Journey check | Result |
| --- | --- |
| Signed-out draft with byline | PASS |
| Signed-out draft without byline | PASS |
| No draft URL, slug, admin link, or publication control disclosed | PASS |
| Admin dashboard shows Community submission and Draft | PASS |
| Admin edit and publish exposes allowed rich text and the byline | PASS |
| Admin unpublish removes list and detail access | PASS |
| Supabase unavailable preserves every entered value and article body | PASS |
| Keyboard and error-summary focus | PASS |
| Forced foreground desktop and mobile review | PASS |

Configuration changed:

- Hardened the normal admin Server Action so publishing requires a non-empty
  description and meaningful sanitized article body. Incomplete drafts remain
  allowed. The rule and operator copy are pinned by a repository test.
- No migration, Supabase project setting, administrator, DNS, email, AWS, or
  public deployment configuration changed.

Cleanup verified:

- The published canary was unpublished before deletion. The two exact uniquely
  tagged rows were then deleted through the authenticated admin policy.
- A final exact title-marker query returned remaining tagged rows zero.
- The approved administrator remained promoted with a fresh `admin=true`
  claim. No unrelated row or account was changed.

Rollback:

- Disable the News submission CTA in code and remove Supabase runtime
  configuration if the boundary cannot be proven.
- If any boundary fails, keep submitted drafts private and do not publish.
- After a successful canary visibility proof, immediately unpublish and delete
  only the exact tagged rows. Do not leave production test content published.

## Step 6: configure and verify suggestion email

Status: Complete (2026-08-12)

| Check | Result |
| --- | --- |
| Approved Resend domain, sender, destination, and domain-scoped sending key | PASS |
| Fixed server-side sender and destination with plain-text body | PASS |
| Missing configuration fails closed and preserves every entered value | PASS |
| Provider 2xx shows queued success | PASS |
| Provider non-2xx says not sent and preserves every entered value | PASS |
| Eight-second timeout says not sent and preserves every entered value | PASS |
| Keyboard, validation-summary, success, and failure focus | PASS |

Evidence recorded on 2026-08-12:

- the owner approved Resend, `send.bdag.community`, the fixed sender shown in
  the decision record, optional visitor email as `Reply-To`, and
  `admin@bdag.community` as the fixed destination.
- Xneelo created `admin@bdag.community` as a real Xneelo mailbox. It has no
  forwarder, catch-all remains unchanged, and its final generated password is
  stored only in macOS Keychain under `bdag-community admin mailbox`.
- Resend verified `send.bdag.community` in Ireland (`eu-west-1`). Xneelo's
  authoritative DNS serves the provider-generated DKIM TXT record and the
  isolated `send.send.bdag.community` MX and SPF records. Existing apex MX and
  SPF records remained unchanged.
- The active key named `bdag-community-suggestions-prod` has `Sending access`
  restricted to `send.bdag.community`. Its token is stored only in macOS
  Keychain and the ignored mode-`0600` local runtime file. A first key whose
  value reached browser output was revoked before use; Resend showed no
  activity for it.
- The adapter now has executable dependency-injected provider tests. They
  prove no request on missing or unsafe configuration, fixed Bearer and
  User-Agent headers, plain-text-only content, conditional `Reply-To`, the
  exact eight-second deadline, 2xx success, non-2xx failure, timeout failure,
  and network failure.
- One synthetic non-personal canary submitted through the hydrated review app
  moved focus to the queued-success status. Its provider message ID is
  redacted here; the matching Resend `delivered` event was recorded and the
  message appeared in the authenticated `admin@bdag.community` inbox.
- Disposable missing-configuration, invalid-key, and isolated-network timeout
  containers each showed the not-sent state and preserved every entered
  field. The failure panel received focus. A trusted local TLS endpoint
  completed its handshake and deliberately withheld the response; the live
  form failed closed after 8.18 seconds, proving the eight-second abort path.
- The full house gate completed with exit code zero. `docker compose up
  --build -d` completed with exit code zero and the review container is
  healthy on port 3011.
- Desktop foreground review completed at the actual 1280px browser width with
  no horizontal overflow. The requested 390px viewport was not verified:
  although the in-app tab was visible and painted, its viewport override kept
  reporting 1280px. This is recorded as unverified, not as a mobile pass.
- All temporary Step 6 containers and the temporary Docker network were
  removed. Suggestions create no Supabase row. The one delivery canary remains
  only in the private mailbox and provider's normal retention window.

Configuration changed:

- Created and verified the Resend sending domain `send.bdag.community` with
  sending enabled and receiving disabled.
- Added only the generated DKIM and isolated return-path MX/SPF DNS records.
- Created the fixed destination mailbox and the domain-scoped send-only key.
- Set the three Resend variables only in the ignored local runtime file and
  rebuilt the local review container. No Resend credential was added to source,
  a client bundle, Docker build arguments, or the public deployment.
- Added executable provider transport tests and a small dependency-injected
  transport boundary without changing visitor-facing copy or state semantics.

Evidence required:

- Redacted DNS/domain verification state.
- Provider message ID and delivery event for a test suggestion.
- Application evidence for success, provider error, timeout, and missing-env
  states without exposing personal content.

Rollback:

- Revoke the API key and remove the three runtime variables.
- The form then fails closed and reports that nothing was sent.
- Rebuild the review container after removing the runtime variables.
- If the Resend domain is retired, remove only the three isolated
  `send.bdag.community` DNS records after revoking the key. Do not change the
  existing apex MX or SPF records.
- The real `admin@bdag.community` mailbox is independent of Resend and should
  remain unless the owner explicitly authorises its deletion.

## Step 7: add abuse protection before public enablement

Status: Complete (2026-08-13)

Production ownership and responsive boundary:

- The account is named `BlockDAG Engineering`, and the Managed widget
  `bdag-community-production` is restricted to the exact hostname
  `bdag.community` with pre-clearance disabled. Creating it did not change DNS,
  nameservers, proxying, or the public site.
- `admin@bdag.community` is Active as an account-wide Super Administrator, and
  2FA is active on that company-controlled identity. The existing recovery
  administrator remains active as the second recovery administrator.
- The production widget was verified in a foreground-painted narrow browser.
  The viewport client width was 465 pixels, the verification container was
  383 pixels wide, a fresh production token enabled submission, and the page
  had zero horizontal overflow. No form was submitted during this layout
  check.
- Cloudflare recovery codes remain a manual follow-up. Their absence does not
  block Step 7 because two active Super Administrators exist and the
  company-controlled identity has working 2FA.

Approved boundary:

- Protect all three anonymous write paths: article drafts, suggestion emails,
  and contact messages.
- Use Cloudflare Turnstile Managed with exact actions `submit_article`,
  `submit_suggestion`, and `contact_message`. Production ownership belongs to
  BlockDAG Engineering. Turnstile does not require a DNS or proxy change.
- Require JavaScript and fail closed without it. Never bypass protection during
  an outage.
- Allow 30 attempts per 10 minutes across the three forms, 3 article
  submissions per 24 hours, 5 suggestion emails per hour, and 5 contact
  messages per hour for one pseudonymous connection identifier.
- HMAC the trusted client address with a server-only secret and a separate
  scope. Store no raw address, name, email, content, user agent, or Turnstile
  token.
- Delete counter rows when their fixed window closes. Run hourly scheduled
  cleanup, so normal retention is under one hour after expiry and the approved
  maximum is 24 hours after the window closes.
- Use Cloudflare official test credentials for local review only. Production
  deployment rejects those credentials and requires the expected hostname
  `bdag.community`.
- Bound known article payloads at 384 KiB and suggestion/contact payloads at
  16 KiB, while keeping Next Server Actions at the explicit 1 MiB global cap.
- Keep the existing honeypots as the first no-cost filter, then validate,
  consume the cheap attempt limit, verify Turnstile, consume the form limit,
  and only then perform a database or email side effect.

Local dependency measurements before choosing the deadline:

- Five Turnstile Siteverify probes completed in 18 to 45 milliseconds.
- Five hosted Supabase REST probes completed in 43 to 397 milliseconds.
- Both protection dependencies use a test-pinned three-second deadline, which
  leaves substantial measured headroom without leaving a visitor waiting on a
  failed dependency.

Evidence required:

- Test matrix for human, bot, replay, burst, and provider-down cases.
- Redacted rate-limit rows or service counters.
- Privacy and retention decision recorded in this runbook.

Evidence recorded on 2026-08-13:

- The code-first RED suite failed by exit code one before the shared abuse
  modules, widget, migration, and runbook state existed. The focused GREEN
  suite now passes executable verifier, fingerprint, transport, orchestration,
  payload, wiring, migration, and documentation contracts.
- Local `supabase db reset` applied `0001` through the forward migrations
  `0004_submission_abuse.sql` and `0005_turnstile_replay.sql` with exit code
  zero. `supabase test db` then passed 73 pgTAP checks across identity, content,
  rate limiting, and replay claims. Local database lint reported no schema
  errors at exit code zero.
- The linked dry runs and pushes completed at exit code zero. Migrations
  `0001` through `0005` match in local and remote migration history.
- The hosted RPC matrix used fresh synthetic digests only. Article requests
  returned allowed, allowed, allowed, denied. Suggestion requests returned five
  allowed then one denied. A 35-call parallel challenge burst returned exactly
  30 allowed and 5 denied with zero errors. All synthetic rows were then
  deleted by an exact table cleanup, which returned zero remaining rows.
- A separate hosted 35-call parallel token-claim check returned exactly
  1 claimed result, 34 duplicates, and zero errors. It left one HMAC-only claim
  row, which was removed by its exact synthetic digest; the final count was
  zero.
- The hosted scheduler contains exactly one active
  `bdag-community-submission-rate-retention` job at minute 17 each hour. It
  invokes only `public.delete_expired_submission_rate_limits()`. The latest
  scheduled production run reported `succeeded`.
- Official local dummy credentials and a separately generated 32-byte HMAC
  secret are stored only in the ignored mode-`0600` local runtime file and
  macOS Keychain. Production deployment rejects test mode, a non-canonical
  hostname, either dummy key, missing configuration, and a short HMAC secret.
- `docker compose up --build -d` completed at exit code zero before the replay
  hardening change. The container is
  loopback-only on `127.0.0.1:3011`, became healthy after the known cold chain
  snapshot populated, and has zero restarts.
- Foreground-painted browser checks used a visible in-app tab and real layout
  reads. At 390 by 844, all three forms loaded the test challenge, received a
  response, enabled submit only after verification, and had zero horizontal
  overflow. At 280 by 700, Contact used the compact path at 183 pixels wide
  with zero overflow. Browser logs contained no warnings or errors.
- A foreground human completed the production Turnstile challenge on the
  canonical local hostname. One private, unpublished community draft was
  created and the UI disclosed no draft URL or publication control.
- Before the local replay boundary existed, the exact same captured production
  token was accepted twice and created two private rows, contrary to the
  provider's documented single-use contract. Both exact rows were deleted and
  a final marker query returned zero.
- During the linked diagnosis, a database credential appeared in diagnostic
  output. It was immediately rotated, the replacement was verified, and the
  old credential was explicitly rejected. No API key was exposed or rotated.
- Forward migration `0005_turnstile_replay.sql` now stores only a ten-minute
  HMAC claim and grants the atomic claim RPC only to `service_role`. The
  pipeline order is attempt limit, Siteverify, atomic token claim, form quota,
  then side effect. Local official dummy mode bypasses the durable claim only
  behind the exact dummy-key and localhost guard because the official dummy
  token is constant.
- The post-fix real exact-token replay passed. The first request created exactly
  one unpublished community draft. Reusing that exact token was rejected with
  the verification-required path and created no second row. The one exact
  canary was deleted, and a separate final query returned zero.
- An article token submitted to the suggestion action was rejected with no
  queued-email success state. A disposable provider-down container returned
  the honest verification-unavailable state and left zero tagged rows. That
  container was removed immediately after the check.
- The production narrow-layout check measured a 465-pixel client width and a
  383-pixel verification container with zero horizontal overflow.
- The temporary hosts entry, loopback proxy, isolated container, and temporary
  image were removed. Public DNS resolution was restored, and local Supabase
  was stopped.

Accepted residual risks before public launch:

- IPv6 currently fingerprints the canonical full address. Normalising to a
  wider network can reduce address rotation but can also make unrelated people
  behind one allocation share a quota. Revisit after production evidence.
- The Server Action parser cap bounds each request, but malformed traffic is
  rejected before it consumes the database attempt counter. Add an origin or
  trusted-proxy request-rate layer during the public rollout phase.
- The production Caddy client-address contract must be re-proved if a CDN or
  another proxy is inserted later.
- Rotating `ABUSE_HMAC_SECRET` resets replay memory. Disable anonymous
  submissions for five minutes during a rotation so a still-valid Turnstile
  token cannot cross the key change.

Configuration changed:

- Added and applied forward migrations `0004_submission_abuse.sql` and
  `0005_turnstile_replay.sql` locally and to the one hosted production Supabase
  project.
- Created the BlockDAG Engineering Cloudflare account label and production
  widget, stored its credentials outside source, and activated the company
  mailbox as Super Administrator with 2FA active. No DNS, nameserver, proxy,
  email, AWS, or public deployment state changed.
- Removed the temporary loopback hostname mapping, proxy, production-widget
  container, and image after the narrow-layout verification.

Rollback:

- Disable the public CTAs if protection fails.
- Never respond to a protection outage by bypassing verification in
  production.

## Step 8: create the private S3 foundation

Status: Complete (2026-08-13)

The private storage foundation is deployed and independently verified.
CloudWatch alarms and an AWS Budget are deferred. the owner will configure the
budget manually later, and this monitoring follow-up does not block Step 9.
Step 9 later completed the conditional upload integration.

### Approved foundation

- Use separate development and production buckets in the BlockDAG Engineering
  account and Europe (Frankfurt) (`eu-central-1`).
- Keep all four Block Public Access controls enabled and use
  `BucketOwnerEnforced` object ownership.
- Use S3-managed `AES256` encryption. A customer-managed KMS key is not needed
  for this workload.
- Keep versioning enabled.
- Expire quarantine objects and their noncurrent versions after seven days,
  rejected objects and their noncurrent versions after 30 days, and incomplete
  multipart uploads after one day.
- Reserve prefixes:

  ```text
  news/quarantine/<article-id>/<asset-id>/original
  news/processed/<article-id>/<asset-id>/cover.webp
  news/published/<article-id>/<asset-id>/cover.webp
  ```

- Step 8 created one credential-free intake IAM user per environment. Its
  initial policy allowed `s3:GetBucketLocation` plus quarantine-only
  `s3:PutObject`, but no access key existed.
- Xneelo cannot receive an EC2 instance profile, so Step 9 had to record local
  credential storage, rotation, and revocation boundaries before creating the
  development key.
- The Step 8 foundation initially allowed browser `POST` with `Content-Type`.
  Step 9 replaced that rule with conditional `PUT`, removed
  `s3:GetBucketLocation`, and retained only quarantine-scoped `s3:PutObject`.
  The replacement CORS rule permits only the exact headers `Content-Type` and
  `If-None-Match`. Development accepts only `http://localhost:3011` and
  production accepts only `https://bdag.community`. No wildcard origin,
  header, or method is allowed.

### Verification matrix

| Foundation check | Result |
| --- | --- |
| BlockDAG Engineering account and Frankfurt region verified | PASS |
| Development stack reached CREATE_COMPLETE | PASS |
| Production stack reached CREATE_COMPLETE | PASS |
| Template checksum matched before deployment | PASS |
| Exactly one S3 bucket, bucket policy, and credential-free IAM user per stack | PASS |
| Independent verifier passed for development and production | PASS |
| No IAM access keys or console passwords created | PASS |
| Anonymous read and out-of-prefix write denied | PASS |

Evidence recorded on 2026-08-12:

- The account identity matched the existing BlockDAG Engineering account used
  for the earlier miner-sales work. Only CloudFormation in Europe (Frankfurt)
  was used for this change.
- The repository template was uploaded once through CloudFormation's managed
  template flow. A read-only checksum comparison matched the uploaded object
  to the reviewed local template before either environment was executed.
- The standard change sets `step8-development-foundation` and
  `step8-production-foundation` each contained exactly three additions:
  `AWS::S3::Bucket`, `AWS::S3::BucketPolicy`, and `AWS::IAM::User`. They had no
  replacement or deletion. All supported AWS deployment validations passed.
- `bdag-community-s3-development` and `bdag-community-s3-production` both
  reached `CREATE_COMPLETE` with rollback-all and delete-new-resources-on-
  failure selected.
- The repository verifier completed at exit code zero for development and
  production. It proved Block Public Access, a non-public bucket policy,
  `AES256` default encryption, versioning, `BucketOwnerEnforced` ownership,
  exact lifecycle and CORS rules, zero IAM access keys, quarantine-only write
  permission, denial of published-prefix writes, and anonymous read denial.
- No asset objects were uploaded. No application, DNS, Lambda, CloudFront,
  Supabase, Xneelo, or public deployment configuration changed in this step.
- No account identifier, stack ARN, bucket name, generated template URL,
  credential, or secret was added to source control.

### Monitoring deferred to Step 12

- CloudFormation adds no additional charge for the AWS-native resources in
  this template. IAM and S3-managed encryption also have no separate service
  charge. S3 remains usage-priced for stored bytes, requests, and transfer, so
  the current empty foundation should be near-zero rather than promised as
  literal zero.
- The resource tag `Project=bdag-community` exists, but its cost-allocation tag
  status is `Inactive`. The proposed `bdag-community-monthly-cost` budget does
  not exist.
- The current IAM identity is denied
  `ce:UpdateCostAllocationTagsStatus`, `budgets:CreateBudget`,
  `budgets:CreateNotification`, and `budgets:CreateSubscriber`. Do not broaden
  that provisioning identity merely to close this checklist.
- The monitoring recipient and threshold are not approved. The recorded
  recommendation is one standard email-only AWS Budget: USD $5 monthly using
  unblended cost, filtered to `Project=bdag-community`, sent to
  `admin@bdag.community`, with actual alerts at $1 and $5 and a forecast alert
  at $5. It would use no actions, SNS topic, or budget report.
- Standard AWS Budget monitoring and email notifications have no additional
  charge. Activating the cost-allocation tag and creating the budget require a
  BlockDAG billing-authorized owner or administrator session. AWS may take up
  to 24 hours to make the tag active.
- the owner chose to configure an approved budget manually later. Activation of
  the cost-allocation tag and creation of that budget are tracked in Step 12
  and do not block Step 9.
- Paid CloudWatch request metrics and related alarms remain deferred to Step 12,
  when an upload path and evidence-based thresholds exist. Daily S3 storage
  metrics remain available without enabling paid request metrics.
- Versioning and retained buckets are intentional recovery controls, but they
  can accumulate storage later. Step 9 must use immutable published object
  keys or approve explicit handling for published noncurrent versions before
  repeated overwrites are possible.
- Two read-only Cost Explorer tag-list requests were made during the monitoring
  audit. At the current published rate they may add $0.02 to the primary billing
  view. No AWS monitoring resource was changed.

Configuration changed:

- Added the account-neutral CloudFormation template, its source contract test,
  and the read-only verifier to the repository.
- Created the two named CloudFormation stacks and their six managed resources.
- Did not create access keys, login profiles, objects, alarms, budgets, topics,
  application configuration, or public endpoints.

Rollback:

- Before any future application integration, remove the intake IAM policy and
  CORS rule first if the boundary fails.
- The buckets are empty today. If rollback is authorised now, verify the exact
  stack targets and object and version counts again, then delete only the two
  Step 8 stacks. Do not delete either bucket after Step 9 begins without first
  auditing every current version, noncurrent version, and owner.
- CloudFormation is configured to retain the buckets on ordinary stack
  deletion. Any later bucket deletion therefore remains an explicit,
  separately authorised destructive action.

## Step 9: add asset metadata and presigned quarantine upload

Status: Complete (2026-08-13)

- Added forward migration `0006` for an environment-bound `article_assets`
  table. Keep declared intake claims separate from processor-detected facts.
  Store only generated object keys, workflow state, capability digests, and
  bounded metadata. Never store a raw capability, bucket credential, or public
  URL.
- Anonymous clients cannot read or mutate asset rows. Admin access is
  RLS-bound; narrow intake and processor writes are server-only.
- The forced private article draft and optional cover row are created atomically.
  After that transaction succeeds, return a short-lived opaque capability
  whose HMAC digest, storage environment, and expiry are bound to the row. Do
  not use a bare article id as authority.
- The server endpoint verifies a bounded same-origin request and the
  one-shot capability, then
  atomically consumes it before returning a conditional presigned S3 PUT with:

  - A server-generated quarantine key.
  - A five-minute expiry.
  - An exact declared JPEG, PNG, or WebP content type.
  - An exact signed byte length from 1 byte through 5 MiB.
  - A signed `If-None-Match: *` first-write precondition.
  - No public ACL.

- The form has exactly one optional, unnamed cover-image file control. File
  bytes stay in browser memory and upload directly to the private development
  bucket; they never enter the Server Action body or Xneelo runtime.
- Optional alt text is bounded to 300 characters. Step 10 must require
  meaningful alt text before publishing an image.
- The review container uses the explicit `development` storage environment. Do
  not infer it from `NODE_ENV`, because the review container is a
  production-mode Next build.
- Exactly one access key exists for the development intake user and is stored
  only in the ignored, mode `0600` local runtime environment file. The
  production intake user retains zero keys until Step 12.
- A successful S3 upload is not a published image and must never produce a
  public URL.
- Direct S3 reads remain denied. DDoS-protected public delivery and public site
  traffic protection remain mandatory gates in Steps 11 and 12, respectively.

### Verification matrix

| Step 9 check | Result |
| --- | --- |
| Migration 0006 applied locally and remotely | PASS |
| Local and hosted article-asset pgTAP suites passed | PASS |
| One-shot capability contention admitted exactly one claimant | PASS |
| Both CloudFormation updates contained only three safe modifications | PASS |
| Both S3 stacks reached UPDATE_COMPLETE | PASS |
| Independent verifier passed for development runtime-ready and production foundation | PASS |
| Exactly one development access key and zero production access keys | PASS |
| Foreground browser created one private draft and uploaded its cover | PASS |
| First conditional PUT succeeded and exact replay returned 412 | PASS |
| Changed key, type, length, and out-of-prefix writes were denied | PASS |
| Private object linked to the correct unpublished draft | PASS |
| Anonymous asset metadata and direct S3 reads were denied | PASS |
| Private article stayed absent from public list and detail | PASS |
| Production bucket remained empty | PASS |
| Exact canary rows and object versions were removed | PASS |

Evidence recorded on 2026-08-13:

- A local reset applied migrations `0001` through `0006` in order. The complete
  local database suite passed 110 pgTAP assertions, including all 37
  article-asset assertions, and the database lint completed at exit code zero.
- The linked migration push applied only `0006`. A subsequent dry run reported
  local and hosted migration parity. The hosted article-asset suite passed all
  37 assertions transactionally without retaining its fixtures.
- A 20-client contention check admitted 1 of 20 claim attempts and denied the
  remaining 19. Exact contention fixtures were removed afterward.
- Each reviewed CloudFormation update contained exactly three `Modify`
  operations: the bucket CORS rule, bucket policy, and intake-user policy. Both
  previews had no replacement, addition, or deletion, and both stacks reached
  `UPDATE_COMPLETE`.
- The live verifier completed at exit code zero in development `runtime-ready`
  mode and production `foundation` mode. It proved exact conditional-PUT CORS,
  five-minute signature age, quarantine-only writes, denial of
  `s3:GetBucketLocation`, read, delete, list, and out-of-prefix permissions,
  one development key, and zero production keys.
- A real foreground-painted browser created one private community draft and
  uploaded its cover directly to development S3. The private database asset row
  linked the generated quarantine key to the correct unpublished draft; no file
  bytes crossed the Server Action or Xneelo runtime.
- A separate transport canary proved the exact conditional PUT returned `200`
  and replay of the same URL and key returned `412`. Changed key, content type,
  byte length, and out-of-prefix attempts each returned `403`; an unsigned GET
  also returned `403`.
- Read-only object evidence showed the object was encrypted with S3-managed
  `AES256` and had one object version. Anonymous access to `article_assets`
  returned `401`. The private article title was absent from the public list,
  while its streamed detail response rendered the not-found boundary with
  `noindex` and did not expose the title.
- The production bucket had zero current versions and zero delete markers. Its
  intake identity retained zero access keys.
- Exact cleanup removed the two exact S3 object versions and the one exact
  private draft plus its linked asset row. The provisioning CLI lacked
  `DeleteObjectVersion`, so the
  signed-in AWS console performed the reviewed exact-version deletion and
  reported failed count zero. Final exact checks found remaining S3 versions,
  drafts, and assets all at zero.
- Runtime credentials remain only in ignored, mode `0600` `.env.local`. No
  account identifier, ARN, object key, project reference, credential, secret,
  capability, or presigned URL was added to source control or this record.

Configuration changed:

- Applied migration `0006` to the shared hosted Supabase project. Migrations
  `0001` through `0006` are now applied and frozen.
- Updated both private S3 stacks from the Step 8 POST foundation to the Step 9
  conditional PUT boundary. Direct public reads remain denied.
- Created exactly one development intake access key and configured only the
  ignored local review runtime. Production remains credential-free.
- Added the private metadata, capability, presign, direct-upload, form, runtime
  configuration, infrastructure, verifier, and test contracts to the repository.
- Did not add processing, public asset delivery, DNS, Cloudflare site proxy,
  DDoS rollout, production credentials, or a public deployment.

Rollback:

Rollback status: Partially tested. Exact canary object and database cleanup was
exercised. Credential revocation, application rollback, and CloudFormation
rollback were not exercised because the verified development intake remains in
use for the next authorised step.

- Remove the image field and presign endpoint while leaving text submissions
  operational through the Step 9 RPC with every asset argument set to null.
- Deactivate and delete the development access key first, remove its values from
  local runtime configuration, and rebuild the review container.
- Apply reviewed forward CloudFormation change sets that remove the intake CORS
  rule and write permission. Do not restore browser `POST` or
  `s3:GetBucketLocation`.
- Leave migration `0006` and its text-draft RPC in place. Applied migration
  `0006` must not be edited or reversed; make any schema correction in another
  forward migration. Its revocation of direct secret-role news table access
  means the old direct insert must not be restored.
- Audit every exact current and noncurrent canary version before removal. Do not
  delete either retained bucket or stack. Lifecycle rules clean abandoned
  quarantine objects after seven days.

## Step 10: process, moderate, and publish assets

Status: Complete (2026-08-13)

- Trigger the approved isolated processor when a quarantine object arrives.
- Read actual bytes and reject extension or header-only claims.
- Decode the image, enforce pixel limits, strip metadata, remove animation,
  and re-encode a controlled WebP derivative. Generate responsive variants if
  approved in Step 1.
- Record checksum, detected type, dimensions, byte size, and processing state.
- Give admins short-lived access to processed previews, not raw public URLs.
- Require admin approval and meaningful alt text before publication.
- On publication, copy or promote the approved derivative to the published
  prefix and update the article transactionally.
- Reject or delete assets without affecting the text draft.

Evidence required:

- Valid JPEG, PNG, and WebP cases plus malformed, oversized, decompression
  bomb, polyglot, animated, metadata-bearing, and unsupported-file cases.
- Proof that original metadata is absent from the published derivative.
- Admin workflow evidence for approve, reject, replace, and unpublish.

Evidence recorded on 2026-08-13:

- Forward migration `0007` was applied to the linked project. A fresh local
  reset applied migrations `0001` through `0007`; all 192 pgTAP checks passed
  and database lint completed without schema errors.
- The isolated development processor runs on Node 24 with Sharp `0.35.3`.
  Its bounded adversarial suite covers valid JPEG, PNG, and still WebP plus
  malformed, oversized, high-pixel, animated, polyglot, metadata-bearing, and
  unsupported inputs. It emits three controlled WebP derivatives and writes
  the private manifest last.
- A reviewed two-phase development CloudFormation update added the processor,
  failure queue, logs, moderator identity, and exact quarantine notification
  without replacing the retained bucket. The processor became active and its
  failure queue remained empty. The production bucket remained empty and its
  runtime identity remained credential-free.
- A foreground browser canary saved one private WebP cover, produced the three
  expected private WebP derivatives and private manifest, synchronized the
  result, and rendered its processed same-origin preview through the
  authenticated route. The cover was approved while the article remained a
  private draft; the anonymous detail route returned not found.
- The private canary remains unpublished for Step 11 continuity. Step 11 must
  establish controlled public delivery before a managed cover is exposed.
- The repository tests, TypeScript check, lint, production build, isolated
  processor build, and review-container rebuild passed; the container reported
  `running healthy`.

Configuration changed:

- Applied forward migration `0007`; no applied migration was rewritten.
- Enabled the development-only Lambda notification and private processing
  resources. Production asset processing and credentials remain disabled.
- Added one development moderator credential to the ignored mode-600 runtime
  environment. No credential value is recorded here.

Rollback:

- Disable the development notification, revoke the exact moderator credential,
  remove its local runtime values, and rebuild the review container.
- Keep originals and derivatives private. Clear an article's managed cover
  reference through the admin action before deleting exact object versions.
- Keep migrations `0006` and `0007` in place and make any correction through a
  new forward migration.

## Step 11: add controlled public delivery

Status: Complete (2026-08-13)

Evidence recorded on 2026-08-13:

- Separate development and production CloudFront distributions reached their
  terminal healthy states. Both use an always-signed S3 Origin Access Control,
  exact distribution-bound bucket grants, HTTPS redirect, HTTP/2 and HTTP/3,
  and the approved managed cache and security-header policies. The two
  environments remain isolated.
- The development and production S3 stacks were updated through reviewed
  change sets. The changes modified only the expected bucket policies and the
  development moderator policy; no bucket, identity, object, or stack resource
  was replaced or deleted.
- The exact `assets` subdomain was delegated from Xneelo to its isolated DNS
  zone. The apex, `www`, and mail records were not changed. The production
  distribution now answers at `assets.bdag.community` with a valid TLS
  certificate for that exact hostname.
- Direct S3 access to the canary object was denied with `403`. The managed delivery
  request returned `200`, then `Hit from cloudfront`, with `image/webp`, HSTS,
  `nosniff`, and `Cache-Control: public, max-age=31536000, immutable`.
- The published cover contract exposes only the deterministic `640`, `1024`,
  and `1600` WebP variants. Public URLs are derived server-side from exact
  article and asset UUID records; arbitrary public image origins are not an
  application input or publication path.
- A foreground desktop review and a `390` pixel wide review both rendered the
  managed image with meaningful alt text and no horizontal overflow. The
  canary was then unpublished, and its anonymous article route returned `404`.
- The three immutable development canary versions remain available only through
  managed delivery and are not referenced by a published article. The
  production bucket still contains zero object versions and zero delete
  markers, and its intake identity still has zero access keys.
- Both S3 foundation verifiers and the development delivery verifier completed
  successfully. Authoritative DNS, TLS name, security-header, and `403` checks
  proved the production custom hostname; the workstation resolver retained a
  temporary negative DNS cache from before the alias existed.
- The final repository gate passed with `400` Node tests, TypeScript, lint,
  application and isolated-processor production builds, and diff checks. The
  exact review-container rebuild exited zero and became `running healthy`; its
  health endpoint returned `200`.
- AWS Shield Standard automatically protects the CloudFront and Route 53 edge
  at no additional charge. This proves the asset delivery edge only. Step 12
  must still proxy the main site through Cloudflare and prevent direct access
  to the Xneelo origin before site access is described as DDoS-protected.

Configuration changed:

- Added an account-neutral controlled-delivery stack, a read-only verifier,
  exact private-origin bucket grants, immutable published-copy metadata, and
  server-derived responsive managed-image rendering.
- Added the non-secret environment selector and exact delivery origin to the
  build/runtime contract. No AWS credential, object coordinate, certificate
  token, distribution identifier, or secret value was added to source.
- Created one isolated Route 53 hosted zone for the production asset subdomain.
  Standard pricing is USD 0.50 per month for each of the first 25 hosted zones;
  CloudFront remains usage-priced and Shield Standard adds no separate charge.

Rollback:

- Unpublish or clear managed article references first so pages fall back to
  existing placeholder art. Do not disable a distribution while any published
  article depends on it.
- Revert the exact S3 distribution ARN parameter through a reviewed change set,
  then disable the matching distribution. For production, remove only the
  `assets` delegation after confirming the alias and certificate are no longer
  used; leave the apex, `www`, and mail DNS untouched.
- Immutable versioned replacement is the normal cache invalidation mechanism.
  Emergency purge and public-rollout rollback remain Step 12 operational work.

## Step 12: public rollout and operations

- Deploy the already-proven production Supabase configuration and approved AWS
  configuration through reviewed infrastructure or exact recorded commands.
- Store secrets in the approved deployment secret store. Do not commit them or
  expose service-role/AWS/Resend values as build-time public variables.
- Configure backups, Supabase recovery expectations, AWS alarms, Resend
  monitoring, and moderation ownership.
- Complete the deferred AWS monitoring decision. If the recorded budget is
  approved, activate `Project=bdag-community` as a cost-allocation tag and have
  a billing-authorized identity create the monitor-only budget. Decide whether
  production evidence justifies paid CloudWatch request metrics and alarms.
- Complete the start-before-stop deployment and readiness-deadline blockers
  before this feature is publicly enabled.
- Proxy the canonical apex and `www` DNS records through Cloudflare before the
  traffic switch. Restrict Xneelo HTTP and HTTPS ingress to current Cloudflare
  IP ranges, or route it through an approved Cloudflare Tunnel, so attackers
  cannot bypass Cloudflare and address the origin directly.
- Enable and verify the appropriate Cloudflare DDoS and rate-limiting controls,
  audit historical DNS and certificate records for origin disclosure, and
  document how Cloudflare IP-range updates reach the origin firewall.
- Run a controlled canary: text draft, optional byline, suggestion email,
  quarantine upload, processing, admin approval, publication, unpublication,
  and deletion.
- Record costs and set a review date for spam volume, storage retention, and
  delivery failures.

Evidence required:

- Full repository gate exit code.
- Healthy candidate deployment before traffic switch.
- Cloudflare-proxied DNS, origin-bypass denial, and controlled DDoS evidence.
- Redacted production canary matrix and rollback rehearsal.
- Confirmed owner for the moderation inbox and provider alerts.

Rollback:

- Disable public contribution CTAs.
- Revoke provider/runtime credentials.
- Preserve private drafts and quarantine assets for the approved retention
  period unless the owner explicitly authorises deletion.
- Roll traffic back to the last healthy container without destroying the new
  database or bucket.

## Step record

| Step | Status | Evidence | Rollback tested | Notes |
| --- | --- | --- | --- | --- |
| 1 | Complete | Owner decision record and live read-only Xneelo/DNS evidence above | Not applicable | Documentation only; no cloud mutation |
| 2 | Complete | Linked healthy project, local-only credentials, and empty remote migration ledger documented above | Credential rotation verified; project deletion not tested | No migrations or application tables applied |
| 3 | Complete | Local and linked migrations, 28-check pgTAP suite, hosted RLS matrix, and exact cleanup recorded above | Demotion and fresh-token boundary verified; schema rollback is forward-only | Applied migrations `0001` through `0003` are frozen |
| 4 | Complete | Static ISR classification, live visibility matrix, cache headers, payload measurements, and zero-row cleanup recorded above | Supabase runtime-removal fallback documented; not exercised against public traffic | Public news is cookie-free and cacheable |
| 5 | Complete | Two tagged drafts, admin publish/unpublish journey, foreground desktop/mobile evidence, unavailable-provider preservation, and final tagged count zero recorded above | Successful canary was unpublished and exact tagged rows deleted | Step 6 later completed |
| 6 | Complete | Verified sending DNS, scoped key, real mailbox, provider delivered event, inbox receipt, executable failure matrix, and healthy rebuilt review container | Missing configuration and disposable failure environments exercised; real-key revocation documented but not exercised | 390px browser measurement remains explicitly unverified |
| 7 | Complete | Production widget, active company administrator with 2FA, durable rate and replay migrations, 73-check pgTAP suite, hosted concurrency, scheduler success, post-fix replay, action-binding, provider-down, narrow-layout, and cleanup evidence recorded above | Provider-down and exact canary cleanup exercised; credential rotation verified | Recovery codes remain a manual follow-up; Step 9 later completed |
| 8 | Complete | Two private stacks reached `CREATE_COMPLETE`; exact three-resource previews, AWS validations, checksum match, both verifier exit codes, and monitoring permission audit are recorded above | No destructive rollback exercised | Storage foundation complete; budget and CloudWatch monitoring deferred to Step 12 and do not block Step 9 |
| 9 | Complete | Migration parity, local and hosted pgTAP, contention, exact safe stack updates, both verifier modes, credential counts, foreground upload, conditional transport matrix, privacy checks, and exact cleanup are recorded above | Partially tested: exact object and row cleanup exercised; key, application, and stack rollback not exercised | Private development quarantine intake only; Step 10 processing and all public delivery remain not started |
| 10 | Complete | Migration 0007, 192 local pgTAP checks, processor security matrix, reviewed development stack updates, private browser canary, same-origin preview, admin approval, production-empty proof, and full repository/container gates are recorded above | Not exercised; exact notification-disable, credential-revoke, private-object, and forward-migration rollback is recorded | Private processing and moderation only; Step 11 later completed |
| 11 | Complete | Isolated private-origin distributions, reviewed no-replacement S3 updates, exact subdomain TLS, direct-origin denial, immutable cache hit, responsive foreground canary, unpublish/404, production-empty proof, and live verifier evidence are recorded above | Not exercised; reference-first, ARN-removal, exact subdomain-delegation, and immutable-replacement rollback recorded | Asset delivery only; Step 12 still owns Cloudflare site proxy, Xneelo origin lock, production rollout, and operations |
| 12 | Not started | None | No | |
