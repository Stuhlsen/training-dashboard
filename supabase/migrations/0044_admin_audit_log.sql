-- migrate:up

-- ============================================================
-- Dashboard 2.0 — Migration 0044: admin_audit_log
-- Einspielen: Supabase SQL-Editor / dbmate, dev-Projekt zuerst
--             (dashboard-dev), danach der apps01-Self-Host-Stack
--             (echte Produktion — NICHT dashboard-prod auf supabase.co,
--              NUR nach Rückfrage bei Alex, s. CLAUDE.md "Grenzen")
--
-- Fahrplan 18 E1 (GitHub Issue #47, Tony): admin-api bekommt neue
-- Schreib-Routen (Sperren/Entsperren/Löschen/Link erneut senden). Diese
-- Tabelle protokolliert, wer wann welchen Account wie geändert hat.
-- `target_user_id` ist bewusst KEIN Fremdschlüssel auf auth.users, weil ein
-- Audit-Eintrag auch nach einem Hard-Delete des Zielaccounts lesbar bleiben
-- muss — `target_email` ist deshalb ein Schnappschuss zum Zeitpunkt der
-- Aktion, kein Live-Join.
-- ============================================================

create table public.admin_audit_log (
  id              uuid primary key default gen_random_uuid(),
  actor_id        uuid not null references public.profiles(id),
  target_user_id  uuid not null,   -- KEIN FK: muss auch nach einem Hard-Delete
                                    -- des Zielaccounts lesbar bleiben
  target_email    text,            -- Schnappschuss zum Zeitpunkt der Aktion —
                                    -- auth.users kann nach "delete" spaeter weg sein
  action          text not null check (action in
                    ('ban','unban','delete','resend_invite','resend_recovery')),
  details         jsonb,
  created_at      timestamptz not null default now()
);

alter table public.admin_audit_log enable row level security;

create policy "admin liest audit log" on public.admin_audit_log
  for select using (public.is_admin());

-- Kein INSERT/UPDATE/DELETE-Grant fuer authenticated — schreibt
-- ausschliesslich admin-api per service_role (RLS-Bypass).
grant select, insert on public.admin_audit_log to service_role;

-- ============================================================
-- PRÜFLISTE nach dem Einspielen (dev, dann apps01 — nach Rückfrage):
-- als Admin: GET /admin_audit_log -> eigene und fremde Einträge sichtbar
-- als normaler Athlet: GET /admin_audit_log -> leer (kein Grant/RLS-Treffer)
-- ein Eintrag mit target_user_id eines inzwischen gelöschten Users bleibt
--   lesbar (kein FK-Fehler beim Löschen des Ziel-Accounts)
-- ============================================================

-- migrate:down
-- Bewusst leer: dieses Projekt rollt Migrationen nie automatisiert zurueck
-- (s. AGENTS.md, Migrations-Workflow). dbmate verlangt den Marker trotzdem.
