"use server";

import { revalidatePath, updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import {
  ADMIN_PROJECTS_COPY,
  PROJECT_CATEGORIES,
} from "@/lib/content/site";
import { requireAdmin } from "@/lib/dal/session";
import {
  getAdminProjectAssetStorageRecord,
  getProjectById,
} from "@/lib/dal/admin-projects";
import { loadArticleAssetRuntimeConfig } from "@/lib/aws/article-asset-config.server";
import {
  deleteArticleAssetVersions,
  promoteArticleAssetDerivatives,
  readValidatedArticleAssetResult,
} from "@/lib/aws/article-asset-moderation.server";
import { createProjectAssetCapability } from "@/lib/projects/project-asset-capability";
import {
  ARTICLE_ASSET_MAX_ALT_TEXT_LENGTH,
  isArticleAssetByteSizeAllowed,
  isArticleAssetContentType,
} from "@/lib/news/article-asset-policy";
import { PUBLISHED_PROJECTS_CACHE_TAG } from "@/lib/projects";
import { getServerSupabase } from "@/lib/supabase/server";

/**
 * Admin project workflow — the news actions pattern against the project RPCs
 * from 0011_community_projects.sql. The S3 moderation helpers are the shared
 * article-asset ones: their articleId parameter is simply the owning content
 * id in the shared news/* key contract, so project ids pass through them
 * unchanged.
 */

export type ActionFailure = { ok: false; error: string };
export type ActionSuccess = { ok: true; message: string };
export type ProjectAssetReplacementSuccess = ActionSuccess & {
  capability: string;
  assetId: string;
};

export type ProjectInput = {
  name: string;
  url: string;
  category: string;
  description: string;
  authorName: string;
};

const projectSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, ADMIN_PROJECTS_COPY.nameInvalid)
    .max(80, ADMIN_PROJECTS_COPY.nameInvalid),
  url: z
    .string()
    .trim()
    .min(12, ADMIN_PROJECTS_COPY.urlInvalid)
    .max(300, ADMIN_PROJECTS_COPY.urlInvalid)
    .regex(/^https:\/\/\S+\.\S+$/, ADMIN_PROJECTS_COPY.urlInvalid),
  category: z.enum(
    Object.keys(PROJECT_CATEGORIES) as [string, ...string[]],
    { message: ADMIN_PROJECTS_COPY.categoryInvalid },
  ),
  description: z
    .string()
    .trim()
    .min(20, ADMIN_PROJECTS_COPY.descriptionInvalid)
    .max(200, ADMIN_PROJECTS_COPY.descriptionInvalid),
  authorName: z.string().trim().max(120, ADMIN_PROJECTS_COPY.authorNameMax),
});

const uuidSchema = z.string().uuid();
const altSchema = z.string().trim().min(5).max(300);
const reasonSchema = z.string().trim().min(5).max(1000);

const firstIssue = (error: z.ZodError) =>
  error.issues[0]?.message ?? ADMIN_PROJECTS_COPY.checkValues;

function revalidateProjects() {
  updateTag(PUBLISHED_PROJECTS_CACHE_TAG);
  revalidatePath("/");
  revalidatePath("/community/projects");
  revalidatePath("/admin");
  revalidatePath("/admin/projects");
}

const rpcInput = (input: z.infer<typeof projectSchema>) => ({
  p_name: input.name,
  p_description: input.description,
  p_url: input.url,
  p_category: input.category,
  p_author_name: input.authorName || null,
});

export async function createProjectAction(
  input: unknown,
): Promise<ActionFailure | void> {
  await requireAdmin();
  const parsed = projectSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  const supabase = await getServerSupabase();
  const { data, error } = await supabase.rpc("admin_create_community_project", {
    ...rpcInput(parsed.data),
  });
  if (error || !data) {
    return { ok: false, error: ADMIN_PROJECTS_COPY.saveFailed };
  }
  revalidateProjects();
  redirect(`/admin/projects/${data}`);
}

export async function updateProjectAction(
  id: unknown,
  input: unknown,
): Promise<ActionSuccess | ActionFailure> {
  await requireAdmin();
  const parsedId = uuidSchema.safeParse(id);
  if (!parsedId.success) {
    return { ok: false, error: ADMIN_PROJECTS_COPY.invalidId };
  }
  const parsed = projectSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  const supabase = await getServerSupabase();
  const { data, error } = await supabase.rpc("admin_save_community_project", {
    p_project_id: parsedId.data,
    ...rpcInput(parsed.data),
  });
  if (error || data !== true) {
    return { ok: false, error: ADMIN_PROJECTS_COPY.saveFailed };
  }
  revalidateProjects();
  return { ok: true, message: ADMIN_PROJECTS_COPY.saved };
}

