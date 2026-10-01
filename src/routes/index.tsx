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
  const status =
    corpus?.status === "CONNECTED"
      ? "Scientific backend collegato a Supabase PostgreSQL."
      : "Scientific backend non ancora configurato nella Preview.";
  const intro = `${status} Chat di breeding. Il database production è il primo approdo. Se un nome o un cross non si risolvono qui, non vengono sostituiti con SQLite o con il catalogo locale. Un «A x B» non è da solo un pedigree. I THC dichiarati dai venditori non sono misure di laboratorio e non diventano la chimica della progenie.`;
  return (
    <Shell>
      <ChatDesk intro={intro} starters={STARTERS} />
    </Shell>
  );
}
