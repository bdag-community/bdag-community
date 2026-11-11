import "server-only";

import { requireAdmin } from "@/lib/dal/session";
import {
  plainTextToArticleHtml,
  sanitizeArticleBody,
} from "@/lib/news/rich-text";
import { getServerSupabase } from "@/lib/supabase/server";
import type { ContactTopic } from "@/lib/contact/resolve-topic";

/**
 * Admin reads — requireAdmin()-gated, through the RLS-BOUND server client
 * (never the service role: the admin RLS policies in supabase/migrations
 * exist for exactly this, so a bug here can never over-reach them).
 * Every function re-gates itself; pages calling these stay thin.
 */

export type AdminArticleRow = {
  id: string;
  slug: string;
  title: string;
  subtitle: string | null;
  description: string | null;
  body: string | null;
  body_html: string | null;
  image_url: string | null;
  author_name: string | null;
  category: string;
  submitted_by_community: boolean;
  is_published: boolean;
  published_at: string | null;
  published_asset_id: string | null;
  published_asset_alt_text: string | null;
  created_at: string;
  updated_at: string;
  assets?: AdminArticleAssetRow[];
};

export type AdminArticleAssetState =
  | "awaiting_presign"
  | "awaiting_upload"
  | "processing"
  | "ready"
  | "approved"
  | "rejected"
  | "failed"
  | "published"
  | "superseded";

export type AdminArticleAssetRow = {
  id: string;
  state: AdminArticleAssetState;
  /** Which environment's S3 bucket holds this cover's files. One database
   *  serves both environments, so the admin UI must know when a cover is
   *  unreachable from the bucket THIS deployment is configured against. */
  storage_environment: "development" | "production";
  alt_text: string | null;
  failure_reason: string | null;
  moderation_reason: string | null;
  created_at: string;
  processed_at: string | null;
  derivatives: Array<{
    variant_width: 640 | 1024 | 1600;
    width: number;
    height: number;
    byte_size: number;
  }>;
};

export type ContactMessageRow = {
  id: string;
  name: string;
  email: string;
  topic: string;
  message: string;
  created_at: string;
  responded_at: string | null;
};

export type SuggestionMessageRow = {
  id: string;
  author_name: string | null;
  reply_email: string | null;
  suggestion: string;
  created_at: string;
  responded_at: string | null;
};

/** All articles — drafts included (the admin select-all RLS policy). */
export async function listAllArticles(): Promise<AdminArticleRow[]> {
  await requireAdmin();
  const supabase = await getServerSupabase();
  const { data, error } = await supabase
    .from("news_articles")
    .select(
      "id,slug,title,subtitle,description,category,body,body_html,image_url,author_name,submitted_by_community,is_published,published_at,published_asset_id,published_asset_alt_text,created_at,updated_at",
    )
    .order("created_at", { ascending: false });
  if (error) throw new Error(`Failed to list articles: ${error.message}`);
  return (data ?? []) as AdminArticleRow[];
}

/** One article by id (draft or published), or null when it does not exist. */
export async function getArticleById(
  id: string,
): Promise<AdminArticleRow | null> {
  await requireAdmin();
  const supabase = await getServerSupabase();
  const { data, error } = await supabase
    .from("news_articles")
    .select(
      "id,slug,title,subtitle,description,category,body,body_html,image_url,author_name,submitted_by_community,is_published,published_at,published_asset_id,published_asset_alt_text,created_at,updated_at",
    )
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`Failed to load article: ${error.message}`);
  const article = (data as AdminArticleRow | null) ?? null;
  if (!article) return null;
  const { data: assetData, error: assetError } = await supabase
    .from("article_assets")
    .select(
      "id,state,storage_environment,alt_text,failure_reason,moderation_reason,created_at,processed_at,article_asset_derivatives(variant_width,width,height,byte_size)",
    )
    .eq("article_id", id)
    .order("created_at", { ascending: false });
  if (assetError) throw new Error(`Failed to load article assets: ${assetError.message}`);
  const assets = (assetData ?? []).map((asset) => ({
    id: asset.id,
    state: asset.state,
    storage_environment: asset.storage_environment,
    alt_text: asset.alt_text,
    failure_reason: asset.failure_reason,
    moderation_reason: asset.moderation_reason,
    created_at: asset.created_at,
    processed_at: asset.processed_at,
    derivatives: asset.article_asset_derivatives ?? [],
  })) as AdminArticleAssetRow[];
  return {
    ...article,
    body_html: sanitizeArticleBody(
      article.body_html ?? plainTextToArticleHtml(article.body ?? ""),
    ).html,
    assets,
  };
}