export async function setProjectPlacementAction(
  id: string,
  _previous: ActionSuccess | ActionFailure | null,
  formData: FormData,
): Promise<ActionSuccess | ActionFailure> {
  await requireAdmin();
  const parsedId = uuidSchema.safeParse(id);
  if (!parsedId.success) {
    return { ok: false, error: ADMIN_PROJECTS_COPY.invalidId };
  }

  const supabase = await getServerSupabase();
  const { data, error } = await supabase.rpc("admin_set_project_placement", {
    p_project_id: parsedId.data,
    p_is_featured: formData.get("featured") === "on",
    p_is_focused: formData.get("focused") === "on",
  });
  if (error) return { ok: false, error: "Could not save homepage placement." };
  if (!data) {
    return { ok: false, error: "Publish this project before setting its homepage placement." };
  }

  revalidateProjects();
  revalidatePath(`/admin/projects/${parsedId.data}`);
  return { ok: true, message: "Homepage placement saved." };
}

/**
 * Starts one replacement upload without receiving the image bytes — the same
 * capability handshake as articles, against the projects presign route.
 */
export async function beginProjectAssetReplacementAction(
  projectId: unknown,
  input: unknown,
): Promise<ProjectAssetReplacementSuccess | ActionFailure> {
  await requireAdmin();
  const parsedId = uuidSchema.safeParse(projectId);
  const parsed = z
    .object({
      contentType: z.string().max(100),
      byteSize: z.number().int(),
      altText: z.string().trim().max(ARTICLE_ASSET_MAX_ALT_TEXT_LENGTH),
    })
    .safeParse(input);
  if (
    !parsedId.success ||
    !parsed.success ||
    !isArticleAssetContentType(parsed.data.contentType) ||
    !isArticleAssetByteSizeAllowed(parsed.data.byteSize)
  ) {
    return {
      ok: false,
      error: ADMIN_PROJECTS_COPY.assetModeration.replacementInvalid,
    };
  }

  const config = loadArticleAssetRuntimeConfig();
  if (!config) {
    return {
      ok: false,
      error: ADMIN_PROJECTS_COPY.assetModeration.replacementUnavailable,
    };
  }
  try {
    const capability = createProjectAssetCapability(
      config.storageEnvironment,
      config.capabilitySecret,
    );
    const supabase = await getServerSupabase();
    const { data, error } = await supabase.rpc(
      "admin_begin_project_asset_replacement",
      {
        p_project_id: parsedId.data,
        p_storage_environment: config.storageEnvironment,
        p_asset_content_type: parsed.data.contentType,
        p_asset_byte_size: parsed.data.byteSize,
        p_asset_alt_text: parsed.data.altText || null,
        p_capability_digest: capability.digest,
      },
    );
    const parsedAssetId = uuidSchema.safeParse(data);
    if (error || !parsedAssetId.success) {
      throw new Error("replacement rejected");
    }
    revalidatePath(`/admin/projects/${parsedId.data}`);
    return {
      ok: true,
      message: ADMIN_PROJECTS_COPY.assetModeration.replacementReady,
      capability: capability.token,
      assetId: parsedAssetId.data,
    };
  } catch {
    return {
      ok: false,
      error: ADMIN_PROJECTS_COPY.assetModeration.replacementFailed,
    };
  }
}

export async function syncProjectAssetResultAction(
  projectId: unknown,
  assetId: unknown,
): Promise<ActionSuccess | ActionFailure> {
  await requireAdmin();
  const parsed = z
    .object({ projectId: uuidSchema, assetId: uuidSchema })
    .safeParse({ projectId, assetId });
  if (!parsed.success) {
    return { ok: false, error: ADMIN_PROJECTS_COPY.invalidId };
  }
  const asset = await getAdminProjectAssetStorageRecord(
    parsed.data.projectId,
    parsed.data.assetId,
  );
  if (!asset) {
    return { ok: false, error: ADMIN_PROJECTS_COPY.assetModeration.notFound };
  }
  try {
    const result = await readValidatedArticleAssetResult({
      articleId: asset.project_id,
      assetId: asset.id,
      sourceKey: asset.object_key,
      declaredContentType: asset.declared_content_type,
    });
    const manifest = result.manifest;
    const supabase = await getServerSupabase();
    const { data, error } = await supabase.rpc(
      "admin_sync_project_asset_result",
      {
        p_project_id: asset.project_id,
        p_asset_id: asset.id,
        p_storage_environment: manifest.environment,
        p_object_key: asset.object_key,
        p_quarantine_version_id: result.sourceVersionId,
        p_result_manifest_key: result.manifestKey,
        p_result_manifest_version_id: result.manifestVersionId,
        p_result_status: manifest.status,
        p_detected_content_type: manifest.source.detectedContentType ?? null,
        p_byte_size: manifest.source.byteSize ?? null,
        p_checksum_sha256: manifest.source.sha256 ?? null,
        p_width: manifest.source.width ?? null,
        p_height: manifest.source.height ?? null,
        p_derivatives: manifest.derivatives.map((derivative) => ({
          variantWidth: derivative.width,
          contentType: derivative.contentType,
          processedKey: derivative.key,
          processedVersionId: derivative.versionId,
          byteSize: derivative.byteSize,
          checksumSha256: derivative.sha256,
          width: derivative.width,
          height: derivative.height,
        })),
        p_failure_reason: manifest.failureCode ?? null,
      },
    );
    if (error || data !== true) throw new Error("sync rejected");
    revalidatePath(`/admin/projects/${asset.project_id}`);
    return { ok: true, message: ADMIN_PROJECTS_COPY.assetModeration.synced };
  } catch {
    return { ok: false, error: ADMIN_PROJECTS_COPY.assetModeration.syncFailed };
  }
}

