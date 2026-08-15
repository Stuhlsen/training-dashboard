> **Archiviert (Fahrplan 2, DOK1, 15.08.2026).** Beschreibt einen überholten Stand. Gilt nicht mehr für den aktuellen Code — nur als historischer Kontext.

# V0 — Funktionsgleichheits-Abgleich Vanilla → React 3.0

**Stand:** 14.08.2026
**Herkunft:** Fenster V0 aus `docs/fahrplan-1-vanilla-entfernen.md`
**Wichtig:** Dieses Fenster hat keine einzige Datei verändert — reiner Bericht.

**Korrektur (Stand 14.08.2026, unmittelbar vor V2 durch `/code-review` gefunden):** Zeile "Charts / Explorer" unten war zu optimistisch. Ein Abgleich der einzelnen Vanilla-Chart-IDs (nicht nur der Komponentenzahl) gegen `app/src/charts/*` zeigte drei fehlende Charts: **Ø Tempo · Entwicklung** (`chart-sm-tempo`, komplett fehlend), **Belastungswächter** (`chart-trimp`, TRIMP-Wochenlast + CTL-Ramp-Linie + Monotonie-⚠ — die Daten waren über `LoadTable.tsx` erreichbar, aber nicht als Chart), **Hydration** (`chart-hydration`, nur noch eine Durchschnittszahl statt Tagesverlauf). Alle drei sind mit `TempoTrendChart.tsx`/`TrimpLoadChart.tsx`/`HydrationChart.tsx` nachgezogen (V1-Nachtrag, je ein Commit). Lehre für künftige V0-artige Abgleiche: bei Chart-Listen die Einzel-IDs zählen, nicht nur "Komponente X existiert".

---

## 1. Kurzfassung

Die React-App unter `app/` ist bei der **Oberfläche nahezu vollständig** — alle neun besonders geprüften Portierungsposten aus Fahrplan-1 Punkt 3 sind vorhanden, acht davon 1:1, einer (Leiterstand) nur teilweise. `app/src/core/` ist ein **echtes Superset** von `assets/js/core/`: alle 52 Vanilla-Module existieren dort, 46 byteidentisch, 6 divergent — und zwar durchgängig, weil React **voraus** ist (Etappe-3-Multi-Sport-Extraktion), nie zurück.

**Es gibt aber drei echte Funktionslücken** (Wochenrückblick, Tagesform-Detailpanel, Befinden-Kachel) und **eine harte Blockade, die im Fahrplan als „nach bisherigem Stand nein" abgehakt ist**: `scripts/` importiert 13 Module aus `assets/js/core/`. Eine Löschung nach V2-Rezept bricht `npm run sync` und die 6-Stunden-Sync-Action sofort. Zusätzlich verliert die Testabdeckung ~10 reine Kernfunktionen ersatzlos.

**Urteil: V1 ist erforderlich.** Nicht wegen der UI — die ist fast fertig —, sondern wegen der `scripts/`-Kopplung und der Testlücken.

---

## 2. Lückentabelle

