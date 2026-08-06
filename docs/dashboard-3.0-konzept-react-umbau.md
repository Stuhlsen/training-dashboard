# Konzept: React-Umbau (Dashboard 3.0)

**Stand:** 06.08.2026 (überarbeitete Fassung, ersetzt Stand 04.08.2026)
**Status:** in Umsetzung — Etappen 1, 2a und 2b sind umgesetzt (06.08.2026), nächste Etappe ist 3
**Vorgänger:** Dashboard 2.0 (Vanilla JS, live auf `main`/`stuhlsen.github.io`)

> **Vorbedingung vor Etappe 1:** ✅ erfüllt (Stand 06.08.2026).
> 1. Die drei zuvor fehlenden Commits (`865c709`/`8e5f47f`/`75c8047` auf `main`) sind per Cherry-Pick auf `dashboard-3.0` verteilt (dort als `ce11eef`/`425875f`/`eb3093f`, andere Hashes, inhaltlich dateiweise diff-geprüft identisch).
> 2. Migrationen 0012–0017 sind gegen `dashboard-dev` und `prod` angewendet (bestätigt 06.08.2026).
>
> Die frühere Vorbedingung (`event-athlete-crud`-Bugfix auf `main`) ist erfüllt und damit gegenstandslos.

## Änderungen durch Etappe 2b (06.08.2026)

- G4 konkretisiert: Hook-Basis ist `@tanstack/react-query`
- 5.5 von „offen" auf **bestätigt** — JSON-Pipeline bleibt unangetastet, Umsetzung + Verifikation dokumentiert
- Etappe-2b-Ergebnis eingetragen, inkl. der beiden beim Umsetzen gefallenen Entscheidungen und der Abgrenzung „was React Query ersetzt und was nicht"

## Änderungen gegenüber Stand 04.08.

- Vorbedingung 1 neu geprüft: konkrete fehlende Commits benannt (s.o.), Status weiterhin offen statt nur allgemein gefordert
- Core-Portierungsliste (3.1) um `plan-rest-days.js` ergänzt (neu seit 05.08., löst die bisher einzeln getippten Ruhetag-Einträge ab)
- Etappe-6-Portierungsposten aktualisiert: Ruhetage jetzt athletenagnostisch aus der Wochenstruktur abgeleitet statt einzeln getippt, für beide Athleten sichtbar (nicht mehr athlete1-exklusiv), Kartenhinweise als Tooltip-Chip statt Einzeltexte

## Änderungen gegenüber Stand 31.07.

- G1-Begründung ehrlich umformuliert: Übernahme läuft über den `claude_design`-MCP mit festem Konvertierungsrezept, nicht "ohne Übersetzungsschritt" (siehe 5.7)
- Neuer festgelegter Punkt 5.7: Design-Übernahme-Workflow (MCP-Import, `tokens.css`, Prompt-Vorlage); Tailwind-Frage damit geklärt: **kein Tailwind**
- Etappe 2 in 2a/2b geteilt (Bruchkante: Supabase-/Mock-Grenze); Test-"Portierung" der `state/`-Schicht umgedeutet (3.2)
- Reihenfolge der Bereichs-Etappen getauscht: **Events vor Planungstab** (Begründung in Abschnitt 4)
- Sichtbarkeits-Matrix-Prüfung auf die Bereichs-Etappen verteilt; Etappe 10 wird Regressionsdurchlauf statt Erstprüfung
- Portierungsposten vervollständigt um die seit 31.07. entstandene Vanilla-UI (Wirkungsanzeige, Ruhetag-/Recovery-Karten, Blockstart-Dialog, Stufenvorschlag, Leitplanken-Sektion, Fortschrittsindikatoren, `derived`-Badge) und neu zugeschnitten: Karten-Posten → Planungstab-Etappe, Briefing-/Export-Posten → Trainer-Etappe

---

## 0. Ziel und Anlass

Der unmittelbare Anlass war die Design-Überarbeitung: Claude Design erzeugt React-basierte Entwürfe, und jede Design-Iteration soll mit minimalem, standardisiertem Aufwand ins Repo übernehmbar sein. Das allein wäre mit einer schlanken Token-Schicht in Vanilla JS lösbar gewesen.

