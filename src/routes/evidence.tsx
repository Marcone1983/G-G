import { createFileRoute } from "@tanstack/react-router";
import { Shell } from "@/components/gg/shell";
import { getEvidence } from "@/lib/gg/fns";

export const Route = createFileRoute("/evidence")({
  loader: () => getEvidence(),
  component: EvidencePage,
});

function EvidencePage() {
  const data = Route.useLoaderData();
  const health = data.health as {
    records?: { id?: string; subject_name?: string; attribution?: string; evidence_class?: string; effect_domain?: string; outcome?: string | null }[];
    statements?: { strain_specific?: string | null; compound_or_chemotype_only?: string | null; insufficient?: string | null };
  } | null;
  return (
    <Shell>
      <h1 className="font-display text-4xl">Evidenze</h1>
      <p className="mt-2 max-w-2xl text-sm text-muted">{data.note}</p>
      <ul className="mt-6 space-y-3">
        {data.sources.map((source) => (
          <li key={source.id} className="rounded-lg border border-border bg-surface p-4">
            <p className="font-medium">{source.name}</p>
            <p className="text-xs text-muted">
              Tier {source.tier} · {source.legal_usage_status}
            </p>
            {source.url ? (
              <a className="mt-2 block text-sm text-primary" href={source.url}>
                {source.url}
              </a>
            ) : null}
          </li>
        ))}
      </ul>
      <h2 className="mt-8 font-display text-2xl">Evidenza sanitaria</h2>
      <p className="mt-2 max-w-3xl text-sm text-muted">
        {health?.statements?.strain_specific ??
          health?.statements?.compound_or_chemotype_only ??
          health?.statements?.insufficient ??
          "Evidenza sanitaria non disponibile. L'assenza di righe non dimostra assenza di effetto."}
      </p>
      <ul className="mt-3 space-y-3">
        {(health?.records ?? []).map((record) => (
          <li key={record.id} className="rounded-lg border border-border p-4 text-sm">
            <p className="font-medium">{record.subject_name}</p>
            <p className="mt-1 text-xs text-muted">
              {record.attribution} · {record.evidence_class} · {record.effect_domain}
            </p>
            <p className="mt-2">{record.outcome ?? "Outcome non riportato."}</p>
          </li>
        ))}
      </ul>
      <h2 className="mt-8 font-display text-2xl">Associazioni, non causalità automatica</h2>
      <ul className="mt-3 space-y-3">
        {data.genetics.map((gene) => (
          <li key={gene.id} className="rounded-lg border border-border p-4 text-sm">
            <p className="font-medium">{gene.marker_or_gene}</p>
            <p className="mt-2">{gene.effect}</p>
            <p className="mt-2 text-xs text-muted">{gene.population}</p>
          </li>
        ))}
      </ul>
      <h2 className="mt-8 font-display text-2xl">Fonti escluse</h2>
      <ul className="mt-3 space-y-2 text-sm text-muted">
        {data.excluded_sources.map((source) => (
          <li key={source.name}>
            {source.name}: {source.reason}
          </li>
        ))}
      </ul>
    </Shell>
  );
}
