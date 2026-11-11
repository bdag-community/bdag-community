/**
 * The orb artwork, one per page.
 *
 * Every one is built from the same primitives the Chain primer's art uses, and
 * for the same reason: `-grid` is the thin connective tissue, `-nodes` are the
 * things that exist, `-flow` is the ONE accent stroke carrying the page's
 * meaning, and `-code`/`-rays`/`-ticks` are detail. Sharing the primitives is
 * what makes six different drawings read as one family instead of six
 * illustrations that happen to sit in the same circle.
 *
 * Each drawing has to say something true about its page. None of them is a
 * stock glyph, and none repeats another: the primer already owns "repeated
 * work converging on a block", so Mining is about the hardware doing it rather
 * than the proof it produces.
 */

/** Community: a heart whose outline is a network and whose vertices are people. */
export function CommunityArt() {
  return (
    <svg viewBox="0 0 320 320" className="page-hero-art" focusable="false">
      <g className="page-hero-art-grid">
        <path d="M124 82h72" />
        <path d="M74 132h172" />
        <path d="M98 178h124" />
        <path d="m124 82 98 96" />
        <path d="m196 82-98 96" />
        <path d="M160 108v130" />
      </g>
      <path
        className="page-hero-art-flow"
        d="M160 238C118 206 74 176 74 132c0-32 26-50 50-50 20 0 32 14 36 26 4-12 16-26 36-26 24 0 50 18 50 50 0 44-44 74-86 106Z"
      />
      <g className="page-hero-art-nodes">
        <circle cx="74" cy="132" r="11" />
        <circle cx="124" cy="82" r="13" />
        <circle cx="160" cy="108" r="10" />
        <circle cx="196" cy="82" r="13" />
        <circle cx="246" cy="132" r="11" />
        <circle cx="222" cy="178" r="12" />
        <circle cx="160" cy="238" r="14" />
        <circle cx="98" cy="178" r="12" />
      </g>
    </svg>
  );
}

/** Mining: three machines on a bus, feeding one accepted block. */
export function MiningArt() {
  return (
    <svg viewBox="0 0 320 320" className="page-hero-art" focusable="false">
      <g className="page-hero-art-grid">
        <path d="M190 158h35" />
        <path d="M190 208h35" />
        <path d="M190 258h35" />
        <path d="M225 158v100" />
      </g>
      <g className="page-hero-art-nodes">
        <rect x="70" y="140" width="120" height="36" rx="10" />
        <rect x="70" y="190" width="120" height="36" rx="10" />
        <rect x="70" y="240" width="120" height="36" rx="10" />
        <circle cx="100" cy="158" r="8" />
        <circle cx="100" cy="208" r="8" />
        <circle cx="100" cy="258" r="8" />
      </g>
      {/* The block the rig is for. */}
      <path className="page-hero-art-flow" d="m225 66 40 23v46l-40 23-40-23V89Z" />
    </svg>
  );
}

/** Staking: value held in the middle, epochs turning around it. */
export function StakingArt() {
  return (
    <svg viewBox="0 0 320 320" className="page-hero-art" focusable="false">
      <g className="page-hero-art-grid">
        <circle cx="160" cy="160" r="104" />
        <circle cx="160" cy="160" r="74" />
        <path d="M160 66v20M160 234v20M66 160h20M234 160h20" />
      </g>
      <g className="page-hero-art-nodes">
        <path d="m160 118 36 21v42l-36 21-36-21v-42Z" />
        <circle cx="160" cy="56" r="10" />
        <circle cx="250" cy="108" r="10" />
        <circle cx="250" cy="212" r="10" />
        <circle cx="160" cy="264" r="10" />
        <circle cx="70" cy="212" r="10" />
        <circle cx="70" cy="108" r="10" />
      </g>
      {/* One epoch's worth of the turn, so the ring reads as moving. */}
      <path
        className="page-hero-art-flow"
        d="M160 56a104 104 0 0 1 90 52"
      />
    </svg>
  );
}

/** Projects: modules the community built, each plugged into the one chain. */
export function ProjectsArt() {
  return (
    <svg viewBox="0 0 320 320" className="page-hero-art" focusable="false">
      <g className="page-hero-art-grid">
        <path d="M56 232h208" />
        <path d="M100 232v-52" />
        <path d="M160 232v-104" />
        <path d="M100 162h32" />
        <path d="M188 110h32" />
      </g>
      <g className="page-hero-art-nodes">
        <rect x="72" y="144" width="56" height="36" rx="10" />
        <rect x="132" y="92" width="56" height="36" rx="10" />
        <rect x="192" y="132" width="56" height="36" rx="10" />
        <circle cx="100" cy="232" r="8" />
        <circle cx="160" cy="232" r="8" />
        <circle cx="220" cy="232" r="8" />
      </g>
      {/* The newest module making its connection into the chain. */}
      <path className="page-hero-art-flow" d="M220 168v64h44" />
    </svg>
  );
}

/** News: a written record, published by the people running the chain. */
export function NewsArt() {
  return (
    <svg viewBox="0 0 320 320" className="page-hero-art" focusable="false">
      <g className="page-hero-art-grid">
        <path d="M112 104h96" />
        <path d="M112 138h96" />
        <path d="M112 172h96" />
        <path d="M112 206h60" />
        <path d="m140 240-36 30" />
        <path d="m180 240 36 30" />
      </g>
      <path
        className="page-hero-art-flow"
        d="M90 62h140a12 12 0 0 1 12 12v154a12 12 0 0 1-12 12H90a12 12 0 0 1-12-12V74a12 12 0 0 1 12-12Z"
      />
      <g className="page-hero-art-nodes">
        <circle cx="98" cy="276" r="12" />
        <circle cx="222" cy="276" r="12" />
      </g>
    </svg>
  );
}

/** FAQ: one question drawn as flow through the graph, landing on solid
 *  ground. The hook is the accent stroke; the dot under it is a node,
 *  because every answer on the page ends at a page of evidence. */
export function FaqArt() {
  return (
    <svg viewBox="0 0 320 320" className="page-hero-art" focusable="false">
      <g className="page-hero-art-grid">
        <path d="M66 160h34" />
        <path d="M220 160h34" />
        <path d="M160 44v14" />
        <path d="m94 238 30-20" />
        <path d="m226 238-30-20" />
      </g>
      <path
        className="page-hero-art-flow"
        d="M116 108a44 44 0 1 1 82 22c-12 20-38 24-38 54"
      />
      <g className="page-hero-art-nodes">
        <circle cx="56" cy="160" r="10" />
        <circle cx="264" cy="160" r="10" />
        <circle cx="160" cy="38" r="10" />
        <circle cx="86" cy="244" r="9" />
        <circle cx="234" cy="244" r="9" />
        <circle cx="160" cy="224" r="12" />
      </g>
    </svg>
  );
}

/** Contact: a message in transit between two people. */
export function ContactArt() {
  return (
    <svg viewBox="0 0 320 320" className="page-hero-art" focusable="false">
      <g className="page-hero-art-grid">
        <path d="M60 160h56" />
        <path d="M204 160h56" />
        <path d="m86 121 24 24" />
        <path d="m86 199 24-24" />
      </g>
      <path className="page-hero-art-flow" d="M116 122h88v76h-88z" />
      <g className="page-hero-art-code">
        <path d="m116 122 44 34 44-34" />
      </g>
      <g className="page-hero-art-nodes">
        <circle cx="60" cy="160" r="13" />
        <circle cx="86" cy="112" r="9" />
        <circle cx="86" cy="208" r="9" />
        <circle cx="260" cy="160" r="13" />
      </g>
    </svg>
  );
}
