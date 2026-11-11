import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { requireAdmin } from "@/lib/dal/session";
import {
  listAllArticles,
  listContactMessages,
  listSuggestionMessages,
} from "@/lib/dal/admin";
import { listAllProjects } from "@/lib/dal/admin-projects";
import { getServerSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Admin",
  description:
    "BDAG Community operations: articles, projects, contact messages, and suggestions.",
  // Never index an operator surface.
  robots: { index: false, follow: false },
};

/** The inbox area views cap at 50; the overview only needs to know counts. */
const OVERVIEW_INBOX_PROBE = 51;
const RECENT = 3;

/** UTC render for operator timestamps — no locale ambiguity between admins. */
const formatUtc = (iso: string): string => {
  const utc = new Date(iso).toISOString();
  return `${utc.slice(0, 10)} ${utc.slice(11, 16)} UTC`;
};

type OverviewItem = {
  id: string;
  title: string;
  href: string;
  meta: string;
  attention?: boolean;
};

type OverviewArea = {
  key: string;
  title: string;
  href: string;
  /** One line under the title: totals, split by state where states exist. */
  summary: string;
  /** Count of items waiting on an operator decision, shown as a chip. */
  attentionCount: number;
  attentionLabel: string;
  items: OverviewItem[];
  action?: { label: string; href: string };
};

/**
 * /admin — the operator overview. Each content area gets one card: what is
 * in it, what is WAITING on an operator (the number that matters), and the
 * three newest entries. The work happens in the dedicated area views behind
 * each card; this page only routes attention.
 */
