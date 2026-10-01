# Checkpoint Phase 4

Snapshot scientifico corrente: `GGS-KNOWLEDGE-000005`.
`GGS-KNOWLEDGE-000004` non è stato riscritto.
Nessun nuovo snapshot: la ricerca bloccata non è conoscenza accettata.

Questa fase non è chiusa. Il provider live è `LIVE_PROVIDER_BLOCKED`.

## Conteggi riletti, non copiati dall'audit

| oggetto | n |
|---|---|
| source_records | 783429 |
| samples | 762770 |
| measurements | 8750800 |
| raw_cell_text NULL | 0 |
| canonical_entities | 20337 |
| aliases | 15974 |
| pedigree_edges | 28592 |
| claims | 27782 |
| graph_edges | 93501 |
| label_patterns | 112523 |
| pattern_candidates | 21848 |
| catalog_gaps | 551 `DECLARED_NOT_IN_FILE` |
| genomic_samples | 0 |
| model_versions EVALUATED | 1 |
| production models | 0 |

`raw_cell_text` non è stato rifatto. Il confronto cella-per-cella col CSV in questo turno è `NOT_RUN`, quindi lo stato resta `NOT_VERIFIED_RAW` anche se i NULL sono zero.

## Cosa è stato aggiunto

- Un classificatore unico (`classify.ts`): cross, multi-parent, chimica, pedigree, genetica, fenotipo, breeder, pattern. `parser_confidence` è sempre null. Lo score è `NOT_A_PROBABILITY`.
- Parent di un cross salvati per posizione, non in una stringa. Tre nomi producono ruoli A, B, P3.
- `BLOCKED` distinto da `RESEARCH_FAILED` quando il provider risponde 403 / spending-limit. Nessuna scheda inventata. Il retry è sospeso per 30 minuti, poi è di nuovo ammesso.
- `GET /api/v1/research/status` senza segreti.
- `knowledgeRepository` è una facciata sulle funzioni già esistenti. Non è un secondo database.
- Predizione: `prediction_probability` resta null.

## Hardening di questo passaggio

- `A + B` con spazi è `COMBINATION_QUERY`. Non scrive un pedigree. `A + x B` resta un cross. `Nome + Feminized` resta un nome di prodotto, non una combinazione.
- Il nome grezzo resta distinto dalla chiave di lookup. Il `+` commerciale non viene cancellato dal testo utente; la chiave del corpus lo piega ancora, e l'operazione è registrata.
- `POST /api/v1/research` risponde 503 se il provider è bloccato o assente, 502 se la ricerca fallisce per altro. Non è un 200 che finge successo. La chat non dice «non conosco questo strain».
- Brier score è una funzione reale. Nessun modello di produzione è calibrato.
- La capability matrix segna GENOMICS, MODEL, CALIBRATION e ENVIRONMENT come `MISSING` sui dati attuali. La probabilità numerica resta `NOT_COMPUTABLE`.

## Blocchi reali

- LIVE_PROVIDER_TEST: BLOCKED, HTTP 403, `personal-team-blocked:spending-limit`. Non ho simulato Grok.
- Postgres: `DATABASE_URL` assente. SQLite resta la fonte.
- Redis: non configurato.
- Genomica: NOT_AVAILABLE.
- Predizione: NOT_COMPUTABLE. Un modello è `EVALUATED`. Zero modelli di produzione. Niente calibrazione su outcome reali. Niente gruppi di progenie indipendenti.
- I 551 record di catalogo non sono stati inventati. Stato `DECLARED_NOT_IN_FILE`, non `RECONSTRUCTED`.
- Foreign key fisiche sull'intero corpus: non applicate. Nessuna riga cancellata per soddisfarle.
- Worker: CLI idempotente, non una coda. La ricerca HTTP è ancora sincrona.
- Android release: `API_BASE_URL` vuoto. Non è una release finale.
- Pattern VALIDATED: 0. Nessuna auto-promozione.
- Confronto raw cell contro CSV: `NOT_VERIFIED_RAW`.
