# Fahrplan 3, DKR4 — eigenstaendiges, versioniertes Migrate-Image.
# Baeckt supabase/migrations/*.sql in ein dbmate-Image ein, damit der
# Migrationsschritt (anders als der lokale Bind-Mount in
# docker-compose.selfhost.yml, s. docs/docker-lokal-einrichten.md
# Abschnitt 3) als eigenstaendiges Artefakt zu Tonys apps01 uebertragen
# werden kann — kein Host-Pfad, kein Quellcode, der dort erst
# zusammengesetzt wird.
FROM ghcr.io/amacneil/dbmate:2.35.1
LABEL org.opencontainers.image.source="https://github.com/Stuhlsen/training-dashboard"
COPY migrations /db/migrations
CMD ["--wait", "up"]
