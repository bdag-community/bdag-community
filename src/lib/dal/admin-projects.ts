import "server-only";

import { requireAdmin } from "@/lib/dal/session";
import { getServerSupabase } from "@/lib/supabase/server";
import type { AdminArticleAssetState } from "@/lib/dal/admin";

/**
 * Admin reads for community projects — requireAdmin()-gated through the
 * RLS-BOUND server client, exactly like the article reads in admin.ts.
 * The asset state machine is shared with articles, so the state union is
 * imported rather than redeclared.
 */

export type AdminProjectRow = {
  id: string;
  name: string;
  description: string;
  url: string;
  category: string;
  author_name: string | null;
  submitted_by_community: boolean;
  is_published: boolean;
  published_at: string | null;
  published_asset_id: string | null;
  published_asset_alt_text: string | null;
  created_at: string;
  updated_at: string;
  assets?: AdminProjectAssetRow[];
};

export type AdminProjectAssetRow = {
  id: string;
  state: AdminArticleAssetState;
  /** Which environment's S3 bucket holds this cover's files. Same
   *  cross-environment boundary as article assets. */
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

const PROJECT_FIELDS =
  "id,name,description,url,category,author_name,submitted_by_community,is_published,published_at,published_asset_id,published_asset_alt_text,created_at,updated_at";

/** All projects — drafts included (the admin select-all RLS policy). */
export async function listAllProjects(): Promise<AdminProjectRow[]> {
  await requireAdmin();
  const supabase = await getServerSupabase();
  const { data, error } = await supabase
    .from("community_projects")
    .select(PROJECT_FIELDS)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`Failed to list projects: ${error.message}`);
  return (data ?? []) as AdminProjectRow[];
}

/** One project by id (draft or published), or null when it does not exist. */
export async function getProjectById(
  id: string,
): Promise<AdminProjectRow | null> {
  await requireAdmin();
  const supabase = await getServerSupabase();
  const { data, error } = await supabase
    .from("community_projects")
    .select(PROJECT_FIELDS)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`Failed to load project: ${error.message}`);
  const project = (data as AdminProjectRow | null) ?? null;
  if (!project) return null;
  const { data: assetData, error: assetError } = await supabase
    .from("project_assets")
    .select(
      "id,state,storage_environment,alt_text,failure_reason,moderation_reason,created_at,processed_at,project_asset_derivatives(variant_width,width,height,byte_size)",
    )
    .eq("project_id", id)
    .order("created_at", { ascending: false });
  if (assetError) {
    throw new Error(`Failed to load project assets: ${assetError.message}`);
  }
  const assets = (assetData ?? []).map((asset) => ({
    id: asset.id,
    state: asset.state,
    storage_environment: asset.storage_environment,
    alt_text: asset.alt_text,
    failure_reason: asset.failure_reason,
    moderation_reason: asset.moderation_reason,
    created_at: asset.created_at,
    processed_at: asset.processed_at,
    derivatives: asset.project_asset_derivatives ?? [],
  })) as AdminProjectAssetRow[];
  return { ...project, assets };
}

export type AdminProjectAssetStorageRecord = {
  id: string;
  project_id: string;
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
export async function getAdminProjectAssetStorageRecord(
  projectId: string,
  assetId: string,
): Promise<AdminProjectAssetStorageRecord | null> {
  await requireAdmin();
  const supabase = await getServerSupabase();
  const { data, error } = await supabase
    .from("project_assets")
    .select(
      "id,project_id,storage_environment,object_key,state,declared_content_type,quarantine_version_id,result_manifest_key,result_manifest_version_id,project_asset_derivatives(variant_width,processed_key,processed_version_id,byte_size,checksum_sha256,published_key,published_version_id)",
    )
    .eq("project_id", projectId)
    .eq("id", assetId)
    .maybeSingle();
  if (error) throw new Error(`Failed to load project asset: ${error.message}`);
  if (!data) return null;
  return {
    id: data.id,
    project_id: data.project_id,
    storage_environment: data.storage_environment,
    object_key: data.object_key,
    state: data.state,
    declared_content_type: data.declared_content_type,
    quarantine_version_id: data.quarantine_version_id,
    result_manifest_key: data.result_manifest_key,
    result_manifest_version_id: data.result_manifest_version_id,
    derivatives: (data.project_asset_derivatives ?? []).map((derivative) => ({
      variantWidth: derivative.variant_width,
      processedKey: derivative.processed_key,
      processedVersionId: derivative.processed_version_id,
      byteSize: derivative.byte_size,
      checksumSha256: derivative.checksum_sha256,
      publishedKey: derivative.published_key,
      publishedVersionId: derivative.published_version_id,
    })),
  } as AdminProjectAssetStorageRecord;
}
