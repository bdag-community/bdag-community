import Link from "next/link";
import { Section } from "@/components/ui/Section";
import { Button } from "@/components/ui/Button";
import { MobileMenu } from "@/components/site/MobileMenu";
import { NavLink } from "@/components/site/NavLink";
import { HEADER_CTA, NAV_LINKS } from "@/lib/content/site";

/**
 * Public-site header chrome. Sticky, translucent deep-plum base with blur and
 * a solid #381c56 hairline along the bottom edge. Logo links home;
 * desktop (lg+) shows active-aware nav + the join CTA; below lg they collapse
 * into the <MobileMenu> drawer (which absolute-anchors to this sticky header
 * via top-full). Server component — no wallet stack on this site.
 */
export function Header() {
  return (
    <header className="sticky top-0 z-50 border-b border-border bg-base-void/80 backdrop-blur-md after:pointer-events-none after:absolute after:inset-x-0 after:bottom-0 after:h-px after:bg-[#381c56]">
      <Section
        as="nav"
        aria-label="Primary"
        className="flex items-center justify-between gap-4 py-4"
      >
        <Link
          href="/"
          className="flex h-11 shrink-0 items-center rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-base-void"
          aria-label="BDAG Community, home"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.svg" alt="" className="h-10 w-auto" />
        </Link>

        <ul className="hidden items-center gap-7 text-sm lg:flex">
          {NAV_LINKS.map((link) => (
            <li key={link.href}>
              <NavLink href={link.href} label={link.label} />
            </li>
          ))}
        </ul>

        <div className="hidden lg:block">
          <Button href={HEADER_CTA.href} size="md">
            {HEADER_CTA.label}
          </Button>
        </div>

        <MobileMenu />
      </Section>
    </header>
  );
}
