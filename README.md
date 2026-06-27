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
                  ──→ Wellness (RHF, HRV, Schlaf, Gewicht)   ├──→ generate-data.js
                  ──→ Power Curves (Bestleistungen)          │         │
                                                              │         ▼
Open-Meteo API ────→ Historisches Wetter (Senftenberg) ──────┤   data/rides.json
               ────→ Wetter-Forecast (bis 16 Tage)          │         │
                                                              │         │
data/subjective.json ──→ Befinden Plan 2 (via Dashboard)    ─┘         │
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
- Trainingsverteilung nach Wochentag (Heatmap, Farbskala grün→rot)
- Meilensteine als Gantt-Diagramm mit Phasen-Hintergründen und Hover-Details

### Tab: Charts
Alle Linien- und Zeit-Charts sind horizontal scrollbar — neue Daten verlängern den Chart automatisch nach rechts. Scrollbare Charts zeigen einen Plan-1/Plan-2-Divider mit Labels.

| Block | Charts |
|---|---|
| 💪 Fitness & Belastung | PMC (CTL/ATL/TSB, Sweet-Spot-Zone, scrollbar), Wöchentliches Volumen (phasengefärbt, 200km-Zielzone), TRIMP pro Woche (absoluter Farbgradient grün→rot) |
| ⚡ Leistung | Power Curve (Bestleistungen mit anaerober Reserve-Fläche, W/kg-Toggle), Aerobe Effizienz (W/bpm), Tempo vs. HF Scatter, Tempo / Kadenz / HF Entwicklung (scrollbar, IQR-gefiltert) |
| ❤️ Aerobe Gesundheit | Aerobe Entkopplung (Pw:Hr), HRV Vorher/Nachher-Slider, Ruhepuls Vorher/Nachher-Slider, Schlaf (Dauer + Schlaf-HF kombiniert, täglich) |
| 🌤️ Wetterbedingungen | Temperatur & Wind pro Woche (Balken + Windlinie, Ampel-Farbcodierung) |

**Power Curve:** Bestleistungen von 1s (Sprintkraft) bis 60min (Ausdauer) aus der intervals.icu API. Roter Bereich über der FTP-Linie = anaerobe Reserve. W/kg-Toggle zeigt die gewichtsnormierte Leistung (Körpergewicht aus Apple Health via intervals.icu Wellness).

**TRIMP Farbskala:** grün = <400 (Erholung) · gelb = 400–600 (moderat) · orange = 600–900 (hoch) · rot = >900 (sehr hoch). Erholungswochen sind bewusst grün.

**HRV & Ruhepuls:** Vorher/Nachher-Slider mit getrennten Skalen — Plan 1 (Apple Health RMSSD) und Plan 2 (intervals.icu SDNN) sind nicht direkt vergleichbar.

**Heatmap:** Farbskala grün→gelb→orange→rot nach Fahrtenhäufigkeit pro Wochentag. Samstag ist mit Abstand der aktivste Tag.

**Wetter:** Historische Wetterdaten von Open-Meteo (Senftenberg) werden pro Fahrt automatisch zugeordnet — Temperatur, gefühlte Temperatur, Wind, Luftfeuchtigkeit, Niederschlag. Plan-2-Fahrten bekommen Wetter für den exakten Fahrtzeitraum, Plan-1-Fahrten den Tagesdurchschnitt. Im Fahrtenbuch als farbcodierte Ampel-Spalte (grün/gelb/rot). Wochenbalken-Chart zeigt Temperaturverlauf und Windentwicklung über den gesamten Trainingszeitraum.

### Tab: Fahrtenbuch
Sortier- und filterbare Tabelle aller Fahrten mit Klick-Filter aus dem Volumen-Chart. Plan-2-Fahrten haben ein Befinden-Dropdown das direkt per GitHub API ins Repo schreibt — kein Notion nötig. Wetter-Spalte mit Ampel-Farbcodierung und Hover-Tooltip (Temperatur, gefühlte Temperatur, Wind, Luftfeuchtigkeit, Bewölkung, Niederschlag). Legende für Befinden und Wetter unterhalb der Tabelle. Tab-Position bleibt beim Reload erhalten (URL-Hash).