**Der eigentliche Umfang ist größer**, aus zwei zusammenhängenden Gründen:
1. Das Dashboard soll wesentlich interaktiver werden als heute.
2. Perspektivisch sollen weitere Sportarten (z.B. Joggen) unterstützt werden, nicht nur Radsport.

Damit ist dies kein Design-Umbau mehr, sondern ein **Frontend-Neuaufbau**, bei dem die Design-Anbindung der Auslöser war. Das wird hier bewusst so benannt, damit spätere Etappen nicht am ursprünglichen "nur Design"-Rahmen gemessen werden.

---

## 1. Grundsatzentscheidungen (bereits getroffen)

| # | Entscheidung | Begründung |
|---|---|---|
| G1 | **React + Vite**, kompletter Umstieg von Vanilla JS | Claude-Design-Projekte werden per `claude_design`-MCP direkt von Claude Code gelesen und mit festem Konvertierungsrezept (5.7) als React-Komponenten implementiert. Der Export selbst ist HTML mit Inline-Styles bzw. eine React-Klassenkomponente auf proprietärer Runtime — die Umformung nach JSX/Hooks ist weitgehend mechanisch, die Umformung in imperativen Vanilla-DOM-Code wäre es nicht. Es gibt keinen wörtlich übersetzungsfreien Weg; React minimiert und standardisiert den Schritt |
| G2 | **Paralleler Aufbau** auf neuem Branch, alte Vanilla-Seite bleibt live bis zum Umschalten | Kein Risiko für den produktiven Betrieb während des Umbaus |
| G3 | **Backend/Datenmodell bleiben inhaltlich unangetastet** — Supabase-Migrationen, RLS-Policies, Tabellenstruktur werden nicht neu entworfen | Der abgeschlossene Security-Review (Merge-Vorhaben) bleibt gültig; kein zweites großes Vorhaben parallel zum ersten |
| G4 | **Zugriffsschicht wird neu geschrieben** — heutige `state/*.js`-Module werden durch React-Query-artige Hooks ersetzt, die dieselben Supabase-Calls kapseln. Seit Etappe 2b konkret: **`@tanstack/react-query`** | Architekturwechsel im Code, kein Wechsel an dem, was in der DB passiert |
| G5 | **Multi-Sport wird vorbereitet, nicht vorgebaut** — Komponentenstruktur und Typmodell sehen ein `sport`-Konzept von Anfang an vor (austauschbare Zonen-/Metrik-Logik statt hart codiert), aber es wird kein Jogging-Feature gebaut | Tür offen lassen statt Zimmer einrichten — verhindert späteren Zwangsumbau, ohne den Umfang jetzt zu sprengen |
| G6 | **Umsetzung in viele kleine, in sich abgeschlossene Etappen**, jede als eigener Claude-Code-Chat nutzbar, geschnitten an fachlichen Bruchkanten (gemeinsam angefasste Dateien, Kontrollpunkte, Schichtgrenzen) | Tokensparen, Nachvollziehbarkeit, Möglichkeit zwischendurch zu pausieren |
| G7 | Bisherige Test-/Architektur-Prinzipien (PowerShell, deutsche Commit-Präfixe, Node ≥22.3, `data/*.json` nie stagen) gelten unverändert weiter | Konsistenz mit dem Rest des Projekts |

---

## 2. Was explizit NICHT Teil dieses Umbaus ist

- Neue Migrationen, RLS-Änderungen oder Tabellenstruktur-Änderungen (G3) — Ausnahme: rein additive Ergänzungen, falls sich beim Bau zeigt, dass ein Feld zwingend fehlt (z.B. `sport` als Spalte), werden einzeln vorgelegt, nicht pauschal vorab beschlossen
- Jogging- oder andere Sportart-Features — nur die Struktur dafür
- Das Besucher-Feedback-Feature aus Phase 6
- Inhaltliche Design-Entscheidungen für einzelne Screens — die laufen weiterhin über Claude Design + Mockup-Runden pro Bereich, dieses Dokument regelt nur die technische Grundlage und den Übernahme-Workflow (5.7)

---

## 3. Architektur-Grobschnitt

### 3.1 Projektstruktur (Vorschlag, zur Abnahme)

