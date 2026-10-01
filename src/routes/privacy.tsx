import { createFileRoute } from "@tanstack/react-router";
import { Shell } from "@/components/gg/shell";
import { SignInGate } from "@/lib/auth/gates";
import { downloadPrivate, wipePrivate } from "@/lib/gg/fns";

export const Route = createFileRoute("/privacy")({ component: Privacy });

function Privacy() {
  return (
    <Shell>
      <h1 className="font-display text-4xl">Privacy</h1>
      <div className="mt-4 max-w-2xl space-y-3 text-sm text-muted">
        <p>
          GREED & GROSS è uno strumento didattico per breeder. Non vende semi, fiori o prodotti, e non organizza
          consegne.
        </p>
        <p>
          L'account, se lo crei, conserva email e gli incroci che salvi. Le note private restano sul tuo utente.
          Un'osservazione entra nella memoria condivisa solo dopo revisione e dopo la rimozione di email e telefoni.
        </p>
        <p>
          L'app Android parla con questo stesso server via HTTPS. Non contiene un secondo motore e non incorpora
          chiavi di terze parti. I dati scientifici globali non includono l'identità di chi ha osservato.
        </p>
        <p>Età prevista: 18 anni. Nessuna pubblicità, nessun tracciamento di terze parti nel client Android.</p>
      </div>
      <SignInGate>
        <div className="mt-6 flex flex-wrap gap-2">
          <button
            type="button"
            className="rounded-full border border-border px-4 py-3"
            onClick={() => {
              void downloadPrivate().then((data) => {
                const blob = new Blob([data.body], { type: "application/json" });
                const url = URL.createObjectURL(blob);
                const anchor = document.createElement("a");
                anchor.href = url;
                anchor.download = "gg-export.json";
                anchor.click();
                URL.revokeObjectURL(url);
              });
            }}
          >
            Esporta i miei dati
          </button>
          <button
            type="button"
            className="rounded-full bg-accent px-4 py-3 text-primary-ink"
            onClick={() => {
              if (window.confirm("Cancellare incroci, predizioni e note di questo account?")) {
                void wipePrivate();
              }
            }}
          >
            Cancella i dati privati
          </button>
        </div>
      </SignInGate>
    </Shell>
  );
}
