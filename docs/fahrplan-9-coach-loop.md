# Fahrplan 9: KI-Coach — Export/Import-Loop in die App holen

**Stand:** 2026-09-06 — Grilling abgeschlossen, Fahrplan geschnitten.
**Zielablage:** `docs/fahrplan-9-coach-loop.md`
**Herkunft:** Backlog-Idee 6 (`planning/ideen-backlog.md`). Letzter Stufe-0-Happen
nach Idee 5 (Erholungs-Ampel) und Idee 10 (Daten-Export). Klein, kein Blocker,
keine laufenden Kosten.

Der „Claude als Trainer"-Loop ist heute komplett manuell: Briefing erzeugen →
Briefing + Prompt-Vorlage von Hand kopieren → zu claude.ai wechseln → einfügen →
Antwort kopieren → zurück → in ein Import-Feld einfügen → Parser macht
`proposals` → normaler Review-Workflow. Fahrplan 9 glättet diese Übergabe zu
einer polierten Copy-Paste-Strecke und legt mit `coach_exchanges` die Historie
an, die später den echten selbst-gehosteten KI-Coach (Idee P) füttert.

Baut auf Phase 4 (Export/Import-Workflow) und Fahrplan 8 (Plan-Generator) auf.
Blockiert keinen anderen Fahrplan.

---

## Ziel

1. **Ein Stufen-Panel im Planungstab** statt zweier getrennter Dialoge
   (`ExportPanel` + `ImportDialog`): 1. Auftrag wählen → 2. Prompt kopieren +
   „In Claude öffnen" → 3. Antwort einfügen → 4. Vorschau → Import.
2. **Ein-Klick-Kopie** des fertig zusammengesetzten Prompts, prominenter
   „In Claude öffnen ↗"-Link mit klarer Reihenfolge (erst kopieren, dann
   öffnen).
3. **Live-Parser-Rückmeldung** beim Einfügen der Antwort (was erkannt, was
   nicht, warum) statt roher Fehlermeldung nach einem „Prüfen"-Klick.
4. **Verlauf jedes Austauschs** — neue Supabase-Tabelle `coach_exchanges`
   (RLS owner + Trainer), unten im Panel als aufklappbare Liste.

---

## Nicht-Ziele

- **Kein Backend, kein API-Zugang.** v1 ist polierter Copy-Paste. Der Athlet
  nutzt sein eigenes Claude-Abo. Ein echter In-App-Coach ist Idee P
  (selbst-gehostetes Modell, eigener Grill).
- **Kein neues Prompt-/Briefing-Design.** `app/src/core/export-briefing.js`,
  `docs/phase-4-prompt-vorlage-claude-trainer.md`,
  `app/src/core/proposal-validator.js` und
  `app/src/core/proposal-import-parser.js` bleiben inhaltlich unverändert.
- **Kein Briefing-Schnappschuss in der Historie.** Aus Fahrten/Befinden/Plan
  jederzeit rekonstruierbar — ein Textblob würde nur die sensiblen Daten
  duplizieren.
- **Kein Coach-Rat im Hero/Tagesüberblick.** Nur die Verlaufsansicht im Panel.
  Eine Hero-Zeile wäre ein eigener Backlog-Happen.
- **Kein „Ausgang" in der Tabelle gespeichert** — er wird beim Laden aus den
  verknüpften `proposals` abgeleitet (sonst driftet er, sobald ein Vorschlag
  später einzeln entschieden wird).

---

## Getroffene Entscheidungen

### Grilling 2026-09-06 (Backlog, C1–C3)

| # | Thema | Entscheidung |
|---|---|---|
| C1 | Aufruf | v1: polierter Copy-Paste. Kein Backend, keine Kosten. |
| C2 | Umfang v1 | Übergabe glätten: Ein-Klick-Kopie, „In Claude öffnen"-Link, Auftragsvarianten als Knöpfe, Einfügefeld mit Live-Parser-Rückmeldung. Plus Verlauf. |
| C3 | Verlauf | Neue Tabelle `coach_exchanges` (RLS owner + Trainer): Datum, Auftragsvariante, rohe Claude-Antwort, Verknüpfung zu erzeugten `proposals`, abgeleiteter Ausgang. Kein Briefing-Schnappschuss. |

