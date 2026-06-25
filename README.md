# 🚴 Training Dashboard

Persönliches Radsport-Trainingsdashboard — statisch, kostenfrei, vollautomatisch. Daten aus Notion und intervals.icu werden per GitHub Action alle 6 Stunden synchronisiert und als statische JSON ausgeliefert. Kein Backend, kein Framework, keine laufenden Kosten.

**Athlet:** Alexander Müller · **Zeitraum:** März 2026 – laufend  
**Plan 1:** Basisaufbau (12 Wochen, ~1.956 km, CTL 1→59, FTP 166→193 W)  
**Plan 2:** FTP & Fitness (12 Wochen, pyramidale Periodisierung, Ziel ≥210 W)

🔗 **Live:** [stuhlsen.github.io/training-dashboard](https://stuhlsen.github.io/training-dashboard)

---

## Architektur

```
intervals.icu API ────────────┬──→ Ride-Metriken (Power, HR, TSS, Decoupling …)
                              └──→ Wellness (RHF, HRV, Schlaf)

Notion DB (Plan 1) ──→ Historisch, komplett          ┐
Notion DB (Plan 2) ──→ Nur Befinden + Notizen        ├──→ data/rides.json
                                                      │
GitHub Action (alle 6h) ──────────────────────────────┘
                                                      │
                                                      └──→ GitHub Pages (statisch)
```

**Tech-Stack:** Vanilla HTML/CSS/JS · SVG-Charts (kein Framework, kein Build-Step) · Node.js Sync-Skript · GitHub Actions

---

## Features

### Übersicht
- Hero-KPIs (Gesamtdistanz, FTP, CTL, Fahrten)
- Aktivitäts-Heatmap (Wochentag-Verteilung)
- Meilensteine (erste 100-km-Fahrt, Ramp-Test, etc.)

### Charts
Alle Linien-Charts sind horizontal scrollbar — neue Daten verlängern den Chart automatisch nach rechts.

| Block | Charts |
|---|---|
| 💪 Fitness & Belastung | PMC (CTL/ATL/TSB mit Sweet-Spot-Zone), Wöchentliches Volumen (phasengefärbt), TRIMP-Belastung |
| ⚡ Leistung | Aerobe Effizienz (W/bpm), Tempo vs. HF Scatter, Tempo/Kadenz/HF-Trends |
| ❤️ Aerobe Gesundheit | Aerobe Entkopplung (Pw:Hr), HRV-Vergleich Plan 1/2, Ruhepuls-Vergleich Plan 1/2 |

HRV und Ruhepuls nutzen einen **Vorher/Nachher-Slider**: Plan 1 (links) und Plan 2 (rechts) auf getrennten Skalen — da RMSSD und SDNN nicht direkt vergleichbar sind.

### Fahrtenbuch
Sortier- und filterbare Tabelle aller Fahrten, klickbarer Wochenfilter aus Volumen-Chart.

### Analyse
Plan-Toggle (Gesamt / Plan 1 / Plan 2), Phasenübersicht, Detailkarten, Stärken & Entwicklungsfelder.

---

## Datenquellen

| Feld | Plan 1 | Plan 2 |
|---|---|---|
| Ride-Metriken | Notion (manuell eingetragen) | intervals.icu API (automatisch) |
| Aerobe Entkopplung | — | intervals.icu `decoupling` |
| Wellness (RHF, HRV) | Notion (manuell) | intervals.icu + Apple Health (automatisch) |
| Befinden / Notizen | Notion | Notion (einziges manuelles Feld in Plan 2) |
| CTL / ATL / TSB | Notion (berechnet) | intervals.icu (automatisch) |

**HRV-Diskrepanz:** Plan 1 = Apple Health RMSSD (Einzelmessung, ~60–116 ms). Plan 2 = intervals.icu SDNN Schlaf-Durchschnitt (~47 ms). Werte sind **nicht** direkt vergleichbar → getrennte Darstellung mit eigenem Maßstab.

---

## Setup

### GitHub Secrets

| Secret | Beschreibung |
|---|---|
| `NOTION_API_KEY` | Notion Integration Token |
| `NOTION_DATABASE_ID` | Plan 1 Trainingsdatenbank-ID |
| `NOTION_DATABASE_ID_PLAN2` | Plan 2 Trainingsdatenbank-ID |
| `INTERVALS_API_KEY` | intervals.icu API Key |
| `INTERVALS_ATHLETE_ID` | intervals.icu Athlete ID |

### Lokale Entwicklung

```bash
# Umgebungsvariablen setzen (PowerShell)
$env:NOTION_API_KEY="..."
$env:INTERVALS_API_KEY="..."
$env:INTERVALS_ATHLETE_ID="..."

# JSON generieren
node scripts/generate-data.js

# Lokal testen
npx serve .
```

### Deployment

GitHub Pages ist auf `main`-Branch aktiviert. Die Action läuft automatisch alle 6 Stunden sowie bei jedem Push. Bei Merge-Konflikten nach Action-Auto-Commit (PowerShell):

```powershell
git fetch origin
git push --force-with-lease origin main
```

---

## Roadmap

**Abgeschlossen**
- [x] Dashboard auf GitHub Pages (von Netlify migriert)
- [x] Dual-DB Sync: Plan 1 (Notion) + Plan 2 (intervals.icu)
- [x] intervals.icu API Integration — Rides + Wellness
- [x] PMC-Chart (CTL / ATL / TSB) mit Sweet-Spot-Zone und Plan-Divider
- [x] Scrollbare Charts (PMC, Tempo, Kadenz, HF) — wachsen mit den Daten
- [x] Aerobe Entkopplung (Pw:Hr) Trend-Chart
- [x] HRV & Ruhepuls: Vorher/Nachher-Slider Plan 1 vs. Plan 2
- [x] TRIMP-Chart mit Intensitätsgradient
- [x] Aktivitäts-Heatmap in der Übersicht
- [x] Phasengefärbte Wochenvolumen-Balken
- [x] Fahrtenbuch mit Wochenfilter aus Chart-Klick
- [x] Analyse-Tab mit Plan-Toggle

**Geplant**
- [ ] Power Curve Visualisierung
- [ ] Postman Collection für API-Testing (QA-Portfolio)
- [ ] Mobile-Optimierung der Slider-Interaktion

---

## Projektkontext

Dieses Dashboard ist ein **Dual-Purpose-Projekt**: primär Trainingsanalyse, sekundär QA-Portfolio-Projekt im Rahmen einer Masterschool QA-Ausbildung. Die Daten-Pipeline (Notion → intervals.icu → JSON → GitHub Pages) dient gleichzeitig als reales Testobjekt für STLC-Dokumentation, API-Testing mit Postman und Selenium-Automatisierung.

📁 QA-Portfolio: [github.com/Stuhlsen/Portfolio](https://github.com/Stuhlsen/Portfolio)
