"use server";

import { z } from "zod";
import { ABUSE_PROTECTION_COPY, NEWS_PAGE } from "@/lib/content/site";
import { submissionProtectionMessage } from "@/lib/abuse/form";
import { payloadFits } from "@/lib/abuse/payload";
import { protectPublicSubmission } from "@/lib/abuse/public-submission.server";
import {
  ARTICLE_BODY_MAX_PUBLIC_HTML_LENGTH,
  ARTICLE_BODY_MAX_TEXT_LENGTH,
  plainTextToArticleHtml,
  sanitizeArticleBody,
} from "@/lib/news/rich-text";
import { createArticleAssetCapability } from "@/lib/news/article-asset-capability";
import { loadArticleAssetRuntimeConfig } from "@/lib/aws/article-asset-config.server";
import {
  ARTICLE_ASSET_MAX_ALT_TEXT_LENGTH,
  isArticleAssetByteSizeAllowed,
  isArticleAssetContentType,
} from "@/lib/news/article-asset-policy";
import { hasSupabaseEnv } from "@/lib/supabase/env";

export type CommunityArticleValues = {
  authorName: string;
  title: string;
  subtitle: string;
  description: string;
  body: string;
  bodyMode: "plain" | "html";
  assetContentType: string;
  assetByteSize: string;
  assetAltText: string;
};

export type CommunityArticleAssetUpload =
  | { status: "ready"; capability: string }
  | { status: "unavailable" };

export type CommunityArticleState = {
  ok: boolean | null;
  attempt: number;
  fieldErrors?: Partial<Record<keyof CommunityArticleValues, string>>;
  formError?: string;
  values?: CommunityArticleValues;
  bodyFallback?: string;
  assetUpload?: CommunityArticleAssetUpload;
};

const ARTICLE_PAYLOAD_MAX_BYTES = 384 * 1024;

const messages = NEWS_PAGE.submission.form.validation;

const schema = z
  .object({
    authorName: z.string().trim().max(120, messages.authorNameMax),
    title: z
      .string()
      .trim()
      .min(5, messages.titleMin)
      .max(200, messages.titleMax),
    subtitle: z.string().trim().max(300, messages.subtitleMax),
    description: z
      .string()
      .trim()
      .min(20, messages.descriptionMin)
      .max(1000, messages.descriptionMax),
    body: z.string(),
    bodyMode: z.enum(["plain", "html"]),
    assetContentType: z.string().trim().max(100),
    assetByteSize: z.string().trim().max(20),
    assetAltText: z
      .string()
      .trim()
      .max(
        ARTICLE_ASSET_MAX_ALT_TEXT_LENGTH,
        messages.assetAltTextMax,
      ),
  })
  .superRefine((value, context) => {
    const limit =
      value.bodyMode === "plain"
        ? ARTICLE_BODY_MAX_TEXT_LENGTH
        : ARTICLE_BODY_MAX_PUBLIC_HTML_LENGTH;
    if (value.body.length > limit) {
      context.addIssue({
        code: z.ZodIssueCode.too_big,
        maximum: limit,
        inclusive: true,
        type: "string",
        path: ["body"],
        message: messages.bodyMax,
      });
    }
  });

/**
 * Public article intake. It can create one private draft and cannot choose a
 * slug, image, publication flag, or publication time. Updating and publishing
 * remain behind the admin actions and their authenticated RLS policies.
 */
