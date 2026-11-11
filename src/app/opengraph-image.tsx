import { ImageResponse } from "next/og";
import { CHAIN, CHAIN_HOSTS, SITE } from "@/lib/content/site";

/**
 * The share card. Until this file existed, every link to this site pasted into
 * Telegram, X or Discord rendered as a bare URL — for a project whose entire
 * problem is being confused with a fork, an unbranded link is the worst
 * possible first impression.
 *
 * File-based metadata at the app root, so every public route inherits it; the
 * per-route title and description come from each page's own metadata and render
 * beside this image, not baked into it. One image for the whole site is the
 * point — a mark of origin, not a headline.
 *
 * Drawn with flexbox and flat fills only: this is Satori, not a browser. No
 * box-shadow, no gradient TEXT, no webfont, and NO custom components (Satori
 * renders a plain element tree) — but background gradients (linear AND radial),
 * border-radius and rotate transforms are honoured, which is what the plum
 * depth, the teal live glow and the DAG constellation are made of. The look
 * mirrors the live site: Stately-Plum ground, the brand hairline, a node
 * cluster echoing the hero, telemetry teal on the chain facts.
 */
export const alt = `${SITE.name} — ${SITE.positioning}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Constellation node centres (card coordinates) + connecting edges by index.
const NODES = [
  { x: 812, y: 150, d: 26, teal: false },
  { x: 946, y: 96, d: 20, teal: false },
  { x: 1064, y: 176, d: 32, teal: true },
  { x: 900, y: 244, d: 18, teal: false },
  { x: 1030, y: 300, d: 22, teal: false },
  { x: 828, y: 330, d: 14, teal: false },
] as const;
const EDGES: readonly [number, number][] = [
  [0, 1],
  [0, 3],
  [1, 2],
  [3, 4],
  [2, 4],
  [3, 5],
];

export default function OpengraphImage() {
  const edges = EDGES.map(([i, j], k) => {
    const a = NODES[i];
    const b = NODES[j];
    const len = Math.round(Math.hypot(b.x - a.x, b.y - a.y));
    const angle = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
    return (
      <div
        key={`e${k}`}
        style={{
          position: "absolute",
          left: `${a.x}px`,
          top: `${a.y}px`,
          width: `${len}px`,
          height: "2px",
          backgroundColor: "rgba(168,86,251,0.28)",
          transform: `rotate(${angle}deg)`,
          transformOrigin: "left center",
        }}
      />
    );
  });
  const nodes = NODES.map((n, i) => (
    <div
      key={`n${i}`}
      style={{
        position: "absolute",
        left: `${n.x - n.d / 2}px`,
        top: `${n.y - n.d / 2}px`,
        width: `${n.d}px`,
        height: `${n.d}px`,
        borderRadius: "9999px",
        border: `2px solid ${n.teal ? "rgba(44,224,206,0.85)" : "rgba(168,86,251,0.7)"}`,
        backgroundColor: n.teal
          ? "rgba(44,224,206,0.14)"
          : "rgba(168,86,251,0.12)",
      }}
    />
  ));

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          position: "relative",
          backgroundColor: "#0B0712",
          padding: "72px",
          fontFamily: "sans-serif",
        }}
      >
        {/* Plum depth, top-right — the storm-hero glow, at card scale. */}
        <div
          style={{
            position: "absolute",
            top: "-280px",
            right: "-200px",
            width: "820px",
            height: "820px",
            borderRadius: "9999px",
            backgroundImage:
              "radial-gradient(circle, rgba(168,86,251,0.38) 0%, rgba(211,58,238,0.16) 38%, rgba(11,7,18,0) 70%)",
          }}
        />
        {/* Telemetry teal, bottom-left — quiet, so the live accent has a home. */}
        <div
          style={{
            position: "absolute",
            bottom: "-240px",
            left: "-180px",
            width: "620px",
            height: "620px",
            borderRadius: "9999px",
            backgroundImage:
              "radial-gradient(circle, rgba(44,224,206,0.13) 0%, rgba(11,7,18,0) 66%)",
          }}
        />

        {/* The DAG constellation — the site's signature, behind the wordmark. */}
        {edges}
        {nodes}

        {/* The brand hairline: purple → magenta → pink → teal. */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "1200px",
            height: "8px",
            backgroundImage:
              "linear-gradient(90deg, #A856FB 0%, #D33AEE 45%, #F45FC4 70%, #2CE0CE 100%)",
          }}
        />

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              fontSize: 28,
              letterSpacing: "0.24em",
              textTransform: "uppercase",
              color: "#FFB3E2",
            }}
          >
            {SITE.domain}
          </div>
          <div
            style={{
              marginTop: "30px",
              fontSize: 92,
              fontWeight: 700,
              lineHeight: 1.02,
              letterSpacing: "-0.02em",
              color: "#F4F1FA",
            }}
          >
            {SITE.name}
          </div>
          <div
            style={{
              marginTop: "26px",
              maxWidth: "820px",
              fontSize: 33,
              lineHeight: 1.4,
              color: "#B3AAC6",
            }}
          >
            {SITE.positioning}
          </div>
        </div>

        {/* The two facts an integrator has to get right, so a forwarded link
            carries them even unopened. A live teal dot leads. */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "20px",
            borderTop: "1px solid rgba(168,86,251,0.25)",
            paddingTop: "30px",
            fontSize: 28,
            color: "#9FF5EB",
          }}
        >
          <div
            style={{
              display: "flex",
              width: "16px",
              height: "16px",
              borderRadius: "9999px",
              backgroundColor: "#2CE0CE",
            }}
          />
          <div style={{ display: "flex" }}>Chain ID {CHAIN.chainId}</div>
          <div style={{ display: "flex", color: "#6E6385" }}>·</div>
          <div style={{ display: "flex" }}>{CHAIN.currency.symbol}</div>
          <div style={{ display: "flex", color: "#6E6385" }}>·</div>
          <div style={{ display: "flex", color: "#8FE9DE" }}>
            {CHAIN_HOSTS.rpc}
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}