### Grilling 2026-09-06 (Fahrplan, Q0–Q10)

| # | Thema | Entscheidung |
|---|---|---|
| Q0 | athlete2-Sonderfall | `readOnly: true` / `isReadOnlyAthlete()` **entfernen** — alle Athleten nach derselben Regel (Self / Trainer / Admin). Bestätigt Fahrplan-8-Entscheidung 1. Eigene Etappe 0 **vor** Idee 6. |
| Q1 | Ort | Bleibt im Planungstab, aber Export- und Import-Dialog werden **ein** Stufen-Panel. Kein neuer Tab. |
| Q2 | Copy-dann-Öffnen | „Prompt kopieren" primär; „In Claude öffnen ↗" erst sekundär, nach dem Kopieren primär + Hinweis „Jetzt in Claude einfügen". Öffnet `https://claude.ai/new` in neuem Tab. |
| Q3 | Gate | Coach-Loop erscheint für **jeden** Athleten, den der eingeloggte User besitzt — inkl. athlete2 (nach Q0). Gate: `useIsSelfAthlete`. |
| Q4 | Hero | Kein Coach-Rat im Hero. Nur Verlaufsansicht im Panel. |
| Q5 | Schema | Spalten unten. `proposal_group_id` (nullable) als Verknüpfung, **kein** `uuid[]`, keine Join-Tabelle. Ausgang abgeleitet. |
| Q6 | Parser-Feedback | Kein neues core-Modul. `parseProposalImport` + `validateImport` bleiben die reinen Funktionen; neues dünnes View-Model in `features/planning/` mappt deren Ausgabe in eine Anzeige-Form. Entprellung 300–400 ms in der Komponente. |
| Q7 | RLS | SELECT = Besitzer + Trainer · INSERT = nur Besitzer selbst · DELETE = nur Besitzer · **kein** UPDATE · **kein** anon-Grant. Trainer nur-lesend. |
| Q8 | Schnitt | 3 Etappen (0 / A / B), je ein Fenster. Dieses Dokument. |
| Q9 | Wann geschrieben | `coach_exchanges`-Zeile beim **„Importieren"-Klick** — eine Zeile pro abgeschlossener Runde, auch bei 0 Vorschlägen. Entwürfe werden nicht persistiert. |
| Q10 | Verlaufsansicht | Abschnitt unten im Panel: letzte ~20, neueste zuerst. Pro Zeile Datum · Auftragsvariante · Ausgang; aufklappbar zur rohen Antwort. Kein Editieren, kein Filter. |

---

## Geteilte Verträge (für jedes Etappen-Fenster als Kontext)

### `coach_exchanges` — Tabelle (Migration 0034)

| Spalte | Typ | Hinweis |
|---|---|---|
| `id` | `uuid` primary key default `gen_random_uuid()` | |
| `athlete_id` | `uuid not null references public.profiles(id) on delete cascade` | wie `proposals.athlete_id` |
| `created_by` | `uuid not null references public.profiles(id) on delete cascade` | beim Selbst-Import = `athlete_id` |
| `preset` | `text not null check (preset in ('general','event','check','reduce','build'))` | Auftragsvariante |
| `raw_response` | `text not null` | Claudes komplette Antwort (Text + JSON-Block) |
| `proposal_group_id` | `uuid` (nullable) | = `proposals.group_id` der erzeugten Runde; `null`, wenn Claude nichts vorschlug |
| `created_at` | `timestamptz not null default now()` | |

Index: `create index coach_exchanges_athlete_created_idx on public.coach_exchanges (athlete_id, created_at desc);`

