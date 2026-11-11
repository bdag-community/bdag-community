"use client";

import { useActionState, useCallback, useEffect, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { submitSuggestion, type SuggestionState, type SuggestionValues } from "@/app/(public)/community/actions";
import { Button } from "@/components/ui/Button";
import { Input, Textarea } from "@/components/ui/Input";
import {
  TurnstileWidget,
  TURNSTILE_CLIENT_CONFIGURED,
} from "@/components/security/TurnstileWidget";
import { COMMUNITY_PAGE } from "@/lib/content/site";

const INITIAL_STATE: SuggestionState = { ok: null, attempt: 0 };

const FIELDS: readonly { key: keyof SuggestionValues; id: string }[] = [
  { key: "authorName", id: "suggestion-author-name" },
  { key: "replyEmail", id: "suggestion-reply-email" },
  { key: "suggestion", id: "suggestion-message" },
];

const copy = COMMUNITY_PAGE.suggestionBox;

export function SuggestionForm() {
  const [state, formAction, pending] = useActionState(
    submitSuggestion,
    INITIAL_STATE,
  );
  const errors = FIELDS.flatMap((field) => {
    const message = state.fieldErrors?.[field.key];
    return message ? [{ ...field, message }] : [];
  });
  const summaryErrors = state.formError
    ? [...errors, { key: "verification", id: "suggestion-verification", message: state.formError }]
    : errors;

  const summaryRef = useRef<HTMLDivElement>(null);
  const successRef = useRef<HTMLDivElement>(null);
  const failureRef = useRef<HTMLDivElement>(null);
  const [humanVerified, setHumanVerified] = useState(false);
  const handleVerifiedChange = useCallback(
    (verified: boolean) => setHumanVerified(verified),
    [],
  );

  useEffect(() => {
    summaryRef.current?.focus();
  }, [state.attempt]);

  useEffect(() => {
    if (state.ok === true) successRef.current?.focus();
  }, [state.ok]);

  useEffect(() => {
    if (state.ok === false) failureRef.current?.focus();
  }, [state.ok, state.attempt]);

  if (state.ok === true) {
    return (
      <div
        ref={successRef}
        role="status"
        tabIndex={-1}
        className="focus-ring flex items-start gap-3 rounded-xl border border-success/40 bg-success/10 p-4"
      >
        <CheckCircle2
          className="size-5 shrink-0 translate-y-0.5 text-success"
          strokeWidth={1.75}
          aria-hidden
        />
        <p className="text-sm leading-relaxed text-on-surface">
          {copy.success}
        </p>
      </div>
    );
  }

  return (
    <form
      action={formAction}
      aria-labelledby="suggestions-heading"
      className="flex flex-col gap-5"
      noValidate
    >
      <div className="hidden" aria-hidden>
        <label htmlFor="suggestion-website">{copy.honeypotLabel}</label>
        <input
          id="suggestion-website"
          type="text"
          name="website"
          tabIndex={-1}
          autoComplete="off"
        />
      </div>

      {summaryErrors.length > 0 ? (
        <div
          ref={summaryRef}
          role="alert"
          tabIndex={-1}
          className="focus-ring flex items-start gap-3 rounded-xl border border-error/50 bg-error/5 p-4"
        >
          <AlertCircle
            className="size-4 shrink-0 translate-y-0.5 text-error"
            strokeWidth={2}
            aria-hidden
          />
          <ul className="flex flex-col gap-1.5">
            {summaryErrors.map((error) => (
              <li key={error.key}>
                <a
                  href={`#${error.id}`}
                  className="focus-ring text-sm text-error underline decoration-error/40 underline-offset-4 transition-colors hover:decoration-error"
                >
                  {error.message}
                </a>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="flex flex-col gap-2">
        <label
          htmlFor="suggestion-author-name"
          className="text-sm font-medium text-on-surface"
        >
          {copy.authorNameLabel}{" "}
          <span className="text-xs text-on-surface-variant">
            ({copy.optional})
          </span>
        </label>
        <Input
          id="suggestion-author-name"
          name="authorName"
          maxLength={120}
          autoComplete="name"
          defaultValue={state.values?.authorName}
          aria-invalid={state.fieldErrors?.authorName ? true : undefined}
          aria-describedby={
            state.fieldErrors?.authorName
              ? "suggestion-author-name-error"
              : undefined
          }
        />
        {state.fieldErrors?.authorName ? (
          <p id="suggestion-author-name-error" className="text-sm text-error">
            {state.fieldErrors.authorName}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-2">
        <label
          htmlFor="suggestion-reply-email"
          className="text-sm font-medium text-on-surface"
        >
          {copy.replyEmailLabel}{" "}
          <span className="text-xs text-on-surface-variant">
            ({copy.optional})
          </span>
        </label>
        <Input
          id="suggestion-reply-email"
          type="email"
          name="replyEmail"
          maxLength={320}
          autoComplete="email"
          defaultValue={state.values?.replyEmail}
          aria-invalid={state.fieldErrors?.replyEmail ? true : undefined}
          aria-describedby={
            state.fieldErrors?.replyEmail
              ? "suggestion-reply-email-error"
              : undefined
          }
        />
        {state.fieldErrors?.replyEmail ? (
          <p id="suggestion-reply-email-error" className="text-sm text-error">
            {state.fieldErrors.replyEmail}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-2">
        <label
          htmlFor="suggestion-message"
          className="text-sm font-medium text-on-surface"
        >
          {copy.suggestionLabel}
        </label>
        <Textarea
          id="suggestion-message"
          name="suggestion"
          rows={8}
          required
          minLength={10}
          maxLength={4000}
          defaultValue={state.values?.suggestion}
          aria-invalid={state.fieldErrors?.suggestion ? true : undefined}
          aria-describedby={
            state.fieldErrors?.suggestion
              ? "suggestion-message-help suggestion-message-error"
              : "suggestion-message-help"
          }
        />
        <p
          id="suggestion-message-help"
          className="text-xs leading-relaxed text-on-surface-variant"
        >
          {copy.suggestionHint}
        </p>
        {state.fieldErrors?.suggestion ? (
          <p id="suggestion-message-error" className="text-sm text-error">
            {state.fieldErrors.suggestion}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-1.5 border-l-2 border-warn-orange/60 pl-3">
        <p className="text-sm font-medium text-on-surface">{copy.safety}</p>
        <p className="text-xs leading-relaxed text-on-surface-variant">
          {copy.privacy}
        </p>
      </div>

      <TurnstileWidget
        id="suggestion-verification"
        action="submit_suggestion"
        attempt={state.attempt}
        onVerifiedChange={handleVerifiedChange}
      />

      <div role="status">
        {state.ok === false ? (
          <div
            ref={failureRef}
            tabIndex={-1}
            className="focus-ring rounded-xl border border-warn-orange/60 bg-warn-orange/5 p-4"
          >
            <p className="text-sm leading-relaxed text-on-surface">
              {copy.failure}
            </p>
          </div>
        ) : null}
      </div>

      <Button
        type="submit"
        disabled={pending || !TURNSTILE_CLIENT_CONFIGURED || !humanVerified}
        aria-busy={pending || undefined}
        className="w-fit"
        leadingIcon={
          pending ? (
            <Loader2
              className="size-4 animate-spin motion-reduce:animate-none"
              strokeWidth={2}
              aria-hidden
            />
          ) : undefined
        }
      >
        {copy.submitLabel}
      </Button>
    </form>
  );
}
