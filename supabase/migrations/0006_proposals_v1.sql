-- migrate:up

-- ============================================================
-- Dashboard 2.0 — Migration 0006: proposals auf Schema v1 + trainer_view_prefs
-- Einspielen: Supabase SQL-Editor, dev-Projekt zuerst (dashboard-dev)
-- Referenz: docs/phase-4-konzept-vorschlags-schema.md (§1–§4),
--           docs/phase-4-konzept-trainer-sicht.md (§4, §6)
--
-- proposals existiert bereits aus 0001_initial_schema.sql, aber mit einem
-- deutlich schmaleren/abweichenden Schema als das Vorschlags-Schema-Konzept
-- v1: coach_id statt created_by, kein group_id/op/target_card_id/
-- target_updated_at/reason, Status auf Deutsch (offen/angenommen/abgelehnt)
-- statt v1 (open/accepted/rejected/stale/withdrawn), payload-CHECK verlangt
-- ein "typ"-Feld (altes Format). Diese Migration zieht additiv auf den
-- Konzeptstand nach — analog zum Muster aus 0005_plan_cards.sql (ALTER statt
-- CREATE TABLE). Alte Zeilen (falls im dev-Projekt vorhanden) werden auf die
-- neuen Werte gemappt, nicht verworfen.
-- ============================================================

-- ------------------------------------------------------------
-- 1. PROPOSALS — Spalten umbenennen/ergänzen
-- ------------------------------------------------------------
alter table public.proposals rename column coach_id to created_by;

alter table public.proposals add column if not exists group_id uuid;
alter table public.proposals add column if not exists op text;
alter table public.proposals add column if not exists target_card_id uuid
  references public.plan_cards(id) on delete set null;
alter table public.proposals add column if not exists target_updated_at timestamptz;
alter table public.proposals add column if not exists reason text;

-- Bestehende Zeilen (falls vorhanden) auf "replace" mappen — das alte
-- Schema kannte nur eine ersetzende Kartenänderung ohne op-Unterscheidung.
update public.proposals set op = 'replace' where op is null;
alter table public.proposals alter column op set not null;

-- ------------------------------------------------------------
-- 2. PROPOSALS — source/status auf v1-Werte ummappen
-- ------------------------------------------------------------
alter table public.proposals drop constraint if exists proposals_source_check;
update public.proposals set source = 'trainer' where source = 'human';
alter table public.proposals add constraint proposals_source_check
  check (source in ('trainer', 'claude'));

alter table public.proposals drop constraint if exists proposals_status_check;
update public.proposals set status = 'open' where status = 'offen';
update public.proposals set status = 'accepted' where status = 'angenommen';
update public.proposals set status = 'rejected' where status = 'abgelehnt';
alter table public.proposals add constraint proposals_status_check
  check (status in ('open', 'accepted', 'rejected', 'stale', 'withdrawn'));
alter table public.proposals alter column status set default 'open';

alter table public.proposals add constraint proposals_op_check
  check (op in ('add', 'replace', 'move', 'cancel'));

-- Altes payload-CHECK verlangte ein festes "typ"-Feld (altes Format) — die
-- payload-Form ist jetzt je nach `op` unterschiedlich (Schema-Konzept §2/§3).
-- Statt komplett auf Objekt-Typ zu reduzieren (verliert jede Formprüfung —
-- ein Insert mit payload={} für op='add' würde sonst klaglos durchgehen),
-- wird das Minimalfeld je Op geprüft: plan_date für add/replace/move (ohne
-- Datum ist keine der drei Operationen sinnvoll anwendbar), add zusätzlich
-- title (core/proposal-payload.js::payloadToCardData bräuchte sonst einen
-- Namen aus dem Nichts), cancel hat keine Pflichtfelder (reason optional).
-- Das ist bewusst nur eine Mindestprüfung, kein Ersatz für den geplanten
-- core/proposal-validator.js (Schema-Konzept §4) — die feineren Regeln
-- (target_tss-Plausibilität, type aus Whitelist, …) bleiben Client-seitig.
--
-- ACHTUNG bei bereits vorhandenen Testzeilen im dev-Projekt: `add constraint`
-- validiert alle BESTEHENDEN Zeilen gegen die neue Regel und schlägt fehl,
-- wenn eine alte Zeile (op wurde oben pauschal auf 'replace' gemappt) kein
-- `plan_date` im payload trägt. In dem Fall vor dieser Migration entweder
-- die betroffenen Testzeilen löschen oder ihr payload manuell ergänzen —
-- unkritisch, da es sich nur um dev-Testdaten handelt, keine echten Vorschläge.
alter table public.proposals drop constraint if exists proposals_payload_check;
alter table public.proposals add constraint proposals_payload_check
  check (
    jsonb_typeof(payload) = 'object'
    and case op
      when 'add' then payload ? 'plan_date' and payload ? 'title'
      when 'replace' then payload ? 'plan_date'
      when 'move' then payload ? 'plan_date'
      when 'cancel' then true
      else false
    end
  );

create index if not exists proposals_athlete_status_idx
  on public.proposals (athlete_id, status);
create index if not exists proposals_group_idx
  on public.proposals (group_id) where group_id is not null;

