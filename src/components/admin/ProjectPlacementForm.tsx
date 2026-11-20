"use client";

import { useActionState, useState } from "react";
import { setProjectPlacementAction } from "@/app/(admin)/admin/projects/actions";
import { Button } from "@/components/ui/Button";

export function ProjectPlacementForm({
  id,
  featured,
  focused,
}: {
  id: string;
  featured: boolean;
  focused: boolean;
}) {
  const [isFeatured, setFeatured] = useState(featured);
  const [isFocused, setFocused] = useState(focused);
  const [result, action, pending] = useActionState(
    setProjectPlacementAction.bind(null, id),
    null,
  );

  return (
    <form action={action} className="max-w-2xl space-y-3">
      <fieldset disabled={pending} className="space-y-3">
        <legend className="h4 text-on-surface">Homepage placement</legend>
        <label className="flex items-start gap-3 text-sm text-on-surface">
          <input
            type="checkbox"
            className="focus-ring mt-0.5 size-4 shrink-0"
            name="focused"
            checked={isFocused}
            onChange={(event) => setFocused(event.target.checked)}
          />
          <span>
            Focused project
            <span className="block text-on-surface-variant">
              Takes the full-width spotlight and replaces the current focused project.
            </span>
          </span>
        </label>
        <label className="flex items-start gap-3 text-sm text-on-surface">
          <input
            type="checkbox"
            className="focus-ring mt-0.5 size-4 shrink-0"
            name="featured"
            checked={isFeatured}
            onChange={(event) => setFeatured(event.target.checked)}
          />
          <span>
            Featured project
            <span className="block text-on-surface-variant">
              The two most recently published featured projects appear below the spotlight.
            </span>
          </span>
        </label>
      </fieldset>
      <Button type="submit" variant="ghost" disabled={pending}>
        {pending ? "Saving…" : "Save placement"}
      </Button>
      {result && (
        <p
          role={result.ok ? "status" : "alert"}
          className={result.ok ? "text-sm text-success" : "text-sm text-error"}
        >
          {result.ok ? result.message : result.error}
        </p>
      )}
    </form>
  );
}