| Bereich | in 3.0 vorhanden | vollständig | Lücke | Testabdeckung |
|---|---|---|---|---|
| **Hero / Übersicht** (`assets/js/ui/overview.js`) | ja — `app/src/features/hero/*` | ja | — | `hero-view-model.test.ts` ✅ |
| **Tagesform-Panel** (`assets/js/ui/panels.js:41` `renderReadiness`) | teilweise — `app/src/features/hero/BriefingCard.tsx` | **partial** | Metrik-Aufschlüsselung fehlt: z-Wert, `confidence`-Badge, `recent` vs. Ø `baseline`, `basisNote`, `staleWarning`. React zeigt nur die Aggregat-Ampel + RHF/HRV | `readiness-confidence.test.js` ✅ (Kern), UI ungetestet |
| **Wochenrückblick** (`assets/js/ui/panels.js:87` `renderWeekReview`) | **nein** | **nein** | `app/src/core/weekreview.js` ist portiert, aber von **keiner** React-Komponente importiert — toter Port. Im Konzept Z. 1624 explizit „bewusst nicht in Etappe 11" | ❌ `buildWeekReview` hat 0 React-Tests |
| **Bestwerte** (`assets/js/ui/panels.js:126`) | ja — `RecordChips.tsx` (Hero + Analyse) | ja | — | ❌ `recordProgression` 0 React-Tests |
| **Fahrtenbuch** (`assets/js/ui/table.js`) | ja — `app/src/features/logbook/LogbookPage.tsx` | ja | Filter/Suche/Sort/Wetter-Tooltip/📅-Link portiert (11b) | `logbook-view-model.test.ts` ✅ |
| **Planungstab** (`assets/js/ui/planned.js`, 1683 Z.) | ja — `app/src/features/planning/*` (24 Dateien) | ja | — | 11 Testdateien ✅ |
| **Drag & Drop** (`assets/js/ui/plan-drag.js`) | ja — dnd-kit in `PlanningPage.tsx:249`, `DaySlotRow.tsx` | ja | — | `plan-drag.test.js` ✅ |
| **Karten-Dialog** (`assets/js/ui/plan-card-dialog.js`) | ja — `PlanCardForm.tsx` | ja | — | ✅ |
| **Blockstart-Dialog** (`assets/js/ui/block-dialog.js`) | ja — `BlockDialog.tsx` + `BlockDialogGate` | ja | Session-Guard + ownsPlan-Gate mitportiert | `block-dialog-view-model.test.ts`, `useBlockTransition.test.tsx` ✅ |
| **Export-Panel** (`assets/js/ui/export-panel.js`) | ja — `ExportPanel.tsx` | **partial** | **Leiterstand-Zeile fehlt in der UI** (s. §3.5). Daten stecken im Markdown, nicht im Panel | `export-briefing-view-model.test.ts` ✅ |
| **Import-Dialog** (`assets/js/ui/import-dialog.js`) | ja — `ImportDialog.tsx` | ja | — | `proposal-import-parser.test.js` ✅ |
| **Vorschläge** (`proposal-banner/list/compare.js`) | ja — `ProposalBanner/List/Compare.tsx` | ja | — | `proposal-review-view-model.test.ts` ✅ |
| **Trainer-Leiste** (`assets/js/ui/trainer-bar.js`) | ja — `TrainerBar.tsx` | ja | — | `trainer-bar-view-model.test.ts` ✅ |
| **Analyse-Tab** (`assets/js/ui/analysis.js`) | ja — `app/src/features/analysis/*` | ja | Sektion 1 (Belastungsempfehlung) bewusst auf den Hero verlagert, Sektionen 2–8 vollständig | `analysis-view-model.test.ts`, `analysis-core.test.js` ✅ |
| **Charts / Explorer** (`assets/js/ui/charts/*`) | ja — `app/src/charts/*` (23 Komponenten) | ja | Etappe 8 + 12a–12i abgeschlossen; 3 einzelne Chart-IDs fehlten (Tempo/TRIMP/Hydration, s. Korrektur oben) — mit V1-Nachtrag geschlossen | 23 Chart-Tests ✅ |
| **Chart-Sichtbarkeit** (`assets/js/ui/chart-visibility.js`) | **nein** | **nein** | Kein datengetriebenes Aus-/Einblenden leerer Charts, kein Kategorie-Kollaps, kein „leere trotzdem zeigen"-Umschalter. 5 von 20 React-Charts haben einen eigenen Leerzustand | ❌ `chart-visibility.test.js` verwaist |
| **Events** (`event-form.js`, `event-timeline.js`) | ja — `app/src/features/events/*` | ja | — | `events-view-model.test.ts`, `useEvents.test.tsx` ✅ |
| **Settings** (`assets/js/ui/settings-panel.js`) | ja — `app/src/features/settings/*` | ja | Profil/Passwort/Ziele/FTP-Historie/Formate/Datenquellen alle vorhanden | `formats-view-model.test.ts` ✅ |
| **Check-in-Dialog** (`assets/js/ui/checkin-dialog.js`) | ja — `CheckinDialog.tsx` | ja | — | `useWellbeing.test.tsx` ✅ |
| **Befinden-Kachel** (`assets/js/ui/wellbeing-card.js`) | **nein** | **nein** | Beide Zweige fehlen: `renderSelf` (Tages-Check-in-Prompt mit „heute gesehen"-Merker) und `renderShared` (Besucher/fremder Coach sieht geteiltes Befinden). `useSharedCheckin` existiert + ist getestet, wird aber von **keiner** Komponente konsumiert | Hook getestet, UI fehlt |
| **Login** (`assets/js/ui/auth-modal.js`) | ja — `LoginPage.tsx` | ja | 11g: auf `GlassCard` gestylt | — |
| **Env-Badge / Nav / Header** | ja — `EnvBadge.tsx`, `Layout.tsx`, `PageShell.tsx` | ja | — | — |
| **GitHub-Client** (`assets/js/ui/github-client.js`) | n/a | n/a | Legacy-Schreibpfad (Befinden via Contents-API), durch Supabase abgelöst — keine Lücke | — |
| **Feedback (Besucher)** | **existiert in keiner der beiden Fassungen** | n/a | Nur Konzeptpapier `docs/phase-6-konzept-besucher-feedback.md`. `AGENTS.md` listet `data-access/supabase/feedback.js` in der Dateistruktur — die Datei gibt es nicht. **Keine Portierungslücke, aber ein Doku-Fehler** | — |
| **`scripts/`-Kopplung** | — | **nein** | **13 Module aus `assets/js/core/` im Importgraph von `generate-data.js`** (s. §5) | — |

---

## 3. Detailbefunde zu den 9 Portierungsposten

**3.1 Intervalltabelle inkl. `derived`-Badge — ✅ vollständig.**
Vanilla: `assets/js/ui/planned.js:1323-1386` (`_renderComplianceTable`), Badge bei `:1346-1348`. React: `app/src/features/planning/ComplianceTable.tsx:60-73`, Kopfkommentar nennt die Vanilla-Zeilen ausdrücklich als Portierungsquelle. Zeilenaufbau (Nr./Dauer/Watt/✓), `fmtMinSec`, Fade-Prozent, `accessory`-Block „➕ Zusatz — zählt nicht in die Ampel oben (L6.1)" und der Tooltip-Text des Badges sind wörtlich identisch. Zusätzlich in React: `ComplianceTable.test.tsx`.

**3.2 Compliance-Ampel — ✅ vollständig.**
Vanilla `assets/js/ui/planned.js:1339-1342` + Regeltexttabelle `COMPLIANCE_RULE_TEXT` ab `:67`. React `ComplianceTable.tsx:6-8` (`RATING_LABEL`/`RATING_ICON`/`RATING_COLOR`) + `complianceRuleText()` aus `app/src/features/planning/planning-view-model.ts`. Die Sichtbarkeitsregel („nur wenn `matchedCardId === card.id` **und** mindestens ein Intervall gematcht") ist als `visibleCompliance()` gekapselt und getestet. Rechenkern `compliance-match.js` ist in beiden Bäumen byteidentisch.

**3.3 Wirkungsanzeige ΔFitness/ΔErmüdung/ΔForm — ✅ vollständig.**
Vanilla: Karte `assets/js/ui/planned.js:356-360` (`_renderCardImpact`), Banner `:334`. React: Karte `app/src/features/planning/PlanCard.tsx:246-248` + `:357-359`, Banner `app/src/features/planning/DeltaBanner.tsx:46-49`. Beide ziehen `cardImpact()`/`dayImpact()` aus dem identischen `core/plan-feedback.js` (Zeilen 80-82 dort). Der Vorher→Nachher-Text des Banners stimmt wörtlich überein. Tests: `DeltaBanner.test.tsx`, `planning-delta.test.ts`.

**3.4 Ruhetag-/Recovery-Karten (Dreiteilung) — ✅ vollständig.**
Alle drei Zweige sind da. *rest*: `isRestDay()` in `app/src/features/planning/planning-view-model.ts:71-73` (Vanilla `assets/js/ui/planned.js:477`), Ausschluss aus `missedSessions` und aus dem Fortschritts-Nenner (`:167`, `:176-178`) wie im Original; Compliance überspringt sie via `app/src/core/compliance-match.js:72`. *recovery*: `isRecoveryType()` `:380` → `RecoveryBlock.tsx` (HRV/Ruhepuls + nächste Belastungseinheit, Port von `assets/js/ui/planned.js:962-1003`). *keine Karte*: `fillRestDays()` in `assets/js/core/plan-rest-days.js` = `app/src/core/plan-rest-days.js`, byteidentisch. Das „Ruhetag gefahren"-Signal (`restDayRiddenSignal`) hängt in React an `PlanCard.tsx:226`. Tests: `RecoveryBlock.test.tsx`, `plan-rest-days.test.js`.

**3.5 Leiterstand-Anzeige und Blockstart-Dialog — ⚠ Leiterstand teilweise, Blockstart vollständig.**
*Blockstart:* `assets/js/ui/block-dialog.js` (186 Z.) → `app/src/features/planning/BlockDialog.tsx` (233 Z.) + `block-dialog-view-model.ts`. Label-Tabellen, die `studienlage`-vor-`coaching-konsens`-Vorauswahl, der In-Memory-Session-Guard (`dismissedKeys`, `BlockDialog.tsx:205-218` ↔ `promptedThisSession`, Vanilla `:59`), das ownsPlan-Gate (`useIsSelfAthlete`) und die Buttons „Übernehmen"/„Später entscheiden" sind alle da; verkabelt in `PlanningPage.tsx:310`.
*Leiterstand:* **hier ist die Lücke.** Vanilla hat eine schreibgeschützte Zeile direkt im Export-Panel — `assets/js/ui/export-panel.js:296-308` (`refreshLadderStateLine()`) füllt `#export-panel-ladder-state` mit `Aktuell: <formats…summary>`. In `app/src/features/planning/ExportPanel.tsx` wird `useLadderState()` zwar geholt (`:139`), aber ausschließlich als Eingabe für das Briefing verwendet (`:253`) und als `useMemo`-Dependency (`:298`) — im JSX (`:383-460`) gibt es **keine** entsprechende Zeile. Der Leiterstand landet also weiterhin im exportierten Markdown (`app/src/core/export-briefing.js:505-513`), ist aber im Panel selbst nicht mehr sichtbar. Kleiner Posten, aber ein echter Sichtbarkeitsverlust.

**3.6 Stufenvorschlag inkl. „eingefroren (Taper)" — ✅ vollständig.**
`buildPresetSuggestionSection()` in `app/src/core/export-briefing.js:527-542`; die Taper-Sonderbehandlung steht wörtlich in `:536`: `s.action === "hold" && s.inTaper ? "eingefroren (Taper)" : …`. Identisch zu `assets/js/core/export-briefing.js:536`. Die `inTaper`-Ermittlung läuft beidseitig über `isInEventTaper()` — Vanilla `assets/js/state/export.js:133`, React `ExportPanel.tsx:216-233`.
Zum Fall **„kein Vorschlag ableitbar"**: diese Formulierung existiert als Zeichenkette in **keinem** der beiden Bäume. Der Mechanismus ist ein *Weglassen* — `if (!presetSuggestions?.length) return []` (`:528`), d. h. ohne aktives Format oder ohne `profiles.ladder_progression_enabled` entfällt der Abschnitt geräuschlos. Da die Funktion in beiden Bäumen identisch ist und React die Liste über `useLadderPresetSuggestion()` genauso befüllt, ist das Verhalten gleich. Getestet: `useLadderState.test.tsx:92` („ohne Freigabe → kein Vorschlag").

**3.7 Leitplanken-Sektion K-RAMPE/K-HARTFOLGE/K-WOCHENTSS/K-TID — ✅ vollständig.**
Beide Trägermodule sind byteidentisch: `assets/js/core/conflicts.js` = `app/src/core/conflicts.js` (Regelcodes bei `:205`, `:213`, `:243`, `:263`, `:291`) und `assets/js/core/guardrails.js` = `app/src/core/guardrails.js`. Die Markdown-Sektion `buildGuardrailsSection()` steht in `app/src/core/export-briefing.js:437-476` (CTL-Rampe inkl. historischer Trefferquote, harte Tage/Woche, kürzester Hart-Abstand, TID vs. Zielkorridor, Wochen-TSS vs. CTL×8-Obergrenze). Befüllt wird sie in `app/src/features/planning/export-briefing-view-model.ts:152-154` — inklusive des Vanilla-Kommentars, dass die Leitplanken bewusst die **volle** Ist-Historie bekommen statt der 4-Wochen-`actuals`. Die vier Codes erscheinen zusätzlich als Konflikt-Chips über `conflictsForCard()` → `HintChip`. Tests: `conflicts.test.js`, `guardrails.test.js`, `export-briefing.test.ts`.

**3.8 Fortschrittsindikatoren im Briefing — ✅ vollständig.**
`assets/js/core/progress-indicators.js` = `app/src/core/progress-indicators.js`, byteidentisch. Verkabelung 1:1: Vanilla `assets/js/state/export.js:153-160` ↔ React `app/src/features/planning/export-briefing-view-model.ts:138-145`, identisches 8-Wochen-Fenster über `PROGRESS_WEEKS`, identische Trennung vom kürzeren `actuals`-Fenster. `export-briefing-view-model.test.ts:101` prüft ausdrücklich, dass `progress` und `guardrails` auch bei leeren Daten befüllt sind. Zusätzlich in React: `progress-indicators.test.js`.

**3.9 Hinweis-Chip mit Tooltip auf den Plankarten — ✅ vollständig, in React sogar robuster.**
Vanilla `assets/js/ui/planned.js:391-410` (`_renderHintChip`) + Modul-State `openHintChip:134` + `_positionHintTooltip`. React `app/src/features/planning/HintChip.tsx`: derselbe „nur ein Tooltip gleichzeitig"-Modul-Store, hier über `useSyncExternalStore` (`:21-47`), dieselbe Viewport-Randkorrektur (`:100-121`), Escape-Handling, `aria-expanded`/`aria-controls`. Beide rufen `summarizeCardHints()` aus dem identischen `core/plan-feedback.js` und rendern „+N weitere". React hat zusätzlich einen per Playwright gefundenen Fix für die `mousedown→focus→click`-Reihenfolge (`:84-90`, `suppressNextFocusOpen`), den Vanilla strukturell nicht brauchte. Eingebunden an zwei Stellen (`PlanCard.tsx:356` und `:461`), getestet in `HintChip.test.tsx`.

---

## 4. Testabdeckungs-Lücken

Beide Suiten laufen aktuell grün: Vanilla **936 Tests / 69 Dateien**, React **1186 Tests / 114 Dateien**.

**60 der 69 Vanilla-Testdateien importieren aus `assets/js/`** und brechen bei einer Löschung. 46 davon haben ein gleichnamiges React-Pendant. Die folgenden 23 haben keines — nach Konsequenz sortiert:

**A) Echter Abdeckungsverlust — diese Kernfunktionen wären danach ungetestet:**
- `tests/features.test.js` — `buildWeekReview` **(0 React-Tests)**, `weeklyConsistency`, `recordProgression` **(0)**, `cadenceCoach` **(0)**, `efficiencyTrend`/`rollingMean`/`isComparableRide`, `eftpHistory`/`forecastFtp`
- `tests/analysis-extensions.test.js` — `overallZoneShares` **(0)**, `distributionShape` **(0)**, `overallBandsFromIF` **(0)**, `decouplingTrend` **(0)**, `describeWeek` **(0)**
- `tests/normalize.test.js` — `normalizeRide`/`normalizeFeel`/`normalizeWellness` **(0 React-Tests)**
- `tests/auth-password.test.js` — `updatePassword`; `PasswordSection.tsx` hat keinen Test
- `tests/chart-visibility.test.js` — Feature in React nicht vorhanden (s. Tabelle)
- `tests/chart-layout.test.js` — `pickLabelIndices`/`fitsLabel` der Vanilla-Chart-Engine; React hat eine eigene Engine mit `chart-scale.test.js`/`week-labels.test.js`, kein direktes Pendant
- `tests/chart-view-state.test.js` — nur teilweise ersetzt durch `explorer-storage.test.ts`/`useExplorerRange`