```
/                     (bestehendes Repo, Vanilla-Version bleibt unverändert liegen)
/data/                (unverändert: die per Cron generierten JSON-Dateien, siehe 5.5)
/app/                 (NEU: komplettes Vite+React-Projekt)
  src/
    core/             (Portierung der reinen Rechenlogik: projection.js, conflicts.js,
                        plan-config.js, briefing.js, ladder.js, compliance-match.js,
                        workout-structure-derive.js, plan-rest-days.js, plan-feedback.js
                        etc. — UNVERÄNDERTE Logik, nur Modulform)
    api/              (Zugriffsschicht: React-Query-Hooks statt state/*.js,
                        kapseln dieselben Supabase-Calls. Bewusst NICHT "data/"
                        genannt, um Verwechslung mit /data/*.json zu vermeiden)
    features/         (React-Komponenten, nach fachlichem Bereich statt Dateityp:
                        hero/, planning/, trainer/, explorer/, events/, settings/)
    sports/           (Multi-Sport-Vorbereitung: sport-spezifische Zonen-/Metrik-Module,
                        heute nur cycling/ befüllt)
    components/       (geteilte UI-Bausteine: Buttons, Cards, Badges —
                        hier docken die konvertierten Claude-Design-Bausteine an)
    charts/           (Portierung der SVG-Chart-Logik — Entscheidung zu React-nativem
                        Rendering vs. Weiterverwendung von document.createElementNS
                        steht noch offen, siehe 5.3)
    styles/tokens.css (zentrale Design-Tokens, einzige Farb-/Radien-/Schatten-Quelle,
                        abgeglichen mit den CSS-Variablen der Claude-Design-Exporte, siehe 5.7)
```

### 3.2 Warum `core/` unverändert bleibt — und was mit den Tests wirklich passiert

Die reine Rechenlogik (`projection.js`, `conflicts.js`, `plan-config.js`, `session-classify.js`, `briefing.js`, die gesamte Leiter-/Compliance-Kette etc.) hat keine UI-Abhängigkeit und keine Framework-Bindung. Sie wird **inhaltlich 1:1 übernommen** — keine Logikänderung, nur ggf. angepasste Modulform für den Vite-Build.

Bei den Tests sind zwei Fälle sauber zu trennen:

1. **Mockfreie `core/`-Tests:** Portierung nach Vitest ist nahezu mechanisch (`describe`/`it`/`assert` bleiben strukturell gleich). Kleiner Posten in Etappe 2a.
2. **Die `state/`-Testschicht wird NICHT portiert.** Sie testet Module, die es in 3.0 nicht mehr gibt (die `state/*.js` werden durch Hooks ersetzt) — das `--experimental-test-module-mocks`-Problem löst sich damit auf, statt übersetzt zu werden. Die alten Tests dienen stattdessen als **Verhaltens-Spezifikation** für neu geschriebene Hook-Tests: gleiche abgesicherten Verhaltensweisen (requestId-Schutz, Athletenwechsel, Fehlerpfade, `canWriteForAthlete()`-Fälle), neues Testgeschirr. Das ist der eigentliche Aufwandsposten in Etappe 2b — Neubau nach Spec, nicht Portierung.

### 3.3 Was tatsächlich neu gebaut wird

- Die komplette `ui/`-Schicht als React-Komponenten
- Die Zugriffsschicht (`state/*.js` → Hooks) inkl. neuer Hook-Tests (3.2)
- Test-Infrastruktur für die React-Seite (Vitest + React Testing Library o.ä. — Entscheidung in Etappe 1)
- Build-/CI-Pipeline-Ergänzung für den neuen Branch
- Der Design-Übernahme-Workflow als dokumentierte Prompt-Vorlage (5.7)

---

## 4. Etappenplan

Jede Etappe ist als eigener, in sich abgeschlossener Claude-Code-Chat gedacht. Reihenfolge ist strikt — spätere Etappen setzen auf früheren auf.

