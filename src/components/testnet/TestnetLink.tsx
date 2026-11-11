import { ArrowUpRight, FlaskConical } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { TESTNET } from "@/lib/content/site";

export function TestnetLink({ headingLevel = 3 }: { headingLevel?: 2 | 3 }) {
  const Heading = headingLevel === 2 ? "h2" : "h3";
  return (
    <aside aria-label={TESTNET.link.title} className="flex flex-col gap-5 rounded-2xl border border-accent/25 bg-accent/5 p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8">
      <div className="flex min-w-0 gap-4">
        <FlaskConical className="mt-1 size-6 shrink-0 text-accent-soft" aria-hidden />
        <div><Heading className="h4">{TESTNET.link.title}</Heading><p className="body-sm mt-2 max-w-[60ch]">{TESTNET.link.body}</p></div>
      </div>
      <Button href={TESTNET.link.href} variant="ghost" className="shrink-0 self-start sm:self-center" trailingIcon={<ArrowUpRight className="size-4" aria-hidden />}>{TESTNET.link.cta}</Button>
    </aside>
  );
}
