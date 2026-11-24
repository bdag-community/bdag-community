import {
  ArrowUpRight,
  Building2,
  Clapperboard,
  Cpu,
  GitBranch,
  Megaphone,
  // MessageCircle, // Restore with Reddit after verification.
  MessagesSquare,
  Send,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { CHANNELS, COMMUNITY_PAGE } from "@/lib/content/site";

/** Neutral icons for the channel cards — no brand marks in the icon set. */
const CHANNEL_ICONS: Record<(typeof CHANNELS)[number]["name"], LucideIcon> = {
  Telegram: Send,
  // The same Cpu the nav uses for /mining, so the mining channel reads as
  // the mining side of the site rather than as a second identical Telegram.
  "Telegram (Mining)": Cpu,
  // Neutral speech bubble, not the brand mark, per the rule above.
  // Reddit: MessageCircle, // Temporarily hidden pending verification.
  LinkedIn: Building2,
  Discord: MessagesSquare,
  YouTube: Clapperboard,
  "X (Twitter)": Megaphone,
  CoinMarketCap: TrendingUp,
  GitHub: GitBranch,
};

/**
 * A discriminated union on `mock`, mirroring the data rule in site.ts: a
 * coming-soon channel HAS no handle and no url, so the live-link branch
 * cannot be reached with placeholder strings even by a future rendering
 * bug. A channel goes live by gaining both fields and flipping the flag.
 */
export type Channel = {
  readonly name: (typeof CHANNELS)[number]["name"];
  readonly blurb: string;
} & (
  | { readonly mock: true }
  | { readonly mock: false; readonly handle: string; readonly url: string }
);

export type ChannelCardVariant = "full" | "compact";

/**
 * One channel, in the two densities the site needs.
 *
 * There used to be two of these — Community's card honoured no `mock` flag at
 * all (it hard-coded the chip and rendered every handle as inert text, so it
 * happened to look right for the wrong reason), while Contact's honoured it
 * and carried no icon. The flag is the whole point of the treatment: the
 * moment one real invite lands, exactly one of these two implementations would
 * have started publishing it. Now the branch lives in one place.
 *
 * - `full` — Community's grid: icon tile, status chip, name, link, blurb. A
 *   coming-soon card renders NO handle line at all: the chip already says
 *   "Coming soon", and saying it twice on one card is noise. A live card
 *   renders its link prominently (accent, arrow) rather than as mono small
 *   print, because the link is the card's entire payoff.
 * - `compact` — Contact's aside column: name and state on one baseline, blurb
 *   under it. No icon and no chip; a live channel shows its link where a
 *   coming-soon one shows the label.
 *
 * The caller supplies its own wrapper (<RevealItem>, list item, whatever) —
 * this renders the <Card> and nothing outside it.
 */
export function ChannelCard({
  channel,
  variant = "full",
}: {
  channel: Channel;
  variant?: ChannelCardVariant;
}) {
  if (variant === "compact") {
    return (
      <Card className="flex flex-col gap-1.5 p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <h3 className="h4">{channel.name}</h3>
          {channel.mock ? (
            <p className="font-mono text-xs text-on-surface-variant">
              {COMMUNITY_PAGE.channelMockChip}
            </p>
          ) : (
            <p className="font-mono text-xs text-on-surface-variant">
              <a
                href={channel.url}
                target="_blank"
                rel="noopener noreferrer"
                className="focus-ring transition-colors hover:text-accent-soft"
              >
                {channel.handle}
              </a>
            </p>
          )}
        </div>
        <p className="text-sm text-on-surface-variant">{channel.blurb}</p>
      </Card>
    );
  }

  const Icon = CHANNEL_ICONS[channel.name];

  return (
    <Card className="flex h-full flex-col gap-4 p-6">
      <div className="flex items-start justify-between gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-accent/20 bg-accent/10">
          <Icon className="size-5 text-accent-soft" strokeWidth={1.75} aria-hidden />
        </span>
        {channel.mock ? (
          <Chip className="border-accent-pink/30 bg-accent-pink/10 text-pink-soft">
            {COMMUNITY_PAGE.channelMockChip}
          </Chip>
        ) : null}
      </div>
      <div className="flex flex-col gap-2">
        <h3 className="h4">{channel.name}</h3>
        {channel.mock ? null : (
          <a
            href={channel.url}
            target="_blank"
            rel="noopener noreferrer"
            className="focus-ring group inline-flex items-center gap-1.5 self-start text-sm font-medium text-accent-soft transition-colors hover:text-on-surface"
          >
            {channel.handle}
            <ArrowUpRight
              className="size-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
              strokeWidth={2}
              aria-hidden
            />
          </a>
        )}
      </div>
      <p className="text-sm leading-relaxed text-on-surface-variant">
        {channel.blurb}
      </p>
    </Card>
  );
}
