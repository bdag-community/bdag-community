"use client";

import Script from "next/script";
import { useCallback, useEffect, useRef, useState } from "react";
import { ABUSE_PROTECTION_COPY } from "@/lib/content/site";
import type { PublicSubmissionAction } from "@/lib/abuse/protection";

const SCRIPT_ID = "cloudflare-turnstile";
const SCRIPT_URL =
  "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "";

export const TURNSTILE_CLIENT_CONFIGURED = SITE_KEY.length > 0;

type TurnstileApi = {
  render: (
    container: HTMLElement,
    options: {
      sitekey: string;
      action: PublicSubmissionAction;
      theme: "dark";
      size: "flexible" | "compact";
      appearance: "always";
      retry: "auto";
      "refresh-expired": "auto";
      "response-field": true;
      "response-field-name": "cf-turnstile-response";
      callback: () => void;
      "expired-callback": () => void;
      "error-callback": () => void;
    },
  ) => string;
  reset: (widgetId: string) => void;
  remove: (widgetId: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

type TurnstileWidgetProps = {
  action: PublicSubmissionAction;
  attempt: number;
  id: string;
  onVerifiedChange: (verified: boolean) => void;
};

export function TurnstileWidget({
  action,
  attempt,
  id,
  onVerifiedChange,
}: TurnstileWidgetProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const previousAttemptRef = useRef(attempt);
  const [scriptReady, setScriptReady] = useState(false);
  const [clientMessage, setClientMessage] = useState<string | null>(null);

  const renderWidget = useCallback(() => {
    const container = containerRef.current;
    const api = window.turnstile;
    if (!SITE_KEY || !container || !api || widgetIdRef.current) return;

    const size = container.getBoundingClientRect().width < 300
      ? "compact"
      : "flexible";
    try {
      widgetIdRef.current = api.render(container, {
        sitekey: SITE_KEY,
        action,
        theme: "dark",
        size,
        appearance: "always",
        retry: "auto",
        "refresh-expired": "auto",
        "response-field": true,
        "response-field-name": "cf-turnstile-response",
        callback: () => {
          setClientMessage(null);
          onVerifiedChange(true);
        },
        "expired-callback": () => {
          onVerifiedChange(false);
          setClientMessage(ABUSE_PROTECTION_COPY.expired);
        },
        "error-callback": () => {
          onVerifiedChange(false);
          setClientMessage(ABUSE_PROTECTION_COPY.unavailable);
        },
      });
    } catch {
      onVerifiedChange(false);
      queueMicrotask(() =>
        setClientMessage(ABUSE_PROTECTION_COPY.unavailable),
      );
    }
  }, [action, onVerifiedChange]);

  useEffect(() => {
    if (scriptReady) renderWidget();
  }, [renderWidget, scriptReady]);

  useEffect(() => {
    if (previousAttemptRef.current === attempt) return;
    previousAttemptRef.current = attempt;
    onVerifiedChange(false);
    queueMicrotask(() => setClientMessage(null));
    try {
      if (widgetIdRef.current && window.turnstile) {
        window.turnstile.reset(widgetIdRef.current);
      }
    } catch {
      queueMicrotask(() =>
        setClientMessage(ABUSE_PROTECTION_COPY.unavailable),
      );
    }
  }, [attempt, onVerifiedChange]);

  useEffect(
    () => () => {
      try {
        if (widgetIdRef.current && window.turnstile) {
          window.turnstile.remove(widgetIdRef.current);
        }
      } finally {
        widgetIdRef.current = null;
      }
    },
    [],
  );

  return (
    <div id={id} tabIndex={-1} className="focus-ring flex flex-col gap-2">
      <p className="text-sm font-medium text-on-surface">
        {ABUSE_PROTECTION_COPY.label}
      </p>
      {TURNSTILE_CLIENT_CONFIGURED ? (
        <>
          <Script
            id={SCRIPT_ID}
            src={SCRIPT_URL}
            strategy="afterInteractive"
            onReady={() => setScriptReady(true)}
            onError={() => {
              onVerifiedChange(false);
              setClientMessage(ABUSE_PROTECTION_COPY.unavailable);
            }}
          />
          <div ref={containerRef} className="min-h-[65px] w-full" />
        </>
      ) : (
        <p className="text-sm leading-relaxed text-error" role="alert">
          {ABUSE_PROTECTION_COPY.unavailable}
        </p>
      )}
      <noscript>
        <p className="text-sm leading-relaxed text-error">
          {ABUSE_PROTECTION_COPY.javascriptRequired}
        </p>
      </noscript>
      <div aria-live="polite">
        {clientMessage ? (
          <p className="text-sm leading-relaxed text-error">{clientMessage}</p>
        ) : null}
      </div>
      <p className="text-xs leading-relaxed text-on-surface-variant">
        {ABUSE_PROTECTION_COPY.privacy}{" "}
        <a
          href={ABUSE_PROTECTION_COPY.privacyUrl}
          className="focus-ring underline decoration-current/40 underline-offset-4 hover:decoration-current"
        >
          {ABUSE_PROTECTION_COPY.privacyLinkLabel}
        </a>{" "}
        {ABUSE_PROTECTION_COPY.retention}
      </p>
    </div>
  );
}
