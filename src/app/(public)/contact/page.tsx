import type { Metadata } from "next";
import { Mail } from "lucide-react";
import { Section } from "@/components/ui/Section";
import { PageHero } from "@/components/site/PageHero";
import { ContactArt } from "@/components/site/PageHeroArt";
import { Card } from "@/components/ui/Card";
import { Reveal, RevealGroup, RevealItem } from "@/components/ui/Reveal";
import { Disclaimer } from "@/components/site/Disclaimer";
import { ChannelCard } from "@/components/community/ChannelCard";
import { ContactForm } from "@/components/contact/ContactForm";
import {
  CHANNELS,
  COMMUNITY_PAGE,
  CONTACT_EMAIL,
  CONTACT_EMAIL_MOCK,
  CONTACT_PAGE,
  META_DESCRIPTIONS,
} from "@/lib/content/site";

export const metadata: Metadata = {
  title: CONTACT_PAGE.eyebrow,
  // Not the intro: a result snippet is read before the reader has chosen the
  // page, so it gets its own purpose-written line (site.ts META_DESCRIPTIONS).
  description: META_DESCRIPTIONS.contact,
};

/**
 * Contact — the form (server action → contact_messages) beside the channels,
 * so there is always more than one way to reach a community operator. The
 * channels render as non-link placeholders while every entry is mock:true.
 * The email follows the same rule and remains non-linkable until verified.
 *
 * The intro opens in the same three beats as the other six pages: eyebrow
 * fades in, headline rises, lead follows 150ms behind.
 */
export default function ContactPage() {
  return (
    <>
      {/* ------------------------------- Hero ------------------------------- */}
      <Section as="section" aria-labelledby="contact-title">
        <PageHero
          titleId="contact-title"
          title={CONTACT_PAGE.title}
          subtitle={CONTACT_PAGE.subtitle}
          intro={CONTACT_PAGE.intro}
          art={<ContactArt />}
          label="contact"
        />
      </Section>

      {/* -------------------- The form, and the ways round it -------------- */}
      <Section>
        <div className="grid items-start gap-5 lg:grid-cols-[1.4fr_1fr] lg:gap-8">
          <Reveal>
            <Card className="p-6 sm:p-8">
              <ContactForm />
            </Card>
          </Reveal>

          <aside
            aria-labelledby="contact-channels-title"
            className="flex flex-col gap-4"
          >
            <Reveal className="flex flex-col gap-3">
              <h2 id="contact-channels-title" className="h3">
                {CONTACT_PAGE.channelsTitle}
              </h2>
              <p className="body-sm">{COMMUNITY_PAGE.channelsNote}</p>
            </Reveal>

            <RevealGroup className="flex flex-col gap-3">
              {CHANNELS.map((channel) => (
                <RevealItem key={channel.name}>
                  {/* One card, two densities. This column used to carry its
                      own copy of the mock branch; /community carried another
                      that ignored the flag entirely. */}
                  <ChannelCard channel={channel} variant="compact" />
                </RevealItem>
              ))}
            </RevealGroup>

            <Reveal>
              <div className="flex min-h-[44px] items-center gap-2 py-2 text-sm text-on-surface-variant">
                <Mail
                  className="size-4 text-accent-soft"
                  strokeWidth={1.75}
                  aria-hidden
                />
                {CONTACT_EMAIL_MOCK ? (
                  <span>{CONTACT_PAGE.emailPending}</span>
                ) : (
                  <a
                    href={`mailto:${CONTACT_EMAIL}`}
                    className="focus-ring transition-colors hover:text-accent-soft"
                  >
                    {CONTACT_EMAIL}
                  </a>
                )}
              </div>
            </Reveal>
          </aside>
        </div>
      </Section>

      {/* ------------------------------ Legal ------------------------------- */}
      <Section as="section" aria-label="Legal">
        <Disclaimer variant="banner" />
      </Section>
    </>
  );
}
