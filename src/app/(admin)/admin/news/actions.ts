"use server";

import { revalidatePath, updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { ADMIN_NEWS_COPY, ARTICLE_CATEGORIES } from "@/lib/content/site";
import { requireAdmin } from "@/lib/dal/session";
import {
  getAdminArticleAssetStorageRecord,
  getArticleById,
} from "@/lib/dal/admin";
import { loadArticleAssetRuntimeConfig } from "@/lib/aws/article-asset-config.server";
import {
  deleteArticleAssetVersions,
  promoteArticleAssetDerivatives,
  readValidatedArticleAssetResult,
} from "@/lib/aws/article-asset-moderation.server";
import { createArticleAssetCapability } from "@/lib/news/article-asset-capability";
import {
  ARTICLE_ASSET_MAX_ALT_TEXT_LENGTH,
  isArticleAssetByteSizeAllowed,
  isArticleAssetContentType,
} from "@/lib/news/article-asset-policy";
import { PUBLISHED_NEWS_CACHE_TAG } from "@/lib/news";
import {
  ARTICLE_BODY_MAX_HTML_LENGTH,
  ARTICLE_BODY_MAX_TEXT_LENGTH,
  sanitizeArticleBody,
} from "@/lib/news/rich-text";
import { getServerSupabase } from "@/lib/supabase/server";

export type ActionFailure = { ok: false; error: string };
export type ActionSuccess = { ok: true; message: string };
export type ArticleCreateSuccess = { ok: true; articleId: string };
export type ArticleAssetReplacementSuccess = ActionSuccess & {
  capability: string;
  assetId: string;
};

export type ArticleInput = {
  title: string;
  slug: string;
  subtitle: string;
  description: string;
  bodyHtml: string;
  authorName: string;
  category: string;
};

const articleSchema = z.object({
  title: z.string().trim().min(1, ADMIN_NEWS_COPY.titleRequired).max(200),
  slug: z
    .string()
    .trim()
    .min(1, ADMIN_NEWS_COPY.slugRequired)
    .max(120)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, ADMIN_NEWS_COPY.slugInvalid),
  subtitle: z.string().trim().max(300, ADMIN_NEWS_COPY.subtitleMax),
  description: z.string().trim().max(1000, ADMIN_NEWS_COPY.descriptionMax),
  bodyHtml: z
    .string()
    .max(ARTICLE_BODY_MAX_HTML_LENGTH, ADMIN_NEWS_COPY.bodyTooLong),
  authorName: z.string().trim().max(120, ADMIN_NEWS_COPY.authorNameMax),
  // The closed set lives in ARTICLE_CATEGORIES; the DB check constraint in
  // 0010_article_categories.sql names the same five values.
  category: z.enum(
    Object.keys(ARTICLE_CATEGORIES) as [string, ...string[]],
    { message: ADMIN_NEWS_COPY.categoryInvalid },
  ),
});

const uuidSchema = z.string().uuid();
const altSchema = z.string().trim().min(5).max(300);
const reasonSchema = z.string().trim().min(5).max(1000);

function validateArticleForSave(input: z.infer<typeof articleSchema>) {
  const sanitizedBody = sanitizeArticleBody(input.bodyHtml);
  if (input.bodyHtml && !sanitizedBody.text) {
    return { ok: false as const, error: ADMIN_NEWS_COPY.bodyEmpty };
  }
  if (sanitizedBody.text.length > ARTICLE_BODY_MAX_TEXT_LENGTH) {
    return { ok: false as const, error: ADMIN_NEWS_COPY.bodyTooLong };
  }
  return { ok: true as const, body: sanitizedBody };
}

const firstIssue = (error: z.ZodError) =>
  error.issues[0]?.message ?? ADMIN_NEWS_COPY.checkValues;

const rpcFailure = (code?: string) =>
  code === "23505"
    ? ADMIN_NEWS_COPY.slugTaken
    : ADMIN_NEWS_COPY.saveFailed;

function revalidateNews(slug?: string) {
  updateTag(PUBLISHED_NEWS_CACHE_TAG);
  revalidatePath("/");
  revalidatePath("/articles");
  if (slug) revalidatePath(`/articles/${slug}`);
  revalidatePath("/articles/[slug]", "page");
  revalidatePath("/admin");
}