> Hinweis: `efficiencyTrend` und `weeklyConsistency` tauchen in je einer React-Testdatei auf, aber nur auf Komponentenebene (`EfficiencyChart.test.tsx`, `ConsistencyCalendar.test.tsx`) bzw. im Kommentar — nicht als Unit-Test der reinen Funktion.

**B) Bereits durch ein andersnamiges React-Pendant abgedeckt — gefahrlos löschbar:**
`block-transition` → `useBlockTransition.test.tsx` · `events-athlete-resolution` → `useEvents.test.tsx` · `events-is-test` → `app/src/api/supabase/events.test.ts` · `export-prefs-state` → `useExportPrefs.test.tsx` · `export` → `export-briefing-view-model.test.ts` · `ladder-preset-suggestion` → `useLadderState.test.tsx` · `plan-cards-move` → `usePlanCards.test.tsx` · `proposals` → `useProposals.test.tsx`

**C) Testen `scripts/` — müssen bleiben, `scripts/` wird nicht gelöscht:**
`compliance-derive-fallback` · `coverage` · `interval-blocks` · `map-activity` · `typ-inferenz` · `plan-to-cards-migration` · `power-curve-blocks`
⚠ Fünf davon laufen nur, solange `assets/js/core/` existiert (s. §5).

**D) Sicherheitstest — darf auf keinen Fall mit `tests/` verschwinden:**
`tests/supabase-rls.test.js` importiert **ausschließlich** `scripts/lib/env.js` und spricht direkt gegen Supabase. Er überlebt die Löschung von `assets/js/` technisch unbeschädigt, fiele aber einem pauschalen „Vanilla-Tests unter `tests/` entfernen" (V2 Schritt 2) zum Opfer. In `app/` gibt es **kein** RLS-Äquivalent.

