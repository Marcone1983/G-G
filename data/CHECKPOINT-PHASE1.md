# G&G PHASE 1 — checkpoint ufficiale

Salvato prima dell'audit AS-IS. Nessuna modifica scientifica ulteriore in quel momento.
Fotografia: cervello scientifico unico sullo snapshot `GGS-KNOWLEDGE-000003`.
Postgres, HTTPS, release Android e genomica di campione restavano bloccati.

## A. Architecture before — PARTIAL, poi chiusa nel codice

Due cervelli. Il motore ragionava sul catalogo in memoria (`ggs-snap-1.0.1` / `ggs-snap-1.2.0`). Il file `data/gg-foundation.sqlite` serviva solo per conteggi. Cache, snapshot e retrieval erano separati. Senza `DATABASE_URL` le predizioni utente stavano in PGLite in memoria.

## B. Architecture after — IMPLEMENTED per la scienza, PARTIAL per gli utenti

- Source of truth scientifica: `data/gg-foundation.sqlite` (WAL). Ruolo: `SOURCE_OF_TRUTH`.
- Postgres: `NOT_CONFIGURED`. Non è attivo.
- Il database applicativo (sessioni, chiavi, incroci salvati) non è un secondo dataset. Senza `DATABASE_URL` non sopravvive al riavvio.
- `GET /api/v1/foundation/search` chiama `retrieve()`. Non è un secondo motore.
- Web, API e il sorgente Android interrogano `/api/v1`.

## C. File modified

`src/lib/gg/brain.ts`, `services.server.ts`, `engine.ts`, `engine.test.ts`, `disciplines.ts`, `foundation.server.ts`, `http.server.ts`, `openapi.ts`, `chat.ts`, `catalog.server.ts`, `package.json`, `android/app/src/main/java/science/gg/breeding/data/GgApi.kt`, `android/app/build.gradle.kts`.

## D. File created

`src/lib/gg/brain.test.ts`, `scripts/unify-brain.py`, `data/unify-reconciliation.json`, `data/backups/gg-foundation-pre-unify.sqlite`, `data/backups/pre-unify-manifest.json`.

## E. File deprecated

Nessun file cancellato. Il retrieve locale in `foundation.server.ts` è stato rimosso. Il file resta una facciata più i conteggi per nome.

## F. Database migrations — IMPLEMENTED, additive

Nessun `DELETE`. Colonne e tabelle aggiunte sullo stesso file: `identity_decisions`, `graph_edges`, `literature_records`, `analysis_log`, `audit_events`, `retrieval_events`, `files.sha256`, `measurements.zero_semantics`, `canonical_entities.homonym_status`, snapshot `GGS-KNOWLEDGE-000003`. Gli snapshot `gg-foundation-1` e `gg-foundation-2` restano.

## G. Tables before/after

Le tabelle scientifiche preesistenti sono intatte. Il grafo è una tabella di archi, non un secondo database e non Neo4j.

## H. Row counts before/after — IMPLEMENTED

| Oggetto | Prima | Dopo | Backup riletto |
|---|---:|---:|---:|
| source_records | 783429 | 783429 | 783429 |
| samples | 762770 | 762770 | — |
| observation_units | 783429 | 783429 | — |
| measurements | 8750800 | 8750800 | 8750800 |
| canonical_entities | 20337 | 20337 | 20337 |
| pedigree_edges | 28592 | 28592 | 28592 |
| aliases | 15974 | 15974 | 15974 |
| claims | 27782 | 27782 | — |

`information_loss: false`. Il backup è un altro inode. Il file vivo è cresciuto per schema, cache e log aggiunti.

## I–R. Stato dichiarato in quel checkpoint

Riconciliazione riletta da `qualityReport()`. File con SHA-256: 12/12. Predizioni calibrate: 0.
Decisioni identità 783429, `score_kind = NOT_A_PROBABILITY`. Nessuna riga `EXACT_IDENTITY` né `PROBABLE_MATCH`.
Entità: `DISTINCT_ENTITY` 1024, `PROBABLE_IDENTITY` 19313.
Gelato non fuso: 5 entità, 5 breeder. 601 righe, 572 campioni indipendenti, 12 laboratori.
Misure: numerici 6413733, qualificatore e valore insieme 0, zeri di fonte 1987959.
Pedigree 28592 `REPORTED_PARENT`. `genomic_samples` 0, `variants` 0. Peso 0,45 = euristica, non probabilità.
Grafo 64909 archi. Un solo `retrieve()`. Cache semantica solo `GGS-KNOWLEDGE-000003`. Le righe `gg-foundation-2` non sono hit.
Test `engine.test.ts` + `brain.test.ts`: 17 pass, 0 fail.

## W. Blocker lasciati aperti

- PostgreSQL: `DATABASE_URL` assente.
- HTTPS pubblico e URL di release Android vuoto di proposito.
- Redis e rate limit distribuito.
- Genomica di campioni e varianti: 0.
- Testo grezzo della cella chimica non archiviato.
- Worker, coda, prediction calibrata, promozione `VALIDATED`: non implementati, di proposito in quella fase.

## X. Dipendenze della fase successiva

Postgres raggiungibile senza copia cieca di 8,7 milioni di righe, host reale per l'APK, split discovery/validation che rispetti il lineage. Fino ad allora una conclusione senza evidenza resta `NOT_COMPUTABLE`.