export async function approveProjectAssetAction(
  projectId: unknown,
  assetId: unknown,
  altText: unknown,
): Promise<ActionSuccess | ActionFailure> {
  await requireAdmin();
  const parsed = z
    .object({ projectId: uuidSchema, assetId: uuidSchema, altText: altSchema })
    .safeParse({ projectId, assetId, altText });
  if (!parsed.success) {
    return { ok: false, error: ADMIN_PROJECTS_COPY.assetModeration.altRequired };
  }
  const supabase = await getServerSupabase();
  const { data, error } = await supabase.rpc("admin_approve_project_asset", {
    p_project_id: parsed.data.projectId,
    p_asset_id: parsed.data.assetId,
    p_alt_text: parsed.data.altText,
  });
  if (error || data !== true) {
    return {
      ok: false,
      error: ADMIN_PROJECTS_COPY.assetModeration.approveFailed,
    };
  }
  revalidatePath(`/admin/projects/${parsed.data.projectId}`);
  return { ok: true, message: ADMIN_PROJECTS_COPY.assetModeration.approved };
}

export async function rejectProjectAssetAction(
  projectId: unknown,
  assetId: unknown,
  reason: unknown,
): Promise<ActionSuccess | ActionFailure> {
  await requireAdmin();
  const parsed = z
    .object({ projectId: uuidSchema, assetId: uuidSchema, reason: reasonSchema })
    .safeParse({ projectId, assetId, reason });
  if (!parsed.success) {
    return {
      ok: false,
      error: ADMIN_PROJECTS_COPY.assetModeration.reasonRequired,
    };
  }
  const supabase = await getServerSupabase();
  const { data, error } = await supabase.rpc("admin_reject_project_asset", {
    p_project_id: parsed.data.projectId,
    p_asset_id: parsed.data.assetId,
    p_reason: parsed.data.reason,
  });
  if (error || data !== true) {
    return {
      ok: false,
      error: ADMIN_PROJECTS_COPY.assetModeration.rejectFailed,
    };
  }
  revalidatePath(`/admin/projects/${parsed.data.projectId}`);
  return { ok: true, message: ADMIN_PROJECTS_COPY.assetModeration.rejected };
}

