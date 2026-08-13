# Konzept: React-Umbau (Dashboard 3.0)

**Stand:** 06.08.2026 (überarbeitete Fassung, ersetzt Stand 04.08.2026)
**Status:** in Umsetzung — Etappen 1, 2a, 2b, 3, 4, 5, 6a, 6b, 6c, 6d, 7a, 7b, 7c, 7d, 8a, 8b, 8c, 8d, 8e, 8f und 9 sind umgesetzt (08.08.2026). Etappe 7 (Trainer-Dashboard + Export/Import) ist wie Etappe 6 in Sub-Etappen geschnitten (7a Trainer-Leiste, 7b Proposal-Review, 7c Export/Import, 7d Blockstart-Dialog) — Etappe 7 ist damit vollständig. Etappe 8 (Explorer + Charts) folgt der Reihenfolge aus `docs/phase-5-konzept-explorer.md` §7.2 (8a Chart-Engine + PMC-Basis-Chart, 8b Zeitraum-Brushing, 8c Verknüpfte Charts, 8d What-if-Regler, 8e Vergleichsmodus), 8e schloss §7.2 selbst formal ab (Schritt 5 "Charts-Tab nachziehen" ist laut §8 ein eigener, späterer Fahrplan-Schritt) — **8f ist ein Nachtrag außerhalb dieser Nummerierung** (`charts/README.md` hatte ihn schon vor 8e als Fortsetzung angekündigt): bringt Power-Curve/Wochenvolumen/Wellness (je ein Chart pro verbleibender Familie aus `docs/chart-grundlagen.md` §7.2) auf dieselbe React-Engine wie die PMC-Kurve, ohne deren Brush/Cursor-Sync/What-if/Vergleich-Erweiterungen zu übernehmen. **Etappe 9 (Settings)** ist damit die letzte reguläre Bereichs-Etappe. **Etappe 10 (Umschaltung)** ist in drei Teile geschnitten (Teil A Routing/Gates, Teil B Security-Regressionsdurchlauf, Teil C echte Live-Umschaltung) — Teil A+B+C sind umgesetzt (08.08.2026, s. "Änderungen durch Etappe 10, Teil C" unten); der einzige noch offene Teil-C-Punkt (alte Vanilla-Dateien aus `main` entfernen) ist auf Alex' Wunsch zurückgestellt. Der Live-Check direkt nach dem Merge deckte auf, dass mehrere große Vanilla-Bereiche nie auf der Etappen-Roadmap standen (Fahrtenbuch, Gesamtstatistiken-Kacheln, kompletter Analyse-Tab) plus zwei Design-Baustellen (Nav-Styling, Seitenbreite) — als **Etappe 11** eingeplant, s. dortigen Abschnitt.
**Vorgänger:** Dashboard 2.0 (Vanilla JS, live auf `main`/`stuhlsen.github.io`)

> **Vorbedingung vor Etappe 1:** ✅ erfüllt (Stand 06.08.2026).
> 1. Die drei zuvor fehlenden Commits (`865c709`/`8e5f47f`/`75c8047` auf `main`) sind per Cherry-Pick auf `dashboard-3.0` verteilt (dort als `ce11eef`/`425875f`/`eb3093f`, andere Hashes, inhaltlich dateiweise diff-geprüft identisch).
> 2. Migrationen 0012–0017 sind gegen `dashboard-dev` und `prod` angewendet (bestätigt 06.08.2026).
>
> Die frühere Vorbedingung (`event-athlete-crud`-Bugfix auf `main`) ist erfüllt und damit gegenstandslos.

## Änderungen durch Etappe 10, Teil C (08.08.2026)

Live-Umschaltung durchgeführt: `main` fast-forward auf `origin/main`,
`dashboard-3.0` per `git merge --no-ff` reingemergt (`09b2269`, Muster wie
der `dashboard-2.0`-Merge `6ccca9c`), gepusht. `sync-data.yml` baut jetzt
`app/` (`npm ci && npm run build`), legt `data/*.json` + einen
`404.html`-SPA-Fallback ins Deploy-Artefakt und lädt `app/dist` statt des
kompletten Checkouts hoch. `vite.config.ts` setzt `base` nur im Build auf
`/training-dashboard/`, `main.tsx` bekam den passenden Router-`basename`.

