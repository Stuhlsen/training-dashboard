-- migrate:up

-- ============================================================
-- Dashboard 2.0 -- Migration 0062: recipe_votes
-- Einspielen: Supabase SQL-Editor / dbmate, dev-Projekt zuerst (dashboard-dev),
--             danach der apps01-Self-Host-Stack (echte Produktion, s.
--             AGENTS.md "Migrations-Workflow" -- NICHT dashboard-prod auf
--             supabase.co).
-- Referenz: planning/fahrplan-23-ernaehrung.md -- Etappe E0, E15, V3
--
-- ZWECK: Community-Voting auf Recipes (up/down). Ein Vote pro
-- Athlet+Recipe -- ein geaenderter Vote = UPDATE der eigenen Zeile,
-- kein zweiter Insert (unique constraint (recipe_id, athlete_id)).
--
-- FK on delete cascade:
--   recipe_id -> recipes(id): Wenn ein Rezept geloescht wird, sind
--     dessen Votes bedeutungslos. Cascade ist sauberer als Restrict
--     (keine orphans, kein manuelles cleanup noetig).
--   athlete_id -> profiles(id): Wenn ein Athlet seinen Account loescht,
--     verschwinden seine Votes. Konsistent mit nutrition_goals (0061).
--
-- RLS (V3): reine Meinungsaeusserung (E15), kein Approval-Effekt.
--   SELECT: alle authenticated (Admin-Review + Community-Ansicht)
--   INSERT: nur eigener Vote (athlete_id = auth.uid())
--   UPDATE: nur eigener Vote (athlete_id = auth.uid())
--   DELETE: KEINE Policy -- Fahrplan E0 sagt nur "einfuegen/aendern",
--     kein Loeschen. Ein Athlet kann seinen Vote jederzeit via UPDATE
--     aendern (up->down, down->up), aber nicht entfernen.
--     Begruendung: der Vote-Status ist immer "aktuelle Meinung";
--     wer sich aus der Bewertung zurueckziehen will, kann auf den
--     gegenteiligen Vote aendern (kein "enthaltung"-Wert noetig).
--     Absichtliche Nicht-Gewaehrung: Admin kann bei Bedarf per
--     Service-Role loeschen (z. B. bei Spam).
--   anon: nichts.
--
-- Edge Cases (DB-Ebene):
--   empty-string comment vs NULL: DB akzeptiert beides, App
--     normalisiert empty string -> NULL. Kein CHECK, der empty strings
--     blockiert -- die App-Schicht ist der richtige Ort fuer diese
--     Normalisierung.
--   Vote auf pending/rejected recipes: DB erlaubt es (kein FK-Join-
--     Enforce). Die Sichtbarkeit von Votes folgt der Recipe-Sichtbarkeit
--     via App-Layer.
-- ============================================================

create table if not exists public.recipe_votes (
  id                uuid primary key default gen_random_uuid(),
  recipe_id         uuid not null references public.recipes(id) on delete cascade,
  athlete_id        uuid not null references public.profiles(id) on delete cascade,
  vote              text not null check (vote in ('up', 'down')),
  comment           text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  -- Ein Vote pro Athlet+Recipe: geaenderter Vote = UPDATE, kein zweiter Insert
  constraint recipe_votes_unique_vote unique (recipe_id, athlete_id)
);

comment on table public.recipe_votes is
  'Community-Votes auf Recipes (up/down). '
  'Ein Vote pro (athlete_id, recipe_id) -- unique constraint, '
  'geaenderte Meinung = UPDATE derselben Zeile. '
  'comment: empty string wird von der App zu NULL normalisiert. '
  'FK cascade beidseitig. '
  'Kein DELETE-Grant/Policy fuer authenticated (V3).';

-- Index: Votes eines bestimmten Athleten (Admin-Review, Profile-Ansicht)
-- Der unique-Constraint (recipe_id, athlete_id) deckt per leftmost-prefix bereits
-- "alle Votes fuer ein Recipe" und "Vote eines Athleten zu einem Recipe" ab.
-- Ein athlete_id-Only Index ergaenzt die noch fehlende Coverage "alle Votes
-- eines Athleten", ohne Redundanz.
create index if not exists recipe_votes_athlete_idx on public.recipe_votes (athlete_id);

alter table public.recipe_votes enable row level security;

-- Policies

drop policy if exists "recipe_votes_select_all" on public.recipe_votes;
create policy "recipe_votes_select_all"
  on public.recipe_votes for select to authenticated
  using (true);  -- Alle eingeloggten Athleten sehen alle Votes (V3 / E15)

drop policy if exists "recipe_votes_insert_own" on public.recipe_votes;
create policy "recipe_votes_insert_own"
  on public.recipe_votes for insert to authenticated
  with check (athlete_id = auth.uid());

drop policy if exists "recipe_votes_update_own" on public.recipe_votes;
create policy "recipe_votes_update_own"
  on public.recipe_votes for update to authenticated
  using (athlete_id = auth.uid())
  with check (athlete_id = auth.uid());

-- DELETE bewusst nicht granted (Fahrplan E0: "einfuegen/aendern" only)
-- Athleten koennen ihren Vote nicht loeschen, nur per UPDATE aendern.
-- Service-Role kann bei Bedarf per RLS-Bypass loeschen (Admin).

-- updated_at trigger (wiederverwendet set_updated_at() aus 0003_wellbeing.sql)
drop trigger if exists recipe_votes_set_updated_at on public.recipe_votes;
create trigger recipe_votes_set_updated_at
  before update on public.recipe_votes
  for each row execute function public.set_updated_at();

-- Grants
grant select, insert, update on public.recipe_votes to authenticated;
grant all on public.recipe_votes to service_role;

-- PRIVACY REVIEW NEEDED (Finding 1, issue #17): recipe_votes.comment ist
-- freier Text, verfasst vom Athleten, und ueber die SELECT-Policy
-- (using(true)) fuer ALLE eingeloggten Athleten lesbar — breitere
-- Exposure als nutrition_goals (owner-only). Auch wenn der Vote selbst
-- nur 'up'/'down' ist (niedrige Sensitivitaet), ist comment potenziell
-- personenbezogen. Human sign-off bei Merge.

-- migrate:down
-- Bewusst leer: dieses Projekt rollt Migrationen nie automatisiert zurueck
-- (s. AGENTS.md, Migrations-Workflow). dbmate verlangt den Marker trotzdem.