export default async function AdminDashboardPage() {
  await requireAdmin();
  const supabase = await getServerSupabase();
  const [articles, projects, messages, suggestions, infrastructure, activity] = await Promise.all([
    listAllArticles(),
    listAllProjects(),
    listContactMessages(OVERVIEW_INBOX_PROBE),
    listSuggestionMessages(OVERVIEW_INBOX_PROBE),
    supabase.from("infrastructure_resources").select("id,kind,name").order("display_order"),
    supabase.from("admin_activity").select("id,actor_email,action,entity_label,occurred_at").order("occurred_at", { ascending: false }).limit(RECENT),
  ]);
  if (infrastructure.error || activity.error) throw new Error("Could not load admin overview.");

  const draftArticles = articles.filter((article) => !article.is_published);
  const pendingProjects = projects.filter((project) => !project.is_published);
  const countLabel = (length: number) =>
    length >= OVERVIEW_INBOX_PROBE ? "50+" : String(length);

  const areas: OverviewArea[] = [
    {
      key: "articles",
      title: "Articles",
      href: "/admin/articles",
      summary: `${articles.length - draftArticles.length} published, ${draftArticles.length} drafts`,
      attentionCount: draftArticles.filter(
        (article) => article.submitted_by_community,
      ).length,
      attentionLabel: "to review",
      items: articles.slice(0, RECENT).map((article) => ({
        id: article.id,
        title: article.title,
        href: `/admin/news/${article.id}`,
        meta: article.is_published
          ? formatUtc(article.published_at ?? article.created_at)
          : "Draft",
        attention: !article.is_published && article.submitted_by_community,
      })),
      action: { label: "New article", href: "/admin/news/new" },
    },
    {
      key: "projects",
      title: "Projects",
      href: "/admin/projects",
      summary: `${projects.length - pendingProjects.length} published, ${pendingProjects.length} waiting`,
      attentionCount: pendingProjects.length,
      attentionLabel: "to review",
      items: projects.slice(0, RECENT).map((project) => ({
        id: project.id,
        title: project.name,
        href: `/admin/projects/${project.id}`,
        meta: project.is_published
          ? formatUtc(project.published_at ?? project.created_at)
          : "For review",
        attention: !project.is_published,
      })),
      action: { label: "New project", href: "/admin/projects/new" },
    },
    {
      key: "infrastructure",
      title: "Community-run infrastructure",
      href: "/admin/infrastructure",
      summary: `${infrastructure.data.length} resources across RPCs, explorers, and pools`,
      attentionCount: 0,
      attentionLabel: "",
      items: infrastructure.data.slice(0, RECENT).map((resource) => ({
        id: resource.id,
        title: resource.name,
        href: "/admin/infrastructure",
        meta: resource.kind.toUpperCase(),
      })),
      action: { label: "Manage", href: "/admin/infrastructure" },
    },
    {
      key: "activity",
      title: "Admin activity",
      href: "/admin/activity",
      summary: "Recent operator changes",
      attentionCount: 0,
      attentionLabel: "",
      items: activity.data.map((entry) => ({
        id: entry.id,
        title: `${entry.actor_email} ${entry.action}: ${entry.entity_label}`,
        href: "/admin/activity",
        meta: formatUtc(entry.occurred_at),
      })),
    },
    {
      key: "inbox",
      title: "Contact inbox",
      href: "/admin/inbox",
      summary: `${countLabel(messages.length)} messages`,
      attentionCount: 0,
      attentionLabel: "",
      items: messages.slice(0, RECENT).map((message) => ({
        id: message.id,
        title: `${message.name}: ${message.message}`,
        href: "/admin/inbox",
        meta: formatUtc(message.created_at),
      })),
    },
    {
      key: "suggestions",
      title: "Suggestion Box",
      href: "/admin/suggestions",
      summary: `${countLabel(suggestions.length)} suggestions`,
      attentionCount: 0,
      attentionLabel: "",
      items: suggestions.slice(0, RECENT).map((suggestion) => ({
        id: suggestion.id,
        title: `${suggestion.author_name || "Anonymous"}: ${suggestion.suggestion}`,
        href: "/admin/suggestions",
        meta: formatUtc(suggestion.created_at),
      })),
    },
  ];

  return (
    <div className="space-y-8">
      <header className="space-y-1">
        <h1 className="h3 text-on-surface">Dashboard</h1>
        <p className="text-sm text-on-surface-variant">
          Content, infrastructure, inboxes, and recent admin changes,
          each in its own view.
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-2">
        {areas.map((area) => (
          <section
            key={area.key}
            aria-labelledby={`admin-${area.key}-heading`}
            className="flex flex-col gap-4"
          >
            <Card className="flex h-full flex-col gap-4 p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1">
                  <h2
                    id={`admin-${area.key}-heading`}
                    className="h4 text-on-surface"
                  >
                    <Link
                      href={area.href}
                      className="focus-ring inline-flex items-center gap-1.5 transition-colors hover:text-accent-soft"
                    >
                      {area.title}
                      <ArrowRight
                        className="size-4 text-on-surface-variant"
                        strokeWidth={2}
                        aria-hidden
                      />
                    </Link>
                  </h2>
                  <p className="font-mono text-xs text-on-surface-variant">
                    {area.summary}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {area.attentionCount > 0 ? (
                    <Chip className="border-warn-orange/40 bg-warn-orange/5 text-warn-orange">
                      {area.attentionCount} {area.attentionLabel}
                    </Chip>
                  ) : null}
                  {area.action ? (
                    <Button href={area.action.href} variant="ghost">
                      {area.action.label}
                    </Button>
                  ) : null}
                </div>
              </div>

              {area.items.length === 0 ? (
                <p className="text-sm text-on-surface-variant">
                  Nothing here yet.
                </p>
              ) : (
                <ul className="divide-y divide-border/60 border-t border-border/60">
                  {area.items.map((item) => (
                    <li key={item.id}>
                      <Link
                        href={item.href}
                        className="focus-ring flex items-baseline justify-between gap-3 py-2.5 transition-colors hover:text-accent-soft"
                      >
                        <span className="min-w-0 truncate text-sm text-on-surface">
                          {item.title}
                        </span>
                        <span
                          className={`shrink-0 font-mono text-xs ${
                            item.attention
                              ? "text-warn-orange"
                              : "text-on-surface-variant"
                          }`}
                        >
                          {item.meta}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </section>
        ))}
      </div>
    </div>
  );
}
