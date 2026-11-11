import { gzip } from "node:zlib";
import { promisify } from "node:util";

/**
 * JSON responses that are actually compressed on the wire.
 *
 * These three snapshots are the largest thing this site sends repeatedly:
 * /api/stats is 2,866 B raw against 1,133 B gzipped, /api/nodes saves 71% and
 * /api/chain-history 78%. Nothing was compressing them — verified against the
 * running server, which returns no `content-encoding` at all — so a visitor
 * sitting on /chain was paying about 1.2 MB an hour for roughly 0.44 MB of
 * information.
 *
 * Done here rather than in front of the server because `output: "standalone"`
 * means there may not be a front. A reverse proxy is the cleaner place when
 * one exists, and this stays correct if one appears: the response already
 * carries `Content-Encoding`, so a proxy that compresses will leave it alone
 * rather than double-encoding it.
 *
 * The folder is `_lib` — a private folder, which the App Router does not map
 * to a route — so this file is a module and never an endpoint.
 */

const gzipAsync = promisify(gzip);

/**
 * Below this, gzip is a loss. The format's own header and trailer are 18 bytes
 * before a single byte of payload is described, and a short JSON object can
 * come out larger than it went in. /api/health's ~150-byte ops body is exactly
 * that case, which is why it does not use this helper at all.
 */
const MIN_GZIP_BYTES = 512;

/**
 * `Accept-Encoding: gzip`, `gzip;q=0.8`, `deflate, gzip`, `*` — all of these
 * mean yes. `gzip;q=0` means no, and a client that says so gets plain JSON.
 */
function acceptsGzip(header: string | null): boolean {
  if (!header) return false;
  for (const part of header.split(",")) {
    const [rawName, ...params] = part.split(";");
    const name = rawName.trim().toLowerCase();
    if (name !== "gzip" && name !== "*") continue;
    const q = params
      .map((p) => p.trim().toLowerCase())
      .find((p) => p.startsWith("q="));
    if (q && Number(q.slice(2)) === 0) continue;
    return true;
  }
  return false;
}

/**
 * Serialise `data` and send it gzipped when the caller asked for gzip and the
 * body is big enough to be worth it. `headers` are merged last so a route can
 * still set its own Cache-Control.
 */
export async function compressedJson(
  request: Request,
  data: unknown,
  headers: Record<string, string> = {},
): Promise<Response> {
  const raw = Buffer.from(JSON.stringify(data), "utf8");
  const base: Record<string, string> = {
    "Content-Type": "application/json; charset=utf-8",
    // The bytes differ by request header, so any shared cache in front of this
    // has to key on it or it will hand a gzipped body to a client that cannot
    // read one.
    Vary: "Accept-Encoding",
    ...headers,
  };

  if (raw.byteLength < MIN_GZIP_BYTES || !acceptsGzip(request.headers.get("accept-encoding"))) {
    return new Response(new Uint8Array(raw), { headers: base });
  }

  const encoded = await gzipAsync(raw);
  return new Response(new Uint8Array(encoded), {
    headers: { ...base, "Content-Encoding": "gzip" },
  });
}