---

## 5. Externe Vanilla-Referenzen

**Blockierend:**

1. **`scripts/` → `assets/js/core/` (13 Module).** Der Fahrplan notiert unter V2 Schritt 3 „Nach bisherigem Stand nein" — **das trifft nicht zu.** Der Importgraph von `scripts/generate-data.js` zieht: `compliance-match.js`, `format.js`, `plan-config.js`, `plan-rest-days.js`, `plan2-schedule.js`, `planning.js`, `powercurve.js`, `progress-indicators.js`, `session-classify.js`, `session-format-match.js`, `stats.js`, `workout-structure-derive.js`, `workout-validator.js`. Betroffene Importeure: `scripts/lib/plan2.js:29,35,36,37`, `scripts/lib/map-activity.js:7,8`, `scripts/lib/compliance.js:42,43,44`, `scripts/lib/plan-to-cards.js:8,9`. Löscht man `assets/js/core/`, brechen `npm run sync` **und** der 6-Stunden-Job in `sync-data.yml` sofort.
   Weitere, nicht im Sync-Pfad: `scripts/add-rest-day-cards.js:33`, `scripts/backtest-ladder.js:60-65`, `scripts/preset-suggestion-check.js:31,32`, `scripts/report-derived-workout-structure.js:38`.
2. **Ein Umbiegen auf `app/src/core/` ist nicht ohne Weiteres möglich.** Verifiziert: 4 der 13 Module (`plan-config`, `compliance-match`, `session-classify`, `session-format-match`) sind unter reinem Node **nicht ladbar** — sie importieren `../sports/cycling/session-types.js`, die Datei heißt aber `session-types.ts`. Das löst nur Vite/Vitest auf, nicht `node`. Ergebnis: `ERR_MODULE_NOT_FOUND`. V1 braucht hier eine Entscheidung (Endungen anpassen, `.js`-Shims, oder die betroffenen Konstanten für `scripts/` duplizieren).