Kein FK auf `proposals` (die Verknüpfung ist eine Gruppen-ID, kein
Einzel-Fremdschlüssel; `proposals` werden nie gelöscht, nur auf `stale`/
`withdrawn` gesetzt). Kein `updated_at`, kein Trigger — Zeilen sind
unveränderliche Fakten.

### RLS-Policies

```sql
alter table public.coach_exchanges enable row level security;

create policy "coach_exchanges: Besitzer + Trainer lesen"
  on public.coach_exchanges for select to authenticated
  using (athlete_id = auth.uid() or public.is_coach_of(athlete_id));

create policy "coach_exchanges: nur der Athlet selbst legt an"
  on public.coach_exchanges for insert to authenticated
  with check (created_by = auth.uid() and athlete_id = auth.uid());

create policy "coach_exchanges: Besitzer löscht eigene"
  on public.coach_exchanges for delete to authenticated
  using (athlete_id = auth.uid());

grant select, insert, delete on public.coach_exchanges to authenticated;
-- KEIN grant an anon, KEINE update-Policy.
```

Muster: `is_coach_of()` wie `proposals`/`trainer_view_prefs` (0006). Bewusst
**nicht** öffentlich lesbar (anders als `proposals`, 0010) — die rohe
Claude-Antwort ist kein Portfolio-Inhalt und bleibt privat.

### Domänentyp (`app/src/api/types.ts`)

```typescript
export type CoachExchangePreset = "general" | "event" | "check" | "reduce" | "build";

/** Abgeleitet aus den verknüpften proposals beim Laden, nicht gespeichert. */
export type CoachExchangeOutcome = "pending" | "accepted" | "rejected" | "mixed" | "empty";

export interface CoachExchange {
  id: string;
  athleteId: string;
  createdBy: string;
  preset: CoachExchangePreset;
  rawResponse: string;
  proposalGroupId: string | null;
  createdAt: string;
  /** Nur im Hook/View-Model gefüllt (Join auf proposals), nicht im Adapter-Row-Mapping. */
  outcome?: CoachExchangeOutcome;
}
```

### Ausgang-Ableitung

Aus den `proposals` mit `group_id === proposalGroupId`:
- `proposalGroupId === null` → `empty`
- alle `status === "open"` → `pending`
- alle entschiedenen `accepted` → `accepted`
- alle entschiedenen `rejected`/`withdrawn`/`stale` → `rejected`
- gemischt → `mixed`

Reine Funktion, gehört ins View-Model bzw. `core/` mit Test — **nicht** in die
UI-Komponente.

---

## Etappe 0 — athlete2-Sonderfall entfernen (Vor-Commit)

