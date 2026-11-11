import type { Metadata } from "next";
import { Card } from "@/components/ui/Card";
import { ConfirmDeleteButton } from "@/components/admin/ConfirmDeleteButton";
import { RespondedToggle } from "@/components/admin/RespondedToggle";
import { requireAdmin } from "@/lib/dal/session";
import { listSuggestionMessages } from "@/lib/dal/admin";
import { deleteSuggestionMessageAction, setSuggestionMessageRespondedAction } from "../actions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Suggestions · Admin",
  description: "Community Suggestion Box submissions.",
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
 * /admin/suggestions — the Suggestion Box inbox, moved out of the dashboard
 * into its own area view. Private through the same admin RLS boundary.
 */
export default async function AdminSuggestionsPage() {
  await requireAdmin();
  const suggestions = await listSuggestionMessages(INBOX_LIMIT + 1);
  const visibleSuggestions = suggestions.slice(0, INBOX_LIMIT);
  const hasOlderSuggestions = suggestions.length > INBOX_LIMIT;

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="h3 text-on-surface">Suggestion Box inbox</h1>
        <p className="text-sm text-on-surface-variant">
          What the community wants this site and network to do next.
        </p>
      </header>

      {hasOlderSuggestions ? (
        <p className="text-xs leading-relaxed text-on-surface-variant">
          Showing the 50 newest suggestions. Older suggestions are not
          shown in this view.
        </p>
      ) : null}

      {visibleSuggestions.length === 0 ? (
        <Card>
          <p className="text-sm text-on-surface-variant">
            No suggestions yet. New Suggestion Box items will appear here.
          </p>
        </Card>
      ) : (
        <div className="max-w-3xl space-y-3">
          {visibleSuggestions.map((suggestion) => (
            <Card key={suggestion.id} className="space-y-2">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-on-surface">
                    {suggestion.author_name || "Anonymous"}
                    {suggestion.reply_email ? (
                      <span className="ml-2 font-mono text-xs font-normal text-on-surface-variant">
                        {suggestion.reply_email}
                      </span>
                    ) : null}
                  </p>
                  <p className="mt-0.5 font-mono text-xs text-on-surface-variant">
                    {formatUtc(suggestion.created_at)}
                  </p>
                </div>
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <RespondedToggle
                    id={suggestion.id}
                    respondedAt={suggestion.responded_at}
                    action={setSuggestionMessageRespondedAction}
                  />
                  <ConfirmDeleteButton
                    id={suggestion.id}
                    action={deleteSuggestionMessageAction}
                    confirmPrompt="Delete this suggestion permanently?"
                  />
                </div>
              </div>
              <p className="whitespace-pre-line break-words text-sm text-on-surface-variant">
                {suggestion.suggestion}
              </p>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
