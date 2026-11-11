import { z } from "zod";
import { loadArticleAssetRuntimeConfig } from "@/lib/aws/article-asset-config.server";
import { readArticleAssetPreview } from "@/lib/aws/article-asset-preview.server";
import { getAdminProjectAssetPreviewRecord } from "@/lib/dal/admin-project-asset-preview";
import { getAdminSession } from "@/lib/dal/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const uuidSchema = z.string().uuid();
const privateHeaders = {
  "Cache-Control": "private, no-store, max-age=0",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "Cross-Origin-Resource-Policy": "same-origin",
};

/**
 * Same-origin admin preview for project covers — the article preview route
 * against project_asset_derivatives. UUIDs only, one verified immutable
 * processed WebP, S3 coordinates stay server-side, and a cross-environment
 * derivative answers 404 before any S3 round trip.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; assetId: string }> },
): Promise<Response> {
  if (!(await getAdminSession())) {
    return new Response(null, { status: 404, headers: privateHeaders });
  }
  const identifiers = await params;
  if (
    !uuidSchema.safeParse(identifiers.id).success ||
    !uuidSchema.safeParse(identifiers.assetId).success
  ) {
    return new Response(null, { status: 404, headers: privateHeaders });
  }

  try {
    const derivative = await getAdminProjectAssetPreviewRecord(
      identifiers.id,
      identifiers.assetId,
    );
    if (!derivative) {
      return new Response(null, { status: 404, headers: privateHeaders });
    }
    const runtimeEnvironment =
      loadArticleAssetRuntimeConfig()?.storageEnvironment ?? null;
    if (derivative.storageEnvironment !== runtimeEnvironment) {
      return new Response(null, { status: 404, headers: privateHeaders });
    }
    const image = await readArticleAssetPreview({
      articleId: identifiers.id,
      assetId: identifiers.assetId,
      processedKey: derivative.processedKey,
      processedVersionId: derivative.processedVersionId,
      byteSize: derivative.byteSize,
      checksumSha256: derivative.checksumSha256,
    });
    return new Response(image.body, {
      status: 200,
      headers: {
        ...privateHeaders,
        "Content-Type": "image/webp",
        "Content-Length": String(image.byteSize),
        "Content-Disposition": "inline",
      },
    });
  } catch {
    return new Response(null, { status: 503, headers: privateHeaders });
  }
}
