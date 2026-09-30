-- migrate:up

-- ============================================================
-- Dashboard 2.0 — Migration 0064: meal_plan_entries
-- Einspielen: Supabase SQL-Editor / dbmate, dev-Projekt zuerst (dashboard-dev),
--             danach der apps01-Self-Host-Stack (echte Produktion, s.
--             AGENTS.md "Migrations-Workflow" — NICHT dashboard-prod auf
--             supabase.co).
-- Referenz: planning/fahrplan-23-ernaehrung.md — Etappe E0, Schritt 5, V3
--           Issue #18 (meal_plan_entries migration, plan_cards RLS pattern)
--
-- ZWECK: Meal-Plan-Eintraege verknuepfen einen Athleten, ein Datum und eine
-- Mahlzeit (breakfast/lunch/dinner/snack) mit einem Rezept aus der shared
-- recipe library (public.recipes). Ein Eintrag pro Slot/Tag — der Swap-
-- Mechanismus (E4) ersetzt die recipe_id in der bestehenden Zeile, statt
-- eine neue anzulegen.
--
-- CHECK-CONSTRAINTS:
--   meal_slot in ('breakfast','lunch','dinner','snack') — deckungsgleich mit
--     recipes.meal_type (Array-Elemente), damit App-seitig keine Uebersetzung
--     zwischen meal_type- und meal_plan_entries-Werten noetig ist.
--     Englisch gewaehlt, da das Dashboard auch fuer GitHub-Portfolio sichtbar
--     ist und die Werte international selbsterklaerend sind.
--   servings > 0 (numeric, nicht nullable, default 1)
--
-- UNIQUE-CONSTRAINT: (athlete_id, date, meal_slot)
--   Genau ein Rezept pro Mahlzeit-Slot und Tag. Der Swap-Mechanismus (E4)
--   ersetzt die recipe_id per UPDATE, nicht per Delete+Insert.
--   Gleiches Pattern wie recipe_votes: unique (recipe_id, athlete_id).
--
-- FK on delete restrict (recipes.id):
--   Anders als recipe_votes (cascade, weil Votes nach Recipe-Loeschung
--   bedeutungslos sind). Ein meal_plan_entry bezieht sich auf ein konkretes
--   Rezept — wenn das Rezept geloescht wuerde, waere der Eintrag ein orphan
--   ohne semantisch sinnvollen Fallback. Der Admin muss daher Rezepte vor
--   dem Loeschen aus allen meal_plan_entries entfernen (die App zeigt dann
--   einen "Rezept nicht mehr verfuegbar"-Placeholder).
--   Begruendung Issue #18: "restrict, so assembled days survive; app handles
--   recipe removal explicitly."
--
-- FK on delete cascade (profiles.id):
--   Wenn ein Athlet seinen Account loescht, verschwinden seine
--   meal_plan_entries. Konsistent mit recipe_votes, nutrition_goals u.a.
--
-- RLS — wie plan_cards (Migration 0001, exakt kopiert fuer diesen Zweck):
--   SELECT: alle eingeloggten Athleten sichtbar (viewer read, "all logged-in
--     athletes") using (true). Kein anon-Zugriff (anders als plan_cards).
--   INSERT/UPDATE/DELETE (FOR ALL): athlete_id = auth.uid() OR
--     public.is_coach_of(athlete_id) — der DB-seitige Equivalent zu
--     canWriteForAthlete() aus app/src/api/write-authorization.ts (coach/
--     write-authorized users duerfen fuer andere Athleten schreiben).
--     Genau wie die originale plan_cards-Policy aus 0001 (vor 0011s Trainer-
--     Einschraenkung auf UPDATE-only), weil der Fahrplan fuer meal_plan_entries
--     dieselbe FOR-ALL-Erlaubnis vorsieht.
--
-- KEIN FK auf date o.ae. — date ist ein nativer SQL-Datentyp, kein Wert aus
--   einer anderen Tabelle.
--
-- EDGE CASES (Issue #18):
--   Gleiches Rezept in zwei verschiedenen Slots/Tagen -> erlaubt (kein
--     Constraint dagegen, unique deckt nur athlete_id+date+meal_slot ab).
--   Datum in der Zukunft (bis zu 7 Tage, E5) -> DB erlaubt; die 7-Tage-Grenze
--     ist eine App-Layer-Regel, KEIN DB-Constraint.
--   Eintrag fuer pending recipe -> DB erlaubt; App-Pool-Regeln entscheiden,
--     ob es ausgewaehlt werden darf (nicht Thema dieses Issues).
--   Datum in der Vergangenheit -> DB erlaubt (Retention/Cleanup ist out of scope).
-- ============================================================

create table if not exists public.meal_plan_entries (
  id                uuid primary key default gen_random_uuid(),
  athlete_id        uuid not null references public.profiles(id) on delete cascade,
  date              date not null,
  meal_slot         text not null check (meal_slot in ('breakfast','lunch','dinner','snack')),
  recipe_id         uuid not null references public.recipes(id) on delete restrict,
  servings          numeric not null default 1 check (servings > 0),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  -- Genau ein Rezept pro Mahlzeit-Slot und Tag
  constraint meal_plan_entries_unique_slot unique (athlete_id, date, meal_slot)
);

comment on table public.meal_plan_entries is
  'Meal-Plan-Eintraege: ein Rezept pro (athlete_id, date, meal_slot). '
  'FK recipes(id) on delete restrict — Admin muss Rezepte vor dem Loeschen '
  'aus allen meal_plan_entries entfernen. '
  'servings > 0. '
  'RLS wie plan_cards (0001): viewer read + owner/coach write. '
  'meal_slot-Werte: breakfast, lunch, dinner, snack (deckungsgleich mit '
  'recipes.meal_type).';

-- Index: alle Eintraege eines Athleten (Dashboard-Ansicht, Wochenplan)
create index if not exists meal_plan_entries_athlete_date_idx
  on public.meal_plan_entries (athlete_id, date desc);

-- Index: lookup welche Rezepte in welchen Eintraegen verwendet werden
-- (Hilfreich fuer Admin bei Recipe-Cleanup, der vor dem Loeschen alle
--  meal_plan_entries durchgehen muss — ON DELETE RESTRICT).
create index if not exists meal_plan_entries_recipe_idx
  on public.meal_plan_entries (recipe_id);

-- RLS aktivieren
alter table public.meal_plan_entries enable row level security;

-- Policies (plan_cards-Pattern aus 0001, exakt kopiert fuer diesen Zweck)

drop policy if exists "meal_plan_entries_select_viewer" on public.meal_plan_entries;
create policy "meal_plan_entries_select_viewer"
  on public.meal_plan_entries for select to authenticated
  using (true);  -- Alle eingeloggten Athleten sehen alle meal_plan_entries (viewer read)

drop policy if exists "meal_plan_entries_write_owner_coach" on public.meal_plan_entries;
create policy "meal_plan_entries_write_owner_coach"
  on public.meal_plan_entries for all to authenticated
  using (athlete_id = auth.uid() or public.is_coach_of(athlete_id))
  with check (athlete_id = auth.uid() or public.is_coach_of(athlete_id));

-- updated_at trigger (wiederverwendet set_updated_at() aus 0003_wellbeing.sql)
drop trigger if exists meal_plan_entries_set_updated_at on public.meal_plan_entries;
create trigger meal_plan_entries_set_updated_at
  before update on public.meal_plan_entries
  for each row execute function public.set_updated_at();

-- Grants
-- SELECT: nur authenticated (viewer read — kein anon, anders als plan_cards)
grant select on public.meal_plan_entries to authenticated;
-- FOR ALL authenticated (RLS schraenkt via owner/coach-Policy ein)
grant insert, update, delete on public.meal_plan_entries to authenticated;
-- Service-Role: volle Kontrolle fuer Sync-/Datenpflege
grant all on public.meal_plan_entries to service_role;

-- ============================================================
-- PRUeFLISTE (dev, dann apps01):
-- Spalten:  select id, athlete_id, date, meal_slot, recipe_id, servings,
--             created_at, updated_at from meal_plan_entries limit 1;
--             -> Tabelle leer, Schema da
-- Index:    \d meal_plan_entries -> meal_plan_entries_athlete_date_idx
--             on (athlete_id, date DESC);
--           \d meal_plan_entries -> meal_plan_entries_recipe_idx on (recipe_id)
-- UNIQUE:   insert into meal_plan_entries (athlete_id, date, meal_slot,
--             recipe_id, servings) values
--             ('<uuid>', '2026-10-01', 'breakfast',
--              (select id from recipes limit 1), 1);
--             -> OK
--           Wiederholung mit gleichem athlete_id, date, meal_slot
--             -> 23505 (unique violation)
-- CHECK:    insert into meal_plan_entries (athlete_id, date, meal_slot,
--             recipe_id, servings) values
--             ('<uuid>', '2026-10-01', 'fruehstueck',
--              (select id from recipes limit 1), 1);
--             -> 23514 (check constraint "meal_plan_entries_meal_slot_check")
--           insert into meal_plan_entries (athlete_id, date, meal_slot,
--             recipe_id, servings) values
--             ('<uuid>', '2026-10-01', 'breakfast',
--              (select id from recipes limit 1), 0);
--             -> 23514 (check servings > 0)
-- FK:       delete from recipes where id = '<recipe-used-in-entry>';
--             -> 23503 (foreign key violation, on delete restrict)
-- DEFAULT:  insert into meal_plan_entries (athlete_id, date, meal_slot,
--             recipe_id) values ('<uuid>', '2026-10-01', 'breakfast',
--             (select id from recipes limit 1));
--             -> OK, servings = 1 (default)
-- als anon: meal_plan_entries lesen -> 42501 (kein SELECT-Grant fuer anon)
--           meal_plan_entries schreiben -> 42501 (kein GRANT)
-- als Athlet A: eigene entry anlegen ✓ (athlete_id = auth.uid()),
--               entry von Athlet B lesen ✓ (viewer read),
--               entry von Athlet B aendern ✗ (RLS: athlete_id != auth.uid())
-- als Coach von A: entry fuer Athlet A anlegen ✓ (is_coach_of),
--                  entry fuer Athlet A aendern ✓ (is_coach_of),
--                  entry eines Athleten, den er nicht coached ✗
-- Datum:    Zukunft (z.B. +30 Tage) -> OK (kein Check auf date range)
--           Vergangenheit -> OK
-- pending recipe: recipe_id verweist auf pending recipe -> OK (kein DB-Verbot)
-- Gleiches recipe in zwei verschiedenen Slots -> OK
-- ============================================================

-- migrate:down
-- Bewusst leer: dieses Projekt rollt Migrationen nie automatisiert zurueck
-- (s. AGENTS.md, Migrations-Workflow). dbmate verlangt den Marker trotzdem.