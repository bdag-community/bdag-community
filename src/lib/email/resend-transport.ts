export const RESEND_EMAILS_URL = "https://api.resend.com/emails";
export const RESEND_REQUEST_TIMEOUT_MS = 8_000;

export type ResendConfiguration = {
  apiKey: string;
  recipient: string;
  sender: string;
};

export type PlainTextEmail = {
  subject: string;
  text: string;
  replyTo?: string;
};

type TransportDependencies = {
  fetcher: typeof fetch;
  timeoutSignal: (milliseconds: number) => AbortSignal;
};

const defaultDependencies: TransportDependencies = {
  fetcher: fetch,
  timeoutSignal: (milliseconds) => AbortSignal.timeout(milliseconds),
};

const isSafeHeaderValue = (value: string): boolean =>
  value.length > 0 && !/[\r\n]/.test(value);

/**
 * Send one server-assembled plain-text message through Resend. The injected
 * dependencies make provider success, rejection, and timeout behavior
 * executable without transmitting test data.
 */
export async function sendResendPlainTextEmail(
  configuration: ResendConfiguration,
  message: PlainTextEmail,
  dependencies: TransportDependencies = defaultDependencies,
): Promise<boolean> {
  if (
    !isSafeHeaderValue(configuration.apiKey) ||
    !isSafeHeaderValue(configuration.recipient) ||
    !isSafeHeaderValue(configuration.sender) ||
    !isSafeHeaderValue(message.subject) ||
    (message.replyTo !== undefined && !isSafeHeaderValue(message.replyTo))
  ) {
    return false;
  }

  try {
    const response = await dependencies.fetcher(RESEND_EMAILS_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${configuration.apiKey}`,
        "Content-Type": "application/json",
        "User-Agent": "bdag-community/1.0",
      },
      body: JSON.stringify({
        from: configuration.sender,
        to: [configuration.recipient],
        subject: message.subject,
        text: message.text,
        ...(message.replyTo ? { reply_to: message.replyTo } : {}),
      }),
      cache: "no-store",
      signal: dependencies.timeoutSignal(RESEND_REQUEST_TIMEOUT_MS),
    });

    return response.ok;
  } catch {
    return false;
  }
}
