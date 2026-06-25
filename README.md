# 🚴 Radsport Trainingsdashboard

Persönliches Radsport-Trainingsdashboard — statisch, kostenfrei, vollautomatisch. Leistungs-, HRV- und Schlafdaten aus intervals.icu und Apple Health werden per GitHub Action alle 6 Stunden synchronisiert und als statisches JSON ausgeliefert. Kein Backend, kein Framework, keine laufenden Kosten.

**Zeitraum:** März 2026 – laufend  
**Plan 1:** Basisaufbau (12 Wochen, ~1.956 km, CTL 1→59, FTP 166→193 W, März–Juni 2026)  
**Plan 2:** FTP & Fitness (12 Wochen, pyramidale Periodisierung, Ziel ≥210 W, Juni–September 2026)

🔗 **Live:** [stuhlsen.github.io/training-dashboard](https://stuhlsen.github.io/training-dashboard)

---

## Architektur

```
intervals.icu API ──→ Ride-Metriken (Power, HR, Decoupling, CTL/ATL/TSB …)
                  ──→ Wellness (RHF, HRV, Schlaf via Apple Health)

Notion DB (Plan 1) ──→ Historisch, komplett (alle Felder manuell)

data/subjective.json ──→ Befinden Plan 2 (Dashboard-Eingabe via GitHub API)

GitHub Action (alle 6h) ──→ data/rides.json + data/wellness.json
                        ──→ GitHub Pages (statisch)
```

**Tech-Stack:** Vanilla HTML/CSS/JS · SVG-Charts (kein Framework, kein Build-Step) · Node.js Sync-Skript · GitHub Actions

---

## Features

### Übersicht
- Hero-KPIs (Gesamtdistanz, FTP, Fahrten, Trainingszeit)
- Kurzbeschreibung beider Trainingspläne für Außenstehende
- Aktivitäts-Heatmap (Wochentag-Verteilung)
- Meilensteine (erste 100-km-Fahrt, Ramp-Test etc.)

### Charts
Alle Linien-Charts sind horizontal scrollbar — neue Daten verlängern den Chart automatisch nach rechts. Plan-1/Plan-2-Divider mit Labels in jedem scrollbaren Chart.

| Block | Charts |
|---|---|
| 💪 Fitness & Belastung | PMC (CTL/ATL/TSB mit Sweet-Spot-Zone), Wöchentliches Volumen (phasengefärbt), TRIMP-Belastung (Intensitätsgradient) |
| ⚡ Leistung | Aerobe Effizienz (W/bpm), Tempo vs. HF Scatter, Tempo/Kadenz/HF-Entwicklung (scrollbar, Ausreißer-gefiltert) |
| ❤️ Aerobe Gesundheit | Aerobe Entkopplung (Pw:Hr), HRV Vorher/Nachher-Slider Plan 1/2, Ruhepuls Vorher/Nachher-Slider, Schlaf (Dauer + Schlaf-HF) |

HRV und Ruhepuls nutzen einen **Vorher/Nachher-Slider**: Plan 1 (links) und Plan 2 (rechts) auf getrennten Skalen — RMSSD und SDNN sind nicht direkt vergleichbar.

### Fahrtenbuch
Sortier- und filterbare Tabelle aller Fahrten. Plan-2-Fahrten haben ein Befinden-Dropdown das direkt ins Repo schreibt.

### Analyse
Plan-Toggle (Gesamt / Plan 1 / Plan 2), Phasenübersicht, Detailkarten, Stärken & Entwicklungsfelder.

---

## Datenquellen

| Feld | Plan 1 | Plan 2 |
|---|---|---|
| Ride-Metriken | Notion (manuell) | intervals.icu API (automatisch) |
| Einheitsname & Typ | Notion (manuell) | Trainingsplan-Mapping → IF-Berechnung aus NP/FTP |
| Aerobe Entkopplung | — | intervals.icu `decoupling` |
| CTL / ATL / TSB | Notion (berechnet) | intervals.icu (automatisch) |
| Wellness (RHF, HRV) | Notion (manuell) | intervals.icu + Apple Health (automatisch) |
| Schlaf | — | intervals.icu (Apple Health Sync) |
| Befinden | Notion (manuell) | Dashboard-Dropdown → `data/subjective.json` → GitHub API |
| Notizen | Notion | `data/subjective.json` |

**Typ-Inferenz Plan 2:** Fahrten ohne Trainingsplan-Match bekommen ihren Typ automatisch aus NP ÷ FTP berechnet (IF-basiert). Manueller Eintrag in `subjective.json` hat immer Vorrang.

**HRV-Diskrepanz:** Plan 1 = Apple Health RMSSD (~60–116 ms). Plan 2 = intervals.icu SDNN Schlaf-Durchschnitt (~47 ms). Nicht direkt vergleichbar → getrennte Darstellung.

---

## Setup

### GitHub Secrets

| Secret | Beschreibung |
|---|---|
| `NOTION_API_KEY` | Notion Integration Token (nur für Plan 1) |
| `NOTION_DATABASE_ID` | Plan 1 Trainingsdatenbank-ID |
| `INTERVALS_API_KEY` | intervals.icu API Key |
| `INTERVALS_ATHLETE_ID` | intervals.icu Athlete ID |

### Lokale Entwicklung

```bash
# .env Datei anlegen
NOTION_API_KEY=...
NOTION_DATABASE_ID=...
INTERVALS_API_KEY=...
INTERVALS_ATHLETE_ID=...

# JSON generieren
node scripts/generate-data.js

# Lokal testen
npx serve .
```

### Befinden-Dropdown einrichten

Das Dashboard schreibt Befinden direkt via GitHub API ins Repo. Einmalig einen Token erstellen:

GitHub → Settings → Developer settings → Personal access tokens → Fine-grained tokens → New token  
Repository: `training-dashboard` · Permissions: Contents = **Read and write**

Token beim ersten Speichern im Dashboard eingeben — wird in `localStorage` gespeichert.

### Deployment

GitHub Pages auf `main`-Branch. Action läuft automatisch alle 6h und bei jedem Push. Bei Merge-Konflikten nach Action-Auto-Commit (PowerShell):

```powershell
git fetch origin
git push --force-with-lease origin main
```

---

## Trainingsplan Plan 2

12-Wochen pyramidale Periodisierung, FTP 193W → Ziel ≥210W:

| Block | Wochen | Inhalt | Do-Intervall |
|---|---|---|---|
| Sweet Spot | W1–W3 | 88–94% FTP | 3×10 → 3×12 → 2×20 min |
| Erholung | W4 | Volumen −50% | nur Z2 |
| Schwelle | W5–W7 | 95–105% FTP | 3×8 → 3×10 → 2×20 min |
| Erholung | W8 | Volumen −50% | nur Z2 |
| VO2max | W9–W11 | 106–120% FTP | 5×3 → 6×3 → 4×4 min |
| Taper + Test | W12 | Ausleiten | Ramp-Test |

Wochenstruktur: Di Gruppenfahrt · Do Strukturierte Intervalle · Sa Lange Z2 (≤150 bpm)  
Alle Intervalle outdoor per Favero Assioma PRO MX-1 Power Meter.

---

## Roadmap

**Abgeschlossen**
- [x] Dashboard auf GitHub Pages (von Netlify migriert)
- [x] Dual-Source Sync: Plan 1 (Notion) + Plan 2 (intervals.icu)
- [x] intervals.icu API Integration — Rides + Wellness + Schlaf
- [x] PMC-Chart (CTL/ATL/TSB) mit Sweet-Spot-Zone, Plan-Divider, scrollbar
- [x] Scrollbare Charts mit Auto-Scroll zu aktuellen Daten
- [x] Aerobe Entkopplung (Pw:Hr) Trend-Chart
- [x] HRV & Ruhepuls: Vorher/Nachher-Slider Plan 1 vs. Plan 2
- [x] Schlaf-Chart (Dauer + Schlaf-HF kombiniert)
- [x] TRIMP-Chart mit Intensitätsgradient
- [x] Aktivitäts-Heatmap in der Übersicht
- [x] Ausreißer-Filterung (IQR) in Small-Multiple-Charts
- [x] Notion Plan 2 abgelöst durch intervals.icu + subjective.json
- [x] Befinden-Dropdown im Fahrtenbuch mit GitHub API Write
- [x] IF-basierte Typ-Inferenz für außerplanmäßige Fahrten

**Geplant**
- [ ] Power Curve Visualisierung
- [ ] FTP automatisch aus letztem Ramp-Test-Eintrag ziehen
- [ ] Postman Collection für API-Testing (QA-Portfolio)

---

## Projektkontext

Dual-Purpose-Projekt: primär Trainingsanalyse, sekundär QA-Portfolio-Projekt im Rahmen einer Masterschool QA-Ausbildung. Die Daten-Pipeline dient gleichzeitig als reales Testobjekt für STLC-Dokumentation, API-Testing mit Postman und Selenium-Automatisierung.

📁 QA-Portfolio: [github.com/Stuhlsen/Portfolio](https://github.com/Stuhlsen/Portfolio)
