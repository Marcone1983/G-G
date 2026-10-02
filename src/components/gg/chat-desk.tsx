import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { askBreeding } from "@/lib/gg/fns";
import { ReportView, type ReportShape } from "./report-view";
import { StructuredReportView } from "./structured-report";

type Card = {
  id: string;
  name: string;
  breeder: string | null;
  line: string;
  slot: "A" | "B" | "name";
};

type Pins = { A?: Card; B?: Card };

type Msg = {
  role: "user" | "assistant";
  text: string;
  cards?: Card[];
  report?: ReportShape | null;
  structured?: Record<string, unknown> | null;
};

function hasReport(value: unknown): value is ReportShape {
  return Boolean(value && typeof value === "object" && "pedigree_confidence" in value && "human_report" in value);
}

function structuredOf(result: { structured_report?: unknown }): Record<string, unknown> | null {
  const value = result.structured_report;
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

export function ChatDesk({ intro, starters }: { intro: string; starters: string[] }) {
  const [messages, setMessages] = useState<Msg[]>([{ role: "assistant", text: intro }]);
  const [text, setText] = useState("");
  const [pending, setPending] = useState(false);
  const [pins, setPins] = useState<Pins>({});
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = scroller.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [messages, pending]);

  async function send(message: string, nextPins?: Pins) {
    const clean = message.trim();
    if (!clean || pending) return;
    const used = nextPins ?? {};
    if (!nextPins) setPins({});
    setMessages((current) => [...current, { role: "user", text: clean }]);
    setText("");
    setPending(true);
    try {
      const result = await askBreeding({
        data: {
          message: clean,
          parent_a_id: used.A?.id ?? null,
          parent_b_id: used.B?.id ?? null,
        },
      });
      setMessages((current) => [
        ...current,
        { role: "assistant", text: result.reply, cards: result.cards, report: hasReport(result.report) ? result.report : null, structured: structuredOf(result as { structured_report?: unknown }) },
      ]);
    } catch (error) {
      setMessages((current) => [
        ...current,
        { role: "assistant", text: error instanceof Error ? error.message : "Il catalogo non ha risposto." },
      ]);
    } finally {
      setPending(false);
    }
  }

  function pin(card: Card, slot: "A" | "B") {
    const next = { ...pins, [slot]: { ...card, slot } };
    setPins(next);
    if (next.A && next.B) {
      void send(`${next.A.name} × ${next.B.name}`, next);
      return;
    }
    setMessages((current) => [
      ...current,
      {
        role: "assistant",
        text: `Parent ${slot} fissato: ${card.name}${card.breeder ? ` · ${card.breeder}` : ""}. Scegli l'altro, oppure scrivi l'incrocio.`,
      },
    ]);
  }

  return (
    <div className="flex min-h-[32rem] flex-col">
      <div ref={scroller} className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
        {messages.map((message, index) => (
          <div key={`${message.role}-${index}`} className={message.role === "user" ? "flex justify-end" : ""}>
            <div
              className={
                message.role === "user"
                  ? "max-w-[40rem] rounded-2xl bg-primary px-4 py-3 text-primary-ink"
                  : "max-w-[46rem] rounded-2xl border border-border bg-surface px-4 py-3"
              }
            >
              <p className="whitespace-pre-wrap text-sm">{message.text}</p>
              {message.cards?.length ? (
                <div className="mt-3 grid gap-2">
                  {message.cards.map((card) => (
                    <div key={`${card.slot}-${card.id}`} className="rounded-xl border border-border bg-bg px-3 py-3">
                      <p className="text-sm font-medium">
                        {card.name}
                        {card.breeder ? ` · ${card.breeder}` : ""}
                      </p>
                      <p className="mt-1 text-xs text-muted">{card.line}</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {card.slot === "A" || card.slot === "name" ? (
                          <button type="button" className="rounded-full bg-primary px-3 py-1 text-xs font-medium text-primary-ink" onClick={() => pin(card, "A")}>
                            {card.slot === "A" ? "Fissa come parent A" : "Parent A"}
                          </button>
                        ) : null}
                        {card.slot === "B" || card.slot === "name" ? (
                          <button type="button" className="rounded-full border border-border px-3 py-1 text-xs" onClick={() => pin(card, "B")}>
                            {card.slot === "B" ? "Fissa come parent B" : "Parent B"}
                          </button>
                        ) : null}
                        {card.id.startsWith("cross:") ? null : (
                          <Link to="/strains/$strainId" params={{ strainId: card.id }} className="rounded-full border border-border px-3 py-1 text-xs text-muted">
                            Apri scheda
                          </Link>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
              {message.structured ? <StructuredReportView report={message.structured} /> : null}
              {message.report && !message.structured ? (
                <details className="mt-3">
                  <summary className="cursor-pointer text-xs text-primary">Rapporto del motore</summary>
                  <div className="mt-3">
                    <ReportView report={message.report} />
                  </div>
                </details>
              ) : null}
            </div>
          </div>
        ))}
        {pending ? <p className="text-sm text-muted">Cerco nello store. Se non basta, parte la ricerca. Non è un «non trovato».</p> : null}
      </div>
      <div className="flex gap-2 overflow-x-auto py-2">
        {starters.map((starter) => (
          <button key={starter} type="button" className="shrink-0 rounded-full border border-border px-3 py-2 text-xs text-muted" onClick={() => void send(starter)}>
            {starter}
          </button>
        ))}
      </div>
      <p className="pb-2 text-xs text-muted">Esempi di domanda. Non sono record scientifici e non sono un pedigree.</p>
      {pins.A || pins.B ? (
        <p className="pb-2 text-xs text-muted">
          Fissati: A {pins.A ? `${pins.A.name}${pins.A.breeder ? ` · ${pins.A.breeder}` : ""}` : "—"} · B{" "}
          {pins.B ? `${pins.B.name}${pins.B.breeder ? ` · ${pins.B.breeder}` : ""}` : "—"}
          <button type="button" className="ml-2 text-primary" onClick={() => setPins({})}>
            azzera
          </button>
        </p>
      ) : null}
      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          void send(text);
        }}
      >
        <input
          className="min-h-12 min-w-0 flex-1 rounded-full border border-border bg-surface px-4 py-3 text-base"
          style={{ minHeight: 48, fontSize: 16, width: "100%" }}
          placeholder="Un nome, oppure il lato A × il lato B"
          value={text}
          onChange={(event) => setText(event.target.value)}
        />
        <button type="submit" disabled={pending} className="rounded-full bg-primary px-5 py-3 font-medium text-primary-ink">
          Invia
        </button>
      </form>
    </div>
  );
}
