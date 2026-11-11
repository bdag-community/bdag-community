"use client";

import { RouteError } from "@/components/site/RouteError";
import { Section } from "@/components/ui/Section";

export default function PublicError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <Section as="section" aria-label="Page error">
      <RouteError error={error} reset={reset} variant="public" />
    </Section>
  );
}
