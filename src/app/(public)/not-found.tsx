import { NotFoundBody } from "@/components/site/NotFoundBody";

/**
 * 404 inside the (public) group, so it inherits the header, the footer and the
 * skip link. This is the one a stale shared link hits — /news/<retired-slug>,
 * since news/[slug] calls notFound().
 *
 * The root src/app/not-found.tsx catches everything this group never matches
 * and renders the same body with the chrome supplied by hand.
 */
export default function NotFound() {
  return <NotFoundBody />;
}
