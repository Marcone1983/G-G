export type ReportShape = {
  status: string;
  model_version: string;
  knowledge_snapshot: string;
  cache_status: string;
  human_report: string;
  pedigree_confidence: { value: number | null; formula: string };
  chemotype: { percentage_status: string; reason: string };
  pigmentation: { single_locus_black: boolean; statement: string };
  stability: { generation_implies_stability: boolean; observed_stability_evidence: string };
  limitations: string[];
  evidence: { title: string; role: string; why: string }[];
  reproducibility: { seed: number; replicates: number; prng: string };
  sections?: { heading: string; lines: string[] }[];
};

export function ReportView({ report }: { report: ReportShape }) {
  return (
    <article className="rounded-lg bg-paper p-5 text-paper-ink">
      <p className="text-xs font-medium tracking-wide text-accent">
        {report.status} · cache {report.cache_status}
      </p>
      <h2 className="mt-2 font-display text-3xl">Rapporto</h2>
      <p className="mt-3 text-sm">
        Modello {report.model_version} · snapshot {report.knowledge_snapshot}
      </p>
      <dl className="mt-4 grid gap-3 sm:grid-cols-2">
        <div>
          <dt className="text-xs uppercase tracking-wide">Confidenza di pedigree</dt>
          <dd className="tabular-nums text-lg">
            {report.pedigree_confidence.value === null ? "non calcolata" : report.pedigree_confidence.value}
          </dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide">Chimica</dt>
          <dd>{report.chemotype.percentage_status}</dd>
        </div>
      </dl>
      <p className="mt-3 text-sm">{report.pedigree_confidence.formula}</p>
      <p className="mt-3 text-sm">{report.chemotype.reason}</p>
      <p className="mt-3 text-sm">
        Gene singolo «black»: {report.pigmentation.single_locus_black ? "sì" : "no"}. {report.pigmentation.statement}
      </p>
      <p className="mt-3 text-sm">
        La generazione implica stabilità: {report.stability.generation_implies_stability ? "sì" : "no"}.{" "}
        {report.stability.observed_stability_evidence}
      </p>
      <pre className="mt-4 whitespace-pre-wrap font-sans text-sm leading-relaxed">{report.human_report}</pre>
      <ul className="mt-4 space-y-2 text-sm">
        {report.limitations.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
      {report.sections?.map((section) => (
        <section key={section.heading} className="mt-4">
          <h3 className="text-xs uppercase tracking-wide">{section.heading}</h3>
          <ul className="mt-1 space-y-1 text-sm">
            {section.lines.length ? section.lines.map((line) => <li key={line}>{line}</li>) : <li>nessun record</li>}
          </ul>
        </section>
      ))}
      <p className="mt-4 text-xs tabular-nums">
        seed {report.reproducibility.seed} · repliche {report.reproducibility.replicates} · {report.reproducibility.prng}
      </p>
    </article>
  );
}
