"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useTransition,
  type ChangeEvent,
} from "react";
import { useRouter } from "next/navigation";
import {
  approveProjectAssetAction,
  beginProjectAssetReplacementAction,
  publishProjectAction,
  rejectProjectAssetAction,
  syncProjectAssetResultAction,
  unpublishProjectAction,
} from "@/app/(admin)/admin/projects/actions";
import { Button } from "@/components/ui/Button";
import { Input, Textarea } from "@/components/ui/Input";
import { ADMIN_PROJECTS_COPY } from "@/lib/content/site";
import type {
  AdminProjectAssetRow,
  AdminProjectRow,
} from "@/lib/dal/admin-projects";
import {
  ARTICLE_ASSET_MAX_ALT_TEXT_LENGTH,
  ARTICLE_ASSET_MAX_BYTES,
  isArticleAssetContentType,
} from "@/lib/news/article-asset-policy";

/**
 * The project image moderation panel — the ArticleModerationPanel machinery
 * against the project actions, presign route, and preview route. The shared
 * mechanics copy comes from the same assetModeration authority (see
 * ADMIN_PROJECTS_COPY in site.ts), so the two panels cannot drift.
 */

const copy = ADMIN_PROJECTS_COPY.assetModeration;
const FIELD_LABEL = "block text-sm text-on-surface-variant";
const HELP = "text-xs leading-relaxed text-on-surface-variant";
const PROCESSOR_SYNC_ATTEMPTS = 6;
const PROCESSOR_SYNC_DELAY_MS = 2_000;

type Feedback = { ok: boolean; text: string } | null;
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

const wait = (milliseconds: number) =>
  new Promise<void>((resolve) => window.setTimeout(resolve, milliseconds));

function isPresignResponse(value: unknown): value is PresignResponse {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<PresignResponse>;
  let origin = "";
  try {
    origin = candidate.upload?.url ? new URL(candidate.upload.url).origin : "";
  } catch {
    return false;
  }
  return Boolean(
    candidate.ok === true &&
      candidate.upload?.method === "PUT" &&
      typeof candidate.upload.url === "string" &&
      origin === "https://s3.eu-central-1.amazonaws.com" &&
      Number.isInteger(candidate.upload.byteSize) &&
      candidate.upload.headers?.["If-None-Match"] === "*" &&
      candidate.upload.headers?.["Content-Type"] &&
      candidate.upload.headers?.["Content-Length"] ===
        String(candidate.upload.byteSize),
  );
}

function FeedbackMessage({ feedback }: { feedback: Feedback }) {
  const ref = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (feedback) ref.current?.focus();
  }, [feedback]);
  if (!feedback) return null;
  return (
    <p
      ref={ref}
      role={feedback.ok ? "status" : "alert"}
      tabIndex={-1}
      className={`focus-ring text-sm ${feedback.ok ? "text-success" : "text-error"}`}
    >
      {feedback.text}
    </p>
  );
}

