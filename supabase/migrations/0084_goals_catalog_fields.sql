-- migrate:up

-- Fahrplan 43 E1 (V1 + Z8): Ziel-Katalog an goals.
--
-- Neu: goal_key (Katalogschlüssel) und role (main|side), beide nullable, damit
-- Altzeilen mit Freitext-kind gültig bleiben. kind bleibt unverändert —
-- core/ftp-goal.js::pickFtpGoal() und scripts/lib/goals.js lesen weiter kind.
-- Je Athlet höchstens ein AKTIVES main und ein AKTIVES side (partielle
-- Unique-Indizes; deaktivierte Ziele zählen nicht).
-- Z8: Schreibrecht auf goals nur noch für den Athleten selbst. Trainer lesen
-- weiter (Select-Policy 0001 ist öffentlich), Vorschläge laufen über proposals.

alter table public.goals
  add column goal_key text,
  add column role text;

alter table public.goals
  add constraint goals_goal_key_check check (
    goal_key is null or goal_key in (
      'ausdauer', 'ftp', 'fett_verlieren', 'bergauf', 'muskeln_kraft',
      'event', 'laufen_starten', 'fit_bleiben', 'wiedereinstieg', 'sonstiges'
    )
  ),
  add constraint goals_role_check check (role is null or role in ('main', 'side'));

-- Backfill: nur das neueste aktive FTP-Ziel je Athlet wird main/ftp. Läuft vor
-- dem Index; pro Athlet entsteht höchstens ein main, der Index kann nicht brechen.
update public.goals g
   set goal_key = 'ftp',
       role     = 'main'
 where g.id in (
   select distinct on (athlete_id) id
     from public.goals
    where is_active
      and kind ilike '%ftp%'
    order by athlete_id, created_at desc, id desc
 );

create unique index goals_one_active_main_per_athlete
  on public.goals (athlete_id)
  where is_active and role = 'main';

create unique index goals_one_active_side_per_athlete
  on public.goals (athlete_id)
  where is_active and role = 'side';

-- Z8: Schreiben nur Athlet selbst (vorher: Athlet + Trainer, 0001).
drop policy "goals: Athlet+Trainer schreiben" on public.goals;
create policy "goals: Athlet schreibt"
  on public.goals for all to authenticated
  using (athlete_id = auth.uid())
  with check (athlete_id = auth.uid());

-- migrate:down
-- Bewusst leer: dieses Projekt rollt Migrationen nie automatisiert zurueck
-- (s. AGENTS.md, Migrations-Workflow). dbmate verlangt den Marker trotzdem.