**Reihenfolge-Prinzip der Bereichs-Etappen (geändert gegenüber 31.07.):** Nach dem read-only Hero kommt der **einfachste** CRUD-Bereich (Events) vor dem schwersten (Planungstab). Formular-Muster, Speicher-Hooks und `write-authorization`-Gates werden einmal am kleinen Fall gebaut und gehärtet — genau dort lag der letzte echte Sicherheitsfund. Der Planungstab setzt dann auf erprobte Muster auf, statt sie am komplexesten Fall miterfinden zu müssen.

**Sichtbarkeits-Matrix verteilt:** Jede Bereichs-Etappe übernimmt die für ihre Datentypen relevanten Zeilen aus `docs/phase-6-konzept-sichtbarkeit.md` als Teil des Abnahmekriteriums (ausgeloggt / eingeloggt-fremd / eingeloggt-eigen / Trainer / Admin, soweit zutreffend). Etappe 10 macht dann nur noch den Regressions-Gesamtdurchlauf, keine Erstprüfung.

### Etappe 1 — Grundgerüst `[SO]`, Tooling-Entscheidungen `[F5]` — ✅ umgesetzt (06.08.2026, `231552f`)
- Vite+React-Projekt in `/app/` aufsetzen, auf Branch `dashboard-3.0`
- Grundlegende Tooling-Entscheidungen: Test-Runner (Vitest naheliegend wegen Vite), Linting, TypeScript ja/nein (siehe 5.1)
- Supabase-Client-Anbindung als erste Hook-Schicht (Auth, Session) — funktional äquivalent zu `data-access/supabase/client.js` + `auth.js`
- **Achtung `config.js`:** Die Umgebungserkennung ist hostname-/portbasiert (`getConfig()` matcht u.a. `localhost`); der Vite-Dev-Server läuft standardmäßig auf Port 5173, der alte auf 3000. Die Erkennung muss darauf angepasst werden, sonst greift die Dev-Konfiguration nicht.
- Leere Routing-Struktur für die bekannten Bereiche (Hero, Planungstab, Trainer, Explorer, Events, Settings)
- `styles/tokens.css` als Datei anlegen (initial leer bzw. mit den Grundtokens aus `chart-grundlagen.md`; der Abgleich mit den Export-Tokens folgt in Etappe 4)
- Kein sichtbares Design — nur dass die Seite lädt, sich einloggen lässt, und zwischen leeren Platzhalter-Bereichen navigiert
- **Abnahmekriterium:** `npm run dev` in `/app/` zeigt eine navigierbare, eingeloggte Session gegen `dashboard-dev`, mit korrekt greifender Umgebungsmarkierung

### Etappe 2a — Core-Portierung `[OP]` — ✅ umgesetzt (06.08.2026)
- `core/*.js` inhaltlich unverändert übernehmen (inkl. der gesamten Progressionssteuerungs-Logik: `ladder.js`, `compliance-match.js`, `workout-structure-derive.js`, Leitplanken-Regeln etc.)
- Mockfreie core-Tests nach Vitest — nahezu mechanisch (3.2 Fall 1)
- **Abnahmekriterium:** Alle portierten core-Tests grün unter Vitest

**Ergebnis:** 53 Module + `types.js` nach `app/src/core/` bzw. `app/src/types.js` kopiert (byte-identisch, per `diff -r` geprüft); 42 Tests portiert, 655 Tests grün unter Vitest. Details und Abgrenzung in `app/src/core/README.md`.

Vier Entscheidungen, die beim Umsetzen anfielen und im Konzept noch nicht festgelegt waren:

1. **`checkJs` bleibt aus** (`allowJs` an). Die JSDoc-Annotationen in `core/` erzeugen 40 `tsc`-Fehler — sämtlich vorbestehend, weil die Root-`jsconfig.json` zwar `checkJs: true` setzt, `tsc` dort aber nie in CI läuft. Sie zu schärfen wäre eine Änderung an `core/` und damit außerhalb der 1:1-Portierung. Aufräumkandidat für Etappe 10.
2. **`node:assert` bleibt**, statt auf `expect()` umzuschreiben. Vitest läuft unter Node; ein Assertion-Rewrite über ~650 Zusicherungen wäre kein Port, sondern ein Neuschreiben mit Regressionsrisiko.
3. **Vitest-Projekte getrennt** (`core` → `node`, `app` → `jsdom`). `core/` hat per Schichtenregel keinen DOM-Zugriff; jsdom für 43 Dateien hochzufahren kostete 115s Setup, die Trennung drückt den Lauf von 9,9s auf 2,4s.
4. **`no-useless-assignment` für `src/core/**` aus.** `/app/` nutzt ESLint 10 (Regel in `recommended`), das Root-Repo ESLint 9 (Regel dort nicht vorhanden). Einziger Treffer ist `session-classify.js:70-72` — tote `= 0`-Initialisierer, rein stilistisch. Bewusst nicht gefixt, damit die Kopie nicht vom Original abweicht, solange beide parallel laufen.

