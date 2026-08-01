-- ============================================================
-- Dashboard 2.0 — Migration 0014: Formatkatalog (session_formats, athlete_formats)
-- Einspielen: Supabase SQL-Editor, dev-Projekt zuerst (dashboard-dev),
--             danach dashboard-prod
-- Referenz: docs/konzept-progressionssteuerung.md D4, L1-L8
--
-- Zwei Tabellen (D4): `session_formats` ist der athletenunabhängige Katalog
-- (Ebene 2 aus L1: "welche Bauformen treffen dieses Ziel" — Coaching-Praxis,
-- gepflegt statt berechnet), `athlete_formats` legt fest, welche Familien
-- für welchen Athleten aktiv sind (L1.1). Die Leiterstufe selbst (Ebene 3,
-- "welche Stufe innerhalb der Familie") lebt in ladder_history, Migration
-- 0015 — hier nur der Katalog + die Zuordnung.
--
-- `axes` (jsonb) hat zwei mögliche Formen (Architekturentscheidung Fenster
-- D, im Konzept nicht bis auf Code-Ebene spezifiziert): parametrisch
-- `{primary, secondary, tertiary?}` (D4.2) oder aufgezählt
-- `{explicitSteps: [...]}`. Alle sechs Startformate unten sind
-- `explicitSteps` — der Abgleich von core/ladder.js::generateLadderSteps()
-- gegen die Konzept-Tabellen L2-L6 zeigte, dass keines der sechs Formate
-- sich aus einem reinen primary×secondary-Kreuzprodukt ergibt (Details im
-- Kopfkommentar core/ladder.js und im Fenster-D-Abschlussbericht). Der
-- Generator bleibt für künftige, neu angelegte Formate nutzbar.
--
-- block_targets ordnet ein Format den Blockziel-Strings aus
-- state/config.js::CONFIG.phases zu (Athlet 1: "Sweet Spot"/"Schwelle"/
-- "VO2max"), NICHT dem target_system-Vokabular derselben Zeile — beide
-- Felder beschreiben unterschiedliche Dinge (target_system = Physiologie,
-- block_targets = welcher Periodisierungsblock). vo2-short/vo2-long teilen
-- sich laut L4 bewusst dasselbe Blockziel ("beide zulässig für dasselbe
-- Blockziel, aber nur eine pro Block aktiv") — das erzeugt bei Athlet 1
-- (L7: beide aktiv) den ersten echten E2-Blockstart-Dialog-Fall. Ebenso
-- bei Athlet 2 (L7: over-under + threshold-long aktiv, beide hier auf
-- Blockziel "Schwelle" gesetzt).
-- ============================================================

create table if not exists public.session_formats (
  id             text primary key,
  label          text not null,
  target_system  text not null
                 check (target_system in (
                   'aerob-ermuedungsresistenz', 'schwelle', 'laktat-clearance',
                   'vo2max', 'neuromuskulaer'
                 )),
  currency       text not null
                 check (currency in ('zone-time', 'over-time', 'time-above-90', 'reps')),
  evidence_grade text not null check (evidence_grade in ('studienlage', 'coaching-konsens')),
  block_targets  text[] not null default '{}',
  axes           jsonb not null,
  created_at     timestamptz not null default now()
);

alter table public.session_formats enable row level security;

-- Öffentlich lesbar (kein personenbezogener Inhalt, D4), Schreiben nur Admin —
-- Muster wie `events: Admin schreibt alle` (0004): eigene, additive Policy.
drop policy if exists "session_formats: öffentlich lesbar" on public.session_formats;
create policy "session_formats: öffentlich lesbar"
  on public.session_formats for select to anon, authenticated using (true);

drop policy if exists "session_formats: nur Admin schreibt" on public.session_formats;
create policy "session_formats: nur Admin schreibt"
  on public.session_formats for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

grant select on public.session_formats to anon, authenticated;
grant insert, update, delete on public.session_formats to authenticated;

-- ------------------------------------------------------------

create table if not exists public.athlete_formats (
  id         uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  format_id  text not null references public.session_formats(id) on delete cascade,
  active     boolean not null default true,
  added_at   timestamptz not null default now(),
  unique (profile_id, format_id)
);

alter table public.athlete_formats enable row level security;

create index if not exists athlete_formats_profile_idx on public.athlete_formats (profile_id);

-- RLS wie ftp_history (0009): nur der Athlet schreibt für sich, Trainer
-- liest über is_coach_of, kein anon-GRANT — welche Formate ein Athlet
-- fährt ist keine öffentliche Information wie der Katalog selbst.
drop policy if exists "athlete_formats: Athlet+Trainer lesen" on public.athlete_formats;
create policy "athlete_formats: Athlet+Trainer lesen"
  on public.athlete_formats for select to authenticated
  using (profile_id = auth.uid() or public.is_coach_of(profile_id));

drop policy if exists "athlete_formats: nur Athlet schreibt" on public.athlete_formats;
create policy "athlete_formats: nur Athlet schreibt"
  on public.athlete_formats for insert to authenticated
  with check (profile_id = auth.uid());

drop policy if exists "athlete_formats: nur Athlet ändert" on public.athlete_formats;
create policy "athlete_formats: nur Athlet ändert"
  on public.athlete_formats for update to authenticated
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

drop policy if exists "athlete_formats: nur Athlet löscht" on public.athlete_formats;
create policy "athlete_formats: nur Athlet löscht"
  on public.athlete_formats for delete to authenticated
  using (profile_id = auth.uid());

grant select, insert, update, delete on public.athlete_formats to authenticated;

-- ============================================================
-- Seed: session_formats (Startbelegung L2-L6). KEIN Seed für
-- athlete_formats — die L7-Startbelegung (Konzept) wird nach Freigabe im
-- Fenster-D-Abschlussbericht über die neue Familienauswahl im Athletenmenü
-- gesetzt, nicht per Migration mit Athleten-UUIDs.
-- ============================================================

insert into public.session_formats (id, label, target_system, currency, evidence_grade, block_targets, axes)
values
  ('sweetspot-long', 'Sweet Spot lang', 'aerob-ermuedungsresistenz', 'zone-time', 'coaching-konsens',
   array['Sweet Spot'],
   '{"explicitSteps": [
      {"id":"S1","structureLabel":"3×10","pctFtp":88,"zoneTimeMin":30},
      {"id":"S2","structureLabel":"3×12","pctFtp":88,"zoneTimeMin":36},
      {"id":"S3","structureLabel":"3×15","pctFtp":90,"zoneTimeMin":45},
      {"id":"S4","structureLabel":"4×12","pctFtp":90,"zoneTimeMin":48},
      {"id":"S5","structureLabel":"2×20","pctFtp":91,"zoneTimeMin":40},
      {"id":"S6","structureLabel":"3×18","pctFtp":90,"zoneTimeMin":54},
      {"id":"S7","structureLabel":"3×20","pctFtp":91,"zoneTimeMin":60},
      {"id":"S8","structureLabel":"2×30","pctFtp":90,"zoneTimeMin":60}
    ]}'::jsonb),

  ('threshold-long', 'Schwelle lang', 'schwelle', 'zone-time', 'coaching-konsens',
   array['Schwelle'],
   '{"explicitSteps": [
      {"id":"T1","structureLabel":"3×8","pctFtp":98,"zoneTimeMin":24},
      {"id":"T2","structureLabel":"4×8","pctFtp":98,"zoneTimeMin":32},
      {"id":"T3","structureLabel":"2×15","pctFtp":100,"zoneTimeMin":30},
      {"id":"T4","structureLabel":"3×12","pctFtp":100,"zoneTimeMin":36},
      {"id":"T5","structureLabel":"2×20","pctFtp":100,"zoneTimeMin":40},
      {"id":"T6","structureLabel":"3×15","pctFtp":100,"zoneTimeMin":45},
      {"id":"T7","structureLabel":"4×12","pctFtp":102,"zoneTimeMin":48}
    ]}'::jsonb),

  ('vo2-short', 'VO2max kurz (30/15)', 'vo2max', 'zone-time', 'studienlage',
   array['VO2max'],
   '{"explicitSteps": [
      {"id":"V-K1","structureLabel":"2 Sätze × 10 × 30/15","pctFtp":110,"zoneTimeMin":10},
      {"id":"V-K2","structureLabel":"3 Sätze × 10 × 30/15","pctFtp":110,"zoneTimeMin":15},
      {"id":"V-K3","structureLabel":"3 Sätze × 13 × 30/15","pctFtp":112,"zoneTimeMin":19.5},
      {"id":"V-K4","structureLabel":"4 Sätze × 13 × 30/15","pctFtp":112,"zoneTimeMin":26}
    ]}'::jsonb),

  ('vo2-long', 'VO2max lang', 'vo2max', 'zone-time', 'studienlage',
   array['VO2max'],
   '{"explicitSteps": [
      {"id":"V-L1","structureLabel":"4×3","pctFtp":112,"zoneTimeMin":12},
      {"id":"V-L2","structureLabel":"5×3","pctFtp":112,"zoneTimeMin":15},
      {"id":"V-L3","structureLabel":"4×4","pctFtp":108,"zoneTimeMin":16},
      {"id":"V-L4","structureLabel":"4×5","pctFtp":106,"zoneTimeMin":20},
      {"id":"V-L5","structureLabel":"5×5","pctFtp":106,"zoneTimeMin":25}
    ]}'::jsonb),

  ('over-under', 'Over-Under', 'laktat-clearance', 'over-time', 'coaching-konsens',
   array['Schwelle'],
   '{"explicitSteps": [
      {"id":"OU1","structureLabel":"3×9 (2/1)","pctFtpOver":103,"pctFtpUnder":88,"overTimeMin":18,"wechsel":9},
      {"id":"OU2","structureLabel":"3×10 (2/2)","pctFtpOver":105,"pctFtpUnder":88,"overTimeMin":15,"wechsel":9},
      {"id":"OU3","structureLabel":"3×12 (2/2)","pctFtpOver":105,"pctFtpUnder":88,"overTimeMin":18,"wechsel":9},
      {"id":"OU4","structureLabel":"3×12 (2/2)","pctFtpOver":107,"pctFtpUnder":90,"overTimeMin":18,"wechsel":9},
      {"id":"OU5","structureLabel":"3×15 (3/2)","pctFtpOver":105,"pctFtpUnder":90,"overTimeMin":27,"wechsel":9},
      {"id":"OU6","structureLabel":"4×12 (2/2)","pctFtpOver":107,"pctFtpUnder":90,"overTimeMin":24,"wechsel":12}
    ]}'::jsonb),

  ('sprint-accessory', 'Sprint-Zusatz', 'neuromuskulaer', 'reps', 'coaching-konsens',
   array['Sweet Spot', 'Schwelle', 'VO2max'],
   '{"explicitSteps": [
      {"id":"SP1","structureLabel":"3×10s","reps":3,"workSec":10,"restMin":4},
      {"id":"SP2","structureLabel":"4×10s","reps":4,"workSec":10,"restMin":4},
      {"id":"SP3","structureLabel":"4×15s","reps":4,"workSec":15,"restMin":5},
      {"id":"SP4","structureLabel":"6×15s","reps":6,"workSec":15,"restMin":5}
    ]}'::jsonb)
on conflict (id) do nothing;

-- ============================================================
-- PRÜFLISTE nach dem Einspielen (dev, dann prod):
-- Spalten-Check: select id, label, target_system, currency, evidence_grade,
--                block_targets from session_formats order by id;
--                -> 6 Zeilen (sweetspot-long, threshold-long, vo2-short,
--                vo2-long, over-under, sprint-accessory)
-- als anon:      session_formats lesen ✓ · schreiben ✗
-- als Athlet A:  athlete_formats-Zeile für sich anlegen (format_id
--                'sweetspot-long', active=true) ✓
--                · zweite Zeile mit demselben format_id -> Fehler (unique)
--                · format_id 'nicht-vorhanden' -> Fehler (FK)
--                · fremde athlete_formats-Zeile (Athlet B) lesen ✗ ändern ✗
-- als Trainer A: athlete_formats von Athlet A lesen ✓ (is_coach_of)
--                · schreiben ✗ (keine Insert/Update/Delete-Policy für Trainer)
-- als anon:      athlete_formats lesen ✗ (kein GRANT)
-- ============================================================
