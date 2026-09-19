# docs/ — Wegweiser

**Seit 2026-09-19:** Fahrplan-Historie, Konzeptdokumente und das Archiv leben
nicht mehr hier, sondern im privaten `planning`-Repo (`planning/docs/` bzw.
`planning/docs/archiv/`) — lokal im selben Arbeitsverzeichnis unter
`planning/` eingecheckt, aber nicht Teil dieses öffentlichen Repos. Grund:
LP2 (`planning/ideen-backlog.md`) — der öffentliche Verlauf beschriebener
Fahrpläne zeigte über die Zeit mehr von der Vorgehensweise/Roadmap, als für
ein Produkt sinnvoll ist; die Grenze "was ist gebaut" vs. "wie/warum wurde
geplant" war nicht klar genug gezogen.

## Was hier bleibt

Nichts weiter als diese Datei. Die verbindlichen, weiterhin öffentlichen
Referenzen für Architektur, Befehle, Commit-Konvention und Konventionen
stehen unchanged in **`../AGENTS.md`** (Repo-Root) und **`../CLAUDE.md`**,
sowie in den modul-lokalen READMEs unter `app/src/**`. Bei jeder Aufgabe
zuerst dort nachsehen — das war schon vor diesem Umzug die Quelle der
Wahrheit, nicht `docs/`.

## Wo die Doku jetzt liegt

- **`planning/docs/`** — die bisherigen laufenden Fahrpläne, Anleitungen
  (Docker, Sync-Handoff) und Konzeptdokumente.
- **`planning/docs/archiv/`** — abgeschlossene Phasen-Konzepte, überholte
  Fahrpläne, Vanilla-Ära-Grundlagendokumente.
- **`planning/ideen-backlog.md`** — Ideen-Backlog, wie zuvor.

Wer lokal an diesem Repo arbeitet (Alex, Claude Code in dieser Umgebung) hat
`planning/` ohnehin im selben Arbeitsverzeichnis liegen — der Umzug ändert
nichts an der lokalen Auffindbarkeit, nur an der öffentlichen Sichtbarkeit
auf GitHub.
