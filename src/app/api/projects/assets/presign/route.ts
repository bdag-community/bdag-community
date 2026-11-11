import { z } from "zod";
import { createArticleAssetUploadRequest } from "@/lib/aws/article-asset-presign.server";
import { loadArticleAssetRuntimeConfig } from "@/lib/aws/article-asset-config.server";
import { digestProjectAssetCapability } from "@/lib/projects/project-asset-capability";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Project cover presign — the same narrow contract as
 * /api/news/assets/presign, claiming from project_assets via its own RPC.
 * The S3 side is shared: project keys live under the news/quarantine prefix
 * (see 0011_community_projects.sql for why), so the presign helper and its
 * key validation are reused unchanged.
 */

const REQUEST_MAX_BYTES = 8 * 1024;
const responseHeaders = {
  "Cache-Control": "private, no-store, max-age=0",
};
const bodySchema = z.object({
  capability: z.string().max(100),
});
const claimSchema = z
  .array(
    z.object({
      object_key: z.string().min(1).max(500),
      declared_content_type: z.string().min(1).max(100),
      declared_byte_size: z.number().int().positive(),
      upload_expires_in_seconds: z.number().int().min(1).max(300),
    }),
  )
  .length(1);

async function readBoundedBody(request: Request): Promise<string | null> {
  const reader = request.body?.getReader();
  if (!reader) return null;
  const decoder = new TextDecoder();
  let total = 0;
  let body = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > REQUEST_MAX_BYTES) {
        await reader.cancel();
        return null;
      }
      body += decoder.decode(value, { stream: true });
    }
    body += decoder.decode();
    return body;
  } catch {
    return null;
  }
}

function failure(status: number): Response {
  return Response.json(
    { ok: false },
    { status, headers: responseHeaders },
  );
}

export async function POST(request: Request): Promise<Response> {
  const config = loadArticleAssetRuntimeConfig();
  if (!config) return failure(503);
  if (request.headers.get("origin") !== config.expectedOrigin) {
    return failure(403);
  }
  if (!request.headers.get("content-type")?.startsWith("application/json")) {
    return failure(415);
  }

  const rawBody = await readBoundedBody(request);
  if (!rawBody) return failure(400);

  let input: unknown;
  try {
    input = JSON.parse(rawBody);
  } catch {
    return failure(400);
  }
  const parsed = bodySchema.safeParse(input);
  if (!parsed.success) return failure(400);

  const digest = digestProjectAssetCapability(
    parsed.data.capability,
    config.storageEnvironment,
    config.capabilitySecret,
  );
  if (!digest) return failure(400);

  try {
    const { getAdminSupabase } = await import("@/lib/supabase/admin");
    const supabase = getAdminSupabase();
    const { data, error } = await supabase
      .rpc("claim_project_asset_presign", {
        p_capability_digest: digest,
        p_storage_environment: config.storageEnvironment,
      })
      .abortSignal(AbortSignal.timeout(8_000));
    if (error) return failure(503);
    const claim = claimSchema.safeParse(data);
    if (!claim.success) return failure(409);

    const row = claim.data[0];
    const upload = await createArticleAssetUploadRequest(
      {
        objectKey: row.object_key,
        contentType: row.declared_content_type,
        byteSize: row.declared_byte_size,
      },
      config.s3,
      row.upload_expires_in_seconds,
    );
    return Response.json(
      { ok: true, upload },
      { headers: responseHeaders },
    );
  } catch {
    return failure(503);
  }
}
