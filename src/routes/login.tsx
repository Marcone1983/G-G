import { createFileRoute } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { GROK_PROVIDERS, authClient, signIn } from "@/lib/auth/client";
import { Shell } from "@/components/gg/shell";

export const Route = createFileRoute("/login")({ component: Login });

function Login() {
  const [mode, setMode] = useState<"in" | "up">("in");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    const result =
      mode === "up"
        ? await authClient.signUp.email({ name, email, password, callbackURL: "/" })
        : await authClient.signIn.email({ email, password, callbackURL: "/" });
    if (result.error) setError(result.error.message ?? "Accesso non riuscito");
  }

  return (
    <Shell>
      <h1 className="font-display text-4xl">Accedi</h1>
      <p className="mt-2 max-w-md text-sm text-muted">
        L'archivio privato segue l'account. La lettura scientifica resta disponibile anche senza accesso.
      </p>
      <div className="mt-6 grid max-w-md gap-3">
        {GROK_PROVIDERS.map((provider) => (
          <button
            key={provider.providerId}
            type="button"
            className="rounded-full border border-border px-4 py-3 text-left"
            onClick={() => void signIn(provider.providerId, { callbackURL: "/" })}
          >
            Continua con {provider.label}
          </button>
        ))}
      </div>
      <form className="mt-6 grid max-w-md gap-3" onSubmit={(event) => void submit(event)}>
        {mode === "up" ? (
          <input className="rounded-lg border border-border bg-surface px-3 py-3" placeholder="Nome" value={name} onChange={(e) => setName(e.target.value)} />
        ) : null}
        <input className="rounded-lg border border-border bg-surface px-3 py-3" placeholder="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <input className="rounded-lg border border-border bg-surface px-3 py-3" placeholder="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        <button type="submit" className="rounded-full bg-primary px-4 py-3 font-medium text-primary-ink">
          {mode === "up" ? "Crea account" : "Entra con email"}
        </button>
        <button type="button" className="text-sm text-muted" onClick={() => setMode(mode === "up" ? "in" : "up")}>
          {mode === "up" ? "Ho già un account" : "Crea un account email"}
        </button>
        {error ? <p className="text-sm text-accent">{error}</p> : null}
      </form>
    </Shell>
  );
}