-- ------------------------------------------------------------
-- 3. PROPOSALS — RLS-Policies nachziehen (created_by statt coach_id,
--    is_coach_of() statt direktem Spaltenvergleich — ein Trainer muss ALLE
--    Vorschläge seines Athleten sehen, auch von Claude-Importen erstellte,
--    deren created_by der Athlet selbst ist, nicht der Trainer)
-- ------------------------------------------------------------
drop policy if exists "proposals: Beteiligte lesen" on public.proposals;
create policy "proposals: Beteiligte lesen"
  on public.proposals for select to authenticated
  using (athlete_id = auth.uid() or public.is_coach_of(athlete_id));

drop policy if exists "proposals: Trainer erstellt für seinen Athleten" on public.proposals;
create policy "proposals: Trainer oder Athlet selbst erstellt"
  on public.proposals for insert to authenticated
  with check (
    created_by = auth.uid()
    and (athlete_id = auth.uid() or public.is_coach_of(athlete_id))
  );

-- "proposals: Athlet entscheidet" (UPDATE) bleibt unverändert (athlete_id =
-- auth.uid() auf beiden Seiten) — kein Bezug zu coach_id/created_by.

drop policy if exists "proposals: Trainer löscht eigene offene" on public.proposals;
create policy "proposals: Ersteller löscht eigene offene"
  on public.proposals for delete to authenticated
  using (created_by = auth.uid() and status = 'open');

-- Spalten-Härtung (UPDATE) besteht bereits aus 0001 unverändert (status,
-- decided_at) — beide Spaltennamen bleiben gleich, kein neues GRANT nötig.

-- ------------------------------------------------------------
-- 4. PLAN_CARDS.updated_by (Trainer-Sicht-Konzept §4)
-- ------------------------------------------------------------
alter table public.plan_cards add column if not exists updated_by uuid
  references public.profiles(id) on delete set null;

-- ------------------------------------------------------------
-- 5. TRAINER_VIEW_PREFS — Kategorien-Auswahl der Trainer-Leiste,
--    persistiert pro Trainer-Athlet-Paar (Fahrplan-Entscheidung, s.
--    docs/phase-4-konzept-export-import-workflow.md-Nachbarentscheidung).
--    Erweitert bewusst die bisherige Trainer-Sicht-Entscheidung ("Trainer-
--    Settings: nur Display-Name änderbar") um genau dieses eine Preference-
--    Feld — kein allgemeines Settings-System.
-- ------------------------------------------------------------
create table if not exists public.trainer_view_prefs (
  trainer_id uuid not null references public.profiles(id) on delete cascade,
  athlete_id uuid not null references public.profiles(id) on delete cascade,
  categories jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (trainer_id, athlete_id)
);

alter table public.trainer_view_prefs enable row level security;

drop trigger if exists trainer_view_prefs_set_updated_at on public.trainer_view_prefs;
create trigger trainer_view_prefs_set_updated_at
  before update on public.trainer_view_prefs
  for each row execute function public.set_updated_at();

-- Nur der Trainer selbst sieht/ändert seine eigene Präferenz-Zeile — kein
-- öffentliches Interesse an dieser reinen UI-Einstellung. Doppelte Prüfung
-- (trainer_id = auth.uid() UND is_coach_of()) wie an anderen Stellen im
-- Schema (z. B. profiles-Spaltenhärtung) — is_coach_of() allein würde schon
-- reichen, die Row selbst trägt aber ohnehin trainer_id als Eigentümer-Spalte.
create policy "trainer_view_prefs: nur der eigene Trainer"
  on public.trainer_view_prefs for all to authenticated
  using (trainer_id = auth.uid() and public.is_coach_of(athlete_id))
  with check (trainer_id = auth.uid() and public.is_coach_of(athlete_id));

grant select, insert, update, delete on public.trainer_view_prefs to authenticated;

-- ============================================================
-- PRÜFLISTE nach dem Einspielen (dev):
-- Spalten-Check: select created_by, group_id, op, target_card_id,
--                target_updated_at, reason from proposals limit 1;
--                -> alle Spalten vorhanden
-- als Trainer A: proposal für Athlet A anlegen (created_by=eigene uid,
--                op='replace') ✓ · für Athlet B ✗
-- als Athlet A:  proposal für sich selbst anlegen (Claude-Import-Pfad,
--                created_by = eigene uid) ✓ · Status auf 'accepted' setzen ✓
--                · fremden Vorschlag (Athlet B) lesen ✗
-- als Trainer A: proposals von Athlet A lesen ✓ — auch solche mit
--                created_by = Athlet A (Claude-Import), nicht nur eigene
--                · Status eines Vorschlags (auch eigenen) auf 'accepted'
--                setzen ✗ (nur der Athlet entscheidet — s. Frontend-Gate
--                in ui/proposal-list.js/ui/proposal-compare.js, isAthlete())
-- payload-CHECK: insert mit op='add', payload={} -> Fehler (fehlt plan_date
--                + title) · op='cancel', payload={} -> ok (keine Pflichtfelder)
-- trainer_view_prefs: Trainer A legt Zeile für Athlet A an ✓, für
--                Athlet B (nicht sein Athlet) ✗; Athlet A selbst kann die
--                Zeile weder lesen noch schreiben (keine Policy für ihn)
-- ============================================================

-- migrate:down
-- Bewusst leer: dieses Projekt rollt Migrationen nie automatisiert zurueck
-- (s. AGENTS.md, Migrations-Workflow). dbmate verlangt den Marker trotzdem.