function ReplacementUpload({ projectId }: { projectId: string }) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [altText, setAltText] = useState("");
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [pending, startTransition] = useTransition();

  const handleFile = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const candidate = event.currentTarget.files?.[0] ?? null;
    if (!candidate) {
      setFile(null);
      setFeedback(null);
      return;
    }
    if (
      !isArticleAssetContentType(candidate.type) ||
      candidate.size < 1 ||
      candidate.size > ARTICLE_ASSET_MAX_BYTES
    ) {
      event.currentTarget.value = "";
      setFile(null);
      setFeedback({ ok: false, text: copy.replacementInvalid });
      return;
    }
    setFile(candidate);
    setFeedback(null);
  }, []);

  function upload() {
    if (!file) {
      setFeedback({ ok: false, text: copy.replacementInvalid });
      fileInputRef.current?.focus();
      return;
    }
    setFeedback(null);
    startTransition(async () => {
      try {
        const started = await beginProjectAssetReplacementAction(projectId, {
          contentType: file.type,
          byteSize: file.size,
          altText,
        });
        if (!started.ok) {
          setFeedback({ ok: false, text: started.error });
          return;
        }
        const presignResponse = await fetch("/api/projects/assets/presign", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ capability: started.capability }),
          cache: "no-store",
          signal: AbortSignal.timeout(10_000),
        });
        const presignBody: unknown = await presignResponse.json();
        if (
          !presignResponse.ok ||
          !isPresignResponse(presignBody) ||
          presignBody.upload.byteSize !== file.size ||
          presignBody.upload.headers["Content-Type"] !== file.type
        ) {
          throw new Error("presign rejected");
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
        if (!uploadResponse.ok) throw new Error("upload rejected");

        let synced = false;
        for (let attempt = 0; attempt < PROCESSOR_SYNC_ATTEMPTS; attempt += 1) {
          if (attempt > 0) await wait(PROCESSOR_SYNC_DELAY_MS);
          const result = await syncProjectAssetResultAction(
            projectId,
            started.assetId,
          );
          if (result.ok) {
            synced = true;
            break;
          }
        }
        setFile(null);
        setAltText("");
        if (fileInputRef.current) fileInputRef.current.value = "";
        setFeedback({
          ok: true,
          text: synced
            ? copy.replacementProcessed
            : copy.replacementProcessing,
        });
        router.refresh();
      } catch {
        setFeedback({ ok: false, text: copy.replacementPutFailed });
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-4 rounded-xl border border-border bg-base-void/30 p-4">
      <div className="space-y-1">
        <h3 className="h4 text-on-surface">{copy.replacementTitle}</h3>
        <p className={HELP}>{copy.replacementBody}</p>
      </div>
      <div className="space-y-1.5">
        <label htmlFor="admin-project-cover-file" className={FIELD_LABEL}>
          {copy.replacementLabel}
        </label>
        <Input
          ref={fileInputRef}
          id="admin-project-cover-file"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={handleFile}
          aria-describedby="admin-project-cover-file-help"
        />
        <p id="admin-project-cover-file-help" className={HELP}>
          {copy.replacementHint}
        </p>
      </div>
      <div className="space-y-1.5">
        <label htmlFor="admin-project-cover-alt" className={FIELD_LABEL}>
          {copy.replacementAltLabel}
        </label>
        <Input
          id="admin-project-cover-alt"
          value={altText}
          maxLength={ARTICLE_ASSET_MAX_ALT_TEXT_LENGTH}
          onChange={(event) => setAltText(event.target.value)}
          aria-describedby="admin-project-cover-alt-help"
        />
        <p id="admin-project-cover-alt-help" className={HELP}>
          {copy.replacementAltHint}
        </p>
      </div>
      <FeedbackMessage feedback={feedback} />
      <Button type="button" onClick={upload} disabled={pending}>
        {pending ? copy.replacementUploading : copy.replacementUpload}
      </Button>
    </div>
  );
}

