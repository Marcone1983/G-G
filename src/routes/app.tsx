import { createFileRoute } from "@tanstack/react-router";
import { Shell } from "@/components/gg/shell";

export const Route = createFileRoute("/app")({ component: AndroidPage });

function AndroidPage() {
  return (
    <Shell>
      <h1 className="font-display text-4xl">App Android</h1>
      <p className="mt-3 max-w-2xl text-muted">
        Il client è nativo, in Kotlin e Jetpack Compose. Non è una WebView e non contiene un motore scientifico.
        Chat, cultivar e incroci chiedono tutto a questa API: lo stesso core del sito. Il plugin ChatGPT non è un'API da chiamare dall'APK.
      </p>
      <dl className="mt-6 grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg border border-border bg-surface p-4 text-sm">
          <dt className="text-muted">Application id</dt>
          <dd>science.gg.breeding</dd>
        </div>
        <div className="rounded-lg border border-border bg-surface p-4 text-sm">
          <dt className="text-muted">Versione</dt>
          <dd className="tabular-nums">1.5.3 (9)</dd>
        </div>
      </dl>
      <a className="mt-6 inline-flex rounded-full bg-primary px-5 py-3 font-medium text-primary-ink" href="/downloads/GreedAndGross-1.5.3.apk" download="GreedAndGross-1.5.3.apk">
        Scarica l'APK firmato
      </a>
      <ul className="mt-6 grid gap-2 text-sm sm:grid-cols-2">
        {[
          "Autenticazione",
          "Chat",
          "Ricerca cultivar",
          "Profilo e pedigree",
          "Cross builder",
          "Predizione e storico",
          "Pattern",
          "Evidenze",
          "Stato della conoscenza",
          "Account e privacy",
        ].map((item) => (
          <li key={item} className="rounded-lg border border-border px-3 py-2">
            {item}
          </li>
        ))}
      </ul>
      <p className="mt-4 max-w-2xl text-sm text-muted">
        La release è già collegata al server. Dopo il download, apri il file dai Download del telefono e consenti l'installazione da questa origine.
      </p>
    </Shell>
  );
}
