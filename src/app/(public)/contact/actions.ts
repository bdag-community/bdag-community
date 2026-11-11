"use server";

import { z } from "zod";
import { ABUSE_PROTECTION_COPY, CONTACT_PAGE } from "@/lib/content/site";
import { submissionProtectionMessage } from "@/lib/abuse/form";
import { payloadFits } from "@/lib/abuse/payload";
import { protectPublicSubmission } from "@/lib/abuse/public-submission.server";
import { hasSupabaseEnv } from "@/lib/supabase/env";

/**
 * Contact form server action — validates with zod, then stores the message in
 * the contact_messages table via the service-role client (the table denies all
 * anon/authenticated access by design; inserts happen only here, server-side).
 *
 * Degradation contract: if Supabase is not wired or the insert fails, the
 * action returns ok:false and the form falls back to the channels + mailto —
 * a submission is never a dead end and never an error page.
 */

export type ContactFormValues = {
  name: string;
  email: string;
  topic: string;
  message: string;
};

export type ContactFormState = {
  /** null = nothing stored yet (fresh form or validation error); true/false = submission outcome. */
  ok: boolean | null;
  /** Per-field validation messages (present only when validation failed). */
  fieldErrors?: Partial<Record<keyof ContactFormValues, string>>;
  formError?: string;
  /** Echo of what was submitted so the form keeps values on error. */
  values?: ContactFormValues;
  /**
   * Submissions handled so far, counting from 0 for the untouched form.
   *
   * The error summary moves focus, and it has to move it again when the same
   * mistake is made twice — two identical failing submissions produce two
   * identical states, so there is nothing else for the client to compare. This
   * number always changes, so the effect that focuses the summary always runs.
   */
  attempt: number;
};

const CONTACT_PAYLOAD_MAX_BYTES = 16 * 1024;

const schema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Please tell us your name.")
    .max(200, "Please keep your name under 200 characters."),
  email: z
    .string()
    .trim()
    .max(320, "Please keep the email address under 320 characters.")
    .email("That email address does not look valid."),
  topic: z.enum(CONTACT_PAGE.form.topics, {
    errorMap: () => ({ message: "Choose one of the listed topics." }),
  }),
  message: z
    .string()
    .trim()
    .min(10, "Tell us a little more, at least 10 characters.")
    .max(4000, "Please keep the message under 4,000 characters."),
});

export async function sendContactMessage(
  prev: ContactFormState,
  formData: FormData,
): Promise<ContactFormState> {
  const attempt = prev.attempt + 1;

  // Honeypot: real visitors never see the hidden "website" field. A filled
  // value means an automated submission — pretend success, store nothing.
  const honeypot = formData.get("website");
  if (typeof honeypot === "string" && honeypot !== "") {
    return { ok: true, attempt };
  }

  const values: ContactFormValues = {
    name: String(formData.get("name") ?? ""),
    email: String(formData.get("email") ?? ""),
    topic: String(formData.get("topic") ?? ""),
    message: String(formData.get("message") ?? ""),
  };
  const safeValues: ContactFormValues = {
    name: values.name.slice(0, 200),
    email: values.email.slice(0, 320),
    topic: values.topic.slice(0, 100),
    message: values.message.slice(0, 4000),
  };
  const token = String(formData.get("cf-turnstile-response") ?? "");

  if (!payloadFits({ ...values, token }, CONTACT_PAYLOAD_MAX_BYTES)) {
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
        name: flat.name?.[0],
        email: flat.email?.[0],
        topic: flat.topic?.[0],
        message: flat.message?.[0],
      },
    };
  }

  const protection = await protectPublicSubmission("contact", token);
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
    // Dynamic import: admin.ts fails fast at module scope when the
    // service-role key is absent — load it only after env says Supabase is
    // wired, and let the catch turn any gap into the graceful fallback.
    const { getAdminSupabase } = await import("@/lib/supabase/admin");
    const supabase = getAdminSupabase();
    const { error } = await supabase
      .from("contact_messages")
      .insert(parsed.data);
    if (error) return { ok: false, attempt, values: safeValues };
    return { ok: true, attempt };
  } catch {
    return { ok: false, attempt, values: safeValues };
  }
}
