"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { FIELD_BASE, Input, Textarea } from "@/components/ui/Input";
import { cn } from "@/lib/utils/cn";
import {
  createProjectAction,
  updateProjectAction,
  type ProjectInput,
} from "@/app/(admin)/admin/projects/actions";
import type { AdminProjectRow } from "@/lib/dal/admin-projects";
import {
  ADMIN_PROJECTS_COPY,
  PROJECT_CATEGORIES,
} from "@/lib/content/site";

/**
 * Create/edit form for a community project — the ArticleForm pattern without
 * slugs or rich text: a project is a name, a link, a category, and one card
 * paragraph. The server action owns validation and the RPC-bound write.
 */

const FIELD_LABEL = "block text-sm text-on-surface-variant";
const HELP = "text-xs text-on-surface-variant";

export function ProjectForm({ project }: { project?: AdminProjectRow }) {
  const editing = Boolean(project);

  const [name, setName] = useState(project?.name ?? "");
  const [url, setUrl] = useState(project?.url ?? "");
  const [category, setCategory] = useState(
    project?.category && project.category in PROJECT_CATEGORIES
      ? project.category
      : "utility",
  );
  const [description, setDescription] = useState(project?.description ?? "");
  const [authorName, setAuthorName] = useState(project?.author_name ?? "");

  const [feedback, setFeedback] = useState<{
    ok: boolean;
    text: string;
  } | null>(null);
  const [pending, startTransition] = useTransition();
  const feedbackRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (feedback) feedbackRef.current?.focus();
  }, [feedback]);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFeedback(null);

    const input: ProjectInput = {
      name,
      url,
      category,
      description,
      authorName,
    };

    startTransition(async () => {
      // createProjectAction redirects to the edit page on success (it never
      // resolves — NEXT_REDIRECT propagates to the router); update resolves
      // with an honest result either way.
      const result = project
        ? await updateProjectAction(project.id, input)
        : await createProjectAction(input);
      if (result) {
        setFeedback(
          result.ok
            ? { ok: true, text: result.message }
            : { ok: false, text: result.error },
        );
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="max-w-2xl space-y-5" noValidate>
      <div className="space-y-1.5">
        <label htmlFor="project-name" className={FIELD_LABEL}>
          {ADMIN_PROJECTS_COPY.nameLabel}
        </label>
        <Input
          id="project-name"
          required
          maxLength={80}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="project-url" className={FIELD_LABEL}>
          {ADMIN_PROJECTS_COPY.urlLabel}
        </label>
        <Input
          id="project-url"
          required
          mono
          inputMode="url"
          maxLength={300}
          placeholder="https://"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          aria-describedby="project-url-help"
        />
        <p id="project-url-help" className={HELP}>
          {ADMIN_PROJECTS_COPY.urlHelp}
        </p>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="project-category" className={FIELD_LABEL}>
          {ADMIN_PROJECTS_COPY.categoryLabel}
        </label>
        <div className="relative">
          <select
            id="project-category"
            className={cn(FIELD_BASE, "appearance-none pr-10")}
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            aria-describedby="project-category-help"
          >
            {Object.entries(PROJECT_CATEGORIES).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <ChevronDown
            className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-on-surface-variant"
            strokeWidth={2}
            aria-hidden
          />
        </div>
        <p id="project-category-help" className={HELP}>
          {ADMIN_PROJECTS_COPY.categoryHelp}
        </p>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="project-author-name" className={FIELD_LABEL}>
          {ADMIN_PROJECTS_COPY.authorNameLabel}{" "}
          <span className="text-xs">({ADMIN_PROJECTS_COPY.optional})</span>
        </label>
        <Input
          id="project-author-name"
          maxLength={120}
          value={authorName}
          onChange={(e) => setAuthorName(e.target.value)}
          aria-describedby="project-author-name-help"
        />
        <p id="project-author-name-help" className={HELP}>
          {ADMIN_PROJECTS_COPY.authorNameHelp}
        </p>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="project-description" className={FIELD_LABEL}>
          {ADMIN_PROJECTS_COPY.descriptionLabel}
        </label>
        <Textarea
          id="project-description"
          rows={4}
          required
          maxLength={200}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          aria-describedby="project-description-help"
        />
        <p id="project-description-help" className={HELP}>
          {ADMIN_PROJECTS_COPY.descriptionHelp}
        </p>
      </div>

      {feedback && (
        <p
          ref={feedbackRef}
          role={feedback.ok ? "status" : "alert"}
          tabIndex={-1}
          className={
            feedback.ok
              ? "focus-ring text-sm text-success"
              : "focus-ring text-sm text-error"
          }
        >
          {feedback.text}
        </p>
      )}

      <Button type="submit" disabled={pending}>
        {pending
          ? "Saving…"
          : editing
            ? "Save project"
            : "Create project"}
      </Button>
    </form>
  );
}
