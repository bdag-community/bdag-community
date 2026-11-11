"use client";

import { useRef, useState } from "react";
import { Copy, Check } from "lucide-react";
import { copyText, selectElementText } from "@/lib/utils/copy";

/**
 * A canonical value, shown in full and copyable in one tap — the RPC URL, the
 * chain ID, a contract address. On this site those are the values a reader has
 * to get exactly right or lose money to the fork, so they are always visible
 * and always selectable; the button is a convenience over the top of that, not
 * the only way to get the string.
 *
 * Machine-facing values wear teal (DESIGN.md accent roles). 'use client' is
 * scoped here for the clipboard write alone.
 *
 * State is not text-only: the icon flips Copy → Check AND the button's
 * accessible name flips to "{label} copied", which is what a screen reader
 * announces when focus is on the button that was just pressed. There is
 * deliberately no live region beside it — the pair announced the same sentence
 * twice.
 */
export function CopyRef({
  value,
  label = "reference",
}: {
  value: string;
  label?: string;
}) {
  const [copied, setCopied] = useState(false);
  const codeRef = useRef<HTMLElement>(null);

  async function copy() {
    // copyText falls back to a selection-based copy when the async Clipboard
    // API is missing or rejects — see lib/utils/copy. The state flips on what
    // ACTUALLY happened; this used to set it after an await that could reject
    // into an empty catch, so a failed copy looked identical to no click.
    if (await copyText(value)) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      return;
    }
    // Both paths refused. The value is on screen and selectable by design, so
    // hand over a selection the reader can take with the keyboard rather than
    // a button that did nothing.
    selectElementText(codeRef.current);
  }

  return (
    <span className="inline-flex items-center gap-1.5">
      <code ref={codeRef} className="break-all font-mono text-xs text-teal-soft">
        {value}
      </code>
      <button
        type="button"
        onClick={copy}
        aria-label={copied ? `${label} copied` : `Copy ${label}`}
        className={[
          // The ::before expander takes the hit area from ~24px to ~46px
          // without moving a pixel of the visual button. Copying IS the task
          // on /chain, /community and /mining, and a 24px target on a phone is
          // a target you miss — but a 44px SQUARE drawn here would have pushed
          // the value and the button apart everywhere they sit inline.
          "relative inline-flex shrink-0 items-center rounded border p-1 transition-colors",
          "before:absolute before:-inset-[11px] before:content-['']",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
          copied
            ? "border-success/40 text-success"
            : "border-border text-on-surface-variant hover:text-on-surface",
        ].join(" ")}
      >
        {copied ? (
          <Check className="size-3.5" strokeWidth={1.75} aria-hidden />
        ) : (
          <Copy className="size-3.5" strokeWidth={1.75} aria-hidden />
        )}
      </button>
    </span>
  );
}
