"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { HERO } from "@/lib/content/site";

const EASE = [0.22, 1, 0.36, 1] as const;
/** Dwell per cycling identity word. */
const WORD_MS = 950;
/** How long "Community" holds before the loop restarts. */
const FINAL_HOLD_MS = 5000;
/** Final-word entrance: per-letter rise, staggered. */
const LETTER_STAGGER_S = 0.05;
const LETTER_ENTER_S = 0.6;
/** …held back so the caret blinks on an EMPTY slot first. Without this beat
 *  the cursor and the word arrive together and there is nothing to read as
 *  "about to be typed". Must stay behind .hero-caret's own timings in
 *  globals.css: the previous word's 0.35s exit, the caret's 0.2s entrance,
 *  and one full blink of the empty slot. */
const LETTER_DELAY_S = 1;

/**
 * The hero's identity loop: Engineers → Enthusiasts → Developers → Miners →
 * Stakers → **Community** — the last one preceded by a blinking caret and
 * entered letter by letter, held for 5s, then the loop restarts.
 *
 * Motion accessibility: the element is decorative (aria-hidden — the page's
 * sr-only h1 carries the meaning); hovering the heading pauses the loop, and
 * reduced motion renders a static "Community" with no loop at all.
 *
 * Descender note: the slot must clip (overflow-hidden) for the slide effect,
 * but the display type's tight leading leaves no room for g/y descenders —
 * the padded clip box + negative margins below give the glyphs room without
 * shifting the layout.
 */
export function WordRotate() {
  const reduced = useReducedMotion();
  const words = [...HERO.rotatingWords, HERO.finalWord];
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  const isFinal = index === words.length - 1;

  useEffect(() => {
    if (reduced || paused) return;
    const finalEnterMs =
      (LETTER_DELAY_S +
        LETTER_ENTER_S +
        LETTER_STAGGER_S * HERO.finalWord.length) *
      1000;
    const dwell = isFinal ? finalEnterMs + FINAL_HOLD_MS : WORD_MS;
    const t = setTimeout(() => setIndex((i) => (i + 1) % words.length), dwell);
    return () => clearTimeout(t);
  }, [index, isFinal, paused, reduced, words.length]);

  if (reduced) {
    return (
      <span aria-hidden className="hero-word relative inline-block pb-[0.12em]">
        {HERO.finalWord}
        <span aria-hidden className="hero-caret" />
      </span>
    );
  }

  const word = words[index];

  return (
    <span
      aria-hidden
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      className="relative inline-grid overflow-hidden align-bottom pt-[0.06em] pb-[0.14em] -mt-[0.06em] -mb-[0.14em]"
    >
      {/* Invisible widest word reserves the slot so the layout never shifts.
          pb matches .text-gradient's descender padding so the row keeps ONE
          height whether the visible word carries the gradient or not. */}
      <span className="invisible col-start-1 row-start-1 pb-[0.12em]">
        {[...words].sort((a, b) => b.length - a.length)[0]}
      </span>

      <AnimatePresence mode="popLayout" initial={false}>
        {isFinal ? (
          <motion.span
            key="community"
            className="hero-word relative col-start-1 row-start-1 pb-[0.12em]"
            initial="hidden"
            animate="show"
            exit={{ y: "-0.6em", opacity: 0, transition: { duration: 0.35, ease: EASE } }}
            variants={{
              show: {
                transition: {
                  staggerChildren: LETTER_STAGGER_S,
                  delayChildren: LETTER_DELAY_S,
                },
              },
            }}
            style={{ display: "inline-block" }}
          >
            {/* Letter-staggered rise. Deliberately NO blur filter and NO bloom
                layer: nine concurrent filter animations dropped frames and
                made the tail of the stagger (the y) hitch. Transform+opacity
                only stays smooth. */}
            {HERO.finalWord.split("").map((letter, i) => (
              <motion.span
                key={i}
                className="relative inline-block"
                variants={{
                  hidden: { y: "0.55em", opacity: 0 },
                  show: {
                    y: 0,
                    opacity: 1,
                    transition: { duration: LETTER_ENTER_S, ease: EASE },
                  },
                }}
              >
                {letter}
              </motion.span>
            ))}
            {/* The caret, under the first letter. CSS keyframes on mount, not
                a variant: it has to be blinking on an EMPTY slot while the
                letters are still held back, which a child of the stagger
                could not do. */}
            <span aria-hidden className="hero-caret" />
          </motion.span>
        ) : (
          <motion.span
            key={word}
            className="col-start-1 row-start-1 pb-[0.12em] text-on-surface-variant"
            initial={{ y: "0.6em", opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: "-0.6em", opacity: 0 }}
            transition={{ duration: 0.4, ease: EASE }}
          >
            {word}
          </motion.span>
        )}
      </AnimatePresence>
    </span>
  );
}
