-- migrate:up

-- ============================================================
-- Migration 0034: coach_exchanges (Verlauf des KI-Coach-Loops)
-- Einspielen: Supabase SQL-Editor, dev-Projekt zuerst (dashboard-dev),
--             danach der apps01-Self-Host-Stack (echte Produktion, s.
--             AGENTS.md "Migrations-Workflow" — NICHT dashboard-prod auf
--             supabase.co).
-- Referenz: docs/fahrplan-9-coach-loop.md — Abschnitt "Geteilte Verträge"
--           + "Etappe A — Datenschicht (C3)" (Backlog-Idee 6,
--           Grilling-Entscheidungen C3 / Q5 / Q7 / Q9).
--
-- Der "Claude als Trainer"-Copy-Paste-Loop legt bisher keine Historie an:
-- Briefing -> claude.ai -> Antwort -> Import-Parser -> proposals, danach ist
-- die Runde vergessen. coach_exchanges hält je abgeschlossener Runde eine
-- unveränderliche Zeile (Datum, Auftragsvariante, rohe Claude-Antwort,
-- Verknüpfung zur erzeugten proposals-Gruppe). Sie füttert später den echten
-- selbst-gehosteten KI-Coach (Backlog-Idee P).
--
-- Bewusst KEIN FK auf proposals: die Verknüpfung ist eine Gruppen-ID
-- (proposals.group_id), kein Einzel-Fremdschlüssel — proposals werden nie
-- gelöscht, nur auf stale/withdrawn gesetzt. proposal_group_id bleibt
-- nullable (Claude schlug in dieser Runde nichts Umsetzbares vor).
--
-- Kein updated_at, kein set_updated_at-Trigger: Zeilen sind unveränderliche
-- Fakten, es gibt bewusst KEINE update-Policy (Q7). Eine vergangene Runde
-- nachträglich zu bearbeiten ergibt fachlich keinen Sinn — nur Anlegen
-- (beim "Importieren"-Klick, Q9) und Löschen durch den Athleten selbst.
--
-- Sichtbarkeit: Besitzer + dessen Trainer lesen (public.is_coach_of(),
-- Vorbild proposals/trainer_view_prefs aus 0006). Bewusst NICHT öffentlich
-- lesbar (anders als proposals selbst, 0010) — die rohe Claude-Antwort ist
-- kein Portfolio-Inhalt und bleibt privat. Kein anon-GRANT.
-- ============================================================

create table if not exists public.coach_exchanges (
  id                 uuid primary key default gen_random_uuid(),
  athlete_id         uuid not null references public.profiles(id) on delete cascade,
  created_by         uuid not null references public.profiles(id) on delete cascade,
  preset             text not null
                     check (preset in ('general', 'event', 'check', 'reduce', 'build')),
  raw_response       text not null,
  -- = proposals.group_id der in dieser Runde erzeugten Vorschläge; null,
  -- wenn Claude nichts Umsetzbares vorschlug. Kein FK (s. Kopfkommentar).
  proposal_group_id  uuid,
  created_at         timestamptz not null default now()
);

alter table public.coach_exchanges enable row level security;

-- Die Verlaufsansicht lädt "neueste zuerst" je Athlet (Q10) — (athlete_id,
-- created_at desc) als dafür deckender Index.
create index if not exists coach_exchanges_athlete_created_idx
  on public.coach_exchanges (athlete_id, created_at desc);

drop policy if exists "coach_exchanges: Besitzer + Trainer lesen" on public.coach_exchanges;
create policy "coach_exchanges: Besitzer + Trainer lesen"
  on public.coach_exchanges for select to authenticated
  using (athlete_id = auth.uid() or public.is_coach_of(athlete_id));

drop policy if exists "coach_exchanges: nur der Athlet selbst legt an" on public.coach_exchanges;
create policy "coach_exchanges: nur der Athlet selbst legt an"
  on public.coach_exchanges for insert to authenticated
  with check (created_by = auth.uid() and athlete_id = auth.uid());

drop policy if exists "coach_exchanges: Besitzer löscht eigene" on public.coach_exchanges;
create policy "coach_exchanges: Besitzer löscht eigene"
  on public.coach_exchanges for delete to authenticated
  using (athlete_id = auth.uid());

-- KEIN grant an anon, KEINE update-Policy (Q7).
grant select, insert, delete on public.coach_exchanges to authenticated;

-- ============================================================
-- PRÜFLISTE nach dem Einspielen (dev, dann apps01):
-- Spalten-Check: select athlete_id, created_by, preset, raw_response,
--                proposal_group_id, created_at from coach_exchanges limit 1;
--                -> Tabelle leer, Query läuft ohne Fehler (Schema vorhanden)
-- Index:         \d coach_exchanges -> coach_exchanges_athlete_created_idx
--                auf (athlete_id, created_at DESC)
-- als anon:      coach_exchanges lesen ✗ (kein GRANT für anon)
-- als Athlet A:  eigene Zeile anlegen (created_by = athlete_id = eigene uid,
--                preset='general', raw_response='…') ✓ · lesen ✓
--                · Zeile mit fremder athlete_id anlegen ✗ (WITH CHECK, 42501)
--                · preset='foo' anlegen ✗ (Check-Constraint)
--                · eigene Zeile löschen ✓
-- als Trainer A: Zeilen von Athlet A lesen ✓ (is_coach_of)
--                · Zeile für Athlet A anlegen ✗ (WITH CHECK verlangt
--                  created_by = auth.uid() UND athlete_id = auth.uid())
--                · Zeile von Athlet A löschen ✗ (0 Treffer, KEIN harter
--                  Fehler — DELETE-RLS blendet die Zeile nur aus)
-- ============================================================

-- migrate:down
-- Bewusst leer: dieses Projekt rollt Migrationen nie automatisiert zurueck
-- (s. AGENTS.md, Migrations-Workflow). dbmate verlangt den Marker trotzdem.
