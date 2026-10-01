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
  const corpus = data.corpus;
  const intro =
    corpus?.status === "CONNECTED" && corpus.counts
      ? `Fonte: Supabase PostgreSQL ${corpus.project_ref}. source_records ${corpus.counts.source_records ?? "non disponibile"}, measurements ${corpus.counts.measurements ?? "non disponibile"}. Nessun corpus locale.`
      : "Dato non ancora disponibile. La preview non legge SQLite, catalog.json o fixture. La fonte è Supabase PostgreSQL, e questo processo non ha il collegamento production.";
  return (
    <Shell>
      <ChatDesk intro={intro} starters={STARTERS} />
    </Shell>
  );
}
