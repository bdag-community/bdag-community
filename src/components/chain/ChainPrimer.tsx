"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { CHAIN_PAGE } from "@/lib/content/site";
import { cn } from "@/lib/utils/cn";

const EASE = [0.22, 1, 0.36, 1] as const;
const AUTO_ADVANCE_MS = 6_000;
const copy = CHAIN_PAGE.primer;
type PrimerItem = (typeof copy.items)[number];
type PrimerKey = PrimerItem["key"];

/** Linked blocks arriving in parallel before resolving into one order. */
function DagArt() {
  return (
    <svg viewBox="0 0 320 320" className="page-hero-art" focusable="false">
      <g className="page-hero-art-grid">
        <path d="M61 101 128 67l65 42 66-35" />
        <path d="M61 101 103 167l90-58 66 59" />
        <path d="m103 167 57 77 99-76" />
        <path d="m193 109-33 135" />
      </g>
      <g className="page-hero-art-nodes">
        <circle cx="61" cy="101" r="12" />
        <circle cx="128" cy="67" r="12" />
        <circle cx="193" cy="109" r="12" />
        <circle cx="259" cy="74" r="12" />
        <circle cx="103" cy="167" r="14" />
        <circle cx="259" cy="168" r="14" />
        <path d="m160 220 21 12v24l-21 12-21-12v-24Z" />
      </g>
      <path className="page-hero-art-flow" d="m139 232 21 12 99-76" />
    </svg>
  );
}

/** An execution engine: ordered input enters one shared, repeatable machine. */
function EvmArt() {
  return (
    <svg viewBox="0 0 320 320" className="page-hero-art" focusable="false">
      <g className="page-hero-art-grid">
        <path d="m160 51 91 52-91 52-91-52Z" />
        <path d="m69 103 91 52 91-52v108l-91 54-91-54Z" />
        <path d="M160 155v110" />
      </g>
      <g className="page-hero-art-nodes">
        <path d="m160 84 48 27-48 27-48-27Z" />
        <rect x="102" y="166" width="116" height="54" rx="12" />
      </g>
      <g className="page-hero-art-code">
        <path d="m138 181-14 12 14 12" />
        <path d="m182 181 14 12-14 12" />
        <path d="m170 176-20 34" />
      </g>
    </svg>
  );
}

/** Repeated work converging on a block whose result is easy to verify. */
function PowArt() {
  return (
    <svg viewBox="0 0 320 320" className="page-hero-art" focusable="false">
      <g className="page-hero-art-rays">
        <path d="M45 83h55" />
        <path d="m58 133 54 13" />
        <path d="m48 202 66-18" />
        <path d="M220 83h55" />
        <path d="m208 146 54-13" />
        <path d="m206 184 66 18" />
      </g>
      <g className="page-hero-art-grid">
        <circle cx="160" cy="160" r="91" />
        <circle cx="160" cy="160" r="68" />
      </g>
      <path
        className="page-hero-art-nodes"
        d="m160 104 48 28v56l-48 28-48-28v-56Z"
      />
      <g className="page-hero-art-code">
        <path d="m137 160 15 15 32-34" />
      </g>
      <g className="page-hero-art-ticks">
        <path d="M160 55v14M160 251v14M55 160h14M251 160h14" />
        <path d="m86 86 10 10M224 224l10 10M234 86l-10 10M96 224l-10 10" />
      </g>
    </svg>
  );
}

const ART: Record<PrimerKey, () => React.JSX.Element> = {
  dag: DagArt,
  evm: EvmArt,
  pow: PowArt,
};

