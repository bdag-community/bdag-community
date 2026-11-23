import { Header } from "@/components/site/Header";
import { Footer } from "@/components/site/Footer";
import { ScrollReset } from "@/components/site/ScrollReset";
import { NodeStatusProvider } from "@/components/chain/NodeStatusProvider";

/**
 * Public-site chrome: skip link, sticky header, page content, footer.
 * The admin route group carries its own minimal chrome.
 *
 * <main> is wrapped in a bare `relative` box so the DAG spine can span the
 * page's full height behind it. That wrapper must stay bare: adding isolate,
 * transform, filter, contain or overflow would create a stacking context and
 * trap the spine's z-index:-1 above the ambient wash. The spine itself is now
 * mounted by the home page, which is the only route that draws it — but the
 * wrapper stays `relative` here because that is what `.spine { inset: 0 }`
 * resolves against.
 *
 */
export default function PublicLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <NodeStatusProvider>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded-full focus:bg-gradient-accent focus:px-5 focus:py-2.5 focus:text-sm focus:font-semibold focus:text-on-primary"
      >
        Skip to content
      </a>
      <Header />
      {/* Renders null, so it sits outside the spine's wrapper: that wrapper's
          only job is to be the containing block for `.spine { inset: 0 }`, and
          nothing that is not the spine belongs inside it.
          <main> carries tabIndex={-1} so the skip link actually moves focus.
          Safari (and older WebKit) will scroll to a non-focusable #main but
          leave focus on the link, so the next Tab returns to the header
          instead of entering the content the user just asked for. */}
      <ScrollReset />
      <div className="relative">
        <main
          id="main"
          tabIndex={-1}
          className="flex min-h-[60vh] flex-col gap-20 pb-4 pt-10 sm:gap-24"
        >
          {children}
        </main>
      </div>
      <Footer />
    </NodeStatusProvider>
  );
}
