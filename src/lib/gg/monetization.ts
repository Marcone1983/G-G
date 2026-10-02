export type BillingWhenSold = "PLAY_BILLING" | "SERVER_CONTRACT";

export type Mechanism = {
  id: string;
  title: string;
  billing_when_sold: BillingWhenSold;
  price: null;
  currency: null;
  product_id: null;
  granted: false;
  sells_scientific_evidence: false;
  sells_certainty: false;
  changes_prediction: false;
  cultivation_instructions: false;
  status: "NOT_FOR_SALE";
  free_behavior: string;
};

function item(id: string, title: string, billing_when_sold: BillingWhenSold, free_behavior: string): Mechanism {
  return {
    id,
    title,
    billing_when_sold,
    price: null,
    currency: null,
    product_id: null,
    granted: false,
    sells_scientific_evidence: false,
    sells_certainty: false,
    changes_prediction: false,
    cultivation_instructions: false,
    status: "NOT_FOR_SALE",
    free_behavior,
  };
}

/** Fifty product mechanisms. None is priced, granted, or a sale of evidence. */
export const MECHANISMS: readonly Mechanism[] = [
  item("premium", "Premium", "PLAY_BILLING", "La lettura scientifica di base resta aperta."),
  item("pro", "Pro", "PLAY_BILLING", "Pro non è concesso dal telefono."),
  item("annual", "Annual", "PLAY_BILLING", "Nessun piano annuale è attivo."),
  item("team", "Team", "PLAY_BILLING", "Un solo account. Nessun posto team."),
  item("lab", "Lab", "SERVER_CONTRACT", "Nessun contratto di laboratorio."),
  item("researcher", "Researcher", "PLAY_BILLING", "Il profilo ricercatore non è sbloccato."),
  item("university", "University", "SERVER_CONTRACT", "Nessun contratto universitario."),
  item("enterprise_api", "Enterprise API", "SERVER_CONTRACT", "La chiave personale non è una licenza enterprise."),
  item("credits", "Credits", "PLAY_BILLING", "Nessun credito è stato accreditato."),
  item("reports", "Reports", "PLAY_BILLING", "Il rapporto strutturato di base non vende certezza."),
  item("image_credits", "Image credits", "PLAY_BILLING", "Nessuna immagine extra. Una visualizzazione non è una fotografia."),
  item("bulk_cross", "Bulk cross", "PLAY_BILLING", "Un incrocio alla volta. Nessun lotto."),
  item("batch_strain", "Batch strain", "PLAY_BILLING", "La ricerca per nome resta singola."),
  item("pedigree_export", "Pedigree export", "PLAY_BILLING", "Il pedigree si legge nell'app. Non si esporta il grafo."),
  item("pdf_export", "PDF export", "PLAY_BILLING", "Nessun PDF del corpus."),
  item("csv_export", "CSV export", "PLAY_BILLING", "Nessun CSV del corpus."),
  item("json_export", "JSON export", "PLAY_BILLING", "L'export account privato resta un diritto, non un dump scientifico."),
  item("dossiers", "Dossiers", "PLAY_BILLING", "Nessun dossier a pagamento."),
  item("literature_packs", "Literature packs", "PLAY_BILLING", "Non si redistribuisce letteratura protetta."),
  item("custom_research_jobs", "Custom research jobs", "SERVER_CONTRACT", "Nessun job di ricerca su commissione."),
  item("private_vault", "Private vault", "PLAY_BILLING", "Note e osservazioni private usano lo spazio base."),
  item("semantic_memory_quota", "Semantic memory quota", "PLAY_BILLING", "La memoria semantica extra non è attiva."),
  item("capacity", "Capacity", "PLAY_BILLING", "La quota extra di archivio non è attiva."),
  item("semantic_search", "Semantic search quota", "PLAY_BILLING", "La ricerca semantica di base resta disponibile. La quota extra no."),
  item("pattern_discovery", "Pattern discovery", "PLAY_BILLING", "I pattern restano CANDIDATE. La scoperta extra non li promuove."),
  item("calibration_dashboard", "Calibration dashboard", "PLAY_BILLING", "La calibrazione assente resta NOT_CALIBRATED."),
  item("outcome_analytics", "Outcome analytics", "PLAY_BILLING", "Le osservazioni private restano private. Nessun cruscotto extra."),
  item("historical_comparison", "Historical comparison", "PLAY_BILLING", "Il confronto storico extra non è attivo."),
  item("breeding_workspace", "Breeding workspace", "PLAY_BILLING", "Lo spazio di analisi base resta. Non è una guida di coltivazione."),
  item("multi_user", "Multi-user", "PLAY_BILLING", "Nessun accesso multiutente."),
  item("team_seats", "Team seats", "PLAY_BILLING", "Nessun posto aggiuntivo."),
  item("org_admin", "Org admin", "SERVER_CONTRACT", "Nessuna organizzazione."),
  item("rbac", "RBAC", "SERVER_CONTRACT", "I ruoli globali esistenti non sono un pacchetto venduto."),
  item("lab_collaboration", "Lab collaboration", "SERVER_CONTRACT", "Nessuna collaborazione di laboratorio."),
  item("research_workspaces", "Research workspaces", "SERVER_CONTRACT", "Nessuno spazio di ricerca condiviso."),
  item("white_label", "White-label", "SERVER_CONTRACT", "Nessuna etichetta di terzi."),
  item("webhooks", "Webhooks", "SERVER_CONTRACT", "Nessun webhook."),
  item("scheduled_reports", "Scheduled reports", "PLAY_BILLING", "Nessun rapporto programmato."),
  item("research_alerts", "Research alerts", "PLAY_BILLING", "Nessun avviso di ricerca."),
  item("pattern_alerts", "Pattern alerts", "PLAY_BILLING", "Nessun avviso di pattern."),
  item("dataset_alerts", "Dataset alerts", "PLAY_BILLING", "Nessun avviso di dataset."),
  item("model_alerts", "Model alerts", "PLAY_BILLING", "Nessun avviso di modello."),
  item("custom_dashboards", "Custom dashboards", "PLAY_BILLING", "La dashboard base non è personalizzabile a pagamento."),
  item("priority_compute", "Priority compute", "PLAY_BILLING", "Nessuna coda prioritaria. Il calcolo non diventa più certo."),
  item("priority_research", "Priority research", "SERVER_CONTRACT", "La ricerca non salta la coda."),
  item("higher_image_limits", "Higher image limits", "PLAY_BILLING", "Il limite immagini extra non è attivo."),
  item("visualization_packs", "Visualization packs", "PLAY_BILLING", "Nessun pacchetto di visualizzazione."),
  item("enterprise_license", "Enterprise license", "SERVER_CONTRACT", "Nessuna licenza enterprise."),
  item("saved_history_quota", "Saved history quota", "PLAY_BILLING", "Lo storico privato base resta. La quota extra no."),
  item("api_rate_quota", "API rate quota", "SERVER_CONTRACT", "Il rate limit di base resta. Non si compra un dump."),
];