export async function publishProjectAction(
  projectId: unknown,
  assetId: unknown,
): Promise<ActionSuccess | ActionFailure> {
  await requireAdmin();
  const parsed = z
    .object({ projectId: uuidSchema, assetId: uuidSchema.nullable() })
    .safeParse({ projectId, assetId: assetId || null });
  if (!parsed.success) {
    return { ok: false, error: ADMIN_PROJECTS_COPY.invalidId };
  }
  let promoted: Awaited<ReturnType<typeof promoteArticleAssetDerivatives>> = [];
  try {
    if (parsed.data.assetId) {
      const asset = await getAdminProjectAssetStorageRecord(
        parsed.data.projectId,
        parsed.data.assetId,
      );
      if (!asset) throw new Error("asset missing");
      if (asset.state === "approved") {
        promoted = await promoteArticleAssetDerivatives({
          articleId: asset.project_id,
          assetId: asset.id,
          derivatives: asset.derivatives,
        });
      }
    }
    const supabase = await getServerSupabase();
    const { data, error } = await supabase.rpc(
      "admin_publish_community_project",
      {
        p_project_id: parsed.data.projectId,
        p_asset_id: parsed.data.assetId,
        p_published_derivatives:
          promoted.length > 0
            ? promoted.map((derivative) => ({
                variantWidth: derivative.variantWidth,
                publishedKey: derivative.publishedKey,
                publishedVersionId: derivative.publishedVersionId,
              }))
            : null,
      },
    );
    if (error || data !== true) throw new Error("publish rejected");
  } catch (error) {
    const awsStatus =
      typeof error === "object" &&
      error !== null &&
      "$metadata" in error &&
      typeof (error as { $metadata?: { httpStatusCode?: unknown } }).$metadata
        ?.httpStatusCode === "number"
        ? (error as { $metadata: { httpStatusCode: number } }).$metadata
            .httpStatusCode
        : null;
    console.error("Project asset publication failed.", {
      errorType: error instanceof Error ? error.name : "UnknownError",
      providerStatus: awsStatus,
    });
    // A transport failure can arrive after the database committed. Never
    // delete versioned objects on an ambiguous response; the immutable copy
    // is private and a retry reconciles its deterministic key safely.
    if (promoted.length > 0) {
      const authoritative = await getAdminProjectAssetStorageRecord(
        parsed.data.projectId,
        parsed.data.assetId!,
      ).catch(() => null);
      const committed =
        authoritative?.state === "published" &&
        promoted.every((candidate) =>
          authoritative.derivatives.some(
            (stored) =>
              stored.variantWidth === candidate.variantWidth &&
              stored.publishedKey === candidate.publishedKey &&
              stored.publishedVersionId === candidate.publishedVersionId,
          ),
        );
      if (committed) {
        revalidateProjects();
        return {
          ok: true,
          message: ADMIN_PROJECTS_COPY.assetModeration.published,
        };
      }
    }
    return {
      ok: false,
      error: ADMIN_PROJECTS_COPY.assetModeration.publishFailed,
    };
  }
  revalidateProjects();
  return { ok: true, message: ADMIN_PROJECTS_COPY.assetModeration.published };
}

export async function unpublishProjectAction(
  projectId: unknown,
): Promise<ActionSuccess | ActionFailure> {
  await requireAdmin();
  const parsedId = uuidSchema.safeParse(projectId);
  if (!parsedId.success) {
    return { ok: false, error: ADMIN_PROJECTS_COPY.invalidId };
  }
  const supabase = await getServerSupabase();
  const { data, error } = await supabase.rpc(
    "admin_unpublish_community_project",
    {
      p_project_id: parsedId.data,
    },
  );
  if (error || data !== true) {
    return {
      ok: false,
      error: ADMIN_PROJECTS_COPY.assetModeration.unpublishFailed,
    };
  }
  revalidateProjects();
  return { ok: true, message: ADMIN_PROJECTS_COPY.assetModeration.unpublished };
}

export async function deleteProjectAction(
  id: unknown,
): Promise<ActionFailure | void> {
  await requireAdmin();
  const parsedId = uuidSchema.safeParse(id);
  if (!parsedId.success) {
    return { ok: false, error: ADMIN_PROJECTS_COPY.invalidId };
  }

  const project = await getProjectById(parsedId.data);
  if (!project) return { ok: false, error: ADMIN_PROJECTS_COPY.deleteFailed };
  if (project.is_published) {
    return {
      ok: false,
      error: ADMIN_PROJECTS_COPY.assetModeration.deleteUnpublishFirst,
    };
  }

  const supabase = await getServerSupabase();
  const assetIds = (project.assets ?? []).map(({ id: assetId }) => assetId);
  if (assetIds.length === 0) {
    const { data, error } = await supabase.rpc(
      "admin_delete_community_project",
      {
        p_project_id: parsedId.data,
      },
    );
    if (error || data !== true) {
      return { ok: false, error: ADMIN_PROJECTS_COPY.deleteFailed };
    }
  } else {
    const assets = await Promise.all(
      assetIds.map((assetId) =>
        getAdminProjectAssetStorageRecord(parsedId.data, assetId),
      ),
    );
    if (assets.some((asset) => asset === null)) {
      return { ok: false, error: ADMIN_PROJECTS_COPY.deleteFailed };
    }
    try {
      await deleteArticleAssetVersions({
        articleId: parsedId.data,
        assets: assets
          .filter((asset) => asset !== null)
          .map((asset) => ({
            ...asset,
            article_id: asset.project_id,
          })),
      });
      const { getAdminSupabase } = await import("@/lib/supabase/admin");
      const privileged = getAdminSupabase();
      const { data, error } = await privileged
        .rpc("delete_community_project_after_asset_cleanup", {
          p_project_id: parsedId.data,
        })
        .abortSignal(AbortSignal.timeout(8_000));
      if (error || data !== true) {
        const remaining = await getProjectById(parsedId.data).catch(() => null);
        if (remaining) throw new Error("project deletion rejected");
      }
    } catch {
      return {
        ok: false,
        error: ADMIN_PROJECTS_COPY.assetModeration.deleteStorageFailed,
      };
    }
  }
  revalidateProjects();
  redirect("/admin/projects");
}
