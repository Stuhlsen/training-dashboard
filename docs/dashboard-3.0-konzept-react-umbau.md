# Konzept: React-Umbau (Dashboard 3.0)

**Stand:** 31.07.2026
**Status:** Konzept, noch nicht umgesetzt — dieses Dokument ist die Grundlage für den ersten Umsetzungs-Chat
**Vorgänger:** Dashboard 2.0 (Vanilla JS, live auf `main`/`stuhlsen.github.io`)

> **Vorbedingung vor Etappe 1:** Der Bugfix `event-athlete-crud` (neues `state/write-authorization.js`, Gates in `event-timeline.js` und `planned.js`) muss auf `main` committet sein, bevor der Branch abzweigt. Sonst fehlt die Berechtigungslogik im neuen Projekt und wird später doppelt gebaut.

---

## 0. Ziel und Anlass

Der unmittelbare Anlass war die Design-Überarbeitung: Claude Design erzeugt React-Code, und jede Design-Iteration sollte ohne Übersetzungsschritt ins Repo übernehmbar sein. Das allein wäre mit einer schlanken Token-Schicht in Vanilla JS lösbar gewesen.

**Der eigentliche Umfang ist größer**, aus zwei zusammenhängenden Gründen:
1. Das Dashboard soll wesentlich interaktiver werden als heute.
2. Perspektivisch sollen weitere Sportarten (z.B. Joggen) unterstützt werden, nicht nur Radsport.

Damit ist dies kein Design-Umbau mehr, sondern ein **Frontend-Neuaufbau**, bei dem die Design-Anbindung der Auslöser war. Das wird hier bewusst so benannt, damit spätere Etappen nicht am ursprünglichen "nur Design"-Rahmen gemessen werden.

---

## 1. Grundsatzentscheidungen (bereits getroffen)

| # | Entscheidung | Begründung |
|---|---|---|
| G1 | **React + Vite**, kompletter Umstieg von Vanilla JS | Claude-Design-Exporte sind React; direkte Übernahme ohne Übersetzung |
| G2 | **Paralleler Aufbau** auf neuem Branch, alte Vanilla-Seite bleibt live bis zum Umschalten | Kein Risiko für den produktiven Betrieb während des Umbaus |
| G3 | **Backend/Datenmodell bleiben inhaltlich unangetastet** — Supabase-Migrationen, RLS-Policies, Tabellenstruktur werden nicht neu entworfen | Der gerade abgeschlossene Security-Review (Merge-Vorhaben) bleibt gültig; kein zweites großes Vorhaben parallel zum ersten |
| G4 | **Zugriffsschicht wird neu geschrieben** — heutige `state/*.js`-Module werden durch React-Query-artige Hooks ersetzt, die dieselben Supabase-Calls kapseln | Architekturwechsel im Code, kein Wechsel an dem, was in der DB passiert |
| G5 | **Multi-Sport wird vorbereitet, nicht vorgebaut** — Komponentenstruktur und Typmodell sehen ein `sport`-Konzept von Anfang an vor (austauschbare Zonen-/Metrik-Logik statt hart codiert), aber es wird kein Jogging-Feature gebaut | Tür offen lassen statt Zimmer einrichten — verhindert späteren Zwangsumbau, ohne den Umfang jetzt zu sprengen |
| G6 | **Umsetzung in viele kleine, in sich abgeschlossene Etappen**, jede als eigener Claude-Code-Chat nutzbar | Tokensparen, Nachvollziehbarkeit, Möglichkeit zwischendurch zu pausieren |
| G7 | Bisherige Test-/Architektur-Prinzipien (PowerShell, deutsche Commit-Präfixe, Node ≥22.3, `data/*.json` nie stagen) gelten unverändert weiter | Konsistenz mit dem Rest des Projekts |

---

## 2. Was explizit NICHT Teil dieses Umbaus ist

- Neue Migrationen, RLS-Änderungen oder Tabellenstruktur-Änderungen (G3) — Ausnahme: rein additive Ergänzungen, falls sich beim Bau zeigt, dass ein Feld zwingend fehlt (z.B. `sport` als Spalte), werden einzeln vorgelegt, nicht pauschal vorab beschlossen
- Jogging- oder andere Sportart-Features — nur die Struktur dafür
- Das Besucher-Feedback-Feature aus Phase 6
- Inhaltliche Design-Entscheidungen für einzelne Screens — die laufen weiterhin über Claude Design + Mockup-Runden pro Bereich, dieses Dokument regelt nur die technische Grundlage

