import type { ReactNode } from "react";

/**
 * The hero every page below Home wears.
 *
 * One display word, the claim under it, the description, and a glass orb
 * beside it. The frame is the Chain primer's, which is why the shared classes
 * are `page-hero-*` rather than `chain-primer-*`: /chain's primer is this same
 * hero with a three-way selector on top of it, and the two must not drift.
 *
 * Deliberately a server component with no state and no motion library. The
 * primer needs both because it has something to switch between; nothing here
 * does, and five copies of a client bundle to render a static SVG would be a
 * cost with nothing on the other side of it.
 *
 * No eyebrow, on purpose. Every one of these pages had an eyebrow carrying the
 * same word its title now is ("Mining" over "Mine BlockDAG with dedicated
 * hardware"), so an eyebrow above the display word would say it twice at two
 * sizes. The old titles were not thrown away: each is now the `subtitle`, one
 * line down, which is where a claim belongs once the page has named itself.
 */
export function PageHero({
  titleId,
  title,
  subtitle,
  intro,
  art,
  label,
}: {
  /** The <h1>'s id, which the page's <Section> labels itself from. */
  titleId: string;
  /** One word. This is the page naming itself. */
  title: string;
  /** The claim the page used to open with. */
  subtitle: string;
  intro: string;
  art: ReactNode;
  /** The word under the orb. Lowercase; it is a caption, not a heading. */
  label: string;
}) {
  return (
    <div className="page-hero-grid grid items-center gap-10 py-2 sm:py-6 lg:min-h-[34rem] lg:grid-cols-[minmax(0,0.94fr)_minmax(22rem,0.72fr)] lg:gap-16">
      <div className="flex min-w-0 flex-col items-start">
        <h1 id={titleId} className="display hero-word animate-fade-in">
          {title}
        </h1>
        <p className="h3 mt-4 max-w-[26ch]">{subtitle}</p>
        <p className="lead mt-4 max-w-[54ch]">{intro}</p>
      </div>

      {/* Decoration. It repeats what the words already say, so it is hidden
          rather than described: a reader on a screen reader gains nothing from
          "a heart made of nodes". */}
      <div
        className="page-hero-visual flex min-w-0 items-center justify-center"
        aria-hidden="true"
      >
        <div className="page-hero-orb relative aspect-square w-full max-w-[28rem] overflow-hidden rounded-full">
          <span className="page-hero-orb-bloom" />
          {art}
          <span className="page-hero-orb-label">{label}</span>
        </div>
      </div>
    </div>
  );
}