**Unkritisch, aber aufzuräumen:**

3. **`.github/workflows/ci.yml:33`** — `npx --yes eslint@9 assets/js scripts tests`. Lintet `assets/js` mit; nach der Löschung schlägt der Schritt fehl (Pfad existiert nicht).
4. **`package.json` (Wurzel)** — `"lint"` lintet `assets/js`, `"format"` formatiert `"assets/js/**/*.js"`, `"test"` läuft über `"tests/**/*.test.js"` (60 dieser Dateien importieren `assets/js/`).
5. **`eslint.config.js:5`** — eigener Block `files: ["assets/js/**/*.js"]` mit den Browser-Globals; wird gegenstandslos.
6. **`index.html` (Wurzel, 571 Z.)** — `:569` `<script type="module" src="assets/js/app.js">`, `:16-20` die fünf `assets/css/*`-Links. **Wird nicht mehr deployt** (s. u.), ist reine Altlast.
7. **`.github/workflows/sync-data.yml`** — **verweist bereits nirgends mehr auf `assets/`.** `:114-125` baut `app/` (`npm ci && npm run build`), `:125` kopiert `data/` nach `app/dist/data`, `:137` lädt `path: 'app/dist'` hoch. Der Deploy-Umschalt-Schritt aus V2 Punkt 4 ist tatsächlich erledigt.
8. **`.github/workflows/ci-app.yml`** — läuft `on: push: branches: [dashboard-3.0]`. Aktueller Branch ist `main`, und `app/` liegt auf `main`. **Direkte Pushes auf `main` lösen die React-CI also nicht aus**; nur PRs mit `paths: app/**` greifen. Sobald `app/` die einzige Anwendung ist, sollte der Trigger `main` einschließen.