---

## 3. Architektur-Grobschnitt

### 3.1 Projektstruktur (Vorschlag, zur Abnahme)

```
/                     (bestehendes Repo, Vanilla-Version bleibt unverändert liegen)
/data/                (unverändert: die per Cron generierten JSON-Dateien, siehe 5.5)
/app/                 (NEU: komplettes Vite+React-Projekt)
  src/
    core/             (Portierung der reinen Rechenlogik: projection.js, conflicts.js,
                        plan-config.js, briefing.js — UNVERÄNDERTE Logik, nur Modulform)
    api/              (Zugriffsschicht: React-Query-Hooks statt state/*.js,
                        kapseln dieselben Supabase-Calls. Bewusst NICHT "data/"
                        genannt, um Verwechslung mit /data/*.json zu vermeiden)
    features/         (React-Komponenten, nach fachlichem Bereich statt Dateityp:
                        hero/, planning/, trainer/, explorer/, events/, settings/)
    sports/           (Multi-Sport-Vorbereitung: sport-spezifische Zonen-/Metrik-Module,
                        heute nur cycling/ befüllt)
    components/       (geteilte UI-Bausteine: Buttons, Cards, Badges —
                        hier docken Claude-Design-Exporte typischerweise an)
    charts/           (Portierung der SVG-Chart-Logik — Entscheidung zu React-nativem
                        Rendering vs. Weiterverwendung von document.createElementNS
                        steht noch offen, siehe 5.3)
```

### 3.2 Warum `core/` unverändert bleibt

Die reine Rechenlogik (`projection.js`, `conflicts.js`, `plan-config.js`, `session-classify.js`, `briefing.js` etc.) hat keine UI-Abhängigkeit und keine Framework-Bindung. Sie wird **inhaltlich 1:1 übernommen** — keine Logikänderung, nur ggf. angepasste Modulform für den Vite-Build.

**Die Tests wandern aber nicht kostenlos mit.** Sie laufen heute unter `node:test` mit `--experimental-test-module-mocks`; Vitest (der naheliegende Runner unter Vite) hat ein anderes Mock-System. Für reine `core/`-Tests ohne Mocks ist die Portierung trivial, für alles mit gemockten Modulen (insbesondere die `state/`-Testschicht, für die das Flag überhaupt eingeführt wurde) ist es echte Arbeit. Das ist ein bewusst eingeplanter Aufwandsposten in Etappe 2, kein Nebenbei-Schritt.

### 3.3 Was tatsächlich neu gebaut wird

- Die komplette `ui/`-Schicht als React-Komponenten
- Die Zugriffsschicht (`state/*.js` → Hooks)
- Test-Infrastruktur für die React-Seite (React Testing Library o.ä. — Entscheidung steht in Etappe 1)
- Build-/CI-Pipeline-Ergänzung für den neuen Branch

---

## 4. Etappenplan

Jede Etappe ist als eigener, in sich abgeschlossener Claude-Code-Chat gedacht. Reihenfolge ist strikt — spätere Etappen setzen auf früheren auf.

### Etappe 1 — Grundgerüst `[SO]`, Tooling-Entscheidungen `[F5]`
- Vite+React-Projekt in `/app/` aufsetzen, auf Branch `dashboard-3.0`
- Grundlegende Tooling-Entscheidungen: Test-Runner (Vitest naheliegend wegen Vite), Linting, TypeScript ja/nein (siehe 5.1)
- Supabase-Client-Anbindung als erste Hook-Schicht (Auth, Session) — funktional äquivalent zu `data-access/supabase/client.js` + `auth.js`
- **Achtung `config.js`:** Die Umgebungserkennung ist hostname-/portbasiert (`getConfig()` matcht u.a. `localhost`); der Vite-Dev-Server läuft standardmäßig auf Port 5173, der alte auf 3000. Die Erkennung muss darauf angepasst werden, sonst greift die Dev-Konfiguration nicht.
- Leere Routing-Struktur für die bekannten Bereiche (Hero, Planungstab, Trainer, Explorer, Events, Settings)
- Kein sichtbares Design — nur dass die Seite lädt, sich einloggen lässt, und zwischen leeren Platzhalter-Bereichen navigiert
- **Abnahmekriterium:** `npm run dev` in `/app/` zeigt eine navigierbare, eingeloggte Session gegen `dashboard-dev`, mit korrekt greifender Umgebungsmarkierung

