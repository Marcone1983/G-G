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
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4">
          <Link to="/" className="min-w-0">
            <p className="font-display text-xl leading-none text-primary">GREED & GROSS</p>
            <p className="mt-1 text-xs tracking-wide text-muted">Breeding scientifico</p>
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
        <nav className="mx-auto flex max-w-6xl gap-2 overflow-x-auto px-4 pb-3">
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
