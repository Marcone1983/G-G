type Section = { title: string; body: string };

export function StructuredReportView({ report }: { report: Record<string, unknown> }) {
  return (
    <div className="mt-3 grid gap-3">
      {sections(report).map((section) => (
        <section key={section.title} className="rounded-lg border border-border bg-bg px-3 py-3">
          <h3 className="text-xs font-medium uppercase tracking-wide text-primary">{section.title}</h3>
          <p className="mt-1 whitespace-pre-wrap text-sm">{section.body}</p>
        </section>
      ))}
      <p className="text-xs text-muted">PREDICTIVE VISUALIZATION — NOT OBSERVED OFFSPRING</p>
    </div>
  );
}

function sections(report: Record<string, unknown>): Section[] {
  const identity = report.identity_resolution as { status?: string; parents?: { query?: string; candidates?: { canonical_name?: string; entity_id?: string }[] }[] } | undefined;
  const generation = report.generational_interpretation as { labels?: string[]; generation_implies_stability?: boolean } | undefined;
  const patterns = report.pattern_analysis as { pattern_type?: string; support_count?: number; sample_count?: number | null; genetic_effect?: boolean }[] | undefined;
  const provenance = report.provenance as { knowledge_snapshot?: string; model_version?: string } | undefined;
  const visualization = report.visualization as { status?: string; provider_class?: string | null } | undefined;
  const known = Array.isArray(report.known) ? report.known.map(String) : [];
  const inferred = Array.isArray(report.inferred) ? report.inferred.map(String) : [];
  const unknown = Array.isArray(report.unknown) ? report.unknown.map(String) : [];
  return [
    { title: "Identity", body: identity?.parents?.map((parent) => `${parent.query}: ${(parent.candidates ?? []).map((candidate) => `${candidate.canonical_name} ${candidate.entity_id}`).join("; ") || "nessun record"}`).join("\n") || "nessun record" },
    { title: "Generation", body: generation?.labels?.length ? `${generation.labels.join(", ")}. Stabilità: ${generation.generation_implies_stability ? "sì" : "no"}.` : "Nessuna etichetta. Non implica stabilità." },
    { title: "Patterns", body: patterns?.length ? patterns.slice(0, 6).map((pattern) => `${pattern.pattern_type} supporto ${pattern.support_count} n ${pattern.sample_count ?? "assente"} effetto genetico ${pattern.genetic_effect ? "sì" : "no"}`).join("\n") : "Nessun pattern con supporto almeno 2." },
    { title: "Known", body: known.join("\n") || "Nessun dato letto." },
    { title: "Inferred", body: inferred.join("\n") || "Nessuna inferenza." },
    { title: "Unknown", body: unknown.join("\n") || "Niente di sconosciuto dichiarato." },
    { title: "Probabilities", body: "Nessuna probabilità computabile. prediction_probability = null." },
    { title: "Visualization", body: `${visualization?.status ?? "NOT_REQUESTED"}${visualization?.provider_class ? ` · ${visualization.provider_class}` : ""}. Non è una foto di progenie.` },
    { title: "Provenance", body: `Snapshot ${provenance?.knowledge_snapshot ?? "assente"}. Modello ${provenance?.model_version ?? "assente"}.` },
  ];
}
