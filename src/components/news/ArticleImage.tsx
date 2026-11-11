import Image from "next/image";
import { cn } from "@/lib/utils/cn";

/**
 * An article's image, wearing the community mark.
 *
 * Every article image carries the BDAG Community logo in its bottom-left
 * corner — the artwork itself is commissioned or generated and changes, the
 * mark is what makes a card recognisably ours when it is screenshotted or
 * shared. It sits over a short scrim so it stays legible on light artwork as
 * well as dark; without one it disappears against a bright corner.
 *
 * The placeholder branch is the same treatment with generated art instead of
 * a photograph, so an article with no image is still a branded card rather
 * than an empty box.
 *
 * Only site-relative paths are rendered. Seed artwork lives in public/ and
 * goes through next/image. Managed community assets stay private until the
 * controlled delivery step, so an arbitrary remote URL can never bypass the
 * processor or the platform delivery boundary here.
 */
export function ArticleImage({
  src,
  srcSet = null,
  alt = "",
  className,
  markClassName,
  sizes = "(min-width: 1024px) 30vw, (min-width: 768px) 45vw, 100vw",
  priority = false,
}: {
  src: string | null;
  /** Exact managed variants generated from the published asset record. */
  srcSet?: string | null;
  /** Meaningful for managed covers; seed decoration may remain empty. */
  alt?: string;
  /** The frame. Callers own the aspect ratio, which differs per surface. */
  className?: string;
  /** The mark's size, which follows the frame's. */
  markClassName?: string;
  /**
   * The rendered width of this frame, per breakpoint. The default describes
   * the /news card grid (one column, then two, then three); the lead story and
   * the article page are wider and say so themselves. Local images only —
   * a remote <img> has no way to use it.
   */
  sizes?: string;
  /** The lead story is above the fold; everything else waits. */
  priority?: boolean;
}) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-xl border border-border/60 bg-elevated",
        className,
      )}
    >
      {src && src.startsWith("/") ? (
        <Image
          src={src}
          alt={alt}
          fill
          sizes={sizes}
          priority={priority}
          className="object-cover"
        />
      ) : src && srcSet ? (
        // Managed URLs are derived server-side from exact article/asset UUIDs.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          srcSet={srcSet}
          sizes={sizes}
          alt={alt}
          width={1600}
          height={900}
          loading={priority ? "eager" : "lazy"}
          decoding="async"
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : (
        <div
          aria-hidden
          className="absolute inset-0 bg-[radial-gradient(24rem_14rem_at_80%_-20%,rgba(211,58,238,0.25),transparent_60%),radial-gradient(20rem_12rem_at_10%_110%,rgba(168,86,251,0.22),transparent_60%)]"
        />
      )}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_top_right,rgba(14,7,21,0.62),transparent_34%)]"
      />
      {/* The mark stays a plain <img>: it is an SVG, which next/image does not
          optimise without dangerouslyAllowSVG, and it is 1.5 KB either way. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/logo.svg"
        alt=""
        aria-hidden
        className={cn(
          "pointer-events-none absolute bottom-3 left-3 h-6 w-auto opacity-90",
          markClassName,
        )}
      />
    </div>
  );
}