### Etappe 2 — Core-Portierung + Datenzugriffsschicht `[OP]`
- `core/*.js` inhaltlich unverändert übernehmen
- Tests portieren — **eingeplanter Aufwandsposten**, nicht nebenbei (siehe 3.2: Mock-System-Wechsel `node:test` → Vitest)
- Hooks für die Kernentitäten (Profile, Events, Plan Cards, Wellbeing, Proposals) — 1:1 funktionale Entsprechung zu den heutigen `state/*.js`-Modulen
- `write-authorization.js`-Logik mit übernehmen (aus dem Bugfix, siehe Vorbedingung oben)
- **Abnahmekriterium:** Alle portierten core-Tests grün; ein Hook liest nachweislich Daten (noch keine UI)

### Etappe 3 — Multi-Sport-Grundstruktur `[F5]`
- `sports/`-Modulstruktur anlegen, `cycling/` als einzige befüllte Implementierung
- Sportartspezifische Werte (Zonen-Grenzen, Metrik-Namen wie FTP/TSS) aus fest verdrahtetem Code in das `cycling/`-Modul ziehen
- **Kein zweites Sport-Modul bauen** — nur sicherstellen, dass eins prinzipiell danebenstehen könnte
- **Erwarteter STOPP-Punkt:** Hier wird sich vermutlich zeigen, ob eine `sport`-Spalte in der Datenbank gebraucht wird. Falls ja: **nicht eigenmächtig migrieren** — vorlegen. Das ist die eine Stelle, an der G3 und G5 aneinanderstoßen.
- **Abnahmekriterium:** Alle Radsport-Berechnungen laufen weiterhin korrekt, jetzt über die `sports/cycling/`-Indirektion statt direkt

### Etappe 4 — Erste echte Komponente: Hero-Bereich `[SO]`
- Design aus Claude Design übernehmen (Grundlage: die bereits gestaltete Hero-Sprache — dunkler warmer Hintergrund mit Glow, große Radien, helles Blau als Primärakzent, zwei FTP-Ringe, generiertes Hintergrundfoto)
- Erste Komponenten in `components/` entstehen hier als Nebenprodukt
- **Abnahmekriterium:** Hero-Bereich zeigt echte Daten aus den Etappe-2-Hooks, visuell nach Vorgabe

### Etappen 5–9 — Restliche Bereiche, je eine eigene Etappe

Jede wird erst grob geplant, wenn Etappe 4 abgenommen ist — Detailplanung folgt dem Muster der bisherigen Phasenkonzepte.

| Etappe | Bereich | Modell | Besonderheit |
|---|---|---|---|
| 5 | Planungstab | `[OP]` | Drag&Drop: Neubewertung, ob die bestehende Pointer-Events-Logik übernommen oder React-nativ gelöst wird. **Portierungsposten aus der Progressionssteuerung** (`docs/konzept-progressionssteuerung.md`, G1): Intervalltabelle Soll-Ist (Schritt 6b, in Vanilla vorgezogen gebaut — s. dort), Leiterstand-Anzeige im Export-Panel (E1/E2), Compliance-Ampel an der Ist-Fahrt. Alle drei entstehen in der Vanilla-Version VOR diesem Umbau und werden hier nur neu geschrieben, nicht neu konzipiert |
| 6 | Trainer-Dashboard + Export/Import | `[SO]` | Proposal-Schema und Validator wandern unverändert mit |
| 7 | Explorer + Charts | `[OP]` | Chart-Grundsatzentscheidung aus 5.3 fällt hier |
| 8 | Events | `[SO]` | `write-authorization.js`-Muster ist schon in Etappe 2 mitgekommen, hier nur die UI |
| 9 | Settings | `[HA]` | inkl. Passwortänderung |

