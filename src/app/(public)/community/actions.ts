"use server";

import { z } from "zod";
import { ABUSE_PROTECTION_COPY, COMMUNITY_PAGE } from "@/lib/content/site";
import { submissionProtectionMessage } from "@/lib/abuse/form";
import { payloadFits } from "@/lib/abuse/payload";
import { protectPublicSubmission } from "@/lib/abuse/public-submission.server";
import { sendSuggestionEmail } from "@/lib/email/suggestions";
import { hasSupabaseEnv } from "@/lib/supabase/env";

export type SuggestionValues = {
  authorName: string;
  replyEmail: string;
  suggestion: string;
};

export type SuggestionState = {
  ok: boolean | null;
  attempt: number;
  fieldErrors?: Partial<Record<keyof SuggestionValues, string>>;
  formError?: string;
  values?: SuggestionValues;
};

const SUGGESTION_PAYLOAD_MAX_BYTES = 16 * 1024;

const messages = COMMUNITY_PAGE.suggestionBox.validation;

const schema = z.object({
  authorName: z.string().trim().max(120, messages.authorNameMax),
  replyEmail: z
    .string()
    .trim()
    .max(320, messages.replyEmailMax)
    .refine(
      (value) => value === "" || z.string().email().safeParse(value).success,
      messages.replyEmailInvalid,
    ),
  suggestion: z
    .string()
    .trim()
    .min(10, messages.suggestionMin)
    .max(4000, messages.suggestionMax),
});

export async function submitSuggestion(
  prev: SuggestionState,
  formData: FormData,
): Promise<SuggestionState> {
  const attempt = prev.attempt + 1;

  const honeypot = formData.get("website");
  if (typeof honeypot === "string" && honeypot !== "") {
    return { ok: true, attempt };
  }

  const values: SuggestionValues = {
    authorName: String(formData.get("authorName") ?? ""),
    replyEmail: String(formData.get("replyEmail") ?? ""),
    suggestion: String(formData.get("suggestion") ?? ""),
  };
  const safeValues: SuggestionValues = {
    authorName: values.authorName.slice(0, 120),
    replyEmail: values.replyEmail.slice(0, 320),
    suggestion: values.suggestion.slice(0, 4000),
  };
  const token = String(formData.get("cf-turnstile-response") ?? "");

  if (!payloadFits({ ...values, token }, SUGGESTION_PAYLOAD_MAX_BYTES)) {
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
        replyEmail: flat.replyEmail?.[0],
        suggestion: flat.suggestion?.[0],
      },
    };
  }

  const protection = await protectPublicSubmission("suggestion", token);
  if (protection.status !== "allowed") {
    return {
      ok: null,
      attempt,
      values: safeValues,
      formError: submissionProtectionMessage(protection),
    };
  }

  if (!hasSupabaseEnv()) return { ok: false, attempt, values: safeValues };

  try {
    const { getAdminSupabase } = await import("@/lib/supabase/admin");
    const supabase = getAdminSupabase();
    const { error } = await supabase.from("suggestion_messages").insert({
      author_name: parsed.data.authorName || null,
      reply_email: parsed.data.replyEmail || null,
      suggestion: parsed.data.suggestion,
    });
    if (error) return { ok: false, attempt, values: safeValues };

    // The private inbox is the durable source of truth. Email is a secondary
    // operator notification and must not make a stored suggestion look lost.
    try {
      await sendSuggestionEmail(parsed.data);
    } catch {
      // The stored inbox item remains available to admins even if the
      // secondary notification provider is temporarily unavailable.
    }
    return { ok: true, attempt };
  } catch {
    return { ok: false, attempt, values: safeValues };
  }
}
