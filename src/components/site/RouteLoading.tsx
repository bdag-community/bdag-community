import { ROUTE_STATES } from "@/lib/content/site";

export type RouteLoadingProps = {
  variant: "public" | "admin";
};

/**
 * A reserved, low-motion page silhouette. The visible blocks prevent a route
 * transition from looking frozen; the stable status text is the only part
 * exposed to assistive technology.
 */
export function RouteLoading({ variant }: RouteLoadingProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className="w-full max-w-3xl"
    >
      <span className="sr-only">{ROUTE_STATES[variant].loading}</span>
      <div
        aria-hidden
        className="flex animate-pulse flex-col gap-5 motion-reduce:animate-none"
      >
        <div className="h-3 w-28 rounded-full bg-accent/20" />
        <div className="h-10 w-full max-w-xl rounded-xl bg-elevated" />
        <div className="flex flex-col gap-3">
          <div className="h-4 w-full rounded-full bg-container" />
          <div className="h-4 w-5/6 rounded-full bg-container" />
          <div className="h-4 w-2/3 rounded-full bg-container" />
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="h-32 rounded-2xl border border-border/60 bg-container/50" />
          <div className="h-32 rounded-2xl border border-border/60 bg-container/50" />
        </div>
      </div>
    </div>
  );
}
