import "server-only";

import { COMMUNITY_PAGE } from "@/lib/content/site";
import { sendResendPlainTextEmail } from "@/lib/email/resend-transport";

export type SuggestionEmailInput = {
  authorName: string;
  replyEmail: string;
  suggestion: string;
};

/**
 * Deliver one suggestion as plain text. Provider credentials, sender,
 * recipient, and subject are all server-controlled. A missing configuration,
 * timeout, network error, or non-2xx response is a closed failure.
 */
export async function sendSuggestionEmail(
  input: SuggestionEmailInput,
): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY ?? "";
  const recipient = process.env.SUGGESTION_NOTIFY_EMAIL ?? "";
  const sender = process.env.SUGGESTION_FROM_EMAIL ?? "";

  const labels = COMMUNITY_PAGE.suggestionBox.emailLabels;
  const text = [
    `${labels.authorName}: ${input.authorName || labels.notProvided}`,
    `${labels.replyEmail}: ${input.replyEmail || labels.notProvided}`,
    "",
    `${labels.suggestion}:`,
    input.suggestion,
  ].join("\n");

  return sendResendPlainTextEmail(
    { apiKey, recipient, sender },
    {
      subject: COMMUNITY_PAGE.suggestionBox.emailSubject,
      text,
      ...(input.replyEmail ? { replyTo: input.replyEmail } : {}),
    },
  );
}
