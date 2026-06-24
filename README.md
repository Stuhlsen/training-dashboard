# 🚴 Training Dashboard

Statisches Dashboard für Radsport-Trainingsdaten mit automatisiertem Daten-Sync aus Notion und intervals.icu. Gehostet auf GitHub Pages — kein Backend, keine laufenden Kosten.

**Athlet:** Alexander Müller · **Zeitraum:** März 2026 – laufend
**Plan 1:** Basisaufbau (12 Wochen, ~2.100 km, FTP 0→193W)
**Plan 2:** FTP & Fitness aufbauen (12 Wochen, pyramidale Periodisierung, Ziel ≥210W)

## Architektur

```
                              ┌──→ Ride-Metriken (Power, HR, TSS, Decoupling...)
intervals.icu API ────────────┤
                              └──→ Wellness (RHF, HRV, Schlaf)

Notion DB (Plan 1) ──→ Komplett (historisch)     ┐
Notion DB (Plan 2) ──→ Nur Befinden + Notizen    ├──→ rides.json ──→ GitHub Pages
                                                  │
GitHub Action (alle 6h) ──────────────────────────┘
```

## Features

- **Übersicht:** KPIs, Meilensteine, Gesamtstatistiken
- **Fitness & Belastung:** PMC-Chart (CTL/ATL/TSB), Wochenvolumen (phasengefärbt), Wöchentlicher TSS, TRIMP
- **Leistung:** Aerobe Effizienz (W/bpm), Tempo vs. HF Scatter, Tempo/Kadenz-Trends
- **Aerobe Gesundheit:** Aerobe Entkopplung (Pw:Hr), HRV + Ruhepuls mit Trendlinien (nach Plan getrennt)
- **Erholung & Wellness:** Wochentag-Heatmap
- **Fahrtenbuch:** Sortier- und filterbare Tabelle aller Fahrten
- **Analyse:** Plan-Toggle (Plan 1 / Plan 2 / Gesamt), Phasenübersicht, Detailkarten, Stärken & Entwicklungsfelder
- **Ausklappbare Sektionen:** Thematisch gruppiert, einzeln auf-/zuklappbar

## Datenquellen

| Daten | Plan 1 | Plan 2 |
|---|---|---|
| Ride-Metriken | Notion (manuell) | intervals.icu API (automatisch) |
| Wellness (RHF, HRV) | Notion (manuell) | intervals.icu + Apple Health (automatisch) |
| Befinden / Notizen | Notion | Notion (einziges manuelles Feld) |
| Woche / Phase | Notion | Automatisch per Datum zugeordnet |

## GitHub Secrets

| Secret | Beschreibung |
|---|---|
| `NOTION_API_KEY` | Notion Integration Token |
| `NOTION_DATABASE_ID` | Plan 1 Trainingsdatenbank |
| `NOTION_DATABASE_ID_PLAN2` | Plan 2 Trainingsdatenbank |
| `INTERVALS_API_KEY` | intervals.icu API Key |
| `INTERVALS_ATHLETE_ID` | intervals.icu Athlete ID |

## Lokale Entwicklung

```bash
node scripts/generate-data.js    # JSON generieren
npx serve .                      # Lokal testen
```

## Roadmap

- [x] Dashboard von Netlify auf GitHub Pages migriert
- [x] Dual-DB Sync (Plan 1 + Plan 2)
- [x] intervals.icu API Integration (Rides + Wellness)
- [x] Plan-Trennung in der Analyse (Toggle)
- [x] Ausklappbare Themen-Sektionen
- [x] PMC-Chart (CTL / ATL / TSB)
- [x] Aerobe Entkopplung Trend-Chart
- [x] HRV/Ruhepuls nach Plan getrennt
- [x] Wöchentlicher TSS Chart
- [x] Trendlinien auf HRV- und Ruhepuls-Charts
- [ ] Power Curve Visualisierung
- [ ] Postman Collection für API-Testing (QA-Lernprojekt)