export type AdminArticleAssetStorageRecord = {
  id: string;
  article_id: string;
  storage_environment: "development" | "production";
  object_key: string;
  state: AdminArticleAssetState;
  declared_content_type: "image/jpeg" | "image/png" | "image/webp";
  quarantine_version_id: string | null;
  result_manifest_key: string | null;
  result_manifest_version_id: string | null;
  derivatives: Array<{
    variantWidth: 640 | 1024 | 1600;
    processedKey: string;
    processedVersionId: string;
    byteSize: number;
    checksumSha256: string;
    publishedKey: string | null;
    publishedVersionId: string | null;
  }>;
};

/** Sensitive S3 coordinates never cross the server component boundary. */
export async function getAdminArticleAssetStorageRecord(
  articleId: string,
  assetId: string,
): Promise<AdminArticleAssetStorageRecord | null> {
  await requireAdmin();
  const supabase = await getServerSupabase();
  const { data, error } = await supabase
    .from("article_assets")
    .select(
      "id,article_id,storage_environment,object_key,state,declared_content_type,quarantine_version_id,result_manifest_key,result_manifest_version_id,article_asset_derivatives(variant_width,processed_key,processed_version_id,byte_size,checksum_sha256,published_key,published_version_id)",
    )
    .eq("article_id", articleId)
    .eq("id", assetId)
    .maybeSingle();
  if (error) throw new Error(`Failed to load article asset: ${error.message}`);
  if (!data) return null;
  return {
    id: data.id,
    article_id: data.article_id,
    storage_environment: data.storage_environment,
    object_key: data.object_key,
    state: data.state,
    declared_content_type: data.declared_content_type,
    quarantine_version_id: data.quarantine_version_id,
    result_manifest_key: data.result_manifest_key,
    result_manifest_version_id: data.result_manifest_version_id,
    derivatives: (data.article_asset_derivatives ?? []).map((derivative) => ({
      variantWidth: derivative.variant_width,
      processedKey: derivative.processed_key,
      processedVersionId: derivative.processed_version_id,
      byteSize: derivative.byte_size,
      checksumSha256: derivative.checksum_sha256,
      publishedKey: derivative.published_key,
      publishedVersionId: derivative.published_version_id,
    })),
  } as AdminArticleAssetStorageRecord;
}

/** Contact inbox, newest first; optional topic filter runs before the limit. */
export async function listContactMessages(
  limit = 50,
  topic?: ContactTopic,
): Promise<ContactMessageRow[]> {
  await requireAdmin();
  const supabase = await getServerSupabase();
  let query = supabase
    .from("contact_messages")
    .select("id,name,email,topic,message,created_at,responded_at")
    .order("created_at", { ascending: false });
  if (topic) query = query.eq("topic", topic);
  const { data, error } = await query.limit(limit);
  if (error) throw new Error(`Failed to list messages: ${error.message}`);
  return (data ?? []) as ContactMessageRow[];
}

/** Suggestion Box inbox, newest first and visible only through admin RLS. */
export async function listSuggestionMessages(
  limit = 50,
): Promise<SuggestionMessageRow[]> {
  await requireAdmin();
  const supabase = await getServerSupabase();
  const { data, error } = await supabase
    .from("suggestion_messages")
    .select("id,author_name,reply_email,suggestion,created_at,responded_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`Failed to list suggestions: ${error.message}`);
  return (data ?? []) as SuggestionMessageRow[];
}
