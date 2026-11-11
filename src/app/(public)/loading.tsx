import { RouteLoading } from "@/components/site/RouteLoading";
import { Section } from "@/components/ui/Section";

export default function PublicLoading() {
  return (
    <Section as="section" aria-label="Page loading">
      <RouteLoading variant="public" />
    </Section>
  );
}
