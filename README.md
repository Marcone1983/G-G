# GREED & GROSS

Piattaforma di intelligenza scientifica per il breeding. Il sito e l'APK sono due client dello stesso backend. Il motore non sta nel telefono.

## Architettura

- Web: TanStack Start, report strutturato e interfaccia di osservatorio.
- API: `/api/v1`, contratto in `GET /api/v1/openapi`.
- Memoria: PostgreSQL (`migrations/0002_gg.sql`). Un incrocio pubblico scrive `gg_crosses`, `gg_predictions` e `gg_cache` senza il testo della chat. Una predizione esistente non si riscrive. Lo snapshot di runtime è la riga in `knowledge_snapshots`, non una costante locale.
- Motore: `src/lib/gg/engine.ts`. Calcolo deterministico, seed e repliche nel rapporto. Nessuna percentuale chimica senza misura.
- Rapporto: `gg-report-architecture-1` è lo stesso oggetto per la chat e per `POST /api/v1/predictions`. `GET /api/v1/predictions/{id}` rilegge quella riga. Un esito `SYNTHETIC_TEST_FIXTURE` resta privato e non cambia la calibrazione.
- Vettori: il hashing trick è `BASELINE_NOT_SEMANTIC_MODEL`, non un embedding. Redis non è configurato: un cache HIT arriva solo da `gg_cache` se modello, snapshot e schema coincidono.
- Android: `android/`, Kotlin, Jetpack Compose, `science.gg.breeding`. Non è una WebView.

## API

Autenticazione con sessione o `Authorization: Bearer`. Le chiavi `gg_` sono hashate. Operazioni di revisione (ingestione, stato dei pattern, invalidazione cache, cultivar non verificata) richiedono un ruolo reviewer/admin.

Una cultivar creata via API nasce `IDENTITY_UNVERIFIED`, senza pedigree inventato. Un'evidenza nuova resta `PENDING` e non entra nello snapshot.

## Android

```
cd android && ./gradlew assembleDebug
./gradlew assembleRelease
```

Application id `science.gg.breeding`, versione `1.1.0` (versionCode 2). SDK di compilazione 36, minSdk 26. Kotlin 2.2.21, Gradle 8.14.3, Android Gradle Plugin 8.13.2.

La release firmata rifiuta il cleartext. L'utente indica l'URL HTTPS del server. Nell'APK non ci sono chiavi di database né chiavi del modello.

## Privacy

Osservazioni e incroci sono dell'account. La promozione alla conoscenza condivisa è bloccata se il testo contiene email o telefono. Export e cancellazione sono `GET /api/v1/account/export` e `POST /api/v1/account/delete`.

## Test

`npm test` esegue il motore, inclusa la regressione sui dieci incroci di controllo. Quei casi non sono una classifica e non sono trattati come verità di laboratorio.