---

## 6. Stand zu 11a–11g

**Die beiden Dokumente widersprechen sich — und der Code gibt dem Konzeptdokument recht.**

- `docs/offene-punkte.md:408-412`: „**11a ✅ umgesetzt (08.08.2026)** … Dabei ein siebtes Häppchen gefunden: **11g** … Offen wie 11b–11f."
- `docs/dashboard-3.0-konzept-react-umbau.md:1365-1371`: 11a–11g **alle** „✅ umgesetzt" (11b/11c am 08./09.08., 11d am 09.08., 11e/11f/11g am 13.08.2026).

**Gegen den Code geprüft — das Konzeptdokument stimmt, `offene-punkte.md` ist veraltet:**

| | Behauptung | Codebefund |
|---|---|---|
| 11a | Pill-Nav + `PageShell` | ✅ `app/src/components/Layout.tsx`, `PageShell.tsx`, auf allen Routen |
| 11b | Fahrtenbuch `/log` | ✅ `LogbookPage.tsx` — `filterRides`/`sortRides` (`:86-87`), Suche (`:80`), Wetter-Hover (`:82`), 📅-Sprung (`:15`) |
| 11c | Hero-Gesamtstatistiken | ✅ `MetricsGrid.tsx`, eingebunden `HeroPage.tsx:19,242` |
| 11d | Analyse-Shell + Belastung + Intensität | ✅ `AnalysisPage.tsx:105-120` (`LoadTable`, `IntensityBand`, `TypDistribution`, `KpiGrid`) |
| 11e | Aerob + Leistungsdiagnostik | ✅ `AnalysisPage.tsx:122-133` (`AerobicCards`, `FtpTriad`, `RecordChips`); `RETEST_DATE` in `config.ts` |
| 11f | Regeneration + Konsistenz + Periodisierung | ✅ `AnalysisPage.tsx:136-161` (`buildBodyCards`, `buildConsistencySummary`, `PeriodizationBlocks`) |
| 11g | Login gestylt | ✅ `LoginPage.tsx:73` `GlassCard`, `:110` `role="alert"` |

