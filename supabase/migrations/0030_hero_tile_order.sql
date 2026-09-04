-- migrate:up

-- ============================================================
-- Migration 0030: hero_tile_order (Hero-Tab Kachel-Reihenfolge)
--
-- Persistiert die selbst gewählte Anordnung der Hero-Kacheln PRO PROFIL
-- (profile_id ist zugleich Primärschlüssel — ein Athlet hat höchstens eine
-- Zeile, exakt das export_prefs-Muster aus 0008: kein Trainer-Athlet-Paar,
-- nur der eingeloggte Athlet selbst verwaltet seine eigene Reihenfolge).
-- Additiv und idempotent wie 0008: "create table if not exists" + Policy-/
-- Grant-Drop-und-Neuanlage, kein Re-Run verwirft bestehende Zeilen.
-- ============================================================

create table if not exists public.hero_tile_order (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  tile_order text[] not null default '{}',
  updated_at timestamptz not null default now()
);

alter table public.hero_tile_order enable row level security;

drop trigger if exists hero_tile_order_set_updated_at on public.hero_tile_order;
create trigger hero_tile_order_set_updated_at
  before update on public.hero_tile_order
  for each row execute function public.set_updated_at();

-- Nur der Eigentümer selbst liest/schreibt seine eigene Zeile — kein
-- öffentlicher Lesepfad, keine Coach-Policy (wie export_prefs, anders als
-- trainer_view_prefs).
drop policy if exists "hero_tile_order: nur der Eigentümer" on public.hero_tile_order;
create policy "hero_tile_order: nur der Eigentümer"
  on public.hero_tile_order for all to authenticated
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

grant select, insert, update, delete on public.hero_tile_order to authenticated;

-- ============================================================
-- PRÜFLISTE nach dem Einspielen (dev):
-- Spalten-Check: select profile_id, tile_order, updated_at
--                from hero_tile_order limit 1; -> alle Spalten vorhanden
-- als anon:      hero_tile_order lesen ✗ · schreiben ✗ (kein GRANT)
-- als Athlet A:  eigene Zeile anlegen/upserten (tile_order='{weather,session}')
--                ✓ · fremde Zeile (Athlet B) lesen ✗ · fremde Zeile schreiben ✗
-- Update-Trigger: tile_order ändern -> updated_at aktualisiert sich automatisch
-- ============================================================

-- migrate:down
-- Bewusst leer: dieses Projekt rollt Migrationen nie automatisiert zurueck
-- (s. AGENTS.md, Migrations-Workflow). dbmate verlangt den Marker trotzdem.
