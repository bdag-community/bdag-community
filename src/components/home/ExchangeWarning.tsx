import Link from "next/link";
import { ArrowRight, Network, Server, ShieldAlert } from "lucide-react";
import { Section } from "@/components/ui/Section";
import { Button } from "@/components/ui/Button";
import { CopyRef } from "@/components/ui/CopyRef";
import { MainnetRpcReference } from "@/components/chain/MainnetConnection";
import { MAINNET_EXPLORER_URL } from "@/lib/chain/mainnet-endpoints";
import { SpineFrame } from "@/components/spine/SpineFrame";
import { Reveal } from "@/components/ui/Reveal";
import { CHAIN, ENDPOINT_LABELS, EXCHANGE_WARNING } from "@/lib/content/site";

/** The card labels its own section off its title. */
const TITLE_ID = "exchange-warning-title";

/**
 * A quiet, static sibling of the Chain primer instruments shared by both fork
 * warnings. Three integration paths resolve through one verified ledger and
 * leave through the pinned canonical route; teal keeps it in the card's own
 * register without replaying the primer's purple concept art.
 */
function ExchangeWarningNode() {
  return (
    <span className="exchange-warning-node" aria-hidden="true">
      <span className="exchange-warning-node-glass">
        <span className="exchange-warning-node-energy" />
        <svg
          viewBox="0 0 320 320"
          className="exchange-warning-node-art"
          focusable="false"
        >
          <g className="exchange-warning-node-art-grid">
            <path d="M48 92h48l29 30" />
            <path d="M48 160h58" />
            <path d="M48 228h48l29-30" />
          </g>
          <g className="exchange-warning-node-art-nodes">
            <circle cx="48" cy="92" r="8" />
            <circle cx="48" cy="160" r="8" />
            <circle cx="48" cy="228" r="8" />
            <path d="m160 105 54 31v62l-54 31-54-31v-62Z" />
            <circle cx="272" cy="160" r="10" />
          </g>
          <path className="exchange-warning-node-art-flow" d="M214 160h58" />
          <path
            className="exchange-warning-node-art-check"
            d="m136 161 16 16 34-37"
          />
        </svg>
        <span className="exchange-warning-node-specular" />
        <span className="exchange-warning-node-label">canonical</span>
      </span>
      <svg
        viewBox="0 0 144 144"
        className="exchange-warning-node-rings"
        focusable="false"
      >
        <circle cx="72" cy="72" r="65" fill="none" />
        <circle cx="72" cy="72" r="59" fill="none" />
        <circle className="exchange-warning-node-port" cx="72" cy="137" r="1.8" />
      </svg>
    </span>
  );
}

/**
 * The fork warning for exchanges and integrators. Deliberately NOT in the
 * brand gradient language: warning cards frame in teal over a darker-than-page
 * fill (DESIGN.md warning surfaces), and the canonical config is copyable so
 * the safe path is the easy path.
 *
 * ONE card, one rendering. It used to have a `compact` variant for /chain,
 * which sat inside that page's Connect section and dropped the endpoint list
 * because Connect listed the same values a few hundred pixels above it. Both
 * are gone: /chain now renders this card exactly as Home does, and the
 * duplicate endpoint list it was working around went with it. A card that
 * renders one way cannot drift between pages, which is the failure this
 * component was extracted to fix in the first place.
 */
