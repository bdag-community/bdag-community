import {
  ARTICLE_ASSET_MAX_BYTES,
  isArticleAssetContentType,
} from "./article-asset-policy.ts";

type BeginResult =
  | { ok: false; error: string }
  | { ok: true; capability: string; assetId: string };

type UploadDependencies = {
  begin: (
    articleId: string,
    metadata: { contentType: string; byteSize: number; altText: string },
  ) => Promise<BeginResult>;
  sync: (articleId: string, assetId: string) => Promise<{ ok: boolean }>;
  request: (url: string, init: RequestInit) => Promise<Response>;
  sleep?: (milliseconds: number) => Promise<void>;
};

type PresignResponse = {
  ok: true;
  upload: {
    url: string;
    method: "PUT";
    byteSize: number;
    headers: {
      "Content-Type": string;
      "Content-Length": string;
      "If-None-Match": "*";
    };
  };
};

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
      origin === "https://s3.eu-central-1.amazonaws.com" &&
      Number.isInteger(candidate.upload.byteSize) &&
      candidate.upload.headers?.["If-None-Match"] === "*" &&
      candidate.upload.headers?.["Content-Type"] &&
      candidate.upload.headers?.["Content-Length"] ===
        String(candidate.upload.byteSize),
  );
}

const defaultSleep = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

/** Uploads an admin-created draft cover through the existing private pipeline. */
export async function uploadAdminCover(
  articleId: string,
  file: File,
  altText: string,
  { begin, sync, request, sleep = defaultSleep }: UploadDependencies,
): Promise<{ processed: boolean }> {
  if (
    !isArticleAssetContentType(file.type) ||
    file.size < 1 ||
    file.size > ARTICLE_ASSET_MAX_BYTES
  ) {
    throw new Error("Unsupported cover image.");
  }

  const started = await begin(articleId, {
    contentType: file.type,
    byteSize: file.size,
    altText,
  });
  if (!started.ok) throw new Error(started.error);

  const presignResponse = await request("/api/news/assets/presign", {
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
    throw new Error("Cover presign rejected.");
  }

  const uploadResponse = await request(presignBody.upload.url, {
    method: "PUT",
    headers: {
      "Content-Type": presignBody.upload.headers["Content-Type"],
      "If-None-Match": presignBody.upload.headers["If-None-Match"],
    },
    body: file,
    signal: AbortSignal.timeout(120_000),
  });
  if (!uploadResponse.ok) throw new Error("Cover upload rejected.");

  for (let attempt = 0; attempt < 6; attempt += 1) {
    if (attempt > 0) await sleep(2_000);
    if ((await sync(articleId, started.assetId)).ok) {
      return { processed: true };
    }
  }
  return { processed: false };
}
