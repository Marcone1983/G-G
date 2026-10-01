import { createFileRoute } from "@tanstack/react-router";
import { ChatDesk } from "@/components/gg/chat-desk";
import { Shell } from "@/components/gg/shell";
import { HOME_STARTERS as STARTERS } from "@/lib/gg/examples.ts";
import { getDashboard } from "@/lib/gg/fns";

export const Route = createFileRoute("/")({
  loader: () => getDashboard(),
  component: Home,
});

function Home() {
  const data = Route.useLoaderData();
  const catalog = data.catalog;
  const intro = catalog
    ? `Chat di breeding. Ho in memoria ${catalog.loaded_records.toLocaleString("it-IT")} schede da ${catalog.source_name} (${catalog.license}), più il registro scientifico G&G. Il database è il primo approdo. Se un nome o un cross non si risolvono, parte la ricerca e salvo la richiesta nello stesso store: un «A x B» non è da solo un pedigree. Se la ricerca riesce, la richiesta successiva non richiama il modello. I THC del catalogo sono dichiarazioni dei venditori, non misure di laboratorio, e non diventano la chimica della progenie. Seedfinder non è stato copiato: non pubblica un dump riutilizzabile.`
    : `Chat di breeding. Cultivar in memoria: ${data.counts.strains}. Il numero arriva dopo l'evidenza.`;
  return (
    <Shell>
      <ChatDesk intro={intro} starters={STARTERS} />
    </Shell>
  );
}
