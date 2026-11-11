"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { SuggestionForm } from "@/components/community/SuggestionForm";
import { COMMUNITY_PAGE } from "@/lib/content/site";

/**
 * The suggestion form, behind one explicit click (2026-08-13): the full form
 * dominated the page for every reader, most of whom are not here to file
 * anything. Mounting the form only on open also defers the Turnstile widget,
 * so the verification iframe loads for the person who wants the form rather
 * than for everyone who scrolls past it.
 *
 * Deliberately NOT a <details>: the FAQ's native disclosure holds static
 * prose, while this panel mounts a client form whose verification widget
 * should not render inside a container the UA is hiding.
 *
 * One-way on purpose. The trigger is replaced by the panel, and no collapse
 * control is offered: a reader who opened it either files the suggestion or
 * scrolls on, and a close button would exist only to lose half-typed form
 * state to a misclick. Focus moves to the first field so the open action
 * lands somewhere for keyboard and screen-reader users.
 */
export function SuggestionDisclosure() {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) panelRef.current?.querySelector("input")?.focus();
  }, [open]);

  if (!open) {
    return (
      <Button
        aria-expanded={false}
        aria-controls="suggestion-panel"
        onClick={() => setOpen(true)}
        size="lg"
        trailingIcon={
          <ChevronDown className="size-4" strokeWidth={2} aria-hidden />
        }
      >
        {COMMUNITY_PAGE.suggestionBox.openLabel}
      </Button>
    );
  }

  return (
    <div id="suggestion-panel" ref={panelRef} className="animate-fade-in">
      <Card className="p-6 sm:p-8">
        <SuggestionForm />
      </Card>
    </div>
  );
}
