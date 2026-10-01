import { createFileRoute } from "@tanstack/react-router";
import { Shell } from "@/components/gg/shell";
import { getKnowledge } from "@/lib/gg/fns";

export const Route = createFileRoute("/knowledge")({
  loader: () => getKnowledge(),
  component: KnowledgePage,
});

function KnowledgePage() {
  const data = Route.useLoaderData();
  return (
    <Shell>
      <h1 className="font-display text-4xl">Memoria</h1>
      <dl className="mt-6 grid gap-3 sm:grid-cols-2">
        <Item label="Modello" value={`${data.model_id} ${data.model_version}`} />
        <Item label="Snapshot" value={data.snapshot_id} />
        <Item label="Embedding" value={data.embedding_model} />
        <Item label="Vettori" value={data.vector_backend} />
        <Item label="Cache calda" value={data.hot_cache} />
        <Item label="Cache durevole" value={data.durable_cache} />
        <Item label="Redis" value={data.redis} />
        <Item label="Motore" value={data.scientific_engine} />
      </dl>
      <p className="mt-4 text-sm text-muted">{data.vector_backend_note}</p>
      <p className="mt-4 max-w-3xl text-sm">{data.architecture.note}</p>
      <p className="mt-6 text-sm">
        Misure di laboratorio nello snapshot: {data.coverage.laboratory_measurements}. Cultivar in memoria:{" "}
        {data.coverage.strains.toLocaleString("it-IT")}. Archi di pedigree dichiarati: {data.coverage.pedigree_edges.toLocaleString("it-IT")}.
      </p>
      {data.catalog ? (
        <p className="mt-3 max-w-3xl text-sm text-muted">
          Catalogo {data.catalog.source_name}: {data.catalog.loaded_records.toLocaleString("it-IT")} schede su{" "}
          {data.catalog.source_rows.toLocaleString("it-IT")} righe sorgente, {data.catalog.license}. {data.catalog.note}{" "}
          {data.catalog.attribution}
        </p>
      ) : null}
      <h2 className="mt-8 font-display text-2xl">Strumenti del core</h2>
      <p className="mt-2 max-w-3xl text-sm text-muted">
        Web, APK e, se lo colleghi, le Actions di ChatGPT chiamano questi nomi. Non esiste una seconda logica nell'app.
      </p>
      <ul className="mt-3 grid gap-2 sm:grid-cols-2">
        {data.tools.map((tool) => (
          <li key={tool} className="rounded-lg border border-border bg-surface px-3 py-2 text-sm">
            {tool}
          </li>
        ))}
      </ul>
    </Shell>
  );
}

function Item({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-1 text-sm">{value}</dd>
    </div>
  );
}
