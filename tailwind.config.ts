import type { Config } from "tailwindcss";

// BDAG Community theme — "Stately Plum", the big brother of the
// bdag-miner-sales system. Shared family DNA (void surfaces, glass cards,
// hairline borders, glow depth, pill buttons with DARK text) with the
// community's own register: surfaces one step plummier, and the signature
// gradient extended into pink (#A856FB -> #D33AEE -> #F45FC4).
// Live token source for the app; CSS-var mirror lives in globals.css.
// Design authority: DESIGN.md.
const config: Config = {
  future: {
    // Gate every hover: variant behind @media (hover:hover) — on touch screens
    // tapped hover styles otherwise STICK until the next tap. Touch feedback
    // comes from active: styles.
    hoverOnlyWhenSupported: true,
  },
  content: ["./src/app/**/*.{ts,tsx}", "./src/components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Deep plum-black surface scale (one step warmer than bdag.co's)
        "base-void": "#0E0715",
        container: "#170F23",
        elevated: "#1F1630",
        border: "#3A2B50",
        "border-strong": "#453259",
        surface: "#170F23",
        "surface-container": "#1F1630",
        "surface-container-high": "#271D38",
        // Brand purple + the community's magenta->pink extension
        accent: "#A856FB", // brand purple (the mark) — borders, focus, glow, LARGE text only
        "accent-magenta": "#D33AEE", // family gradient partner
        "accent-pink": "#F45FC4", // community signature — gradient terminus
        "accent-glow": "#E08CFF", // light glow purple (gradient-text first stop)
        // accent-soft is the SAFE accent for body-sized text (>= 8.8:1 on dark);
        // raw `accent` dips below AA 4.5:1 on elevated surfaces — reserve it for
        // large text, borders, focus rings, and icon fills.
        "accent-soft": "#C9A9FF",
        // pink-soft: the SAFE pink for body-sized text on dark surfaces.
        "pink-soft": "#FFB3E2",
        // Turquoise: the LIVE-TELEMETRY accent (DESIGN.md) — live dots,
        // live-data eyebrows, and the constellation's teal blocks. Never for
        // brand chrome or CTAs; it exists to break the purple/pink field.
        "accent-teal": "#2CE0CE",
        // teal-soft: the SAFE turquoise for body-sized text on dark surfaces.
        "teal-soft": "#9FF5EB",
        primary: "#A856FB",
        "on-primary": "#0E0715", // DARK text on the bright gradient (AA)
        // Text
        "on-surface": "#ECE9F3",
        "on-surface-variant": "#A79FB8",
        outline: "#6E6385",
        // The AA-safe muted text token (4.6:1). `outline` stays, for borders
        // and hairlines, which is what its name says — it is 3.11:1 on
        // elevated and was carrying 10-12px informational text in 18 places.
        "on-surface-muted": "#8B819E",
        // Semantic
        "warn-orange": "#F59E0B",
        error: "#FFB4AB",
        success: "#40DD82",
      },
      backgroundImage: {
        // Signature 3-stop gradient: purple -> magenta -> pink (buttons + brand
        // accents). The sibling site stops at magenta; the pink terminus is ours.
        "gradient-accent":
          "linear-gradient(135deg, #A856FB 0%, #D33AEE 55%, #F45FC4 100%)",
      },
      boxShadow: {
        // Soft two-tone bloom — magenta-led where the sibling leads purple.
        glow: "0 0 40px -4px rgba(211,58,238,0.26), 0 0 64px -16px rgba(244,95,196,0.16)",
        "glow-sm": "0 0 22px -6px rgba(211,58,238,0.28)",
        // Button halo + lift (not a directional drop shadow).
        btn: "0 0 24px rgba(211,58,238,0.32), 0 4px 16px rgba(14,7,21,0.6)",
        // The live dot's halo — hard-coded as a raw rgba literal in four files.
        // This one survived the TEMP glow-off pass on purpose: teal = live.
        live: "0 0 10px rgba(44,224,206,0.7)",
      },
      fontFamily: {
        display: ["var(--font-display)", "system-ui", "sans-serif"],
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      borderRadius: {
        sm: "0.125rem",
        DEFAULT: "0.25rem",
        md: "0.375rem",
        lg: "0.5rem",
        xl: "0.75rem",
        "2xl": "1rem",
      },
      spacing: {
        gutter: "16px",
      },
      maxWidth: {
        site: "1440px",
      },
      keyframes: {
        "fade-in": {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(16px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        "fade-in": "fade-in 1.1s ease both",
        "fade-up": "fade-up 0.7s cubic-bezier(0.22,1,0.36,1) both",
      },
    },
  },
  plugins: [],
};

export default config;
