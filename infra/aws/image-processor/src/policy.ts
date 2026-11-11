import { Buffer } from "node:buffer";

export const ARTICLE_COVER_MAX_BYTES = 5 * 1024 * 1024;
export const ARTICLE_COVER_MAX_EDGE = 8192;
export const ARTICLE_COVER_MAX_PIXELS = 24_000_000;

export const ARTICLE_COVER_CONTENT_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export type ArticleCoverContentType =
  (typeof ARTICLE_COVER_CONTENT_TYPES)[number];
export type ArticleCoverFormat = "jpeg" | "png" | "webp";

export type InspectedArticleCover = Readonly<{
  byteSize: number;
  contentType: ArticleCoverContentType;
  format: ArticleCoverFormat;
  width: number;
  height: number;
}>;

export const ARTICLE_COVER_FAILURE_CODES = [
  "animated_image",
  "decode_failed",
  "dimensions_exceeded",
  "file_too_large",
  "malformed_container",
  "metadata_not_stripped",
  "output_limit",
  "pixel_limit_exceeded",
  "size_mismatch",
  "type_mismatch",
  "unsupported_type",
] as const;

export type ArticleCoverFailureCode =
  (typeof ARTICLE_COVER_FAILURE_CODES)[number];

export class ArticleCoverValidationError extends Error {
  readonly code: ArticleCoverFailureCode;

  constructor(code: ArticleCoverFailureCode, message: string) {
    super(`Article cover rejected: ${message}.`);
    this.name = "ArticleCoverValidationError";
    this.code = code;
  }
}

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function pngCrc32(input: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of input) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function fail(
  message: string,
  code: ArticleCoverFailureCode = "malformed_container",
): never {
  throw new ArticleCoverValidationError(code, message);
}

function assertDimensions(width: number, height: number): void {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height)) {
    fail("invalid dimensions");
  }
  if (width < 1 || height < 1) {
    fail("invalid dimensions");
  }
  if (width > ARTICLE_COVER_MAX_EDGE || height > ARTICLE_COVER_MAX_EDGE) {
    fail("dimensions exceed the 8192 pixel edge limit", "dimensions_exceeded");
  }
  if (width * height > ARTICLE_COVER_MAX_PIXELS) {
    fail("decoded pixels exceed the 24 megapixel limit", "pixel_limit_exceeded");
  }
}

function inspectPng(body: Buffer): { width: number; height: number } | null {
  if (!body.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) {
    return null;
  }
  if (body.length < 33) {
    fail("invalid PNG container");
  }

  let offset = 8;
  let sawHeader = false;
  let sawEnd = false;
  let sawImageData = false;
  let width = 0;
  let height = 0;

  while (offset < body.length) {
    if (offset + 12 > body.length) {
      fail("invalid PNG container");
    }
    const length = body.readUInt32BE(offset);
    const type = body.toString("ascii", offset + 4, offset + 8);
    const chunkEnd = offset + 12 + length;
    if (chunkEnd > body.length) {
      fail("invalid PNG container");
    }
    const expectedCrc = body.readUInt32BE(offset + 8 + length);
    const actualCrc = pngCrc32(body.subarray(offset + 4, offset + 8 + length));
    if (actualCrc !== expectedCrc) {
      fail("invalid PNG checksum");
    }

    if (!sawHeader) {
      if (type !== "IHDR" || length !== 13) {
        fail("invalid PNG header");
      }
      width = body.readUInt32BE(offset + 8);
      height = body.readUInt32BE(offset + 12);
      assertDimensions(width, height);
      sawHeader = true;
    } else if (type === "IHDR") {
      fail("duplicate PNG header");
    }
    if (type === "acTL") {
      fail("animated PNG images are unsupported", "animated_image");
    }
    if (type === "IEND") {
      if (!sawImageData || length !== 0 || chunkEnd !== body.length) {
        fail("PNG contains trailing data");
      }
      sawEnd = true;
      break;
    }
    if (type === "IDAT") sawImageData = true;
    const critical = (type.charCodeAt(0) & 0x20) === 0;
    if (critical && !["IHDR", "PLTE", "IDAT", "IEND"].includes(type)) {
      fail("unsupported critical PNG chunk");
    }
    offset = chunkEnd;
  }

  if (!sawHeader || !sawEnd) {
    fail("invalid PNG container");
  }
  return { width, height };
}

