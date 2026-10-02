import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";

export const Route = createFileRoute("/auth/mobile")({ component: MobileReturn });

function MobileReturn() {
  const [message, setMessage] = useState("Torno all'app…");

  useEffect(() => {
    void fetch("/api/mobile-session", { credentials: "include" })
      .then(async (response) => {
        if (!response.ok) throw new Error("missing");
        const data = (await response.json()) as { token?: string };
        if (!data.token) throw new Error("missing");
        const token = encodeURIComponent(data.token);
        window.location.href = `intent://auth?token=${token}#Intent;scheme=science.gg.breeding;package=science.gg.breeding;end`;
      })
      .catch(() => {
        setMessage("Accesso Google non completato. Chiudi questa pagina e riprova dall'app.");
      });
  }, []);

  return (
    <main className="min-h-screen bg-bg px-6 py-16 text-fg">
      <h1 className="font-display text-3xl">GREED & GROSS</h1>
      <p className="mt-4 max-w-md text-muted">{message}</p>
    </main>
  );
}
