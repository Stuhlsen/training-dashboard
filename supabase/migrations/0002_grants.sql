-- ============================================================
-- Dashboard 2.0 — Migration 0002: fehlende Tabellen-Grants
-- Einspielen: Supabase SQL-Editor (dev zuerst, prod beim Merge von Phase 1)
--
-- Hintergrund: 0001 legt RLS-Policies an, aber RLS filtert nur WELCHE
-- Zeilen sichtbar/änderbar sind — sie ersetzt nicht das grundsätzliche
-- GRANT, das ERLAUBT, die Operation überhaupt zu versuchen. Ohne GRANT
-- lehnt Postgres mit "insufficient_privilege" ab (PostgREST: 403), noch
-- bevor eine RLS-Policy zum Zug kommt. 0001 hat das für profiles/goals/
-- etc. schlicht vergessen — beobachtet als: profiles-SELECT eines
-- eingeloggten Users lief dauerhaft mit 403, kein Bearer-Token-Problem
-- (per Network-Tab-Diagnose ausgeschlossen), sondern fehlendes GRANT.
--
-- Bewusst KEIN pauschales "grant all to anon, authenticated" — das würde
-- die column-restricted UPDATE-Grants aus 0001 (profiles.display_name/
-- wellbeing_public, proposals.status/decided_at — Härtung gegen Selbst-
-- Beförderung zu Admin/Coach) wieder überschreiben. Stattdessen genau
-- die Grants, die die jeweilige RLS-Policy aus 0001 pro Rolle vorsieht.
-- ============================================================

-- PROFILES: SELECT öffentlich (Policy "öffentlich lesbar", anon+authenticated).
-- UPDATE bleibt bewusst unangetastet — column-restricted Grant aus 0001.
grant select on public.profiles to anon, authenticated;

-- GOALS: SELECT öffentlich, Schreiben nur authenticated (Policy
-- "Athlet+Trainer schreiben", for all, to authenticated).
grant select on public.goals to anon, authenticated;
grant insert, update, delete on public.goals to authenticated;

-- EVENTS: identisches Muster wie goals.
grant select on public.events to anon, authenticated;
grant insert, update, delete on public.events to authenticated;

-- PLAN_CARDS: identisches Muster wie goals.
grant select on public.plan_cards to anon, authenticated;
grant insert, update, delete on public.plan_cards to authenticated;

-- WELLBEING: NUR authenticated (Athlet+Trainer) — kein anon, öffentlicher
-- Zugriff läuft ausschließlich über die wellbeing_shared-View (bereits in
-- 0001 gegrantet).
grant select, insert, update, delete on public.wellbeing to authenticated;

-- PROPOSALS: NUR authenticated (Beteiligte). UPDATE bleibt unangetastet —
-- column-restricted Grant aus 0001 (status, decided_at).
grant select, insert, delete on public.proposals to authenticated;

-- FEEDBACK: SELECT+INSERT öffentlich (jeder darf einreichen, Freigegebenes
-- ist öffentlich lesbar), UPDATE/DELETE nur authenticated — RLS filtert
-- dort zusätzlich auf is_admin().
grant select, insert on public.feedback to anon, authenticated;
grant update, delete on public.feedback to authenticated;