### Tab: Planung
Alle geplanten Trainingseinheiten bis W12 auf einen Blick. Sessions werden automatisch als "erledigt" markiert sobald eine Fahrt mit passendem Datum in intervals.icu erfasst wird. Wetter-Forecast via Open-Meteo (bis 16 Tage voraus) zeigt Bedingungen für kommende Sessions. Strukturierte Intervall-Workouts (Sweet Spot / Schwelle / VO₂max) können per Knopfdruck zu intervals.icu gepusht werden — von dort landen sie automatisch auf dem Wahoo ELEMNT Roam.

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
| Körpergewicht | — | intervals.icu Wellness (Apple Health Sync) → W/kg in Power Curve |
| Schlaf (Dauer, Schlaf-HF) | — | intervals.icu (Apple Health Sync, täglich) |
| Befinden | Notion (manuell) | Dropdown im Dashboard → `data/subjective.json` → GitHub API |
| Notizen | Notion | `data/subjective.json` |
| Wetter (historisch) | Notion (manuell) | Open-Meteo Archive API (Senftenberg, stündlich, automatisch) |
| Wetter (Forecast) | — | Open-Meteo Forecast API (bis 16 Tage, für Planungs-Tab) |
| Geplante Sessions | — | `PLANNED_SESSIONS` in `generate-data.js` → `data/rides.json` |

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

### Workout-Push zu intervals.icu einrichten

Im Planungs-Tab können strukturierte Workouts direkt zu intervals.icu gepusht werden. Beim ersten Klick auf "Workout pushen" werden API-Key und Athlete-ID abgefragt und im `localStorage` gespeichert. Die Workouts erscheinen anschließend in intervals.icu und werden beim nächsten Wahoo-Sync auf den ELEMNT Roam übertragen.

### Git-Workflow

Die GitHub Action committed Daten automatisch alle 6h. `subjective.json` ist lokal per `skip-worktree` geschützt — Git ignoriert lokale Änderungen an der Datei, sodass sie nie versehentlich überschrieben wird:

```powershell
# Einmalig einrichten
git update-index --skip-worktree data/subjective.json
git config --global alias.sync "!git fetch origin && git push --force-with-lease origin main"

# Danach immer nur noch
git sync
```

Falls `subjective.json` bewusst lokal bearbeitet werden soll:

```powershell
git update-index --no-skip-worktree data/subjective.json
```

---

## Trainingsplan Plan 2

12-Wochen pyramidale Periodisierung, FTP 193W → Ziel ≥210W:

| Block | Wochen | Intensität | Do-Intervall | Sa-Z2 |
|---|---|---|---|---|
| Sweet Spot | W1–W3 | 84–97% FTP | 3×10 → 3×12 → 2×20 min | 70–100 km |
| Erholung | W4 | Volumen −50% | nur Z2 locker | 60 km |
| Schwelle | W5–W7 | 95–105% FTP | 3×8 → 3×10 → 2×20 min | 80–100 km |
| Erholung | W8 | Volumen −50% | nur Z2 locker | 60 km |
| VO₂max | W9–W11 | 106–120% FTP | 5×3 → 6×3 → 4×4 min | 80–100 km |
| Taper + Test | W12 | Ausleiten | Aktivierung | Ramp-Test |

**Wochenstruktur:** Di Gruppenfahrt · Do Strukturierte Intervalle · Sa Lange Z2 (HF ≤152 bpm)  
**Equipment:** Favero Assioma PRO MX-1 Power Meter · Wahoo ELEMNT Roam v3 · TRACKR Brustgurt

---

## Roadmap

