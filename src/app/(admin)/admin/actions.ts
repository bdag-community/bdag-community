"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/dal/session";
import { getServerSupabase } from "@/lib/supabase/server";

/**
 * Dashboard server actions (contact inbox). Same doctrine as the news
 * actions: requireAdmin() first, zod-validate, write through the RLS-bound
 * server client (the contact admin-delete policy exists for exactly this),
 * and honest non-leaky error strings.
 */

export type ActionFailure = { ok: false; error: string };

async function setMessageResponded(
  table: "contact_messages" | "suggestion_messages",
  path: "/admin/inbox" | "/admin/suggestions",
  id: unknown,
  responded: unknown,
): Promise<ActionFailure | void> {
  await requireAdmin();

  const parsed = z.object({ id: z.string().uuid(), responded: z.boolean() })
    .safeParse({ id, responded });
  if (!parsed.success) return { ok: false, error: "Invalid response status." };

  const supabase = await getServerSupabase();
  const { data, error } = await supabase
    .from(table)
    .update({ responded_at: parsed.data.responded ? new Date().toISOString() : null })
    .eq("id", parsed.data.id)
    .select("id")
    .maybeSingle();

  if (error || !data) {
    return { ok: false, error: "The response status could not be saved. Please try again." };
  }

  revalidatePath(path);
  revalidatePath("/admin/activity");
  revalidatePath("/admin");
}

export async function setContactMessageRespondedAction(
  id: unknown,
  responded: unknown,
): Promise<ActionFailure | void> {
  return setMessageResponded("contact_messages", "/admin/inbox", id, responded);
}

export async function setSuggestionMessageRespondedAction(
  id: unknown,
  responded: unknown,
): Promise<ActionFailure | void> {
  return setMessageResponded("suggestion_messages", "/admin/suggestions", id, responded);
}

/** Delete an inbox message; the revalidated dashboard drops the row. */
export async function deleteContactMessageAction(
  id: unknown,
): Promise<ActionFailure | void> {
  await requireAdmin();

  const parsedId = z.string().uuid().safeParse(id);
  if (!parsedId.success) return { ok: false, error: "Invalid message id." };

  const supabase = await getServerSupabase();
  const { error } = await supabase
    .from("contact_messages")
    .delete()
    .eq("id", parsedId.data);

  if (error) {
    return {
      ok: false,
      error: "The message could not be deleted. Try again, or sign out and back in.",
    };
  }

  revalidatePath("/admin");
}

/** Delete one Suggestion Box item from the private admin inbox. */
export async function deleteSuggestionMessageAction(
  id: unknown,
): Promise<ActionFailure | void> {
  await requireAdmin();

  const parsedId = z.string().uuid().safeParse(id);
  if (!parsedId.success) return { ok: false, error: "Invalid suggestion id." };

  const supabase = await getServerSupabase();
  const { error } = await supabase
    .from("suggestion_messages")
    .delete()
    .eq("id", parsedId.data);

  if (error) {
    return {
      ok: false,
      error: "The suggestion could not be deleted. Try again, or sign out and back in.",
    };
  }

  revalidatePath("/admin");
}