**Ziel:** Kein `readOnly`-Sonderfall mehr. Schreibzugriff entscheidet allein
die Beziehung (Self / Trainer / Admin), für alle drei Athleten gleich. Setzt
Fahrplan-8-Entscheidung 1 endgültig um (dort wurde `readOnly` noch stehen
gelassen, das „Plan bauen" als schmales Gate danebengesetzt).

**Änderungen:**

| Datei | Änderung |
|---|---|
| `app/src/config.ts` | `readOnly?: boolean`-Feld raus (Interface + JSDoc); `readOnly: true` bei athlete2 raus; `isReadOnlyAthlete()` löschen |
| `app/src/config.test.ts` | `isReadOnlyAthlete`-Import + `describe("isReadOnlyAthlete", …)`-Block raus |
| `app/src/features/planning/PlanningPage.tsx` | `isReadOnlyAthlete` aus dem Import; `const editable = canWrite;` (das `&& !isReadOnlyAthlete(...)` fällt weg); Kommentare bei 145–146 / 207–211 anpassen |
| `app/src/api/hooks/useWriteAuthorization.ts` | `useCanCreatePlan`-Kommentar kürzen — der „schmales Gate statt `readOnly`"-Grund ist weg; die Funktion bleibt als semantischer Name (`canCreatePlan === canWrite`) |
| `AGENTS.md` | alle „athlete2 read-only / Vergleichsathlet ohne Schreibpfad"-Aussagen umschreiben: „## Athleten" (Athlet-2-Absatz), „Bei Athlet 2: Planungs-Tab read-only sichtbar …", „## Trainingspläne" (GFNY Bremen „Read-only im Frontend"), „## Bekannte Eigenheiten" (Athlet-2-Planungstab-Absatz), CRED4-/`athlete_sync_config`-Zeilenmodell-Stellen. **Bleibt:** „Athlet-2-Workout-Objekte tragen nur `watts`, kein `pct`" (Daten-Fakt, keine Autorisierung). |

**RLS unverändert** — die Policies waren schon beziehungsbasiert.

**Bruchkante:** athlete2 ist im Frontend editierbar, sobald hc_diZee als er
selbst eingeloggt ist. Von Alex' Login aus ändert sich nichts (weiterhin
kein Schreiben für athlete2 — nicht Self, nicht Trainer).

**Verifikation:**
- `cd app && npm run build` (tsc -b)
- `cd app && npm test` — `config.test.ts` grün ohne den entfernten Block
- Docker-Container (`docker compose -f docker-compose.dev.yml up -d --build frontend`,
  `http://localhost:8080`), Planungstab: als athlete1 eingeloggt, Toggle auf
  athlete2 → weiterhin keine Schreib-Knöpfe (Karten nicht ziehbar, kein
  „Ausfallen", kein Wahoo-Push); Toggle auf athlete1 → Karten editierbar wie
  bisher.

**Commit:** `refactor: drop athlete2 read-only special case, gate writes by relationship only`

---

## Etappe A — Datenschicht (C3)

**Nur ihr Block + „Geteilte Verträge" oben als Kontext.**

**Ziel:** `coach_exchanges` existiert, ist RLS-getestet, noch ungenutzt.

**Änderungen (die 4 Pflichtstellen bei neuer Supabase-Tabelle):**

1. **`supabase/migrations/0034_coach_exchanges.sql`** — Tabelle + RLS + Grants
   + Index exakt wie „Geteilte Verträge". Kopfkommentar + Prüfliste im Stil
   von `0033_hero_tile_order_per_athlete.sql` (`migrate:up` / `migrate:down`
   bewusst leer). Migration 0034 ist die nächste freie Nummer (letzte: 0033).
2. **`app/src/api/supabase/coach-exchanges.ts`** — Adapter, eine Datei je
   Tabelle (s. `app/src/api/README.md`). Row-Mapping `snake_case → camelCase`
   wie `proposals.ts::toProposal`. Funktionen:
   - `listCoachExchanges(athleteId): Promise<Result<{ exchanges: CoachExchange[] }>>`
     — neueste zuerst, RLS lässt Besitzer + Trainer durch. **Ohne** `outcome`
     (der Join passiert im Hook).
   - `insertCoachExchange(athleteId, createdBy, input): Promise<Result<{ exchange: CoachExchange }>>`
     — `input = { preset, rawResponse, proposalGroupId }`.
   - `deleteCoachExchange(id): Promise<Result>` — Besitzer löscht eigene Zeile.
   Result-Konvention nach außen (`{ ok, ... } | { ok:false, error:{code,message} }`),
   `getAuthedClient() ?? supabase` wie `proposals.ts`.
3. **`app/src/api/types.ts`** — `CoachExchange` / `CoachExchangePreset` /
   `CoachExchangeOutcome` wie „Geteilte Verträge".
4. **`tests/supabase-rls.test.js`** (Repo-Root) — neuer Block `coach_exchanges`,
   analog zu den bestehenden Blöcken:
   - Athlet 1 legt eine Zeile für sich an (`created_by` = `athlete_id` = eigene
     uid) ✓ · liest sie ✓
   - Athlet 1 legt eine Zeile mit fremder `athlete_id` an ✗ (WITH-CHECK, 42501)
   - Trainer-ST liest Athlet 1s Zeile ✓ · legt eine Zeile für Athlet 1 an ✗
   - anon liest `coach_exchanges` → leer / kein Zugriff (kein Grant)
   - Athlet 1 löscht die eigene Zeile ✓ · Trainer-ST löscht Athlet 1s Zeile ✗
     (PATCH/DELETE-RLS blendet aus → `data.length` prüfen, nicht `.ok`,
     s. Kopfkommentar der Testdatei)
   - Jede angelegte Zeile in `cleanupTasks` registrieren.

**Bruchkante:** DB + Adapter + Typ + RLS-Test da. Kein UI-Konsument. `npm test`
im Repo-Root grün (RLS-Teil nur mit `.env`-Creds, sonst self-skip).

**Verifikation:**
- `node -c` entfällt (kein Root-JS geändert außer der Testdatei → `node -c tests/supabase-rls.test.js`)
- `cd app && npm run build` (neuer Adapter + Typen kompilieren)
- `cd app && npm test` (Adapter berührt, falls ein Adapter-Test angelegt wird)
- `npm test` (Repo-Root) mit Live-`.env` → neuer RLS-Block grün
- Migration nach dem Merge an **dashboard-dev** und den **apps01-Self-Host-Stack**
  einspielen (AGENTS.md „Migrations-Workflow"). SQL-Prüfliste abarbeiten.

**Commit:** `feat: add coach_exchanges table with owner+trainer RLS`

---

## Etappe B — UI (C2)

**Nur ihr Block + „Geteilte Verträge" oben als Kontext. Setzt Etappe A voraus.**

**Ziel:** Der Copy-Paste-Loop ist ein Stufen-Panel mit Live-Feedback und
Verlauf.

**Änderungen:**

1. **`app/src/api/hooks/useCoachExchanges.ts`** — React-Query-Hook:
   - `useCoachExchanges(athleteId)` — lädt via `listCoachExchanges`, joint pro
     Zeile die `proposals` desselben `group_id` aus dem bereits geladenen
     `qk.proposals(athleteId)`-Cache und setzt `outcome` über die reine
     Ableitungsfunktion. Limit ~20 im Adapter oder Hook.
   - `useCreateCoachExchange(athleteId)` — Mutation auf `insertCoachExchange`,
     `prepend` in den Cache (Muster `usePrependProposals`).
   - `useDeleteCoachExchange(athleteId)` — Mutation auf `deleteCoachExchange`.
2. **`app/src/features/planning/coach-import-view-model.ts`** (+ `.test.ts`) —
   reine Funktion, nimmt den eingefügten Text, ruft `parseProposalImport` +
   `validateImport` (über `usePreviewClaudeImport`s bestehende Logik oder direkt)
   und liefert:
   ```typescript
   {
     parseError: { code: string; message: string } | null,  // "kein JSON-Block" / "beschädigt"
     recognised: number,
     items: Array<{ describe: string; valid: boolean; errors: string[] }>,
   }
   ```
   Plus die Ausgang-Ableitungsfunktion aus „Geteilte Verträge" (hier oder in
   `core/` — mit Test).
3. **`app/src/features/planning/CoachPanel.tsx`** — ersetzt `ExportPanel.tsx` +
   `ImportDialog.tsx` (beide löschen). Ein GlassCard-Overlay mit vier
   Abschnitten:
   - **1. Auftrag** — die 5 Preset-Kacheln aus `ExportPanel` (unverändert
     übernehmen), Zusatzkontext-Feld, Zielevent-Auswahl bei `event`.
   - **2. Prompt** — read-only Textarea mit dem generierten Prompt (Logik aus
     `ExportPanel` 1:1: `buildExportBriefingCtx` + `buildExportText`). Knopf
     „Prompt kopieren" (primär). Nach Klick: „Kopiert ✓", Knopf „In Claude
     öffnen ↗" wird von sekundär auf primär, Hinweistext „Jetzt in Claude
     einfügen (Strg+V)". `window.open("https://claude.ai/new", "_blank", "noopener")`.
   - **3. Antwort** — Textarea + Datei-Upload (aus `ImportDialog` übernehmen).
     `onChange` → entprellt (300–400 ms) das View-Model aus (2) laufen lassen.
   - **3b. Live-Feedback** — statt „Prüfen"-Knopf: unter der Textarea live
     `parseError?.message` **oder** die Item-Liste („✅/❌ op · Beschreibung",
     Fehlergründe als `ul`). „Importieren"-Knopf aktiv, sobald ≥ 1 valider
     Eintrag **oder** eine valide 0-Vorschläge-Antwort (`schema_version`-Hülle
     ok, `proposals: []`).
   - **4. Verlauf** — `useCoachExchanges`-Liste, aufklappbare Zeilen
     (Datum · Preset-Label · Ausgang-Badge → rohe Antwort im Monospace).
     Löschen-Knopf pro Zeile (`useDeleteCoachExchange`).
   - Import-Aktion: `useImportClaudeProposals` (unverändert) **dann**
     `useCreateCoachExchange` mit `{ preset, rawResponse: text, proposalGroupId:
     <groupId der erzeugten Runde oder null> }`. `useImportClaudeProposals` muss
     die `groupId` zurückgeben (heute intern erzeugt — nach außen reichen).
4. **`app/src/features/planning/ExportImportBar.tsx`** → wird zu einem einzigen
   Knopf „Coach" (oder „Claude-Coach"), öffnet `CoachPanel`. Gate bleibt
   `useIsSelfAthlete` (Q3).
5. **`PlanningPage.tsx`** — `ExportImportBar`-Einbindung bleibt, nur der
   Prop-Durchreicher ggf. anpassen.
6. **Tests umziehen:** `export-briefing-view-model.test.ts` bleibt gültig
   (die Funktion wandert nicht). Neue Tests: `coach-import-view-model.test.ts`
   (erkannt/nicht erkannt/parseError, Ausgang-Ableitung).
7. **`docs/phase-4-prompt-vorlage-claude-trainer.md`** — nur ein Verweis-Satz,
   dass das Panel jetzt „Coach" heißt und Export/Import vereint; die Vorlage
   selbst unverändert.

**Bruchkante:** Der volle Loop läuft in einem Panel, jeder Austausch landet in
`coach_exchanges`, der Verlauf ist sichtbar.

**Verifikation:**
- `cd app && npm run build`
- `cd app && npm test` — neue View-Model-Tests grün, `ExportPanel`/`ImportDialog`-
  Tests entfernt/umgezogen
- Docker-Container (`docker compose -f docker-compose.dev.yml up -d --build frontend`,
  `http://localhost:8080`), Planungstab als athlete1: Coach-Panel öffnen,
  Preset wählen, „Prompt kopieren" (→ „Kopiert ✓", zweiter Knopf wird primär),
  „In Claude öffnen" (neuer Tab claude.ai), eine Beispiel-Antwort (Text +
  ```json-Block) einfügen → Live-Feedback zeigt erkannte/nicht erkannte
  Einträge, „Importieren" → `proposals` erscheinen im Review, neue Zeile im
  Verlauf mit Ausgang „offen"; einen Vorschlag annehmen → Verlauf zeigt
  „1 angenommen" bzw. „gemischt".
- `/code-review` auf den Diff (Schichtenregel: Prompt-Zusammenbau + Parser-
  Feedback + Ausgang-Ableitung sind reine Funktionen mit Tests, nicht in der
  Komponente; Adapter nur in `api/supabase/`; Result-Konvention nach außen).

**Commit:** `feat: merge Claude export/import into one Coach panel with live parser feedback and history`

---

## Nach Abschluss

- `planning/ideen-backlog.md` — Idee 6 als erledigt markieren, in den privaten
  `planning`-Repo committen (`cd planning && git add … && git commit -m "docs: …" && git push origin main`).
- Versions-Tag vorschlagen (Minor bei `feat`) nach dem Push, der `app/` +
  `supabase/` ändert — nicht selbst taggen.
- Migration 0034 an dashboard-dev **und** apps01 einspielen (falls in Etappe A
  noch nicht geschehen).
