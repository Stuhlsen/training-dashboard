# Fahrplan 11 — Kadenz-Ziel pro Athlet (Settings)

**Anlass:** Athlet 4 (Einsteiger, fährt in Zwift) bekommt in Zwift `90 RPM`
vorgeschlagen. Ursache: `legacyDescription()` in `app/src/api/intervals/push.ts`
schreibt fest `85 / 90 / 80 rpm` in den Workout-Text, der zu intervals.icu geht;
von dort holt Athlet 4 das Workout in Zwift. Die `90` ist Athlet 1s Ziel. Ein
Einsteiger tritt aber runder bei ~75–80 RPM.

**Ziel:** Jeder Athlet trägt in den Settings sein Intervall-Kadenz-Ziel `T` ein.
`T` wirkt im Push-Text, in der `.zwo`-Datei, im Kadenz-Chart und in der
Fahrten-Detailansicht. Fallback bleibt `90`, wenn nichts hinterlegt ist —
Bestandsathleten ändern sich nicht.

Ergebnis aus `/grill` (Runde 1–3):

| Frage | Entscheidung |
|---|---|
| Umfang | Voll: pro Athlet, selbst-editierbar in Settings, in Supabase |
| Ein Wert oder drei | **Ein Feld** (`T`). Warmup = `T−5`, Pause/Cooldown = `T−10` (= heutiger Abstand 90/85/80) |
| Consumer | Push-Text · `.zwo` · Kadenz-Chart · Analyse-Tab · Fahrten-Detail „Geplant→Ist" |
| `.zwo` | bekommt neu `Cadence`-Attribute (hatte bisher gar keine) |
| Default wenn leer | `90` (Konstante `CADENCE_TARGET_RPM` bleibt Fallback) |
| Lese-Rechte | nur der Athlet selbst (session-gebunden, wie intervals-Key/Standort). Trainer-Ansicht zeigt weiter kein Ziel |
| Speicherort | neue Spalte `interval_cadence_target` in `athlete_sync_config` |
| Settings-Ort | neuer Abschnitt „Trainings-Ziele" in der bestehenden „Training"-Karte, neben `GoalsSection` |
| Erlaubter Bereich | 60–120 RPM |
| Sync (`scripts/`) | **unberührt** — braucht den Wert nicht. Kein neues `rides.json`-Feld, „3-Pflichtstellen"-Regel greift nicht |

## Eine Etappe, ein Fenster

### A — Infrastruktur

1. **Migration `supabase/migrations/0036_athlete_sync_config_cadence_target.sql`**:
   ```sql
   alter table public.athlete_sync_config
     add column if not exists interval_cadence_target smallint
       check (interval_cadence_target is null
              or interval_cadence_target between 60 and 120);
   ```
   Die Owner-only-RLS aus 0023 deckt die neue Spalte ab; 0023 hat
   authenticated bereits einen **tabellen-weiten** UPDATE-Grant gegeben, ein
   spalten-restriktiver Grant wäre hier also ein No-op (anders als 0026 auf
   `profiles`). Der `grant update (interval_cadence_target) … to authenticated`
   bleibt trotzdem als Absichtsdoku drin. Kein `service_role`-Grant nötig (der
   Sync liest die Spalte nicht). Kein `anon`-Grant. `migrate:down` bewusst
   leer (Projekt-Konvention).
   **Einspielen macht Alex** (dev, dann apps01) — hier nur die Datei.
   Prüfliste im Datei-Kopf wie bei 0023/0026.

2. **Adapter** `app/src/api/supabase/athlete-sync-config.ts`: `getCadenceTarget(userId)`
   / `updateCadenceTarget(userId, value|null)` ergänzen — gleiches Upsert-Muster
   wie `updateSyncLocation` (`onConflict: "profile_id"`, fasst nur die eine
   Spalte an). `Result`-Konvention.

3. **`app/src/api/keys.ts`**: `cadenceTarget: (userId) => ["cadence-target", userId]`.

4. **`app/src/api/types.ts`**: kein neuer Struktur-Typ nötig (schlichte
   `number | null`), nur ggf. ein Alias-Kommentar.

5. **Hook** `app/src/api/hooks/useCadenceTarget.ts` nach Muster `useSyncLocation.ts`
   (session-gebunden über `useAuthUserId`, `staleTime: 5min`, Update-Mutation
   mit explizitem `Result`). Rückgabe `{ target: number, isLoading, update, isPending }`
   — `target` fällt auf `CADENCE_TARGET_RPM` zurück, wenn nichts hinterlegt ist.

6. **Settings-Abschnitt** `app/src/features/settings/TrainingTargetsSection.tsx`
   nach Muster `SyncLocationSection.tsx` (ein `type="number"`-Feld, `min={60}`
   `max={120}`, Hydrate-once, `SavedCheck`, `ERROR_STYLE`). Leeres Feld +
   Speichern → `null` (zurück auf Default 90). In `SettingsPage.tsx` in die
   `#sec-training`-Karte einhängen, direkt nach `<GoalsSection />`.