### ✅ Abgeschlossen — Dashboard & Training
- [x] Dashboard auf GitHub Pages (statisch, kein Backend)
- [x] Dual-Source Sync: Plan 1 (Notion) + Plan 2 (intervals.icu)
- [x] intervals.icu API — Rides, Wellness, Schlaf, Power Curves
- [x] PMC-Chart (CTL/ATL/TSB) mit Sweet-Spot-Zone, Plan-Divider, scrollbar
- [x] Power Curve aus intervals.icu mit anaerober Reserve-Fläche und W/kg-Toggle
- [x] Wöchentliches Volumen mit 200km-Zielzone und Phasenfarben
- [x] TRIMP mit absolutem Farbgradient (grün→rot nach trainingswiss. Grenzwerten)
- [x] Scrollbare Charts — neue Daten verlängern automatisch nach rechts
- [x] Aerobe Entkopplung (Pw:Hr), HRV & Ruhepuls Vorher/Nachher-Slider
- [x] Schlaf-Chart täglich (Dauer + Schlaf-HF, unabhängig von Rides)
- [x] Aktivitäts-Heatmap in der Übersicht
- [x] Meilensteine als Gantt-Diagramm mit Phasen und Hover-Details
- [x] IQR-Ausreißerfilter in Small-Multiple-Charts (Kadenz, Tempo, HF)
- [x] Befinden-Dropdown im Fahrtenbuch mit GitHub API Write
- [x] IF-basierte Typ-Inferenz für außerplanmäßige Plan-2-Fahrten
- [x] W/kg-Toggle in Power Curve (Körpergewicht aus intervals.icu Wellness / Apple Health)
- [x] Wetter-Integration via Open-Meteo — historisches Wetter pro Fahrt, Ampel-Farbcodierung, Wochenbalken-Chart mit Windlinie
- [x] Planungs-Tab mit Wetter-Forecast, Workout-Visualisierung und Push zu intervals.icu
- [x] Tab-Position bleibt beim Reload erhalten (URL-Hash)

### ✅ Abgeschlossen — Infrastruktur
- [x] Pages-Deploy direkt in Sync-Action integriert (kein separater Workflow)
- [x] `subjective.json` per `skip-worktree` vor versehentlichem Überschreiben geschützt
- [x] Git-Alias `git sync` für sicheren Push trotz Action-Auto-Commits

### 🔲 Geplant — Dashboard & Training
- [ ] Wochennotizen im Fahrtenbuch editierbar (aktuell nur Befinden)
- [ ] Vergleichsansicht Plan 1 vs. Plan 2 — CTL-Kurve beider Pläne nebeneinander
- [ ] Kadenz-Ziel-Tracking: Anteil der Fahrten über 90 RPM
- [ ] Herzfrequenz-Zonen-Verteilung pro Fahrt (Z1–Z5 als Balken im Fahrtenbuch)

### 🔲 Geplant — Manuelles Testen (QA-Portfolio)
- [ ] Testplan für Dashboard-Funktionalität (Navigation, Filter, Dropdown, Charts)
- [ ] Strukturierte Testfälle nach ISTQB-Standard (Äquivalenzklassen, Grenzwerte)
- [ ] Bug-Reports für gefundene Defekte als GitHub Issues
- [ ] Testbericht mit Testergebnis-Zusammenfassung

### 🔲 Geplant — API-Testing & Mocking (QA-Portfolio)
- [ ] Postman Collection für intervals.icu API (Rides, Wellness, Power Curves)
- [ ] Postman Collection für Notion API (Plan 1 Datenbank)
- [ ] WireMock-Stubs für intervals.icu und Notion API — entkoppeltes Testen ohne echte API
- [ ] Automatisierte API-Tests gegen WireMock in GitHub Actions integrieren

### 🔲 Geplant — Automatisierung (QA-Portfolio)
- [ ] Selenium-Testfälle für Dashboard-UI (Tab-Navigation, Chart-Rendering, Dropdown)
- [ ] XPath-Selektoren für stabile Element-Lokalisierung
- [ ] Testautomatisierung in GitHub Actions CI-Pipeline integrieren

### 🔲 Geplant — Docker (QA-Portfolio)
- [ ] `Dockerfile` für lokale Entwicklung — kein Node.js-Setup nötig
- [ ] Docker-Container für `generate-data.js` Sync-Skript
- [ ] `docker-compose.yml` für vollständige lokale Entwicklungsumgebung

---

## Projektkontext

Dieses Dashboard ist ein Dual-Purpose-Projekt: primär ein persönliches Trainingsanalyse-Tool, sekundär ein reales Praxisprojekt im Rahmen einer QA-Ausbildung bei Masterschool. Die Daten-Pipeline (Notion → intervals.icu → GitHub Actions → GitHub Pages) dient gleichzeitig als Testobjekt für STLC-Dokumentation, API-Testing mit Postman und Automatisierung mit Selenium/XPath.

📁 QA-Portfolio: [github.com/Stuhlsen/Portfolio](https://github.com/Stuhlsen/Portfolio)
