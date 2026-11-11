"use client";

import {
  useActionState,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
} from "react";
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input, Textarea } from "@/components/ui/Input";
import { RichTextEditor } from "@/components/news/RichTextEditor";
import {
  TurnstileWidget,
  TURNSTILE_CLIENT_CONFIGURED,
} from "@/components/security/TurnstileWidget";
import { NEWS_PAGE } from "@/lib/content/site";
import {
  ARTICLE_ASSET_MAX_ALT_TEXT_LENGTH,
  ARTICLE_ASSET_MAX_BYTES,
  isArticleAssetContentType,
} from "@/lib/news/article-asset-policy";
import {
  submitCommunityArticle,
  type CommunityArticleState,
  type CommunityArticleValues,
} from "@/app/(public)/articles/submit/actions";

const INITIAL_STATE: CommunityArticleState = { ok: null, attempt: 0 };

const FIELDS: readonly { key: keyof CommunityArticleValues; id: string }[] = [
  { key: "authorName", id: "submission-author-name" },
  { key: "title", id: "submission-title" },
  { key: "subtitle", id: "submission-subtitle" },
  { key: "description", id: "submission-description" },
  { key: "body", id: "submission-body" },
  { key: "assetContentType", id: "submission-cover-image" },
  { key: "assetAltText", id: "submission-cover-alt" },
];

const copy = NEWS_PAGE.submission.form;

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