### Etappe 10 — Umschaltung `[F5]`
- CI/Deploy-Pipeline auf `/app/` als neue Live-Version umstellen
- Vollständiger Security-Review-Durchlauf gegen die neue UI — die RLS ist unverändert, aber die **UI-Gates sind komplett neu gebaut**, und genau dort lag der letzte echte Fund (`event-timeline.js`/`planned.js`). Die Sichtbarkeits-Matrix aus `docs/phase-6-konzept-sichtbarkeit.md` wird erneut abgearbeitet.
- Alte Vanilla-Seite wird abgelöst (Branch bleibt stehen, kein Löschen — Muster wie `dashboard-2.0`)

---

## 5. Offene Punkte für Etappe 1

Diese werden zu Beginn von Etappe 1 entschieden, nicht hier vorweggenommen:

### 5.1 TypeScript ja/nein
Spricht dafür: Typsicherheit gerade bei der Multi-Sport-Abstraktion (G5) und beim Proposal-Schema. Spricht dagegen: zusätzliche Lernkurve/Setup. Empfehlung wird in Etappe 1 mit Begründung vorgelegt.

### 5.2 State-Management über React Query hinaus
Für lokalen UI-Zustand (z.B. Drag&Drop-Zustand, Formulare) — reicht React-eigener State, oder wird eine zusätzliche Bibliothek gebraucht? Vermutlich nicht nötig, wird aber nicht vorab festgelegt.

### 5.3 Charts: React-nativ oder Portierung der SVG-Logik
Die bestehenden Charts sind handgeschriebenes SVG ohne Framework-Bindung (`document.createElementNS`). Zwei Wege: (a) 1:1 als React-Komponenten mit `ref`-basiertem direktem DOM-Zugriff portieren (wenig Risiko, wenig "React-typisch"), (b) auf eine React-Chart-Bibliothek umstellen (mehr Aufwand, potenziell schlechter zur bestehenden Design-Sprache aus `chart-grundlagen.md` passend). Wird erst in Etappe 5 (Explorer) entschieden, nicht in Etappe 1.

### 5.4 Branch- und Ordner-Name
**Festgelegt:** Branch `dashboard-3.0` (Muster wie `dashboard-2.0`), Ordner `/app/`.

### 5.5 JSON-Pipeline (`generate-data.js` / Cron)
Der GitHub-Actions-Cron erzeugt `data/*.json`, die die Vanilla-App liest. **Offen:** Liest die React-App dieselben Dateien unverändert weiter (einfachster Weg, Pipeline bleibt komplett unangetastet), oder wandern diese Daten perspektivisch nach Supabase? Für den Umbau selbst ist der einfache Weg richtig — die Dateien bleiben, die React-App liest sie genauso. Eine spätere Ablösung wäre ein eigenes Vorhaben. **In Etappe 2 zu bestätigen, nicht vorher zu ändern.**

### 5.6 Wie die React-Version während des Parallelbetriebs sichtbar ist
G2 sagt, die alte Seite bleibt live — GitHub Pages liefert aber von `main`. Drei Wege: (a) nur lokal per `npm run dev` ansehen bis zur Umschaltung, (b) zweiter Pages-Deploy aus dem `dashboard-3.0`-Branch unter eigenem Pfad, (c) externer Preview-Dienst. **Empfehlung: (a) für Etappe 1–3** (da gibt es ohnehin nichts Anzusehendes), **ab Etappe 4 dann (b)**, damit Design-Iterationen im echten Browser auf echten Geräten beurteilbar sind. Entscheidung fällt spätestens zu Etappe 4.

---

## Abnahme

Dieses Dokument regelt nur den Rahmen (Abschnitte 0–3) und die Etappenfolge (Abschnitt 4). Es ersetzt nicht die Detailkonzepte pro Bereich, die wie bisher einzeln entstehen, sobald die jeweilige Etappe ansteht.

## Modell-Kürzel

`[F5]` Opus 4.7/4.8 — Architektur, Security, Debugging
`[OP]` Opus 4.6 — große Refactorings, State-Sync
`[SO]` Sonnet 4.6 — normale Implementierung, Komponenten, CRUD
`[HA]` Haiku 4.5 — Kleinkram
