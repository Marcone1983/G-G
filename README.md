# GREED & GROSS

Piattaforma di intelligenza scientifica per il breeding. Il sito e l'APK sono due client dello stesso backend. Il motore non sta nel telefono.

## Architettura

- Web: TanStack Start, report strutturato e interfaccia di osservatorio.
- API: `/api/v1`, contratto in `GET /api/v1/openapi`.
- Memoria: PostgreSQL (`migrations/0002_gg.sql`). Lo snapshot di conoscenza è versionato. Le predizioni storiche non si riscrivono.
- Motore: `src/lib/gg/engine.ts`. Calcolo deterministico, seed e repliche nel rapporto. Nessuna percentuale chimica senza misura.
- Vettori: cosine in-process sul hashing trick. pgvector non è attivo su questo Postgres; Redis non è configurato. La cache durevole è la tabella `gg_cache`.
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
