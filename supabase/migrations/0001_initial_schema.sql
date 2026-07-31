-- ============================================================
-- Dashboard 2.0 — Migration 0001: Schema + RLS
-- Einspielen: Supabase SQL-Editor (dev zuerst, prod beim Merge von Phase 1)
-- Grundsatz: Default Deny. RLS auf jeder Tabelle, jede Erlaubnis explizit.
-- ============================================================

-- ------------------------------------------------------------
-- 1. PROFILES (1:1 zu auth.users)
-- ------------------------------------------------------------
create table public.profiles (
  id               uuid primary key references auth.users(id) on delete cascade,
  display_name     text not null,
  role             text not null check (role in ('athlete','coach')),
  coach_id         uuid references public.profiles(id),
  wellbeing_public boolean not null default false,  -- E2
  is_admin         boolean not null default false,  -- E3
  created_at       timestamptz not null default now()
);

-- Profil wird bei Account-Anlage automatisch erzeugt.
-- display_name/role kommen aus den Signup-Metadaten; coach_id/is_admin
-- setzt der Admin danach manuell per SQL (bewusst KEIN Self-Service).
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data->>'role', 'athlete')
  );
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ------------------------------------------------------------
-- 2. HELFER-FUNKTIONEN (security definer, damit Policies nicht
--    rekursiv an der RLS von profiles hängen bleiben)
-- ------------------------------------------------------------
create or replace function public.is_coach_of(aid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles p
    where p.id = aid and p.coach_id = auth.uid()
  );
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.is_admin
  );
$$;

create or replace function public.wellbeing_is_public(aid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles p
    where p.id = aid and p.wellbeing_public
  );
$$;

-- ------------------------------------------------------------
-- 3. FACHTABELLEN
-- ------------------------------------------------------------
create table public.goals (
  id           uuid primary key default gen_random_uuid(),
  athlete_id   uuid not null references public.profiles(id) on delete cascade,
  kind         text not null,
  target_value numeric,
  target_date  date,
  note         text,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now()
);

create table public.events (
  id         uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references public.profiles(id) on delete cascade,
  title      text not null,
  event_date date not null,
  priority   text not null check (priority in ('A','B','C')),
  note       text,
  created_at timestamptz not null default now()
);

create table public.wellbeing (
  id         uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references public.profiles(id) on delete cascade,
  date       date not null,
  sleep      smallint check (sleep between 1 and 5),
  energy     smallint check (energy between 1 and 5),
  muscles    smallint check (muscles between 1 and 5),
  mood       smallint check (mood between 1 and 5),
  note       text,                                   -- NIE öffentlich (E2)
  created_at timestamptz not null default now(),
  unique (athlete_id, date)                          -- 1 Check-in pro Tag, Upsert
);

create table public.plan_cards (
  id           uuid primary key default gen_random_uuid(),
  athlete_id   uuid not null references public.profiles(id) on delete cascade,
  planned_date date not null,
  sort_order   smallint not null default 0,
  title        text not null,
  workout_type text not null,
  duration_min smallint,
  tss_planned  smallint,
  status       text not null default 'geplant'
               check (status in ('geplant','erledigt','ausgefallen')),
  note         text,
  created_at   timestamptz not null default now()
);

