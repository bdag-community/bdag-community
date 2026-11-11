import { Section } from "@/components/ui/Section";
import { RevealGroup, RevealItem } from "@/components/ui/Reveal";
import { TIMELINE, TIMELINE_SECTION } from "@/lib/content/site";

/**
 * The network's history as a VERTICAL rail — but the rail is not this
 * section's own. The site-wide spine comes down the margin, jogs into this
 * column above the first node and runs straight down through every one of
 * them, so the chain IS the timeline's rail (`data-spine-track`, with each dot
 * a `data-spine-point` that <Spine> ignites as the front reaches it).
 *
 * That is why there is no `data-spine-rail` here: a rail of its own would sit
 * beside the chain rather than under it. Dates marked ≈ are approximate
 * (quarter-level) until confirmed; the note below says exactly that.
 */
export function Timeline() {
  const events = [
    ...TIMELINE.map((e) => ({ ...e, live: false })),
    { ...TIMELINE_SECTION.now, approx: false, live: true },
  ];

  return (
    <Section as="section" data-spine-track aria-labelledby="timeline-title">
      <div className="flex flex-col gap-10">
        <div className="flex flex-col gap-3">
          <p data-spine-label className="eyebrow">
            {TIMELINE_SECTION.eyebrow}
          </p>
          <h2 id="timeline-title" className="h2">
            {TIMELINE_SECTION.title}
          </h2>
        </div>

        {/* pl-8 keeps the prose clear of the chain. The dedicated outer class
            reaches back across that padding and the Section gutter so every
            dot stays centred on the spine's outside rail. */}
        <RevealGroup className="flex flex-col gap-10 pl-8 sm:gap-12">
          {events.map((event) => (
            <RevealItem key={event.title} className="relative">
              {/* The node itself — it sits ON the chain, which runs down this
                  column at exactly this dot's centre. */}
              <span
                aria-hidden
                data-spine-point
                className={[
                  "tl-dot tl-dot-outer absolute top-[0.4rem]",
                  event.live ? "tl-dot-live" : "",
                ].join(" ")}
              />
              <p
                className={[
                  "label-caps",
                  event.live ? "text-teal-soft" : "text-on-surface-variant",
                ].join(" ")}
              >
                {event.approx ? (
                  <>
                    <span aria-hidden>≈ </span>
                    <span className="sr-only">approximately </span>
                  </>
                ) : null}
                {event.when}
              </p>
              <h3 className="h3 mt-1.5 text-on-surface">{event.title}</h3>
              <p className="body mt-2 max-w-[60ch]">{event.body}</p>
            </RevealItem>
          ))}
        </RevealGroup>
        {/* No approximate-date legend: every event now carries an exact,
            confirmed date (2026-08-13). The `≈` render branch above stays
            for any future estimated date, which would restore the legend
            with it. */}
      </div>
    </Section>
  );
}
