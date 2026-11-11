'use client';

import { useRef, useState } from 'react';
import { Copy, Check } from 'lucide-react';
import { copyText, selectElementText } from '@/lib/utils/copy';

/**
 * Block-level sibling of <CopyRef> — the same Copy→Check affordance, but for
 * a multi-line snippet rendered in a mono <pre> (CopyRef's inline <code> is
 * sized for short refs). Built for the wallet-config JSON that exchanges and
 * integrators paste verbatim. The snippet stays visible/selectable if the
 * clipboard is unavailable.
 */
export function CopySnippet({
  value,
  label = 'snippet',
}: {
  value: string;
  label?: string;
}) {
  const [copied, setCopied] = useState(false);
  const preRef = useRef<HTMLPreElement>(null);

  async function copy() {
    // Same contract as <CopyRef>: copyText falls back to a selection-based
    // copy when the async Clipboard API is missing or rejects, and the state
    // flips on what actually happened rather than on the attempt.
    if (await copyText(value)) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      return;
    }
    selectElementText(preRef.current);
  }

  return (
    <div className="relative">
      {/* The <pre> scrolls sideways, so it has to be reachable without a
          pointer (WCAG 2.1.1): a named region that takes focus, which is what
          makes the arrow keys scroll it. The name is the caller's label — the
          same words the copy button announces, so the two agree. */}
      {/* Machine-facing values wear teal (DESIGN.md accent roles). */}
      <pre
        ref={preRef}
        role="region"
        aria-label={label}
        tabIndex={0}
        className="focus-ring overflow-x-auto rounded-xl border border-border/60 bg-base-void/60 p-4 pr-12 font-mono text-xs leading-relaxed text-teal-soft/90"
      >
        {value}
      </pre>
      {/* before: is a transparent 50px hit area over a 28px button. Copying is
          the entire point of this component and a 28px target fails 2.5.5 on a
          phone, but growing the button itself would put a chunky control on top
          of the code it is meant to sit quietly beside. */}
      <button
        type="button"
        onClick={copy}
        aria-label={copied ? `${label} copied` : `Copy ${label}`}
        className={[
          "absolute right-2.5 top-2.5 inline-flex shrink-0 items-center rounded border p-1.5 transition-colors before:absolute before:-inset-[11px] before:content-[''] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
          copied
            ? 'border-success/40 text-success'
            : 'border-border bg-base-void/80 text-on-surface-variant hover:text-on-surface',
        ].join(' ')}
      >
        {copied ? (
          <Check className="size-3.5" strokeWidth={1.75} aria-hidden />
        ) : (
          <Copy className="size-3.5" strokeWidth={1.75} aria-hidden />
        )}
      </button>
      {/* No live region: the button's own aria-label flips to "{label} copied",
          and a screen reader announces the focused control's new name. A
          role="status" saying the identical string alongside it was a double
          announcement, not a confirmation. */}
    </div>
  );
}