const rpcInput = (
  input: z.infer<typeof articleSchema>,
  body: ReturnType<typeof sanitizeArticleBody>,
) => ({
  p_title: input.title,
  p_slug: input.slug,
  p_subtitle: input.subtitle || null,
  p_description: input.description || null,
  p_body: body.text || null,
  p_body_html: body.html || null,
  p_author_name: input.authorName || null,
  p_category: input.category,
});

export async function createArticleAction(
  input: unknown,
  returnArticleId: unknown = false,
): Promise<ActionFailure | ArticleCreateSuccess | void> {
  await requireAdmin();
  if (typeof returnArticleId !== "boolean") {
    return { ok: false, error: ADMIN_NEWS_COPY.checkValues };
  }
  const parsed = articleSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  const validation = validateArticleForSave(parsed.data);
  if (!validation.ok) return validation;
  const supabase = await getServerSupabase();
  const { data, error } = await supabase.rpc("admin_create_news_article", {
    ...rpcInput(parsed.data, validation.body),
  });
  const parsedArticleId = uuidSchema.safeParse(data);
  if (error || !parsedArticleId.success) {
    return { ok: false, error: rpcFailure(error?.code) };
  }
  revalidateNews(parsed.data.slug);
  if (returnArticleId) return { ok: true, articleId: parsedArticleId.data };
  redirect(`/admin/news/${parsedArticleId.data}`);
}

export async function updateArticleAction(
  id: unknown,
  input: unknown,
): Promise<ActionSuccess | ActionFailure> {
  await requireAdmin();
  const parsedId = uuidSchema.safeParse(id);
  if (!parsedId.success) return { ok: false, error: ADMIN_NEWS_COPY.invalidId };
  const parsed = articleSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  const validation = validateArticleForSave(parsed.data);
  if (!validation.ok) return validation;
  const supabase = await getServerSupabase();
  const { data, error } = await supabase.rpc("admin_save_news_article", {
    p_article_id: parsedId.data,
    ...rpcInput(parsed.data, validation.body),
  });
  if (error || data !== true) {
    return { ok: false, error: rpcFailure(error?.code) };
  }
  revalidateNews(parsed.data.slug);
  return { ok: true, message: ADMIN_NEWS_COPY.saved };
}

/**
 * Starts one replacement upload without receiving the image bytes. The
 * authenticated browser exchanges the returned one-time capability for a
 * conditional S3 PUT through the same narrow presign route as public intake.
 */