function webpDimensions(
  body: Buffer,
  type: string,
  dataOffset: number,
  length: number,
): { width: number; height: number } | null {
  if (type === "VP8X" && length >= 10) {
    const flags = body[dataOffset];
    if (flags === undefined) fail("invalid WebP container");
    if ((flags & 0x02) !== 0) {
      fail("animated WebP images are unsupported", "animated_image");
    }
    return {
      width: 1 + body.readUIntLE(dataOffset + 4, 3),
      height: 1 + body.readUIntLE(dataOffset + 7, 3),
    };
  }
  if (type === "VP8 " && length >= 10) {
    if (
      body[dataOffset + 3] !== 0x9d ||
      body[dataOffset + 4] !== 0x01 ||
      body[dataOffset + 5] !== 0x2a
    ) {
      fail("invalid WebP frame header");
    }
    return {
      width: body.readUInt16LE(dataOffset + 6) & 0x3fff,
      height: body.readUInt16LE(dataOffset + 8) & 0x3fff,
    };
  }
  if (type === "VP8L" && length >= 5) {
    if (body[dataOffset] !== 0x2f) fail("invalid WebP lossless header");
    const b1 = body[dataOffset + 1];
    const b2 = body[dataOffset + 2];
    const b3 = body[dataOffset + 3];
    const b4 = body[dataOffset + 4];
    if (b1 === undefined || b2 === undefined || b3 === undefined || b4 === undefined) {
      fail("invalid WebP lossless header");
    }
    return {
      width: 1 + b1 + ((b2 & 0x3f) << 8),
      height: 1 + ((b2 & 0xc0) >> 6) + (b3 << 2) + ((b4 & 0x0f) << 10),
    };
  }
  return null;
}

function inspectWebp(body: Buffer): { width: number; height: number } | null {
  if (
    body.length < 12 ||
    body.toString("ascii", 0, 4) !== "RIFF" ||
    body.toString("ascii", 8, 12) !== "WEBP"
  ) {
    return null;
  }
  if (body.readUInt32LE(4) !== body.length - 8) {
    fail("invalid WebP container length");
  }

  let offset = 12;
  let canvasDimensions: { width: number; height: number } | null = null;
  let payloadDimensions: { width: number; height: number } | null = null;
  let payloadCount = 0;
  while (offset < body.length) {
    if (offset + 8 > body.length) fail("invalid WebP container");
    const type = body.toString("ascii", offset, offset + 4);
    const length = body.readUInt32LE(offset + 4);
    const dataOffset = offset + 8;
    const paddedEnd = dataOffset + length + (length % 2);
    if (paddedEnd > body.length) fail("invalid WebP container");
    if (type === "ANIM" || type === "ANMF") {
      fail("animated WebP images are unsupported", "animated_image");
    }
    const dimensions = webpDimensions(body, type, dataOffset, length);
    if (type === "VP8X") {
      if (canvasDimensions !== null) fail("duplicate WebP canvas header");
      canvasDimensions = dimensions;
    } else if (type === "VP8 " || type === "VP8L") {
      payloadCount += 1;
      if (payloadCount !== 1 || dimensions === null) {
        fail("invalid WebP image payload");
      }
      payloadDimensions = dimensions;
    }
    offset = paddedEnd;
  }
  if (offset !== body.length || payloadDimensions === null || payloadCount !== 1) {
    fail("invalid WebP image container");
  }
  if (
    canvasDimensions &&
    (canvasDimensions.width !== payloadDimensions.width ||
      canvasDimensions.height !== payloadDimensions.height)
  ) {
    fail("inconsistent WebP dimensions");
  }
  const dimensions = canvasDimensions ?? payloadDimensions;
  assertDimensions(dimensions.width, dimensions.height);
  return dimensions;
}