export async function submitCommunityArticle(
  prev: CommunityArticleState,
  formData: FormData,
): Promise<CommunityArticleState> {
  const attempt = prev.attempt + 1;

  const honeypot = formData.get("website");
  if (typeof honeypot === "string" && honeypot !== "") {
    return { ok: true, attempt };
  }

  const values: CommunityArticleValues = {
    authorName: String(formData.get("authorName") ?? ""),
    title: String(formData.get("title") ?? ""),
    subtitle: String(formData.get("subtitle") ?? ""),
    description: String(formData.get("description") ?? ""),
    body: String(formData.get("body") ?? ""),
    bodyMode: formData.get("bodyMode") === "html" ? "html" : "plain",
    assetContentType: String(formData.get("assetContentType") ?? ""),
    assetByteSize: String(formData.get("assetByteSize") ?? ""),
    assetAltText: String(formData.get("assetAltText") ?? ""),
  };
  const safeInputLimit =
    values.bodyMode === "plain"
      ? ARTICLE_BODY_MAX_TEXT_LENGTH
      : ARTICLE_BODY_MAX_PUBLIC_HTML_LENGTH;
  const boundedBody = values.body.slice(0, safeInputLimit);
  const safeBodyBeforeValidation = sanitizeArticleBody(
    values.bodyMode === "html"
      ? boundedBody
      : plainTextToArticleHtml(boundedBody),
  );
  const safeValuesBeforeValidation: CommunityArticleValues = {
    authorName: values.authorName.slice(0, 120),
    title: values.title.slice(0, 200),
    subtitle: values.subtitle.slice(0, 300),
    description: values.description.slice(0, 1000),
    body: safeBodyBeforeValidation.html,
    bodyMode: "html",
    assetContentType: values.assetContentType.slice(0, 100),
    assetByteSize: values.assetByteSize.slice(0, 20),
    assetAltText: values.assetAltText.slice(
      0,
      ARTICLE_ASSET_MAX_ALT_TEXT_LENGTH,
    ),
  };
  const token = String(formData.get("cf-turnstile-response") ?? "");

  if (!payloadFits({ ...values, token }, ARTICLE_PAYLOAD_MAX_BYTES)) {
    return {
      ok: null,
      attempt,
      values: safeValuesBeforeValidation,
      bodyFallback: safeBodyBeforeValidation.text,
      formError: ABUSE_PROTECTION_COPY.payloadTooLarge,
    };
  }

  const parsed = schema.safeParse(values);
  if (!parsed.success) {
    const flat = parsed.error.flatten().fieldErrors;
    return {
      ok: null,
      attempt,
      values: safeValuesBeforeValidation,
      bodyFallback: safeBodyBeforeValidation.text,
      fieldErrors: {
        authorName: flat.authorName?.[0],
        title: flat.title?.[0],
        subtitle: flat.subtitle?.[0],
        description: flat.description?.[0],
        body: flat.body?.[0],
        assetAltText: flat.assetAltText?.[0],
      },
    };
  }

  const sanitizedBody = safeBodyBeforeValidation;
  const bodyLength = sanitizedBody.text.length;
  const bodyError =
    bodyLength < 100
      ? messages.bodyMin
      : bodyLength > ARTICLE_BODY_MAX_TEXT_LENGTH
        ? messages.bodyMax
        : undefined;
  const safeValues: CommunityArticleValues = {
    authorName: parsed.data.authorName,
    title: parsed.data.title,
    subtitle: parsed.data.subtitle,
    description: parsed.data.description,
    body: sanitizedBody.html,
    bodyMode: "html",
    assetContentType: parsed.data.assetContentType,
    assetByteSize: parsed.data.assetByteSize,
    assetAltText: parsed.data.assetAltText,
  };
  if (bodyError) {
    return {
      ok: null,
      attempt,
      values: safeValues,
      bodyFallback: sanitizedBody.text,
      fieldErrors: { body: bodyError },
    };
  }

  const assetRequested =
    parsed.data.assetContentType !== "" ||
    parsed.data.assetByteSize !== "" ||
    parsed.data.assetAltText !== "";
  const assetByteSize = /^\d+$/.test(parsed.data.assetByteSize)
    ? Number(parsed.data.assetByteSize)
    : 0;
  if (
    assetRequested &&
    (!isArticleAssetContentType(parsed.data.assetContentType) ||
      !isArticleAssetByteSizeAllowed(assetByteSize))
  ) {
    return {
      ok: null,
      attempt,
      values: safeValues,
      bodyFallback: sanitizedBody.text,
      fieldErrors: {
        assetContentType: !isArticleAssetContentType(
          parsed.data.assetContentType,
        )
          ? messages.assetType
          : messages.assetSize,
      },
    };
  }

  const protection = await protectPublicSubmission("article", token);
  if (protection.status !== "allowed") {
    return {
      ok: null,
      attempt,
      values: safeValues,
      bodyFallback: sanitizedBody.text,
      formError: submissionProtectionMessage(protection),
    };
  }

  if (!hasSupabaseEnv()) {
    return {
      ok: false,
      attempt,
      values: safeValues,
      bodyFallback: sanitizedBody.text,
    };
  }

  try {
    const { getAdminSupabase } = await import("@/lib/supabase/admin");
    const supabase = getAdminSupabase();
    const assetConfig = assetRequested
      ? loadArticleAssetRuntimeConfig()
      : null;
    const capability = assetConfig
      ? createArticleAssetCapability(
          assetConfig.storageEnvironment,
          assetConfig.capabilitySecret,
        )
      : null;
    const { data, error } = await supabase.rpc(
      "create_community_article_draft",
      {
        p_title: parsed.data.title,
        p_subtitle: parsed.data.subtitle || null,
        p_description: parsed.data.description,
        p_body: sanitizedBody.text,
        p_body_html: sanitizedBody.html,
        p_author_name: parsed.data.authorName || null,
        p_storage_environment: capability
          ? assetConfig?.storageEnvironment
          : null,
        p_asset_content_type: capability
          ? parsed.data.assetContentType
          : null,
        p_asset_byte_size: capability ? assetByteSize : null,
        p_asset_alt_text: capability
          ? parsed.data.assetAltText || null
          : null,
        p_capability_digest: capability?.digest ?? null,
      },
    );

    if (error || !Array.isArray(data) || data.length !== 1) {
      return {
        ok: false,
        attempt,
        values: safeValues,
        bodyFallback: sanitizedBody.text,
      };
    }
    return {
      ok: true,
      attempt,
      assetUpload: capability
        ? { status: "ready", capability: capability.token }
        : assetRequested
          ? { status: "unavailable" }
          : undefined,
    };
  } catch {
    return {
      ok: false,
      attempt,
      values: safeValues,
      bodyFallback: sanitizedBody.text,
    };
  }
}
