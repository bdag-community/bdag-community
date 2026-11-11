import { decode } from "entities";
import sanitizeHtml from "sanitize-html";
import { isArticleButtonUrl } from "./article-button.ts";

export const ARTICLE_BODY_MAX_HTML_LENGTH = 400_000;
export const ARTICLE_BODY_MAX_PUBLIC_HTML_LENGTH = 100_000;
export const ARTICLE_BODY_MAX_TEXT_LENGTH = 50_000;

const ARTICLE_BODY_TAGS = [
  "p",
  "h2",
  "h3",
  "strong",
  "em",
  "u",
  "blockquote",
  "ul",
  "ol",
  "li",
  "a",
  "br",
] as const;

const SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [...ARTICLE_BODY_TAGS],
  allowedAttributes: { a: ["href", "data-article-button", "target", "rel"] },
  transformTags: {
    a: (_tagName, attributes): sanitizeHtml.Tag => {
      if (attributes["data-article-button"] === "true") {
        return {
          tagName: "a",
          attribs: isArticleButtonUrl(attributes.href ?? "")
            ? {
                href: attributes.href,
                "data-article-button": "true",
                target: "_blank",
                rel: "noopener noreferrer",
              }
            : {},
        };
      }
      return { tagName: "a", attribs: attributes.href ? { href: attributes.href } : {} };
    },
  },
  allowedSchemes: ["http", "https", "mailto"],
  allowProtocolRelative: false,
  allowedSchemesAppliedToAttributes: ["href"],
  disallowedTagsMode: "discard",
  nonTextTags: [
    "script",
    "style",
    "textarea",
    "option",
    "xmp",
    "iframe",
    "noscript",
    "svg",
    "math",
  ],
};

const TEXT_ONLY_OPTIONS: sanitizeHtml.IOptions = {
  ...SANITIZE_OPTIONS,
  allowedTags: [],
  allowedAttributes: {},
};

export type SanitizedArticleBody = {
  html: string;
  text: string;
};

export function sanitizeArticleBody(value: string): SanitizedArticleBody {
  const html = sanitizeHtml(value, SANITIZE_OPTIONS).trim();
  const textWithBlockBreaks = html
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/(<a\b[^>]*data-article-button="true"[^>]*>.*?<\/a>)/gi, "\n$1\n")
    .replace(/<\/(?:p|h2|h3|blockquote|li|ul|ol)>/gi, "\n");
  const text = decode(
    sanitizeHtml(textWithBlockBreaks, TEXT_ONLY_OPTIONS),
  )
    .replace(/&nbsp;|\u00a0/g, " ")
    .split("\n")
    .map((line) => line.replace(/[\t\f\v ]+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
  return { html, text };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function plainTextToArticleHtml(value: string): string {
  return value
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map((paragraph) =>
      "<p>" + escapeHtml(paragraph).replace(/\n/g, "<br>") + "</p>",
    )
    .join("");
}