**Vor dem Merge, aus dem erneuten vollen Review (632 Dateien, `dashboard-3.0`
vs. `main`) direkt gefixt:** Wahoo-Push war für Trainer mit Schreibrecht
erreichbar, unabhängig vom Direkt/Vorschlag-Umschalter — widerspricht
`docs/phase-4-konzept-trainer-sicht.md` ("Kein Wahoo-Push durch den
Trainer", der Token gehört dem Athleten). Bestand identisch schon im
Vanilla-Original, dort jetzt gegenstandslos (Datei entfernt). `canPush`
prüft jetzt zusätzlich `!isTrainer` (`PlanningPage.tsx`).

**Nach dem Merge, in der Live-Verifikation gefunden und direkt gefixt:**
- `background.png` war hart auf `/` verdrahtet statt über `BASE_URL` —
  404 auf der echten `/training-dashboard/`-Pages-URL (`AppBackground.tsx`).
- HRV/Ruhepuls-Chart riss die Linie an jeder Messlücke ab (`segmentsFor()`,
  für PMC/CTL mit lückenlos-täglicher Reihe gebaut) statt wie im Original
  (`assets/js/ui/charts/wellness.js::renderHrvRhfChart`, Alex' Design-
  Entscheidung) nur die echten Messpunkte direkt zu verbinden
  (`WellnessChart.tsx`).

Alle drei Fixes: `tsc -b` sauber, `npx vitest run` 1065/1065, `npm test`
(Root) 936/936, jeweils vor dem Push verifiziert; die zwei Live-Funde
zusätzlich per Playwright-Snapshot direkt gegen `stuhlsen.github.io/
training-dashboard/` bestätigt (0 Konsolenfehler nach dem zweiten Fix).

**Zurückgestellt auf Alex' ausdrücklichen Wunsch:** alte Vanilla-Dateien
(`index.html`, `assets/js/`, `assets/css/`) sind auf `main` noch nicht
entfernt — `scripts/`/`tests/`/`data/` bleiben ohnehin (JSON-Pipeline
unverändert, s. 5.5). Nächster Schritt, sobald freigegeben.

## Änderungen durch Etappe 10, Teil A+B (08.08.2026)

Etappe 10 ist in drei Teile geschnitten (Rückfrage vor der Umsetzung, s.
`docs/offene-punkte.md`): Teil A (Routing/Gates), Teil B (Security-
Regressionsdurchlauf), Teil C (echte Live-Umschaltung main = React-App,
GitHub Pages umbiegen). Teil C ist production-facing und nicht trivial
rückgängig zu machen — bewusst zurückgestellt, Alex gibt den Startschuss
separat frei. Teil A+B sind umgesetzt.

**Teil A — Routing/Gates:**
- `ProtectedRoute` (Etappe 1) sperrte seit Projektbeginn ALLE Routen hinter
  Login — widersprach der Sichtbarkeits-Matrix (`docs/phase-6-konzept-
  sichtbarkeit.md`, E1: Lesedaten/`goals`/`events`/`plan_cards`/`proposals`
  sind öffentlich lesbar). Bereits bei Etappe 5 als echter Fund erkannt und
  auf Etappe 10 verschoben. Jetzt gefixt: `App.tsx` wrappt Hero/Planning/
  Explorer/Events direkt in `Layout`, `ProtectedRoute` gated nur noch die
  Settings-Unterroute (rein persönlich: Passwort, Profil, athletengated
  Ziele/FTP/Formate/Datenquellen). Die bestehenden Schreib-Gates
  (`canWriteForAthlete()` in `api/write-authorization.ts`) bleiben
  unverändert — sie sind der eigentliche Schutz für Buttons/Mutationen,
  nicht die Route.
- `Layout.tsx`: "Abmelden"-Button nur bei aktiver Session, sonst ein
  "Anmelden"-Link — ein Besucher hat nichts zum Abmelden.
- **Echter Fund während der Recherche:** `TrainerPage.tsx` war noch der
  Etappe-1-Platzhalter (`<h1>Trainer</h1>`), nie befüllt — die komplette
  Trainer-Funktionalität (TrainerBar, ProposalList/-Compare/-Banner) sitzt
  seit 7a-7d in `PlanningPage.tsx`, nicht in einer eigenen Route. Der
  `/trainer`-Nav-Eintrag führte ins Leere. Entfernt (Datei, Route, Nav-
  Eintrag) statt nur dokumentiert — Muster "Entfernter Alt-Code" (AGENTS.md).

**Teil B — Security-Regressionsdurchlauf:** Playwright MCP gegen
`dashboard-dev`, einmalig nach Teil A (Accounts: Stuhlsen/Trainer-ST/
hc_diZee, plus explizit ausgeloggt). 0 Konsolenfehler über die gesamte
Session.

- **Echter Fund, direkt gefixt:** die Belastungsempfehlung-Kachel im Hero
  (`BriefingCard`, Puls/HRV/Form/Ampel) war für Besucher sichtbar. Die
  Matrix ordnet die "Governor-Empfehlung" explizit als für Besucher
  gesperrt ein — abgeleitete Daten erben die Sichtbarkeit ihrer
  sensibelsten Quelle (Befinden), unabhängig davon, ob für die konkrete
  Anfrage gerade private Daten einflossen. Fix: `HeroPage.tsx` rendert die
  Kachel nur noch bei aktiver Session (`useAuth().session`).
- Verifiziert: Besucher sieht Hero/Planning/Explorer/Events ohne Redirect,
  ohne Schreib-Buttons, ohne Governor-Kachel; Settings leitet auf `/login`
  um. Stuhlsen (Athlet) hat weiterhin volles CRUD. Trainer-ST (Trainer von
  Stuhlsen) sieht die TrainerBar korrekt. hc_diZee (fremder Account) sieht
  bei Stuhlsens Plan weder TrainerBar noch Schreib-Buttons.
- `npx tsc -b` sauber, `npx vitest run` 1065/1065 grün, `npx eslint .` ohne
  neue Errors (3 vorbestehende Warnings, unverändert).

**Commit:** `2aff78f`.

## Änderungen durch Etappe 9 (08.08.2026)

Settings — letzte reguläre Bereichs-Etappe vor Etappe 10 (Umschaltung).
Zuschnitt vorab mit Alex abgestimmt (zwei Punkte, die über den reinen
1:1-Port hinausgehen bzw. bewusst NICHT angefasst wurden, s. u.), Rest ist
Port von `ui/settings-panel.js`.

- **Ziele/FTP-Historie/Formate/Datenquellen** (athletengated,
  `profile.role === "athlete"`) und **Name/Passwort** (alle Rollen, C5.3)
  — sechs Sektionen wie im Vanilla-Original. Der Großteil der
  Datenzugriffsschicht existierte bereits aus früheren Etappen, nur
  ungenutzt: `updateDisplayName`/`updateWellbeingPublic` (Etappe 1/2b,
  `api/supabase/profiles.ts`), `updatePassword` (Etappe 1, `auth.ts`),
  `saveFtpEntry` (Etappe 7c, dort bewusst nur der Lesepfad verdrahtet),
  `getSessionFormats`/`getAthleteFormats`/`setAthleteFormatActive`
  (Etappe 7c, dort nur die aktiven Formate für die Export-Panel-Zeile über
  `useLadderState`). Neu war ausschließlich die **Ziele**-Datenzugriffsschicht
  (`api/supabase/goals.ts`) — `state/goals.js` hatte in Dashboard 2.0 nie
  eine TS-Entsprechung, anders als die übrigen Adapter.
- **`api/hooks/useAthleteFormats.ts`** (neu) — liefert den VOLLEN
  Formatkatalog + Aktiv-Status des eingeloggten Profils, anders als
  `useLadderState()` (nur aktive Formate). Die L1.1-Regel (max. zwei aktive
  Familien pro Blockziel) ist eine reine, getestete Funktion in
  `features/settings/formats-view-model.ts` — wie im Vanilla-Original sitzt
  die Prüfung im UI-Klick-Handler, nicht im Hook/Adapter.
- **`features/settings/CheckinDialog.tsx`** (neu, ÜBER den Vanilla-Port
  hinaus) — Port von `ui/checkin-dialog.js`. Der tägliche Befinden-Check-in
  hatte im React-Dashboard bislang GAR KEINE UI: `useSaveCheckin()` (Etappe
  2b) existierte unbenutzt, `useTodayCheckin()` wurde nur lesend im Hero
  gebraucht. Ohne diesen Dialog hätte ein Athlet im React-Dashboard keine
  Möglichkeit gehabt, sein Befinden einzutragen. Erreichbar wie im Original
  über "Befinden anpassen" in der Profil-Sektion, drei Slider (Energie/
  Muskelgefühl/Stimmung) + Notiz.
- **`profiles.ladder_progression_enabled` bewusst NICHT angefasst** — kurz
  erwogen (ein Toggle neben den Formaten läge nahe), dann verworfen: Migration
  0016 sperrt die Spalte per Spalten-Grant explizit gegen Self-Service
  (athletenweite Freigabe wie `is_admin`, keine Athleten-Präferenz — bewertet
  Datenqualität für die scharfe Leiter-Fortschreibung, wird manuell per SQL
  gesetzt). Ein Settings-Toggle hätte entweder serverseitig scheitern oder
  die Sperre per neuer Migration aufheben müssen — beides außerhalb dieser
  Etappe, mit Alex geklärt.
- **Fünf Commits** (Adapter/Hooks getrennt von der UI-Zusammensetzung, analog
  zum Zuschnitt in 8b-8f): Ziele-Adapter+Hook, FTP-Historie-Schreibpfad,
  Formate-Hook+L1.1-Regel, Profil-Hooks (Name/Wellbeing/Passwort),
  Settings-Seite (alle Sektionen + Check-in-Dialog + Seiten-Zusammenbau,
  ersetzt den Etappe-1-Platzhalter `SettingsPage.tsx`).
- **Abnahme:** in `/app/` (PowerShell ohne `&&`): `npx tsc -b` sauber,
  `npx eslint .` ohne neue Warnungen/Fehler (3 vorbestehende, unveränderte
  Warnings), `npx vitest run` 1065/1065 grün (1042 + 23 neue Testfälle:
  `goals.test.ts` (3), `useGoals.test.tsx` (5), zwei neue Fälle in
  `useFtpHistory.test.tsx`, `useAthleteFormats.test.tsx` (3),
  `formats-view-model.test.ts` (5), `useProfile.test.tsx` (5)). Manuelle
  Playwright-Verifikation gegen `dashboard-dev` steht noch aus (macht Alex
  einmalig am Ende der Etappe, wie Konvention).

## Änderungen durch Etappe 8f (08.08.2026)

Drei weitere Charts auf die in 8a gebaute React-Engine gebracht — je einer
für die drei bislang unbearbeiteten Familien aus `docs/chart-grundlagen.md`
§7.2 (Power = Familie 4, Wochenvolumen = Familie 3, Wellness = Familie 2).
`charts/README.md` hatte das schon vor 8e angekündigt ("power/training/
wellness folgen nach demselben Muster in 8f"). Bewusst eng gehalten wie
8a: je EIN repräsentativer Chart pro Familie, ohne die für PMC in 8b-8e
gebauten Cross-Cutting-Features (Brush-Fenster, Cursor-Sync, What-if,
Vergleich) — die bleiben eigenständige, potenzielle spätere Schritte.
Drei eigene Commits, je eigener `node -c`/`npm test`-Lauf; Playwright/
`/code-review` einmalig am Ende (Etappen-Konvention).

- **`charts/PowerCurveChart.tsx`** (neu) — Port von `assets/js/ui/charts/
  power.js::renderPowerCurve()`. Familie 4 (nicht-Datums-Achse): x-Achse
  ist wie im Vanilla-Original index-basiert über die 11 festen
  Standard-Zeitintervalle (`core/powercurve.js::buildCurveData`, bereits
  seit dashboard-2.0 portiert, hier zum ersten Mal von einer React-
  Komponente konsumiert) — `core/chart-scale.js::makeIndexScale` ist dafür
  direkt wiederverwendbar, KEINE neue Log-Skalen-Funktion nötig (die
  Standard-Buckets sind bereits annähernd logarithmisch gestaffelt, das
  reicht für die visuelle Wirkung; ein erster Entwurf mit einer echten
  `makeLogScale({minSecs,maxSecs,...})` wurde verworfen, nachdem der
  Vanilla-Quellcode geprüft war und sich als index-basiert herausstellte —
  Konsistenz mit dem Original wog hier schwerer als eine technisch
  "richtigere" Skala ohne Vorbild). FTP-Referenzlinie (`ftp`-Prop, dieselbe
  `resolvePlanningFtp`-Ableitung wie die PMC-Kurve), Fläche unter der
  Kurve + Fläche über FTP ("anaerobe Reserve"). Bewusst NICHT portiert:
  W/kg-Unit-Toggle, Block-Overlay-Vergleich (Scope-Entscheidung).
- **`charts/WeeklyVolumeChart.tsx`** (neu) — Port von `assets/js/ui/
  charts/training.js::renderWeeklyVolume()`. Familie 3 (Aggregat-Balken):
  slot-basierte x-Achse (kein `makeIndexScale`, keine Datumsachse) über
  `core/aggregate.js::weeklyByCalendar` (bereits portiert), Label-Kürzung
  über `core/week-labels.js::weekDisplayLabels` + Ausdünnung über
  `core/chart-scale.js::pickLabelIndices` (beide bereits portiert, hier
  zum ersten Mal von einer React-Komponente konsumiert). Zielzone
  180-220km + Ziel-Linie nur bei eigenem Plan (`weeklyData.some(d =>
  d.phase != null)`), phasengefärbte Balken über `config.ts::phaseColor()`.
  Bewusst NICHT verdrahtet: die in `core/chart-buckets.js` bereits seit
  dashboard-2.0 vorbereitete, aber bislang von keiner React-Komponente
  konsumierte Bucket-Hover-Kopplung ans PMC-Fadenkreuz und der
  Brush-Klick-auf-Balken (Familie 3 ist "Brush-Ziel, nicht Brush-Fläche",
  §7.3) — bleibt für einen späteren Schritt liegen.
- **`core/wellness-series.js`** (neu) — Port von `assets/js/ui/charts/
  wellness.js::_mergedOwnPlanSeries()`. Notwendig, nicht optional: vor
  Mitte Juni tragen nur `rides` HRV/Ruhepuls-Werte (Notion-Ära, RMSSD via
  Apple Health), erst danach `wellness` (intervals.icu, SDNN) — ohne den
  Merge fehlt die komplette Frühgeschichte des Eigenplan-Athleten.
  `mergedOwnPlanSeries(rides, wellness, rideField, wellnessField)` deckt
  beide Metriken (HRV/Ruhepuls) über dieselbe Funktion ab, exakt wie das
  Vanilla-Original.
- **`charts/WellnessChart.tsx`** (neu) — Familie 2 (lückige Zeitreihe):
  `core/days.js::densifyDays`/`joinSeries("gap")` (bereits seit Phase 5
  portiert, hier zum ersten Mal von einer React-Komponente konsumiert),
  `core/pmc-series.js::segmentsFor` generisch wiederverwendet (war bislang
  nur PMC-intern genutzt, nimmt aber jedes `(number|null)[]` entgegen).
  EIN Chart mit `metric`-Prop-Umschalter ("hrv"/"ruhepuls") statt der zwei
  separaten vanilla-Funktionen `renderHrvTrend`/`renderRhfTrend`, die sich
  ohnehin dieselbe Engine (`renderHrvRhfChart`) teilten — passt besser zur
  React-Idiomatik als ein Duplicate-Komponenten-Paar. Zeigt bewusst die
  GANZE Historie, kein Brush-Fenster (wie vanilla begründet: ein
  90-Tage-Default würde den HRV-Methodenwechsel-Marker oft aus dem Blick
  verdrängen). Methodenwechsel-Marker (RMSSD→SDNN) + zwei getrennte
  Trendlinien (`core/stats.js::linearTrend`, bereits portiert) davor/
  danach. **Reduziert ggü. vanilla:** keine zusätzlichen
  Mittelwert-Referenzlinien (Scope-Kürzung).
- **`features/explorer/ExplorerPage.tsx`**: drei weitere `GlassCard`-
  Abschnitte nach dem PMC-Abschnitt angehängt (Power-Curve, Wochenvolumen,
  Wellness), gleiches Titel-Zeile-plus-Chart-Muster. `wellness`/
  `powerCurves` kommen unverändert aus dem bereits geladenen `rideData`
  (`api/hooks/useRides.ts` → `AthleteData`, keine neue Datenquelle/kein
  neuer Hook). `wellnessMetric`-State lokal (`useState`, kein
  `localStorage` — flüchtiger UI-Zustand wie `hoveredDate`).
- **Abnahme:** in `/app/` (PowerShell ohne `&&`): `npx tsc -b` sauber,
  `npx eslint .` ohne neue Warnungen/Fehler, `npx vitest run` 1042/1042
  grün (1042 = alter Stand 1021 + 21 neue Testfälle über die drei neuen
  Chart-Komponenten + `core/wellness-series.test.js`). Manuelle
  Playwright-Verifikation gegen `dashboard-dev` steht noch aus (macht Alex
  einmalig am Ende der Sub-Etappe, wie Konvention).

## Änderungen durch Etappe 8e (08.08.2026)

Vergleichsmodus (docs/phase-5-konzept-explorer.md §5, Baustein 3A) —
Schritt 4 aus §7.2, letzte Sub-Etappe von Etappe 8. Wie bei 8d war
`core/compare.js` bereits seit Etappe 2a byte-identisch portiert und
getestet (`compare.test.js` lief bereits grün) — 8e hat nur die
React-UI- und Persistenzschicht gebaut.

- **`api/hooks/explorer-storage.ts`**: `ExplorerStorage`-Interface um das
  optionale Feld `compareSlots` erweitert (`{enabled, a, b}`, `a`/`b` je
  `{from, to}` oder `null`) — dieselbe gemergte Hülle wie `range`/
  `scenario` seit 8d, keine Struktur­änderung an `read`/`write`.
- **`api/hooks/useExplorerCompare.ts`** (neu, Port von `state/chart-view.js`s
  `compareSlots`-Teil) — persistiert `{enabled, a, b}` je Athlet über obige
  Hülle, gleiches "Zustand während des Renderns anpassen"-Muster wie
  `useExplorerScenario.ts` (Reset bei Athletenwechsel, kein Effekt).
  Gleiche `enabled`-Konvention: Slots bleiben gemerkt, auch wenn der Modus
  ausgeschaltet wird. `buildCompare()` wird bewusst NICHT im Hook
  aufgerufen (kein zu cachendes Ableitungsergebnis wie
  `scenarioProjection`) — die UI-Schicht (`ExplorerPage.tsx`) ruft es bei
  jedem Render mit den aktuellen Rides direkt auf, exakt wie im
  Vanilla-Original.
- **`charts/CompareChart.tsx`** (neu) — zweite CTL-Kurve pro Slot auf
  RELATIVER `dayOffset`-Achse (Tag 1 = Blockstart), Slot A durchgezogen
  (`var(--z2)`), Slot B gestrichelt/reduzierte Deckkraft (`var(--ss)`,
  `5,4`/`.75` — dieselben Werte wie die Szenario-Zweitserie aus 8d).
  Ungleich lange Slots werden nicht gestreckt (X1): `maxLen` bestimmt nur
  die Achsenbreite, der kürzere Slot endet einfach früher. Ersetzt
  `PmcChart` in `ExplorerPage.tsx` komplett, wenn der Vergleich aktiv ist
  (eine relative und eine absolute Achse passen nicht in dieselbe `<svg>`)
  — Übersichtsleiste, Presets und Szenario-Regler bleiben daneben
  unverändert aktiv, wie im Original.
  **Scope-Kürzung ggü. dem Vanilla-Original** (`ui/charts/pmc.js::
  drawCompareView`): kein Umschalten auf Wochen-Ticks bei sehr
  langen/schmalen Slots (`drawWeekTicks`/`isoWeekKey`/
  `weekDisplayLabels` sind im React-Port bislang nirgends portiert, auch
  nicht für andere Charts) und keine `fitsLabel()`-Direktbeschriftung
  mitten in der Kurve (dieselbe Auslassung wie bei der Szenario-Linie aus
  8d, s. dortiger Eintrag) — stattdessen eine feste Legende
  (Farbpunkt + Label) über dem Chart, die erste ihrer Art im React-Port.
  Cursor ist bewusst LOKAL (`useState` in der Komponente, kein
  `hoveredDate`-Prop-Sync wie bei PmcChart/BrushBar) — ein `dayOffset`
  trägt zwei echte Daten (Slot A ≠ Slot B), die sich nicht auf ein
  einzelnes globales Hover-Datum abbilden lassen (gleiche Begründung wie
  im Original).
- **`charts/ComparePanel.tsx`** (neu) — Toggle + "Als A/B merken"-Buttons +
  Kennzahlen (Σ TSS, ⌀ CTL, Rampe, harte Tage), Port von `index.html`s
  `#pmc-compare`-Markup. Drei Anzeigezustände je Slot wie im
  Vanilla-Original (`renderMetrics()`): nicht gemerkt / gemerkt aber Modus
  aus / aktive Kennzahlen. **Vereinfachung ggü. vanilla:** "Als A/B merken"
  übernimmt das aktuelle Brush-Fenster direkt als ISO-Bereich
  (`{fromISO, toISO}` aus `useExplorerRange`) — vanilla rechnet dafür
  Tagesindizes (`ws`/`we`) über das zuletzt gezeichnete PMC-Skelett in
  `{from, to}` um, weil dort kein ISO-Fenster als State existiert; der
  React-Port hat dieses ISO-Fenster seit 8b bereits als eigenen State
  (`range`), die Skelett-Konvertierung entfällt ersatzlos.
- **`features/explorer/ExplorerPage.tsx`**: `useExplorerCompare` +
  `compareResult`-`useMemo` (`buildCompare(rides, compareSlots.a,
  compareSlots.b)`) verdrahtet, `compareActive` (`enabled && a && b`)
  schaltet zwischen `PmcChart` und `CompareChart` um, `ComparePanel` unter
  einem zweiten Trenner in dieselbe `GlassCard` gehängt. Nebenbei behoben:
  `rides` (bis dahin ein `?? []`-Fallback ohne `useMemo`) ist jetzt selbst
  gememoized — `compareResult`s Abhängigkeit darauf hätte sonst bei jedem
  Render neu gerechnet, solange `rideData?.rides` noch `undefined` ist
  (ESLint `react-hooks/exhaustive-deps`, keine Verhaltensänderung, nur
  ein vermiedener unnötiger Recompute).
- **Kein neuer Test für `core/compare.js`** — bereits seit Etappe 2a
  byte-identisch portiert und getestet (`compare.test.js`), keine
  Änderung in dieser Etappe.
- **Abnahme:** in `/app/` (PowerShell ohne `&&`): `npx tsc -b` sauber,
  `npx eslint .` ohne neue Warnungen/Fehler (3 vorbestehende, unveränderte
  Warnings), `npx vitest run` 1021/1021 grün (1021 = alter Stand 1009 + 12
  neue Testfälle: `explorer-storage.test.ts` (+1), `ComparePanel.test.tsx`
  (neu, 6), `CompareChart.test.tsx` (neu, 5)). Manuelle
  Playwright-Verifikation gegen `dashboard-dev` steht noch aus (macht Alex
  einmalig am Ende der Sub-Etappe, wie Konvention).

## Änderungen durch Etappe 8d (08.08.2026)

What-if-Szenarien (docs/phase-5-konzept-explorer.md §6, Variante 4A) —
Schritt 3 aus §7.2. Anders als 8a-8c hatte diese Sub-Etappe bereits ein
vollständiges Vanilla-Vorbild (`assets/js/state/chart-view.js` + der
Szenario-Teil von `assets/js/ui/charts/pmc.js`), core/scenario.js selbst
war schon byte-identisch seit Etappe 2a portiert (core/scenario.test.js
lief bereits grün) — 8d hat nur die React-UI- und Persistenzschicht
gebaut.

- **`api/hooks/explorer-storage.ts`** (neu) — gemeinsame, gemergte
  localStorage-Hülle für `explorer_<athleteId>` (§10.3). Ersetzt die
  bisherige, lokale `readStoredRange`/`writeStoredRange` in
  `useExplorerRange.ts`: die alte `writeStoredRange()` schrieb das GANZE
  Objekt als `{ range }` — ein zweiter Hook, der unabhängig in denselben
  Schlüssel schreibt (hier: Szenario), hätte das jeweils andere Feld
  stillschweigend gelöscht. `readExplorerStorage`/`writeExplorerStorage`
  lesen/schreiben jetzt gemergt; `useExplorerRange.ts` liest/schreibt nur
  noch sein `range`-Feld darüber, unverändertes Verhalten. Regressionstest
  in `explorer-storage.test.ts`.
- **`api/hooks/useExplorerScenario.ts`** (neu, Port von
  `state/chart-view.js`s `scenario`-Teil) — persistiert `{enabled,
  weekTssPct, restDays, rampRatePct}` je Athlet über obige Hülle, Reset bei
  Athletenwechsel über dasselbe "Zustand während des Renderns anpassen"-
  Muster wie `useExplorerRange.ts` (kein Effekt). Bewusst OHNE injizierten
  `scenarioSources`-Provider (den vanilla braucht, weil `state/chart-view.js`
  ein Modul-Singleton außerhalb des Komponentenbaums ist) — die zweite
  Prognosekurve wird stattdessen direkt in `ExplorerPage.tsx` als reine
  `useMemo`-Ableitung berechnet (Cards/Rides/Events/FTP sind dort ohnehin
  schon aus dem React-Query-Cache im Scope), Port von
  `state/chart-view.js::recomputeScenario()` 1:1 in Logik, nicht in Struktur.
- **`charts/WhatIfPanel.tsx`** (neu) — Toggle + drei Regler (Wochen-TSS
  ±50%/5er-Schritte, zusätzliche Ruhetage/Woche 0-3, Rampenrate
  -20…+30%/5er-Schritte), Min/Max/Step 1:1 aus `index.html`s
  `#pmc-scenario`-Markup übernommen. Regler bleiben wie im Vanilla-Original
  IMMER interaktiv, unabhängig vom Toggle-Zustand (X8/§6: "Regler auf 0"
  heißt weiterhin AN, nur eben mit neutralen Werten) — ein Wert lässt sich
  vorbereiten, bevor das Szenario eingeschaltet wird.
- **`charts/PmcChart.tsx`**: neue optionale Prop `scenarioProjection`.
  Zweite CTL-Linie (gestrichelt `4,3`, Deckkraft `.55`, dieselbe Rollenfarbe
  wie die Basis-CTL-Linie — Zweitserien-Konvention aus
  `assets/js/ui/charts/base.js::SERIES_STYLE.secondary`) plus ein eigenes,
  schwächeres Unsicherheitsband (Deckkraft `.06` ggü. `.12` beim
  Basis-Band) für die `uncertain`-Tage der Szenario-Kurve — Pflicht laut
  §6.3, nicht Kür: eine aus dünner K3-Typ-Default-Datenbasis geschätzte
  Szenario-Kurve darf nicht präziser aussehen, als sie ist. Die Szenario-
  Linie startet immer bei "heute" (`projectLoad()` rechnet stets ab today)
  und wird nur gezeichnet, wenn "heute" auch im sichtbaren Brush-Fenster
  liegt — ein rein historischer Brush zeigt keine Zukunftsprognose. Bewusst
  KEIN Direktbeschriftungs-Label ("Szenario", vanilla nutzt dafür
  `flattestIndex`/`haloLabel`) — diese Direktbeschriftungs-Maschinerie ist
  im React-Port bisher an keiner Stelle portiert (auch CTL/ATL/TSB selbst
  haben keine In-Chart-Labels, nur Farbcodierung + Kartentitel), ein
  Alleingang nur für die Szenario-Linie wäre inkonsistent — Nachzug erst mit
  der "Vereinheitlichung" aus `docs/chart-grundlagen.md` §8 (G12, nach
  Phase 5, s. dortiger Eintrag in Etappe 8a-8c).
- **`features/explorer/ExplorerPage.tsx`**: `useExplorerScenario` +
  `scenarioProjection`-`useMemo` (Port von `recomputeScenario()`, s.o.)
  verdrahtet, `WhatIfPanel` unter einem Trenner in dieselbe `GlassCard` wie
  `BrushBar`/`PmcChart` gehängt (Chart-Merge-Konvention statt neuer Box).
- **Kein neuer Test für `core/scenario.js`** — bereits seit Etappe 2a
  byte-identisch portiert und getestet (`scenario.test.js`), keine Änderung
  in dieser Etappe.
- **Abnahme:** in `/app/` (PowerShell ohne `&&`): `npx tsc -b` sauber,
  `npx eslint .` ohne neue Warnungen/Fehler (3 vorbestehende, unveränderte
  Warnings), `npx vitest run` 1009/1009 grün (1009 = alter Stand + 3 neue
  Testdateien: `explorer-storage.test.ts`, `WhatIfPanel.test.tsx`, plus
  3 neue Fälle in `PmcChart.test.tsx`). Manuelle Playwright-Verifikation
  gegen `dashboard-dev` steht noch aus (macht Alex einmalig am Ende der
  Sub-Etappe, wie Konvention).

## Änderungen durch Etappe 8c (08.08.2026)

Verknüpfte Charts (docs/phase-5-konzept-explorer.md §3) — v1-Scope laut
Konzept ist "Selektion & Hervorhebung (1B) plus Cursor-Sync (1A) innerhalb
des Explorers". Zwei architektonische Fakten haben den Zuschnitt gegenüber
der Vanilla-Vorlage (`state/chart-view.js` + `ui/table.js`/`ui/planned.js`)
verändert: Das Fahrtenbuch existiert im React-Port noch nicht (keine
Roadmap-Zeile dafür), und der Port nutzt echtes Routing statt Vanillas
Ein-DOM-Baum — Live-Cursor-Sync kann deshalb nur innerhalb einer Seite
funktionieren. Mit Alex abgestimmter Zuschnitt: Cursor-Sync bleibt auf
PmcChart↔BrushBar innerhalb des Explorers beschränkt; die
Fahrtenbuch-Verknüpfung entfällt (kann es nicht geben, solange es kein
Fahrtenbuch gibt), stattdessen ein Klick-Sprung zum Planungstab.

- **`charts/PmcChart.tsx`**: neue optionale Props `hoveredDate`/
  `onHoverChange` (kontrolliert wie `range` aus 8b) und `onSelectDate`. Die
  bereits vorhandenen, ausgedünnten Hover-Kreise lösen jetzt zusätzlich
  Hover-Callbacks aus und sind klickbar; ein neuer Crosshair-Block
  (gestrichelte Linie + ein Punkt je Serie CTL/ATL/TSB) zeichnet sich bei
  passendem `hoveredDate` — Port der Bildsprache aus
  `assets/js/ui/charts/pmc.js::paintHover`, aber als reines
  Render-Fragment ohne eigenes State-Modul, weil `hoveredDate` bereits als
  kontrollierte Prop hereinkommt.
- **`charts/BrushBar.tsx`**: neue optionale Prop `hoveredDate` — zeichnet bei
  Auflösbarkeit eine dünne, nicht-interaktive Markerlinie
  (`pointerEvents="none"`) über der Übersichtslinie. Rein darstellend: die
  BrushBar hat keinen eigenen Datenpunkt-Hover, nur PmcChart löst
  `hoveredDate` aus (einseitiges Detail-Chart→Übersicht-Sync, kein
  ungenutzter Rückkanal).
- **`ExplorerPage.tsx`**: `hoveredDate`-State gehoben (Lift-State-Up wie
  `range`/`setRange`), an beide Charts durchgereicht; `useNavigate()` +
  `handleSelectDate()` navigiert bei Klick zu `/planning` mit
  `state:{highlightDate}`.
- **`features/planning/PlanCard.tsx`**: `data-plan-card-date={card.date}`
  auf dem Root-Element — gleiches leichtes Attribut-Muster wie `data-week`
  in PlanningPage.tsx, deckt alle vier Kartensektionen über eine
  Änderungsstelle ab.
- **`features/planning/PlanningPage.tsx`**: liest `useLocation().state.
  highlightDate`, ein ref-gewachter `useEffect` scrollt zur passenden Karte
  und togglet `.row-highlight` für ~2,5s, danach wird der Router-State
  geräumt — Port von `assets/js/ui/planned.js::scrollToDate` inkl. dessen
  leisem No-op, wenn keine Karte zum Datum existiert.
- **`index.css`**: neue globale `.row-highlight`-Utility-Klasse (Puls mit
  `var(--role-status)`, demselben Gold-Ton, den Vanilla für die gepinnte
  Crosshair-Linie nutzt) — einzige globale CSS-Klasse im Projekt, weil
  PlanCard/PlanningPage sonst ausschließlich Inline-Styles verwenden.

**Aus 8c ausgeklammert** (kommt in 8d/8e bzw. entfällt dauerhaft, s.o.):
What-if-Szenarien, Vergleichsmodus, Fahrtenbuch-Verknüpfung, Rückrichtung
Planungstab→Chart-Pin, `selectedDate`/Pin-Persistenz.

## Änderungen durch Etappe 8b (08.08.2026)

Zeitraum-Brushing (docs/phase-5-konzept-explorer.md §4, §7.2 Schritt 1) —
erste Sub-Etappe nach 8a, die dessen "bewusst ohne Brush"-Auslassung
schließt.

- **`core/brush.js`** (neu, rein, getestet) — `clampWindow()` klemmt ein
  Fenster auf `[anchorISO, horizonEndISO]` und erzwingt eine Mindestlänge;
  `presetWindow()` liefert die fünf Presets (30/90/365 Tage/Plan 2/alles).
  `"plan2"` liefert `null` ohne `plan2StartISO` — Aufrufer blenden den
  Button dann aus, statt eine leere Auswahl anzubieten (Athlet 2 hat keinen
  "Plan 2", s. AGENTS.md "Bekannte Eigenheiten").
- **`charts/BrushBar.tsx`** (neu) — schmale Übersichtsleiste, die *immer*
  den vollen Horizont zeigt (Anker-Fahrt bis `projection.horizonEnd`, via
  `pmcSkeletonAnchor()`), mit einer dünnen CTL-Linie im Hintergrund
  (`core/pmc-series.js::densifyPmc`, wie in `PmcChart`). Zwei Handles + ein
  Fenster-Rect, gezogen über native Pointer Events mit
  `setPointerCapture()` — anders als das Autoscroll-Muster in
  `assets/js/ui/plan-drag.js` reicht das hier ohne `document`-Listener,
  weil es keinen scrollenden Container gibt. Live-Updates werden auf einen
  `requestAnimationFrame` pro Frame gebatcht. Rechnet während des Ziehens
  in Index- statt ISO-Raum (der Skelett-Index deckt sich 1:1 mit dem
  Domänen-Bounds `[0, we]`), `clampWindow` kommt nur beim Laden/bei
  Presets zum Einsatz, nicht bei jedem `pointermove`.
- **`PmcChart.tsx`**: neue optionale `range`-Prop. Ohne sie bleibt exakt
  das bisherige Verhalten aus Etappe 8a (Fixdefault: letzte 90 Tage +
  Horizont) — bewusst optional statt Pflichtprop, damit `PmcChart.test.tsx`
  (8a) unverändert bleibt und der Chart auch standalone nutzbar ist.
- **`api/hooks/useExplorerRange.ts`** (neu) — lädt/klemmt den zuletzt
  gewählten Bereich aus `localStorage("explorer_<athleteId>")` (§10.3,
  Objekt-Hülle `{ range }`, für 8c–8e um `compareSlots`/`scenario`/`linked`
  erweiterbar). Bewusst **kein** `useEffect` mit synchronem `setState` (löst
  die ESLint-Regel `react-hooks/set-state-in-effect` aus) — der
  Default/gespeicherte Bereich ist eine reine Ableitung aus
  `athleteId`+Bounds (`useMemo`), ein aktiver Nutzer-Eingriff lebt separat
  als `override`-State und wird beim Athleten-/Bounds-Wechsel über Reacts
  "Zustand während des Renderns anpassen"-Muster zurückgesetzt (kein Ref,
  kein Effekt).
- **`ExplorerPage.tsx`**: `BrushBar` in dieselbe `GlassCard` wie `PmcChart`
  gehängt (Chart-Merge-Konvention statt neuer Box), `plan2StartISO` nur für
  Athlet 1 (`PRIMARY_ATHLETE_ID`) aus `PLAN2_SCHEDULE[0].start` abgeleitet.

**Aus 8b ausgeklammert** (kommt in 8c–8e, `docs/phase-5-konzept-explorer.md`
§7.2 Schritt 2–4): Cursor-Sync/Selektion über Charts hinweg,
What-if-Szenarien, Vergleichsmodus.

## Änderungen durch Etappe 7d (08.08.2026)

Blockstart-Dialog (E2, `docs/konzept-progressionssteuerung.md` L9) — der
letzte Baustein von Etappe 7, strukturell unabhängig von 7a–7c (kein
Datenbezug, deshalb zuletzt umgesetzt statt zuerst trotz Unabhängigkeit).

- **`useBlockTransition(athleteId, cards)`** (`api/hooks/useBlockTransition.ts`,
  Port von `state/block-transition.js`) — erkennt einen Blockwechsel (Blockziel
  heute ≠ Blockziel vor 7 Tagen, `core/periodization.js::currentBlockTarget`)
  und liefert die Kandidatenfamilien (mehr als eine für das Blockziel
  zulässig+aktiv), sofern seit Blockbeginn (`blockStartDate`) noch kein
  `reason:'block-start'`-Eintrag existiert. `cards` kommt vom Aufrufer
  (PlanningPage hat sie ohnehin schon über `usePlanCards`) statt eines
  zweiten Ladevorgangs. Query-Key hängt zusätzlich an einem Cards-
  Fingerprint (`qk.blockTransition`), weil ein Kartenwechsel das Blockziel
  verschieben kann, ohne dass sich profileId/athleteId ändern.
- **`useRecordBlockStart(athleteId)`** — schreibt die Wahl
  (`recordLadderStep`, immer `step:1, reason:'block-start'`) und invalidiert
  danach `useLadderState` (Export-Panel-Zeile) + die Blockstart-Query selbst.
- **`BlockDialogGate`/`BlockDialog`** (`features/planning/BlockDialog.tsx`,
  Port von `ui/block-dialog.js`) — Options-Kacheln (Zielsystem,
  `evidence_grade`, Beispieleinheit der Startstufe via `core/ladder.js::
  stepAt`/`formatSummary`), Vorauswahl über `defaultCandidate()`
  (`block-dialog-view-model.ts`: bevorzugt `studienlage` vor
  `coaching-konsens`). `BlockDialogGate` ist der Einstieg (Muster wie
  `ProposalBanner`: immer gemountet, entscheidet selbst über Sichtbarkeit),
  in `PlanningPage` neben `ProposalBanner` verdrahtet.
- **Session-Guard ohne Modul-State:** Vanillas modulweites
  `promptedThisSession`-`Set` wird hier zu zwei `useState`s
  (`dismissedKeys`/`openKey`) in `BlockDialogGate`, per Render-Phase-
  State-Anpassung gesetzt (Muster wie `PlanningPage::deltaBanner`) statt
  Effekt — sobald ein neuer Blockwechsel erkannt wird, in einem Zug als
  "gesehen" markiert und geöffnet, damit kein Zwischenrender den Dialog
  offen ohne Dismiss-Eintrag zeigt. Wie in Vanilla: kein DB-Schreiben vor
  einer echten Entscheidung, ein Seiten-Reload zeigt den Dialog erneut.
- **Nicht portiert, weil in 7c bereits miterledigt:** die Leiterstand-Zeile
  im Export-Panel (E1) — das lief vollständig über `useLadderState`
  (Etappe 7c, s. dortiger Abschnitt), 7d war ausschließlich E2.
- Browser-Smoke-Test (dev-Server, Playwright MCP, gegen `dashboard-dev`):
  Planungstab lädt für beide Athleten fehlerfrei, Athletenwechsel zu
  Stuhlsen (self-Pfad, löst die echten `useBlockTransition`/
  `useIsSelfAthlete`-Queries aus) ohne Konsolenfehler. Ein echter
  Blockwechsel mit >1 aktiver Familie lag im aktuellen Datenstand nicht
  vor (laut L9 auch nur alle vier bis sechs Wochen erwartet) — die Logik
  selbst ist über `useBlockTransition.test.tsx` (5 Fälle: Wechsel erkannt,
  nur eine aktive Familie, schon entschieden, kein Wechsel, fremder Athlet)
  und `block-dialog-view-model.test.ts` abgedeckt.

## Änderungen durch Etappe 7c (08.08.2026)

Export/Import-Workflow — der athletenseitige Weg, Claude als Trainer zu
konsultieren (`docs/phase-4-konzept-export-import-workflow.md`,
`docs/phase-4-konzept-export-richtungsvorgabe.md`). Recherche vorab ergab:
der Großteil der Grundlage war bereits vorhanden — `core/export-briefing.js`,
`core/proposal-import-parser.js` und die vier `core/proposal-*.js`-Module
liefen schon byte-identisch als Port (Etappe 2a), `usePreviewClaudeImport`/
`useImportClaudeProposals` existierten bereits in `useProposals.ts` (Etappe
7b), und Migration `0008_export_prefs.sql` lag bereits vor. Fehlend waren
nur die Datenzugriffsschicht für drei bisher nicht portierte Vanilla-Module
(`export-prefs`, `ladder`/`formats`, `ftp-history` — zusammen < 400 Zeilen,
reine CRUD-Adapter nach dem `trainer-view-prefs.ts`-Muster), eine
Assemblierungs-Funktion und die beiden Dialog-Komponenten.

- **Daten-Zugriffsschicht** (`app/src/api/supabase/`): `export-prefs.ts`,
  `ladder.ts`, `formats.ts`, `ftp-history.ts` — TS-Port der jeweiligen
  Vanilla-Datei, Result<T>-Pattern.
- **Hooks** (`app/src/api/hooks/`): `useExportPrefs.ts` (Preset+Zielevent
  laden/speichern), `useLadderState.ts` (`useLadderState`/
  `useLadderPresetSuggestion`, Port von `state/ladder.js`+`state/formats.js`),
  `useFtpHistory.ts` (nur Lesepfad — der Schreibpfad aus
  `ui/settings-panel.js` ist bewusst nicht Teil dieser Etappe).
- **Assemblierung** (`app/src/features/planning/export-briefing-view-model.ts`):
  reine Funktion `buildExportBriefingCtx()`, baut die `ctx`-Struktur für
  `core/export-briefing.js::buildExportText()` aus bereits geladenen Daten
  zusammen (Port von `state/export.js::buildClaudeExport()`, aber ohne I/O —
  das laden die Hooks bereits vorher).
- **UI** (`app/src/features/planning/`): `ExportImportBar.tsx` (Leiste,
  Gate `useIsSelfAthlete()` — analog Vanillas `ownsPlan()`), `ExportPanel.tsx`
  (5 Preset-Kacheln, Zielevent-Auswahl mit Leerzustand, Freitextfeld, Textarea
  readonly + Kopieren/Download), `ImportDialog.tsx` (Textarea+Datei-Upload,
  Prüfen→Vorschau→Importieren, nutzt die bereits vorhandenen 7b-Hooks). Alle
  drei nach dem bestehenden Inline-Overlay-Muster (`PlanCardForm.tsx`/
  `EventForm.tsx`), keine neue Dialog-Abstraktion.
- Die "Progressionssteuerung"-Textbausteine (Leiterstand/Stufenvorschlag,
  Leitplanken, Fortschrittsindikatoren, Entscheidungsgedächtnis) laufen volle
  Parität zur Vanilla-Version mit — alle dafür nötigen `core/`-Module
  (`guardrails.js`, `progress-indicators.js`, `ftp-forecast.js`,
  `efficiency.js`, `ladder.js`, `ladder-progression.js`, `event-taper.js`,
  `ftp-history.js`) waren bereits als Port vorhanden, nur ihre
  Datenzugriffsschicht fehlte (s.o.).
- **Abnahme:** in `/app/` (`cd app`, PowerShell ohne `&&`): `npx tsc -b`
  sauber, `npx eslint .` ohne neue Fehler (3 vorbestehende Warnings
  unverändert), `npx vitest run` grün bis auf 4 vorbestehende, nicht von
  dieser Etappe berührte Fehlschläge in `useWellbeing.test.tsx`
  (datumsabhängige Testliterale, durch den Tagwechsel 07.08.→08.08.2026
  während der Session ausgelöst — unabhängig vom hier beschriebenen Umbau).
  Verifikation gegen `dashboard-dev` steht noch aus (macht Alex einmalig am
  Ende der Sub-Etappe, wie Konvention).

## Änderungen durch Etappe 7b (07.08.2026)

Proposal-Review — der athletenseitige Gegenpart zu Etappe 7a: die dort
verdrahtete Erzeugung von `proposals`-Einträgen (Trainer-Vorschlag) bekommt
jetzt eine Annehmen/Ablehnen-UI. Reine Portierung — Gruppierung
(`core/proposal-groups.js`), Vorschau-Simulation (`core/proposal-preview.js`)
und Kurzfassung (`core/proposal-summary.js`) waren bereits seit Etappe 2a
portiert und getestet, ebenso alle Mutations-Hooks
(`useAcceptProposal`/`useAcceptGroup`/`useRejectProposal`/
`useWithdrawProposal` in `api/hooks/useProposals.ts`) — 7b liefert nur die
React-UI-Schicht.

- **`proposal-review-view-model.ts`** (neu, reine Funktionen) — Port von
  `ui/proposal-list.js::describeProposal()` und
  `ui/proposal-compare.js::sidesFor()`/`drawImpact()`s Datenanteil.
  `impactSummary()`/`impactDetail()` kapseln denselben schmalen
  `toProjectionCard`/`toProjectionEvent`-Adapter wie `PlanningPage.tsx`
  (bewusst erneut lokal, keine geteilte Abstraktion — Konvention aus
  `PlanCard.tsx`, s. dortiger Kommentar). 12 neue Tests.
- **`ProposalBanner.tsx`** — athletenseitiger Einstieg ("N Vorschläge
  offen"), Port von `ui/proposal-banner.js`. Einziger Weg, über den der
  Athlet selbst tatsächlich entscheiden kann (RLS "proposals: Athlet
  entscheidet" erlaubt Annehmen/Ablehnen nur `athlete_id = auth.uid()`) —
  gated über den neuen `useIsSelfAthlete()`-Hook (bereits seit
  `write-authorization.ts` vorhanden, hier erstmals verdrahtet).
- **`ProposalList.tsx`** — Port von `ui/proposal-list.js`: Gruppen
  (`group_id`, z. B. ein Claude-Import) mit "Alle übernehmen", ungruppierte
  Vorschläge einzeln. Athlet: "Vergleichen…"/"Übernehmen"; Trainer (nur zur
  Kontrolle): read-only "Ansehen…", kein Übernehmen-Button.
- **`ProposalCompare.tsx`** — Port von `ui/proposal-compare.js`: Aktuell/
  Vorgeschlagen nebeneinander, geänderte Felder akzentuiert, TSB-Delta am
  Eventtag + gelöste/neu eingeführte Konflikt-Badges. Eigener (per Claude
  importierter) Vorschlag: "Zurückziehen" statt "Aktuelle behalten" — wie im
  Vanilla-Original. Badge-Farben: `var(--ok)` für gelöste Konflikte (Vanilla
  nutzte hierfür Gold/`--gold`, hier bewusst auf Grün umgestellt — passt zur
  sonst im React-Umbau durchgängigen Ampel-Semantik `--ok`/`--warn`/
  `--danger`, s. `governorColor()`/`ComplianceTable.tsx`).
- **Trainer-Leiste "Vorschläge"-Kachel** (`TrainerBar.tsx`) jetzt klickbar
  (in 7a nur Zähler) — öffnet dieselbe `ProposalList` wie der Athleten-
  Banner, Port von `ui/trainer-bar.js::proposalsTile()`s Klick-Handler.
- **Kein separater Component-Test** für `ProposalBanner`/`ProposalList`/
  `ProposalCompare` — dieselbe Begründung wie bei `TrainerBar.tsx` in 7a
  (kein hook-verdrahtetes Planungstab-Feature hat ein `.test.tsx`, nur reine
  Props-Komponenten). Abdeckung über `proposal-review-view-model.test.ts`
  + die bereits bestehenden `useProposals.test.tsx`/core-Tests; die
  verdrahteten Komponenten verifiziert Alex per Playwright.
- **`/code-review` (medium) — ein Fund, gefixt:** `sidesFor()`s "replace"-
  Zweig baute die rechte Vergleichsseite aus einer expliziten Feldliste statt
  `current` zu spreaden — beim Bearbeiten einer bereits ausgefallenen Karte
  verschwand das `cancelled`-Flag stillschweigend auf der Vorschau-Seite.
  Jetzt wie im Vanilla-Original `{...current, ...payloadToCardData(...)}`,
  Regressionstest ergänzt.
- **Abnahme:** in `/app/` (PowerShell ohne `&&`): `npx tsc -b` sauber,
  `npx vitest run` 914/914 grün (901 + 13 neue Tests), `npx eslint .` ohne
  neue Errors (3 unveränderte Alt-Warnungen). Manuelle Playwright-
  Verifikation gegen `dashboard-dev` steht noch aus (macht Alex einmalig am
  Ende der Sub-Etappe, wie Konvention).

## Änderungen durch Etappe 7a (07.08.2026)

Etappe 7 (Trainer-Dashboard + Export/Import) ist wegen ihres Umfangs — wie zuvor
Etappe 6 (Planungstab) — auf Nutzerentscheidung in vier Sub-Etappen geschnitten:
**7a Trainer-Leiste** (dieser Abschnitt), 7b Proposal-Review (Banner/Liste/
Vergleich), 7c Export/Import (inkl. `export_prefs`-Migration), 7d Blockstart-
Dialog. Reihenfolge 7a→7b→7c→7d wegen Datenabhängigkeit (7b braucht Vorschläge
aus 7a, 7c braucht 7b für seine Review-UI der importierten Vorschläge) — 7d ist
unabhängig. Recherche vorab ergab: Stufenvorschlag/Leitplanken-Sektion/
Fortschrittsindikatoren/Entscheidungsgedächtnis (`docs/konzept-progressions-
steuerung.md`) sind kein eigenständiges UI, sondern reine Textbausteine im
Export-Briefing (`state/export.js::buildClaudeExport()`, Vanilla) — die laufen
komplett in 7c mit, nur E2 (Blockstart-Dialog) bleibt als eigenes UI-Stück 7d.

- **Trainer-Leiste** (`TrainerBar.tsx`, Port von `ui/trainer-bar.js`) — 8
  Kacheln (checkin/governor/tsb/proposals/wellbeing7d/lastRides/conflicts/
  ctlAtl), davon 4 Default + 4 über "⚙ Ansicht anpassen" abwählbar
  (`trainer_view_prefs`, DB-persistiert pro Trainer-Athlet-Paar). Neue Hooks
  `useTrainerContext` (Port von `state/trainer-view.js::loadTrainerContext`,
  fail-closed während des Ladens — Bugfix-Pattern aus dem Vanilla-Original
  1:1 übernommen, s. dortiger Kommentar zum Playwright-Fund vom 25.07.2026)
  und `useTrainerViewPrefs` (optimistisch, bewusst kein Rollback bei
  Speicherfehler, wie im Vanilla-Vorbild).
- **Direkt/Vorschlag-Umschalter** — Default "Vorschlag" (konservative
  Vorgabe, Trainer-Sicht-Konzept §5), reiner Session-State (kein
  `localStorage`, kein Reset bei Athletenwechsel). Verdrahtet in
  `PlanningPage.tsx::handleMove/handleCancel` und `PlanCardForm.tsx`
  (Anlegen/Bearbeiten) — im Vorschlagsmodus entsteht ein `proposals`-Eintrag
  über `createTrainerProposal()` statt eines Direktschreibens. **T2** (Trainer-
  Sicht-Konzept §3): Neuanlage ist für den Trainer IMMER Vorschlag,
  unabhängig vom Umschalter (`isTrainerCardProposalMode()`); Löschen bleibt
  für Trainer grundsätzlich gesperrt. Drag & Drop wird im Vorschlagsmodus
  deaktiviert (`core/plan-drag.js::canDragCard`s `trainerProposalMode`-
  Parameter, seit 6b vorbereitet, jetzt erstmals mit echtem Wert befüllt).
- **Einzige core-Änderung:** `core/proposal-payload.js` bekommt
  `addProposalArgs`/`replaceProposalArgs` (Spiegelbild von
  `payloadToCardData`) — Vanilla baute diese Payload bisher nur inline in
  `ui/plan-card-dialog.js`, es gab dafür keine core-Funktion.
- **`/code-review` (8 Finder-Agenten) — zwei konvergent gemeldete Befunde
  gefixt:** (1) `canWriteForAthlete` und `useTrainerContext` lösten für
  einen Coach denselben `resolveTrainerContext()`-Lookup doppelt aus, jetzt
  teilen sie sich einen Query-Cache-Eintrag (`queryClient.fetchQuery`,
  Muster wie das bestehende `fetchAthleteProfileId`). (2) `TrainerBar`s
  Hooks (`useProposals`/`useCheckinRange`/`useTrainerViewPrefs`) feuerten
  bei jedem Planungstab-Besuch, auch für Nicht-Trainer — jetzt an
  `isTrainer` gegated (`useProposals` bekam dafür einen neuen optionalen
  `enabled`-Parameter). Eine dritte gemeldete Sorge (Vorschlags-„replace"
  nullt `workoutStructure`) gegen den bestehenden Direkt-Pfad geprüft
  (`usePlanCards.ts` Zeile ~272): identisches Verhalten dort bereits — keine
  neue Regression, sondern die aus Etappe 6b bekannte, dort schon
  dokumentierte Lücke ("`workoutStructure` geht beim Bearbeiten verloren").
- **Kein separater Component-Test** für `TrainerBar.tsx` — geprüft: kein
  einziges hook-verdrahtetes Feature (`HeroPage`/`EventsPage`/
  `PlanningPage`/`PlanCardForm`) hat im Repo einen `.test.tsx`, nur reine
  Props-Komponenten (`WeatherBadge`/`HintChip`/…) haben RTL-Tests. Abdeckung
  stattdessen über `useTrainerContext.test.tsx`/`useTrainerViewPrefs.test.tsx`
  (Hooks) + `trainer-bar-view-model.test.ts` (reine Kachel-/Gate-Logik);
  die verdrahtete Komponente verifiziert Alex per Playwright.
- **Abnahme:** in `/app/` (PowerShell ohne `&&`): `npx tsc -b` sauber,
  `npx vitest run` 901/901 grün (860 + 41 neue Tests), `npx eslint .` ohne
  neue Errors. Manuelle Playwright-Verifikation gegen `dashboard-dev` steht
  noch aus (macht Alex einmalig am Ende der Sub-Etappe, wie Konvention).

## Änderungen durch Etappe 6d (07.08.2026)

Letzte Planungstab-Sub-Etappe: der intervals.icu-Push (Wahoo ELEMNT Roam),
in Etappe 2b bewusst zurückgestellt (s. `app/src/api/README.md` §"Bewusst
NICHT in Etappe 2b portiert"). 1:1-Port von
`assets/js/data-access/intervals/push.js`, jetzt als `app/src/api/
intervals/push.ts` typisiert gegen `PlanCard`/`Result` (`api/types.ts`) —
das Feld `workout: WorkoutJson` (`unknown`) ist dort seit Etappe 2b bewusst
ungetypt, mit dem Kommentar, es werde "in Etappe 6 getypt, wenn die
Karten-UI sie tatsächlich liest"; `push.ts` bringt dafür ein lokales
`LegacyWorkout`/`BlockWorkout`-Interface + Type-Guard mit, ohne den
gemeinsamen `WorkoutJson`-Typ selbst aufzuweichen.

`usePushPlanCard()` (`api/hooks/usePlanCards.ts`) reiht sich neben
`useMovePlanCard`/`useCancelPlanCard`/`useUndoAdjustment` ein, nutzt aber
bewusst **kein** `useAuthUserId()`-Gate — der Push hängt am
intervals.icu-Token aus `localStorage`, nicht an der Supabase-Session
(Kommentar dazu wörtlich aus der Vanilla-Version übernommen). Der
Rückgabewert ist das Ergebnis des externen Pushs, nicht das der
Nachbereitungs-Patch (`pushed_external_id` zurückschreiben) — schlägt nur
Letzteres fehl, bleibt die "Gepusht!"-Rückmeldung trotzdem erfolgreich
(identisches Verhalten wie `state/plan-cards.js::pushPlanCard()`).

Der Button "📤 Auf Wahoo pushen" erscheint exakt dort, wo ihn Vanillas
`_renderCard()` zeigt: nur in der Ausstehend-Sektion, nicht bei Absolviert/
Verpasst/Ausgefallen (die dort in Vanilla ohnehin über eigene, schlankere
Render-Pfade laufen, `ui/planned.js` Zeilen 684–728 vs. 1064). In React gibt
es diese Pfad-Trennung nicht mehr (alle vier Abschnitte teilen sich
`<PlanCard>`) — die Parität wird stattdessen strukturell erzwungen: die
neuen Props `canPush`/`onPush` werden ausschließlich im
`week.cards.map(...)`-Zweig von `PlanningPage.tsx` gesetzt, die drei
`CardSection`-Aufrufe (Absolviert/Verpasst/Ausgefallen) bleiben unverändert.

Credential-Eingabe bleibt `window.prompt()` (mit Alex abgestimmt) statt
eines neuen Inline-Formulars — für den seltenen Erstkontakt-Fall (Token/
Athlete-ID werden danach in `localStorage` gehalten) lohnt sich keine neue
UI-Konvention.

**Kein neuer Test** für die reinen Beschreibungs-Baufunktionen
(`legacyDescription`/`blockDescription`/`buildDescription` in `push.ts`)
oder für `usePushPlanCard` — Vanilla hat dafür ebenfalls keine dedizierten
Tests (`tests/plan-cards-move.test.js` mockt `pushCardWorkout` nur als
Fremdkörper weg, prüft ihn nicht). Benannte, nicht gefüllte Testlücke.

**Nicht ausgeführt:** ein echter Push gegen einen echten intervals.icu-
Account (CLAUDE.md: kein Push ohne vorherige Freigabe, kein
Sandbox-Account vorhanden). Verifiziert wurde nur Rendern/Gating des
Buttons; das `external_id`/Upsert-Verhalten bleibt der offene Punkt aus
`docs/offene-punkte.md` (M3).

## Änderungen durch Etappe 6c (07.08.2026)

Reine UI-Portierung der sieben Punkte aus dem Etappenplan (Zeile ~504) —
alle core-Bausteine (`core/plan-feedback.js`, `core/projection.js`,
`core/conflicts.js`, `core/compliance-match.js`) waren bereits seit
Etappe 2a 1:1 portiert und getestet, 6c hat nur die React-UI gebaut.

- **Echte Lücke statt reinem Port:** Vanilla berechnet `projection`/
  `conflicts` als Modul-State in `state/plan-cards.js::recomputeProjection()`.
  Dafür gab es auf React-Seite noch KEINE Entsprechung — `PlanningPage.tsx`
  ruft `projectLoad()`/`detectConflicts()` jetzt selbst per `useMemo` auf
  (Cards/Rides/Events kommen bereits aus dem React-Query-Cache, kein neuer
  Request). Zwei schmale, lokale Adapter (`toProjectionCard`/
  `toProjectionEvent`) gleichen `PlanCard.workout: unknown` bzw.
  `EventItem.priority: string|null` gegen die aus JSDoc inferrierten
  Parametertypen dieser ungecheckten core-Module aus.
- **Neue Dateien** in `app/src/features/planning/`: `HintChip.tsx`
  (Konflikt-/Ruhetag-Hinweis-Chip + Tooltip, Exklusivität "nur ein Tooltip
  offen" über einen modul-lokalen Store + `useSyncExternalStore` statt
  Context/Prop-Drilling), `WeatherBadge.tsx`, `ComplianceTable.tsx`
  (Intervalltabelle Soll-Ist inkl. `derived`-Badge + Compliance-Ampel),
  `LegacyWorkoutTimeline.tsx` (Segmentbalken altes Zahlenformat),
  `Z2Block.tsx`/`RecoveryBlock.tsx` (Detailblöcke), `planning-delta.ts`
  (`computeDeltaBanner`, reiner 1:1-Port von `_recordDelta`) + `DeltaBanner.tsx`.
  Zugehörige reine Ableitungen (`resolvePlanningFtp`, `matchRideForCard`,
  `visibleCompliance`, `weatherBadgeColor`, `uvLabel`,
  `legacyWorkoutSegments`, `z2Estimate`, `nextLoadAfter`, `latestWellness`,
  `fmtMinSec`, `complianceRuleText`, `accessorySteps`) in
  `planning-view-model.ts`, alle mit Vitest-Tests.
- **`PlanCard.tsx`/`PlanningPage.tsx` erweitert:** neue Props für
  `conflicts`/`projection`/`ftp`/`forecast`/`wellness`/`plannedSessions`/
  `ride`. Die Vanilla-Aufteilung `_renderCard` (ausstehend/verpasst/
  ausgefallen: Konflikt-Chip, Wirkungsanzeige, Wetter-Badge, Workout-Ketten-
  Rendering Blöcke→Legacy-Timeline→Z2/Recovery→Freitext) vs. `_renderDoneCard`
  (nur Compliance-Tabelle + eigener, außerhalb der Karte sitzender
  Ruhetag-Hinweis-Chip) wird 1:1 gespiegelt, statt beides zu vermischen.
  Ride-Matching für die Compliance-Tabelle (`matchRideForCard`) läuft in
  `PlanningPage.tsx` als `doneRides`-Map, nur für die Absolviert-Sektion.
- **Delta-Banner ohne Modul-State:** React-State (`deltaBanner`) statt
  Vanillas `let deltaBanner`/`deltaBannerAthleteId`. Der Athletenwechsel-
  Reset läuft NICHT über `useEffect` (React-Compiler-Lint
  `react-hooks/set-state-in-effect` blockt synchrones `setState` im Effekt),
  sondern als "State während des Renderns anpassen"
  (`if (activeAthleteId !== deltaBannerAthleteId) { … }`) — spiegelt
  strukturell exakt Vanillas Doppel-Variable. `move`/`cancel`/Drag laufen
  über lokale Wrapper (`handleMove`/`handleCancel`), die den Projektions-
  stand VOR der Mutation merken und danach den frischen Kartenstand direkt
  aus dem React-Query-Cache lesen (`queryClient.getQueryData`, Muster wie
  `useCardsSnapshot` in `usePlanCards.ts`) statt der u.U. noch alten
  `cards`-Closure-Variable zu vertrauen. `undo` löst wie in Vanilla keinen
  Delta-Banner aus.
- **Echter Bug per Playwright gefunden und gefixt:** der Hinweis-Chip öffnete
  sich bei einem echten Maus-Klick nicht sichtbar. Ursache: ein Maus-Klick
  löst `mouseenter → mousedown → focus → click` aus — `onMouseEnter` öffnete
  den Chip bereits vor dem `click`-Event, dessen Toggle-Logik sah dann
  "schon offen" und schloss sofort wieder zu, während die Maus noch auf dem
  Chip stand. Reine `fireEvent.click`-Unit-Tests (kein vorheriges
  Hover-/Focus-Event) deckten das nicht auf — erst die Playwright-
  Verifikation gegen `dashboard-dev` mit einem echten Klick zeigte
  `aria-expanded="false"` nach dem Klick. Fix: auf hover-fähigen Geräten
  (`hoverCapable()`) öffnet ein Klick nur noch (idempotent), schließt aber
  nie mehr per Klick — das übernimmt `mouseleave`/`blur`/Escape. Auf
  Touch-Geräten (kein Hover-Event) bleibt Klick der alleinige Umschalter.
  Zusätzlich ein `mousedown`-Guard, der ein doppeltes Öffnen durch
  `focus` unmittelbar vor `click` unterdrückt. Vier Regressionstests
  (`HintChip.test.tsx`) bilden die reale Event-Reihenfolge nach
  (mousedown→focus→click bzw. reiner Tab-Fokus), den Touch-Pfad
  (`window.matchMedia` gemockt auf `hover: no`) sowie einen zweiten,
  von `/code-review` gefundenen Fund am selben Guard: ein zweiter Klick auf
  ein bereits fokussiertes Element löst kein erneutes `focus`-Event aus
  (Browser feuern das nicht auf ein schon fokussiertes Element) — ohne einen
  zusätzlichen Reset in `onMouseUp` wäre die Guard "hängen geblieben" und
  hätte einen späteren, unabhängigen Tab-Fokus fälschlich unterdrückt.
- **Design-Token-Korrektur:** `assets/css/main.css` kennt `--green`/`--gold`/
  `--red`, `app/src/styles/tokens.css` (noch) nicht — alle neuen Ampel-
  Darstellungen (Compliance-Rating, Wetter-Warnfarben) nutzen stattdessen
  die dort bereits vorhandenen `--ok`/`--warn`/`--danger`. Zwei
  vorbestehende Fälle mit undefiniertem `var(--gold)` aus Etappe 6a
  (`PlanningPage.tsx`, `PlanCardForm.tsx`) bewusst nicht mit-repariert —
  außerhalb des 6c-Auftrags.
- **Bewusst NICHT Teil von 6c** (Nutzerentscheidung, vor Beginn geklärt):
  der breitere "Geplant → Tatsächlich"-Vergleichsblock bei einer Ist-Fahrt
  (Distanz/HF/Watt/Kadenz/Dauer/TRIMP/Wetter/Befinden,
  `ui/planned.js::_renderDoneCard` `compareHtml`) — steht nicht auf der
  offiziellen 6c-Liste, offener Punkt für eine spätere Etappe.
- **Abnahme:** in `/app/` (PowerShell ohne `&&`): `npx tsc -b` sauber,
  `npx vitest run` 860/860 grün (856 + 4 neue Regressions-/Pfad-Tests, die
  während der Verifikation nachgezogen wurden), `npx eslint .` ohne neue
  Errors (2 `react-hooks/set-state-in-effect`-Fehler beim ersten Durchlauf
  behoben, s.o.). Manuell gegen `dashboard-dev` per Playwright (Account
  Stuhlsen/Athlet 1): Konflikt-Chip + Tooltip (Hover/Klick/Wegbewegen) mit
  echten K-WOCHENTSS/K-WOCHENSPRUNG/K-OVERLAP-Meldungen, Wirkungsanzeige auf
  allen ausstehenden Karten, Delta-Banner nach Verschieben (Event-Teil +
  Tageswirkung-Teil, beide mit echten Zahlen), Wetter-Badge mit UV-Label,
  Legacy-Segmentbalken (WU/Intervalle/CD) auf migrierten Plan-2-Karten,
  Z2-Block (Ziel-HF/Distanz/Kalorien) und Recovery-Block (HRV/Ruhepuls/
  nächste Belastung) je mindestens einmal live gesehen. Compliance-Tabelle
  aktuell an keiner der 23 Absolviert-Karten sichtbar (kein Intervall-Match
  im aktuellen Datenstand) — Sichtbarkeits-Gate (`visibleCompliance`)
  dadurch nur negativ, nicht positiv bestätigt; unit-getestet mit einem
  synthetischen Match. Athlet 2 (hc_diZee, read-only): Wirkungsanzeige/
  Hinweis-Chips sichtbar wie vorgesehen (folgen der Kartensichtbarkeit,
  nicht den Schreibrechten), keine Bearbeiten-/Verschieben-/Ausfallen-
  Buttons. Verschobene Testkarte nach Prüfung per "Rückgängig" wieder
  hergestellt, Datenstand in `dashboard-dev` unverändert. 0 Konsolenfehler
  über die gesamte Session (die anfängliche 401 beim allerersten Laden kam
  von einer abgelaufenen Alt-Session vor dem Reload, kein neuer Befund).

## Änderungen durch Etappe 6b (07.08.2026)

- **Drag & Drop im Planungstab** — Karte per Griff (⠿, `PlanCard.tsx`) auf
  einen anderen Tag ziehen, als schnellerer Weg neben dem bestehenden
  "Verschieben"-Button. Neue Datei `app/src/features/planning/
  DaySlotRow.tsx` (Port von `ui/plan-drag.js::showDaySlots()` als
  React-Komponente, mit `DaySlotRow.test.tsx`). `PlanningPage.tsx` bindet
  `@dnd-kit/core` (`DndContext`/`DragOverlay`/`PointerSensor`) ein — neue
  Abhängigkeit, kein `@dnd-kit/sortable`/`-utilities` nötig.
  `app/src/core/plan-drag.js` (Regeln: `canDragCard`/`daySlots`/
  `resolveDrop`/`weekLabelForDate`) **unverändert** — Drag schreibt über
  denselben Pfad wie der Button (`useMovePlanCard` → `move()`).
- **`collisionDetection={pointerWithin}` statt der dnd-kit-Vorgabe
  (`rectIntersection`)** — beim manuellen Verifikationsdurchlauf (s.
  Abnahme) fiel auf, dass die Standard-Kollisionsprüfung gegen das
  ÜBERSETZTE Rechteck des `useDraggable`-Knotens misst. Der sitzt auf der
  ganzen Karte (nicht auf dem schmalen Griff, s.u.), und eine zeilenbreite
  Karte über einer 7-spaltigen Tages-Slot-Zeile überlappt so mehrere Slots
  gleichzeitig — das Zieltag-Feststellen wurde uneindeutig.
  `pointerWithin` prüft stattdessen die reine Zeigerposition, wie Vanillas
  `elementFromPoint(pointer.x, pointer.y)`. Ohne echten Drag im Browser
  wäre das nicht aufgefallen (reine Unit-Tests auf `core/plan-drag.js`
  sehen kein DOM-Layout).
- **`useDraggable`-Knoten = ganze Karte, `listeners`/`attributes` nur am
  Griff** — analog zur Vanilla-Grenze (Griff startet den Drag, Klicks auf
  Bearbeiten/Verschieben/Ausfallen/Inputs lösen keinen aus). Bewirkt aber
  die oben beschriebene Kollisions-Eigenheit, die `pointerWithin` behebt.
- **Nur die "Ausstehend"-Sektion ist Drag/Drop-fähig** — bewusste
  Abweichung von Vanilla, wo `canDragCard()` technisch auch für
  Absolviert/Verpasst/Ausgefallen-Karten einen Griff zeigt, obwohl dort nie
  eine Tages-Slot-Zeile existiert (Drag würde dort immer mit "rejected"
  zurückschnappen — ein wirkungsloser Griff). In der React-Portierung
  bekommen nur `sections.weeks`-Karten die `draggable`-Prop.
- **`/code-review` auf den Diff** (mehrere Agenten, deckte mangels
  eigenem 6a-Commit zum Zeitpunkt des Laufs das komplette damals noch
  unkommittierte 6a mit ab, danach nachträglich sauber in Etappe-6a-/
  6b-Commits getrennt) — zwei Funde direkt im 6b-Umfang gefixt:
  `buildPlanningSections()` lief unmemoisiert bei jedem Render, also auch
  bei jedem `setActiveId` (Drag-Start/-Ende) und `setDialog`
  (`PlanningPage.tsx`) → `useMemo`. `PlanCard.tsx`s `moveDate`-State wurde
  nur beim ersten Mount aus `card.date` initialisiert — eine per Drag
  verschobene Karte (gleiche React-Instanz, gleiche `card.id`) zeigte beim
  anschließenden Öffnen von "Verschieben" noch das alte Datum → wird beim
  Öffnen jetzt aus `card.date` neu gesetzt. Weitere Funde betreffen
  ausschließlich bereits vor 6b bestehenden 6a-Code (u.a. `workoutStructure`
  geht beim Bearbeiten verloren, `weekDisplayLabels()` wird pro Karte statt
  einmal über die Liste aufgerufen und verschluckt dadurch den
  Jahreswechsel-Marker) — bewusst nicht mit-gefixt, da außerhalb des
  6b-Auftrags; Alex informiert, Priorisierung offen.
- **Abnahme:** in `/app/` (PowerShell ohne `&&`): `npx tsc -b` sauber,
  `npx vitest run` 800/800 grün (784 + 14 aus 6a + 2 neue
  `DaySlotRow.test.tsx`-Tests), `npx eslint .` ohne neue Errors. Manuell
  gegen `dashboard-dev` per Playwright (Account Stuhlsen/Athlet 1): Griff
  erscheint exakt auf allen 43 anstehenden Karten (Griffzahl == Stat
  "ausstehend"), auf keiner Absolviert/Verpasst/Ausgefallen-Karte. Echter
  mehrstufiger Pointer-Drag (synthetische `PointerEvent`s mit
  Schwellwert-Bewegung, `pointerdown`→`pointermove`×n→`pointerup`, da
  Playwright-MCPs `browser_drag` das dynamisch erst beim Drag-Start
  entstehende Slot-Ziel nicht vorab auflösen kann) auf einer eigens
  angelegten Testkarte: Tages-Slot-Zeile erscheint in allen sichtbaren
  Wochenblöcken samt Kalenderwochen-übergreifendem eigenen Wochenblock (der
  Test deckte damit ungeplant auch den v1-Sonderfall aus
  `weekLabelForDate()`s Doku ab: Zielwoche komplett leer → Label bleibt,
  hier aber sofort korrigiert, weil die Zielwoche nach dem Drop echte
  Nachbarn hatte), Hover-Highlight (`--ss`-Akzent) korrekt, Drop auf
  gültigen Tag → "verschoben von …"-Badge + Wochenlabel-Übernahme von der
  Zielwoche (identisch zum Button-Pfad), Drop auf vergangenen Tag →
  abgewiesen, keine Änderung. Athlet 2 (hc_diZee, read-only): 0 Griffe.
  0 Konsolenfehler über die gesamte Session (eine Supabase-
  `GoTrueClient`-Mehrfachinstanz-Warnung ist vorbestehend/Dev-Hot-Reload-
  bedingt, kein neuer Befund). Testkarte nach Prüfung wieder gelöscht,
  Datenstand in `dashboard-dev` unverändert. Ein zu Sessionbeginn
  verwaister Playwright-Chrome-Prozess (aus einer nicht sauber
  geschlossenen früheren Session) blockierte das Profil und wurde beendet,
  bevor die eigentliche Verifikation startete.

## Änderungen durch Etappe 6a (07.08.2026)

Etappe 6 (Planungstab) ist wegen ihres Umfangs auf Nutzerentscheidung in
Sub-Etappen geschnitten (wie 2a/2b) — 6a = Grundgerüst, **6b = Drag & Drop
(dnd-kit, offene Frage aus 5.2 damit beantwortet)**, 6c = Wirkungsanzeige/
Delta-Banner/Compliance-Tabelle/Wetter-Badges, 6d = Wahoo-Push. Die
Etappenplan-Tabelle unten spiegelt den Split. Detailplan (Recherche +
Scope-Abgrenzung) liegt als Plan-Mode-Artefakt vor, nicht im Repo — diese
Sektion ist die verbindliche Doku für Folge-Etappen.

- **Grundgerüst des Planungstabs** — ersetzt den Platzhalter
  `PlanningPage.tsx` (`<h1>Planungstab</h1>`). Neue Dateien in
  `app/src/features/planning/`: `PlanningPage.tsx`, `PlanCard.tsx`
  (Kartendarstellung + Inline-Formulare Verschieben/Ausfallen/Rückgängig),
  `PlanCardForm.tsx` (Anlegen/Bearbeiten-Dialog inkl. Workout-Blöcke-Editor,
  ersetzt `ui/plan-card-dialog.js`), `planning-view-model.ts` (reine
  Ableitungen: Filterung Ausstehend/Absolviert/Verpasst/Ausgefallen,
  Wochen-Gruppierung, Fortschrittsquote, Typ-Farben/-Icons — mit
  Vitest-Tests). Datenzugriff war bereits vollständig vorhanden
  (`api/hooks/usePlanCards.ts`, `api/plan-cards/patch.ts`, Etappe 2b/3) —
  6a hat NUR die UI-Schicht gebaut.
- **Zwei kleine Nachträge in `core`/`config`, die als Lücke auffielen:**
  `PHASES`/`phaseColor()` in `app/src/config.ts` ergänzt (war laut
  Dateikopf explizit für Etappe 6 vorgesehen); `app/src/core/week-labels.js`
  neu (Port von `ui/charts/base.js::weekDisplayLabels()`, wird auch von
  Etappe 8 gebraucht).
- **Ruhetag-Karten brauchen KEIN client-seitiges `fillRestDays()`** —
  Rechercheergebnis: die Ruhetag-Synthese läuft ausschließlich serverseitig
  (`scripts/lib/plan2.js`) und wurde einmalig per
  `scripts/migrate-plan-to-supabase.js` nach Supabase materialisiert (M-A,
  `docs/phase-3-konzept-planungstab.md` §8). `usePlanCards()` liefert jeden
  Tag bereits als eigene Zeile. Der bereits nach `app/src/core/
  plan-rest-days.js` portierte Code bleibt bis auf Weiteres ungenutzt.
- **Bewusst NICHT Teil von 6a** (bei Bedarf zurück zu diesem Abschnitt):
  Drag & Drop (6b), Delta-Banner/Wirkungsanzeige (ΔFitness/ΔErmüdung/
  ΔForm)/Hinweis-Chip/Compliance-Tabelle/Soll-Ist-Vergleich/Wetter-Badges/
  Legacy-Workout-Segmentbalken (6c), Wahoo-Push (6d) — kein echter Push
  ohne vorherige Freigabe, sobald der Adapter kommt. **Trainer-
  Vorschlagsmodus** (Umschalter Direkt/Vorschlag, `createTrainerProposal()`
  in Move/Cancel/Create/Edit) ist explizit Etappe-7-Scope
  (Trainer-Dashboard) — in 6a schreibt ein Coach mit Schreibrecht direkt,
  ohne Review-Gate. Befristete Produktverhalten-Lücke ggü. Vanilla, kein
  RLS-/Sicherheitsproblem (RLS erlaubt Coach-Schreibzugriff unabhängig vom
  Proposal-Umweg) — Etappe 7 baut den Umschalter wieder ein.
- **Abnahme:** in `/app/` (`cd app`, PowerShell ohne `&&`): `npx tsc -b`
  sauber, `npx vitest run` 798/798 grün (784 + 14 neue Tests für
  `week-labels.test.js`/`planning-view-model.test.ts`), `npx eslint .` ohne
  neue Errors. Manuell gegen `dashboard-dev` per Playwright (Account
  Stuhlsen/Athlet 1): Karte anlegen (inkl. Workout-Block) → erscheint
  korrekt, Bearbeiten-Dialog-Prefill stimmt, Löschen mit
  Doppelklick-Bestätigung, Verschieben → „verschoben von …"-Badge →
  Rückgängig stellt exakt den Ursprungszustand wieder her, ebenso
  Ausfallen → „Grund: …" → Rückgängig. Athlet 2 (hc_diZee, read-only):
  keine Bearbeiten-/„+ Karte"-Buttons irgendwo, Ruhetag-Karten sichtbar
  (D6-Regel bestätigt), „Ruhetag gefahren"-Hinweisbadge
  (`restDayRiddenSignal`) rendert live korrekt bei einer gefahrenen
  Ruhetag-Karte. 0 Konsolenfehler über die gesamte Session. Testkarte nach
  Prüfung wieder gelöscht, Datenstand in `dashboard-dev` unverändert.
  Sichtbarkeits-Matrix-Zeile `plan_cards` nicht separat neu geprüft (deckt
  sich mit dem bereits geprüften `canWrite`-Mechanismus aus Etappe 5) —
  volle Prüfung inkl. Trainer-Zeile folgt mit 6c/6d, wenn mehr UI steht.

## Änderungen durch Etappe 5 (06.08.2026)

- **Erster echter CRUD-Bereich in React-UI** — ersetzt den Platzhalter
  `EventsPage.tsx` (`<h1>Events</h1>`) durch Liste, Formular-Dialog und
  Löschen, verdrahtet gegen die bereits fertige Datenschicht aus Etappe 2b
  (`api/hooks/useEvents.ts` + `api/supabase/events.ts`, unverändert). Neue
  Dateien in `app/src/features/events/`: `EventsPage.tsx`, `EventForm.tsx`
  (Modal, ersetzt `ui/event-form.js`), `EventRow.tsx`/`EventBadge.tsx`
  (ersetzen `ui/event-timeline.js`), `events-view-model.ts` (reine
  Ableitungen: `groupEvents()`, Badge-Label/-Farben, mit Vitest-Tests).
- **Kein Claude-Design-Import** — für Events existiert kein Design-Projekt.
  Gebaut direkt gegen `styles/tokens.css` und `GlassCard`, UX an der
  Vanilla-Referenz orientiert (Formularfelder, Typ-abhängige Sichtbarkeit,
  Badges).
- **Event-Historie zeigt bewusst auch Vergangenes** — abweichend von der
  Vanilla-Timeline (die nur anstehende Events listet) folgt die
  React-Seite dem ursprünglichen Konzept
  (`docs/phase-2-konzept-event-verwaltung.md` Abschnitt 6+7): zwei
  Abschnitte „Anstehend"/„Vergangen", auf Nachfrage entschieden.
- **`AthleteToggle` nach `app/src/components/` gehoben** (aus
  `features/hero/`) — war bereits generisch, jetzt von Hero UND Events
  gemeinsam genutzt statt eines zweiten Widgets.
- **Renn-Countdown-Chip im Hero nachgezogen** (von Etappe 4 bewusst
  zurückgestellt) — neue `features/hero/RaceCountdownPill.tsx`, nutzt die
  bereits getestete `raceCountdown()` aus `useEvents.ts` direkt (kein neuer
  Testfall nötig). Rendert immer zusätzlich zur Session-Karte, nie an ihrer
  Stelle (Muster wie `assets/js/ui/overview.js::_renderSessionPill`).
- **Sichtbarkeits-Matrix-Zeile `events` geprüft** (Playwright gegen
  `dashboard-dev`, Accounts Stuhlsen/Trainer-ST/hc_diZee): Athlet selbst
  voller CRUD (anlegen/bearbeiten/löschen, inkl. `is_test`), Trainer
  voller CRUD für seinen Athleten mit „(für Stuhlsen)"-Hinweis im
  Formulartitel, Trainer ohne Beziehung (hc_diZee) read-only ohne
  „+ hinzufügen". **Anon/Besucher-Zeile nicht prüfbar** — s. echter Fund
  unten.
- **Echter Fund, bewusst nicht in dieser Etappe behoben:**
  `app/src/components/ProtectedRoute.tsx` (Etappe 1) sperrt ALLE Routen
  komplett hinter Login, `/events` ist für Besucher aktuell unerreichbar —
  widerspricht der Sichtbarkeits-Matrix (E1: `events` öffentlich lesbar).
  Die restliche Events-UI ist bereits korrekt auf Anon-Lesen vorbereitet
  (nur `canWrite`-gated Buttons), nur die Route selbst blockt. Auf
  Rückfrage zurückgestellt: App-weite Routing-Änderung, gehört eher zu
  Etappe 10 (Umschaltung/Regressionsdurchlauf) als in eine einzelne
  Bereichs-Etappe. Dokumentiert in `docs/offene-punkte.md`.
- **Abnahme:** in `/app/` (`cd app`, PowerShell ohne `&&`): `npx tsc -b`
  sauber, `npx vitest run` 784/784 grün (779 + 5 neue
  `events-view-model.test.ts`-Tests), `npx eslint .` ohne neue Errors.
  Manuell gegen `dashboard-dev` per Playwright: Anlegen/Bearbeiten/Löschen
  (Rennen + Sonstiges, Priorität, Ziel-FTP, `is_test`, Notiz), Escape
  schließt den Dialog, Countdown-Chip im Hero zeigt ein echtes
  Renn-Event korrekt.

## Design-Revision Hero: Hero-Weitwinkel (06.08.2026, nach Etappe 4)

Alex reichte im selben Design-Projekt eine neue Hero-Version nach:
`Hero-Weitwinkel.dc.html` löst `Hero-Ebenen.dc.html` als Design-Quelle für
den Hero-Bereich ab. Geht über den ursprünglichen Etappe-4-Rahmen hinaus —
auf Nachfrage bestätigt, kein eigenmächtiger Scope-Sprung:

- **Viewport-weiter App-Hintergrund** (Foto + zwei Gradient-Overlays,
  `position:fixed`) statt eines auf die Hero-Karte begrenzten Hintergrunds.
  **Korrektur der Etappe-4-Korrektur weiter unten:** "kein Foto" traf auf
  `Hero-Ebenen.dc.html` zu, nicht mehr auf diese Revision. Neu:
  `app/src/components/AppBackground.tsx`, einmal in `App.tsx` gemountet
  (Geschwister von `<Routes>`) — deckt **auch die Login-Seite** ab (Alex'
  ausdrücklicher Wunsch), ohne den Hintergrund doppelt in `LoginPage.tsx`
  und `Layout.tsx` einzubauen.
  - **Einschränkung beim Übernehmen:** Das Foto lag im Design-Projekt nur als
    Base64-Data-URI in `.image-slots.state.json` (via `image-slot.js`, dem
    "omelette"-Bildplatzhalter-Mechanismus). `DesignSync.get_file` deckelt
    bei 256 KiB — die Datei kam mit `"truncated":true` zurück, ein
    vollständiges Bild ließ sich daraus nicht rekonstruieren. Alex hat die
    Datei direkt geliefert (`app/public/background.png`, 1376×768, per
    Playwright-Screenshot gegengeprüft — rendert korrekt).
  - **Stacking-Falle gefixt:** `position:fixed`-Hintergrund + unstyled
    Login/Layout-Inhalte (kein eigenes `position`) hätten sich nach
    CSS2.1-Stapelreihenfolge sonst verschluckt — nicht-positionierte
    In-Flow-Inhalte malen VOR positionierten Nachfahren, auch bei
    `z-index:0`/`auto`. Fix: `<Routes>` in App.tsx steckt in einem
    `position:relative;z-index:1`-Wrapper, macht jede Route unabhängig von
    ihrer eigenen Positionierung zum "positionierten" Nachfahren.
  - Nebeneffekt behoben: die zuvor rein weiße Login-Fläche (kein globaler
    Seitenhintergrund) — `index.css` setzt jetzt `body { background:
    var(--surface-page) }`.
- **Mousemove-Parallax/3D-Tilt** reimplementiert (Alex' Wunsch): neuer
  geteilter Hook `app/src/hooks/useMouseParallax.ts` (NEUES Verzeichnis,
  bisher gab es nur `api/hooks/` für Datenzugriffs-Hooks) — schreibt das
  Transform imperativ über eine Ref, kein `setState` pro Mausbewegung.
  Zwei Instanzen: Hintergrund-Pan (`AppBackground`) und Content-"Plate"-Tilt
  (`HeroPage`). Respektiert `prefers-reduced-motion` (der Export selbst
  prüft das nicht, ist aber Hauskonvention).
- **Neue Wetter-Kachel** ("Wetter · heute", `WeatherCard.tsx`) — bisher gab
  es Wetter nur inline in der Session-Pille, gebunden ans Datum der
  nächsten Plankarte. Neu: immer HEUTE, eigene Kachel,
  `hero-view-model.ts::buildWeatherToday()` aus `forecast[todayISO]`.
  `HeroSession.weather` entfällt ersatzlos (wäre totes Feld geworden).
  Genutzte Felder (`tempFeel`/`windSpeed`/`windDir`/`precipProb`) liefert
  `scripts/lib/weather.js` bereits vollständig — keine neue Datenquelle.
  Eine `note`-Zeile aus dem Export ("Gutes Fenster 16–19 Uhr") ist
  Fantasietext ohne reale Datenbasis und entfällt.
- **Bug beim Re-Sync gefunden und gefixt:** die Leistungsskala-Pins
  (Ramp/eFTP/Ziel) hatten in der Etappe-4-Fassung ein reines `isGoal`-Flag
  statt eines `kind`-Diskriminanten — der Höher-mit-Glow-Stil war dabei
  fälschlich dem Ziel- statt dem eFTP-Pin zugeordnet (`HeroPin.kind:
  "ramp"|"eftp"|"goal"` in `hero-view-model.ts`, korrigiert + Regressionstest
  in `hero-view-model.test.ts`).
- Neues Grid-Layout (3 Zellen: Identität+Workout+Wetter / Belastungsempfehlung
  / FTP-Ringe) statt des bisherigen Flex-Layouts; `PowerScale` intern jetzt
  2-spaltig (Leistungsskala/What-if nebeneinander statt gestapelt).
- `tokens.css`s `--ink…--e3`-Block auf die neuen Export-Werte überschrieben
  (echte Revision derselben Design-Linie, kein Parallel-Set).
- **Abnahme:** in `/app/` (`cd app`, PowerShell ohne `&&`): `npx tsc -b`
  sauber, `npx vitest run` 779/779 grün, `npx eslint .` ohne neue Errors.

## Änderungen durch Etappe 4 (06.08.2026)

- Erster echter Durchlauf des Design-Übernahme-Workflows (5.7) abgeschlossen:
  Hero-Projekt (`fed5c129-1eb1-4ea8-a950-ad70fa39ddad`, `Hero-Ebenen.dc.html`)
  gelesen und als `app/src/features/hero/` umgesetzt.
- `docs/vorlage-design-import.md` neu, als Ergebnis dieses Durchlaufs — feste
  Vorlage für Etappe 5–9.
- **Belastungsempfehlung-Kachel neu im Hero** (gab es vorher nur im
  Vanilla-Analyse-Tab): voll verdrahtet über `core/briefing.js::buildBriefing()`
  + `assessReadiness()` + `tsbTrend()` + `useTodayCheckin()`-Subjective-Signal,
  zusammengesetzt in `app/src/features/hero/hero-view-model.ts`.
- Neuer geteilter Hook `app/src/api/hooks/useActiveAthlete.ts` (Athlet-Toggle +
  `localStorage`-Persistenz) — spart Etappe 5 das Nachbauen; noch pro
  Komponenten-Instanz eigener State (kein Context), da bislang nur eine Stelle
  (Hero) ihn braucht.
- Zwei geteilte Bausteine nach `app/src/components/`: `GlassCard` (Glass/Blur-
  Card-Hülle), `ProgressRing` (SVG-Fortschrittsring, `pathLength`-Muster aus
  dem Export statt Umfangs-Berechnung).
- `tokens.css` um den Export-Token-Abschnitt ergänzt (`--ink`/`--accent`/
  `--ok`/`--warn`/`--danger`/`--glass`/`--hair`/`--e2`/`--e3`) — bestehende
  Chart-Tokens (für Etappe 8 reserviert) unangetastet, wie in 5.7 (unten)
  vorgesehen.
- **Korrektur ggü. der ursprünglichen Kurzbeschreibung dieser Etappe**
  ("generiertes Hintergrundfoto"): der tatsächliche Export hat kein Foto —
  der Hero-Hintergrund ist ein reiner CSS-Gradient (kühles Navy, warmer Glow
  bei 63%/60%). Keine Bildintegration nötig.
- Bewusst nicht Teil dieser Etappe: der Renn-Countdown-Chip aus der Vanilla-
  Session-Pill (`state/events.js::raceCountdown`) — das ist Events-Fachlogik
  und wandert mit Etappe 5 (Events) als React-Hook.
- **Abnahme:** in `/app/` (`cd app`, PowerShell ohne `&&`): `npx tsc -b`
  sauber, `npx vitest run` 776/776 grün
  (769 + 7 neue `hero-view-model.test.ts`-Tests, Regressionsnachweis wie in
  Etappe 2a/2b/3), `npx eslint .` ohne neue Errors.

## Vor Etappe 4 geklärt (06.08.2026)

- **5.6 entschieden:** Vorschau bleibt vorerst rein lokal (`npm run dev`), zweiter Pages-Deploy zurückgestellt statt verworfen — Auslöser für ein Umschwenken benannt
- **5.7 korrigiert:** kein `claude_design`-MCP nötig, das eingebaute `DesignSync` liest das Design-Projekt über die Projekt-ID; Hero-Projekt-ID und Dateiliste dort festgehalten

## Änderungen durch Etappe 3 (06.08.2026)

- Etappe-3-Ergebnis eingetragen, inkl. der Abgrenzung „was ist sportartspezifisch und was ist ausdauersportübergreifend"
- **STOPP-Punkt `sport`-Spalte beantwortet:** wird nicht gebraucht, nichts migriert (Begründung bei der Etappe, Eintrag in `docs/offene-punkte.md`)
- Neue Randbedingung für die Übergangszeit: `app/src/core/` ist ab jetzt nicht mehr byte-gleich mit `assets/js/core/`, der Abgleich läuft einseitig (Details in `app/src/core/README.md`)

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

**5.5 bestätigt** (s.u.). **Nicht portiert** und bewusst den späteren Etappen zugeschlagen: `chart-view`/`export*`/`ladder`/`block-transition`/`formats`/`goals`/`ftp-history` (Etappen 7/8), der intervals.icu-Push (Etappe 6d), die Trainer-Leisten-Kategorien (Etappe 7).

### Etappe 3 — Multi-Sport-Grundstruktur `[F5]` — ✅ umgesetzt (06.08.2026)
- `sports/`-Modulstruktur anlegen, `cycling/` als einzige befüllte Implementierung
- Sportartspezifische Werte (Zonen-Grenzen, Metrik-Namen wie FTP/TSS) aus fest verdrahtetem Code in das `cycling/`-Modul ziehen
- **Kein zweites Sport-Modul bauen** — nur sicherstellen, dass eins prinzipiell danebenstehen könnte
- **Erwarteter STOPP-Punkt:** Hier wird sich vermutlich zeigen, ob eine `sport`-Spalte in der Datenbank gebraucht wird. Falls ja: **nicht eigenmächtig migrieren** — vorlegen. Das ist die eine Stelle, an der G3 und G5 aneinanderstoßen.
- **Abnahmekriterium:** Alle Radsport-Berechnungen laufen weiterhin korrekt, jetzt über die `sports/cycling/`-Indirektion statt direkt

**Ergebnis:** `SportProfile`-Vertrag (`app/src/sports/types.ts`) + Registry, `cycling/` in vier Wertemodulen (`zones`/`metrics`/`session-types`/`classify`). Die vier betroffenen core-Module (`zones.js`, `plan-config.js`, `periodization.js`, `efficiency.js`) re-exportieren die Werte unter unverändertem Namen — **keine Aufrufstelle hat sich geändert, die 742 bestehenden Tests liefen unverändert durch**, und genau das ist der Regressionsbeweis. 27 neue Tests (769 gesamt). Umfang, Abgrenzung und die nicht angefassten Grenzfälle stehen in `app/src/sports/README.md`.

Drei Entscheidungen, die beim Umsetzen anfielen:

1. **Re-Export statt Parameter-Durchreichung.** Die Alternative wäre gewesen, ~15 core-Signaturen um ein optionales `sport`-Profil zu erweitern (Muster wie das bestehende `intensityClass(typ, table)`). Das hätte echte Laufzeit-Umschaltbarkeit gebracht, die niemand nutzt, und die Tests der geänderten Signaturen mitgezogen — womit der Regressionsbeweis „bestehende Tests unverändert grün" verloren gegangen wäre. Die Austauschbarkeit steckt jetzt im Vertrag, nicht in verdrahteten Aufrufen.
2. **`sports/` in TypeScript**, obwohl `core/` reines JS ist. Vorab empirisch geprüft: eine `core/*.js`-Datei kann per `.js`-Spezifizierer ein `.ts`-Modul importieren, Vite/Vitest und `tsc -b` lösen das auf. Der Sport-Vertrag ist genau die Stelle, an der ein Interface Arbeit leistet — er ist der einzige Grund, warum ein zweites Profil überhaupt „passen" kann.
3. **Das zweite Sportprofil ist ein Test-Fixture, kein Modul.** „Kein zweites Sport-Modul bauen" und „sicherstellen, dass eins danebenstehen könnte" schließen sich sonst aus: ein halbfertiges Laufsport-Modul auszuliefern wäre toter Code, die Behauptung ungeprüft zu lassen wertlos. Das Fixture in `registry.test.ts` erfüllt den Vertrag vollständig und hat dabei zwei Annahmen korrigiert — `overlayBandPct` (Sweet Spot) muss nullable sein, und `hrMax` gehört gar nicht zur Sportart, sondern zum Athleten.

**STOPP-Punkt beantwortet — keine `sport`-Spalte, nichts migriert.** Keine der 17 Migrationen kennt heute eine; `plan_cards`/`events`/`proposals` sind implizit Radsport. Das Sportprofil ist reine Client-Konfiguration, und solange es genau eins gibt, trüge die Spalte in jeder Zeile denselben Wert. Nötig wird sie erst, wenn echte Daten einer zweiten Sportart entstehen — dann additiv und RLS-neutral nachrüstbar (`ADD COLUMN sport text NOT NULL DEFAULT 'cycling'`). Als Punkt vermerkt in `docs/offene-punkte.md`.

**Nebenbefund:** `getSport()` gab für `"constructor"`/`"toString"` die geerbte Object-Funktion statt `null` zurück — beim Schreiben von `registry.test.ts` aufgefallen, mit `Object.hasOwn` gefixt. Ebenfalls aufgefallen: `CONFIG.powerScaleMax` (300 W) in `assets/js/state/config.js` wird von keiner Stelle gelesen (über `assets/`, `scripts/`, `tests/` gegengeprüft) — der tote Wert ist bewusst nicht mit umgezogen, im Vanilla-Baum aber unangetastet gelassen.

### Etappe 4 — Erste echte Komponente: Hero-Bereich `[SO]` — ✅ umgesetzt (06.08.2026)
- Erster echter Durchlauf des Design-Übernahme-Workflows (5.7): `claude_design`-MCP einrichten (`/design-login`), Hero-Projekt importieren, nach Rezept konvertieren
- `tokens.css` aus den CSS-Variablen des Exports befüllen/abgleichen (dunkler warmer Hintergrund mit Glow, große Radien, helles Blau als Primärakzent, zwei FTP-Ringe, generiertes Hintergrundfoto)
- `docs/vorlage-design-import.md` entsteht hier als Ergebnis des ersten Durchlaufs — was sich bewährt, wird die feste Vorlage für alle weiteren Bereiche
- Erste Komponenten in `components/` entstehen als Nebenprodukt
- **Abnahmekriterium:** Hero-Bereich zeigt echte Daten aus den Etappe-2b-Hooks, visuell nach Vorgabe; Vorlage dokumentiert

**Ergebnis:** s. "Änderungen durch Etappe 4" oben. Kein `claude_design`-MCP nötig (5.7-Korrektur bereits vor dieser Etappe geklärt) — Zugriff lief über `DesignSync.get_project`/`list_files`/`get_file` direkt mit der Projekt-ID.

### Etappen 6a–9 — Restliche Bereiche, je eine eigene Etappe

Jede wird erst grob geplant, wenn die vorherige Etappe abgenommen ist — Detailplanung folgt dem Muster der bisherigen Phasenkonzepte. Jede übernimmt ihre Sichtbarkeits-Matrix-Zeilen ins Abnahmekriterium (s.o.). Etappe 6 (Planungstab) und Etappe 7 (Trainer-Dashboard + Export/Import) sind wegen ihres Umfangs zusätzlich in Sub-Etappen geschnitten (wie 2a/2b) — jede Sub-Etappe ist einzeln abnehmbar und einen eigenen Chat wert, s. "Änderungen durch Etappe 6a" bzw. "Änderungen durch Etappe 7a" oben für die jeweilige Begründung.

| Etappe | Bereich | Modell | Besonderheit |
|---|---|---|---|
| 5 | **Events** | `[SO]` | ✅ umgesetzt (06.08.2026) — s. "Änderungen durch Etappe 5" oben. Erster CRUD-Bereich: Formular-Komponenten, Mutations-Hooks und `write-authorization`-Gates erstmals in echter React-UI gebaut und gehärtet (Muster-Etappe für alles Folgende), inkl. `is_test`-Feld-UI |
| 6a | **Planungstab — Grundgerüst** | `[OP]` | ✅ umgesetzt (07.08.2026) — s. "Änderungen durch Etappe 6a" oben. Liste, Ruhetag-Karten, CRUD-Dialog (inkl. Workout-Blöcke-Editor), Verschieben/Ausfallen/Rückgängig per Inline-Formular, write-authorization-Gate. `PHASES`/`phaseColor()` (`config.ts`) und `week-labels.js` (`core/`) als Nachträge ergänzt |
| 6b | **Planungstab — Drag & Drop** | `[OP]` | ✅ umgesetzt (07.08.2026) — s. "Änderungen durch Etappe 6b" oben. **dnd-kit** statt 1:1-Port der handgebauten Pointer-Events-Mechanik aus `ui/plan-drag.js` — reduziert die Race-Condition-Klasse, die dort laut CLAUDE.md schon einmal einen zähen Bug verursacht hat (Drag-Grip-Bug, Juli 2026). `core/plan-drag.js` (reine Regeln: `isDropAllowed`/`canDragCard`/`resolveDrop`) bleibt unverändert, an dnd-kit-Events angebunden. Nutzt denselben Schreibpfad wie der "Verschieben"-Button (`useMovePlanCard`, s. 6a). `collisionDetection={pointerWithin}` war ein nötiger Nachtrag (s. Doku oben) |
| 6c | **Planungstab — Wirkungsanzeige & Compliance** | `[OP]` | ✅ umgesetzt (07.08.2026) — s. "Änderungen durch Etappe 6c" oben. Intervalltabelle Soll-Ist inkl. `derived`-Badge, Compliance-Ampel, Wirkungsanzeige inkl. Delta-Banner, Konflikt-/Hinweis-Chip, Wetter-Badges, Legacy-Segmentbalken, Z2/Recovery-Detailblöcke. Echte Lücke geschlossen: `projection`/`conflicts` gab es auf React-Seite noch gar nicht (Vanilla-Äquivalent war Modul-State in `state/plan-cards.js`) |
| 6d | **Planungstab — Wahoo-Push** | `[OP]` | ✅ umgesetzt (07.08.2026) — s. "Änderungen durch Etappe 6d" oben. Port von `data-access/intervals/push.js` (Bulk-Upsert über `external_id = plan_cards.id`, verhindert den historischen Duplicate-Event-Bug). **Kein echter Push ohne vorherige Freigabe** (CLAUDE.md) — `external_id`-Upsert-Verhalten gegen echtes Wahoo-Gerät laut `docs/offene-punkte.md` (Phase 3, M3) weiterhin nie live verifiziert |
| 7a | **Trainer-Dashboard — Trainer-Leiste** | `[SO]` | ✅ umgesetzt (07.08.2026) — s. "Änderungen durch Etappe 7a" oben. `TrainerBar` (8 Kacheln, `trainer_view_prefs`-Panel), Direkt/Vorschlag-Umschalter (Default "Vorschlag") verdrahtet in Move/Cancel/Anlegen/Bearbeiten, T2 (Neuanlage immer Vorschlag), Drag&Drop im Vorschlagsmodus deaktiviert |
| 7b | **Trainer-Dashboard — Proposal-Review** | `[SO]` | ✅ umgesetzt (07.08.2026) — s. "Änderungen durch Etappe 7b" oben. `ProposalBanner` (Athlet), `ProposalList` mit Gruppierung/"Alle übernehmen", `ProposalCompare` (TSB-Delta + Konflikt-Badges). "Vorschläge"-Kachel in `TrainerBar` jetzt klickbar (Trainer: read-only) |
| 7c | **Trainer-Dashboard — Export/Import** | `[SO]` | ✅ umgesetzt (08.08.2026) — s. "Änderungen durch Etappe 7c" oben. Export-Panel (Preset-Kachelreihe, Freitext, Event-Auswahl, Leiterstand-Zeile E1), Import-Dialog (Preview+Teilerfolg, nutzt 7bs Review-UI für die importierten Vorschläge). Stufenvorschlag/Leitplanken-Sektion/Fortschrittsindikatoren/Entscheidungsgedächtnis (`docs/konzept-progressionssteuerung.md`) laufen mit — reine Textbausteine im Export-Briefing, kein eigenes UI. Migration `0008_export_prefs.sql` lag bereits vor (nicht Teil dieser Etappe) |
| 7d | **Trainer-Dashboard — Blockstart-Dialog** | `[SO]` | ✅ umgesetzt (08.08.2026) — s. "Änderungen durch Etappe 7d" oben. `BlockDialogGate`/`BlockDialog`, `useBlockTransition`/`useRecordBlockStart` (Port von state/block-transition.js + state/ladder.js::recordLadderStep) — eigenständiges Modal, ausgelöst beim Planungstab-Laden, strukturell unabhängig vom Export-Panel |
| 8a | **Explorer + Charts — Chart-Engine + PMC-Basis-Chart** | `[OP]` | ✅ umgesetzt (08.08.2026, `274d665`). Chart-Grundsatzentscheidung aus 5.3 fällt hier: React-Komponenten mit echtem JSX-SVG, kein Chart-Framework (s. `app/src/charts/README.md`). Erster Chart `PmcChart.tsx` (CTL/ATL/TSB), bewusst ohne Brush/Szenario/Compare/Cursor-Sync |
| 8b | **Explorer + Charts — Zeitraum-Brushing** | `[OP]` | ✅ umgesetzt (08.08.2026) — s. "Änderungen durch Etappe 8b" unten. `BrushBar.tsx` (§4, Variante 2B) + `useExplorerRange`-Hook (`localStorage`), `PmcChart` folgt dem Fenster |
| 8c | **Explorer + Charts — Verknüpfte Charts** | `[SO]` | ✅ umgesetzt (08.08.2026) — s. "Änderungen durch Etappe 8c" oben. Cursor-Sync PmcChart↔BrushBar innerhalb des Explorers + Klick-Sprung zum Planungstab (Scroll+Highlight). Scope gegenüber der Vanilla-Vorlage verkleinert: keine Fahrtenbuch-Verknüpfung (React-Port hat noch kein Fahrtenbuch), kein Rückkanal (echtes Routing statt Vanillas Ein-DOM-Tabs) |
| 8d | **Explorer + Charts — What-if-Regler** | `[OP]` | ✅ umgesetzt (08.08.2026) — s. "Änderungen durch Etappe 8d" oben. `WhatIfPanel.tsx` + `useExplorerScenario`-Hook, zweite gestrichelte CTL-Kurve in `PmcChart` (eigenes, schwächeres Unsicherheitsband). `core/scenario.js` bereits seit 2a portiert, nur UI-/Persistenzschicht neu |
| 8e | **Explorer + Charts — Vergleichsmodus** | `[OP]` | ✅ umgesetzt (08.08.2026) — s. "Änderungen durch Etappe 8e" oben. `CompareChart.tsx` (relative Tag-1-=-Blockstart-Achse, Slot A/B) + `ComparePanel.tsx` + `useExplorerCompare`-Hook, ersetzt `PmcChart` bei aktivem Vergleich. `core/compare.js` bereits seit 2a portiert, nur UI-/Persistenzschicht neu. §7.2 damit formal abgeschlossen (Schritt 5 "Charts-Tab nachziehen" ist laut §8 ein eigener späterer Fahrplan-Schritt) |
| 8f | **Explorer + Charts — Power/Wochenvolumen/Wellness auf die Engine** | `[OP]` | ✅ umgesetzt (08.08.2026) — s. "Änderungen durch Etappe 8f" oben. Nachtrag außerhalb der §7.2-Nummerierung (von `charts/README.md` schon vor 8e angekündigt). `PowerCurveChart.tsx` (Familie 4), `WeeklyVolumeChart.tsx` (Familie 3), `WellnessChart.tsx` + `core/wellness-series.js` (Familie 2) — je ein repräsentativer Chart pro Familie, ohne die PMC-Cross-Cutting-Features aus 8b-8e. Damit sind alle vier Chart-Familien aus `docs/chart-grundlagen.md` §7.2 mit mindestens einem React-Chart vertreten |
| 9 | **Settings** | `[HA]` | ✅ umgesetzt (08.08.2026) — s. "Änderungen durch Etappe 9" oben. Name/Passwort (alle Rollen) + Ziele/FTP-Historie/Formate/Datenquellen (athletengated), inkl. `CheckinDialog.tsx` als Nachtrag über den Vanilla-Port hinaus (fehlende Befinden-Check-in-UI). `ladder_progression_enabled` bewusst nicht angefasst (DB-Grant sperrt Self-Service, Migration 0016) |
| 10 | **Umschaltung** (Teil A+B+C) | `[F5]` | ✅ umgesetzt (08.08.2026) — s. "Änderungen durch Etappe 10, Teil A+B" und "...Teil C" oben. Sichtbarkeits-Matrix als App-weites Routing-Gate, Security-Regressionsdurchlauf, Live-Merge `dashboard-3.0` → `main`, Deploy-Pipeline auf `app/dist`. Offen (auf Alex' Wunsch zurückgestellt): alte Vanilla-Dateien aus `main` entfernen |
| 11a | **Nacharbeiten — Menü-Design + Seitenbreite** | `[OP]` | ✅ umgesetzt (08.08.2026) — s. "Etappe 11"-Abschnitt oben. Pill-Nav + `PageShell` auf allen Seiten, live verifiziert |
| 11b | **Nacharbeiten — Fahrtenbuch** | `[OP]` | ✅ umgesetzt (08.08.2026) — s. "Etappe 11"-Abschnitt oben. Neue Route `/log` (`LogbookPage.tsx`), Filter/Suche/Sort + Wetter-Tooltip aus `ui/table.js` portiert, `📅`-Link → Planungstab und Zeilen-Klick → Explorer-Crosshair verkabelt |
| 11c | **Nacharbeiten — Hero: Gesamtstatistiken-Kacheln** | `[OP]` | ✅ umgesetzt (09.08.2026) — s. "Etappe 11"-Abschnitt oben. `MetricsGrid.tsx` (Port von `ui/overview.js::_renderMetrics()`) unten in `HeroPage.tsx`, nutzt `core.ramp`/`core.eftp` statt FTP/eFTP ein zweites Mal herzuleiten |
| 11d | **Nacharbeiten — Analyse-Tab: Grundgerüst + Belastung + Intensität** | `[OP]` | ✅ umgesetzt (09.08.2026) — s. "Etappe 11"-Abschnitt oben. `/analysis` + `AnalysisPage.tsx`-Shell + `AnalysisSection.tsx` (Baustein für 11e/11f) + KPI-Hero + Belastung/Intensität |
| 11e | **Nacharbeiten — Analyse-Tab: Aerob + Leistungsdiagnostik** | `[OP]` | ✅ umgesetzt (13.08.2026) — s. "Etappe 11"-Abschnitt oben. `AerobicCards.tsx`/`FtpTriad.tsx`/`RecordChips.tsx`, `RETEST_DATE` neu in `config.ts` |
| 11f | **Nacharbeiten — Analyse-Tab: Regeneration & Körper + Konsistenz + Periodisierung** | `[OP]` | ✅ umgesetzt (13.08.2026) — s. "Etappe 11"-Abschnitt oben. `buildBodyCards()` (wiederverwendet `AerobicCards.tsx`), `buildConsistencySummary()` (wiederverwendet `KpiGrid.tsx`), neue `PeriodizationBlocks.tsx` |
| 11g | **Nacharbeiten — Login-Seite stylen** | `[OP]` | ✅ umgesetzt (13.08.2026) — s. "Etappe 11"-Abschnitt oben. `LoginPage.tsx` auf `GlassCard` umgestellt, Label/Input/Error-Stil aus dem etablierten Feature-lokalen Muster (section-styles.ts/EventForm.tsx) |

### Etappe 10 — Umschaltung `[F5]`

In drei Teile geschnitten (Rückfrage vor der Umsetzung, 08.08.2026):

- **Teil A — Routing/Gates.** ✅ umgesetzt (08.08.2026) — s. "Änderungen durch
  Etappe 10, Teil A+B" oben. `ProtectedRoute` gated nur noch `/settings`,
  Hero/Planning/Explorer/Events sind laut Matrix-Zeile E1 öffentlich lesbar.
  Tote `/trainer`-Platzhalter-Route entfernt.
- **Teil B — Security-Regressionsdurchlauf.** ✅ umgesetzt (08.08.2026) — s.
  "Änderungen durch Etappe 10, Teil A+B" oben. Playwright gegen
  `dashboard-dev`, Gesamtdurchlauf über alle Bereichs-Etappen hinweg (die
  Sichtbarkeits-Matrix wurde bislang pro Bereichs-Etappe einzeln geprüft).
  Echter Fund: Belastungsempfehlung-Kachel war für Besucher sichtbar,
  direkt gefixt und erneut verifiziert.
- **Teil C — echte Live-Umschaltung.** ✅ umgesetzt (08.08.2026) — s.
  "Änderungen durch Etappe 10, Teil C" oben. CI/Deploy auf `app/dist`
  umgestellt, `vite.config.ts`-`base` gesetzt, `dashboard-3.0` → `main`
  gemergt und live. **Offen, auf Alex' Wunsch zurückgestellt:** alte
  Vanilla-Dateien (`index.html`, `assets/js/`) aus `main` entfernen.

### Etappe 11 — Nacharbeiten (Fahrtenbuch, Analyse-Tab, Design-Polish) `[OP]`

Beim Live-Check direkt nach dem Teil-C-Merge (08.08.2026) aufgefallen: die
Etappenplanung 1–10 hatte mehrere große Vanilla-Bereiche schlicht nie auf der
Roadmap — kein Bug, sondern eine Lücke im ursprünglichen Zuschnitt. Von Alex
als Etappe 11 eingeplant, **bewusst in unabhängige Häppchen für mehrere
parallele Fenster/Sessions geschnitten** (anders als 6a-6d/7a-7d/8a-8f, die
bewusst sequenziell aufeinander aufbauten). Reihenfolge-Wunsch: 11a zuerst.

Gemeinsame Startbedingung für alle Häppchen: `git checkout main`,
`git pull`, davon einen eigenen Feature-Branch pro Häppchen (`git checkout -b
etappe-11x-...`) — kein gemeinsamer Zwischenbranch, um Merge-Reibung zwischen
den parallelen Fenstern zu vermeiden. Jedes Häppchen einzeln gegen `main`
mergen, sobald `tsc -b`/`vitest`/Playwright-Kurzcheck grün sind.

- **11a — Menü-Design + einheitliche Seitenbreite.** ✅ umgesetzt
  (08.08.2026). `components/Layout.tsx` war unstyled HTML (nackte
  `<nav>`/`<NavLink>`, kein CSS) — jetzt sticky Glass-Bar mit Pill-Nav
  (aktiver Zustand wie `AthleteToggle`/`WellnessChart`-Metrik-Umschalter:
  heller Overlay-Fill statt der alten vollflächigen `--accent`-Farbe, um
  keine zweite Pill-Konvention einzuführen). `EnvBadge` bekam eine kleine
  Pill statt nacktem Text. Neuer `components/PageShell.tsx` (Breite/Rand
  1:1 aus `HeroPage.tsx`s Plate, ohne deren 3D-Tilt) auf Planning/Explorer/
  Events/Settings angewendet — Inhalt, der von Natur aus schmal ist
  (Settings' Formular-Karte u. a.), behält seine eigene engere Innenbreite
  innerhalb des breiten Rahmens (Rückfrage mit Alex). `tsc -b` sauber,
  `vitest` 1065/1065, Playwright-Snapshot lokal + live gegen
  `stuhlsen.github.io/training-dashboard/` bestätigt, 0 Konsolenfehler.
- **11b — Fahrtenbuch (neue Seite).** ✅ umgesetzt (08.08.2026). Zwei
  Rückfragen mit Alex vor dem Bau (Konzept-Text wich vom tatsächlichen
  Vanilla-Stand ab): (1) die hier ursprünglich genannte schreibbare
  Befinden-Spalte (RPE/Feel) existiert im aktuellen `ui/table.js` selbst
  nicht mehr — in Commit `c26e44c` entfernt, dokumentierter, bisher
  unbehobener Feature-Verlust (s. `docs/offene-punkte.md`). Entscheidung:
  11b portiert den AKTUELLEN Vanilla-Stand 1:1 (keine Befinden-Spalte),
  der Feature-Verlust wird hier nicht nebenbei mitgefixt. (2) zwei
  Cross-Feature-Verkabelungen aus dem Vanilla-Fahrtenbuch (`📅`-Link zur
  Planungstab-Fahrt, Hover/Klick-Sync mit dem PMC-Chart-Crosshair) hatten
  im React-Teil noch keine Gegenstelle (kein globaler Hover-Status wie
  `state/chart-view.js`, nur lokale Props je Seite) — Alex entschied
  "beides bauen". Umgesetzt über das bereits etablierte
  `location.state.highlightDate`-Sprungmuster (Etappe 8c,
  `ExplorerPage::handleSelectDate` → `PlanningPage`), kein neuer globaler
  Store nötig: Fahrtenbuch-Zeilenklick → Sprung zu `/explorer`, das dort
  ankommende `highlightDate` setzt (sofern im sichtbaren Brush-Fenster,
  sonst stiller No-op) den PMC-Crosshair via "Zustand während des
  Renderns anpassen" statt eines setState-in-Effekt (vermeidet den von
  `react-hooks/set-state-in-effect` zu Recht verbotenen kaskadierenden
  Re-Render). `📅`-Icon (nur intervals.icu-Ära-Fahrten) → Sprung zu
  `/planning`, nutzt den dortigen Mechanismus unverändert. Kein
  Wochen-Filter-Tag portiert: der einzige Vanilla-Aufrufer (Klick auf
  einen Wochen-Balken im Trainings-Chart) existiert im React-Port noch
  nicht, ein Tag ohne Weg ihn zu setzen wäre tote UI. `weekOrder`/
  `weekIndex()` (Sortier-Fallback für Notion-Ära-Wochenlabels) dafür neu
  nach `config.ts` portiert — in Etappe 2b bewusst ausgelassen (Planungstab
  brauchte es nicht), das Fahrtenbuch braucht es für `weekSortIndex()`.
  `tsc -b` sauber, `vitest` 1079/1079 (+14 neue Tests in
  `logbook-view-model.test.ts`), ESLint sauber.
- **11c — Hero: Gesamtstatistiken-Kacheln.** ✅ umgesetzt (09.08.2026). Port von
  `ui/overview.js::_renderMetrics()` (Gesamtdistanz, Fahrten, Trainingszeit,
  Ø Tempo, FTP/eFTP, CTL Peak, längste Fahrt, Ø Herzfrequenz, Ø Kadenz) als
  neue `MetricsGrid.tsx`-Kachelreihe unten in `HeroPage.tsx`. Neue Funktion
  `buildHeroMetrics()` in `hero-view-model.ts` nimmt bewusst `core.ramp`/
  `core.eftp` aus dem bereits gebauten `HeroCore` entgegen statt FTP/eFTP
  ein zweites Mal herzuleiten — Ring und Kachel zeigen dadurch garantiert
  denselben Wert. Der NP-Fallback aus Vanillas `Data.ftpValue()` entfällt
  dabei bewusst: `HeroCore.ramp.value` kommt ausschließlich aus
  `athleteCfg.ftpMeasured` (Pflichtfeld in `AthleteConfig`), der Vanilla-
  Zweig "kein ftpMeasured → höchstes NP" ist im React-Port unerreichbar.
  `GlassCard` um optionale `onMouseEnter`/`onMouseLeave` erweitert (Hover-
  Transform der Kacheln, Muster aus `LogbookPage.tsx` — diese App stylt
  ausschließlich inline, keine `:hover`-Regel in einer CSS-Datei). `tsc -b`
  sauber, `vitest` 1084/1084 (+5 neue Tests in `hero-view-model.test.ts`).
  Live-Playwright-Check ausgelassen (Browser-Lock durch eine parallele
  Session) — auf Alex' Wunsch nur per `tsc`/`vitest` verifiziert.
- **11d — Analyse-Tab: Grundgerüst + Belastung + Intensität.** ✅ umgesetzt
  (09.08.2026). Neue Route `/analysis` + Nav-Eintrag (`Layout.tsx`, nach
  „Fahrtenbuch"), `features/analysis/AnalysisPage.tsx` als Shell. Reine
  UI-Arbeit, kein Logik-Port — alle Kern-Module lagen bereits fertig in
  `app/src/core/`.
  - **Grundgerüst:** `AnalysisSection.tsx` (+ `AnalysisBox`/`AnalysisEmpty`/
    `AnalysisNote`) als gemeinsamer Sektions-Baustein für 11e/11f — Icon +
    Titel + optionaler Erklärtext + beliebiger Inhalt, 1:1 aus
    `.analysis-section`/`.section-label`/`.analysis-explainer`/
    `.analysis-box` (assets/css/components.css + main.css) portiert.
  - **KPI-Hero** (`_renderKPIs`) mit in dieses Häppchen gepackt, obwohl in
    der Etappenplanung nicht explizit 11d/e/f zugeordnet — sie ist
    Seiten-weit (kein Bezug zu einer einzelnen späteren Sektion), gehört
    also ins „Grundgerüst" statt offenzubleiben.
  - **Belastung** (Port von `_renderLoad`, Kern `core/loadguard.js`) und
    **Intensität** (`_renderZones` + `_renderTypDistribution`, Kern
    `core/zones.js`) als erste zwei Sektionen.
  - Eine bewusste Abweichung vom Original: der Intensitäts-Hinweistext
    verweist NICHT mehr auf „siehe Periodisierungs-Erfüllung" (die
    Sektion existiert im React-Port noch nicht, kommt erst mit 11f) — ein
    Verweis auf eine nicht vorhandene Stelle wäre irreführend. Bei 11f
    wieder ergänzen, falls gewünscht.
  - `app/src/features/analysis/analysis-view-model.ts` (+ `.test.ts`,
    11 neue Tests) trennt die reinen Ableitungen von der JSX-Ebene, Muster
    wie `logbook-view-model.ts`.
  - `tsc -b` sauber, `npx vitest run` 1095/1095 (Root `npm test`
    unverändert, keine `core/`-Änderung). Live-Playwright-Check gegen den
    lokalen Vite-Dev-Server (beide Athleten durchgeklickt, Datensätze real
    aus `data/rides.json`/`data/rides-2.json`) — keine neuen
    Konsolenfehler, nur der vorbestehende Supabase-Refresh-Token-400 ohne
    aktive Session.
- **11e — Analyse-Tab: Aerob + Leistungsdiagnostik.** ✅ umgesetzt
  (13.08.2026). Baute auf der Shell aus 11d auf, reine UI-Arbeit, kein
  Logik-Port — `core/efficiency.js`, `core/cadence.js`, `core/records.js`,
  `core/ftp-forecast.js`, `core/body.js` lagen bereits fertig in
  `app/src/core/`.
  - **Aerobe Entwicklung** (Port von `_renderAerobic`): neue
    `AerobicCards.tsx` (Port von `.analysis-grid-3`/`.aerobic-card`) zeigt
    Effizienzfaktor, HF-Decoupling, Kadenz-Ökonomie — je Karte entweder
    Wert+Subzeilen oder ein `empty`-Text, wenn die Datenbasis fehlt (1:1
    wie im Original, keine Karte entfällt ersatzlos).
  - **Leistungsdiagnostik** (Port von `_renderPower`): neue `FtpTriad.tsx`
    (Port von `.ftp-triad`/`.ftp-forecast-line`) und `RecordChips.tsx`
    (Port von `.records-digest`). Die Retest-/Zielhorizont-Prognose enthält
    einen fett gesetzten Teilsatz (`<strong>`) — dafür liefert
    `buildPowerDiagnostics()` statt eines fertigen Strings ein
    `segments`-Array (`{text, strong?}[]`), das `FtpTriad.tsx` in
    `<strong>`/`<span>` abbildet, statt HTML-String-Interpolation
    nachzubauen.
  - `CONFIG.retestDate` (Vanilla-Singleton, nur bei `ownPlan` genutzt) neu
    als `RETEST_DATE`-Konstante in `config.ts` ergänzt — kein Feld auf
    `AthleteConfig`, weil er athletenweit und nicht Teil der Athleten-
    Stammdaten ist (Athlet 2 nutzt stattdessen den Ziel-Horizont-Zweig,
    `ownPlan` gated das in `buildPowerDiagnostics()` genau wie im Original).
  - `analysis-view-model.ts` (+11 neue Tests: `buildAerobicCards`,
    `buildPowerDiagnostics`, `buildRecordChips`) hält weiter die reinen
    Ableitungen von der JSX-Ebene getrennt, Muster wie 11d.
  - `tsc -b` sauber, `npx vitest run` 1104/1104 (Root `npm test`
    unverändert, keine `core/`-Änderung), ESLint sauber. Live-Playwright-
    Check gegen den lokalen Vite-Dev-Server (beide Athleten, echte Daten
    aus `data/rides.json`/`data/rides-2.json`) — Retest-Prognose mit
    Fettung bei Athlet 1, Ziel-Horizont-Prognose („ohne Termin") bei
    Athlet 2, keine neuen Konsolenfehler (nur der vorbestehende Supabase-
    Refresh-Token-400 ohne aktive Session, s. 11d).
- **11f — Analyse-Tab: Regeneration & Körper + Konsistenz + Periodisierung.**
  ✅ umgesetzt (13.08.2026). Baute auf der Shell aus 11d auf, reine UI-Arbeit,
  kein Logik-Port — `core/body.js`, `core/adherence.js`, `core/periodization.js`
  lagen bereits fertig in `app/src/core/`. Der Doku-Verweis auf
  `core/consistency.js` in der ursprünglichen Zeile oben war ungenau: die
  Vanilla-Sektion `_renderConsistency` nutzt tatsächlich nur
  `core/adherence.js::buildConsistency` — `core/consistency.js` gehört zum
  Jahreskalender-Chart (`ui/charts/training.js`), nicht zum Analyse-Tab.
  - **Regeneration & Körper** (Port von `_renderBody`): `buildBodyCards()`
    nutzt bewusst denselben `AerobicCard`-Rückgabetyp und dieselbe
    `AerobicCards.tsx`-Komponente wie die Aerobe-Entwicklung-Sektion (11e) —
    das Original zeichnet Gewicht/Energie/Hydration mit derselben
    `.aerobic-card`-CSS-Klasse, hier also Komponente wiederverwendet statt
    eine Kopie zu bauen. Sektion blendet sich komplett aus (kein
    `AnalysisSection`-Aufruf), wenn `buildBodyCards()` ein leeres Array
    liefert — 1:1 `section.classList.toggle("hidden", !avail.any)` aus dem
    Original. `AthleteConfig.bmr` (nur Athlet 2) neu in `config.ts` ergänzt,
    1:1 aus `state/config.js::athletes[].bmr` — Fallback-Grundlage für die
    Energie-Karte, wenn Wellness keine `restingEnergy` trägt.
  - **Konsistenz & Adhärenz** (Port von `_renderConsistency`):
    `buildConsistencySummary()` reicht `PlanCard[]` aus `usePlanCards()`
    direkt (roh, ungemappt) an `core/adherence.js::buildConsistency()`
    durch — dieselbe Übergabe-Konvention wie bereits `hero-view-model.ts::
    findNextSession()` (Etappe 6/9) für `core/ftp-progress.js::
    nextPlannedSession()`: die Vanilla-Session-Shape erwartet `.title`,
    core/planning.js::applyAdjustment() fällt beim Fehlen intern auf `.name`
    zurück (PlanCards Feldname) — keine Remapping-Schicht nötig. `null` statt
    Plankarten bei Athlet 2 (kein `ownPlan` im Sinne von
    `rides.some(r => r.week)`, s. AGENTS.md "Bekannte Eigenheiten" zu
    `mapActivity2()`) — Adhärenz-Chip entfällt dort, Streak/Frequenz bleiben.
    Rendert die Chips über das bereits bestehende `KpiGrid.tsx` (identische
    `.analysis-kpi-grid`-Klasse im Original) statt einer eigenen Komponente.
  - **Periodisierungs-Erfüllung** (Port von `_renderPeriodization`, nur
    Athlet 1): neue `PeriodizationBlocks.tsx` (Port von `.phase-comp-row`,
    CSS-Grid-Spalten 1:1 aus `assets/css/components.css` übernommen).
    `buildPeriodization()` nimmt `weekIndexFn` vom Aufrufer entgegen
    (`weekSortIndex` aus `core/aggregate.js` + `weekIndex` aus `config.ts`)
    statt selbst zu importieren, wie im Original `weekSortIndex(w, (x) =>
    CONFIG.weekIndex(x))`. Sektion komplett `ownPlan`-gated (kein Rendern
    für Athlet 2), Farben über das bestehende `phaseColor()` aus `config.ts`.
  - Beim Fixen des `tsc -b`-Laufs zwei vorbestehende, bislang unbemerkte
    JSDoc-Lücken in `core/body.js::energyView()` aufgefallen (fehlende
    `hasResting`/`restingEstimated` im `@returns`, fehlender `@param` für
    `estBMR` — dadurch inferierte TS den Parametertyp nur als `null` statt
    `number|null`) und in BEIDEN Kopien (vanilla `assets/js/core/body.js`
    UND `app/src/core/body.js`) korrigiert, reine Typannotation, kein
    Verhaltensunterschied.
  - `analysis-view-model.ts` (+13 neue Tests: `buildBodyCards`,
    `buildConsistencySummary`, `buildPeriodization`) hält weiter die reinen
    Ableitungen von der JSX-Ebene getrennt, Muster wie 11d/11e.
  - `tsc -b` sauber, `npx vitest run` 1111/1111 (app/), Root `npm test`
    936/936 unverändert grün (Doc-only-Änderung in `core/body.js` betrifft
    keine Vanilla-Laufzeitlogik), ESLint (Root + `app/`) sauber. Live-
    Playwright-Check gegen den lokalen Vite-Dev-Server (beide Athleten, echte
    Daten aus `data/rides.json`/`data/rides-2.json`): Athlet 2 (hc_diZee)
    zeigt Regeneration & Körper (alle drei Karten) + Konsistenz (ohne
    Adhärenz-Chip, kein `ownPlan`) und blendet Periodisierung korrekt aus;
    Athlet 1 (Stuhlsen) zeigt zusätzlich die Adhärenz-Chip mit
    "Zuletzt verpasst"-Hinweis sowie zwei Periodisierungs-Blöcke (Sweet
    Spot phasengerecht, Schwelle teilweise) + eine Erholungswoche ("zu hart
    für Erholung"). 0 Konsolenfehler.
- **11g — Login-Seite stylen.** ✅ umgesetzt (13.08.2026). Bei der
  11a-Live-Verifikation aufgefallen: `LoginPage.tsx` war komplett unstyled
  HTML (nackte `<input>`/`<button>`, kein CSS) — sitzt außerhalb von
  `Layout`/`PageShell` (eigene Route ohne Kopfzeile, s. `App.tsx`), war
  deshalb von 11a nicht mitgedeckt. Formular jetzt in eine zentrierte
  `GlassCard` (`variant="strong"`) gepackt, `AppBackground` bleibt
  unverändert bereits in `App.tsx` gemountet. Label/Input/Error-Stil sind
  lokale Konstanten in `LoginPage.tsx` selbst (kein neues geteiltes Modul
  quer über Features) — Werte 1:1 aus dem bereits etablierten Muster
  übernommen (`section-styles.ts`: `.62rem` für Label/Error, `SettingsPage.tsx`:
  `1.6rem` für die Überschrift, `Layout.tsx`s `PILL_BUTTON_STYLE`: `.86rem`
  für den Button), keine neuen Schriftgrößen erfunden. Kein Logik-Änderung
  — `useAuth`/`signIn`-Verhalten unangetastet. `tsc -b` sauber, `npx vitest
  run` weiterhin 1111/1111 (reine Optik, keine neuen Tests nötig).
  Live-Playwright-Check gegen den lokalen Vite-Dev-Server: Karte korrekt
  zentriert/gestylt, 0 Konsolenfehler durch die Änderung selbst. Die
  Fehlermeldungs-Darstellung (`role="alert"`) konnte nicht per echtem
  Fehlversuch gegengeprüft werden — der Playwright-Browser-Kontext hatte
  bereits eine aktive echte Supabase-Session aus einer früheren Sitzung
  gespeichert, `LoginPage`s `session`-Redirect griff dadurch sofort;
  bewusst nicht angefasst, um keine echte Session/Zugangsdaten zu berühren.

**Bewusst nicht in Etappe 11:** Wochenrückblick (`core/weekreview.js` ist
zwar bereits portiert, aber `ui/weekreview.js`-Äquivalent hat noch keine
zugeordnete Stelle im React-Port — Rückfrage vor Zuschnitt, statt es
ungefragt einem der sechs Häppchen zuzuschlagen).

---

### Etappe 12 — Fehlende Charts + Hero-Ergänzungen `[OP]`

Anlass (13.08.2026): Alex meldete beim Live-Check eine lange Liste
fehlender Charts (Belastungswächter, Zeit-in-Zonen, FTP-Projektion,
Kadenz-Coach, Aerobe Effizienz/Entkopplung, Tempo vs. HF,
HF-Entwicklung, Schlaf, Energie/Gewicht, Wetter) sowie fehlende
Trainingskonsistenz + Bestleistungen im Hero-Tab. Recherche (zwei
Explore-Agenten gegen `app/src/**` und `assets/js/**`) bestätigte: kein
Bug, sondern dieselbe Art Lücke wie vor Etappe 11 — Etappe 8 („Explorer"-
Tab) hat nur 4 der 6 Chart-Familien aus `docs/chart-grundlagen.md` §7.2
gebaut (PMC, Power-Curve, Wochenvolumen, HRV/Ruhepuls); Etappe 11
(Analyse-Tab) war von Anfang an als reiner Text-/Karten-Port geplant,
nie als Chart-Ersatz gedacht. Records + Konsistenz-Kalender sitzen in
vanilla auf `tab-overview` (= Hero-Tab im React-Port), nicht im
Analyse-Tab — auch das ist ein echter Rückstand, kein Missverständnis.

Die komplette Berechnungslogik ist bereits nach `app/src/core/` portiert
und bei Analysis/Hero im Einsatz (`efficiency.js`, `cadence.js`,
`ftp-forecast.js`, `zones.js`, `records.js`, `body.js`; `consistency.js`
ist portiert, aber bislang nirgends importiert). `useRides()` liefert
bereits alle nötigen Rohdaten (`rides`, `wellness`, `forecast`). Es
fehlen ausschließlich die React-Chart-Komponenten (`app/src/charts/*.tsx`)
und ihre Verkabelung — kein neuer Core-Code, keine neuen Datenfelder.

„Belastungswächter" und „Intensitätsverteilung" existieren bereits als
Sektion im Analyse-Tab (Text/Tabelle, `LoadTable`/`IntensityBand`, 11d) —
fehlend ist dort nur die zugehörige **grafische** Zeitreihe, nicht die
Sektion selbst.

Gleiches Schnittmuster wie Etappe 11: unabhängige Häppchen, je eigener
Feature-Branch (`etappe-12x-...`), je eigener Commit. Reihenfolge-Vorschlag
mit den Hero-Lücken zuerst (höchste Sichtbarkeit, wie „11a zuerst"):

- **12a — Hero: Bestleistungen + Trainingskonsistenz-Kalender.** Neue
  `ConsistencyCalendar.tsx` (Familie 6, Wochenraster — eigene
  Layout-Logik, keine bestehende Zeitreihen-Chart-Komponente
  wiederverwendbar), verkabelt `core/consistency.js`. `RecordChips.tsx`
  (bereits vorhanden) zusätzlich in `HeroPage.tsx` einbinden — vanilla
  zeigt Records sowohl auf Übersicht als auch sekundär im Analyse-Tab,
  hier also ergänzen statt aus `AnalysisPage.tsx` zu entfernen (1:1-Port-
  Konvention).
- **12b — Explorer: FTP-Prognose.** Neue `FtpForecastChart.tsx`
  (Familie 1, wie `PmcChart.tsx`), `core/ftp-forecast.js`.
- **12c — Explorer: Aerobe Effizienz + Aerobe Entkopplung.** Zwei neue
  Komponenten `EfficiencyChart.tsx`/`DecouplingChart.tsx` (Familie 2),
  `core/efficiency.js`.
- **12d — Explorer: Kadenz-Coach.** Neue `CadenceChart.tsx` + Chip-Reihe
  (Port von `power.js::renderCadenceCoach`), `core/cadence.js`.
- **12e — Explorer: Zeit-in-Zonen (wöchentlich).** Neue
  `ZoneWeeklyChart.tsx` (Familie 3), `core/zones.js::weeklyZoneShares`.
- **12f — Explorer: Wetter (wöchentlich).** Neue `WeatherWeeklyChart.tsx`
  (Familie 3), Wochenaggregation direkt aus `Ride.weather` (kein neues
  Core-Modul nötig, ggf. kleine reine Aggregat-Funktion in `core/`
  ergänzen, Muster wie `weeklyZoneShares`).
- **12g — Explorer: Schlaf.** Neue `SleepChart.tsx` (Familie 2), direkt aus
  `WellnessDay.sleepHours`/`avgSleepingHR`.
- **12h — Explorer: Energie & Gewicht.** Neue `EnergyWeightChart.tsx`
  (Familie 2), `core/body.js`.
- **12i — Explorer: Tempo vs. Herzfrequenz (Scatter) + Ø-HF-Entwicklung.**
  Zwei kleine, verwandte Charts in einem Häppchen: `SpeedHrScatterChart.tsx`
  (Familie 4, Port von `power.js::renderScatter`) + Ø-HF-Trend-Panel
  (Familie 5, Port des HF-Panels aus `power.js::renderSmallMultiples`).

**Bewusst nicht in Etappe 12:** vollständige Fadenkreuz-/Brush-Kopplung
über alle neuen Charts hinweg — jedes Häppchen nutzt nur so viel vom
bestehenden `hoveredDate`/`onHoverChange`-Mechanismus (`PmcChart.tsx`/
`WellnessChart.tsx`), wie ohne zusätzlichen Umbau erreichbar ist; eine
vollständige Cross-Chart-Synchronisation wäre ein eigener, größerer
Schnitt.

---

## 5. Offene und festgelegte Punkte

### 5.1 TypeScript ja/nein (offen, Etappe 1)
Spricht dafür: Typsicherheit gerade bei der Multi-Sport-Abstraktion (G5) und beim Proposal-Schema; die Claude-Design-Exporte deklarieren Prop-Typen bereits als `tsType`-Hinweise, die Schnittstellen ließen sich also sauber typisieren. Spricht dagegen: zusätzliche Lernkurve/Setup. Die Exporte selbst erzeugen keinen TSX-Zwang (sie sind kein JSX/TSX, siehe 5.7). Empfehlung wird in Etappe 1 mit Begründung vorgelegt.

### 5.2 State-Management über React Query hinaus (Formulare: entschieden — reiner React-State; Drag&Drop: entschieden + umgesetzt, Etappe 6b)
Für Formulare (Etappe 5/6a) reicht React-eigener `useState`, keine zusätzliche Bibliothek nötig — so umgesetzt. Für den Drag&Drop-Zustand (Etappe 6b) fiel die Entscheidung auf **dnd-kit** statt eines rein React-eigenen Ansatzes (s. Etappenplan-Tabelle, Zeile 6b) — Begründung dort, Ergebnis s. "Änderungen durch Etappe 6b".

### 5.3 Charts: React-nativ oder Portierung der SVG-Logik (offen, Etappe 8)
Die bestehenden Charts sind handgeschriebenes SVG ohne Framework-Bindung (`document.createElementNS`). Zwei Wege: (a) 1:1 als React-Komponenten mit `ref`-basiertem direktem DOM-Zugriff portieren (wenig Risiko, wenig "React-typisch"), (b) auf eine React-Chart-Bibliothek umstellen (mehr Aufwand, potenziell schlechter zur bestehenden Design-Sprache aus `chart-grundlagen.md` passend). Wird erst in Etappe 8 (Explorer) entschieden, nicht in Etappe 1.

### 5.4 Branch- und Ordner-Name (festgelegt)
Branch `dashboard-3.0` (Muster wie `dashboard-2.0`), Ordner `/app/`.

### 5.5 JSON-Pipeline (`generate-data.js` / Cron) (**bestätigt**, Etappe 2b, 06.08.2026)
Der GitHub-Actions-Cron erzeugt `data/*.json`, die die Vanilla-App liest. **Entscheidung: die Dateien bleiben, die React-App liest sie unverändert weiter.** Weder `scripts/generate-data.js` noch das Dateiformat werden angefasst; eine spätere Ablösung nach Supabase wäre ein eigenes Vorhaben.

Umsetzung: `app/src/api/pipeline.ts` + `useRides()`. Zwei Punkte, die dabei zu klären waren:
- **Dev-Server.** Der Vite-Dev-Server wurzelt in `/app/`, `data/` liegt im Repo-Root daneben. `serveRepoData()` in `app/vite.config.ts` liefert es unter `/data` aus (`apply: "serve"`, ~25 Zeilen, keine neue Dependency, kein Kopieren in den Build — eine Kopie wäre ein zweiter, sofort veraltender Stand). Verifiziert: `GET /data/rides.json` → 200, `application/json`, 387.249 Bytes.
- **Pfadbildung.** Über `import.meta.env.BASE_URL`. Ein absoluter `/data/…`-Pfad wäre auf GitHub Pages falsch (Projektseite unter `/training-dashboard/`), ein relativer `./data/…` bräche bei tiefen Client-Routen wie `/planning`. In Produktion (Etappe 10) liegt `/data/` neben der gebauten App.

### 5.6 Wie die React-Version während des Parallelbetriebs sichtbar ist (**entschieden**, 06.08.2026)
G2 sagt, die alte Seite bleibt live — GitHub Pages liefert aber von `main`. Drei Wege: (a) nur lokal per `npm run dev` ansehen bis zur Umschaltung, (b) zweiter Pages-Deploy aus dem `dashboard-3.0`-Branch unter eigenem Pfad, (c) externer Preview-Dienst. Die frühere Empfehlung war (a) für Etappe 1–3 und ab Etappe 4 dann (b).

**Entschieden: bleibt vorerst bei (a)** — nur lokal per `npm run dev`. Der zweite Pages-Deploy ist damit nicht verworfen, sondern zurückgestellt; er kostet Workflow-Pflege, und ob Design-Iterationen ihn wirklich brauchen, zeigt sich erst am ersten echten Bereich. **Auslöser für ein Umschwenken auf (b):** sobald eine Beurteilung auf einem echten Gerät (Telefon/Tablet) nötig wird, die der Desktop-Browser nicht ersetzt.

### 5.7 Design-Übernahme-Workflow (festgelegt, 04.08.2026)

**Befund aus dem echten Export (Rad-Dashboard_Hero-Redesign):** Kein Tailwind, kein JSX, keine Module. Statische Varianten (`*.dc.html`) sind pures HTML mit Inline-Styles plus CSS-Variablen-Tokens (oklch: `--ink`, `--accent`, `--glass`, `--hair` …). Interaktive Varianten sind React-**Klassenkomponenten** auf proprietärer Runtime: `DCLogic`-Basisklasse aus `support.js`, UI über `h(...)`-Aufrufe, Mount via `x-dc`-Custom-Element, Props als `data-props`-JSON.

**Festgelegter Weg:** Claude Design generiert per „Send to Claude Code" den Import-Prompt mit Projekt-URL und Fokus-Dateien, Claude Code liest das Design-Projekt direkt — kein Zip-Umweg. Der Prompt wird in die feste Vorlage **`docs/vorlage-design-import.md`** eingesetzt, die die Projektregeln ergänzt:

> **Korrektur (06.08.2026, geprüft):** Der generierte Prompt nennt einen `claude_design`-MCP-Server (`https://api.anthropic.com/v1/design/mcp`, Auth via `/design-login`). **Der wird nicht gebraucht** — das eingebaute `DesignSync`-Tool kommt mit der Projekt-ID direkt an dieselben Dateien, die Freigabe hängt bereits am claude.ai-Login. Kein `.mcp.json`-Eintrag, kein OAuth-Setup. Gegengeprüft am Hero-Projekt: `get_project` und `list_files` liefern beide.
>
> Eine Stolperstelle: `DesignSync.list_projects` filtert auf **beschreibbare Design-System-Projekte** und gibt für ein reguläres Design-Projekt eine leere Liste zurück — das ist kein Fehler und kein fehlender Zugriff. Der Weg führt immer über die Projekt-ID aus der URL, nie über die Liste.
>
> Hero-Projekt: `fed5c129-1eb1-4ea8-a950-ad70fa39ddad` („Rad-Dashboard Hero-Redesign", `type: PROJECT_TYPE_PROJECT`). Enthält neben `Hero-Ebenen.dc.html` + `support.js` auch vier Explorer-Entwürfe — die gehören zu Etappe 8, nicht zum Hero-Import.

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
