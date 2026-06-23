# 🚴 Training Dashboard

Statisches Dashboard für Radsport-Trainingsdaten mit automatisiertem Daten-Sync aus Notion. Gehostet auf GitHub Pages — kein Backend, keine laufenden Kosten.

**Athlet:** Alexander Müller · **Zeitraum:** März 2026 – laufend
**Plan 1:** Basisaufbau (12 Wochen, ~2.100 km, FTP 0→193W)
**Plan 2:** FTP & Fitness aufbauen (12 Wochen, pyramidale Periodisierung, Ziel ≥210W)

## Architektur

```
Notion DB (Plan 1) ──┐
                      ├── GitHub Action ──→ data/rides.json ──→ GitHub Pages
Notion DB (Plan 2) ──┘    (alle 6h)                              (statisch)
```

Secrets (API-Keys, DB-IDs) liegen als GitHub Secrets — nie im Code, nie im Browser.

## Features

- **Übersicht:** KPIs, Meilensteine, Gesamtstatistiken
- **Charts:** Wochenvolumen (phasengefärbt), CTL/ATL-Verlauf, TRIMP, Effizienz (W/bpm), HRV + Ruhepuls mit Trendlinien, Heatmap
- **Tabelle:** Sortier- und filterbare Ansicht aller Fahrten
- **Analyse:** Phasenübersicht getrennt nach Plan 1 / Plan 2, Detailkarten, Stärken & Entwicklungsfelder

## Projektstruktur

```
training-dashboard/
├── index.html                  Hauptseite
├── .github/workflows/
│   └── sync-data.yml           GitHub Action: Notion → JSON
├── scripts/
│   └── generate-data.js        Daten-Generator (beide Notion-DBs)
├── data/
│   └── rides.json              Generierte Trainingsdaten
└── assets/
    ├── css/                    Styling (main, components, charts, table)
    └── js/
        ├── config.js           Einstellungen (FTP, Zonen, Meilensteine)
        ├── utils.js            Hilfsfunktionen, Formatierung
        ├── data.js             Datenladen + Fallback
        ├── charts.js           SVG-Charts (CTL, HRV, Effizienz, etc.)
        ├── overview.js         Hero-Bereich, Metriken, Meilensteine
        ├── table.js            Sortierbare Datentabelle
        ├── analysis.js         Phasenanalyse, Detailkarten
        └── app.js              Einstiegspunkt, Orchestrierung
```

## GitHub Secrets

| Secret | Beschreibung |
|---|---|
| `NOTION_API_KEY` | Notion Integration Token |
| `NOTION_DATABASE_ID` | Plan 1 Trainingsdatenbank |
| `NOTION_DATABASE_ID_PLAN2` | Plan 2 Trainingsdatenbank |
| `INTERVALS_API_KEY` | intervals.icu API Key (für zukünftige Integration) |
| `INTERVALS_ATHLETE_ID` | intervals.icu Athlete ID |

## Lokale Entwicklung

```bash
# .env anlegen mit den Secrets (nie committen!)
# Dann JSON lokal generieren:
node scripts/generate-data.js

# Seite lokal testen (braucht HTTP-Server für fetch):
npx serve .
# oder: python3 -m http.server
```

## Häufige Anpassungen

| Was | Wo |
|---|---|
| FTP / eFTP aktualisieren | `assets/js/config.js` → `ftp`, `eFTP` |
| Neuer Meilenstein | `assets/js/config.js` → `manualMilestones` |
| Daten manuell synchen | Actions → "Sync Training Data" → "Run workflow" |

## Technologie

- **Frontend:** Vanilla HTML/CSS/JS, SVG-Charts (kein Build-Step)
- **Datenquelle:** Notion API (zwei Datenbanken)
- **Hosting:** GitHub Pages (statisch, kostenlos)
- **CI/CD:** GitHub Actions (Cron alle 6h + manueller Trigger)

## Roadmap

- [x] Dashboard von Netlify auf GitHub Pages migriert
- [x] Dual-DB Sync (Plan 1 + Plan 2)
- [x] Plan-Trennung in der Analyse
- [x] Trendlinien auf HRV- und Ruhepuls-Charts
- [x] Erweiterte Felder: TSS, IF, VI, ATL/TSB, Aerobe Entkopplung
- [ ] intervals.icu API Integration (automatischer Ride-Import)
- [ ] Plan-Filter-Toggle im Dashboard (Plan 1 / Plan 2 / Alle)
- [ ] Aerobe Entkopplung Trend-Chart
- [ ] Power Curve Visualisierung
- [ ] Postman Collection für API-Testing (QA-Lernprojekt)
