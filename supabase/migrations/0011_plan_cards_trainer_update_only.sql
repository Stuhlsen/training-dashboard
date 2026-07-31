-- ============================================================
-- Dashboard 2.0 — Migration 0011: plan_cards — Trainer nur UPDATE (T2)
-- Einspielen: Supabase SQL-Editor, dev-Projekt zuerst (dashboard-dev),
--             danach dashboard-prod
-- Referenz: docs/phase-4-konzept-trainer-sicht.md (T2), Security-Review
--           Etappe B, Fund 2 (31.07.2026)
--
-- T2 ("Direktänderungs-Rechte: nur bestehende Karten ändern/verschieben.
-- Anlegen/Löschen läuft immer als Vorschlag — Planhoheit bleibt beim
-- Athleten") war seit 0001 nur im UI durchgesetzt (ui/plan-card-dialog.js:
-- Anlegen erzwingt für einen Trainer immer den Vorschlags-Pfad, Löschen-
-- Button ist für Trainer nie sichtbar). Die RLS-Policy selbst
-- ("plan_cards: Athlet+Trainer schreiben", FOR ALL) erlaubte einem
-- Trainer aber genau wie dem Athleten INSERT/UPDATE/DELETE — live gegen
-- training-dashboard-prod bestätigt: ein direkter REST-Call (eigenes
-- Trainer-Login, kein Exploit) konnte eine Karte für den zugeordneten
-- Athleten anlegen UND löschen, unter Umgehung des kompletten
-- Proposals-Review-Workflows. Widerspricht dem im selben Konzeptdokument
-- festgehaltenen Grundsatz "Alle Rechte werden in RLS durchgesetzt, nie
-- nur im UI. Das UI blendet aus, die Datenbank verbietet."
--
-- Diese Migration ersetzt die eine FOR-ALL-Policy durch zwei engere:
--   - Athlet: weiterhin voller Zugriff (insert/update/delete) auf die
--     eigene Karte — unverändert.
--   - Trainer (is_coach_of): NUR NOCH UPDATE. Kein INSERT, kein DELETE.
-- SELECT ist davon nicht betroffen — "plan_cards: öffentlich lesbar"
-- (0001, to anon, authenticated, using true) bleibt unverändert bestehen
-- und deckt Lesezugriff für alle Rollen weiterhin vollständig ab.
-- GRANTs aus 0002 (select, insert, update, delete an authenticated)
-- bleiben ebenfalls unverändert — GRANT erlaubt den Versuch, RLS
-- entscheidet pro Zeile/Command, welche Policy (falls überhaupt eine)
-- greift.
--
-- Betrifft nur Direktänderungen. "Anlegen" (Vorschlag) und "Löschen"
-- (kein delete-Op in proposals v1, läuft über "cancel" = UPDATE auf der
-- Zielkarte) waren für Trainer im UI ohnehin nie erreichbar — diese
-- Migration schließt nur die RLS-Lücke, ändert kein beobachtbares
-- Anwendungsverhalten für einen Trainer, der ausschließlich über das UI
-- arbeitet.
-- ============================================================

drop policy if exists "plan_cards: Athlet+Trainer schreiben" on public.plan_cards;

-- Athlet: voller Zugriff (insert/update/delete) auf die eigene Karte —
-- unverändert gegenüber der bisherigen Policy, nur jetzt auf den
-- Athleten-Fall beschränkt formuliert.
create policy "plan_cards: Athlet voller Zugriff"
  on public.plan_cards for all to authenticated
  using (athlete_id = auth.uid())
  with check (athlete_id = auth.uid());

-- Trainer (T2): nur ändern/verschieben direkt — Anlegen/Löschen bleibt
-- der proposals-Workflow (Planhoheit beim Athleten).
create policy "plan_cards: Trainer ändert direkt"
  on public.plan_cards for update to authenticated
  using (public.is_coach_of(athlete_id))
  with check (public.is_coach_of(athlete_id));

-- ============================================================
-- PRÜFLISTE nach dem Einspielen (dev, dann prod):
-- als Trainer A: bestehende Karte von Athlet A per UPDATE ändern
--                (z.B. planned_date/tss_planned) ✓
--              · neue Karte für Athlet A per INSERT anlegen -> Fehler
--                (403, keine passende Policy mehr)
--              · bestehende Karte von Athlet A per DELETE löschen
--                -> Fehler (403, keine passende Policy mehr)
--              · Karte von Athlet B (nicht sein Athlet) per UPDATE
--                ändern -> weiterhin Fehler (is_coach_of false)
-- als Athlet A:  eigene Karte weiterhin per INSERT/UPDATE/DELETE voll
--                verwaltbar ✓ — unverändert
-- als anon:      plan_cards weiterhin lesbar ✓ — unverändert (eigene
--                Policy aus 0001, hier nicht angefasst)
-- ============================================================
