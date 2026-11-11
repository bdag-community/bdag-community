"use server";

import { z } from "zod";
import {
  ABUSE_PROTECTION_COPY,
  PROJECT_CATEGORIES,
  PROJECTS_PAGE,
} from "@/lib/content/site";
import { submissionProtectionMessage } from "@/lib/abuse/form";
import { payloadFits } from "@/lib/abuse/payload";
import { protectPublicSubmission } from "@/lib/abuse/public-submission.server";
import { createProjectAssetCapability } from "@/lib/projects/project-asset-capability";
import { loadArticleAssetRuntimeConfig } from "@/lib/aws/article-asset-config.server";
import {
  ARTICLE_ASSET_MAX_ALT_TEXT_LENGTH,
  isArticleAssetByteSizeAllowed,
  isArticleAssetContentType,
} from "@/lib/news/article-asset-policy";
import { hasSupabaseEnv } from "@/lib/supabase/env";

export type CommunityProjectValues = {
  authorName: string;
  name: string;
  url: string;
  category: string;
  description: string;
  assetContentType: string;
  assetByteSize: string;
  assetAltText: string;
};

export type CommunityProjectAssetUpload =
  | { status: "ready"; capability: string }
  | { status: "unavailable" };

export type CommunityProjectState = {
  ok: boolean | null;
  attempt: number;
  fieldErrors?: Partial<Record<keyof CommunityProjectValues, string>>;
  formError?: string;
  values?: CommunityProjectValues;
  assetUpload?: CommunityProjectAssetUpload;
};

const PROJECT_PAYLOAD_MAX_BYTES = 64 * 1024;

const messages = PROJECTS_PAGE.submission.form.validation;

const schema = z.object({
  authorName: z.string().trim().max(120, messages.authorNameMax),
  name: z
    .string()
    .trim()
    .min(2, messages.nameMin)
    .max(80, messages.nameMax),
  url: z
    .string()
    .trim()
    .min(12, messages.urlInvalid)
    .max(300, messages.urlMax)
    .regex(/^https:\/\/\S+\.\S+$/, messages.urlInvalid),
  category: z.enum(
    Object.keys(PROJECT_CATEGORIES) as [string, ...string[]],
    { message: messages.categoryInvalid },
  ),
  description: z
    .string()
    .trim()
    .min(20, messages.descriptionMin)
    .max(200, messages.descriptionMax),
  assetContentType: z.string().trim().max(100),
  assetByteSize: z.string().trim().max(20),
  assetAltText: z
    .string()
    .trim()
    .max(ARTICLE_ASSET_MAX_ALT_TEXT_LENGTH, messages.assetAltTextMax),
});

/**
 * Public project intake. It can create one private entry and cannot choose a
 * publication flag, publication time, or image key. Vetting and publishing
 * remain behind the admin actions and their authenticated RLS policies.
 */
export async function submitCommunityProject(
  prev: CommunityProjectState,
  formData: FormData,
): Promise<CommunityProjectState> {
  const attempt = prev.attempt + 1;

  const honeypot = formData.get("website");
  if (typeof honeypot === "string" && honeypot !== "") {
    return { ok: true, attempt };
  }

  const values: CommunityProjectValues = {
    authorName: String(formData.get("authorName") ?? ""),
    name: String(formData.get("name") ?? ""),
    url: String(formData.get("url") ?? ""),
    category: String(formData.get("category") ?? ""),
    description: String(formData.get("description") ?? ""),
    assetContentType: String(formData.get("assetContentType") ?? ""),
    assetByteSize: String(formData.get("assetByteSize") ?? ""),
    assetAltText: String(formData.get("assetAltText") ?? ""),
  };
  const safeValues: CommunityProjectValues = {
    authorName: values.authorName.slice(0, 120),
    name: values.name.slice(0, 80),
    url: values.url.slice(0, 300),
    category: values.category.slice(0, 40),
    description: values.description.slice(0, 200),
    assetContentType: values.assetContentType.slice(0, 100),
    assetByteSize: values.assetByteSize.slice(0, 20),
    assetAltText: values.assetAltText.slice(
      0,
      ARTICLE_ASSET_MAX_ALT_TEXT_LENGTH,
    ),
  };
  const token = String(formData.get("cf-turnstile-response") ?? "");

  if (!payloadFits({ ...values, token }, PROJECT_PAYLOAD_MAX_BYTES)) {
    return {
      ok: null,
      attempt,
      values: safeValues,
      formError: ABUSE_PROTECTION_COPY.payloadTooLarge,
    };
  }

  const parsed = schema.safeParse(values);
  if (!parsed.success) {
    const flat = parsed.error.flatten().fieldErrors;
    return {
      ok: null,
      attempt,
      values: safeValues,
      fieldErrors: {
        authorName: flat.authorName?.[0],
        name: flat.name?.[0],
        url: flat.url?.[0],
        category: flat.category?.[0],
        description: flat.description?.[0],
        assetAltText: flat.assetAltText?.[0],
      },
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
      fieldErrors: {
        assetContentType: !isArticleAssetContentType(
          parsed.data.assetContentType,
        )
          ? messages.assetType
          : messages.assetSize,
      },
    };
  }

  const protection = await protectPublicSubmission("project", token);
  if (protection.status !== "allowed") {
    return {
      ok: null,
      attempt,
      values: safeValues,
      formError: submissionProtectionMessage(protection),
    };
  }

  if (!hasSupabaseEnv()) {
    return { ok: false, attempt, values: safeValues };
  }

  try {
    const { getAdminSupabase } = await import("@/lib/supabase/admin");
    const supabase = getAdminSupabase();
    const assetConfig = assetRequested
      ? loadArticleAssetRuntimeConfig()
      : null;
    const capability = assetConfig
      ? createProjectAssetCapability(
          assetConfig.storageEnvironment,
          assetConfig.capabilitySecret,
        )
      : null;
    const { data, error } = await supabase.rpc(
      "create_community_project_draft",
      {
        p_name: parsed.data.name,
        p_description: parsed.data.description,
        p_url: parsed.data.url,
        p_category: parsed.data.category,
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
      return { ok: false, attempt, values: safeValues };
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
    return { ok: false, attempt, values: safeValues };
  }
}
