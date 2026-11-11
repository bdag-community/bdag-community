import { ArrowUpRight, Share2 } from "lucide-react";
import { CopyRef } from "@/components/ui/CopyRef";
import { NEWS_PAGE, SITE } from "@/lib/content/site";

/**
 * Share intents for a single article (2026-08-13). Plain intent links, no
 * social SDKs: each network's own share URL opens in a new tab carrying the
 * article URL (and title where the intent supports text), so nothing loads
 * from any social host while the article is read. That keeps the site's
 * no-third-party-scripts posture — the only network contact happens after
 * the reader chooses a destination.
 *
 * Text labels, deliberately: the icon set carries no brand marks (see
 * ChannelCard's neutral-icons rule), and five brand logos would be the
 * first. The copy button offers the canonical URL for everywhere else.
 */
const INTENTS: readonly {
  name: string;
  share: (url: string, title: string) => string;
}[] = [
  {
    name: "X",
    share: (u, t) => `https://x.com/intent/post?url=${u}&text=${t}`,
  },
  {
    name: "Telegram",
    share: (u, t) => `https://t.me/share/url?url=${u}&text=${t}`,
  },
  {
    name: "WhatsApp",
    share: (u, t) => `https://wa.me/?text=${t}%20${u}`,
  },
  {
    name: "Facebook",
    share: (u) => `https://www.facebook.com/sharer/sharer.php?u=${u}`,
  },
  {
    name: "LinkedIn",
    share: (u) => `https://www.linkedin.com/sharing/share-offsite/?url=${u}`,
  },
];

export function ShareRow({ slug, title }: { slug: string; title: string }) {
  // Absolute, from the canonical site URL: an intent carrying a relative
  // path or a preview host would spread dead or wrong links.
  const articleUrl = new URL(`/articles/${slug}`, SITE.url).toString();
  const u = encodeURIComponent(articleUrl);
  const t = encodeURIComponent(title);

  return (
    <div className="flex flex-col gap-4 border-t border-border/60 pt-6">
      <p className="label-caps flex items-center gap-2 text-on-surface-variant">
        <Share2 className="size-4 shrink-0" strokeWidth={1.75} aria-hidden />
        {NEWS_PAGE.share.title}
      </p>
      <ul className="flex flex-wrap items-center gap-2">
        {INTENTS.map((network) => (
          <li key={network.name}>
            <a
              href={network.share(u, t)}
              target="_blank"
              rel="noopener noreferrer"
              className="focus-ring inline-flex min-h-[44px] items-center gap-1.5 rounded-full border border-border px-4 text-sm font-medium text-on-surface-variant transition-colors hover:border-accent/40 hover:text-accent-soft"
            >
              {network.name}
              <ArrowUpRight className="size-3.5" strokeWidth={2} aria-hidden />
            </a>
          </li>
        ))}
      </ul>
      <CopyRef value={articleUrl} label={NEWS_PAGE.share.copyLabel} />
    </div>
  );
}