function isAnyStartOfFrame(marker: number): boolean {
  return (
    (marker >= 0xc0 && marker <= 0xc3) ||
    (marker >= 0xc5 && marker <= 0xc7) ||
    (marker >= 0xc9 && marker <= 0xcb) ||
    (marker >= 0xcd && marker <= 0xcf)
  );
}

function isSupportedStartOfFrame(marker: number): boolean {
  return marker === 0xc0 || marker === 0xc2;
}

function inspectJpeg(body: Buffer): { width: number; height: number } | null {
  if (body.length < 4 || body[0] !== 0xff || body[1] !== 0xd8) return null;
  let offset = 2;
  let width = 0;
  let height = 0;
  let sawFrame = false;
  let sawScan = false;
  while (offset < body.length) {
    if (body[offset] !== 0xff) fail("invalid JPEG marker stream");
    while (body[offset] === 0xff) offset += 1;
    const marker = body[offset];
    if (marker === undefined) fail("invalid JPEG container");
    offset += 1;
    if (marker === 0xd9) {
      if (!sawFrame || !sawScan || offset !== body.length) {
        fail("JPEG container has trailing or truncated data");
      }
      return { width, height };
    }
    if (
      marker === 0x00 ||
      marker === 0xd8 ||
      marker === 0x01 ||
      (marker >= 0xd0 && marker <= 0xd7)
    ) {
      fail("invalid JPEG marker stream");
    }
    if (offset + 2 > body.length) fail("invalid JPEG container");
    const length = body.readUInt16BE(offset);
    if (length < 2 || offset + length > body.length) {
      fail("invalid JPEG container");
    }
    if (isAnyStartOfFrame(marker)) {
      if (!isSupportedStartOfFrame(marker) || sawFrame) {
        fail("unsupported JPEG frame type");
      }
      if (length < 8) fail("invalid JPEG frame header");
      height = body.readUInt16BE(offset + 3);
      width = body.readUInt16BE(offset + 5);
      assertDimensions(width, height);
      sawFrame = true;
    }
    offset += length;
    if (marker !== 0xda) continue;

    sawScan = true;
    let nextMarker = -1;
    while (offset < body.length) {
      if (body[offset] !== 0xff) {
        offset += 1;
        continue;
      }
      const markerStart = offset;
      while (body[offset] === 0xff) offset += 1;
      const scanMarker = body[offset];
      if (scanMarker === undefined) fail("truncated JPEG scan");
      offset += 1;
      if (scanMarker === 0x00 || (scanMarker >= 0xd0 && scanMarker <= 0xd7)) {
        continue;
      }
      nextMarker = markerStart;
      break;
    }
    if (nextMarker < 0) fail("truncated JPEG scan");
    offset = nextMarker;
  }
  fail("JPEG container has trailing or truncated data");
}

function isArticleCoverContentType(
  value: string,
): value is ArticleCoverContentType {
  return ARTICLE_COVER_CONTENT_TYPES.some((allowed) => allowed === value);
}

export function inspectArticleCover(
  input: Uint8Array,
  declaredContentType: string,
): InspectedArticleCover {
  const body = Buffer.from(input);
  if (body.length < 1) fail("empty files are unsupported");
  if (body.length > ARTICLE_COVER_MAX_BYTES) {
    fail("file exceeds 5 MiB", "file_too_large");
  }
  if (!isArticleCoverContentType(declaredContentType)) {
    fail("declared type is not a supported raster image", "unsupported_type");
  }

  const png = inspectPng(body);
  const webp = png === null ? inspectWebp(body) : null;
  const jpeg = png === null && webp === null ? inspectJpeg(body) : null;
  const detected = png
    ? { format: "png" as const, contentType: "image/png" as const, ...png }
    : webp
      ? { format: "webp" as const, contentType: "image/webp" as const, ...webp }
      : jpeg
        ? { format: "jpeg" as const, contentType: "image/jpeg" as const, ...jpeg }
        : fail("bytes are not a supported raster image");

  if (detected.contentType !== declaredContentType) {
    fail("declared type does not match the image bytes", "type_mismatch");
  }
  return { byteSize: body.length, ...detected };
}
