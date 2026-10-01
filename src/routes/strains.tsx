import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { Shell } from "@/components/gg/shell";
import { searchCultivars } from "@/lib/gg/fns";

export const Route = createFileRoute("/strains")({ component: Strains });

type Hit = {
  id: string;
  canonical_name: string;
  identity_status: string;
  record_role: string;
  match_kind: string;
};

function Strains() {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setNote(null);
    setBusy(true);
    try {
      const result = await searchCultivars({ data: q });
      setHits(result.results);
      setNote(result.resolution_note ?? landingNote(result.origin, result.results.length, result.grok_called, result.research_id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ricerca non riuscita");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Shell>
      <h1 className="font-display text-4xl">Cultivar</h1>
      <p className="mt-2 max-w-2xl text-sm text-muted">
        Il database è il primo approdo. Se il nome o la combinazione non si risolvono, parte la ricerca, scrive un record con provenienza e la richiesta successiva lo rilegge. Un «A x B» è una richiesta, non un pedigree. Due omonimi non si fondono.
      </p>
      <form className="mt-4 flex gap-2" onSubmit={(event) => void run(event)}>
        <input className="min-w-0 flex-1 rounded-lg border border-border bg-surface px-3 py-3" value={q} onChange={(e) => setQ(e.target.value)} />
        <button type="submit" disabled={busy} className="rounded-full bg-primary px-4 py-3 font-medium text-primary-ink">
          {busy ? "Risolvo…" : "Cerca"}
        </button>
      </form>
      {error ? <p className="mt-3 text-sm text-accent">{error}</p> : null}
      {note ? <p className="mt-3 text-sm text-muted">{note}</p> : null}
      <ul className="mt-4 divide-y divide-border rounded-lg border border-border">
        {hits.map((hit) => (
          <li key={hit.id}>
            <Link to="/strains/$strainId" params={{ strainId: hit.id }} className="block px-4 py-4">
              <p className="font-medium">{hit.canonical_name}</p>
              <p className="text-xs text-muted">
                {hit.match_kind} · {hit.identity_status} · {hit.record_role}
              </p>
            </Link>
          </li>
        ))}
      </ul>
    </Shell>
  );
}

function landingNote(origin: string, count: number, grokCalled?: boolean, researchId?: string | null) {
  if (origin === "ACQUIRED") return "Ricerca eseguita. Record scritto nello stesso store. Non è una misura di laboratorio. La prossima richiesta non richiama il modello.";
  if (origin === "INSUFFICIENT") return "Ricerca eseguita. Evidenza insufficiente: ho salvato la richiesta irrisolta, senza pedigree e senza chimica inventati.";
  if (origin === "DATABASE" && researchId) return `Riletto dal knowledge store. Nessuna nuova chiamata. Research event ${researchId}.`;
  if (origin === "DATABASE" && count > 0 && !grokCalled) return "Letto dal database. Nessuna chiamata al modello.";
  if (origin === "GROK_UNAVAILABLE") return "Ricerca non disponibile. Ho registrato il tentativo. Non ho inventato una scheda.";
  if (origin === "GROK_FAILED") return "Ricerca tentata e fallita. Il tentativo è salvato. Puoi riprovare. Non ho inventato dati.";
  if (origin === "RESEARCH_IN_PROGRESS") return "Una ricerca identica è già in corso. Non ne apro una seconda.";
  if (count === 0) return "Nessun record dopo la risoluzione.";
  return null;
}