function AssetModerationCard({
  project,
  asset,
  runtimeStorageEnvironment,
}: {
  project: AdminProjectRow;
  asset: AdminProjectAssetRow;
  runtimeStorageEnvironment: "development" | "production" | null;
}) {
  const router = useRouter();
  const [altText, setAltText] = useState(asset.alt_text ?? "");
  const [reason, setReason] = useState("");
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [pending, startTransition] = useTransition();
  // Same cross-environment boundary as article covers: files live in the
  // bucket of the environment they were uploaded from, so a mismatch gets an
  // explanation instead of a broken preview and failing S3 actions.
  const environmentMismatch =
    runtimeStorageEnvironment !== null &&
    asset.storage_environment !== runtimeStorageEnvironment;
  const hasPreview =
    !environmentMismatch &&
    asset.derivatives.some(({ variant_width }) => variant_width === 1024);

  function run(
    action: () => Promise<{ ok: boolean; message?: string; error?: string }>,
  ) {
    setFeedback(null);
    startTransition(async () => {
      try {
        const result = await action();
        setFeedback({
          ok: result.ok,
          text: result.ok
            ? (result.message ?? copy.working)
            : (result.error ?? copy.actionFailed),
        });
        if (result.ok) router.refresh();
      } catch {
        setFeedback({ ok: false, text: copy.actionFailed });
      }
    });
  }

  return (
    <article className="space-y-4 rounded-xl border border-border p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-on-surface">
          {copy.candidateLabel}
        </h3>
        <span className="rounded-full border border-outline px-3 py-1 font-mono text-xs text-on-surface-variant">
          {copy.stateLabels[asset.state]}
        </span>
      </div>

      {environmentMismatch ? (
        <p className={`${HELP} rounded-xl border border-warn-orange/40 bg-warn-orange/5 p-3`}>
          {copy.environmentMismatch
            .replaceAll(
              "{assetEnvironment}",
              copy.environmentNames[asset.storage_environment],
            )
            .replaceAll(
              "{runtimeEnvironment}",
              copy.environmentNames[runtimeStorageEnvironment!],
            )}
        </p>
      ) : null}

      {hasPreview ? (
        <div className="overflow-hidden rounded-xl border border-border bg-base-void">
          {/* The authenticated route streams one verified, version-bound derivative. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/admin/projects/${project.id}/assets/${asset.id}/preview`}
            alt={asset.alt_text || copy.previewAlt}
            width={1024}
            height={576}
            className="aspect-video w-full object-cover"
            referrerPolicy="no-referrer"
          />
        </div>
      ) : environmentMismatch ? null : (
        <p className={HELP}>{copy.previewUnavailable}</p>
      )}

      {asset.derivatives.length > 0 ? (
        <p className={HELP}>
          {copy.dimensionsLabel}: {asset.derivatives
            .map(({ width, height }) => `${width}×${height}`)
            .join(", ")}
        </p>
      ) : null}

      {asset.failure_reason ? (
        <p className={HELP}>
          <span className="font-semibold text-on-surface">
            {copy.processorReasonLabel}:
          </span>{" "}
          {copy.failureLabels[asset.failure_reason as keyof typeof copy.failureLabels] ??
            copy.failureLabels.unknown}
        </p>
      ) : null}

      {asset.moderation_reason ? (
        <p className={`${HELP} break-words`}>
          <span className="font-semibold text-on-surface">
            {copy.reviewReasonLabel}:
          </span>{" "}
          {asset.moderation_reason}
        </p>
      ) : null}

      {asset.state === "failed" || asset.state === "rejected" ? (
        <p className={HELP}>{copy.replacementAfterFailure}</p>
      ) : null}

      {asset.state === "awaiting_upload" && !environmentMismatch ? (
        <div className="space-y-3">
          <p className={HELP}>{copy.awaitingUploadHelp}</p>
          <Button
            type="button"
            variant="ghost"
            disabled={pending}
            onClick={() =>
              run(() => syncProjectAssetResultAction(project.id, asset.id))
            }
          >
            {pending ? copy.syncingLabel : copy.syncLabel}
          </Button>
        </div>
      ) : null}

      {asset.state === "ready" && !environmentMismatch ? (
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor={`project-asset-alt-${asset.id}`} className={FIELD_LABEL}>
              {copy.altLabel}
            </label>
            <Input
              id={`project-asset-alt-${asset.id}`}
              value={altText}
              maxLength={ARTICLE_ASSET_MAX_ALT_TEXT_LENGTH}
              onChange={(event) => setAltText(event.target.value)}
              aria-describedby={`project-asset-alt-help-${asset.id}`}
            />
            <p id={`project-asset-alt-help-${asset.id}`} className={HELP}>
              {copy.altHint}
            </p>
          </div>
          <Button
            type="button"
            disabled={pending}
            onClick={() =>
              run(() =>
                approveProjectAssetAction(project.id, asset.id, altText),
              )
            }
          >
            {pending ? copy.approvingLabel : copy.approveLabel}
          </Button>
        </div>
      ) : null}

      {asset.state === "ready" || asset.state === "approved" ? (
        <div className="space-y-3 border-t border-border pt-4">
          <div className="space-y-1.5">
            <label
              htmlFor={`project-asset-reason-${asset.id}`}
              className={FIELD_LABEL}
            >
              {copy.reasonLabel}
            </label>
            <Textarea
              id={`project-asset-reason-${asset.id}`}
              value={reason}
              rows={2}
              maxLength={1000}
              onChange={(event) => setReason(event.target.value)}
              aria-describedby={`project-asset-reason-help-${asset.id}`}
            />
            <p id={`project-asset-reason-help-${asset.id}`} className={HELP}>
              {copy.reasonHint}
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            disabled={pending}
            onClick={() =>
              run(() => rejectProjectAssetAction(project.id, asset.id, reason))
            }
          >
            {pending ? copy.rejectingLabel : copy.rejectLabel}
          </Button>
        </div>
      ) : null}

      {asset.state === "approved" && !environmentMismatch ? (
        <Button
          type="button"
          disabled={pending}
          onClick={() => run(() => publishProjectAction(project.id, asset.id))}
        >
          {/* Keyed on whether an image is CURRENTLY published, not on the
              project's publication state: a published project with no image
              yet is still publishing its first one, not replacing anything. */}
          {project.published_asset_id
            ? copy.replacePublishedCover
            : copy.publishWithCover}
        </Button>
      ) : null}

      <FeedbackMessage feedback={feedback} />
    </article>
  );
}

