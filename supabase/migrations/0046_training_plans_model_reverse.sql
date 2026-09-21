-- migrate:up

-- ============================================================
-- Dashboard 2.0 — Migration 0046: training_plans.model erweitert um 'reverse'
-- Einspielen: Supabase SQL-Editor / dbmate, dev-Projekt zuerst
--             (dashboard-dev), danach der apps01-Self-Host-Stack
--             (echte Produktion — NICHT dashboard-prod auf supabase.co).
--             Vor dem prod-Einspielen Rückfrage bei Alex.
-- Referenz: Alex-Entscheidung per /grill, 2026-09-21 (Plan-Generator: Fokus
--           wirksam machen + Reverse-Periodisierung + Erklärtexte)
--
-- BEFUND: Der CHECK-Constraint auf training_plans.model (0028, inline ohne
-- expliziten Namen definiert) erlaubt bislang nur
-- 'pyramidal'/'polarized'/'block'/'linear'. Ein fünftes Modell "reverse"
-- (Reverse-Periodisierung: Intensität zuerst, Grundlage wandert ans Ende vor
-- dem Taper) braucht einen erweiterten Constraint.
--
-- FIX: Constraint droppen + mit demselben Vokabular plus 'reverse' neu
-- anlegen. Postgres benennt einen inline definierten CHECK-Constraint
-- automatisch `<tabelle>_<spalte>_check` — vor dem Einspielen gegen
-- dashboard-dev verifizieren:
--   select conname from pg_constraint
--    where conrelid = 'public.training_plans'::regclass and contype = 'c';
-- Weicht der tatsächliche Name ab, diese Migration entsprechend anpassen,
-- bevor sie eingespielt wird.
--
-- GRANT/RLS: unberührt — reiner Constraint-Ersatz, keine neue Spalte, keine
-- Policy-Änderung.
-- ============================================================

alter table public.training_plans
  drop constraint if exists training_plans_model_check;
alter table public.training_plans
  add constraint training_plans_model_check
    check (model in ('pyramidal', 'polarized', 'block', 'linear', 'reverse'));

-- ============================================================
-- PRÜFLISTE nach dem Einspielen (dev, dann apps01):
-- Constraint-Check:
--   select pg_get_constraintdef(oid) from pg_constraint
--    where conname = 'training_plans_model_check';
--   -> CHECK (model = ANY (ARRAY['pyramidal', 'polarized', 'block', 'linear', 'reverse']))
-- als Athlet A: Plan mit model='reverse' anlegen -> ok
--             · Plan mit model='xyz' anlegen -> Fehler (CHECK)
-- Bestehende Pläne (model in pyramidal/polarized/block/linear): unverändert
--             lesbar/schreibbar, keine Verhaltensänderung
-- ============================================================

-- migrate:down
-- Bewusst leer: dieses Projekt rollt Migrationen nie automatisiert zurueck
-- (s. AGENTS.md, Migrations-Workflow). dbmate verlangt den Marker trotzdem.
