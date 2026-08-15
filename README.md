# 🚴 Radsport Trainingsdashboard

Persönliches Radsport-Trainingsdashboard mit zwei Datenpfaden: **Lesedaten** (Leistungs-, HRV-, Schlaf- und Wellness-Werte aus intervals.icu und Apple Health) werden per GitHub Action alle 6 Stunden synchronisiert und als statisches JSON ausgeliefert — kein Server, keine laufenden Kosten. **Schreibdaten** (Login, Ziele, Events, tägliches Befinden, Trainingskarten, Trainer-Vorschläge) laufen über Supabase (Free Tier, Row Level Security) und machen aus dem ursprünglich rein statischen Dashboard eine interaktive Mehrbenutzer-App mit Athlet-, Trainer- und Besucher-Rolle.

**Trainingshistorie:** März 2026 – laufend, FTP 166 W → 193 W (Basisaufbau, März–Juni) → laufendes Ziel ≥ 210 W (pyramidale Periodisierung, Retest 19.09.2026). Die frühen Wochen liefen über Notion (manuell erfasst), seit Sommer 2026 automatisch über intervals.icu — beide Ären laufen heute einheitlich auf ISO-Kalenderwochen statt der ursprünglichen Plan-1/Plan-2-Aufteilung.

🔗 **Live:** [stuhlsen.github.io/training-dashboard](https://stuhlsen.github.io/training-dashboard)  
📁 **QA-Portfolio:** [github.com/Stuhlsen/Portfolio](https://github.com/Stuhlsen/Portfolio)

---

## Architektur

```
LESEDATEN (alle 6h, GitHub Action)              SCHREIBDATEN (sofort, Supabase)
──────────────────────────────────              ───────────────────────────────
Notion DB (Notion-Ära, historisch) ──┐           Login/Session ──→ profiles
intervals.icu API ────────────────────┼──→        Ziele ──────────→ goals
  Ride-Metriken, Wellness, Power       │          Events ─────────→ events
  Curves, Zone-Times, eFTP             │          Morgen-Check-in ─→ wellbeing
Open-Meteo API ────────────────────────┼──→        Trainingskarten ─→ plan_cards
  Historisch + Forecast (serverseitig) │          Trainer-Vorschläge → proposals
                                        │          FTP-Historie ─────→ ftp_history
                                        ▼          Trainer-Ansicht ──→ trainer_view_prefs
                                 generate-data.js  Export-Vorgabe ───→ export_prefs
                                        │                    │
                                        ▼                    ▼
                          data/rides.json,          Supabase-Projekt nach Hostname:
                          rides-2.json               localhost → dev, stuhlsen.github.io → prod
                                        │                    │
                                        └────────┬───────────┘
                                                  ▼
                                    Dashboard (React + TypeScript, /app/)
                                                  │
                                                  ▼
                                  GitHub Pages Deploy (nach jedem Sync)
```

`data/subjective.json` und `data/adjustments.json`/`adjustments-2.json` sind seit der Migration nach `plan_cards` bzw. dem täglichen Supabase-Check-in nur noch read-only Archiv älterer Daten, kein aktiver Schreibpfad mehr.

**Tech-Stack:** React + TypeScript + Vite (`/app/`, SVG-Charts als React-Komponenten) · Node.js ≥ 24 lokal (Details/Begründung in `AGENTS.md`) · GitHub Actions (Daten-Sync alle 6 h + getrennte CI-Jobs für Root und `/app/`: Tests, ESLint, Fallow-Codebase-Qualitätsreport) · Supabase (Free Tier, Postgres + Auth + RLS, offizielles `@supabase/supabase-js`-npm-Paket)

**Code-Architektur:** strikte Schichtentrennung `app/src/core/` (reine, getestete Berechnung — PMC, Belastungswächter, Readiness, Belastungsempfehlung, Intensitätsverteilung, EF-/HF-Decoupling-Trend, FTP-Prognose, Regeneration & Körper, Periodisierung, Konsistenz & Adhärenz, Bestwerte, Plan-Konflikte/-Prognose, Vorschlags-Validierung) → `app/src/api/` (I/O-Grenze: JSON-Pipeline + Supabase-Adapter) → `app/src/hooks/`/`features/` (Orchestrierung, React Query) → `app/src/components/`/`charts/`/`features/*` (Rendering). Der Daten-Sync ist analog in `scripts/lib/`-Module zerlegt. Design: Konzept 5 — Glas-Kacheln auf Anthrazit-Blau, die Trainingszonen-Skala als Farbsystem, Sora/IBM Plex Mono/Inter.

---

## Features

### Login, Rollen & Athleten-Toggle

Drei Rollen: **Athlet** (eigener Login, schreibt eigene Ziele/Events/Befinden/Trainingskarten), **Trainer** (eigener Login, sieht „seinen" Athleten vollständig, kann direkt ändern oder als Vorschlag markieren — jeder Athlet hat genau einen Trainer) und **Besucher** (kein Login, liest öffentliche Daten). Login läuft über ein Modal mit E-Mail + Passwort (kein Router, kein OAuth). Der Athleten-Toggle oben rechts im Header bleibt **auch eingeloggt frei wählbar** (Portfolio-Charakter) und wechselt Charts, Texte und Erklärtexte auf den jeweils aktiven Athleten — unabhängig davon, wer eingeloggt ist. Die Auswahl bleibt persistent über Reload (`localStorage`).

Athlete 2 ("hc_diZee", Vergleichsdaten) bleibt read-only im Planungstab: kein Anlegen/Verschieben/Ausfallen von Karten, kein Workout-Push, keine Befinden-Spalte im Fahrtenbuch. Typ-Inferenz läuft dort weiter über IF-Berechnung (NP ÷ FTP) + Fahrtdauer statt über Planzuordnung.

### Tab: Übersicht
- Hero mit **FTP-Zonen-Band** (Watt-Skala mit Pins für FTP, eFTP und Saisonziel), **FTP-Fortschrittsring** und **Session-Pill** (nächste geplante Einheit, berücksichtigt Verschiebungen/Ausfälle, zeigt Renn-Countdown bei anstehenden Events)
- **Tagesform-Ampel**: HRV (SDNN), Ruhepuls und Schlaf der letzten 7 Tage gegen eine rollierende 42-Tage-Baseline — mit konkreter Trainingsempfehlung (wie geplant / Intensität reduzieren / Erholung), seit Phase 2 zusätzlich durch das tägliche Morgen-Check-in-Befinden geschärft. Grundlage: HRV-gesteuertes Training (u. a. Javaloyes 2019)
- **Wochenrückblick**: die letzte abgeschlossene Woche als Karte — Umfang, stärkste Einheit, Wetter-Highlight, Plan-Erfüllung
- KPIs: Gesamtdistanz (nur getrackte Fahrten), FTP, Fahrtenanzahl, Trainingszeit
- **Konsistenz-Jahreskalender** (GitHub-Stil): jeder Trainingstag als Zelle, gefärbt nach Tageslast; die Zeilenzähler übernehmen die Wochentagsverteilung
- **Bestwerte-Wand**: automatisch erkannte persönliche Bestleistungen (längste Fahrt/Fahrzeit, beste NP ≥ 20 min, schnellste 40 km+, meiste Höhenmeter, größte Woche) — jeweils mit Ablöse-Historie
- **Event-Timeline**: anstehende Rennen/Touren mit Datum, Priorität und Countdown (Athlet legt Events selbst über das Einstellungsmenü an)

### Tab: Charts

Alle Linien- und Zeit-Charts sind horizontal scrollbar bzw. per **Zeitraum-Brush** (Presets 30/90/365 Tage, Plan 2, Alles) einschränkbar; ein Hover auf einem Chart zeigt ein verknüpftes Fadenkreuz über PMC/Power/Training/Wellness-Charts hinweg und hebt die passende Fahrtenbuch-Zeile hervor. Drei Charts haben zusätzlich einen **Wochen/Monats-Toggle** — persistent pro Athlet.

| Block | Charts |
|---|---|
| 💪 Fitness & Belastung | PMC (CTL/ATL/TSB, Sweet-Spot-Zone, Brush, **What-if-Szenarien**: Wochen-TSS ±%, N Ruhetage, Rampenrate als gestrichelte Vergleichskurve, **Vergleichsmodus**: zwei Zeiträume desselben Athleten relativ übereinandergelegt), Wöchentliches/Monatliches Volumen (Toggle, phasengefärbt, 200km-Zielzone beim eigenen Plan), **Belastungswächter** (TRIMP-Balken + CTL-Ramp-Linie mit Sicherheitskorridor + Foster-Monotonie-Marker), **Intensitätsverteilung** (Zeit in Zonen pro Woche, 80%-Grundlagen-Richtwert) |
| ⚡ Leistung | Power Curve (anaerobe Reserve, FTP-Linie, W/kg-Toggle, **Blockvergleich**: Kurven je Trainingsblock übereinander), **FTP-Projektion** (eFTP-Verlauf mit Prognose-Fächer auf den Retest-Termin), Aerobe Effizienz mit **EF-Trend** über vergleichbare Z2-Fahrten, Tempo vs. HF Scatter, **Kadenz-Coach** (Statistik-Chips + Verlauf), Tempo / HF Entwicklung (IQR-gefiltert) |
| ❤️ Aerobe Gesundheit | Aerobe Entkopplung (Pw:Hr), HRV, Ruhepuls (durchgehende Kalenderwochen-Linie, Methodenwechsel Apple-Health-RMSSD → intervals.icu-SDNN nur noch als Marker + getrennte Mittelwerte, kein Plan-Divider mehr), Schlaf (Dauer + Schlaf-HF, täglich, 7h-Ziel beim eigenen Plan) |
| 🌤️ Wetterbedingungen | Temperatur & Wind pro Woche/Monat (Toggle, Balken + Windlinie, Ampel-Farbcodierung) |

**Power Curve:** Bestleistungen von 1s (Sprintkraft) bis 60min (Ausdauer) aus intervals.icu. Roter Bereich über FTP-Linie = anaerobe Reserve. W/kg-Toggle zeigt gewichtsnormierte Leistung.

**Belastungswächter:** kombiniert zwei Überlastungs-Frühindikatoren. Die CTL-Ramp-Rate (Fitness-Anstieg pro Woche) mit sicherem Korridor +3 bis +6 — ab +8 steigt das Risiko deutlich. Dazu Foster-Monotonie (Ø Tageslast ÷ Standardabweichung, inkl. Ruhetage): ⚠ ab 2,0 — gleiche Last jeden Tag ist riskanter als gemischte Tage. TRIMP-Farbskala der Balken: grün = <400 (Erholung) · gelb · orange · rot = >900.

**Intensitätsverteilung:** wöchentliche Zeit in den Leistungszonen aus den Powermeter-Daten (Zone-Times aus intervals.icu), verdichtet auf Grundlage (Z1–Z2) / Mitte (Z3–Z4) / Hoch (Z5+). Richtwert nach Seiler: ≥ 80 % Grundlage — deckt den klassischen Fehler „Z2-Fahrten, die eigentlich Tempo waren" auf.

**EF-Trend:** Watt pro Herzschlag über ausschließlich vergleichbare Fahrten (Z2, ≥ 60 min, 5–30 °C) mit gleitendem Mittel — der sauberste Feldtest-Nachweis aerober Anpassung zwischen zwei FTP-Tests. Intervall- und Hitzetage bleiben als grauer Kontext sichtbar.

**FTP-Projektion:** lineare Fortschreibung der eFTP-Historie (letzte 8 Wochen) auf den Retest-Termin, mit Unsicherheitsband aus den Residuen statt Punktversprechen.

**What-if-Szenarien & Vergleichsmodus:** rein clientseitige Prognose-Spielerei im PMC-Chart, nichts wird gespeichert außer den zuletzt gewählten Reglerwerten. Szenarien bauen auf derselben Prognoselogik wie der Planungstab (`core/projection.js`) auf; der Vergleichsmodus richtet zwei Zeitfenster relativ aneinander aus (Tag 1 = Blockstart) und zeigt Σ TSS, Ø CTL, Rampe und harte Tage nebeneinander.

**Wetter:** Alle Standortdaten (Koordinaten) liegen ausschließlich als GitHub Secrets — niemals im Code, nie in der JSON, nie im Frontend-JavaScript. Historisches Wetter, aktuelles Wetter (letzte 3 Tage) und der 16-Tage-Planungs-Forecast werden ausschließlich serverseitig in der GitHub Action berechnet. Beide Athleten nutzen getrennte Standort-Secrets.

### Tab: Fahrtenbuch
Sortier- und filterbare Tabelle aller Fahrten mit Klick-Filter aus dem Volumen-Chart. Fahrten am selben Tag werden nach Startzeitpunkt sortiert. Ein Klick auf eine Zeile pinnt die Auswahl im PMC-Chart-Fadenkreuz, ein 📅-Icon bei intervals.icu-Ära-Fahrten springt zur zugehörigen Plankarte im Planungstab. Wetter-Spalte mit Ampel-Farbcodierung und Hover-Tooltip.

### Morgen-Check-in, Ziele & Events

- **Morgen-Check-in**: tägliches Dialog mit 3–4 Reglern (Schlaf, Energie, Muskelgefühl, Stimmung) + optionaler Notiz, liefert auch an Ruhetagen einen Datenpunkt. Fließt in die Belastungsempfehlung ein (ein rotes Erholungssignal aus dem Check-in kann einen grünen TSB überstimmen) und ist per `wellbeing_public`-Schalter im Profil optional für den Trainer sichtbar (die Notiz bleibt immer privat, nur der Slider-Wert kann geteilt werden).
- **Ziele**: frei definierbare, aktive Ziele im Einstellungsmenü, athletenbezogen.
- **FTP-Historie**: eigene Einträge zusätzlich zur automatisch aus intervals.icu gezogenen eFTP-Kurve, für den FTP-Dreiklang im Analyse-Tab.
- **Events**: Rennen/Touren mit Datum und Priorität, verknüpft mit der Session-Karte (Countdown) und der FTP-Zielplanung.

### Tab: Planung — interaktiver Wochenplaner

Trainingskarten leben in Supabase (`plan_cards`), nicht mehr in JSON. Sessions werden automatisch als „erledigt" markiert, sobald eine passende intervals.icu-Fahrt gefunden wird — mit Soll-Ist-Vergleich (Distanz, Watt, HF, Kadenz, Dauer, TRIMP/CTL, Wetter, Befinden). Bidirektionale Verlinkung mit dem Fahrtenbuch.

- **Karten-CRUD**: Anlegen/Bearbeiten/Löschen inkl. wiederholbarer Workout-Blöcke über einen Dialog.
- **Drag & Drop** ohne Framework (reine Pointer Events): Karte auf einen anderen Tag ziehen, mit Kanten-Autoscroll; Verschieben in die Vergangenheit wird abgewiesen.
- **Prognose & Konflikterkennung**: jede Verschiebung/Änderung rechnet die PMC-Fortschreibung neu und prüft ein festes Regelset (TSB-Einbruch, harte Tage in Folge, Ramp-Rate, Event-Nähe, Terminüberlappung) — warnt, blockiert aber nicht. Nach jeder Aktion zeigt ein Delta-Banner die TSB-Änderung, Konflikt-Badges hängen direkt an der Karte.
- **Workout-Push zu intervals.icu**: strukturierte Workouts per Knopfdruck pushen, per `external_id`-Upsert dedupliziert (erneutes Pushen derselben Karte überschreibt statt zu duplizieren) — nur für den eigenen Athleten.
- **Athlete 2** (GFNY Bremen 2026, eigener Namensraum in `scripts/lib/plan-athlete2.js`) bleibt read-only, keine der obigen Schreibaktionen verfügbar.

### Trainer-Dashboard & Claude-Trainer-Workflow

Loggt sich ein Trainer ein, erscheint eine Trainer-Leiste über dem Dashboard „seines" Athleten (frei konfigurierbare Kennzahlen-Kacheln, Auswahl wird pro Trainer-Athlet-Paar in der Datenbank gemerkt). Der Trainer kann Karten direkt ändern/verschieben oder — beim Anlegen/Löschen zwingend — als **Vorschlag** einreichen. Der Athlet sieht offene Vorschläge als Banner, öffnet eine Vergleichsansicht (alte/neue Karte nebeneinander) und nimmt an oder lehnt ab; angenommene Vorschläge landen über denselben Pfad wie eine direkte Trainer-Änderung in `plan_cards`.

**Claude als Trainer** läuft bewusst ohne API-Anbindung aus der App heraus: Export-Panel erzeugt ein Markdown-Briefing (Profil, Events, Plan, Ist-Fahrten, Befinden, Prognose) samt fester Prompt-Vorlage zum Kopieren in einen Claude-Pro-Chat; eine Richtungsvorgabe (Preset + Freitext + Zielevent) lässt sich dabei mitgeben und wird pro Profil gemerkt. Die Antwort (JSON-Vorschlagsblock) wird über den Import-Dialog eingefügt, validiert (Struktur + Semantik, sammelt alle Fehler statt beim ersten abzubrechen) und landet — mit Teilerfolg bei gemischt gültigen/ungültigen Einträgen — als offene Vorschläge im selben Review-Flow wie menschliche Trainer-Vorschläge.

### Tab: Analyse
Acht aufeinander aufbauende Sektionen in Trainer-Fragereihenfolge — für **beide Athleten** verfügbar; alle Sektionen nutzen den vollen Datensatz (der frühere Plan-1/Plan-2-Filter-Toggle ist mit dem Umbau auf Kalenderwochen entfallen, ein generischer Zeitraum-Vergleich existiert stattdessen im PMC-Chart), die Körper-Sektion blendet sich datengetrieben ein.

1. **Belastungsempfehlung** — fusioniert Tagesform (Readiness, inkl. Morgen-Check-in), Belastungsbilanz (TSB, auf „heute" fortgeschrieben statt am Stand der letzten Fahrt eingefroren) samt 3-Tage-Trend und Wochenlast-Risiko (Belastungswächter) zu einem Ampelstatus mit konkreter Empfehlung; ein rotes Erholungssignal schlägt dabei einen grünen TSB — außer TSB ist die einzige Alert-Quelle und Trend+HRV zeigen bereits aktive Erholung ("Erholung wirkt bereits"). Degradiert sauber, wenn die HRV-Baseline noch fehlt.
2. **Belastung & Erholung** — Wochentabelle mit CTL-Ramp, Foster-Monotonie/Strain und benannter Einordnung („Produktiver Aufbau", „Eintönig hart", „Entlastung" …).
3. **Intensitätsverteilung** — Zeit in niedriger/mittlerer/hoher Intensität mit Formklassifikation (polarisiert / pyramidal / schwellenlastig) gegen den 80%-Richtwert. Ohne Zone-Times greift eine IF-Näherung (aus NP÷FTP), die bei zu geringer Leistungsdaten-Abdeckung ehrlich warnt statt ein Fehlurteil zu zeigen.
4. **Aerobe Entwicklung** — Effizienzfaktor (W/HF), HF-Decoupling-Trend (<5 % = aerob stabil) und Kadenz-Ökonomie über vergleichbare Grundlagenfahrten.
5. **Leistungsdiagnostik** — FTP-Dreiklang strikt getrennt: 🔬 gemessen (Ramp-Test, eigene FTP-Historie-Einträge möglich) / 〜 geschätzt (eFTP) / 🎯 Ziel, je mit eigenem W/kg-Bezug; dazu Retest-Projektion (eigener Plan) bzw. Ziel-Horizont und Bestwerte-Digest.
6. **Regeneration & Körper** — Gewichtstrend, W/kg-Kopplung, Energiebilanz-Näherung (kJ ≈ kcal) und Hydration; erscheint nur bei ausreichender Datendichte (≥ 5 Punkte / 30 Tage).
7. **Konsistenz & Adhärenz** — Wochen-Streak, Frequenztrend (letzte 4 vs. 4 Vorwochen) und Plan-Adhärenzquote (nur eigener Plan).
8. **Periodisierungs-Erfüllung** (nur eigener Plan) — ist jeder Trainingsblock phasengerecht umgesetzt? Reizsignatur je Block, Quality-Dichte und ob Erholungswochen wirklich reduziert waren.

---

## Datenquellen

### Lesedaten (JSON-Pipeline, alle 6h)

| Feld | Notion-Ära (historisch) | intervals.icu-Ära (aktuell) | Vergleich (Athlete 2) |
|---|---|---|---|
| Ride-Metriken (Power, HR, TSS …) | Notion (manuell) | intervals.icu API | intervals.icu API |
| Power Curve | — | intervals.icu `/power-curves` (gesamt + je Trainingsblock) | intervals.icu `/power-curves` |
| Zone-Times (Zeit in Zonen) | — | intervals.icu (`icu_zone_times`) | intervals.icu (`icu_zone_times`) |
| eFTP-Historie | — | intervals.icu (`icu_eftp` je Fahrt + Wellness `sportInfo`) | intervals.icu (Wellness `sportInfo`) |
| CTL / ATL / TSB | Notion (manuell) | intervals.icu (automatisch) | intervals.icu (automatisch) |
| Einheitstyp | Notion | Datum-Mapping → IF-Inferenz | IF-Inferenz (NP ÷ FTP) + Dauer |
| Wellness (RHF, HRV) | Notion (manuell) | intervals.icu + Apple Health | intervals.icu + Apple Health |
| Schlaf | — | intervals.icu (Apple Health Sync) | intervals.icu (Apple Health Sync) |
| Körper & Regeneration (Gewicht, Kalorien, Hydration, Körperfett) | — | intervals.icu Wellness (Apple Health Sync) | intervals.icu Wellness |
| Nach-Fahrt-Befinden | Notion (manuell) | RPE/Feel aus intervals.icu (kein editierbares Dropdown mehr im Dashboard) | — |
| Wetter | Notion (manuell) | Open-Meteo (automatisch, Secrets) | Open-Meteo (automatisch, eigene Secrets) |
| Wetter-Forecast | — | Open-Meteo Forecast, serverseitig | — |
| Geplante Sessions (Ursprung) | — | ursprünglich `PLANNED_SESSIONS` in `scripts/lib/plan2.js`, seit Phase 3 einmalig nach `plan_cards` migriert | `PLANNED_SESSIONS_ATHLETE2` in `scripts/lib/plan-athlete2.js` (GFNY Bremen 2026) |

**Typ-Inferenz:** NP ÷ FTP = Intensity Factor (IF). Fahrten unter IF 0,75 werden zusätzlich nach Dauer klassifiziert — ≥120 min = Z2 Lang, ≥60 min = Z2 Dauer, <60 min = Z1 Recovery.

**HRV-Methodenwechsel:** frühe Notion-Ära = Apple Health RMSSD (~60–116 ms), intervals.icu-Ära = SDNN Schlaf-Durchschnitt (~40–50 ms) — nicht direkt vergleichbar, deshalb im HRV/Ruhepuls-Chart als Marker + getrennte Mittelwerte sichtbar statt als eigener Plan-Divider.

### Schreibdaten (Supabase, sofort)

| Tabelle | Zweck | Wer schreibt |
|---|---|---|
| `profiles` | Rolle, Anzeigename, Trainer-Zuordnung, `wellbeing_public`-Schalter | Athlet/Trainer (eigenes Profil) |
| `goals` | Freie Ziele | Athlet |
| `events` | Rennen/Touren mit Datum, Priorität | Athlet |
| `wellbeing` | Morgen-Check-in (Slider + Notiz) | Athlet |
| `plan_cards` | Trainingskarten (ersetzt die alten `adjustments*.json`) | Athlet, Trainer (direkt oder als Vorschlag) |
| `proposals` | Trainer-/Claude-Vorschläge zur Übernahme durch den Athleten | Trainer, Claude-Import (menschlich freigegeben) |
| `trainer_view_prefs` | Kennzahlen-Auswahl der Trainer-Leiste, pro Trainer-Athlet-Paar | Trainer |
| `ftp_history` | Manuelle FTP-Einträge zusätzlich zur eFTP-Kurve | Athlet |
| `export_prefs` | Zuletzt gewähltes Export-Preset + Zielevent | Athlet |

Alle Tabellen sind per Row Level Security abgesichert (`supabase/migrations/`, im Repo versioniert); anonyme Leser sehen nur, was pro Tabelle explizit freigegeben ist (z. B. `wellbeing` nur bei aktivem `wellbeing_public`-Toggle, nie die Notiz).

---

## Setup

### Voraussetzungen
- GitHub-Account mit aktiviertem GitHub Pages
- intervals.icu Account (Wahoo / Garmin verbunden)
- Notion Integration Token (nur für die Notion-Ära-Historie)
- Node.js ≥ 24 lokal — `npm test` nutzt `--experimental-test-module-mocks` mit der `{ exports }`-Kurzform, die erst ab Node 24 zuverlässig läuft (Details in `AGENTS.md`)
- Ein eigenes Supabase-Projekt (Free Tier) nur nötig, wer die Schreibfunktionen (Login, Planung, Trainer-Flow) selbst betreiben will — die reine Leseansicht funktioniert auch ohne

### GitHub Secrets (Lesedaten-Pipeline)

| Secret | Beschreibung |
|---|---|
| `NOTION_API_KEY` | Notion Integration Token (Notion-Ära) |
| `NOTION_DATABASE_ID` | Notion-Trainingsdatenbank-ID |
| `INTERVALS_API_KEY` | intervals.icu API Key (Athlete 1) |
| `INTERVALS_ATHLETE_ID` | intervals.icu Athlete ID (Athlete 1) |
| `INTERVALS_API_KEY_2` | intervals.icu API Key (Athlete 2, optional) |
| `INTERVALS_ATHLETE_ID_2` | intervals.icu Athlete ID (Athlete 2, optional) |
| `WEATHER_LAT` / `WEATHER_LON` | Koordinaten Athlete 1 (Dezimalgrad mit Punkt) |
| `WEATHER_LAT_2` / `WEATHER_LON_2` | Koordinaten Athlete 2 (optional) |

⚠️ **Standortdaten:** Koordinaten niemals im Code oder in JSON-Dateien eintragen — ausschließlich über GitHub Secrets. Der Wetter-Forecast wird serverseitig in der Action berechnet und nur als aggregierte Wetterwerte in `rides.json` gespeichert.

### GitHub Pages einrichten

Settings → Pages → Build and deployment → Source: **GitHub Actions**

Die Sync-Action übernimmt den Deploy direkt — kein separater Pages-Workflow nötig. Upload und Deploy laufen in getrennten Jobs (`sync` → `deploy`), damit ein Re-Run des Deploys nicht das Pages-Artefakt dupliziert.

### Lokale Entwicklung

```bash
# .env Datei anlegen (wird nicht committet) — für die Lesedaten-Pipeline
NOTION_API_KEY=...
NOTION_DATABASE_ID=...
INTERVALS_API_KEY=...
INTERVALS_ATHLETE_ID=...
WEATHER_LAT=...
WEATHER_LON=...

# JSON generieren
node scripts/generate-data.js

# Dashboard lokal starten (Vite Dev-Server, http://localhost:5173)
cd app
npm install
npm run dev
```

Für die Schreibfunktionen ist lokal nichts weiter nötig: `app/src/api/supabase/config.ts` bindet `localhost` fest an ein Dev-Supabase-Projekt (öffentlicher `anonKey`, per Design — RLS macht ihn ohne Login wirkungslos). Migrationen unter `supabase/migrations/` sind versionierter Quellcode und werden manuell über die Supabase-SQL-Konsole eingespielt (Reihenfolge nach Dateinamen).

### Workout-Push zu intervals.icu

Im Planungs-Tab können strukturierte Workouts direkt zu intervals.icu gepusht werden. Beim ersten Klick auf „Workout pushen" werden API-Key und Athlete-ID abgefragt und im `localStorage` gespeichert. Ein erneuter Push derselben Karte überschreibt den vorhandenen Kalendereintrag (`external_id`-Upsert) statt einen Duplikat-Eintrag anzulegen.

### Git-Workflow

Die GitHub Action committed Daten automatisch alle 6h. `subjective.json` und die inzwischen nur noch als Archiv gehaltenen `adjustments*.json` werden vor Überschreiben geschützt — der volle `git sync`-Alias (inkl. Branch-Guard, da er unabhängig vom ausgecheckten Branch immer die lokale `main`-Referenz pusht) ist in `AGENTS.md` dokumentiert:

```powershell
git add <dateien>
git commit -m "..."
git sync   # nur von main aus — s. AGENTS.md für den vollständigen Alias
```

---

## Trainingsblöcke (aktueller Aufbau, FTP 193 W → Ziel ≥ 210 W)

12-Wochen pyramidale Periodisierung, realistischer Zielkorridor ~205–213 W bis zum Retest am 19.09.:

| Block | Wochen | Do-Intervall (scharf) | Sa-Session (Sweet Spot) |
|---|---|---|---|
| Sweet Spot | W1–W3 | SS 3×10 → 3×12 → 2×20 min | SS-Ausdauer 3×15 → 2×25 min im Ausdauerrahmen |
| Erholung | W4 | nur Z2 locker | kurze Z2, Volumen −50 % |
| Schwelle | W5–W7 | Schwelle 3×8 → 3×10 → 2×20 min | SS-Durability, Blöcke spät (3×15 → 3×20) |
| Erholung | W8 | nur Z2 locker | kurze Z2, Volumen −50 % |
| VO₂max | W9–W11 | VO₂max 5×3 → 6×3 → 4×4 min | SS-Erhaltung 2×20 / 3×15 min |
| Taper + Test | W12 | Aktivierung | Ramp-Test |

**Wochenstruktur:** Mo lockere Z2 · Di Gruppenfahrt ~65 km · Mi Ruhe · Do strukturierte Intervalle · Fr Recovery-Spin · Sa Sweet-Spot-Ausdauerfahrt · So Ruhe. Mo und Fr sind bewusst die Stoßdämpfer: Bei müden Beinen fallen sie zuerst raus, damit die zwei Qualitätstage (Do, Sa) frisch gefahren werden.  
**Equipment:** Favero Assioma PRO MX-1 Power Meter · Wahoo ELEMNT Roam v3 · TRACKR Brustgurt

---

## Trainingsplan GFNY Bremen 2026 (Athlete 2)

13-Wochen-Plan auf das Gran-Fondo-Rennen GFNY Bremen 2026 (Renntag 30.08., Ziel < 3:00 h auf 100 km), FTP 265 W → Ziel 280 W:

| Block | Wochen | Fokus |
|---|---|---|
| Basis | KW23–26 | Aerobe Basis + Sweet Spot |
| Aufbau | KW27–30 | Threshold + Over-Under |
| Rennhärte | KW31–34 | Rennsimulation + Sprint |
| Taper | KW35 | Volumen halbieren |

**Wochenstruktur:** Mo Ruhetag · Di MyWhoosh Crit (~30 min) · Mi Z2 Rolle 90 min · Do Intervalle 90 min · Fr Ruhetag · Sa MyWhoosh Rennen 60–75 min · So Z2 outdoor/Rolle 90 min. Zwei Trainingslager ersetzen in ihren Wochen Do–Sa durch Abfahrt/Renntag/Heimfahrt.

Eigenständiger Namensraum, definiert in `scripts/lib/plan-athlete2.js` — read-only im Dashboard (siehe [Tab: Planung](#tab-planung--interaktiver-wochenplaner)).

---

## Projektkontext

Dieses Dashboard ist ein Dual-Purpose-Projekt: primär ein persönliches Trainingsanalyse-Tool, sekundär ein reales Praxisprojekt im Rahmen einer QA-Ausbildung bei Masterschool. Die Daten-Pipeline (Notion → intervals.icu → GitHub Actions → GitHub Pages) und der Supabase-Schreibpfad (Login, RLS, Trainer-Workflow) dienen gleichzeitig als Testobjekt für STLC-Dokumentation, API-Testing und Sicherheits-Reviews.

Der React-Umbau (Dashboard 3.0) ist abgeschlossen und live — `/app/` ist seit dem 15.08.2026 die einzige Oberfläche, der frühere Vanilla-JS-Zweig wurde entfernt. Aktuell laufende Weiterentwicklung: Besucher-Feedback (Phase 6) ist als Konzeptdokument unter `docs/` vorbereitet, aber noch nicht umgesetzt; ein Self-Hosting-Umbau (Docker, Ablösung der Supabase-Cloud) ist ebenfalls in Planung.

📁 QA-Portfolio: [github.com/Stuhlsen/Portfolio](https://github.com/Stuhlsen/Portfolio)