export function ExchangeWarning() {
  const card = (
    <div
      role="note"
      // The spine is mounted on Home only, so on every other page the frame
      // renders inert: it rests fully retracted and nothing ever draws it.
      data-spine-frame="cross"
      data-spine-hue="teal"
      className="relative isolate rounded-2xl border border-accent-teal/45 bg-base-void/60 p-6 sm:p-8"
    >
      <SpineFrame />
      <ExchangeWarningNode />

      <p className="label-caps flex items-center gap-2 text-accent-teal">
        <ShieldAlert className="size-4 shrink-0" strokeWidth={1.75} aria-hidden />
        {EXCHANGE_WARNING.label}
      </p>

      {/* scroll-mt clears the sticky header: the FAQ links straight to this
          heading, and the site's anchor convention is scroll-mt-24. */}
      <h2 id={TITLE_ID} className="h3 mt-4 scroll-mt-24 text-on-surface">
        {EXCHANGE_WARNING.title}
      </h2>

      <p className="body mt-3 max-w-[72ch] text-on-surface">
        {EXCHANGE_WARNING.body}
      </p>

      {/* The three values an integrator has to get exactly right, together
          and copyable. The compact placement renders none of it: it sits
          inside /chain's own connect section, which puts these same values
          under a copy button a few hundred pixels above it. Repeating them
          there would make a reader check whether the two lists agree, which
          is the one doubt this card exists to remove. */}
      <div className="mt-6 border-t border-accent-teal/20 pt-5">
          {/* The card's three section labels share ONE register: teal,
              label-caps, icon first. They are the spine of the card — what it
              warns against, what to use instead, and what to do better — so
              they have to read as three steps of one argument rather than as
              a heading and two unrelated sub-labels. */}
          <p className="label-caps flex items-center gap-2 text-accent-teal">
            <Network
              className="size-4 shrink-0"
              strokeWidth={1.75}
              aria-hidden
            />
            {EXCHANGE_WARNING.endpointsTitle}
          </p>
          {/* min-w-0 on each cell: a grid item's automatic minimum size is its
              min-content width, and these values are long unbreakable tokens. */}
          <dl className="mt-4 grid gap-x-8 gap-y-5 sm:grid-cols-2 lg:grid-cols-3">
            <div className="flex min-w-0 flex-col gap-1">
              <dt className="label-caps text-on-surface-variant">
                {EXCHANGE_WARNING.rpcLabel}
              </dt>
              <dd>
                <MainnetRpcReference format="copy" />
              </dd>
              {/* A text link, not a second button: the card has one action,
                  and it is running your own node. It points at the node
                  board — the page that evidences the claim above. */}
              <dd className="mt-1">
                <Link
                  href={EXCHANGE_WARNING.more.href}
                  className="focus-ring group inline-flex items-center gap-1.5 text-sm font-medium text-accent-soft"
                >
                  {EXCHANGE_WARNING.more.label}
                  <span className="sr-only">
                    {EXCHANGE_WARNING.more.context}
                  </span>
                  <ArrowRight
                    className="size-4 transition-transform group-hover:translate-x-0.5"
                    strokeWidth={2}
                    aria-hidden
                  />
                </Link>
              </dd>
            </div>
            <div className="flex min-w-0 flex-col gap-1">
              <dt className="label-caps text-on-surface-variant">
                {EXCHANGE_WARNING.explorerLabel}
              </dt>
              <dd>
                <CopyRef
                  value={MAINNET_EXPLORER_URL}
                  label="explorer URL"
                />
              </dd>
            </div>
            <div className="flex min-w-0 flex-col gap-1">
              <dt className="label-caps text-on-surface-variant">
                {ENDPOINT_LABELS.chainId}
              </dt>
              <dd>
                <CopyRef
                  value={`${CHAIN.chainId} (${CHAIN.chainIdHex})`}
                  label="chain ID"
                />
              </dd>
            </div>
          </dl>
      </div>

      {/* The recommendation. It is the only advice on this card that costs us
          the dependency, so it keeps its own rule and its own way off the page
          rather than being appended to a paragraph about our endpoint. */}
      <div className="mt-6 border-t border-accent-teal/20 pt-5">
        <p className="label-caps flex flex-wrap items-center gap-2 text-accent-teal">
          <Server className="size-4 shrink-0" strokeWidth={1.75} aria-hidden />
          {EXCHANGE_WARNING.recommendTitle}
          {/* The recommendation is the point of the card, so it says so — as
              a badge rather than another clause of prose. */}
          <span className="rounded-full border border-accent-teal/40 bg-accent-teal/10 px-2 py-0.5 text-[0.625rem] tracking-[0.18em]">
            {EXCHANGE_WARNING.recommendBadge}
          </span>
        </p>
        <p className="body mt-3 max-w-[72ch]">{EXCHANGE_WARNING.recommend}</p>
        <Button
          href={EXCHANGE_WARNING.recommendCta.href}
          variant="ghost"
          className="mt-4"
          trailingIcon={
            <ArrowRight
              className="size-4 transition-transform group-hover:translate-x-0.5"
              strokeWidth={2}
              aria-hidden
            />
          }
        >
          {EXCHANGE_WARNING.recommendCta.label}
        </Button>
      </div>
    </div>
  );

  return (
    <Section as="section" aria-labelledby={TITLE_ID}>
      <Reveal>{card}</Reveal>
    </Section>
  );
}
