import { CONTACT_PAGE } from "../content/site.ts";

export type ContactTopic = (typeof CONTACT_PAGE.form.topics)[number];

/** Accept only one current contact topic as an inbox filter. */
export function resolveContactTopic(value: unknown): ContactTopic | undefined {
  if (typeof value !== "string") return undefined;
  return CONTACT_PAGE.form.topics.find((topic) => topic === value);
}
