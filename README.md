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
Notion DB (Plan 1) ──────────────────────────────────────────────────┐
                                                                      │
intervals.icu API ──→ Ride-Metriken (Power, HR, TSS …)               │
                  ──→ Wellness (RHF, HRV, Schlaf, Gewicht)           ├──→ generate-data.js
                  ──→ Power Curves (Bestleistungen)                  │         │
                  ──→ Vergleichsathlet (Siggi Lentes, read-only)     │         ▼
                                                                      │   data/rides.json
Open-Meteo API ────→ Historisches Wetter (Archive API)               │   data/rides-2.json
               ────→ Aktuelles Wetter (Forecast API, letzte 3 Tage) ─┘         │
               ────→ Planungs-Forecast (16 Tage, serverseitig)                 │
                                                                                │
data/subjective.json ──→ Befinden Plan 2 (via Dashboard, GitHub API)           │
data/adjustments.json ──→ Session-Anpassungen (Verschiebung, Ausfall)          │
                                                                                │
GitHub Action (alle 6h) ────────────────────────────────────────────────────────┘
        │
        └──→ GitHub Pages Deploy (automatisch nach jedem Sync)
```

**Tech-Stack:** Vanilla HTML/CSS/JS · SVG-Charts (kein Framework, kein Build-Step) · Node.js · GitHub Actions

---

## Features

### Athleten-Toggle
Das Dashboard unterstützt zwei Athleten: **Alex Stuhlsen** (eigener Trainingsplan) und **Siggi Lentes** (Vergleichsdaten, read-only). Der Toggle oben rechts im Header wechselt die Ansicht — alle Charts, Texte und Erklärtexte passen sich automatisch an den aktiven Athleten an. Die Auswahl bleibt persistent über Reload (localStorage), sodass jeder beim Reload wieder bei seinem eigenen Datensatz landet.

Unterschiede bei Vergleichsdaten:
- Kein Trainingsplan, keine Planungs-Phase, kein Befinden-Dropdown
- Typ-Inferenz über IF-Berechnung (NP ÷ FTP) + Fahrtdauer als Kriterium
- Strava-Historik vor intervals.icu-Beitritt als additiver Kontext-KPI in der Übersicht
- Planungs-Tab vollständig ausgeblendet

### Tab: Übersicht
- Hero mit athletenabhängiger Kurzbeschreibung
- KPIs: Gesamtdistanz (inkl. optionaler Strava-Historik für Vergleichsathleten), FTP, Fahrtenanzahl, Trainingszeit
- Trainingsverteilung nach Wochentag (Heatmap, Farbskala grün→rot)
- Meilensteine als Gantt-Diagramm mit Phasen-Hintergründen (nur beim eigenen Plan)

### Tab: Charts

Alle Linien- und Zeit-Charts sind horizontal scrollbar — neue Daten verlängern den Chart automatisch nach rechts. Drei Charts haben einen **Wochen/Monats-Toggle** (oben rechts im Chart-Header) der die Aggregationsebene umschaltet — die Auswahl ist persistent pro Athlet.

| Block | Charts |
|---|---|
| 💪 Fitness & Belastung | PMC (CTL/ATL/TSB, Sweet-Spot-Zone, scrollbar), Wöchentliches/Monatliches Volumen (Toggle, phasengefärbt, 200km-Zielzone beim eigenen Plan), TRIMP pro Woche/Monat (Toggle, absoluter Farbgradient grün→rot) |
| ⚡ Leistung | Power Curve (Bestleistungen mit anaerober Reserve-Fläche, FTP-Linie, W/kg-Toggle), Aerobe Effizienz (W/bpm), Tempo vs. HF Scatter, Tempo / Kadenz / HF Entwicklung (scrollbar, IQR-gefiltert, 90-RPM-Ziellinie beim eigenen Plan) |
| ❤️ Aerobe Gesundheit | Aerobe Entkopplung (Pw:Hr), HRV (Plan-Compare oder Wellness-Verlauf), Ruhepuls (Plan-Compare oder Wellness-Verlauf), Schlaf (Dauer + Schlaf-HF, täglich, 7h-Ziel beim eigenen Plan) |
| 🌤️ Wetterbedingungen | Temperatur & Wind pro Woche/Monat (Toggle, Balken + Windlinie, Ampel-Farbcodierung) |

**Power Curve:** Bestleistungen von 1s (Sprintkraft) bis 60min (Ausdauer) aus intervals.icu. Roter Bereich über FTP-Linie = anaerobe Reserve. W/kg-Toggle zeigt gewichtsnormierte Leistung.

**TRIMP Farbskala:** grün = <400 (Erholung) · gelb = 400–600 (moderat) · orange = 600–900 (hoch) · rot = >900 (sehr hoch).

**HRV & Ruhepuls:** Beim eigenen Plan: Plan-Compare mit Segment-Trennung (Plan 1 / W0 / Plan 2) und getrennten Trendlinien — weil Plan 1 Apple Health RMSSD und Plan 2 intervals.icu SDNN nutzt (unterschiedliche Messmethoden). Bei Vergleichsathleten: durchgehender Verlauf direkt aus Wellness-Daten (alle Tage, nicht nur Fahrtdaten).

**Wochen/Monats-Toggle:** Volumen, TRIMP und Wetter können zwischen Wochen- und Monatsaggregation umgeschaltet werden. Toggle-Status ist persistent pro Athlet.

**Wetter:** Alle Standortdaten (Koordinaten) liegen ausschließlich als GitHub Secrets — niemals im Code, nie in der JSON, nie im Frontend-JavaScript. Historisches Wetter, aktuelles Wetter (letzte 3 Tage) und der 16-Tage-Planungs-Forecast werden ausschließlich serverseitig in der GitHub Action berechnet. Pro Fahrt wird das Wetter für den exakten Fahrt-Zeitraum ermittelt. Beide Athleten nutzen getrennte Standort-Secrets.

### Tab: Fahrtenbuch
Sortier- und filterbare Tabelle aller Fahrten mit Klick-Filter aus dem Volumen-Chart. Fahrten am selben Tag werden nach Startzeitpunkt sortiert. Befinden-Dropdown nur bei eigenen Plan-2-Fahrten. Wetter-Spalte mit Ampel-Farbcodierung und Hover-Tooltip. Bei Vergleichsdaten: keine Befinden-Spalte, keine Befinden-Legende.

### Tab: Planung (nur eigener Plan)
Alle geplanten Trainingseinheiten bis W12. Sessions werden automatisch als „erledigt" markiert sobald eine passende intervals.icu-Fahrt gefunden wird — mit Soll-Ist-Vergleich (Distanz, Watt, HF, Kadenz, Dauer, TRIMP/CTL, Wetter, Befinden). Wetter-Forecast serverseitig (kein Standort im Frontend). Strukturierte Workouts können per Knopfdruck zu intervals.icu gepusht werden. Bidirektionale Verlinkung mit dem Fahrtenbuch. Sessions können verschoben oder als ausgefallen markiert werden.

### Tab: Analyse (nur eigener Plan)
Plan-Toggle (Gesamt / Plan 1 / Plan 2), Phasenübersicht mit Detailkarten, Stärken & Entwicklungsfelder.

---

## Datenquellen

| Feld | Plan 1 | Plan 2 | Vergleich (Siggi) |
|---|---|---|---|
| Ride-Metriken (Power, HR, TSS …) | Notion (manuell) | intervals.icu API | intervals.icu API |
| Power Curve | — | intervals.icu `/power-curves` | intervals.icu `/power-curves` |
| CTL / ATL / TSB | Notion (manuell) | intervals.icu (automatisch) | intervals.icu (automatisch) |
| FTP | 166→193W (historisch) | 193W (Ramp-Test, hardcodiert bis W12) | 265W (Ramp-Test, hardcodiert) |
| Einheitstyp | Notion | Datum-Mapping → IF-Inferenz | IF-Inferenz (NP ÷ FTP) + Dauer |
| Wellness (RHF, HRV) | Notion (manuell) | intervals.icu + Apple Health | intervals.icu + Apple Health |
| Schlaf | — | intervals.icu (Apple Health Sync) | intervals.icu (Apple Health Sync) |
| Befinden | Notion (manuell) | Dashboard-Dropdown → `subjective.json` | — |
| Wetter | Notion (manuell) | Open-Meteo (automatisch, Secrets) | Open-Meteo (automatisch, eigene Secrets) |
| Wetter-Forecast | — | Open-Meteo Forecast, serverseitig | — |
| Geplante Sessions | — | `PLANNED_SESSIONS` in `generate-data.js` | — |
| Plan-Anpassungen | — | `data/adjustments.json` | — |

**Typ-Inferenz:** NP ÷ FTP = Intensity Factor (IF). Fahrten unter IF 0,75 werden zusätzlich nach Dauer klassifiziert — ≥120 min = Z2 Lang, ≥60 min = Z2 Dauer, <60 min = Z1 Recovery. Priorität: Notion/Planungsfeld > Datum-Mapping > IF-Inferenz.

**HRV-Diskrepanz:** Plan 1 = Apple Health RMSSD (~60–116 ms). Plan 2 = intervals.icu SDNN Schlaf-Durchschnitt (~40–50 ms). Nicht direkt vergleichbar — deshalb getrennte Darstellung mit Plan-Divider und separaten Trendlinien.

---

## Setup

### Voraussetzungen
- GitHub-Account mit aktiviertem GitHub Pages
- intervals.icu Account (Wahoo / Garmin verbunden)
- Notion Integration Token (nur für Plan 1 Historik)
- Node.js ≥ 20 (nur für lokale Entwicklung)

### GitHub Secrets

| Secret | Beschreibung |
|---|---|
| `NOTION_API_KEY` | Notion Integration Token (nur für Plan 1) |
| `NOTION_DATABASE_ID` | Plan 1 Trainingsdatenbank-ID |
| `INTERVALS_API_KEY` | intervals.icu API Key (Alex) |
| `INTERVALS_ATHLETE_ID` | intervals.icu Athlete ID (Alex) |
| `INTERVALS_API_KEY_2` | intervals.icu API Key (Siggi, optional) |
| `INTERVALS_ATHLETE_ID_2` | intervals.icu Athlete ID (Siggi, optional) |
| `WEATHER_LAT` | Breitengrad Alex (Dezimalgrad mit Punkt, z.B. `51.5253`) |
| `WEATHER_LON` | Längengrad Alex (Dezimalgrad mit Punkt, z.B. `14.0016`) |
| `WEATHER_LAT_2` | Breitengrad Siggi (optional) |
| `WEATHER_LON_2` | Längengrad Siggi (optional) |

⚠️ **Standortdaten:** Koordinaten niemals im Code oder in JSON-Dateien eintragen — ausschließlich über GitHub Secrets. Der Wetter-Forecast wird serverseitig in der Action berechnet und nur als aggregierte Wetterwerte in `rides.json` gespeichert.

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
WEATHER_LAT=...
WEATHER_LON=...

# JSON generieren
node scripts/generate-data.js

# Lokal testen
npx serve .
```

