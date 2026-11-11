import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import {
  ARTICLE_ASSET_UPLOAD_EXPIRES_SECONDS,
  isArticleAssetByteSizeAllowed,
  isArticleAssetContentType,
  isArticleAssetObjectKey,
} from "../news/article-asset-policy.ts";

export type ArticleAssetPresignMaterial = {
  objectKey: string;
  contentType: string;
  byteSize: number;
};

export type ArticleAssetS3Config = {
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
};

export type ArticleAssetUploadRequest = {
  url: string;
  method: "PUT";
  headers: {
    "Content-Type": string;
    "If-None-Match": "*";
    "Content-Length": string;
  };
  byteSize: number;
};

export async function createArticleAssetUploadRequest(
  material: ArticleAssetPresignMaterial,
  config: ArticleAssetS3Config,
  expiresInSeconds: number,
): Promise<ArticleAssetUploadRequest> {
  if (
    config.region !== "eu-central-1" ||
    !config.bucket ||
    !config.accessKeyId ||
    !config.secretAccessKey ||
    !isArticleAssetObjectKey(material.objectKey) ||
    !isArticleAssetContentType(material.contentType) ||
    !isArticleAssetByteSizeAllowed(material.byteSize) ||
    !Number.isInteger(expiresInSeconds) ||
    expiresInSeconds < 1 ||
    expiresInSeconds > ARTICLE_ASSET_UPLOAD_EXPIRES_SECONDS
  ) {
    throw new Error("Article asset upload configuration is invalid.");
  }

  const client = new S3Client({
    region: config.region,
    forcePathStyle: true,
    requestChecksumCalculation: "WHEN_REQUIRED",
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });
  const command = new PutObjectCommand({
    Bucket: config.bucket,
    Key: material.objectKey,
    ContentType: material.contentType,
    ContentLength: material.byteSize,
    IfNoneMatch: "*",
  });
  const url = await getSignedUrl(client, command, {
    expiresIn: expiresInSeconds,
    signableHeaders: new Set([
      "content-length",
      "content-type",
      "if-none-match",
    ]),
  });

  return {
    url,
    method: "PUT",
    headers: {
      "Content-Type": material.contentType,
      "If-None-Match": "*",
      "Content-Length": String(material.byteSize),
    },
    byteSize: material.byteSize,
  };
}
