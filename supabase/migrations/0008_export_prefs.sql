-- migrate:up

-- ============================================================
-- Dashboard 2.0 — Migration 0008: export_prefs (Export-Richtungsvorgabe)
-- Einspielen: Supabase SQL-Editor, dev-Projekt zuerst (dashboard-dev)
-- Referenz: docs/phase-4-konzept-export-richtungsvorgabe.md (R5/R6)
--
-- Persistiert Preset + optionales Zielevent des Export-Panels PRO PROFIL
-- (profile_id ist zugleich Primärschlüssel — ein Athlet hat höchstens eine
-- Zeile, kein Trainer-Athlet-Paar wie bei trainer_view_prefs aus 0006).
-- Additiv und idempotent, wie 0004 nachträglich gemacht: reines "create
-- table if not exists" + Policy-/Grant-Drop-und-Neuanlage, kein Re-Run
-- verwirft bestehende Zeilen.
-- ============================================================

create table if not exists public.export_prefs (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  preset     text not null default 'general'
             check (preset in ('general', 'event', 'check', 'reduce', 'build')),
  -- ON DELETE SET NULL statt CASCADE: ein gemerkter Verweis auf ein
  -- inzwischen gelöschtes Event darf die Persistenz-Zeile nicht mitreißen —
  -- der Leerzustand aus R3 fängt "Preset event, aber kein Event mehr" in
  -- der UI ab, statt dass hier eine ganze Vorgabe verlorengeht.
  event_id   uuid references public.events(id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.export_prefs enable row level security;

drop trigger if exists export_prefs_set_updated_at on public.export_prefs;
create trigger export_prefs_set_updated_at
  before update on public.export_prefs
  for each row execute function public.set_updated_at();

-- Nur der Eigentümer selbst liest/schreibt seine eigene Zeile — kein
-- öffentlicher Lesepfad, keine Coach-Policy (anders als trainer_view_prefs:
-- der Schlüssel ist hier ein einzelnes Profil, kein Trainer-Athlet-Paar).
drop policy if exists "export_prefs: nur der Eigentümer" on public.export_prefs;
create policy "export_prefs: nur der Eigentümer"
  on public.export_prefs for all to authenticated
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

grant select, insert, update, delete on public.export_prefs to authenticated;

-- ============================================================
-- PRÜFLISTE nach dem Einspielen (dev):
-- Spalten-Check: select profile_id, preset, event_id, updated_at
--                from export_prefs limit 1; -> alle Spalten vorhanden
-- als anon:      export_prefs lesen ✗ · schreiben ✗ (kein GRANT)
-- als Athlet A:  eigene Zeile anlegen (preset='event', event_id=<eigenes
--                Event>) ✓ · preset='unknown' anlegen -> Fehler (Check-
--                Constraint) · fremde Zeile (Athlet B) lesen ✗ · fremde
--                Zeile schreiben ✗
-- Event löschen, auf das event_id verweist -> Zeile bleibt erhalten,
--                event_id wird null (kein Fehler, keine gelöschte Zeile)
-- Update-Trigger: preset ändern -> updated_at aktualisiert sich automatisch
-- ============================================================

-- migrate:down
-- Bewusst leer: dieses Projekt rollt Migrationen nie automatisiert zurueck
-- (s. AGENTS.md, Migrations-Workflow). dbmate verlangt den Marker trotzdem.