Der Vanilla-Analyse-Tab hat acht Sektionen; React hat sieben davon plus KPI-Hero — Sektion 1 (Belastungsempfehlung) sitzt bewusst als `BriefingCard` auf dem Hero, nicht in `AnalysisPage`. Das ist eine Verlagerung, keine Lücke.

**Über 11 hinaus:** Auch die in `offene-punkte.md` gar nicht erwähnte **Etappe 12** (12a–12i, fehlende Charts + Hero-Ergänzungen) ist laut Konzept am 13.08.2026 abgeschlossen — im Code bestätigt durch 20 Chart-Komponenten unter `app/src/charts/` samt Tests, darunter alle von Alex gemeldeten Nachzügler (FTP-Prognose, Effizienz, Entkopplung, Kadenz, Zeit-in-Zonen, Wetter, Schlaf, Energie/Gewicht, Tempo-vs-HF, HF-Trend, Konsistenzkalender).

**Empfehlung:** `docs/offene-punkte.md:408-412` ist der einzige Ort, der noch 11b–11f als offen führt — beim Doku-Aufräumen (Fahrplan 2) korrigieren, nicht als Signal für V1 werten. Der einzige dort korrekt gebliebene offene Punkt ist „alte Vanilla-Dateien noch nicht aus `main` entfernt" — genau das, was dieser Bericht bewertet.

