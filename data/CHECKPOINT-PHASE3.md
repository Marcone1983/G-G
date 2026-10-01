# Checkpoint — Phase 3, continuazione 3C

Snapshot scientifico corrente: `GGS-KNOWLEDGE-000005`.
`GGS-KNOWLEDGE-000004` non è stato riscritto.
Nessuno snapshot `000006`: non è cambiata nessuna osservazione. `scientific_status` è un asse derivato.

Questa fase non è completa. La predizione resta non calcolabile.

## Cosa è cambiato in questo giro

- 783429 decisioni di identità annotate con `scientific_status`. Lo `status` storico resta.
- `CANONICAL_MATCH` (322) non è più uno stato scientifico. Sul nuovo asse è `PROBABLE_MATCH`, con nota `LEGACY_STATUS_IS_DUPLICATE_KEY_NOT_A_SCIENTIFIC_STATE`.
- `EXACT_IDENTITY` = 0 su entrambi gli assi.
- Vista `identity_scientific`.
- `split_registry`: lo split diagnostico è per `independence_group`. Il family holdout è `NOT_AVAILABLE`.
- La cache dello snapshot corrente non viene più contata su `000004`.
- `GET /sources` e `GET /evaluations` leggono lo stesso store.
- Test sui qualificatori `ND`, `NT`, `<LOQ`, `<LOD`, `LOD`: nessuno ha un valore numerico.

## Conteggi

| | Prima | Dopo |
|---|---:|---:|
| source_records | 783429 | 783429 |
| measurements | 8750800 | 8750800 |
| identity_decisions | 783429 | 783429 |

`information_loss = false`.

Identità scientifica: UNRESOLVED 730705, PROBABLE_MATCH 20659, POSSIBLE_MATCH 18280, CONFLICTING_IDENTITY 13785.

## Stato per fase

| Fase | Stato |
|---|---|
| 3A Persistenza SQLite, backup, snapshot | IMPLEMENTED |
| 3A Postgres di produzione | BLOCKED — `DATABASE_URL` assente. L'app utente usa PGLite. Non è il knowledge store. |
| 3B raw_cell_text | IMPLEMENTED — 8750800/8750800. `JSON_VALUE_REPR` non è byte-exact. |
| 3C Asse identità scientifico | IMPLEMENTED come colonna derivata. `EXACT_IDENTITY` non assegnata. |
| 3D Retrieval unico | IMPLEMENTED. Embedding hash: non è un modello semantico. |
| 3E Grafo | PARTIAL — archi riportati e indice inverso. Non ogni tipo di entità del prompt. |
| 3F Pattern | PARTIAL — registry unico di lettura. Nessun pattern `VALIDATED`. Split legacy non group-aware. |
| 4A Feature store | PARTIAL — definizioni e policy. Nessuna matrice materializzata. |
| 4B Modello dati predittivo | IMPLEMENTED come tabelle. Nessun output numerico. |
| 4C Training | PARTIAL — baseline mediana diagnostica. Non è un modello di cultivar. |
| 4D Gate, OOD, calibrazione | IMPLEMENTED il gate. Calibrazione `NOT_CALIBRATED`. |
| 4E Primo modello validato | NOT_IMPLEMENTED — i dati non lo consentono. |
| 5A Worker | PARTIAL — CLI idempotente, non un demone. |
| 5B Retrain | NOT_IMPLEMENTED |
| 5C API | PARTIAL — contratto OpenAPI allineato alle route presenti. |
| 5D Android release | BLOCKED — nessun host pubblico. `API_BASE_URL` di release resta vuoto. Nessun dominio inventato. |
| 5E Restore | PARTIAL — backup pre-3 aperto, `quick_check` ok, conteggi uguali. Non è un restore su un cluster Postgres. |

## Ricerca

Il primo approdo è il database: entità canoniche, alias, righe di laboratorio. Solo un nome assente da tutti e tre chiama Grok. La scheda torna nello stesso file SQLite, tabelle `acquired_*`, ordinate in ricerca come le altre (nome esatto prima dell'alias) ma con stato `UNRESOLVED` / `GROK_REPORTED`. Non entra in `measurements`, `source_records` o `canonical_entities`. Subito dopo il salvataggio la cache di quel nome viene riscritta. La richiesta successiva è un hit di cache e non richiama il modello. Se la chiave non è iniettata, non viene inventata alcuna scheda.


Modelli in produzione: 0.
Probabilità emesse: 0.
Family leakage: `NOT_AVAILABLE`. I campioni di laboratorio non sono collegati a componenti di pedigree.

## Report

- [phase3-report.json](phase3-report.json) — migrazione 3A–4D precedente.
- [phase3-reconciliation.json](phase3-reconciliation.json) — questo giro, asse identità.
