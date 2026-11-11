"use client";

import { useEffect, useState } from "react";
import { Link2, Check } from "lucide-react";
import { copyText } from "@/lib/utils/copy";

/**
 * Deep-link plumbing for the FAQ, kept as a small progressive-enhancement
 * island so the answers themselves stay server-rendered and work with no JS.
 *
 * FaqHashSync does two things once the page is interactive:
 *   - On load, and on any later hashchange, it opens the question whose id
 *     matches the URL hash and scrolls it into view, so a pasted deep link
 *     lands the reader on an already-open answer.
 *   - When a reader opens a question, it writes that question's id into the URL
 *     with replaceState, so the address bar always shows a copyable link to the
 *     open answer without stacking history entries or jumping the scroll.
 *
 * Only top-level questions carry data-faq="question", so opening the nested
 * "full explanation" disclosure never rewrites the URL.
 */
export function FaqHashSync() {
  useEffect(() => {
    const openFromHash = (hash: string) => {
      const id = decodeURIComponent(hash.replace(/^#/, ""));
      if (!id) return;
      const el = document.getElementById(id);
      if (el instanceof HTMLDetailsElement) {
        el.open = true;
        // Defer so the just-opened panel has its final height before we scroll.
        requestAnimationFrame(() =>
          el.scrollIntoView({ behavior: "smooth", block: "start" }),
        );
      }
    };

    if (location.hash) openFromHash(location.hash);
    const onHashChange = () => openFromHash(location.hash);
    window.addEventListener("hashchange", onHashChange);

    // The toggle event does not bubble, so it is caught in the capture phase.
    const onToggle = (e: Event) => {
      const t = e.target;
      if (
        t instanceof HTMLDetailsElement &&
        t.dataset.faq === "question" &&
        t.open &&
        t.id
      ) {
        history.replaceState(null, "", `#${t.id}`);
      }
    };
    document.addEventListener("toggle", onToggle, true);

    return () => {
      window.removeEventListener("hashchange", onHashChange);
      document.removeEventListener("toggle", onToggle, true);
    };
  }, []);

  return null;
}

/**
 * The copy-this-question control shown inside an open answer. It copies the
 * full absolute deep link and drops the same hash into the address bar, so a
 * reader can hand someone a link that opens straight to this question with its
 * answer already showing. copyText falls back to a selection-based copy when
 * the async Clipboard API is missing or refused (see lib/utils/copy).
 */
export function FaqPermalink({ id }: { id: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    const url = `${location.origin}${location.pathname}#${id}`;
    const ok = await copyText(url);
    // Reflect the anchor in the address bar either way, so a reader can still
    // copy it by hand if the clipboard write was refused.
    history.replaceState(null, "", `#${id}`);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      aria-label={copied ? "Link to this question copied" : "Copy link to this question"}
      className={[
        "focus-ring inline-flex items-center gap-1.5 rounded text-sm font-medium transition-colors",
        copied
          ? "text-success"
          : "text-on-surface-variant hover:text-on-surface",
      ].join(" ")}
    >
      {copied ? (
        <Check className="size-4" strokeWidth={1.75} aria-hidden />
      ) : (
        <Link2 className="size-4" strokeWidth={1.75} aria-hidden />
      )}
      {copied ? "Link copied" : "Copy link"}
    </button>
  );
}
