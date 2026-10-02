import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { SignedIn, SignedOut, UserButton } from "@/lib/auth/gates";

const LINKS = [
  ["/", "Chat"],
  ["/analyze", "Incrocio"],
  ["/strains", "Cultivar"],
  ["/evidence", "Evidenze"],
  ["/patterns", "Pattern"],
  ["/knowledge", "Memoria"],
  ["/library", "Archivio"],
  ["/privacy", "Privacy"],
  ["/app", "Android"],
] as const;

export function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-bg text-fg">
      <a
        href="/downloads/GreedAndGross-1.5.3.apk"
        download="GreedAndGross-1.5.3.apk"
        className="block bg-primary px-4 py-4 text-center text-lg font-semibold text-primary-ink"
      >
        Scarica l'APK sul telefono
      </a>
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <Link to="/" className="flex min-w-0 items-center gap-3">
            <img
              src="/brand/gg-logo.png"
              alt=""
              className="h-10 w-10 shrink-0 rounded-md object-contain"
              style={{ height: 40, width: 40, objectFit: "contain" }}
            />
            <span className="min-w-0">
              <span className="block font-display text-xl leading-none text-primary">GREED & GROSS</span>
              <span className="mt-1 block text-xs tracking-wide text-muted">Breeding scientifico</span>
            </span>
          </Link>
          <div className="flex items-center gap-3">
            <SignedIn>
              <UserButton />
            </SignedIn>
            <SignedOut>
              <Link to="/login" className="rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-ink">
                Accedi
              </Link>
            </SignedOut>
          </div>
        </div>
        <nav className="mx-auto flex max-w-6xl flex-wrap gap-2 px-4 pb-3" style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {LINKS.map(([href, label]) => (
            <Link
              key={href}
              to={href}
              className="shrink-0 rounded-full border border-border px-3 py-2 text-sm text-muted data-[status=active]:border-primary data-[status=active]:text-primary"
            >
              {label}
            </Link>
          ))}
        </nav>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  );
}
