"use client";

import { useActionState, useCallback, useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  Loader2,
  Mail,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { FIELD_BASE, Input, Textarea } from "@/components/ui/Input";
import {
  TurnstileWidget,
  TURNSTILE_CLIENT_CONFIGURED,
} from "@/components/security/TurnstileWidget";
import { cn } from "@/lib/utils/cn";
import {
  CONTACT_EMAIL,
  CONTACT_EMAIL_MOCK,
  CONTACT_PAGE,
} from "@/lib/content/site";
import {
  sendContactMessage,
  type ContactFormState,
  type ContactFormValues,
} from "@/app/(public)/contact/actions";

const INITIAL_STATE: ContactFormState = { ok: null, attempt: 0 };

/**
 * The four fields, in the order they appear. The summary must list errors in
 * DOM order — a list that reads bottom-to-top sends the visitor up the form
 * after it has already sent them down it.
 */
const FIELDS: readonly { key: keyof ContactFormValues; id: string }[] = [
  { key: "name", id: "contact-name" },
  { key: "email", id: "contact-email" },
  { key: "topic", id: "contact-topic" },
  { key: "message", id: "contact-message" },
];

/**
 * Contact form — useActionState against the sendContactMessage server action.
 *
 * - Validation errors come back per field; values are echoed so nothing the
 *   visitor typed is lost (React 19 resets the form, defaultValue restores it).
 * - ok:false (Supabase absent or insert failed) shows the failure note. The
 *   email fallback renders only after that inbox has been verified.
 * - ok:true swaps the form for a success panel; both outcomes announce via
 *   role="status".
 * - The hidden "website" field is a spam honeypot the action checks.
 *
 * Validation used to fail silently for anyone not looking at the form: the
 * per-field messages appeared with no live region and focus stayed on the
 * submit button, so a screen-reader user was told nothing at all and a
 * keyboard user was left at the bottom of a form that had not sent. The
 * summary below fixes both — it announces (role="alert"), it takes focus on
 * every failing submission, and each line is a link straight to the field it
 * is about.
 */
export function ContactForm() {
  const [state, formAction, pending] = useActionState(
    sendContactMessage,
    INITIAL_STATE,
  );

  const errors = FIELDS.flatMap((field) => {
    const message = state.fieldErrors?.[field.key];
    return message ? [{ ...field, message }] : [];
  });
  const summaryErrors = state.formError
    ? [...errors, { key: "verification", id: "contact-verification", message: state.formError }]
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
    // Keyed on the attempt count, not on the errors: submitting the same
    // mistake twice produces two identical states, and focus has to move both
    // times. The ref is null whenever there is no summary rendered, so a clean
    // first paint and a successful send are both no-ops.
    summaryRef.current?.focus();
  }, [state.attempt]);

  useEffect(() => {
    // Success replaces the focused submit button with a new panel. Move focus
    // with that state change so keyboard and screen-reader users stay at the
    // result instead of falling back to the document body.
    if (state.ok === true) successRef.current?.focus();
  }, [state.ok]);

  useEffect(() => {
    // A storage failure keeps the form mounted but removes the browser's
    // focused submit button during the server-action transition. Put focus on
    // the result, including when a visitor retries and receives the same
    // outcome again.
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
          {CONTACT_PAGE.form.success}
        </p>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-5">
      {/* Honeypot — never visible, never focusable; the action drops any
          submission that fills it. */}
      <div className="hidden" aria-hidden>
        <label htmlFor="contact-website">Website</label>
        <input
          id="contact-website"
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
          // Focusable only as a target: -1 keeps it out of the tab order, so
          // it is never something to tab past once it has been read.
          tabIndex={-1}
          className="focus-ring flex items-start gap-3 rounded-xl border border-error/50 bg-error/5 p-4"
        >
          <AlertCircle
            className="size-4 shrink-0 translate-y-0.5 text-error"
            strokeWidth={2}
            aria-hidden
          />
          {/* No heading sentence above the list: every message the schema
              returns already names its own field ("Please tell us your name"),
              and site.ts owns the site's prose. If a summary line is ever
              added there, it goes in here as a <p> above this <ul>. */}
          <ul className="flex flex-col gap-1.5">
            {summaryErrors.map((error) => (
              <li key={error.key}>
                {/* An in-page link to a focusable field moves focus to it, so
                    this is the whole "take me to the problem" affordance —
                    no click handler, and it works before hydration. */}
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
          htmlFor="contact-name"
          className="text-sm font-medium text-on-surface"
        >
          {CONTACT_PAGE.form.nameLabel}
        </label>
        <Input
          id="contact-name"
          name="name"
          required
          autoComplete="name"
          defaultValue={state.values?.name}
          aria-invalid={state.fieldErrors?.name ? true : undefined}
          aria-describedby={
            state.fieldErrors?.name ? "contact-name-error" : undefined
          }
        />
        {state.fieldErrors?.name ? (
          <p id="contact-name-error" className="text-sm text-error">
            {state.fieldErrors.name}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-2">
        <label
          htmlFor="contact-email"
          className="text-sm font-medium text-on-surface"
        >
          {CONTACT_PAGE.form.emailLabel}
        </label>
        <Input
          id="contact-email"
          type="email"
          name="email"
          required
          autoComplete="email"
          defaultValue={state.values?.email}
          aria-invalid={state.fieldErrors?.email ? true : undefined}
          aria-describedby={
            state.fieldErrors?.email ? "contact-email-error" : undefined
          }
        />
        {state.fieldErrors?.email ? (
          <p id="contact-email-error" className="text-sm text-error">
            {state.fieldErrors.email}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-2">
        <label
          htmlFor="contact-topic"
          className="text-sm font-medium text-on-surface"
        >
          {CONTACT_PAGE.form.topicLabel}
        </label>
        {/* Styled like Input (FIELD_BASE) — no Select exists in ui/ yet. */}
        <div className="relative">
          <select
            id="contact-topic"
            name="topic"
            required
            defaultValue={state.values?.topic ?? CONTACT_PAGE.form.topics[0]}
            className={cn(FIELD_BASE, "appearance-none pr-10")}
            aria-invalid={state.fieldErrors?.topic ? true : undefined}
            aria-describedby={
              state.fieldErrors?.topic ? "contact-topic-error" : undefined
            }
          >
            {CONTACT_PAGE.form.topics.map((topic) => (
              <option key={topic} value={topic}>
                {topic}
              </option>
            ))}
          </select>
          <ChevronDown
            className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-on-surface-variant"
            strokeWidth={2}
            aria-hidden
          />
        </div>
        {state.fieldErrors?.topic ? (
          <p id="contact-topic-error" className="text-sm text-error">
            {state.fieldErrors.topic}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-2">
        <label
          htmlFor="contact-message"
          className="text-sm font-medium text-on-surface"
        >
          {CONTACT_PAGE.form.messageLabel}
        </label>
        <Textarea
          id="contact-message"
          name="message"
          rows={6}
          required
          minLength={10}
          maxLength={4000}
          defaultValue={state.values?.message}
          aria-invalid={state.fieldErrors?.message ? true : undefined}
          aria-describedby={
            state.fieldErrors?.message ? "contact-message-error" : undefined
          }
        />
        {state.fieldErrors?.message ? (
          <p id="contact-message-error" className="text-sm text-error">
            {state.fieldErrors.message}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-1.5 border-l-2 border-warn-orange/60 pl-3">
        <p className="text-sm font-medium text-on-surface">
          {CONTACT_PAGE.form.safety}
        </p>
        <p className="text-xs leading-relaxed text-on-surface-variant">
          {CONTACT_PAGE.form.privacy}
        </p>
      </div>

      <TurnstileWidget
        id="contact-verification"
        action="contact_message"
        attempt={state.attempt}
        onVerifiedChange={handleVerifiedChange}
      />

      <div role="status">
        {state.ok === false ? (
          <div
            ref={failureRef}
            tabIndex={-1}
            className="focus-ring flex flex-col gap-2 rounded-xl border border-warn-orange/60 bg-warn-orange/5 p-4"
          >
            <p className="text-sm leading-relaxed text-on-surface">
              {CONTACT_PAGE.form.failure}
            </p>
            {!CONTACT_EMAIL_MOCK ? (
              <a
                href={`mailto:${CONTACT_EMAIL}`}
                className="focus-ring inline-flex min-h-[44px] w-fit items-center gap-2 py-2 text-sm text-on-surface-variant transition-colors hover:text-accent-soft"
              >
                <Mail
                  className="size-4 text-accent-soft"
                  strokeWidth={1.75}
                  aria-hidden
                />
                {CONTACT_EMAIL}
              </a>
            ) : null}
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
        {CONTACT_PAGE.form.submitLabel}
      </Button>
    </form>
  );
}
