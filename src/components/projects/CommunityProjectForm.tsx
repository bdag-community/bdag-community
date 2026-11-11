"use client";

import {
  useActionState,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
} from "react";
import { AlertCircle, CheckCircle2, ChevronDown, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { FIELD_BASE, Input, Textarea } from "@/components/ui/Input";
import { cn } from "@/lib/utils/cn";
import {
  TurnstileWidget,
  TURNSTILE_CLIENT_CONFIGURED,
} from "@/components/security/TurnstileWidget";
import { PROJECT_CATEGORIES, PROJECTS_PAGE } from "@/lib/content/site";
import {
  ARTICLE_ASSET_MAX_ALT_TEXT_LENGTH,
  ARTICLE_ASSET_MAX_BYTES,
  isArticleAssetContentType,
} from "@/lib/news/article-asset-policy";
import {
  submitCommunityProject,
  type CommunityProjectState,
  type CommunityProjectValues,
} from "@/app/(public)/community/projects/submit/actions";

/**
 * The public project submission form — the CommunityArticleForm pattern
 * (honeypot, error summary with focus management, Turnstile gate, optional
 * one-shot cover upload) without the rich text editor: a project entry is a
 * name, a link, a category, and one card paragraph.
 */

const INITIAL_STATE: CommunityProjectState = { ok: null, attempt: 0 };

const FIELDS: readonly { key: keyof CommunityProjectValues; id: string }[] = [
  { key: "authorName", id: "project-author-name" },
  { key: "name", id: "project-name" },
  { key: "url", id: "project-url" },
  { key: "category", id: "project-category" },
  { key: "description", id: "project-description" },
  { key: "assetContentType", id: "project-cover-image" },
  { key: "assetAltText", id: "project-cover-alt" },
];

const copy = PROJECTS_PAGE.submission.form;

type AssetUploadStatus = "idle" | "uploading" | "complete" | "failed";

type PresignResponse = {
  ok: true;
  upload: {
    url: string;
    method: "PUT";
    byteSize: number;
    headers: {
      "Content-Type": string;
      "If-None-Match": "*";
      "Content-Length": string;
    };
  };
};

function isPresignResponse(value: unknown): value is PresignResponse {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<PresignResponse>;
  let uploadOrigin = "";
  try {
    uploadOrigin = candidate.upload?.url
      ? new URL(candidate.upload.url).origin
      : "";
  } catch {
    return false;
  }
  return Boolean(
    candidate.ok === true &&
      candidate.upload &&
      typeof candidate.upload.url === "string" &&
      uploadOrigin === "https://s3.eu-central-1.amazonaws.com" &&
      candidate.upload.method === "PUT" &&
      Number.isInteger(candidate.upload.byteSize) &&
      candidate.upload.headers?.["If-None-Match"] === "*" &&
      candidate.upload.headers?.["Content-Type"] &&
      candidate.upload.headers?.["Content-Length"] ===
        String(candidate.upload.byteSize),
  );
}

export function CommunityProjectForm() {
  const [state, formAction, pending] = useActionState(
    submitCommunityProject,
    INITIAL_STATE,
  );
  const errors = FIELDS.flatMap((field) => {
    const message = state.fieldErrors?.[field.key];
    return message ? [{ ...field, message }] : [];
  });
  const summaryErrors = state.formError
    ? [
        ...errors,
        {
          key: "verification",
          id: "project-verification",
          message: state.formError,
        },
      ]
    : errors;

  const summaryRef = useRef<HTMLDivElement>(null);
  const successRef = useRef<HTMLDivElement>(null);
  const failureRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadStartedAttempt = useRef<number | null>(null);
  const [assetFile, setAssetFile] = useState<File | null>(null);
  const [assetError, setAssetError] = useState<string | null>(null);
  const [assetUploadStatus, setAssetUploadStatus] =
    useState<AssetUploadStatus>("idle");
  const [humanVerified, setHumanVerified] = useState(false);
  const handleVerifiedChange = useCallback(
    (verified: boolean) => setHumanVerified(verified),
    [],
  );

  useEffect(() => {
    summaryRef.current?.focus();
  }, [state.attempt]);

  useEffect(() => {
    if (state.ok === true) successRef.current?.focus();
  }, [state.ok]);

  useEffect(() => {
    if (state.ok === false) failureRef.current?.focus();
  }, [state.ok, state.attempt]);

  useEffect(() => {
    if (state.ok !== true || uploadStartedAttempt.current === state.attempt) {
      return;
    }
    uploadStartedAttempt.current = state.attempt;

    if (!state.assetUpload) {
      return;
    }
    if (state.assetUpload.status !== "ready" || !assetFile) {
      return;
    }

    const file = assetFile;
    const capability = state.assetUpload.capability;
    void (async () => {
      try {
        const presignResponse = await fetch("/api/projects/assets/presign", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ capability }),
          cache: "no-store",
          signal: AbortSignal.timeout(10_000),
        });
        const presignBody: unknown = await presignResponse.json();
        if (
          !presignResponse.ok ||
          !isPresignResponse(presignBody) ||
          presignBody.upload.byteSize !== file.size
        ) {
          setAssetUploadStatus("failed");
          return;
        }

        const uploadResponse = await fetch(presignBody.upload.url, {
          method: "PUT",
          headers: {
            "Content-Type": presignBody.upload.headers["Content-Type"],
            "If-None-Match": presignBody.upload.headers["If-None-Match"],
          },
          body: file,
          signal: AbortSignal.timeout(120_000),
        });
        setAssetUploadStatus(uploadResponse.ok ? "complete" : "failed");
      } catch {
        setAssetUploadStatus("failed");
      }
    })();
  }, [assetFile, state.assetUpload, state.attempt, state.ok]);

  const handleAssetChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.currentTarget.files?.[0] ?? null;
      if (!file) {
        setAssetFile(null);
        setAssetError(null);
        return;
      }
      if (!isArticleAssetContentType(file.type)) {
        event.currentTarget.value = "";
        setAssetFile(null);
        setAssetError(copy.validation.assetType);
        return;
      }
      if (file.size < 1 || file.size > ARTICLE_ASSET_MAX_BYTES) {
        event.currentTarget.value = "";
        setAssetFile(null);
        setAssetError(copy.validation.assetSize);
        return;
      }
      setAssetFile(file);
      setAssetError(null);
    },
    [],
  );

  if (state.ok === true) {
    const effectiveAssetUploadStatus =
      !state.assetUpload
        ? "complete"
        : state.assetUpload.status === "unavailable" || !assetFile
          ? "failed"
          : assetUploadStatus;
    const assetMessage =
      effectiveAssetUploadStatus === "uploading" ||
      (state.assetUpload?.status === "ready" &&
        effectiveAssetUploadStatus === "idle")
        ? copy.assetUploadUploading
        : effectiveAssetUploadStatus === "failed" ||
            state.assetUpload?.status === "unavailable"
          ? copy.assetUploadFailed
          : state.assetUpload
            ? copy.assetUploadComplete
            : copy.success;
    const failed =
      effectiveAssetUploadStatus === "failed" ||
      state.assetUpload?.status === "unavailable";
    const uploading =
      effectiveAssetUploadStatus === "uploading" ||
      (state.assetUpload?.status === "ready" &&
        effectiveAssetUploadStatus === "idle");
    return (
      <div
        ref={successRef}
        role={failed ? "alert" : "status"}
        tabIndex={-1}
        className={`focus-ring flex items-start gap-3 rounded-xl border p-4 ${
          failed
            ? "border-warn-orange/60 bg-warn-orange/5"
            : "border-success/40 bg-success/10"
        }`}
      >
        {uploading ? (
          <Loader2
            className="size-5 shrink-0 translate-y-0.5 animate-spin text-accent motion-reduce:animate-none"
            strokeWidth={1.75}
            aria-hidden
          />
        ) : failed ? (
          <AlertCircle
            className="size-5 shrink-0 translate-y-0.5 text-warn-orange"
            strokeWidth={1.75}
            aria-hidden
          />
        ) : (
          <CheckCircle2
            className="size-5 shrink-0 translate-y-0.5 text-success"
            strokeWidth={1.75}
            aria-hidden
          />
        )}
        <p className="text-sm leading-relaxed text-on-surface">
          {assetMessage}
        </p>
      </div>
    );
  }

  return (
    <form
      action={formAction}
      aria-labelledby="project-form-heading"
      className="flex flex-col gap-5"
      noValidate
    >
      <div className="hidden" aria-hidden>
        <label htmlFor="project-website">{copy.honeypotLabel}</label>
        <input
          id="project-website"
          type="text"
          name="website"
          tabIndex={-1}
          autoComplete="off"
        />
      </div>

      {summaryErrors.length > 0 ? (
        <div
          ref={summaryRef}
          role="alert"
          tabIndex={-1}
          className="focus-ring flex items-start gap-3 rounded-xl border border-error/50 bg-error/5 p-4"
        >
          <AlertCircle
            className="size-4 shrink-0 translate-y-0.5 text-error"
            strokeWidth={2}
            aria-hidden
          />
          <ul className="flex flex-col gap-1.5">
            {summaryErrors.map((error) => (
              <li key={error.key}>
                <a
                  href={`#${error.id}`}
                  className="focus-ring text-sm text-error underline decoration-error/40 underline-offset-4 transition-colors hover:decoration-error"
                >
                  {error.message}
                </a>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="flex flex-col gap-2">
        <label
          htmlFor="project-name"
          className="text-sm font-medium text-on-surface"
        >
          {copy.nameLabel}
        </label>
        <Input
          id="project-name"
          name="name"
          required
          minLength={2}
          maxLength={80}
          defaultValue={state.values?.name}
          aria-invalid={state.fieldErrors?.name ? true : undefined}
          aria-describedby={
            state.fieldErrors?.name ? "project-name-error" : undefined
          }
        />
        {state.fieldErrors?.name ? (
          <p id="project-name-error" className="text-sm text-error">
            {state.fieldErrors.name}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-2">
        <label
          htmlFor="project-url"
          className="text-sm font-medium text-on-surface"
        >
          {copy.urlLabel}
        </label>
        <Input
          id="project-url"
          name="url"
          required
          mono
          inputMode="url"
          maxLength={300}
          placeholder="https://"
          defaultValue={state.values?.url}
          aria-invalid={state.fieldErrors?.url ? true : undefined}
          aria-describedby={
            state.fieldErrors?.url
              ? "project-url-help project-url-error"
              : "project-url-help"
          }
        />
        <p
          id="project-url-help"
          className="text-xs leading-relaxed text-on-surface-variant"
        >
          {copy.urlHint}
        </p>
        {state.fieldErrors?.url ? (
          <p id="project-url-error" className="text-sm text-error">
            {state.fieldErrors.url}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-2">
        <label
          htmlFor="project-category"
          className="text-sm font-medium text-on-surface"
        >
          {copy.categoryLabel}
        </label>
        {/* The house select treatment (see ContactForm): the native arrow
            is invisible on the dark field, so hide it and draw our own. */}
        <div className="relative">
          <select
            id="project-category"
            name="category"
            className={cn(FIELD_BASE, "appearance-none pr-10")}
            defaultValue={state.values?.category || "utility"}
            aria-invalid={state.fieldErrors?.category ? true : undefined}
            aria-describedby={
              state.fieldErrors?.category
                ? "project-category-help project-category-error"
                : "project-category-help"
            }
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
        <p
          id="project-category-help"
          className="text-xs leading-relaxed text-on-surface-variant"
        >
          {copy.categoryHint}
        </p>
        {state.fieldErrors?.category ? (
          <p id="project-category-error" className="text-sm text-error">
            {state.fieldErrors.category}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-2">
        <label
          htmlFor="project-author-name"
          className="text-sm font-medium text-on-surface"
        >
          {copy.authorNameLabel}{" "}
          <span className="text-xs text-on-surface-variant">
            ({copy.optional})
          </span>
        </label>
        <Input
          id="project-author-name"
          name="authorName"
          maxLength={120}
          autoComplete="name"
          defaultValue={state.values?.authorName}
          aria-invalid={state.fieldErrors?.authorName ? true : undefined}
          aria-describedby={
            state.fieldErrors?.authorName
              ? "project-author-name-error"
              : undefined
          }
        />
        {state.fieldErrors?.authorName ? (
          <p id="project-author-name-error" className="text-sm text-error">
            {state.fieldErrors.authorName}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-2">
        <label
          htmlFor="project-description"
          className="text-sm font-medium text-on-surface"
        >
          {copy.descriptionLabel}
        </label>
        <Textarea
          id="project-description"
          name="description"
          rows={4}
          required
          minLength={20}
          maxLength={200}
          defaultValue={state.values?.description}
          aria-invalid={state.fieldErrors?.description ? true : undefined}
          aria-describedby={
            state.fieldErrors?.description
              ? "project-description-help project-description-error"
              : "project-description-help"
          }
        />
        <p
          id="project-description-help"
          className="text-xs leading-relaxed text-on-surface-variant"
        >
          {copy.descriptionHint}
        </p>
        {state.fieldErrors?.description ? (
          <p id="project-description-error" className="text-sm text-error">
            {state.fieldErrors.description}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-1.5 border-l-2 border-warn-orange/60 pl-3">
        <p className="text-sm font-medium text-on-surface">{copy.conduct}</p>
        <p className="text-xs leading-relaxed text-on-surface-variant">
          {copy.safety}
        </p>
        <p className="text-xs leading-relaxed text-on-surface-variant">
          {copy.privacy}
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <label
          htmlFor="project-cover-image"
          className="text-sm font-medium text-on-surface"
        >
          {copy.coverImageLabel}{" "}
          <span className="text-xs text-on-surface-variant">
            ({copy.optional})
          </span>
        </label>
        <Input
          ref={fileInputRef}
          id="project-cover-image"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={handleAssetChange}
          aria-invalid={
            assetError || state.fieldErrors?.assetContentType ? true : undefined
          }
          aria-describedby={
            assetError || state.fieldErrors?.assetContentType
              ? "project-cover-image-help project-cover-image-error"
              : "project-cover-image-help"
          }
          className="file:mr-3 file:rounded file:border-0 file:bg-accent/15 file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-accent-soft"
        />
        <input
          type="hidden"
          name="assetContentType"
          value={assetFile?.type ?? ""}
        />
        <input
          type="hidden"
          name="assetByteSize"
          value={assetFile?.size ?? ""}
        />
        <p
          id="project-cover-image-help"
          className="text-xs leading-relaxed text-on-surface-variant"
        >
          {copy.coverImageHint}
        </p>
        {assetError || state.fieldErrors?.assetContentType ? (
          <p id="project-cover-image-error" className="text-sm text-error">
            {assetError ?? state.fieldErrors?.assetContentType}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-2">
        <label
          htmlFor="project-cover-alt"
          className="text-sm font-medium text-on-surface"
        >
          {copy.assetAltTextLabel}{" "}
          <span className="text-xs text-on-surface-variant">
            ({copy.optional})
          </span>
        </label>
        <Textarea
          id="project-cover-alt"
          name="assetAltText"
          rows={3}
          maxLength={ARTICLE_ASSET_MAX_ALT_TEXT_LENGTH}
          disabled={!assetFile}
          defaultValue={state.values?.assetAltText}
          aria-invalid={state.fieldErrors?.assetAltText ? true : undefined}
          aria-describedby={
            state.fieldErrors?.assetAltText
              ? "project-cover-alt-help project-cover-alt-error"
              : "project-cover-alt-help"
          }
        />
        <p
          id="project-cover-alt-help"
          className="text-xs leading-relaxed text-on-surface-variant"
        >
          {copy.assetAltTextHint}
        </p>
        {state.fieldErrors?.assetAltText ? (
          <p id="project-cover-alt-error" className="text-sm text-error">
            {state.fieldErrors.assetAltText}
          </p>
        ) : null}
      </div>

      <TurnstileWidget
        id="project-verification"
        action="submit_project"
        attempt={state.attempt}
        onVerifiedChange={handleVerifiedChange}
      />

      <div role="status">
        {state.ok === false ? (
          <div
            ref={failureRef}
            tabIndex={-1}
            className="focus-ring rounded-xl border border-warn-orange/60 bg-warn-orange/5 p-4"
          >
            <p className="text-sm leading-relaxed text-on-surface">
              {copy.failure}
            </p>
          </div>
        ) : null}
      </div>

      <Button
        type="submit"
        disabled={
          pending ||
          Boolean(assetError) ||
          !TURNSTILE_CLIENT_CONFIGURED ||
          !humanVerified
        }
        aria-busy={pending || undefined}
        className="w-fit"
        leadingIcon={
          pending ? (
            <Loader2
              className="size-4 animate-spin motion-reduce:animate-none"
              strokeWidth={2}
              aria-hidden
            />
          ) : undefined
        }
      >
        {copy.submitLabel}
      </Button>
    </form>
  );
}
