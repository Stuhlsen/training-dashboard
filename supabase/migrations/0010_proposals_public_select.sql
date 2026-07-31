-- ============================================================
-- Dashboard 2.0 — Migration 0010: proposals öffentlich lesbar (S1)
-- Einspielen: Supabase SQL-Editor, dev-Projekt zuerst (dashboard-dev),
--             danach dashboard-prod
-- Referenz: docs/phase-6-konzept-sichtbarkeit.md (S1), Security-Review
--           Etappe B, Fund 1 (31.07.2026)
--
-- S1 ("proposals sind öffentlich lesbar") wurde in 0001/0006 nie als
-- RLS-Policy für anon umgesetzt — proposals war seit Phase 0 durchgehend
-- nur "to authenticated" (Beteiligte) lesbar. Live gegen
-- training-dashboard-prod bestätigt: ein echter Vorschlag war für anon
-- unsichtbar, obwohl S1 als getroffene Entscheidung dokumentiert ist
-- ("Der Vorschlags-/Review-Workflow ist Portfolio-Kern").
--
-- Muster identisch zu goals/events/plan_cards ("öffentlich lesbar",
-- 0001_initial_schema.sql): eine zusätzliche permissive Policy für
-- (anon, authenticated) mit using(true) — die bestehende "proposals:
-- Beteiligte lesen"-Policy (nur authenticated, athlete_id/is_coach_of)
-- bleibt unverändert bestehen; Postgres verknüpft mehrere permissive
-- Policies pro Rolle mit OR, es wird also nichts entzogen. Bewusst
-- (anon, authenticated) statt nur anon: sonst sähe ein eingeloggter
-- Nutzer beim Betrachten eines FREMDEN Athleten (Athleten-Toggle bleibt
-- laut Sichtbarkeits-Konzept frei) WENIGER als ein anonymer Besucher —
-- dieselbe Inkonsistenz existiert bei goals/events/plan_cards nicht und
-- soll hier nicht neu entstehen.
--
-- `reason` bleibt öffentlich sichtbar (S1-Leitplanke ist inhaltlich, nicht
-- technisch — reason wird laut Prompt-Vorlage lastbasiert formuliert,
-- keine query-seitige Einschränkung vorgesehen; kein "last-only"-Filter,
-- den es so nie gab).
-- ============================================================

drop policy if exists "proposals: öffentlich lesbar" on public.proposals;
create policy "proposals: öffentlich lesbar"
  on public.proposals for select
  to anon, authenticated
  using (true);

grant select on public.proposals to anon;

-- ============================================================
-- PRÜFLISTE nach dem Einspielen (dev, dann prod):
-- als anon:      proposals lesen ✓ (inkl. reason) — vorher []
-- als Athlet A:  fremden Vorschlag (Athlet B) lesen ✓ (über die neue
--                öffentliche Policy, nicht über "Beteiligte lesen") —
--                bewusste, gewollte Konsequenz aus S1
-- als Athlet A:  eigenen Vorschlag weiterhin per UPDATE (status/
--                decided_at) entscheiden ✓ — Spaltenhärtung aus 0001
--                unverändert, von dieser Migration nicht berührt
-- ============================================================