export function entitlementDocument() {
  return {
    tier: "FREE" as const,
    premium: false,
    pro: false,
    annual: false,
    billing: "NOT_CONFIGURED" as const,
    play_billing: "NOT_LINKED" as const,
    source: "NO_PURCHASE_VERIFIED" as const,
    restores: "NOT_AVAILABLE" as const,
    purchase_verifier: "ABSENT" as const,
    local_paid_flag: "IGNORED" as const,
    prices_chosen: false,
    sells_evidence: false,
    sells_certainty: false,
    mechanisms: MECHANISMS,
    count: MECHANISMS.length,
    granted_count: MECHANISMS.filter((entry) => entry.granted).length,
    note: "Nessun acquisto è stato simulato. Il livello non è un flag locale. Un meccanismo resta chiuso finché il server non verifica un acquisto reale.",
  };
}

export function mechanismById(id: string): Mechanism | null {
  return MECHANISMS.find((entry) => entry.id === id) ?? null;
}

export function refuseClientPurchase(body: Record<string, unknown>) {
  const ignored = Object.keys(body).filter((key) =>
    ["paid", "premium", "pro", "tier", "purchase_token", "product_id", "granted"].includes(key),
  );
  return {
    verified: false,
    entitlement_changed: false,
    billing: "NOT_CONFIGURED" as const,
    play_billing: "NOT_LINKED" as const,
    purchase_verifier: "ABSENT" as const,
    ignored_client_fields: ignored,
    reason: "Nessun verificatore Play è configurato. Un campo inviato dal client non è un acquisto.",
  };
}

export function closedMechanism(id: string) {
  const mechanism = mechanismById(id);
  if (!mechanism) return null;
  return {
    allowed: false as const,
    status: "ENTITLEMENT_REQUIRED" as const,
    purchase: "NOT_AVAILABLE" as const,
    mechanism,
  };
}
