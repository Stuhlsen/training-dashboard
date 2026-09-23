-- migrate:up

-- ============================================================
-- Dashboard 2.0 — Migration 0054: Warteliste (Fahrplan 22, E6).
-- Einspielen: dev-Projekt zuerst (dashboard-dev), danach apps01 —
-- Rückfrage bei Alex vor Prod.
--
-- Vertrag V2: öffentliche Warteliste der Landingpage. Wer seine
-- E-Mail einträgt, steht auf der Liste; die Adresse wird nur zur
-- Benachrichtigung genutzt (s. Landing-Datenschutz-Kurztext).
--
-- Sicherheitsmodell (Default Deny, wie im Rest des Projekts):
--   - RLS an, Tabelle für anon/authenticated nur INSERT.
--   - KEIN select/update/delete für anon/authenticated — die Liste
--     ist nie öffentlich lesbar, auch nicht über eingeloggte Accounts.
--   - Insert-Policy für anon UND authenticated: Wer auf der Landing-
--     page bereits eingeloggt ist, ist "authenticated", nicht "anon" —
--     sonst schlüge sein Eintrag fehl.
--   - Eindeutiger Index auf lower(email), damit sich niemand doppelt
--     einträgt (auch nicht mit anderer Groß-/Kleinschreibung). Der
--     Adapter behandelt die daraus folgende unique violation (23505)
--     als Erfolg, damit das Formular nicht verrät, wer schon steht.
-- ============================================================

create table public.waitlist (
  id          uuid primary key default gen_random_uuid(),
  email       text not null check (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+[.][A-Za-z]{2,}$'),
  source      text default 'landingpage',
  created_at  timestamptz not null default now()
);

-- Doppelte Anmeldung verhindern, unabhängig von Groß-/Kleinschreibung.
create unique index waitlist_email_lower_idx on public.waitlist (lower(email));

alter table public.waitlist enable row level security;

-- Eintragen erlaubt für anon und authenticated (Landing ist öffentlich,
-- aber auch eingeloggte Besucher dürfen sich eintragen).
create policy "waitlist: anon und authenticated dürfen eintragen"
  on public.waitlist for insert to anon, authenticated
  with check (true);

-- Nur INSERT — kein Lesen/Ändern/Löschen für diese Rollen.
grant insert on public.waitlist to anon, authenticated;

-- Lesen und Löschen (Liste auswerten, Löschanfragen erfüllen) nur per
-- Service-Role. service_role umgeht zwar RLS, braucht aber trotzdem die
-- Tabellenrechte — dieses Projekt vergibt sie explizit (Muster: 0024).
grant select, delete on public.waitlist to service_role;

-- migrate:down
-- Bewusst leer: dieses Projekt rollt Migrationen nie automatisiert zurueck
-- (s. AGENTS.md, Migrations-Workflow). dbmate verlangt den Marker trotzdem.
