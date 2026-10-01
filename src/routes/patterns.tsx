import { createFileRoute } from "@tanstack/react-router";
import { Shell } from "@/components/gg/shell";
import { getPatterns } from "@/lib/gg/fns";

export const Route = createFileRoute("/patterns")({
  loader: () => getPatterns(),
  component: PatternsPage,
});

function PatternsPage() {
  const data = Route.useLoaderData();
  return (
    <Shell>
      <h1 className="font-display text-4xl">Pattern</h1>
      <p className="mt-2 max-w-2xl text-sm text-muted">{data.rule}</p>
      <ul className="mt-6 space-y-3">
        {data.patterns.map((pattern) => (
          <li key={pattern.id} className="rounded-lg border border-border bg-surface p-4">
            <p className="text-xs text-primary">
              {pattern.pattern_type} · {pattern.validation_status}
            </p>
            <p className="mt-2">{pattern.hypothesis}</p>
            <p className="mt-2 text-xs text-muted">
              Contesto: {pattern.native_context}. Trasferibilità: {pattern.transferability}.
            </p>
          </li>
        ))}
      </ul>
    </Shell>
  );
}