export function CommunityArticleForm() {
  const [state, formAction, pending] = useActionState(
    submitCommunityArticle,
    INITIAL_STATE,
  );
  const errors = FIELDS.flatMap((field) => {
    const message = state.fieldErrors?.[field.key];
    return message ? [{ ...field, message }] : [];
  });
  const summaryErrors = state.formError
    ? [...errors, { key: "verification", id: "submission-verification", message: state.formError }]
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
        const presignResponse = await fetch("/api/news/assets/presign", {
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
      aria-labelledby="submission-form-heading"
      className="flex flex-col gap-5"
      noValidate
    >
      <div className="hidden" aria-hidden>
        <label htmlFor="submission-website">{copy.honeypotLabel}</label>
        <input
          id="submission-website"
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
          htmlFor="submission-author-name"
          className="text-sm font-medium text-on-surface"
        >
          {copy.authorNameLabel}{" "}
          <span className="text-xs text-on-surface-variant">
            ({copy.optional})
          </span>
        </label>
        <Input
          id="submission-author-name"
          name="authorName"
          maxLength={120}
          autoComplete="name"
          defaultValue={state.values?.authorName}
          aria-invalid={state.fieldErrors?.authorName ? true : undefined}
          aria-describedby={
            state.fieldErrors?.authorName
              ? "submission-author-name-error"
              : undefined
          }
        />
        {state.fieldErrors?.authorName ? (
          <p id="submission-author-name-error" className="text-sm text-error">
            {state.fieldErrors.authorName}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-2">
        <label
          htmlFor="submission-title"
          className="text-sm font-medium text-on-surface"
        >
          {copy.titleLabel}
        </label>
        <Input
          id="submission-title"
          name="title"
          required
          minLength={5}
          maxLength={200}
          defaultValue={state.values?.title}
          aria-invalid={state.fieldErrors?.title ? true : undefined}
          aria-describedby={
            state.fieldErrors?.title ? "submission-title-error" : undefined
          }
        />
        {state.fieldErrors?.title ? (
          <p id="submission-title-error" className="text-sm text-error">
            {state.fieldErrors.title}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-2">
        <label
          htmlFor="submission-subtitle"
          className="text-sm font-medium text-on-surface"
        >
          {copy.subtitleLabel}{" "}
          <span className="text-xs text-on-surface-variant">
            ({copy.optional})
          </span>
        </label>
        <Input
          id="submission-subtitle"
          name="subtitle"
          maxLength={300}
          defaultValue={state.values?.subtitle}
          aria-invalid={state.fieldErrors?.subtitle ? true : undefined}
          aria-describedby={
            state.fieldErrors?.subtitle
              ? "submission-subtitle-error"
              : undefined
          }
        />
        {state.fieldErrors?.subtitle ? (
          <p id="submission-subtitle-error" className="text-sm text-error">
            {state.fieldErrors.subtitle}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-2">
        <label
          htmlFor="submission-description"
          className="text-sm font-medium text-on-surface"
        >
          {copy.descriptionLabel}
        </label>
        <Textarea
          id="submission-description"
          name="description"
          rows={4}
          required
          minLength={20}
          maxLength={1000}
          defaultValue={state.values?.description}
          aria-invalid={state.fieldErrors?.description ? true : undefined}
          aria-describedby={
            state.fieldErrors?.description
              ? "submission-description-help submission-description-error"
              : "submission-description-help"
          }
        />
        <p
          id="submission-description-help"
          className="text-xs leading-relaxed text-on-surface-variant"
        >
          {copy.descriptionHint}
        </p>
        {state.fieldErrors?.description ? (
          <p id="submission-description-error" className="text-sm text-error">
            {state.fieldErrors.description}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-2">
        <RichTextEditor
          key={"submission-body-" + state.attempt}
          id="submission-body"
          name="body"
          label={copy.bodyLabel}
          required
          minLength={100}
          maxLength={50_000}
          initialValue={state.values?.body}
          fallbackValue={state.bodyFallback}
          invalid={Boolean(state.fieldErrors?.body)}
          describedBy={
            state.fieldErrors?.body
              ? "submission-body-help submission-body-error"
              : "submission-body-help"
          }
        />
        <p
          id="submission-body-help"
          className="text-xs leading-relaxed text-on-surface-variant"
        >
          {copy.bodyHint}
        </p>
        {state.fieldErrors?.body ? (
          <p id="submission-body-error" className="text-sm text-error">
            {state.fieldErrors.body}
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
          htmlFor="submission-cover-image"
          className="text-sm font-medium text-on-surface"
        >
          {copy.coverImageLabel}{" "}
          <span className="text-xs text-on-surface-variant">
            ({copy.optional})
          </span>
        </label>
        <Input
          ref={fileInputRef}
          id="submission-cover-image"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={handleAssetChange}
          aria-invalid={
            assetError || state.fieldErrors?.assetContentType ? true : undefined
          }
          aria-describedby={
            assetError || state.fieldErrors?.assetContentType
              ? "submission-cover-image-help submission-cover-image-error"
              : "submission-cover-image-help"
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
          id="submission-cover-image-help"
          className="text-xs leading-relaxed text-on-surface-variant"
        >
          {copy.coverImageHint}
        </p>
        {assetError || state.fieldErrors?.assetContentType ? (
          <p id="submission-cover-image-error" className="text-sm text-error">
            {assetError ?? state.fieldErrors?.assetContentType}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-2">
        <label
          htmlFor="submission-cover-alt"
          className="text-sm font-medium text-on-surface"
        >
          {copy.assetAltTextLabel}{" "}
          <span className="text-xs text-on-surface-variant">
            ({copy.optional})
          </span>
        </label>
        <Textarea
          id="submission-cover-alt"
          name="assetAltText"
          rows={3}
          maxLength={ARTICLE_ASSET_MAX_ALT_TEXT_LENGTH}
          disabled={!assetFile}
          defaultValue={state.values?.assetAltText}
          aria-invalid={state.fieldErrors?.assetAltText ? true : undefined}
          aria-describedby={
            state.fieldErrors?.assetAltText
              ? "submission-cover-alt-help submission-cover-alt-error"
              : "submission-cover-alt-help"
          }
        />
        <p
          id="submission-cover-alt-help"
          className="text-xs leading-relaxed text-on-surface-variant"
        >
          {copy.assetAltTextHint}
        </p>
        {state.fieldErrors?.assetAltText ? (
          <p id="submission-cover-alt-error" className="text-sm text-error">
            {state.fieldErrors.assetAltText}
          </p>
        ) : null}
      </div>

      <TurnstileWidget
        id="submission-verification"
        action="submit_article"
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
