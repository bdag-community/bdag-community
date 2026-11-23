import Link from "next/link";
import { Mail, ArrowUpRight, ShieldAlert, Heart } from "lucide-react";
import { Section } from "@/components/ui/Section";
import { Disclaimer } from "@/components/site/Disclaimer";
import { CurrentYear } from "@/components/site/CurrentYear";
import { MainnetRpcReference } from "@/components/chain/MainnetConnection";
import { MAINNET_EXPLORER_URL } from "@/lib/chain/mainnet-endpoints";
import {
  CHAIN,
  CHANNELS,
  CONTACT_EMAIL,
  CONTACT_EMAIL_MOCK,
  RELEASES_PAGE,
  RISK_SMALL_PRINT,
  SITE,
} from "@/lib/content/site";

/**
 * Public-site footer chrome. Multi-column: brand + participation links + the
 * canonical network endpoints (the trust anchor of the whole site), then the
 * non-affiliation Disclaimer, then a bottom bar (risk small-print + copyright).
 * All links keyboard-focusable with a visible ring; copy comes from site.ts.
 */
const COLUMNS = [
  {
    heading: "Participate",
    links: [
      { label: "The Chain", href: "/chain" },
      { label: "Community", href: "/community" },
      { label: "Mining", href: "/mining" },
      { label: "Staking", href: "/staking" },
      { label: "Projects", href: "/community/projects" },
      { label: "Testnet", href: "/testnet" },
      { label: RELEASES_PAGE.title, href: RELEASES_PAGE.href },
    ],
  },
  {
    heading: "Read",
    links: [
      { label: "Articles", href: "/articles" },
      { label: "Community guides", href: "/guides" },
      { label: "FAQ", href: "/faq" },
      { label: "Contact", href: "/contact" },
    ],
  },
] as const;

const LINK =
  "rounded text-on-surface-variant transition-colors hover:text-accent-soft " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent " +
  "focus-visible:ring-offset-2 focus-visible:ring-offset-base-void";

/* Canonical-endpoint links: machine-facing data reads teal, brightening on
   hover (page links stay purple-soft — the roles must not blur). */
const NETWORK_LINK =
  "rounded text-teal-soft/80 transition-colors hover:text-teal-soft " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent " +
  "focus-visible:ring-offset-2 focus-visible:ring-offset-base-void";

const FOCUS =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent " +
  "focus-visible:ring-offset-2 focus-visible:ring-offset-base-void";

const SOCIAL_CHANNELS = CHANNELS.filter(
  (channel) => channel.name === "YouTube" || channel.name === "X (Twitter)" || channel.name === "GitHub",
);

export function Footer() {
  return (
    <footer className="relative mt-20 border-t border-border/60 bg-gradient-to-b from-container/30 to-base-void">
      {/* Brand gradient hairline along the very top edge — magenta sweeping
          into the live-teal terminus, mirroring the header's line. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-[#381c56]"
      />

      <Section as="div" className="flex flex-col gap-10 py-12">
        {/* Brand + link columns */}
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-[1.6fr_1fr_1fr_1.4fr]">
          {/* Brand */}
          <div className="flex flex-col gap-4">
            <Link
              href="/"
              aria-label={`${SITE.name}, home`}
              className={`w-fit rounded ${FOCUS}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo.svg" alt="" className="h-9 w-auto" />
            </Link>
            <p className="max-w-xs text-sm text-on-surface-variant">
              {SITE.positioning} Run by the community, for the love of the
              project.
            </p>
            {!CONTACT_EMAIL_MOCK ? (
              <a
                href={`mailto:${CONTACT_EMAIL}`}
                className={`inline-flex min-h-[44px] w-fit items-center gap-2 py-2 text-sm ${LINK}`}
              >
                <Mail
                  className="size-4 text-accent-soft"
                  strokeWidth={1.75}
                  aria-hidden
                />
                {CONTACT_EMAIL}
              </a>
            ) : null}
            <ul aria-label="Follow BDAG Community" className="flex flex-wrap gap-x-5 text-sm">
              {SOCIAL_CHANNELS.map((channel) => (
                <li key={channel.name}>
                  <a
                    href={channel.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`inline-flex min-h-[44px] items-center gap-1.5 ${LINK}`}
                  >
                    {channel.name}
                    <ArrowUpRight className="size-3.5" strokeWidth={1.75} aria-hidden />
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* Page-link columns */}
          {COLUMNS.map((col) => (
            <nav
              key={col.heading}
              aria-label={col.heading}
              className="flex flex-col gap-3"
            >
              <h2 className="font-mono text-xs font-medium uppercase tracking-[0.18em] text-on-surface">
                {col.heading}
              </h2>
              <ul className="flex flex-col gap-1 text-sm">
                {col.links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className={`inline-flex min-h-[44px] items-center py-1.5 ${LINK}`}
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}

          {/* Canonical network endpoints — the site's trust anchor. Machine-
              facing network data wears teal (DESIGN.md accent roles). */}
          <div className="flex flex-col gap-3">
            <h2 className="font-mono text-xs font-medium uppercase tracking-[0.18em] text-on-surface">
              Canonical network
            </h2>
            <ul className="flex flex-col gap-1 text-sm">
              <li>
                <a
                  href={MAINNET_EXPLORER_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`inline-flex min-h-[44px] items-center gap-1 py-1.5 font-mono text-xs ${NETWORK_LINK}`}
                >
                  {new URL(MAINNET_EXPLORER_URL).host}
                  <ArrowUpRight
                    className="size-3.5"
                    strokeWidth={1.75}
                    aria-hidden
                  />
                </a>
              </li>
              <li>
                <MainnetRpcReference
                  format="link"
                  className={`inline-flex min-h-[44px] items-center gap-1 py-1.5 font-mono text-xs ${NETWORK_LINK}`}
                />
              </li>
              {/* Shares the links' 44px row box so the three rows keep one
                  rhythm: as a plain short line it made the gap under the
                  explorer link (tall row to tall row) read larger than the
                  gap under the RPC link (tall row to this short one). */}
              <li className="flex min-h-[44px] items-center py-1.5 font-mono text-xs text-teal-soft/80">
                Chain ID {CHAIN.chainId} · {CHAIN.currency.symbol} · Genesis{" "}
                {CHAIN.genesisLabel}
              </li>
            </ul>
          </div>
        </div>

        {/* Non-affiliation disclaimer (kept prominent, in a subtle card) */}
        <div className="rounded-xl border border-border/60 bg-base-void/40 p-4">
          <Disclaimer variant="footer" />
        </div>

        {/* Bottom bar */}
        <div className="flex flex-col gap-4 border-t border-border/60 pt-6">
          <p className="flex items-start gap-1.5 text-xs text-on-surface-variant">
            <ShieldAlert
              className="size-3.5 shrink-0 translate-y-0.5"
              strokeWidth={1.75}
              aria-hidden
            />
            <span>{RISK_SMALL_PRINT}</span>
          </p>
          <div className="flex flex-col gap-2 text-xs text-on-surface-variant sm:flex-row sm:items-center sm:justify-between">
            {/* CurrentYear, not new Date() here: this footer is prerendered
                into five routes, so a server-rendered year is the build year. */}
            <p>
              © <CurrentYear /> {SITE.name}
            </p>
            <p className="inline-flex items-center gap-1.5">
              Built for the love of the project
              <Heart
                className="size-3.5 fill-accent-pink text-accent-pink"
                aria-hidden
              />
            </p>
          </div>
        </div>
      </Section>
    </footer>
  );
}
