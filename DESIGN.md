# DESIGN.md — BDAG Community (bdag.community)

The design authority for this repo. Live token source: `tailwind.config.ts` +
`src/app/globals.css`. Written 2026-08-05 for the v1 build.

## The world: "Stately Plum" — big brother of bdag-miner-sales

bdag-miner-sales (bdag.co) is the family's industrial hardware storefront:
uppercase display, product carousel, commerce urgency. **bdag-community is the
family seat** — the canonical home of the network and the people running it.
Same bloodline, older sibling: calmer, statelier, more elegant, and
magenta-forward where the sibling is purple-forward.

Shared DNA (binding, from the family system):
- Deep violet-black void background, three-tier tonal layering, 1px hairline
  borders, depth from glow blooms not drop shadows.
- Glass cards (translucent gradient + backdrop blur), pill buttons with DARK
  text on the bright gradient, mono eyebrows/labels.
- Fonts: Poppins (display — the free Gilroy/Hiveon stand-in, adopted
  family-wide 2026-08-05; swap to licensed Gilroy behind --font-display if
  purchased) / Inter (body) / Geist Mono (data — adopted on this site
  2026-08-06, replacing JetBrains Mono; the sibling still carries JetBrains
  until the owner asks for the mirror).
- The BDAG COMMUNITY logo lockup (`/public/logo.svg`) + wave-mark favicon.
- Mechanical, precise motion — ease `[0.22, 1, 0.36, 1]`, no bounces; full
  reduced-motion fallbacks.

What makes the big brother ITS OWN (the elegant touches):
1. **The spectrum extends into pink.** The sibling's signature gradient is
   purple→magenta (2-stop). Ours is purple→magenta→**pink** (3-stop,
   `#A856FB → #D33AEE → #F45FC4`). Pink is the community's contribution to the
   family palette; the ambient wash leads with magenta where the sibling leads
   with purple.
