# AI content reporting

The app screen "Segnala contenuto" posts to `/api/v1/content-reports` while the user is signed in.

Kinds: incorrect, offensive, unsafe, misleading, scientifically_unsupported, privacy, image.

The server stores a row only in `content_reports`. If the database is absent, the response is not stored and the app does not say that it was.

This is the in-app flag required for AI-generated content. It does not leave the app.