export function ProjectModerationPanel({
  project,
  runtimeStorageEnvironment,
}: {
  project: AdminProjectRow;
  runtimeStorageEnvironment: "development" | "production" | null;
}) {
  const router = useRouter();
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [pending, startTransition] = useTransition();
  const assets = project.assets ?? [];

  function publicationAction() {
    setFeedback(null);
    startTransition(async () => {
      try {
        const result = project.is_published
          ? await unpublishProjectAction(project.id)
          : await publishProjectAction(project.id, null);
        setFeedback({
          ok: result.ok,
          text: result.ok ? result.message : result.error,
        });
        if (result.ok) router.refresh();
      } catch {
        setFeedback({ ok: false, text: copy.actionFailed });
      }
    });
  }

  return (
    <section
      aria-labelledby="project-asset-moderation-heading"
      className="max-w-2xl space-y-5 rounded-2xl border border-accent/20 bg-container/40 p-5"
    >
      <div className="space-y-1">
        <h2 id="project-asset-moderation-heading" className="h3 text-on-surface">
          {copy.sectionTitle}
        </h2>
        <p className="text-sm leading-relaxed text-on-surface-variant">
          {copy.sectionIntro}
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border p-4">
        <div className="space-y-1">
          <h3 className="text-sm font-semibold text-on-surface">
            {copy.publicationTitle}
          </h3>
          <p className="font-mono text-xs text-on-surface-variant">
            {project.is_published ? copy.publishedStatus : copy.draftStatus}
          </p>
        </div>
        <Button
          type="button"
          variant={project.is_published ? "ghost" : "primary"}
          disabled={pending}
          onClick={publicationAction}
        >
          {project.is_published ? copy.unpublish : copy.publishTextOnly}
        </Button>
      </div>
      <FeedbackMessage feedback={feedback} />

      <ReplacementUpload projectId={project.id} />

      <div className="space-y-4">
        {assets.length > 0 ? (
          assets.map((asset) => (
            <AssetModerationCard
              key={asset.id}
              project={project}
              asset={asset}
              runtimeStorageEnvironment={runtimeStorageEnvironment}
            />
          ))
        ) : (
          <p className="text-sm text-on-surface-variant">{copy.noAssets}</p>
        )}
      </div>
    </section>
  );
}
