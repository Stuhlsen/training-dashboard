# 🚴 Radsport Trainingsdashboard

Persönliches Radsport-Trainingsdashboard — statisch, kostenfrei, vollautomatisch. Leistungs-, HRV-, Schlaf- und Wellness-Daten aus intervals.icu und Apple Health werden per GitHub Action alle 6 Stunden synchronisiert und als statisches JSON ausgeliefert. Kein Backend, kein Framework, keine laufenden Kosten.

**Zeitraum:** März 2026 – laufend  
**Plan 1:** Basisaufbau — 12 Wochen, ~1.956 km, CTL 1→59, FTP 166→193 W (März–Juni 2026)  
**Plan 2:** FTP & Fitness — 12 Wochen, pyramidale Periodisierung, Ziel ≥210 W (Juni–September 2026)

🔗 **Live:** [stuhlsen.github.io/training-dashboard](https://stuhlsen.github.io/training-dashboard)  
📁 **QA-Portfolio:** [github.com/Stuhlsen/Portfolio](https://github.com/Stuhlsen/Portfolio)

---

## Architektur

```
Notion DB (Plan 1) ──────────────────────────────────────────┐
                                                              │
intervals.icu API ──→ Ride-Metriken (Power, HR, TSS …)       │
                  ──→ Wellness (RHF, HRV, Schlaf)            ├──→ generate-data.js
                  ──→ Power Curves (Bestleistungen)          │         │
                                                              │         ▼
data/subjective.json ──→ Befinden Plan 2 (via Dashboard)    ─┘   data/rides.json
                                                                        │
GitHub Action (alle 6h) ────────────────────────────────────────────────┘
        │
        └──→ GitHub Pages Deploy (automatisch nach jedem Sync)
```

**Tech-Stack:** Vanilla HTML/CSS/JS · SVG-Charts (kein Framework, kein Build-Step) · Node.js · GitHub Actions

---

## Features

### Tab: Übersicht
- Hero mit Kurzbeschreibung beider Pläne für Außenstehende
- KPIs: Gesamtdistanz, FTP, Fahrtenanzahl, Trainingszeit
- Aktivitäts-Heatmap (Wochentag-Verteilung mit km)
- Meilensteine (erste 100-km-Fahrt, FTP-Tests etc.)

### Tab: Charts
Alle Linien- und Zeit-Charts sind horizontal scrollbar — neue Daten verlängern den Chart automatisch nach rechts. Scrollbare Charts zeigen einen Plan-1/Plan-2-Divider mit Labels.

| Block | Charts |
|---|---|
| 💪 Fitness & Belastung | PMC (CTL/ATL/TSB, Sweet-Spot-Zone, scrollbar), Wöchentliches Volumen (phasengefärbt, 200km-Zielzone), TRIMP pro Woche (Intensitätsgradient) |
| ⚡ Leistung | Power Curve (Bestleistungen mit anaerober Reserve-Fläche), Aerobe Effizienz (W/bpm), Tempo vs. HF Scatter, Tempo / Kadenz / HF Entwicklung (scrollbar, IQR-gefiltert) |
| ❤️ Aerobe Gesundheit | Aerobe Entkopplung (Pw:Hr), HRV Vorher/Nachher-Slider, Ruhepuls Vorher/Nachher-Slider, Schlaf (Dauer + Schlaf-HF kombiniert) |

**Power Curve:** Zeigt Bestleistungen von 1s (Sprintkraft) bis 60min (Ausdauer) aus der intervals.icu API. Der rot eingefärbte Bereich über der FTP-Linie visualisiert die anaerobe Reserve.

**HRV & Ruhepuls:** Vorher/Nachher-Slider mit getrennten Skalen pro Plan — Plan 1 (Apple Health RMSSD) und Plan 2 (intervals.icu SDNN) sind nicht direkt vergleichbar.

**Wöchentliches Volumen:** Phasengefärbte Balken (Vorbereitung → Sweet Spot → Schwelle → VO2max) mit 200km-Zielzone.

### Tab: Fahrtenbuch
Sortier- und filterbare Tabelle aller Fahrten mit Klick-Filter aus dem Volumen-Chart. Plan-2-Fahrten haben ein Befinden-Dropdown das direkt per GitHub API ins Repo schreibt — kein Notion-Öffnen nötig.

### Tab: Analyse
Plan-Toggle (Gesamt / Plan 1 / Plan 2), Phasenübersicht mit Detailkarten, Stärken & Entwicklungsfelder.

---

## Datenquellen

| Feld | Plan 1 | Plan 2 |
|---|---|---|
| Ride-Metriken (Power, HR, TSS …) | Notion (manuell eingetragen) | intervals.icu API (automatisch via Wahoo) |
| Power Curve | — | intervals.icu `/power-curves` API |
| Aerobe Entkopplung (Pw:Hr) | — | intervals.icu `decoupling` Feld |
| CTL / ATL / TSB | Notion (manuell berechnet) | intervals.icu (automatisch) |
| Einheitsname & Typ | Notion | Datum-Mapping aus Trainingsplan → IF-Inferenz aus NP/FTP |
| Wellness (RHF, HRV) | Notion (manuell) | intervals.icu + Apple Health (automatisch) |
| Schlaf (Dauer, Schlaf-HF) | — | intervals.icu (Apple Health Sync, täglich) |
| Befinden | Notion (manuell) | Dropdown im Dashboard → `data/subjective.json` → GitHub API |
| Notizen | Notion | `data/subjective.json` |

**Typ-Inferenz Plan 2:** Fahrten ohne Trainingsplan-Match bekommen ihren Typ automatisch aus NP ÷ FTP berechnet (Intensity Factor). Priorität: `subjective.json` > Trainingsplan-Datum-Mapping > IF-Berechnung.

**HRV-Diskrepanz:** Plan 1 = Apple Health RMSSD (Einzelmessung, ~60–116 ms). Plan 2 = intervals.icu SDNN Schlaf-Durchschnitt (~47 ms). Nicht direkt vergleichbar — deshalb getrennte Darstellung mit Slider.

---

## Setup

### Voraussetzungen

- GitHub-Account mit aktiviertem GitHub Pages
- intervals.icu Account mit verbundenem Wahoo / Garmin
- Notion Integration Token (nur für Plan 1 Historik)
- Node.js ≥ 20 (nur für lokale Entwicklung)

### GitHub Secrets

| Secret | Beschreibung |
|---|---|
| `NOTION_API_KEY` | Notion Integration Token (nur für Plan 1) |
| `NOTION_DATABASE_ID` | Plan 1 Trainingsdatenbank-ID |
| `INTERVALS_API_KEY` | intervals.icu API Key (unter Einstellungen → API) |
| `INTERVALS_ATHLETE_ID` | intervals.icu Athlete ID (in der Profil-URL) |

### GitHub Pages einrichten

Settings → Pages → Build and deployment → Source: **GitHub Actions**

Die Sync-Action übernimmt den Deploy direkt — kein separater Pages-Workflow nötig.

### Lokale Entwicklung

```bash
# .env Datei anlegen (wird nicht committet)
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

Das Dashboard schreibt Befinden direkt via GitHub API ins Repo — kein Notion nötig. Einmalig einen Token erstellen:

GitHub → Settings → Developer settings → Personal access tokens → Fine-grained tokens → New token  
Repository: `training-dashboard` · Permissions: **Contents = Read and write**

Token beim ersten Speichern im Dashboard-Dropdown eingeben — wird im `localStorage` gespeichert.

### Git-Workflow

Die GitHub Action committed Daten automatisch alle 6h. Bei Push-Konflikten (PowerShell):

```powershell
# Einmalig als Alias einrichten
git config --global alias.sync "!git fetch origin && git push --force-with-lease origin main"

# Danach immer nur noch
git sync
```

---

## Trainingsplan Plan 2

12-Wochen pyramidale Periodisierung, FTP 193W → Ziel ≥210W:

| Block | Wochen | Intensität | Do-Intervall | Sa-Z2 |
|---|---|---|---|---|
| Sweet Spot | W1–W3 | 88–94% FTP | 3×10 → 3×12 → 2×20 min | 70–100 km |
| Erholung | W4 | Volumen −50% | nur Z2 locker | 60 km |
| Schwelle | W5–W7 | 95–105% FTP | 3×8 → 3×10 → 2×20 min | 80–100 km |
| Erholung | W8 | Volumen −50% | nur Z2 locker | 60 km |
| VO2max | W9–W11 | 106–120% FTP | 5×3 → 6×3 → 4×4 min | 80–100 km |
| Taper + Test | W12 | Ausleiten | Aktivierung | Ramp-Test |

**Wochenstruktur:** Di Gruppenfahrt · Do Strukturierte Intervalle · Sa Lange Z2 (HF ≤150 bpm)  
**Equipment:** Favero Assioma PRO MX-1 Power Meter · Wahoo ELEMNT Roam v3 · TRACKR Brustgurt

---

## Roadmap

**Abgeschlossen**
- [x] Dashboard auf GitHub Pages
- [x] Dual-Source Sync: Plan 1 (Notion) + Plan 2 (intervals.icu)
- [x] intervals.icu API — Rides, Wellness, Schlaf, Power Curves
- [x] PMC-Chart (CTL/ATL/TSB) mit Sweet-Spot-Zone, Plan-Divider, scrollbar
- [x] Power Curve aus intervals.icu `/power-curves` API mit anaerober Reserve-Fläche
- [x] Wöchentliches Volumen mit 200km-Zielzone
- [x] Scrollbare Charts — neue Daten verlängern automatisch nach rechts
- [x] Aerobe Entkopplung (Pw:Hr), TRIMP mit Intensitätsgradient
- [x] HRV & Ruhepuls: Vorher/Nachher-Slider Plan 1 vs. Plan 2
- [x] Schlaf-Chart täglich (Dauer + Schlaf-HF kombiniert, unabhängig von Rides)
- [x] Aktivitäts-Heatmap in der Übersicht, Meilensteine
- [x] IQR-Ausreißerfilter in Small-Multiple-Charts (Kadenz, Tempo, HF)
- [x] Notion Plan 2 vollständig abgelöst durch intervals.icu + subjective.json
- [x] Befinden-Dropdown im Fahrtenbuch mit GitHub API Write
- [x] IF-basierte Typ-Inferenz für außerplanmäßige Plan-2-Fahrten
- [x] Pages-Deploy direkt in Sync-Action integriert (kein doppelter Trigger)
- [x] Git-Alias `git sync` für konfliktfreien Push-Workflow

**Geplant**
- [ ] FTP automatisch aus letztem Ramp-Test-Eintrag ziehen
- [ ] Postman Collection für API-Testing (QA-Portfolio)

---

## Projektkontext

Dieses Dashboard ist ein Dual-Purpose-Projekt: primär ein persönliches Trainingsanalyse-Tool, sekundär ein reales Praxisprojekt im Rahmen einer QA-Ausbildung bei Masterschool. Die Daten-Pipeline (Notion → intervals.icu → GitHub Actions → GitHub Pages) dient gleichzeitig als Testobjekt für STLC-Dokumentation, API-Testing mit Postman und Automatisierung mit Selenium/XPath.

📁 QA-Portfolio: [github.com/Stuhlsen/Portfolio](https://github.com/Stuhlsen/Portfolio)
