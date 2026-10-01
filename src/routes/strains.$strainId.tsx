import { createFileRoute } from "@tanstack/react-router";
import { Shell } from "@/components/gg/shell";
import { getCultivar, getCultivarPedigree } from "@/lib/gg/fns";

export const Route = createFileRoute("/strains/$strainId")({
  loader: async ({ params }) => {
    const [detail, pedigree] = await Promise.all([
      getCultivar({ data: params.strainId }),
      getCultivarPedigree({ data: params.strainId }),
    ]);
    return { detail, pedigree };
  },
  component: StrainPage,
});

function StrainPage() {
  const { detail, pedigree } = Route.useLoaderData();
  if (!detail || !pedigree) {
    return (
      <Shell>
        <h1 className="font-display text-4xl">Cultivar assente</h1>
        <p className="mt-2 text-muted">Il nome non è nello snapshot e non viene inventato.</p>
      </Shell>
    );
  }
  return (
    <Shell>
      <p className="text-xs text-primary">{detail.strain.identity_status}</p>
      <h1 className="mt-2 font-display text-4xl">{detail.strain.canonical_name}</h1>
      <p className="mt-3 max-w-2xl text-muted">{detail.strain.summary}</p>
      <p className="mt-3 text-sm">
        Qualità {detail.quality.formula_id}: <span className="tabular-nums">{detail.quality.value == null ? "non calcolata" : detail.quality.value}</span>
      </p>
      <p className="text-xs text-muted">Breeder: {detail.strain.breeder ?? "non asserito"}</p>
      <h2 className="mt-8 font-display text-2xl">Pedigree</h2>
      {pedigree.edges.length === 0 ? (
        <p className="mt-2 text-sm text-muted">Nessun arco. Il parentage non viene completato per somiglianza del nome.</p>
      ) : (
        <ul className="mt-3 space-y-3">
          {pedigree.edges.map((edge) => (
            <li key={edge.id} className="rounded-lg border border-border bg-surface p-4 text-sm">
              <p>
                {edge.child_name} ← {edge.parent_name} · {edge.relationship_type}
              </p>
              <p className="text-muted">{edge.note}</p>
              <p className="text-xs text-accent">{edge.note_on_genomic_percentage}</p>
            </li>
          ))}
        </ul>
      )}
      <h2 className="mt-8 font-display text-2xl">Claim</h2>
      <ul className="mt-3 space-y-3">
        {detail.claims.map((claim) => (
          <li key={claim.id} className="rounded-lg border border-border p-4 text-sm">
            <p className="text-xs text-primary">
              {claim.claim_class} · livello {claim.evidence_level} · {claim.measurement_kind}
            </p>
            <p className="mt-2">{claim.claim_text}</p>
          </li>
        ))}
      </ul>
    </Shell>
  );
}
