import "server-only";

import { getAdminSession } from "@/lib/dal/session";
import { getServerSupabase } from "@/lib/supabase/server";

export type AdminArticleAssetPreviewRecord = Readonly<{
  storageEnvironment: "development" | "production";
  processedKey: string;
  processedVersionId: string;
  byteSize: number;
  checksumSha256: string;
}>;

/**
 * Minimal, non-redirecting admin read for the preview route. The authenticated
 * Supabase client remains subject to the derivative table's admin-only RLS.
 */
export async function getAdminArticleAssetPreviewRecord(
  articleId: string,
  assetId: string,
): Promise<AdminArticleAssetPreviewRecord | null> {
  if (!(await getAdminSession())) return null;
  const supabase = await getServerSupabase();
  const { data, error } = await supabase
    .from("article_asset_derivatives")
    .select(
      "storage_environment,processed_key,processed_version_id,byte_size,checksum_sha256",
    )
    .eq("article_id", articleId)
    .eq("asset_id", assetId)
    .eq("variant_width", 1024)
    .maybeSingle();
  if (error) throw new Error("The article asset preview record could not be read.");
  if (!data) return null;
  return {
    storageEnvironment: data.storage_environment,
    processedKey: data.processed_key,
    processedVersionId: data.processed_version_id,
    byteSize: data.byte_size,
    checksumSha256: data.checksum_sha256,
  } as AdminArticleAssetPreviewRecord;
}
