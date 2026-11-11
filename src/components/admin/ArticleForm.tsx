"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { ChevronDown } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { RichTextEditor } from "@/components/news/RichTextEditor";
import { FIELD_BASE, Input, Textarea } from "@/components/ui/Input";
import { cn } from "@/lib/utils/cn";
import {
  createArticleAction,
  beginArticleAssetReplacementAction,
  syncArticleAssetResultAction,
  updateArticleAction,
  type ArticleInput,
} from "@/app/(admin)/admin/news/actions";
import type { AdminArticleRow } from "@/lib/dal/admin";
import { ADMIN_NEWS_COPY, ARTICLE_CATEGORIES } from "@/lib/content/site";
import {
  ARTICLE_ASSET_MAX_ALT_TEXT_LENGTH,
  ARTICLE_ASSET_MAX_BYTES,
  isArticleAssetContentType,
} from "@/lib/news/article-asset-policy";
import { uploadAdminCover } from "@/lib/news/admin-cover-upload";

/**
 * Create/edit form for a news article — Operate mode: form-first, quiet, no
 * gradient moments. The server action owns validation (zod) + the RLS-bound
 * write; this component only collects values and renders honest feedback.
 *
 * Slug auto-suggests from the title (kebab-case) until the operator edits it
 * by hand — and never auto-changes when editing an existing article (a live
 * slug is a live URL).
 */

/** Kebab-case slug suggestion from a title (accents stripped). */
const slugify = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const FIELD_LABEL = "block text-sm text-on-surface-variant";
const HELP = "text-xs text-on-surface-variant";

