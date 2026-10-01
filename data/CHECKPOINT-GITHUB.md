# Checkpoint — 2026-10-01

Repository: https://github.com/Marcone1983/G-G

Branch: main

Non sono nel repository, perché GitHub rifiuta i file sopra 100 MB o perché sono segreti:

- data/gg-foundation.sqlite e i backup
- i CSV grezzi in data/raw/
- android/keystore.properties e android/keystore/gg-upload.jks

Il workflow .github/workflows/ci.yml parte su ogni push e compila l'APK debug. La release parte se i secret di firma sono configurati.
