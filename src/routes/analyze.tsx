import { createFileRoute } from "@tanstack/react-router";
import { ChatDesk } from "@/components/gg/chat-desk";
import { Shell } from "@/components/gg/shell";
import { ANALYZE_STARTERS as STARTERS } from "@/lib/gg/examples.ts";
import { getDashboard } from "@/lib/gg/fns";

export const Route = createFileRoute("/analyze")({
  loader: () => getDashboard(),
  component: Analyze,
});

function Analyze() {
  const data = Route.useLoaderData();
  return (
    <Shell>
      <ChatDesk
        intro={`Stesso motore della chat, cache compresa. Snapshot ${data.snapshot_id}. I dieci casi storici non sono una classifica: sono domande, e un nome ambiguo va scelto, non fuso.`}
        starters={STARTERS}
      />
    </Shell>
  );
}
