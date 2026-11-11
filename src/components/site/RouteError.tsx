"use client";

import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ROUTE_STATES } from "@/lib/content/site";

export type RouteErrorProps = {
  error: Error & { digest?: string };
  reset: () => void;
  variant: "public" | "admin";
};

/**
 * Recoverable segment error. Unlike global-error, this renders inside the
 * route group's existing chrome, so the visitor keeps navigation and a clear
 * route back out of the failed segment.
 */
export function RouteError({ error, reset, variant }: RouteErrorProps) {
  const copy = ROUTE_STATES[variant];

  return (
    <Card
      role="alert"
      aria-labelledby={`${variant}-route-error-title`}
      className="flex max-w-2xl flex-col items-start gap-5 p-6 sm:p-8"
    >
      <div className="flex items-center gap-2 text-error">
        <AlertCircle className="size-5" strokeWidth={1.75} aria-hidden />
        <p className="eyebrow text-error">{copy.eyebrow}</p>
      </div>
      <div className="flex flex-col gap-3">
        <h1 id={`${variant}-route-error-title`} className="h2">
          {copy.title}
        </h1>
        <p className="lead">{copy.body}</p>
      </div>
      <div className="flex flex-wrap gap-3">
        <Button type="button" onClick={reset}>
          {copy.retry}
        </Button>
        <Button href="/" variant="ghost">
          {copy.home}
        </Button>
      </div>
      {error.digest ? (
        <p className="font-mono text-xs text-on-surface-variant">
          {ROUTE_STATES.reference} {error.digest}
        </p>
      ) : null}
    </Card>
  );
}
