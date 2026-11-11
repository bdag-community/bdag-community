import type { Metadata } from "next";
import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ConfirmDeleteButton } from "@/components/admin/ConfirmDeleteButton";
import { RespondedToggle } from "@/components/admin/RespondedToggle";
import { FIELD_BASE } from "@/components/ui/Input";
import { requireAdmin } from "@/lib/dal/session";
import { listContactMessages } from "@/lib/dal/admin";
import { resolveContactTopic } from "@/lib/contact/resolve-topic";
import { CONTACT_PAGE } from "@/lib/content/site";
import { cn } from "@/lib/utils/cn";
import { deleteContactMessageAction, setContactMessageRespondedAction } from "../actions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Contact inbox · Admin",
  description: "Messages from the public contact form.",
  // Never index an operator surface.
  robots: { index: false, follow: false },
};

const INBOX_LIMIT = 50;

/** UTC render for operator timestamps — no locale ambiguity between admins. */
const formatUtc = (iso: string): string => {
  const utc = new Date(iso).toISOString();
  return `${utc.slice(0, 10)} ${utc.slice(11, 16)} UTC`;
};

/**
 * /admin/inbox — the contact inbox, moved out of the dashboard into its own
 * area view. Fetches one row beyond the limit so the overflow disclosure is
 * driven by evidence rather than a guess. RLS lets only admins read this.
 */
export default async function AdminInboxPage({
  searchParams,
}: {
  searchParams: Promise<{ topic?: string | string[] }>;
}) {
  await requireAdmin();
  const topic = resolveContactTopic((await searchParams).topic);
  const messages = await listContactMessages(INBOX_LIMIT + 1, topic);
  const visibleMessages = messages.slice(0, INBOX_LIMIT);
  const hasOlderMessages = messages.length > INBOX_LIMIT;

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="h3 text-on-surface">Contact inbox</h1>
        <p className="text-sm text-on-surface-variant">
          Messages from the public contact form, newest first.
        </p>
      </header>

      <form
        action="/admin/inbox"
        method="get"
        className="flex flex-wrap items-end gap-3"
      >
        <div className="w-full space-y-1.5 sm:w-72">
          <label
            htmlFor="inbox-topic"
            className="block text-sm font-medium text-on-surface"
          >
            Filter by topic
          </label>
          <div className="relative">
            <select
              id="inbox-topic"
              name="topic"
              defaultValue={topic ?? ""}
              className={cn(FIELD_BASE, "appearance-none pr-10")}
            >
              <option value="">All topics</option>
              {CONTACT_PAGE.form.topics.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
            <ChevronDown
              className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-on-surface-variant"
              strokeWidth={2}
              aria-hidden
            />
          </div>
        </div>
        <Button type="submit" variant="ghost">
          Apply filter
        </Button>
        {topic ? (
          <Link
            href="/admin/inbox"
            className="focus-ring inline-flex min-h-[44px] items-center text-sm text-accent-soft underline underline-offset-4"
          >
            Clear filter
          </Link>
        ) : null}
      </form>

      {hasOlderMessages ? (
        <p className="text-xs leading-relaxed text-on-surface-variant">
          Showing the 50 newest messages{topic ? ` for ${topic}` : ""}. Older
          messages are not shown in this view.
        </p>
      ) : null}

      {visibleMessages.length === 0 ? (
        <Card>
          <p className="text-sm text-on-surface-variant">
            {topic
              ? `No ${topic} messages yet.`
              : "No messages. The contact form on the public site lands here."}
          </p>
        </Card>
      ) : (
        <div className="max-w-3xl space-y-3">
          {visibleMessages.map((message) => (
            <Card key={message.id} className="space-y-2">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-on-surface">
                    {message.name}
                    <span className="ml-2 font-mono text-xs font-normal text-on-surface-variant">
                      {message.email}
                    </span>
                  </p>
                  <p className="mt-0.5 flex flex-wrap gap-x-3 font-mono text-xs text-on-surface-variant">
                    <span className="uppercase tracking-[0.18em]">
                      {message.topic}
                    </span>
                    <span>{formatUtc(message.created_at)}</span>
                  </p>
                </div>
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <RespondedToggle
                    id={message.id}
                    respondedAt={message.responded_at}
                    action={setContactMessageRespondedAction}
                  />
                  <ConfirmDeleteButton
                    id={message.id}
                    action={deleteContactMessageAction}
                    confirmPrompt="Delete this message permanently?"
                  />
                </div>
              </div>
              <p className="whitespace-pre-line break-words text-sm text-on-surface-variant">
                {message.message}
              </p>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