export async function beginArticleAssetReplacementAction(
  articleId: unknown,
  input: unknown,
): Promise<ArticleAssetReplacementSuccess | ActionFailure> {
  await requireAdmin();
  const parsedId = uuidSchema.safeParse(articleId);
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
      error: ADMIN_NEWS_COPY.assetModeration.replacementInvalid,
    };
  }

  const config = loadArticleAssetRuntimeConfig();
  if (!config) {
    return {
      ok: false,
      error: ADMIN_NEWS_COPY.assetModeration.replacementUnavailable,
    };
  }
  try {
    const capability = createArticleAssetCapability(
      config.storageEnvironment,
      config.capabilitySecret,
    );
    const supabase = await getServerSupabase();
    const { data, error } = await supabase.rpc(
      "admin_begin_article_asset_replacement",
      {
        p_article_id: parsedId.data,
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
    revalidatePath(`/admin/news/${parsedId.data}`);
    return {
      ok: true,
      message: ADMIN_NEWS_COPY.assetModeration.replacementReady,
      capability: capability.token,
      assetId: parsedAssetId.data,
    };
  } catch {
    return {
      ok: false,
      error: ADMIN_NEWS_COPY.assetModeration.replacementFailed,
    };
  }
}

export async function syncArticleAssetResultAction(
  articleId: unknown,
  assetId: unknown,
): Promise<ActionSuccess | ActionFailure> {
  await requireAdmin();
  const parsed = z
    .object({ articleId: uuidSchema, assetId: uuidSchema })
    .safeParse({ articleId, assetId });
  if (!parsed.success) return { ok: false, error: ADMIN_NEWS_COPY.invalidId };
  const asset = await getAdminArticleAssetStorageRecord(
    parsed.data.articleId,
    parsed.data.assetId,
  );
  if (!asset) return { ok: false, error: ADMIN_NEWS_COPY.assetModeration.notFound };
  try {
    const result = await readValidatedArticleAssetResult({
      articleId: asset.article_id,
      assetId: asset.id,
      sourceKey: asset.object_key,
      declaredContentType: asset.declared_content_type,
    });
    const manifest = result.manifest;
    const supabase = await getServerSupabase();
    const { data, error } = await supabase.rpc(
      "admin_sync_article_asset_result",
      {
        p_article_id: asset.article_id,
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
    revalidatePath(`/admin/news/${asset.article_id}`);
    return { ok: true, message: ADMIN_NEWS_COPY.assetModeration.synced };
  } catch {
    return { ok: false, error: ADMIN_NEWS_COPY.assetModeration.syncFailed };
  }
}

export async function approveArticleAssetAction(
  articleId: unknown,
  assetId: unknown,
  altText: unknown,
): Promise<ActionSuccess | ActionFailure> {
  await requireAdmin();
  const parsed = z
    .object({ articleId: uuidSchema, assetId: uuidSchema, altText: altSchema })
    .safeParse({ articleId, assetId, altText });
  if (!parsed.success) {
    return { ok: false, error: ADMIN_NEWS_COPY.assetModeration.altRequired };
  }
  const supabase = await getServerSupabase();
  const { data, error } = await supabase.rpc("admin_approve_article_asset", {
    p_article_id: parsed.data.articleId,
    p_asset_id: parsed.data.assetId,
    p_alt_text: parsed.data.altText,
  });
  if (error || data !== true) {
    return { ok: false, error: ADMIN_NEWS_COPY.assetModeration.approveFailed };
  }
  revalidatePath(`/admin/news/${parsed.data.articleId}`);
  return { ok: true, message: ADMIN_NEWS_COPY.assetModeration.approved };
}

export async function rejectArticleAssetAction(
  articleId: unknown,
  assetId: unknown,
  reason: unknown,
): Promise<ActionSuccess | ActionFailure> {
  await requireAdmin();
  const parsed = z
    .object({ articleId: uuidSchema, assetId: uuidSchema, reason: reasonSchema })
    .safeParse({ articleId, assetId, reason });
  if (!parsed.success) {
    return { ok: false, error: ADMIN_NEWS_COPY.assetModeration.reasonRequired };
  }
  const supabase = await getServerSupabase();
  const { data, error } = await supabase.rpc("admin_reject_article_asset", {
    p_article_id: parsed.data.articleId,
    p_asset_id: parsed.data.assetId,
    p_reason: parsed.data.reason,
  });
  if (error || data !== true) {
    return { ok: false, error: ADMIN_NEWS_COPY.assetModeration.rejectFailed };
  }
  revalidatePath(`/admin/news/${parsed.data.articleId}`);
  return { ok: true, message: ADMIN_NEWS_COPY.assetModeration.rejected };
}

export async function publishArticleAction(
  articleId: unknown,
  assetId: unknown,
): Promise<ActionSuccess | ActionFailure> {
  await requireAdmin();
  const parsed = z
    .object({ articleId: uuidSchema, assetId: uuidSchema.nullable() })
    .safeParse({ articleId, assetId: assetId || null });
  if (!parsed.success) return { ok: false, error: ADMIN_NEWS_COPY.invalidId };
  const supabase = await getServerSupabase();
  const { data: article } = await supabase
    .from("news_articles")
    .select("description,body")
    .eq("id", parsed.data.articleId)
    .maybeSingle();
  if (!article?.description) {
    return { ok: false, error: ADMIN_NEWS_COPY.descriptionRequired };
  }
  if (!article.body?.trim()) {
    return { ok: false, error: ADMIN_NEWS_COPY.bodyRequired };
  }
  let promoted: Awaited<ReturnType<typeof promoteArticleAssetDerivatives>> = [];
  try {
    if (parsed.data.assetId) {
      const asset = await getAdminArticleAssetStorageRecord(
        parsed.data.articleId,
        parsed.data.assetId,
      );
      if (!asset) throw new Error("asset missing");
      if (asset.state === "approved") {
        promoted = await promoteArticleAssetDerivatives({
          articleId: asset.article_id,
          assetId: asset.id,
          derivatives: asset.derivatives,
        });
      }
    }
    const { data, error } = await supabase.rpc("admin_publish_news_article", {
      p_article_id: parsed.data.articleId,
      p_asset_id: parsed.data.assetId,
      p_published_derivatives:
        promoted.length > 0
          ? promoted.map((derivative) => ({
              variantWidth: derivative.variantWidth,
              publishedKey: derivative.publishedKey,
              publishedVersionId: derivative.publishedVersionId,
            }))
          : null,
    });
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
    console.error("Article asset publication failed.", {
      errorType: error instanceof Error ? error.name : "UnknownError",
      providerStatus: awsStatus,
    });
    // A transport failure can arrive after the database committed. Never
    // delete versioned objects on an ambiguous response; the immutable copy is
    // private and a retry reconciles its deterministic key safely.
    if (promoted.length > 0) {
      const authoritative = await getAdminArticleAssetStorageRecord(
        parsed.data.articleId,
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
        revalidateNews();
        return { ok: true, message: ADMIN_NEWS_COPY.assetModeration.published };
      }
    }
    return { ok: false, error: ADMIN_NEWS_COPY.assetModeration.publishFailed };
  }
  revalidateNews();
  return { ok: true, message: ADMIN_NEWS_COPY.assetModeration.published };
}

export async function unpublishArticleAction(
  articleId: unknown,
): Promise<ActionSuccess | ActionFailure> {
  await requireAdmin();
  const parsedId = uuidSchema.safeParse(articleId);
  if (!parsedId.success) return { ok: false, error: ADMIN_NEWS_COPY.invalidId };
  const supabase = await getServerSupabase();
  const { data, error } = await supabase.rpc("admin_unpublish_news_article", {
    p_article_id: parsedId.data,
  });
  if (error || data !== true) {
    return { ok: false, error: ADMIN_NEWS_COPY.assetModeration.unpublishFailed };
  }
  revalidateNews();
  return { ok: true, message: ADMIN_NEWS_COPY.assetModeration.unpublished };
}

export async function deleteArticleAction(
  id: unknown,
): Promise<ActionFailure | void> {
  await requireAdmin();
  const parsedId = uuidSchema.safeParse(id);
  if (!parsedId.success) return { ok: false, error: ADMIN_NEWS_COPY.invalidId };

  const article = await getArticleById(parsedId.data);
  if (!article) return { ok: false, error: ADMIN_NEWS_COPY.deleteFailed };
  if (article.is_published) {
    return {
      ok: false,
      error: ADMIN_NEWS_COPY.assetModeration.deleteUnpublishFirst,
    };
  }

  const supabase = await getServerSupabase();
  const assetIds = (article.assets ?? []).map(({ id: assetId }) => assetId);
  if (assetIds.length === 0) {
    const { data, error } = await supabase.rpc("admin_delete_news_article", {
      p_article_id: parsedId.data,
    });
    if (error || data !== true) {
      return { ok: false, error: ADMIN_NEWS_COPY.deleteFailed };
    }
  } else {
    const assets = await Promise.all(
      assetIds.map((assetId) =>
        getAdminArticleAssetStorageRecord(parsedId.data, assetId),
      ),
    );
    if (assets.some((asset) => asset === null)) {
      return { ok: false, error: ADMIN_NEWS_COPY.deleteFailed };
    }
    try {
      await deleteArticleAssetVersions({
        articleId: parsedId.data,
        assets: assets.filter((asset) => asset !== null),
      });
      const { getAdminSupabase } = await import("@/lib/supabase/admin");
      const privileged = getAdminSupabase();
      const { data, error } = await privileged
        .rpc("delete_news_article_after_asset_cleanup", {
          p_article_id: parsedId.data,
        })
        .abortSignal(AbortSignal.timeout(8_000));
      if (error || data !== true) {
        const remaining = await getArticleById(parsedId.data).catch(() => null);
        if (remaining) throw new Error("article deletion rejected");
      }
    } catch {
      return {
        ok: false,
        error: ADMIN_NEWS_COPY.assetModeration.deleteStorageFailed,
      };
    }
  }
  revalidateNews();
  redirect("/admin");
}
