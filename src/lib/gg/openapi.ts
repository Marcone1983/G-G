const errorSchema = {
  type: "object",
  properties: { error: { type: "string" } },
  required: ["error"],
};

const crossBody = {
  type: "object",
  required: ["parent_a", "parent_b"],
  properties: {
    parent_a: { type: "string" },
    parent_b: { type: "string" },
    parent_a_id: { type: "string", nullable: true },
    parent_b_id: { type: "string", nullable: true },
    cross_type: {
      type: "string",
      enum: ["F1", "F2", "F3_PLUS", "S1", "S2", "S3_PLUS", "BC1", "BC2", "BC3_PLUS", "SSD", "OTHER", "AUTHOR_G_LABEL"],
    },
    author_generation_label: { type: "string", nullable: true },
    population_size: { type: "integer", nullable: true },
  },
};

function op(summary: string, tag: string, extra: Record<string, unknown> = {}) {
  return {
    summary,
    tags: [tag],
    responses: {
      "200": { description: "Risposta del core scientifico" },
      "400": { description: "Richiesta non valida", content: { "application/json": { schema: errorSchema } } },
      "401": { description: "Sessione o chiave assente", content: { "application/json": { schema: errorSchema } } },
      "404": { description: "Assente", content: { "application/json": { schema: errorSchema } } },
      "429": { description: "Rate limit", content: { "application/json": { schema: errorSchema } } },
    },
    ...extra,
  };
}

function jsonBody(schema: unknown) {
  return { required: true, content: { "application/json": { schema } } };
}