create table public.proposals (
  id         uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references public.profiles(id) on delete cascade,
  coach_id   uuid not null references public.profiles(id),
  payload    jsonb not null check (jsonb_typeof(payload) = 'object'
                                   and payload ? 'typ'),
  source     text not null check (source in ('human','claude')),
  status     text not null default 'offen'
             check (status in ('offen','angenommen','abgelehnt')),
  decided_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.feedback (
  id           uuid primary key default gen_random_uuid(),
  athlete_id   uuid references public.profiles(id) on delete set null,
  visitor_name text check (char_length(visitor_name) <= 60),
  message      text not null check (char_length(message) between 1 and 1000),
  is_approved  boolean not null default false,       -- Spam-Schutz Nr. 1
  created_at   timestamptz not null default now()
);

-- ------------------------------------------------------------
-- 4. RLS AKTIVIEREN — ausnahmslos
-- ------------------------------------------------------------
alter table public.profiles   enable row level security;
alter table public.goals      enable row level security;
alter table public.events     enable row level security;
alter table public.wellbeing  enable row level security;
alter table public.plan_cards enable row level security;
alter table public.proposals  enable row level security;
alter table public.feedback   enable row level security;

-- ------------------------------------------------------------
-- 5. POLICIES
-- ------------------------------------------------------------

-- PROFILES: Anzeige-Daten sind öffentlich (Namen stehen ohnehin im Dashboard).
create policy "profiles: öffentlich lesbar"
  on public.profiles for select
  to anon, authenticated
  using (true);

-- Eigenes Profil ändern — aber NUR die harmlosen Spalten (siehe Grants unten).
create policy "profiles: eigenes Profil ändern"
  on public.profiles for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- Spalten-Härtung: verhindert Selbst-Beförderung zu Admin/Coach oder
-- Trainer-Wechsel per DevTools. RLS wirkt pro Zeile, Grants pro Spalte —
-- beides zusammen ergibt: eigene Zeile, aber nur diese zwei Felder.
revoke update on public.profiles from authenticated;
grant  update (display_name, wellbeing_public) on public.profiles to authenticated;

-- GOALS / EVENTS / PLAN_CARDS: öffentlich lesbar (E1),
-- schreiben nur Athlet selbst oder sein Trainer.
create policy "goals: öffentlich lesbar"
  on public.goals for select to anon, authenticated using (true);
create policy "goals: Athlet+Trainer schreiben"
  on public.goals for all to authenticated
  using (athlete_id = auth.uid() or public.is_coach_of(athlete_id))
  with check (athlete_id = auth.uid() or public.is_coach_of(athlete_id));

create policy "events: öffentlich lesbar"
  on public.events for select to anon, authenticated using (true);
create policy "events: Athlet+Trainer schreiben"
  on public.events for all to authenticated
  using (athlete_id = auth.uid() or public.is_coach_of(athlete_id))
  with check (athlete_id = auth.uid() or public.is_coach_of(athlete_id));

create policy "plan_cards: öffentlich lesbar"
  on public.plan_cards for select to anon, authenticated using (true);
create policy "plan_cards: Athlet+Trainer schreiben"
  on public.plan_cards for all to authenticated
  using (athlete_id = auth.uid() or public.is_coach_of(athlete_id))
  with check (athlete_id = auth.uid() or public.is_coach_of(athlete_id));

-- WELLBEING: Basistabelle NUR für Athlet + Trainer (inkl. note).
-- Öffentlicher Zugriff läuft ausschließlich über die View unten.
create policy "wellbeing: Athlet+Trainer lesen"
  on public.wellbeing for select to authenticated
  using (athlete_id = auth.uid() or public.is_coach_of(athlete_id));
create policy "wellbeing: nur Athlet schreibt"
  on public.wellbeing for insert to authenticated
  with check (athlete_id = auth.uid());
create policy "wellbeing: nur Athlet ändert"
  on public.wellbeing for update to authenticated
  using (athlete_id = auth.uid())
  with check (athlete_id = auth.uid());
create policy "wellbeing: nur Athlet löscht"
  on public.wellbeing for delete to authenticated
  using (athlete_id = auth.uid());

-- Öffentliche Befinden-Sicht (E2): ohne note, nur wenn der Athlet
-- wellbeing_public aktiviert hat. View läuft mit Owner-Rechten und
-- filtert selbst — deshalb ist der Filter hier Pflicht, nicht Deko.
create view public.wellbeing_shared
with (security_invoker = off) as
  select w.athlete_id, w.date, w.sleep, w.energy, w.muscles, w.mood
  from public.wellbeing w
  where public.wellbeing_is_public(w.athlete_id);

revoke all on public.wellbeing_shared from anon, authenticated;
grant select on public.wellbeing_shared to anon, authenticated;

-- PROPOSALS: sieht nur der betroffene Athlet und der erstellende Trainer.
create policy "proposals: Beteiligte lesen"
  on public.proposals for select to authenticated
  using (athlete_id = auth.uid() or coach_id = auth.uid());
create policy "proposals: Trainer erstellt für seinen Athleten"
  on public.proposals for insert to authenticated
  with check (coach_id = auth.uid() and public.is_coach_of(athlete_id));
create policy "proposals: Athlet entscheidet"
  on public.proposals for update to authenticated
  using (athlete_id = auth.uid())
  with check (athlete_id = auth.uid());
create policy "proposals: Trainer löscht eigene offene"
  on public.proposals for delete to authenticated
  using (coach_id = auth.uid() and status = 'offen');

-- Spalten-Härtung: der Athlet darf beim Entscheiden nur den Status
-- und den Zeitstempel setzen, nicht den Vorschlag umschreiben.
revoke update on public.proposals from authenticated;
grant  update (status, decided_at) on public.proposals to authenticated;

-- FEEDBACK: jeder darf einreichen (unfreigegeben!), nur Freigegebenes
-- ist öffentlich, nur Admin moderiert.
create policy "feedback: Freigegebenes öffentlich, Admin sieht alles"
  on public.feedback for select to anon, authenticated
  using (is_approved or public.is_admin());
create policy "feedback: jeder darf einreichen"
  on public.feedback for insert to anon, authenticated
  with check (is_approved = false);              -- Selbst-Freigabe unmöglich
create policy "feedback: Admin gibt frei"
  on public.feedback for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy "feedback: Admin löscht"
  on public.feedback for delete to authenticated
  using (public.is_admin());

-- ============================================================
-- PRÜFLISTE nach dem Einspielen (dev-Projekt, Phase-0-Checkpunkt):
-- als anon:      goals lesen ✓ · goals schreiben ✗ · wellbeing lesen ✗
--                wellbeing_shared lesen ✓ (leer solange Toggle aus)
--                feedback mit is_approved=true einfügen ✗
-- als Athlet A:  wellbeing von Athlet B lesen ✗ · eigene schreiben ✓
--                profiles.is_admin an sich selbst setzen ✗ (Grant greift)
-- als Trainer A: plan_cards von Athlet A schreiben ✓ · von Athlet B ✗
--                proposals für fremden Athleten anlegen ✗
-- ============================================================
