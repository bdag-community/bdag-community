import { z } from "zod";
import { loadArticleAssetRuntimeConfig } from "@/lib/aws/article-asset-config.server";
import { readArticleAssetPreview } from "@/lib/aws/article-asset-preview.server";
import { getAdminArticleAssetPreviewRecord } from "@/lib/dal/admin-asset-preview";
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
 * Same-origin admin preview. The route accepts UUIDs only and streams one
 * verified, immutable processed WebP; S3 coordinates stay server-side.
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
    const derivative = await getAdminArticleAssetPreviewRecord(
      identifiers.id,
      identifiers.assetId,
    );
    if (!derivative) {
      return new Response(null, { status: 404, headers: privateHeaders });
    }
    // A derivative recorded for the OTHER environment lives in the other
    // environment's bucket: this deployment's credentials cannot reach it,
    // so answer 404 up front instead of burning an S3 round trip into a 503.
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