### B — Wirkung (alle Consumer: neuer optionaler Parameter
`cadenceTarget = CADENCE_TARGET_RPM`, damit Bestands-Aufrufer/Tests grün bleiben;
den echten Wert reicht nur die Komponente mit Session-Kontext durch, und nur
wenn der eingeloggte User dieser Athlet ist — sonst Default)

7. **`app/src/api/intervals/push.ts`**: `legacyDescription(w, details, cadenceTarget)`
   — `${cadenceTarget}rpm` / `${cadenceTarget - 5}rpm` (Warmup) /
   `${cadenceTarget - 10}rpm` (Pause + Cooldown). `pushCardWorkout(card, token,
   athleteId, cadenceTarget)`. `blockDescription` (Freitext-Blöcke) bleibt
   unangetastet — dort steht keine rpm-Zahl.

8. **`app/src/api/hooks/usePlanCards.ts`** (`usePushPlanCard`): `useCadenceTarget()`
   aufrufen, `target` in `pushCardWorkout(...)` durchreichen. `onPush`-Signatur
   bleibt unverändert (der Wert kommt aus dem Hook, nicht vom Aufrufer).

9. **`app/src/core/zwo-export.js`**: `buildZwoWorkout(card, cadenceTarget = 90)`.
   `Cadence="T"` auf der Intervall-`<SteadyState>`/`<IntervalsT OnPower>`,
   `CadenceResting="T-10"` auf `IntervalsT`, `Cadence="T-5"` auf dem Warmup-
   `<SteadyState>`, `Cadence="T-10"` auf `<Cooldown>`. `canExportZwo` unverändert.
   Kopfkommentar um die Kadenz-Herkunft ergänzen.

10. **`app/src/features/planning/WeekGridDetailRow.tsx`**: `useCadenceTarget()`,
    `buildZwoWorkout(card, target)`. (Push läuft über `onPush` → Punkt 8.)

11. **`app/src/features/analysis/analysis-view-model.ts`**: `buildAnalysisKpis(...)`
    und `buildAerobicCards(...)` bekommen `cadenceTarget`-Param, ersetzen die
    beiden `CADENCE_TARGET_RPM`-Literale (KPI-Sub „Ziel: X+ RPM", Karte
    „Kadenz-Ökonomie"). `AnalysisPage.tsx` reicht `isSelf ? target : CADENCE_TARGET_RPM`
    durch (`useCadenceTarget()` + `useIsSelfAthlete(activeAthleteId)` sind dort
    schon bzw. leicht ergänzt).

12. **`app/src/features/analysis/answers-view-model.ts`**: `cadenceTarget` in den
    `AnswersViewModelInput` aufnehmen, das Modul-Literal `CADENCE_TARGET` daraus
    speisen (3 Nutzungen: `cadenceSharePct`, `blockerVerdict`, Kadenz-Trace-Lane).
    `AnalysisPage.tsx` füllt das Input-Feld.

13. **`app/src/features/planning/planning-view-model.ts`** (`buildDoneCompareRows`):
    optionaler `cadenceTarget`-Param, `const target = isZ2 ? cadenceTarget - 10 :
    cadenceTarget - 5;` statt `80 : 85`. Durchreichen über
    `done-table-view-model.ts` + `DoneCompareBlock.tsx` (beide aus `PlanningPage`
    erreichbar → `useCadenceTarget()` gated per `isSelfAthlete`).

14. **`app/src/charts/CadenceChart.tsx`**: `target`-Prop (Default
    `CADENCE_TARGET_RPM`) statt der importierten Konstante an den 4 Stellen.
    (Komponente ist derzeit nicht eingebunden — Änderung nur für Konsistenz.)

### C — Tests

- `app/src/core/zwo-export.test.js`: neuer Fall — `Cadence`-Attribute bei
  gesetztem `cadenceTarget`, Default 90 ohne Param.
- `app/src/api/intervals/push.test.ts` (falls vorhanden, sonst neu): rpm-Zeilen
  folgen `T / T−5 / T−10`.
- `TrainingTargetsSection` / `useCadenceTarget`: Validierung 60–120, leeres Feld
  → `null`.
- Bestehende `analysis-view-model` / `answers-view-model` / `planning-view-model`
  / `CadenceChart` Tests: laufen durch den Default-Parameter unverändert grün;
  je ein gezielter neuer Fall mit abweichendem `cadenceTarget`.

### Verifikation vor Commit-Vorschlag

`node -c` (geänderte `.js`) → `npm test` (Root, unberührt) → `cd app && npm run
lint && npm run build && npm test` → `/code-review` auf den Diff → UI-Check
gegen den lokalen Docker-Container (`docker compose -f docker-compose.dev.yml up
-d`, `http://localhost:8080`): Settings-Feld speichern, `.zwo` einer Athlet-4-
Intervallkarte herunterladen und `Cadence` prüfen.

**Migration einspielen (dev + apps01) bleibt Alex' manueller Schritt.**
