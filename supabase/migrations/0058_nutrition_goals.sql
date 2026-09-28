-- migrate:up

-- ============================================================
-- Dashboard 2.0 — Migration 0058: nutrition_goals
-- (Ernährungsziele, append-only je Athlet)
-- Einspielen: Supabase SQL-Editor / dbmate, dev-Projekt zuerst (dashboard-dev),
--             danach der apps01-Self-Host-Stack (echte Produktion, s.
--             AGENTS.md "Migrations-Workflow" — NICHT dashboard-prod auf
--             supabase.co).
-- Referenz: planning/fahrplan-23-ernaehrung.md (E0, Idee 4)
--
-- Tabelle nutrition_goals:
--   id                 uuid primary key default gen_random_uuid()
--   profile_id         uuid not null references public.profiles(id)
--                        on delete cascade
--   goal_type          text not null check (goal_type in ('lose', 'gain',
--                        'maintain'))
--                        'lose' = abnehmen, 'gain' = aufbauen,
--                        'maintain' = halten (englisch gewählt, da das
--                        Dashboard auch für GitHub-Portfolio sichtbar ist
--                        und englische Enum-Werte international
--                        selbsterklärend sind)
--   target_weight_kg   numeric — nullable, Zielgewicht
--                        check (target_weight_kg > 0)
--   pace_per_week_kg   numeric — nullable, Tempo (z. B. -0.5 kg/Woche)
--                        Wird für 'lose'/'gain' von der App-Schicht
--                        erwartet, ist auf DB-Ebene NULL-erlaubt, damit
--                        'maintain'-Zeilen ohne pace angelegt werden
--                        können (für 'lose'/'gain' prüft die App).
--   target_date        date — nullable, optionales Zieldatum
--   created_at         timestamptz not null default now()
--
-- WICHTIG — Append-Only:
--   Es gibt KEINE unique-Einschränkung auf profile_id: ein Athlet kann
--   mehrere Zeilen anlegen, jede ist ein neuer Ziel-Set. Die aktuell
--   gültige Zeile ist die mit dem neuesten created_at (Consumer
--   sortieren selbst; es gibt keinen expliziten "active"-Marker).
--   Historische Zeilen bleiben abfragbar.
--   Bewusst KEIN updated_at / set_updated_at-Trigger: Zeilen sind
--   unveränderliche Fakten — ein neues Ziel = neue Zeile.
--
-- RLS (owner-only, Vorbild bikes/0047 + shoes, aber strikter:
--   kein Coach-/Admin-Override — Ziele sind privat pro Athlet per
--   fahrplan-23-ernaehrung.md E0):
--   SELECT: nur eigener Athlet (profile_id = auth.uid())
--   INSERT: nur eigener Athlet
--   UPDATE: nur eigener Athlet
--   DELETE: nur eigener Athlet
--   anon (unauthenticated) bekommt nichts.
-- ============================================================

create table if not exists public.nutrition_goals (
  id                uuid primary key default gen_random_uuid(),
  profile_id        uuid not null references public.profiles(id) on delete cascade,
  goal_type         text not null check (goal_type in ('lose', 'gain', 'maintain')),
  target_weight_kg  numeric check (target_weight_kg > 0),
  pace_per_week_kg  numeric,  -- nullable; App-Schicht erwartet pace für 'lose'/'gain'
  target_date       date,
  created_at        timestamptz not null default now()
);

comment on table public.nutrition_goals is
  'Append-only Ernährungsziele je Athlet. Mehrere Zeilen pro profile_id erlaubt — neueste created_at = aktives Ziel. Kein updated_at (append-only). Pace erforderlich für lose/gain (App-Schicht). Owner-only RLS, kein Coach-/Admin-Override.';

-- Index für "neuestes Ziel pro Athlet" + generelle Filter-Performance
create index if not exists nutrition_goals_profile_created_idx
  on public.nutrition_goals (profile_id, created_at desc);

-- RLS aktivieren
alter table public.nutrition_goals enable row level security;

-- Policies (strikt owner-only – keine is_coach_of/is_admin-Wege, anders als bikes/0047)

drop policy if exists "nutrition_goals_select_owner" on public.nutrition_goals;
create policy "nutrition_goals_select_owner"
  on public.nutrition_goals for select to authenticated
  using (profile_id = auth.uid());

drop policy if exists "nutrition_goals_insert_owner" on public.nutrition_goals;
create policy "nutrition_goals_insert_owner"
  on public.nutrition_goals for insert to authenticated
  with check (profile_id = auth.uid());

drop policy if exists "nutrition_goals_update_owner" on public.nutrition_goals;
create policy "nutrition_goals_update_owner"
  on public.nutrition_goals for update to authenticated
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

drop policy if exists "nutrition_goals_delete_owner" on public.nutrition_goals;
create policy "nutrition_goals_delete_owner"
  on public.nutrition_goals for delete to authenticated
  using (profile_id = auth.uid());

-- Grants (Vorbild bikes/0047: nur authenticated + service_role, kein anon)
grant select, insert, update, delete on public.nutrition_goals to authenticated;
grant select, insert, update, delete on public.nutrition_goals to service_role;

-- ============================================================
-- PRÜFLISTE (dev, dann apps01):
-- Spalten:  select profile_id, goal_type, target_weight_kg, pace_per_week_kg,
--             target_date, created_at from nutrition_goals limit 1;
--             -> Tabelle leer, läuft (Schema da)
-- Index:    \d nutrition_goals -> nutrition_goals_profile_created_idx
--             auf (profile_id, created_at DESC)
-- CHECK:    insert into nutrition_goals (profile_id, goal_type, target_weight_kg,
--             pace_per_week_kg) values ('<eigene-uuid>', 'xxx', 70, -.5);
--             -> 23514 (check constraint "nutrition_goals_goal_type_check")
--           insert into nutrition_goals (profile_id, goal_type) values
--             ('<eigene-uuid>', 'maintain'); -> OK (minimal row)
--           insert into nutrition_goals (profile_id, goal_type,
--             pace_per_week_kg) values ('<eigene-uuid>', 'maintain', -.5);
--             -> OK (pace mit maintain ist NULL-erlaubt)
--           insert into nutrition_goals (profile_id, goal_type,
--             target_weight_kg) values ('<eigene-uuid>', 'maintain', -1);
--             -> 23514 (check target_weight_kg > 0)
-- als anon:   nutrition_goals lesen / schreiben -> 42501 (kein GRANT)
-- als Athlet A:  eigene Zeile anlegen ✓, eigene lesen ✓,
--                eigene aktualisieren ✓, eigene löschen ✓
-- als Athlet B:  Zeilen von Athlet A lesen -> 0 Treffer (RLS-unsichtbar)
--                für Athlet A einfügen -> 42501 (WITH CHECK)
--                Zeilen von Athlet A aktualisieren -> 0 Treffer
--                Zeilen von Athlet A löschen -> 0 Treffer
-- ============================================================

-- migrate:down
-- Bewusst leer: dieses Projekt rollt Migrationen nie automatisiert zurueck
-- (s. AGENTS.md, Migrations-Workflow). dbmate verlangt den Marker trotzdem.
