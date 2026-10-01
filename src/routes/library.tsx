import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Shell } from "@/components/gg/shell";
import { ReportView, type ReportShape } from "@/components/gg/report-view";
import { SignInGate } from "@/lib/auth/gates";
import { myPrediction, myPredictions, submitObservation } from "@/lib/gg/fns";

export const Route = createFileRoute("/library")({ component: Library });

type Row = { id: string; parents: string; status: string; created_at: string };

function Library() {
  return (
    <Shell>
      <h1 className="font-display text-4xl">Archivio</h1>
      <SignInGate>
        <LibraryBody />
      </SignInGate>
    </Shell>
  );
}

function LibraryBody() {
  const [rows, setRows] = useState<Row[]>([]);
  const [report, setReport] = useState<ReportShape | null>(null);
  const [predictionId, setPredictionId] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    void myPredictions().then(setRows).catch(() => setRows([]));
  }, []);

  return (
    <div className="mt-4">
      <ul className="space-y-2">
        {rows.length === 0 ? <li className="text-sm text-muted">Nessun incrocio salvato con questo account.</li> : null}
        {rows.map((row) => (
          <li key={row.id}>
            <button
              type="button"
              className="w-full rounded-lg border border-border px-4 py-3 text-left"
              onClick={() => {
                setPredictionId(row.id);
                void myPrediction({ data: row.id }).then((found) => setReport(found));
              }}
            >
              <p>{row.parents}</p>
              <p className="text-xs text-muted">
                {row.status} · {row.created_at}
              </p>
            </button>
          </li>
        ))}
      </ul>
      {report ? (
        <div className="mt-6 grid gap-4">
          <ReportView report={report} />
          <form
            className="grid gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              if (!predictionId) return;
              void submitObservation({
                data: { prediction_id: predictionId, trait: "flowering", ordinal: null, note },
              }).then((result) => {
                if ("error" in result && result.error) setMessage(result.error);
                else setMessage("Osservazione privata registrata. La predizione storica non è stata riscritta.");
              });
            }}
          >
            <label className="text-sm">
              Osservazione privata
              <textarea className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-3" value={note} onChange={(e) => setNote(e.target.value)} />
            </label>
            <button type="submit" className="w-fit rounded-full bg-primary px-4 py-3 font-medium text-primary-ink">
              Allega esito
            </button>
          </form>
          {message ? <p className="text-sm text-primary">{message}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