export function openApiDocument() {
  return {
    openapi: "3.0.3",
    info: {
      title: "GREED & GROSS Scientific API",
      version: "1.2.0",
      description:
        "Un solo core scientifico sullo snapshot GGS-KNOWLEDGE-000005. Web, Android e le Actions di ChatGPT sono client. /foundation è una facciata, non un secondo motore. Le percentuali chimiche non vengono inventate. Una predizione senza calibrazione resta NOT_COMPUTABLE. PostgreSQL non è configurato.",
    },
    servers: [{ url: "/api/v1", description: "Stesso processo del core. Il dominio pubblico non è configurato." }],
    tags: [
      { name: "system" },
      { name: "strains" },
      { name: "crosses" },
      { name: "knowledge" },
      { name: "cache" },
    ],
    components: {
      securitySchemes: {
        bearerSession: { type: "http", scheme: "bearer", description: "Sessione Better Auth oppure chiave gg_." },
      },
      schemas: { Error: errorSchema, CrossRequest: crossBody },
    },
    paths: {
      "/health": {
        get: op("Stato di API, database applicazione e database scientifico. PGLite healthy non significa corpus healthy.", "system"),
      },
      "/diagnostics/env": {
        get: op("Presenza delle variabili server, senza valori. Non stampa secret.", "system"),
      },
      "/readiness": {
        get: op("Guard del corpus, gap catalogo, Postgres e Redis. Non dichiara operativo ciò che non è configurato.", "system"),
      },
      "/version": { get: op("Motore, versioni, ambiente e backend dichiarati.", "system") },
      "/openapi.json": { get: op("Contratto OpenAPI 3.0.", "system") },
      "/openapi": { get: op("Alias di /openapi.json.", "system") },
      "/docs": { get: op("HTML del contratto. Non è un endpoint scientifico.", "system") },
      "/models": { get: op("Registro modelli.", "system") },
      "/models/{model_id}": {
        get: op("Una versione di modello.", "system", { parameters: [{ name: "model_id", in: "path", required: true, schema: { type: "string" } }] }),
      },
      "/metrics": { get: op("Contatori reali. Il tasso di cache non viene inventato.", "system") },
      "/strains/search": {
        post: op("Ricerca cultivar nel catalogo e nel registro. Nessuna fusione automatica.", "strains", {
          requestBody: jsonBody({ type: "object", required: ["q"], properties: { q: { type: "string" } } }),
        }),
      },
      "/strains/{strain_id}": {
        get: op("Scheda cultivar.", "strains", {
          parameters: [{ name: "strain_id", in: "path", required: true, schema: { type: "string" } }],
        }),
      },
      "/strains/{strain_id}/pedigree": {
        get: op("Pedigree dichiarato. Non è una percentuale genomica.", "strains", {
          parameters: [{ name: "strain_id", in: "path", required: true, schema: { type: "string" } }],
        }),
      },
      "/crosses/analyze": {
        post: op("Predizione scientifica non salvata. OUT_OF_DISTRIBUTION è un esito valido.", "crosses", {
          requestBody: jsonBody({ $ref: "#/components/schemas/CrossRequest" }),
        }),
      },
      "/crosses": {
        post: op("Salva un incrocio nell'archivio dell'utente.", "crosses", {
          security: [{ bearerSession: [] }],
          requestBody: jsonBody({ $ref: "#/components/schemas/CrossRequest" }),
        }),
      },
      "/semantic/search": {
        post: op("Recupero semantico. Backend vettoriale dichiarato nella risposta.", "knowledge", {
          requestBody: jsonBody({
            type: "object",
            required: ["q"],
            properties: { q: { type: "string" }, kind: { type: "string" }, limit: { type: "integer" } },
          }),
        }),
      },
      "/knowledge/query": {
        post: op("Ricerca strutturata più semantica.", "knowledge", {
          requestBody: jsonBody({ type: "object", required: ["q"], properties: { q: { type: "string" } } }),
        }),
      },
      "/foundation": { get: op("Stato della conoscenza durevole. Non è un secondo motore.", "knowledge") },
      "/foundation/search": {
        get: op("Recupero unico per nome. Stesso cervello di semantic/search.", "knowledge", {
          parameters: [{ name: "q", in: "query", required: true, schema: { type: "string" } }],
        }),
      },
      "/knowledge/quality": { get: op("Conteggi riletti dal database, per snapshot.", "knowledge") },
      "/knowledge/walk": {
        get: op("Attraversamento nome, alias, breeder, genitori dichiarati. Nessun arco genomico inventato.", "knowledge", {
          parameters: [{ name: "q", in: "query", required: true, schema: { type: "string" } }],
        }),
      },
      "/search": { get: op("Ricerca entità. Stesso resolver del resto del cervello.", "knowledge") },
      "/research": {
        post: op("Risolve un nome o un cross. Se manca in locale, avvia la ricerca e rilegge lo store.", "knowledge", {
          requestBody: jsonBody({ type: "object", required: ["q"], properties: { q: { type: "string" } } }),
        }),
      },
      "/research/status": { get: op("Stato del provider. Nessun segreto. Un 403 di quota è BLOCKED, non una conoscenza.", "knowledge") },
      "/research/events": { get: op("Elenco research event. Richiede sessione o API key. Nessun segreto.", "knowledge") },
      "/research/{id}": {
        get: op("Un research event persistito.", "knowledge", {
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        }),
      },
      "/knowledge/events": { get: op("Audit delle ricerche. Non è una seconda fonte di verità.", "knowledge") },
      "/knowledge/snapshot": { get: op("Manifest dello snapshot corrente. Stesso oggetto di /snapshots.", "knowledge") },
      "/knowledge/evidence": { get: op("Fonti e claim già registrati. Non è una seconda base.", "knowledge") },
      "/knowledge/crosses/{id}": {
        get: op("Richiesta di cross persistita. Il parse non è un pedigree.", "knowledge", {
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        }),
      },
      "/retrieve": { get: op("Recupero scientifico unificato.", "knowledge") },
      "/entities": { get: op("Entità canoniche per nome normalizzato.", "knowledge") },
      "/entities/{id}": { get: op("Una entità.", "knowledge", { parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }] }) },
      "/identity": { get: op("Decisioni di identità per il nome. Il nome non è un genotipo.", "knowledge") },
      "/samples": { get: op("Campioni e gruppi di indipendenza. Non una media di cultivar.", "knowledge") },
      "/measurements": { get: op("Classi chimiche osservate. L'assenza è NOT_AVAILABLE.", "knowledge") },
      "/chemistry": { get: op("Stesso strato di /measurements.", "knowledge") },
      "/pedigree": { get: op("Pedigree dichiarato e grafo. Non è inferenza genomica.", "knowledge") },
      "/genomics": { get: op("Genomica. NOT_AVAILABLE se non c'è un dataset collegato.", "knowledge") },
      "/graph": { get: op("Grafo in entrata e in uscita per entity id.", "knowledge") },
      "/snapshots": { get: op("Manifest dello snapshot corrente.", "knowledge") },
      "/targets": { get: op("Registro dei target predittivi e il loro stato.", "knowledge") },
      "/sources": { get: op("Registro fonti. Le fonti respinte restano respinte.", "knowledge") },
      "/evaluations": { get: op("Run diagnostici e calibrazione. Nessuna probabilità se non calibrata.", "system") },
      "/jobs": { get: op("Job del worker. Il worker CLI non è un demone.", "system") },
      "/cache": { get: op("Policy della cache. Redis non è attivo.", "cache") },
      "/disciplines/{id}": { get: op("Una disciplina sullo stesso cervello.", "knowledge", { parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }] }) },
      "/predictions/evaluate": { post: op("Gate predittivo. Non inventa un valore.", "crosses") },
      "/predictions/run": { post: op("Stesso gate di evaluate. Scrive solo l'esito del gate, non una evidenza.", "crosses") },
      "/predictions/summary": { get: op("Conteggi degli esiti del gate. Non sono una qualità.", "crosses") },
      "/models/registry": { get: op("Modelli diagnostici. production_eligible resta 0 finché la calibrazione manca.", "system") },
      "/knowledge/status": { get: op("Snapshot unico, copertura del catalogo curato e stato del motore.", "knowledge") },
      "/patterns": { get: op("Pattern curati e conteggi dei pattern di etichetta. VALIDATED non è automatico.", "knowledge") },
      "/patterns/update": {
        post: op("Cambio di stato di un pattern curato. VALIDATED richiede revisione umana.", "knowledge", {
          security: [{ bearerSession: [] }],
          requestBody: jsonBody({ type: "object", properties: { pattern_id: { type: "string" }, validation_status: { type: "string" }, manually_validated: { type: "boolean" } } }),
        }),
      },
      "/cache/invalidate": {
        post: op("Invalida la cache applicativa e la semantic cache dello snapshot corrente.", "cache", {
          security: [{ bearerSession: [] }],
          requestBody: jsonBody({ type: "object", properties: { reason: { type: "string" } } }),
        }),
      },
      "/patterns/search": {
        post: op("Pattern nel loro contesto. VALIDATED non è automatico.", "knowledge", {
          requestBody: jsonBody({ type: "object", properties: { q: { type: "string" } } }),
        }),
      },
      "/evidence": {
        get: op("Fonti e claim. I numeri di catalogo non diventano laboratorio.", "knowledge"),
        post: op("Proposta di evidenza. Non entra nel cervello senza revisione.", "knowledge", { security: [{ bearerSession: [] }] }),
      },
      "/cache/lookup": {
        post: op("Legge la cache scientifica. Non calcola un risultato finto.", "cache", {
          requestBody: jsonBody({ $ref: "#/components/schemas/CrossRequest" }),
        }),
      },
      "/cache/store": {
        post: op("Ricalcola con il motore e poi scrive la cache.", "cache", {
          requestBody: jsonBody({ $ref: "#/components/schemas/CrossRequest" }),
        }),
      },
      "/chat": {
        post: op("Chat sul core. Stessi dati di sito e APK.", "knowledge", {
          requestBody: jsonBody({
            type: "object",
            required: ["message"],
            properties: {
              message: { type: "string" },
              parent_a_id: { type: "string", nullable: true },
              parent_b_id: { type: "string", nullable: true },
            },
          }),
        }),
      },
      "/dashboard": { get: op("Riepilogo. Lo snapshot scientifico è GGS-KNOWLEDGE-000005.", "system") },
      "/crosses/search": {
        post: op("Cerca gli incroci salvati dall'utente.", "crosses", {
          security: [{ bearerSession: [] }],
          requestBody: jsonBody({ type: "object", properties: { q: { type: "string" } } }),
        }),
      },
      "/crosses/{id}": {
        get: op("Un incrocio salvato.", "crosses", {
          security: [{ bearerSession: [] }],
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        }),
      },
      "/predictions": { get: op("Predizioni salvate dall'utente. Nessuna probabilità inventata.", "crosses", { security: [{ bearerSession: [] }] }) },
      "/predictions/{id}": {
        get: op("Una predizione salvata.", "crosses", {
          security: [{ bearerSession: [] }],
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        }),
      },
      "/predictions/{id}/outcome": {
        post: op("Aggiunge un'osservazione. Non riscrive la predizione.", "crosses", {
          security: [{ bearerSession: [] }],
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        }),
      },
      "/observations": {
        post: op("Osservazione privata.", "crosses", { security: [{ bearerSession: [] }] }),
      },
      "/observations/promote": {
        post: op("Promozione a record globale. Richiede un revisore.", "knowledge", { security: [{ bearerSession: [] }] }),
      },
      "/knowledge/ingest": {
        post: op("Stesso ingresso di POST /evidence. Non crea letteratura da sola.", "knowledge", { security: [{ bearerSession: [] }] }),
      },
      "/account/claim-admin": { post: op("Primo amministratore, una sola volta.", "system", { security: [{ bearerSession: [] }] }) },
      "/account/api-keys": { post: op("Crea una chiave gg_.", "system", { security: [{ bearerSession: [] }] }) },
      "/account/export": { get: op("Esporta i dati dell'utente.", "system", { security: [{ bearerSession: [] }] }) },
      "/account/delete": { post: op("Cancella i dati privati dell'utente.", "system", { security: [{ bearerSession: [] }] }) },
      "/strains": {
        post: op("Registra un nome non risolto. Non lo fonde con un omonimo.", "strains", { security: [{ bearerSession: [] }] }),
      },
      "/tools": {
        post: op("Alias di /tools/{tool}. Il nome del plugin non è un endpoint.", "system", {
          requestBody: jsonBody({ type: "object", additionalProperties: true }),
        }),
      },
      "/tools/{tool}": {
        post: op("Strumento del core. Il nome del plugin ChatGPT non è un endpoint.", "system", {
          parameters: [{ name: "tool", in: "path", required: true, schema: { type: "string" } }],
          requestBody: jsonBody({ type: "object", additionalProperties: true }),
        }),
      },
    },
  };
}

export function openApiDocsHtml(): string {
  const spec = JSON.stringify(openApiDocument(), null, 2)
    .replaceAll("&", "&")
    .replaceAll("<", "<");
  return `<!doctype html>
<html lang="it">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>G&G API</title>
<style>
  body { margin: 0; background: #121410; color: #e7efe0; font: 15px/1.45 ui-sans-serif, system-ui; }
  main { max-width: 920px; margin: 0 auto; padding: 32px 20px 64px; }
  h1 { font-family: Palatino, serif; font-weight: 500; }
  a { color: #c6e07a; }
  pre { overflow: auto; background: #1c2118; border: 1px solid #343b2e; border-radius: 12px; padding: 16px; }
</style>
<main>
  <h1>GREED & GROSS — contratto API</h1>
  <p>Core scientifico unico. Questo documento descrive le route realmente registrate. Il dominio pubblico non è configurato: il server relativo è <code>/api/v1</code>.</p>
  <p><a href="/api/v1/openapi.json">openapi.json</a></p>
  <pre>${spec}</pre>
</main>
</html>`;
}