function PrimerVisual({ kind, reduced }: { kind: PrimerKey; reduced: boolean }) {
  const Art = ART[kind];
  return (
    <div className="page-hero-visual flex min-w-0 items-center justify-center" aria-hidden="true">
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={kind}
          data-primer-art={kind}
          className="page-hero-orb relative aspect-square w-full max-w-[28rem] overflow-hidden rounded-full"
          initial={reduced ? false : { opacity: 0, scale: 0.96, rotate: -1.5 }}
          animate={{ opacity: 1, scale: 1, rotate: 0 }}
          exit={reduced ? undefined : { opacity: 0, scale: 0.98, rotate: 1.5 }}
          transition={{ duration: reduced ? 0 : 0.42, ease: EASE }}
        >
          <span className="page-hero-orb-bloom" />
          <Art />
          <span className="page-hero-orb-label">{kind}</span>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

/**
 * Plain-language Chain primer. It introduces each layer in a quiet loop, then
 * becomes fully manual as soon as a reader makes a selection. Automatic swaps
 * are excluded from the live region so assistive technology is not interrupted.
 */
export function ChainPrimer() {
  const reduced = useReducedMotion();
  const [activeKey, setActiveKey] = useState<PrimerKey>(copy.items[0].key);
  const [auto, setAuto] = useState(true);
  const autoRunning = auto && reduced === false;
  const active = copy.items.find((item) => item.key === activeKey) ?? copy.items[0];

  useEffect(() => {
    if (!autoRunning) return;

    const timer = window.setInterval(() => {
      setActiveKey((current) => {
        const index = copy.items.findIndex((item) => item.key === current);
        return copy.items[(index + 1) % copy.items.length]?.key ?? copy.items[0].key;
      });
    }, AUTO_ADVANCE_MS);

    return () => window.clearInterval(timer);
  }, [autoRunning]);

  const selectItem = (key: PrimerKey) => {
    setAuto(false);
    setActiveKey(key);
  };

  return (
    <div
      data-primer-auto={auto ? "on" : "off"}
      className="page-hero-grid grid items-center gap-10 py-2 sm:py-6 lg:min-h-[34rem] lg:grid-cols-[minmax(0,0.94fr)_minmax(22rem,0.72fr)] lg:gap-16"
    >
      <div className="flex min-w-0 flex-col items-start">
        <p className="eyebrow animate-fade-in">{CHAIN_PAGE.eyebrow}</p>

        <div
          role="group"
          aria-label={copy.selectorLabel}
          className="relative mt-6 grid w-full max-w-[24rem] grid-cols-3 gap-5 rounded-full border border-border/70 bg-container/55 p-1.5 backdrop-blur-sm"
        >
          {/* The two pluses, so the control reads as DAG + EVM + POW rather
              than as three alternatives. They are DECORATION and nothing else:
              aria-hidden, so the group is still announced as three toggle
              buttons rather than as a sum, and pointer-events-none, so a plus
              sitting over a pill edge can never eat a tap.

              Positioned at the thirds of the padding box. The exact gap
              centres are 1px off that at both supported widths, which is not a
              pixel anyone can see and is worth not hard-coding the column
              arithmetic for. The gap went from 1.5 to 5 to give them somewhere
              to sit: at 6px they would have straddled two pills and read as a
              rendering fault rather than as an operator. */}
          <span aria-hidden className="primer-plus left-1/3">
            +
          </span>
          <span aria-hidden className="primer-plus left-2/3">
            +
          </span>
          {copy.items.map((item) => {
            const isActive = item.key === active.key;
            return (
              <button
                key={item.key}
                type="button"
                aria-pressed={isActive}
                aria-controls="chain-primer-detail"
                onClick={() => selectItem(item.key)}
                className={cn(
                  "min-h-[44px] rounded-full border px-3 py-2 font-mono text-xs font-medium uppercase tracking-[0.16em] transition-colors duration-200",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-base-void",
                  isActive
                    ? "border-accent/55 bg-accent/15 text-on-surface shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]"
                    : "border-transparent text-on-surface-variant hover:border-accent/25 hover:bg-accent/5 hover:text-accent-soft",
                )}
              >
                {item.short}
              </button>
            );
          })}
        </div>

        <div
          id="chain-primer-detail"
          aria-live={auto ? "off" : "polite"}
          aria-atomic="true"
          className="mt-8 min-h-[16.5rem] sm:min-h-[15.5rem]"
        >
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={active.key}
              initial={reduced ? false : { opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduced ? undefined : { opacity: 0, y: -10 }}
              transition={{ duration: reduced ? 0 : 0.38, ease: EASE }}
            >
              <p className="label-caps text-accent-soft">{active.layer}</p>
              <h1 id="chain-title" className="display hero-word mt-2">
                <span className="sr-only">{CHAIN_PAGE.eyebrow}: </span>
                {active.short}
              </h1>
              <p className="h3 mt-4">{active.subtitle}</p>
              <p className="lead mt-4 max-w-[54ch]">{active.body}</p>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      <PrimerVisual kind={active.key} reduced={Boolean(reduced)} />
    </div>
  );
}
