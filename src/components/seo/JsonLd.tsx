/**
 * Renders a JSON-LD block into the document.
 *
 * `dangerouslySetInnerHTML` is unavoidable here — React escapes text children,
 * and an escaped `&quot;` inside a ld+json script is invalid JSON that every
 * parser drops. Two things make it safe:
 *
 *  1. `data` is built by lib/seo/structured-data.ts from site.ts constants and
 *     from already-sanitized article fields. Article body HTML never reaches
 *     it — only the title, description and dates.
 *  2. Every `<` is emitted as its < escape, which is still valid JSON but
 *     cannot close the surrounding script tag. That is the whole injection
 *     surface of a ld+json block, closed regardless of what the payload holds.
 *
 * The site's CSP allows 'unsafe-inline' for script-src, so no nonce is needed;
 * if that relaxation is ever tightened with nonces, this tag needs one too.
 */
export function JsonLd({ data }: { data: object }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(data).replace(/</g, "\\u003c"),
      }}
    />
  );
}
