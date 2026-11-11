"use client";

/**
 * The last boundary. global-error replaces the ROOT layout, so when it renders
 * there is no <html>, no <body>, no header and no footer unless this file
 * draws them — which is why everything here is inline style rather than
 * Tailwind classes and why it imports no stylesheet: the failure that got us
 * here may be the stylesheet.
 *
 * It only ever renders in production, and only for an error thrown by the root
 * layout itself. Everything else in the app is still an unstyled crash today
 * (there is no error.tsx anywhere) — this file does not pretend otherwise.
 *
 * The digest is printed because it is the only handle a reader can quote to
 * us; the stack is deliberately not, since it is scrubbed in production anyway.
 *
 * HOUSE-RULE EXCEPTION, same as (public)/not-found.tsx: these three strings are
 * prose outside src/lib/content/site.ts, which is single-owner this pass and
 * carries no error copy. They belong in a GLOBAL_ERROR block there.
 */
const GLOBAL_ERROR = {
  title: "Something broke on our side",
  intro:
    "This is our fault, not yours. Try again — if it keeps happening, quote the reference below and we will go and look.",
  retry: "Try again",
  home: "Back to home",
  reference: "Reference",
} as const;

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          backgroundColor: "#0E0715",
          color: "#ECE9F3",
          fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
          justifyContent: "center",
          gap: "20px",
          padding: "48px 24px",
        }}
      >
        {/* The brand hairline, so even the failure screen is recognisably this
            site rather than a browser default. */}
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            height: "3px",
            backgroundImage:
              "linear-gradient(90deg, #A856FB 0%, #D33AEE 45%, #F45FC4 70%, #2CE0CE 100%)",
          }}
        />

        <h1
          style={{
            margin: 0,
            maxWidth: "22ch",
            fontSize: "clamp(1.75rem, 5vw, 2.75rem)",
            lineHeight: 1.1,
            fontWeight: 700,
            letterSpacing: "-0.02em",
          }}
        >
          {GLOBAL_ERROR.title}
        </h1>

        <p
          style={{
            margin: 0,
            maxWidth: "60ch",
            fontSize: "1rem",
            lineHeight: 1.6,
            color: "#A79FB8",
          }}
        >
          {GLOBAL_ERROR.intro}
        </p>

        <div style={{ display: "flex", flexWrap: "wrap", gap: "12px" }}>
          <button
            type="button"
            onClick={reset}
            style={{
              minHeight: "44px",
              padding: "10px 20px",
              borderRadius: "9999px",
              border: "1px solid #A856FB",
              backgroundColor: "#A856FB",
              color: "#0E0715",
              fontSize: "0.875rem",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            {GLOBAL_ERROR.retry}
          </button>
          {/* A real <a>, not next/link, and the lint rule is wrong here: the
              root layout is what failed, so the router tree this boundary sits
              under is not to be trusted. A full document load is the recovery
              path, which is the whole point of the link. */}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a
            href="/"
            style={{
              display: "inline-flex",
              alignItems: "center",
              minHeight: "44px",
              padding: "10px 20px",
              borderRadius: "9999px",
              border: "1px solid #3A2B50",
              color: "#C9A9FF",
              fontSize: "0.875rem",
              fontWeight: 500,
              textDecoration: "none",
            }}
          >
            {GLOBAL_ERROR.home}
          </a>
        </div>

        {error.digest ? (
          <p
            style={{
              margin: 0,
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
              fontSize: "0.75rem",
              color: "#8B819E",
            }}
          >
            {GLOBAL_ERROR.reference} {error.digest}
          </p>
        ) : null}
      </body>
    </html>
  );
}
