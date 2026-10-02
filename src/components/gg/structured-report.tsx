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
    </div>
  );
}

function sections(report: Record<string, unknown>): Section[] {
  const text = (value: unknown) => (value === undefined || value === null || value === "" ? "UNKNOWN" : typeof value === "string" ? value : JSON.stringify(value));
  const identity = report.identity_resolution as { status?: string; parents?: { query?: string; status?: string; candidates?: { canonical_name?: string; entity_id?: string; identity_status?: string }[] }[] } | undefined;
  const profiles = report.parent_profiles as { role?: string; entity_id?: string | null; canonical_name?: string | null; identity_status?: string; conflicting_identities?: number; measurement_count?: number | null }[] | undefined;
  const pedigree = report.pedigree_analysis as { class?: string; rows?: number; genomic_percent?: null; reason?: string } | undefined;
  const traits = report.trait_architecture as { compounds?: string[]; note?: string } | undefined;
  const cannabinoids = report.cannabinoid_evidence as { compound?: string; status?: string; central_estimate?: number | null; measurement_count?: number | null }[] | undefined;
  const terpenes = report.terpene_evidence as { compound?: string; status?: string; measurement_count?: number | null }[] | undefined;
  const transmission = report.terpene_transmission as { statement?: string } | undefined;
  const history = report.historical_analogues as { status?: string; count?: number; reason?: string } | undefined;
  const patterns = report.pattern_analysis as { pattern_type?: string; support_count?: number; sample_count?: number | null; genetic_effect?: boolean; support_means?: string; sample_means?: string }[] | undefined;
  const prediction = report.predicted_progeny as { status?: string; estimates?: { compound?: string; central_estimate?: number | null; status?: string }[] } | undefined;
  const sensitivity = report.sensitivity as { impact?: string; factor?: string; reason?: string }[] | undefined;
  const uncertainty = report.uncertainty as Record<string, string> | undefined;
  const visualization = report.visualization as { status?: string; provider_class?: string | null; label?: string } | undefined;
  const provenance = report.provenance as { knowledge_snapshot?: string; model_id?: string; model_version?: string; prediction_id?: string | null } | undefined;
  const generation = report.generational_interpretation as { labels?: string[]; generation_implies_stability?: boolean } | undefined;
  const lines = (rows: string[]) => rows.filter(Boolean).join("\n") || "UNKNOWN";
  return [
    { title: "Identity", body: lines((identity?.parents ?? []).map((parent) => `${parent.query} · ${parent.status} · ${(parent.candidates ?? []).map((candidate) => `${candidate.canonical_name} ${candidate.entity_id} ${candidate.identity_status}`).join("; ") || "nessun record"}`)) },
    { title: "Parents", body: lines((profiles ?? []).map((profile) => `${profile.role}: ${profile.canonical_name ?? "non scelta"} ${profile.entity_id ?? ""} · ${profile.identity_status} · conflitti ${profile.conflicting_identities ?? 0} · misure ${profile.measurement_count ?? "assenti"}`)) },
    { title: "Pedigree", body: `${pedigree?.class ?? "UNKNOWN"} · righe ${pedigree?.rows ?? 0} · genomico ${pedigree?.genomic_percent ?? "null"}. ${pedigree?.reason ?? ""}` },
    { title: "Evidence", body: text(report.coverage) },
    { title: "Traits", body: `${(traits?.compounds ?? []).join(", ") || "nessun composto"} . ${traits?.note ?? ""}` },
    { title: "Chemotype", body: lines((cannabinoids ?? []).map((row) => `${row.compound} ${row.status} n ${row.measurement_count ?? "assente"} stima ${row.central_estimate ?? "null"}`)) },
    { title: "Terpenes", body: lines([...(terpenes ?? []).map((row) => `${row.compound} ${row.status} n ${row.measurement_count ?? "assente"}`), transmission?.statement ?? ""]) },
    { title: "Historical Crosses", body: `${history?.status ?? "NOT_AVAILABLE"} · conteggio ${history?.count ?? 0}. ${history?.reason ?? ""}` },
    { title: "Patterns", body: lines((patterns ?? []).map((pattern) => `${pattern.pattern_type} supporto ${pattern.support_count} n ${pattern.sample_count ?? "assente"}. ${pattern.support_means}. ${pattern.sample_means}. Effetto genetico: no.`)) },
    { title: "Prediction", body: `${prediction?.status ?? "NOT_COMPUTABLE"}. ${(prediction?.estimates ?? []).map((trait) => `${trait.compound} ${trait.status} ${trait.central_estimate ?? "null"}`).join("; ") || "nessuna stima"}` },
    { title: "Probabilities", body: "Nessuna probabilità computabile. prediction_probability = null." },
    { title: "Uncertainty", body: uncertainty ? Object.entries(uncertainty).map(([key, value]) => `${key}: ${value}`).join("\n") : "UNKNOWN" },
    { title: "Sensitivity", body: lines((sensitivity ?? []).map((row) => `${row.impact} ${row.factor}: ${row.reason}`)) },
    { title: "Known", body: lines(Array.isArray(report.known) ? report.known.map(String) : []) },
    { title: "Inferred", body: lines(Array.isArray(report.inferred) ? report.inferred.map(String) : []) },
    { title: "Unknown", body: lines(Array.isArray(report.unknown) ? report.unknown.map(String) : []) },
    { title: "Generation", body: generation?.labels?.length ? `${generation.labels.join(", ")}. Non implica stabilità.` : "Nessuna etichetta. Non implica stabilità." },
    { title: "Validation", body: lines(Array.isArray(report.validation_requirements) ? report.validation_requirements.map(String) : []) },
    { title: "Visualization", body: `${visualization?.label ?? "PREDICTIVE VISUALIZATION — NOT OBSERVED OFFSPRING"}. Stato ${visualization?.status ?? "NOT_REQUESTED"}${visualization?.provider_class ? ` · ${visualization.provider_class}` : ""}.` },
    { title: "Provenance", body: `Snapshot ${provenance?.knowledge_snapshot ?? "assente"}. Modello ${provenance?.model_id ?? ""} ${provenance?.model_version ?? ""}. Predizione ${provenance?.prediction_id ?? "null"}.` },
  ];
}