### Befinden-Dropdown einrichten

GitHub → Settings → Developer settings → Personal access tokens → Fine-grained tokens → New token  
Repository: `training-dashboard` · Permissions: **Contents = Read and write**

Token beim ersten Speichern im Dashboard-Dropdown eingeben — wird im `localStorage` gespeichert.

### Workout-Push zu intervals.icu

Im Planungs-Tab können strukturierte Workouts direkt zu intervals.icu gepusht werden. Beim ersten Klick auf „Workout pushen" werden API-Key und Athlete-ID abgefragt und im `localStorage` gespeichert.

### Git-Workflow

Die GitHub Action committed Daten automatisch alle 6h. `subjective.json` und `adjustments.json` werden durch den Action-Workflow vor Überschreiben geschützt:

```powershell
# Empfohlener Alias
git config --global alias.sync "!git fetch origin && git push --force-with-lease origin main"

# Normaler Workflow
git add <dateien>
git commit -m "..."
git sync
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
- [x] Zweiter Athlet (Siggi Lentes) als Vergleichsdaten — read-only, eigene intervals.icu-Verbindung
- [x] Athleten-Toggle mit persistenter Auswahl (localStorage, überlebt Reload + F5)
- [x] Alle Charts, Texte, Legenden und Ziellinien athletenabhängig angepasst
- [x] PMC-Chart (CTL/ATL/TSB) mit Sweet-Spot-Zone, Plan-Divider, scrollbar
- [x] Power Curve mit anaerober Reserve-Fläche, athletenabhängiger FTP-Linie, W/kg-Toggle
- [x] Wöchentliches Volumen mit Phasenfarben, 200km-Zielzone (nur eigener Plan)
- [x] TRIMP mit absolutem Farbgradient
- [x] **Wochen/Monats-Toggle** für Volumen, TRIMP und Wetter — persistent pro Athlet
- [x] Scrollbare Charts
- [x] HRV & Ruhepuls — Plan-Compare beim eigenen Plan, Wellness-Verlauf bei Vergleichsathleten
- [x] Schlaf-Chart täglich (Dauer + Schlaf-HF, 7h-Ziel nur eigener Plan)
- [x] IQR-Ausreißerfilter in Small-Multiple-Charts
- [x] Befinden-Dropdown im Fahrtenbuch mit GitHub API Write (nur eigene Plan-2-Fahrten)
- [x] IF + Dauer-basierte Typ-Inferenz für unklassifizierte Fahrten
- [x] Fahrtenbuch: Sortierung nach Startzeitpunkt als Tiebreaker bei gleichem Datum
- [x] Planungs-Tab mit serverseitigem Wetter-Forecast, Workout-Push, Soll-Ist-Vergleich
- [x] Bidirektionale Verlinkung Planungs-Tab ↔ Fahrtenbuch
- [x] Tab-Position bleibt beim Reload erhalten (URL-Hash)

### ✅ Abgeschlossen — Datenschutz & Infrastruktur
- [x] **Alle Standortdaten ausschließlich in GitHub Secrets** — kein Koordinaten-Hardcode im Code oder JSON
- [x] Wetter-Forecast serverseitig — Frontend hat niemals Zugriff auf Koordinaten
- [x] Getrennte Standort-Secrets für beide Athleten
- [x] Pages-Deploy direkt in Sync-Action integriert
- [x] `subjective.json` und `adjustments.json` durch Action-Workflow geschützt

### 🔲 Geplant — Dashboard & Training
- [ ] Wochennotizen im Fahrtenbuch editierbar
- [ ] Vergleichsansicht Plan 1 vs. Plan 2 — CTL-Kurve beider Pläne nebeneinander
- [ ] Kadenz-Ziel-Tracking: Anteil der Fahrten über 90 RPM
- [ ] Herzfrequenz-Zonen-Verteilung pro Fahrt

### 🔲 Geplant — Manuelles Testen (QA-Portfolio)
- [ ] Testplan für Dashboard-Funktionalität
- [ ] Strukturierte Testfälle nach ISTQB-Standard
- [ ] Bug-Reports als GitHub Issues
- [ ] Testbericht

### 🔲 Geplant — API-Testing & Mocking (QA-Portfolio)
- [ ] Postman Collection für intervals.icu API und Notion API
- [ ] WireMock-Stubs für entkoppeltes Testen
- [ ] Automatisierte API-Tests in GitHub Actions

### 🔲 Geplant — Automatisierung (QA-Portfolio)
- [ ] Selenium-Testfälle für Dashboard-UI
- [ ] Testautomatisierung in GitHub Actions CI-Pipeline

### 🔲 Geplant — Docker (QA-Portfolio)
- [ ] `Dockerfile` und `docker-compose.yml` für lokale Entwicklung

---

## Projektkontext

Dieses Dashboard ist ein Dual-Purpose-Projekt: primär ein persönliches Trainingsanalyse-Tool, sekundär ein reales Praxisprojekt im Rahmen einer QA-Ausbildung bei Masterschool. Die Daten-Pipeline (Notion → intervals.icu → GitHub Actions → GitHub Pages) dient gleichzeitig als Testobjekt für STLC-Dokumentation, API-Testing mit Postman und Automatisierung mit Selenium/XPath.

📁 QA-Portfolio: [github.com/Stuhlsen/Portfolio](https://github.com/Stuhlsen/Portfolio)
