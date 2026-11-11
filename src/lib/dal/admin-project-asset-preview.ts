import "server-only";

import { getAdminSession } from "@/lib/dal/session";
import { getServerSupabase } from "@/lib/supabase/server";
import type { AdminArticleAssetPreviewRecord } from "@/lib/dal/admin-asset-preview";

/**
 * Minimal, non-redirecting admin read for the project preview route. Same
 * contract as admin-asset-preview.ts against project_asset_derivatives,
 * returning the shared preview record shape so the S3 reader is reused.
 */
export async function getAdminProjectAssetPreviewRecord(
  projectId: string,
  assetId: string,
): Promise<AdminArticleAssetPreviewRecord | null> {
  if (!(await getAdminSession())) return null;
  const supabase = await getServerSupabase();
  const { data, error } = await supabase
    .from("project_asset_derivatives")
    .select(
      "storage_environment,processed_key,processed_version_id,byte_size,checksum_sha256",
    )
    .eq("project_id", projectId)
    .eq("asset_id", assetId)
    .eq("variant_width", 1024)
    .maybeSingle();
  if (error) {
    throw new Error("The project asset preview record could not be read.");
  }
  if (!data) return null;
  return {
    storageEnvironment: data.storage_environment,
    processedKey: data.processed_key,
    processedVersionId: data.processed_version_id,
    byteSize: data.byte_size,
    checksumSha256: data.checksum_sha256,
  } as AdminArticleAssetPreviewRecord;
}