export function ArticleForm({ article }: { article?: AdminArticleRow }) {
  const router = useRouter();
  const editing = Boolean(article);

  const [title, setTitle] = useState(article?.title ?? "");
  const [slug, setSlug] = useState(article?.slug ?? "");
  // Editing an existing article pins the slug; creating auto-suggests until touched.
  const [slugTouched, setSlugTouched] = useState(editing);
  const [subtitle, setSubtitle] = useState(article?.subtitle ?? "");
  const [description, setDescription] = useState(article?.description ?? "");
  const bodyHtmlRef = useRef(article?.body_html ?? "");
  const [authorName, setAuthorName] = useState(article?.author_name ?? "");
  const [category, setCategory] = useState(
    article?.category && article.category in ARTICLE_CATEGORIES
      ? article.category
      : "news",
  );
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverAltText, setCoverAltText] = useState("");
  const [coverError, setCoverError] = useState<string | null>(null);
  const [createdArticleId, setCreatedArticleId] = useState<string | null>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);

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
    if (createdArticleId) return;
    if (coverError) {
      setFeedback({ ok: false, text: coverError });
      coverInputRef.current?.focus();
      return;
    }
    setFeedback(null);

    const input: ArticleInput = {
      title,
      slug,
      subtitle,
      description,
      bodyHtml: bodyHtmlRef.current,
      authorName,
      category,
    };

    startTransition(async () => {
      if (article) {
        const result = await updateArticleAction(article.id, input);
        setFeedback(
          result.ok
            ? { ok: true, text: result.message }
            : { ok: false, text: result.error },
        );
        return;
      }

      // Without a cover the action keeps its existing redirect. With a cover,
      // it returns the newly created draft ID so the browser can upload bytes
      // directly to private S3, never through a Server Action.
      const result = await createArticleAction(input, Boolean(coverFile));
      if (!result) return;
      if (!result.ok) {
        setFeedback({ ok: false, text: result.error });
        return;
      }
      if (!coverFile) return;

      setCreatedArticleId(result.articleId);
      setFeedback({ ok: true, text: ADMIN_NEWS_COPY.createCoverUploading });
      try {
        await uploadAdminCover(result.articleId, coverFile, coverAltText, {
          begin: beginArticleAssetReplacementAction,
          sync: syncArticleAssetResultAction,
          request: fetch,
        });
        router.push(`/admin/news/${result.articleId}`);
      } catch {
        setFeedback({ ok: false, text: ADMIN_NEWS_COPY.createCoverFailed });
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="max-w-2xl space-y-5" noValidate>
      <div className="space-y-1.5">
        <label htmlFor="article-title" className={FIELD_LABEL}>
          Title
        </label>
        <Input
          id="article-title"
          required
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            if (!slugTouched) setSlug(slugify(e.target.value));
          }}
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="article-slug" className={FIELD_LABEL}>
          Slug
        </label>
        <Input
          id="article-slug"
          required
          mono
          value={slug}
          onChange={(e) => {
            setSlugTouched(true);
            setSlug(e.target.value);
          }}
          aria-describedby="article-slug-help"
        />
        <p id="article-slug-help" className={HELP}>
          The URL: /articles/{slug || "…"} (lowercase letters, digits, hyphens).
          {editing && " Changing it changes the live URL."}
        </p>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="article-author-name" className={FIELD_LABEL}>
          {ADMIN_NEWS_COPY.authorNameLabel}{" "}
          <span className="text-xs">({ADMIN_NEWS_COPY.optional})</span>
        </label>
        <Input
          id="article-author-name"
          maxLength={120}
          value={authorName}
          onChange={(e) => setAuthorName(e.target.value)}
          aria-describedby="article-author-name-help"
        />
        <p id="article-author-name-help" className={HELP}>
          {ADMIN_NEWS_COPY.authorNameHelp}
        </p>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="article-category" className={FIELD_LABEL}>
          {ADMIN_NEWS_COPY.categoryLabel}
        </label>
        <div className="relative">
          <select
            id="article-category"
            className={cn(FIELD_BASE, "appearance-none pr-10")}
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            aria-describedby="article-category-help"
          >
            {Object.entries(ARTICLE_CATEGORIES).map(([value, label]) => (
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
        <p id="article-category-help" className={HELP}>
          {ADMIN_NEWS_COPY.categoryHelp}
        </p>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="article-subtitle" className={FIELD_LABEL}>
          Subtitle <span className="text-xs">(optional)</span>
        </label>
        <Input
          id="article-subtitle"
          value={subtitle}
          onChange={(e) => setSubtitle(e.target.value)}
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="article-description" className={FIELD_LABEL}>
          Description
        </label>
        <Textarea
          id="article-description"
          rows={3}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          aria-describedby="article-description-help"
        />
        <p id="article-description-help" className={HELP}>
          Card and list summary, also the article lede.
        </p>
      </div>

      <div className="space-y-1.5">
        <RichTextEditor
          id="article-body"
          label={ADMIN_NEWS_COPY.bodyLabel}
          labelClassName={FIELD_LABEL}
          initialValue={article?.body_html ?? ""}
          fallbackValue={article?.body ?? ""}
          describedBy="article-body-help"
          onChange={(html) => {
            bodyHtmlRef.current = html;
          }}
        />
        <p id="article-body-help" className={HELP}>
          {ADMIN_NEWS_COPY.bodyHelp}
        </p>
      </div>

      {!editing ? (
        <div className="space-y-4 rounded-xl border border-border bg-base-void/30 p-4">
          <div className="space-y-1">
            <h2 className="text-sm font-semibold text-on-surface">
              {ADMIN_NEWS_COPY.createCoverTitle}
            </h2>
            <p className={HELP}>{ADMIN_NEWS_COPY.createCoverHint}</p>
          </div>
          <div className="space-y-1.5">
            <label htmlFor="article-cover-file" className={FIELD_LABEL}>
              Cover image <span className="text-xs">(optional)</span>
            </label>
            <Input
              ref={coverInputRef}
              id="article-cover-file"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              aria-describedby="article-cover-file-help"
              aria-invalid={Boolean(coverError)}
              onChange={(event) => {
                const file = event.currentTarget.files?.[0] ?? null;
                if (
                  file &&
                  (!isArticleAssetContentType(file.type) ||
                    file.size < 1 ||
                    file.size > ARTICLE_ASSET_MAX_BYTES)
                ) {
                  event.currentTarget.value = "";
                  setCoverFile(null);
                  setCoverError(ADMIN_NEWS_COPY.assetModeration.replacementInvalid);
                  return;
                }
                setCoverFile(file);
                setCoverError(null);
              }}
            />
            <p id="article-cover-file-help" className={HELP}>
              {ADMIN_NEWS_COPY.assetModeration.replacementBody}
            </p>
          </div>
          <div className="space-y-1.5">
            <label htmlFor="article-cover-alt" className={FIELD_LABEL}>
              Cover image description <span className="text-xs">(optional now)</span>
            </label>
            <Input
              id="article-cover-alt"
              value={coverAltText}
              maxLength={ARTICLE_ASSET_MAX_ALT_TEXT_LENGTH}
              disabled={!coverFile}
              onChange={(event) => setCoverAltText(event.target.value)}
              aria-describedby="article-cover-alt-help"
            />
            <p id="article-cover-alt-help" className={HELP}>
              {ADMIN_NEWS_COPY.assetModeration.replacementAltHint}
            </p>
          </div>
        </div>
      ) : null}

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

      {createdArticleId ? (
        <p className="text-sm text-on-surface-variant">
          {ADMIN_NEWS_COPY.createCoverSaved}{" "}
          <Link
            href={`/admin/news/${createdArticleId}`}
            className="focus-ring text-accent-soft underline underline-offset-4"
          >
            Open the saved article to review or retry the cover upload
          </Link>
          .
        </p>
      ) : null}

      <Button type="submit" disabled={pending || Boolean(createdArticleId)}>
        {pending
          ? coverFile
            ? "Saving and uploading…"
            : "Saving…"
          : editing
            ? "Save article"
            : "Create article"}
      </Button>
    </form>
  );
}
