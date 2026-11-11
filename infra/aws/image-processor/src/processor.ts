import { createHash } from "node:crypto";

import sharp from "sharp";

import {
  ARTICLE_COVER_MAX_PIXELS,
  ArticleCoverValidationError,
  inspectArticleCover,
  type ArticleCoverContentType,
} from "./policy.ts";

const OUTPUT_BACKGROUND = "#0e0715";
const OUTPUT_QUALITY = 82;
const OUTPUT_EFFORT = 4;
export const ARTICLE_COVER_PROCESSING_TIMEOUT_SECONDS = 8;

export const ARTICLE_COVER_VARIANTS = [
  { name: "cover-640x360.webp", width: 640, height: 360, maxBytes: 350 * 1024 },
  { name: "cover-1024x576.webp", width: 1024, height: 576, maxBytes: 800 * 1024 },
  { name: "cover-1600x900.webp", width: 1600, height: 900, maxBytes: 1600 * 1024 },
] as const;

export type ProcessedArticleCover = Readonly<{
  name: (typeof ARTICLE_COVER_VARIANTS)[number]["name"];
  width: number;
  height: number;
  contentType: "image/webp";
  byteSize: number;
  sha256: string;
  body: Buffer;
}>;

sharp.cache(false);
sharp.concurrency(1);
sharp.block({ operation: ["VipsForeignLoad"] });
sharp.unblock({
  operation: [
    "VipsForeignLoadJpegBuffer",
    "VipsForeignLoadPngBuffer",
    "VipsForeignLoadWebpBuffer",
  ],
});

export async function processArticleCover(
  input: Uint8Array,
  declaredContentType: ArticleCoverContentType,
): Promise<readonly ProcessedArticleCover[]> {
  const inspected = inspectArticleCover(input, declaredContentType);
  const body = Buffer.from(input);
  const inputMetadata = await sharp(body, {
    failOn: "warning",
    limitInputPixels: ARTICLE_COVER_MAX_PIXELS,
    limitInputChannels: 4,
    sequentialRead: true,
    unlimited: false,
  }).metadata();

  if (
    inputMetadata.format !== inspected.format ||
    inputMetadata.width !== inspected.width ||
    inputMetadata.height !== inspected.height
  ) {
    throw new Error("Article cover rejected: decoded metadata is inconsistent.");
  }
  if ((inputMetadata.pages ?? 1) !== 1) {
    throw new Error("Article cover rejected: animated images are unsupported.");
  }

  const outputs: ProcessedArticleCover[] = [];
  for (const variant of ARTICLE_COVER_VARIANTS) {
    const output = await sharp(body, {
      failOn: "warning",
      limitInputPixels: ARTICLE_COVER_MAX_PIXELS,
      limitInputChannels: 4,
      sequentialRead: true,
      unlimited: false,
    })
      .autoOrient()
      .toColourspace("srgb")
      .flatten({ background: OUTPUT_BACKGROUND })
      .resize(variant.width, variant.height, {
        fit: "cover",
        position: "centre",
      })
      .webp({
        quality: OUTPUT_QUALITY,
        effort: OUTPUT_EFFORT,
        smartSubsample: true,
      })
      .timeout({ seconds: ARTICLE_COVER_PROCESSING_TIMEOUT_SECONDS })
      .toBuffer();

    if (output.length > variant.maxBytes) {
      throw new ArticleCoverValidationError(
        "output_limit",
        "the normalized derivative exceeds its byte limit",
      );
    }
    const outputMetadata = await sharp(output, {
      failOn: "warning",
      limitInputPixels: ARTICLE_COVER_MAX_PIXELS,
      limitInputChannels: 4,
      sequentialRead: true,
      unlimited: false,
    }).metadata();
    if (
      outputMetadata.format !== "webp" ||
      outputMetadata.width !== variant.width ||
      outputMetadata.height !== variant.height ||
      (outputMetadata.pages ?? 1) !== 1 ||
      outputMetadata.channels !== 3 ||
      outputMetadata.hasAlpha === true ||
      outputMetadata.exif !== undefined ||
      outputMetadata.icc !== undefined ||
      outputMetadata.xmp !== undefined ||
      outputMetadata.iptc !== undefined ||
      outputMetadata.orientation !== undefined
    ) {
      throw new ArticleCoverValidationError(
        "metadata_not_stripped",
        "the normalized derivative failed its metadata boundary",
      );
    }

    outputs.push({
      ...variant,
      contentType: "image/webp",
      byteSize: output.length,
      sha256: createHash("sha256").update(output).digest("hex"),
      body: output,
    });
  }
  return outputs;
}