**Nebenbefund (behoben):** Das Root-`npm test` lief als `node --test` ohne Pfadargument und durchsuchte damit das gesamte Repo — es zog die neuen `app/src/core/*.test.js` mit und scheiterte an deren `vitest`-Import. Jetzt auf `"tests/**/*.test.js"` eingegrenzt; verlustfrei geprüft (936 Tests über Glob wie über explizite Dateiliste aller 69 Dateien).

### Etappe 2b — Datenzugriffsschicht `[OP]` — ✅ umgesetzt (06.08.2026)
- Hooks für die Kernentitäten (Profile, Events, Plan Cards, Wellbeing, Proposals) — 1:1 funktionale Entsprechung zu den heutigen `state/*.js`-Modulen
- `write-authorization.js`-Logik (`canWriteForAthlete()`) mit übernehmen
- Neue Hook-Tests, geschrieben gegen die alten `state/`-Tests als Verhaltens-Spezifikation (3.2 Fall 2) — **eingeplanter Aufwandsposten**, Neubau nach Spec
- JSON-Pipeline-Bestätigung aus 5.5 fällt hier
- **Abnahmekriterium:** Hook-Testsuite grün; ein Hook liest nachweislich Daten (noch keine UI)

**Ergebnis:** `@tanstack/react-query` als Hook-Basis (G4 „React-Query-artig" damit konkretisiert). Sechs Adapter nach `app/src/api/supabase/*.ts` portiert, Hooks in `app/src/api/hooks/`, 92 neue Tests im `app`-Projekt (742 gesamt inkl. der 650 core-Tests aus 2a). Umfang, Abweichungsliste gegenüber der Spec und die Abgrenzung „was React Query ersetzt und was nicht" stehen in `app/src/api/README.md`.

Der inhaltliche Kern der Etappe: die alten `state/*.js` trugen **zwei** Schutzmechanismen, die im Code gleich aussahen. Der eine (`loadedForAthleteId`, `onSessionChange`-Handler, `profileIdCache`) löst sich mit keyed Queries strukturell auf. Der andere — der `requestGuard` bei nebenläufigen **Mutationen** — bleibt nötig: React Querys Standard-Rollback (`onError` spielt den `onMutate`-Snapshot zurück) setzt blind auf einen Stand zurück, der eine inzwischen erfolgreiche zweite Mutation noch nicht kannte. Er lebt jetzt in `app/src/api/write-guard.ts` und hängt an React Querys Lebenszyklus; ohne ihn fallen exakt die drei Race-Tests in `usePlanCards.test.tsx` um (gegengeprüft, nicht nur behauptet).

Zwei Entscheidungen, die beim Umsetzen anfielen:

1. **Patch-Regeln aus dem Async-Pfad herausgelöst.** `movedFromDate` nur beim ersten Verschieben, week/phase der Zielwoche leihen, Ausfall-Reset, sort_order — reine Funktionen in `api/plan-cards/patch.ts`, mockfrei geprüft. Damit teilen sich Move/Cancel/Undo/Vollbearbeitung EINE Mutation; was sie unterscheidet, ist allein der Patch.
2. **Login-Gate hängt am Auth-User, nicht am Profil.** Fiel beim Testen auf: `state/session.js` hielt das Profil als Session-Objekt, ein Schreibversuch während des Profil-Ladens wurde dort mit „Nicht eingeloggt" abgewiesen. Das Profil wird jetzt nur noch für Rollenfragen (Trainer? Admin?) gebraucht.

**5.5 bestätigt** (s.u.). **Nicht portiert** und bewusst den späteren Etappen zugeschlagen: `chart-view`/`export*`/`ladder`/`block-transition`/`formats`/`goals`/`ftp-history` (Etappen 7/8), der intervals.icu-Push (Etappe 6), die Trainer-Leisten-Kategorien (Etappe 7).

### Etappe 3 — Multi-Sport-Grundstruktur `[F5]`
- `sports/`-Modulstruktur anlegen, `cycling/` als einzige befüllte Implementierung
- Sportartspezifische Werte (Zonen-Grenzen, Metrik-Namen wie FTP/TSS) aus fest verdrahtetem Code in das `cycling/`-Modul ziehen
- **Kein zweites Sport-Modul bauen** — nur sicherstellen, dass eins prinzipiell danebenstehen könnte
- **Erwarteter STOPP-Punkt:** Hier wird sich vermutlich zeigen, ob eine `sport`-Spalte in der Datenbank gebraucht wird. Falls ja: **nicht eigenmächtig migrieren** — vorlegen. Das ist die eine Stelle, an der G3 und G5 aneinanderstoßen.
- **Abnahmekriterium:** Alle Radsport-Berechnungen laufen weiterhin korrekt, jetzt über die `sports/cycling/`-Indirektion statt direkt

### Etappe 4 — Erste echte Komponente: Hero-Bereich `[SO]`
- Erster echter Durchlauf des Design-Übernahme-Workflows (5.7): `claude_design`-MCP einrichten (`/design-login`), Hero-Projekt importieren, nach Rezept konvertieren
- `tokens.css` aus den CSS-Variablen des Exports befüllen/abgleichen (dunkler warmer Hintergrund mit Glow, große Radien, helles Blau als Primärakzent, zwei FTP-Ringe, generiertes Hintergrundfoto)
- `docs/vorlage-design-import.md` entsteht hier als Ergebnis des ersten Durchlaufs — was sich bewährt, wird die feste Vorlage für alle weiteren Bereiche
- Erste Komponenten in `components/` entstehen als Nebenprodukt
- **Abnahmekriterium:** Hero-Bereich zeigt echte Daten aus den Etappe-2b-Hooks, visuell nach Vorgabe; Vorlage dokumentiert

### Etappen 5–9 — Restliche Bereiche, je eine eigene Etappe

Jede wird erst grob geplant, wenn Etappe 4 abgenommen ist — Detailplanung folgt dem Muster der bisherigen Phasenkonzepte. Jede übernimmt ihre Sichtbarkeits-Matrix-Zeilen ins Abnahmekriterium (s.o.).

| Etappe | Bereich | Modell | Besonderheit |
|---|---|---|---|
| 5 | **Events** | `[SO]` | Erster CRUD-Bereich: Formular-Komponenten, Mutations-Hooks und `write-authorization`-Gates werden hier erstmals in echter React-UI gebaut und gehärtet (Muster-Etappe für alles Folgende). Inkl. `is_test`-Feld-UI |
| 6 | **Planungstab** | `[OP]` | Drag&Drop: Neubewertung, ob die bestehende Pointer-Events-Logik übernommen oder React-nativ gelöst wird. **Karten-Portierungsposten** (alle in Vanilla bereits gebaut, hier nur neu geschrieben, nicht neu konzipiert): Intervalltabelle Soll-Ist inkl. `derived`-Badge, Compliance-Ampel an der Ist-Fahrt, Wirkungsanzeige (ΔFitness/ΔErmüdung/ΔForm) auf allen Kartentypen inkl. Vorher-Nachher beim Verschieben, Ruhetag-/Recovery-Karten (rest/recovery-Dreiteilung, Erholungswochen-Erkennung, angepasste K-LEER-Logik; seit 05.08. athletenagnostisch aus der Wochenstruktur abgeleitet statt einzeln getippt — `core/plan-rest-days.js::fillRestDays` — und für BEIDE Athleten sichtbar, nicht mehr athlete1-exklusiv), Kartenhinweise als Tooltip-Chip (seit 06.08., `core/plan-feedback.js` erweitert + `planned.css`/`planned.js`) statt einzeln ausgeschriebener Hinweistexte |
| 7 | **Trainer-Dashboard + Export/Import** | `[SO]` | Proposal-Schema und Validator wandern unverändert mit. **Briefing-/Export-Portierungsposten** (in Vanilla bereits gebaut): Leiterstand-Anzeige im Export-Panel, Blockstart-Dialog zur Familienwahl, Stufenvorschlag im Briefing inkl. Sonderfälle ("kein Vorschlag ableitbar", "eingefroren (Taper)"), Leitplanken-Sektion (K-RAMPE/K-HARTFOLGE/K-WOCHENTSS/K-TID), Fortschrittsindikatoren, Preset-Kachelreihe |
| 8 | **Explorer + Charts** | `[OP]` | Chart-Grundsatzentscheidung aus 5.3 fällt hier |
| 9 | **Settings** | `[HA]` | inkl. Passwortänderung |

### Etappe 10 — Umschaltung `[F5]`
- CI/Deploy-Pipeline auf `/app/` als neue Live-Version umstellen
- Security-**Regressionsdurchlauf** gegen die neue UI: die Sichtbarkeits-Matrix wurde bereits pro Bereichs-Etappe abgearbeitet, hier folgt der Gesamtdurchlauf am Stück — die RLS ist unverändert, aber die **UI-Gates sind komplett neu gebaut**, und genau dort lag der letzte echte Fund (`event-timeline.js`/`planned.js`)
- Alte Vanilla-Seite wird abgelöst (Branch bleibt stehen, kein Löschen — Muster wie `dashboard-2.0`)

---

## 5. Offene und festgelegte Punkte

### 5.1 TypeScript ja/nein (offen, Etappe 1)
Spricht dafür: Typsicherheit gerade bei der Multi-Sport-Abstraktion (G5) und beim Proposal-Schema; die Claude-Design-Exporte deklarieren Prop-Typen bereits als `tsType`-Hinweise, die Schnittstellen ließen sich also sauber typisieren. Spricht dagegen: zusätzliche Lernkurve/Setup. Die Exporte selbst erzeugen keinen TSX-Zwang (sie sind kein JSX/TSX, siehe 5.7). Empfehlung wird in Etappe 1 mit Begründung vorgelegt.

### 5.2 State-Management über React Query hinaus (offen)
Für lokalen UI-Zustand (z.B. Drag&Drop-Zustand, Formulare) — reicht React-eigener State, oder wird eine zusätzliche Bibliothek gebraucht? Vermutlich nicht nötig, wird aber nicht vorab festgelegt.

### 5.3 Charts: React-nativ oder Portierung der SVG-Logik (offen, Etappe 8)
Die bestehenden Charts sind handgeschriebenes SVG ohne Framework-Bindung (`document.createElementNS`). Zwei Wege: (a) 1:1 als React-Komponenten mit `ref`-basiertem direktem DOM-Zugriff portieren (wenig Risiko, wenig "React-typisch"), (b) auf eine React-Chart-Bibliothek umstellen (mehr Aufwand, potenziell schlechter zur bestehenden Design-Sprache aus `chart-grundlagen.md` passend). Wird erst in Etappe 8 (Explorer) entschieden, nicht in Etappe 1.

### 5.4 Branch- und Ordner-Name (festgelegt)
Branch `dashboard-3.0` (Muster wie `dashboard-2.0`), Ordner `/app/`.

### 5.5 JSON-Pipeline (`generate-data.js` / Cron) (**bestätigt**, Etappe 2b, 06.08.2026)
Der GitHub-Actions-Cron erzeugt `data/*.json`, die die Vanilla-App liest. **Entscheidung: die Dateien bleiben, die React-App liest sie unverändert weiter.** Weder `scripts/generate-data.js` noch das Dateiformat werden angefasst; eine spätere Ablösung nach Supabase wäre ein eigenes Vorhaben.

Umsetzung: `app/src/api/pipeline.ts` + `useRides()`. Zwei Punkte, die dabei zu klären waren:
- **Dev-Server.** Der Vite-Dev-Server wurzelt in `/app/`, `data/` liegt im Repo-Root daneben. `serveRepoData()` in `app/vite.config.ts` liefert es unter `/data` aus (`apply: "serve"`, ~25 Zeilen, keine neue Dependency, kein Kopieren in den Build — eine Kopie wäre ein zweiter, sofort veraltender Stand). Verifiziert: `GET /data/rides.json` → 200, `application/json`, 387.249 Bytes.
- **Pfadbildung.** Über `import.meta.env.BASE_URL`. Ein absoluter `/data/…`-Pfad wäre auf GitHub Pages falsch (Projektseite unter `/training-dashboard/`), ein relativer `./data/…` bräche bei tiefen Client-Routen wie `/planning`. In Produktion (Etappe 10) liegt `/data/` neben der gebauten App.

### 5.6 Wie die React-Version während des Parallelbetriebs sichtbar ist (Empfehlung steht)
G2 sagt, die alte Seite bleibt live — GitHub Pages liefert aber von `main`. Drei Wege: (a) nur lokal per `npm run dev` ansehen bis zur Umschaltung, (b) zweiter Pages-Deploy aus dem `dashboard-3.0`-Branch unter eigenem Pfad, (c) externer Preview-Dienst. **Empfehlung: (a) für Etappe 1–3** (da gibt es ohnehin nichts Anzusehendes), **ab Etappe 4 dann (b)**, damit Design-Iterationen im echten Browser auf echten Geräten beurteilbar sind. Entscheidung fällt spätestens zu Etappe 4.

### 5.7 Design-Übernahme-Workflow (festgelegt, 04.08.2026)

**Befund aus dem echten Export (Rad-Dashboard_Hero-Redesign):** Kein Tailwind, kein JSX, keine Module. Statische Varianten (`*.dc.html`) sind pures HTML mit Inline-Styles plus CSS-Variablen-Tokens (oklch: `--ink`, `--accent`, `--glass`, `--hair` …). Interaktive Varianten sind React-**Klassenkomponenten** auf proprietärer Runtime: `DCLogic`-Basisklasse aus `support.js`, UI über `h(...)`-Aufrufe, Mount via `x-dc`-Custom-Element, Props als `data-props`-JSON.

**Festgelegter Weg:** Übernahme per `claude_design`-MCP (Claude Design generiert den Import-Prompt mit Projekt-URL und Fokus-Dateien; Claude Code liest das Design-Projekt direkt, Auth via `/design-login`) — kein Zip-Umweg. Der von Claude Design generierte Prompt wird in die feste Vorlage **`docs/vorlage-design-import.md`** eingesetzt, die die Projektregeln ergänzt:

1. **Tokens:** Farben/Radien/Schatten ausschließlich über `styles/tokens.css`; Werte aus dem Export dorthin abgleichen, keine zweite Wahrheit im Komponenten-Code
2. **Runtime:** `DCLogic`/`support.js` **nicht** übernehmen — Logik als Function Components mit Hooks neu, `data-props` werden echte Component-Props
3. **Daten:** Fake-Daten des Exports (z.B. `rnd()`-Generatoren) durch die Etappe-2b-Hooks ersetzen; erwartete Datenform im Import-Fenster dokumentieren
4. **Ablage:** geteilte Bausteine nach `components/`, bereichsgebundenes nach `features/<bereich>/`; Testpflicht und Commit-Konventionen wie überall (G7)

Die Vorlage entsteht als Ergebnis des ersten echten Durchlaufs in Etappe 4 und gilt danach für alle Bereiche. **Kein Tailwind** — die Exporte nutzen keins, der Integrationspunkt ist die gemeinsame Token-Datei. Jede Design-Iteration ist damit ein kleines, immer gleich geschnittenes Import-Fenster.

---

## Abnahme

Dieses Dokument regelt nur den Rahmen (Abschnitte 0–3), die Etappenfolge (Abschnitt 4) und den Design-Übernahme-Workflow (5.7). Es ersetzt nicht die Detailkonzepte pro Bereich, die wie bisher einzeln entstehen, sobald die jeweilige Etappe ansteht.

## Modell-Kürzel

`[F5]` Opus 4.7/4.8 — Architektur, Security, Debugging
`[OP]` Opus 4.6 — große Refactorings, State-Sync
`[SO]` Sonnet 4.6 — normale Implementierung, Komponenten, CRUD
`[HA]` Haiku 4.5 — Kleinkram
