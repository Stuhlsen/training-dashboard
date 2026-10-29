-- migrate:up

-- ============================================================
-- Fahrplan 19, Etappe B1 — Migration 0080: athlete_wahoo_tokens
-- Einspielen: dev-Projekt zuerst (dashboard-dev), danach der
--             apps01-Self-Host-Stack (echte Produktion — NICHT
--             dashboard-prod auf supabase.co)
--
-- OAuth-Tokens der Wahoo-Cloud-API, eine Zeile je Athlet mit Login.
-- Bewusst NUR für service_role lesbar/schreibbar: kein Grant für
-- anon/authenticated, keine Policy. Der Browser bekommt die Tokens nie zu
-- sehen (die Settings-UI fragt nur "verbunden ja/nein" über die admin-api).
-- Geschrieben von der admin-api (erstes Verbinden) und vom Sync (Refresh,
-- Wahoo rotiert Access- UND Refresh-Token bei jedem Refresh — die neuen
-- Werte müssen vor ihrer Nutzung hier stehen).
--
-- Löschen des Profils löscht die Tokens mit (on delete cascade).
-- ============================================================

create table public.athlete_wahoo_tokens (
  profile_id    uuid primary key references public.profiles(id) on delete cascade,
  access_token  text not null,
  refresh_token text not null,
  expires_at    timestamptz not null,
  scope         text not null default '',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

alter table public.athlete_wahoo_tokens enable row level security;

create trigger athlete_wahoo_tokens_set_updated_at
  before update on public.athlete_wahoo_tokens
  for each row execute function public.set_updated_at();

-- Default-Privilegien des Self-Host-Stacks nicht verlassen: explizit entziehen,
-- dann nur service_role vergeben.
revoke all on public.athlete_wahoo_tokens from anon, authenticated;
grant select, insert, update, delete on public.athlete_wahoo_tokens to service_role;

-- ============================================================
-- PRÜFLISTE nach dem Einspielen (dev, dann apps01):
-- als service_role: Zeile anlegen/lesen/aktualisieren/löschen ✓
-- als authenticated: GET/POST/PATCH/DELETE -> permission denied (kein GRANT)
-- als anon:          GET -> 401 / permission denied
-- tests/supabase-rls.test.js: Block "athlete_wahoo_tokens" grün
-- ============================================================

-- migrate:down
-- Bewusst leer: dieses Projekt rollt Migrationen nie automatisiert zurueck
-- (s. AGENTS.md, Migrations-Workflow). dbmate verlangt den Marker trotzdem.