2. **Sentence-case stateliness.** No uppercase hero shouting. Display type is
   large, tight-tracked, normal case, with generous air (section rhythm
   py-20→28 vs the sibling's tighter stack). Elegance = scale + space, not
   volume.
3. **The DAG is the decoration.** Ornament must mean something: the hero's
   animated background is a field of GROWING DAG FILAMENTS (rebuilt
   2026-08-05 from the owner's dendrite reference) — chains of tiny hollow
   block-rings that grow node by node, fork into parallel branches, carry
   electric pulses along their parent links, hold, then dissolve
   while new structures ignite elsewhere — and chains NEVER visibly
   disappear: after their hold they dim out in place (uniform ~0.9s, no
   dissolve) and go DARK, still in the graph and pointer-revealable for
   12–26s, then recycle invisibly from the dark. The field is DIRECTED:
   every chain flows one way, aimed very loosely at the hero's focal point
   (horizontal centre, 20% up from the bottom) so chains converge instead
   of marching in parallel; half seed just beyond the frame — weighted to
   the top/left/right so entries stream in through the upper corners
   (canvas-clipped, no overflow); tips that reach the far side retire
   rather than turn back. Seeding is a shuffled GRID — every ~140px cell
   owns a chain and respawns keep their home cell — so almost no patch of
   screen lacks a chain, visible or dark, for the pointer to find. Most of
   the graph is hidden: ~30% of chains are born dark and every visible
   chain eventually joins them, so at rest only ~a quarter of the field
   shows. Dark chains materialise only where energy touches them and sink
   back as it decays (~0.7s); ambient bolts strike them ~30% of the time.
   A hidden INTERLINK web joins the chains into one graph: each chain
   links to its ≤3 nearest neighbours via the closest ring pair, drawn as
   thin dashed accent-soft lines that are invisible until the pointer
   crosses them (which pulses energy into both connected chains) or a
   bolt's wake reaches an endpoint (feature/chain-interlinks branch).
   The POINTER is part of the field: chains within a small circle of the
   cursor (85px, taps 105px) glow — ghosts included — and fire a bolt
   downstream toward their tip (700ms per-chain cooldown). Half of all
   bolts fire teal (slightly larger and brighter) and ~22% of chains are
   turquoise end-to-end — the energy accent, prominent but secondary to
   the brand hues. Colour otherwise ramps magenta→purple→teal along the
   diagonal, over the faint dotted-column backdrop. The timeline is a
   vertical DAG rail, section dividers are hairline "edges". No generic
   particles.
4. **Data is jewellery.** Live numerals (block height, peers) set in Geist
   Mono with count-up motion are a first-class visual element — the network's
   pulse worn on the surface.
5. **The site is one chain.** (Added 2026-08-06.) A single DAG spine runs the
   length of every page. It is born as a hollow ring — an UNMINED BLOCK — at
   30% up from the hero's bottom edge, the same point every chain in the
   field aims at. Scrolling discharges the field into it: chains fire
   nearest-first, dark ones materialise as their own bolt runs them, the
   hidden interlink web surfaces at mid-charge, and the ring's arc fills one
   tick per arrival until its teal core ignites. The chain then leaves the
   hero on a lazy cubic, settles into the margin beside the content column,
   sprouts a block at every section, forks into dead branches, shadows itself
   with a ghost strand, and terminates in a live teal block above the footer.
   A luminous head rides the reader's own eye-line down it.
   **The ring must never be plugged** — a filled disc is a mined block, and
   the arc fill is the whole point. **The spine is a graph, not a rail:** a
   rail with dots is a timeline, so every page carries at least one fork.
   **No interactive nodes and no margin labels** — decoration must not become
   a second navigation; the only link is the hero block, which inherits the
   old scroll cue's contract. **The chain is never built by scroll, only lit
   by it:** the descender runs the whole drop from the block to the hero's
   bottom edge as a dark hairline from the first frame, and every hairline in
   the chain — trunk, head, ticks, forks, descender, and the canvas field's
   own edges — is 1.2px / stroke-width 1.2, in step.
6. **The chain routes, it does not just descend.** (Added 2026-08-06.) Below
   the hero the chain stops being a margin rail and becomes an ORTHOGONAL
   CIRCUIT: down out of the hero, left above the stats band's label, down the
   rail, right through the cell row, down past the band, left to the middle,
   and down onto the warning card's top edge. Turns are rounded quarter arcs
   (radius clamped to half the shorter neighbour AND to the drawn room either
   side, or the arc is painted across the first block on a row and clipped
   away past the last). **Every cell on that row is a BLOCK on the chain**,
   framed in brand purple, and the chain is NOT drawn across it: it arrives at
   the block's edge, two half-frames released there travel opposite ways round
   and meet where it leaves, and the travelling front is hidden between. The
   warning card gets exactly the same contract at section scale — its own
   border is the chain, released at the top centre, meeting at the bottom
   centre, where the chain carries on. The chain never crosses either.
   **It keeps going.** Below the card it turns around the timeline's label and
   runs THROUGH the timeline, which is laid out horizontally for the purpose:
   the chain is that section's rail, each node sits on it, and each ignites as
   the chain arrives. Then down the margin past the prose (never across it —
   the nodes are at the top of their columns and the text hangs below), back
   to the middle, and on into the mining section, which is framed like the
   card. Below it the chain FORKS: two arms out to the staking and development
   cards, each becoming that card's frame, meeting again in the middle. The
   arms are emitted as their own routes at the same offset, so they draw
   together rather than one after the other — a fork that drew sequentially
   would be a detour. From the merge it runs straight down the MIDDLE, behind
   whatever is in the way, and ends on the non-affiliation notice — framed in
   teal, like the exchange warning, because both are read-this-first surfaces.
   **Once the circuit reaches its last framed section the margin rail is gone
   from that page entirely**: the chain ends on the centre line with a live
   teal terminus, and a rail reappearing in the margin below it would read as
   a second chain. **Frames are purple; teal is reserved for the sections
   that are teal-branded**, and the chain itself runs the site's own
   top-to-bottom ramp (purple → magenta → pink) after picking up the teal the
   hero descender lands on. **The route is opt-in and all-or-nothing**
   (`data-spine-band` / `-label` / `-cell` / `-card`); a page missing any one of
   them keeps the plain rail, because half a circuit routes the chain into
   empty space. **Rows are grouped by vertical overlap, never by equal tops** —
   the cell row is `items-end`, so one wrapped label moves a top by a
   line-height while the row still reads as one row. The circuit crosses
   `.section-surface`, whose translucent veil eats up to 55% of whatever is
   drawn behind it, so its gradient stops are sampled at the BAND's own edges
   and written brighter to compensate; uncompensated, the chain visibly fades
   and recovers for no reason the eye can attribute to anything.
7. **The opening hold.** (Added 2026-08-06; completion/reset contract updated
   2026-08-08.) Arriving at the hero, the first gestures do not scroll: they
   charge the field on the same curve a real scroll would. Only after the block
   is live, visibly full, and its discharge has finished does a bounded smooth
   glide move to the next section, flush under the header.
   This is the ONE place the site takes the scroll, and it is a wheel/touch
   hold, never a scroll trap. It never arms under reduced motion, below the
   top, or on a deep link; every keyboard scroll key passes through UNTOUCHED
   and ends it; an upward gesture, a scroll from any other source, and a hard
   wall-clock cap remain safety exits. A pause preserves partial charge and a
   large downward delta clamps at full charge—neither is false completion.
   Once the hero is offscreen the visual cycle resets exactly once; returning
   to a settled top re-arms it. Letting go never drops a half-finished bolt on
   one frame. **If a change to this makes any input unable to move the page,
   the change is wrong**, whatever it buys.

## Tokens (live source: tailwind.config.ts)

Surfaces (one step plummier than the sibling):
- base-void `#0E0715` · container `#170F23` · elevated `#1F1630`
- border `#3A2B50` · border-strong `#453259` · outline `#6E6385`

Accents:
- accent (brand purple, mark color) `#A856FB` — borders, focus, glows, LARGE
  text only (below AA for body sizes)
- accent-magenta `#D33AEE` · accent-pink `#F45FC4` (community signature)
- accent-soft `#C9A9FF` — the SAFE purple for body-sized text (≥8.8:1)
- pink-soft `#FFB3E2` — the SAFE pink for body-sized text
- accent-teal `#2CE0CE` · teal-soft `#9FF5EB` — the LIVE-TELEMETRY +
  MACHINE-DATA accent (added 2026-08-05 to break the purple/pink field,
  widened same day for site-wide presence). Wears teal: live dots and
  live-data eyebrows ("The network, live", "Nodes"), checked-ago lines, the
  timeline's pulsing "Today" terminal (rail drains accent→teal), ALL
  machine-facing values (CopyRef/CopySnippet mono values, the public RPC
  hostname, the footer's canonical-endpoint links + chain-ID line), the hero
  scroll-cue dot, 2-in-8 constellation blocks, the teal terminus of the
  header/footer hairlines, and a faint ambient bloom. Never for brand chrome,
  CTAs, page links, headings, or semantic success/warn/error states — human
  navigation stays purple/pink; the machine's voice is teal.
- gradient-accent: `linear-gradient(135deg,#A856FB 0%,#D33AEE 55%,#F45FC4 100%)`
- on-primary `#0E0715` (dark text on the bright gradient, AA)

Text: on-surface `#ECE9F3` · on-surface-variant `#A79FB8`
Semantic: warn-orange `#F59E0B` (fork warning + non-affiliation) ·
error `#FFB4AB` · success `#40DD82`

Glows (magenta-led, vs the sibling's purple-led):
- glow: `0 0 40px -4px rgba(211,58,238,0.26), 0 0 64px -16px rgba(244,95,196,0.16)`
- glow-sm: `0 0 22px -6px rgba(211,58,238,0.28)`
- btn: `0 0 24px rgba(211,58,238,0.32), 0 4px 16px rgba(14,7,21,0.6)`

Type scale (globals.css @layer components): `.display` (5xl→7xl→8xl, bold,
leading 0.95, tracking -0.02em, normal case) · `.h1`–`.h4` · `.lead` `.body`
`.body-sm` `.caption` · `.eyebrow` (mono, 0.22em tracking, pink-soft) ·
`.label-caps`. Body measure 60–68ch.

Radii: cards rounded-2xl, tiles/banners rounded-xl, buttons/chips rounded-full.
Layout: max-w-site 1440px, 8px rhythm, gutter 16px (mobile) / 32px (desktop).
Focus: universal focus-visible ring-2 ring-accent ring-offset-base-void; 44px
touch minimums; hoverOnlyWhenSupported.

## Motion doctrine

Ease `cubic-bezier(0.22,1,0.36,1)` everywhere. Reveals 0.6s, stagger 0.09,
whileInView once with -10% bottom margin. The hero identity loop cycles
Engineers→…→Stakers (~0.95s each, vertical slide + fade), then "Community"
enters dramatically (letter-staggered rise from blur + a one-time magenta
bloom), holds 5s, and the loop restarts. Hover pauses it; reduced motion
renders a static gradient "Community" with no loop. Stat numerals count up once on first view
(~1.2s, monospace so digits don't jitter), then tick live. The DAG canvas:
grid-seeded chains (one per ~140px cell, ~1.3x oversampled, ≤84; ring
ceiling computed per viewport, hard cap 3200 — always ABOVE the worst-case
sum of per-chain caps so it never binds in practice; alpha-0 dark rings
short-circuit, so drawn cost stays low),
edges are the DAG's own parent links (no O(n²) proximity pass), ≤14
ambient + ≤6 pointer-triggered pulses, widely-varied holds (5–12s) +
dark spells (12–26s) so chain lifecycles stay decorrelated, DPR-capped
at 2, rAF paused when offscreen/hidden, one static fully-grown frame
under reduced motion (pointer inert, dark chains unrevealed there). No
animation may be a rendering dependency — content is visible with all
motion off.

The spine (`src/components/spine/`) runs a SECOND loop, deliberately tiny:
one `window.scrollY` read and six `setProperty` calls on two shallow
elements per frame, via motion's `frame.read/update/render`. Everything
else — segment fill, head length, node ignition, the hero arc — is a CSS
consequence of those scalars. React renders `<Spine>` exactly once; all
measurement is imperative on fixed element pools, so a stats poll can never
land a re-render mid-fling. The loop stops after 400ms of stillness and the
resting frame IS the resting visual, so stopping is unobservable. Continuous
quantities use frame-rate-independent exponential approach
(`x += (t - x) * (1 - exp(-dt/τ))`), never springs — DESIGN.md forbids
bounces and this is critically damped by construction. The spine and the
hero canvas share exactly one module singleton (`src/lib/spine/bus.ts`);
no coordinates cross it, only the constant `CONVERGE.NODE_FY`.

## Component notes

- **Header**: sticky, bg-base-void/80 + backdrop-blur, hairline bottom border
  with gradient shimmer line; logo h-9/10; nav in Inter 15px; "Join the
  community" gradient pill as the persistent CTA; mobile sheet menu.
- **Buttons**: primary = 3-stop gradient pill, dark text, shadow-btn, hover
  -translate-y-0.5 + shadow-glow, active scale-[0.98]; ghost = border
  accent/70 + text-accent-soft, hover bg-accent/10; quiet = text link with
  underline offset.
- **Cards**: `.glass-card` + border-accent/15 + rounded-2xl; interactive cards
  hover -translate-y-0.5 + border-accent/40 + shadow-glow-sm.
- **Warning surfaces** (fork warning, non-affiliation): accent-teal/45
  hairline over a darker-than-page bg-base-void/60 fill (restyled 2026-08-05
  per the owner — the teal outline with a darker middle), teal label-caps
  header with icon — never blend warnings into the brand gradient language.
  warn-orange remains the semantic caution color for live states (degraded
  nodes, stale stats) and form errors.
- **Gradient text**: `.text-gradient` reserved for the hero identity word and
  at most one moment per page — not every heading (big-brother restraint).

## Copy voice

First-person plural, honest, precise, non-promotional. "We are the community
that has been running BlockDAG Network from Genesis." No fixed-APY promises,
no invented dates/partners; the non-affiliation disclaimer renders on every
public surface via the shared <Disclaimer> component.
