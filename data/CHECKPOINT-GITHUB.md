# Checkpoint — repository G-and-G

Data: 2026-10-01

Repository: https://github.com/Marcone1983/G-and-G

Il nome `G&G` non è ammesso da GitHub. Il repository è `G-and-G`, privato.

Non sono nel repository, perché superano il limite GitHub o sono segreti:

- `data/gg-foundation.sqlite` e i backup
- i CSV grezzi in `data/raw/`
- `android/keystore.properties` e `android/keystore/gg-upload.jks`

Il corpus locale resta la baseline già verificata. Questo checkpoint non modifica le misure.

Il workflow `.github/workflows/ci.yml` parte su ogni push. Compila l'APK debug e, se i secret di firma sono presenti, anche la release. L'artefatto si scarica dalla run di Actions, non da un URL inventato.

Ambiente di questo checkpoint: locale. Non è un deploy di produzione.