---

## 7. Pfad-Gegenüberstellung

Beide `core/`-Bäume tragen dieselben Dateinamen und sind **nicht** dieselbe Schicht:

| | `assets/js/core/…` (Vanilla) | `app/src/core/…` (React) |
|---|---|---|
| Umfang | 52 Module | 58 Module (dieselben 52 + `brush`, `chart-scale`, `pmc-series`, `weather`, `week-labels`, `wellness-series`) |
| Importiert von | `assets/js/{state,ui}/`, `scripts/`, `tests/` | `app/src/{api,features,charts,sports}/` |
| Schicksal in V2 | wird gelöscht | bleibt unangetastet |
| Byteidentisch | 46 von 52 | — |
| Divergent | 6: `plan-config.js`, `zones.js`, `proposal-payload.js`, `periodization.js`, `efficiency.js`, `export-briefing.js` | — |

**Alle sechs Divergenzen sind React-voraus, keine ist React-zurück.** Fünf davon sind die Etappe-3-Extraktion nach `app/src/sports/cycling/` (Konstanten ausgelagert, unter unverändertem Namen re-exportiert — die Rechenlogik ist gleich geblieben); `proposal-payload.js` hat in React zusätzlich `addProposalArgs()`/`replaceProposalArgs()`; `export-briefing.js:667` unterscheidet sich in genau einem erklärenden Fließtext. Es geht bei einer Löschung von `assets/js/core/` also **keine Logik verloren** — nur die Node-Auflösbarkeit für `scripts/` (§5.2).

`core/projection.js` ist übrigens **byteidentisch** in beiden Bäumen; die im Fahrplan als divergent genannten Dateien decken sich bis auf `plan-config.js` nicht mit dem tatsächlichen Befund.

---

## Abnahme (Fahrplan-1 V0)

- [x] Lückentabelle liegt vor
- [x] Verweisliste aus Punkt 5 vollständig
- [x] Keine Datei wurde verändert

**Entscheidung:** Lücken vorhanden → **V1 wird eingeschoben.**
