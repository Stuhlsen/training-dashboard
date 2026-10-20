-- migrate:up

-- ============================================================
-- Dashboard 2.0 — Migration 0073: Zubereitungszeit je Rezept
-- Einspielen: dbmate, dev-Projekt zuerst (dashboard-dev), danach der
--             apps01-Self-Host-Stack (echte Produktion — NICHT
--             dashboard-prod auf supabase.co)
-- Referenz: planning/fahrplan-30-bewertung-zeit-portionen.md — B1 (Z-1 .. Z-3)
--
-- ZIEL
--   1. recipes.prep_minutes: Zubereitungszeit in Minuten gesamt (inkl. Ruhezeit),
--      ganze Zahl 1..600. NULL nur fuer Bestand ohne Schaetzung; neue und
--      geaenderte Rezepte verlangt der Dienst (admin-api) mit Wert.
--   2. Die 60 eigenen Bestandsrezepte (source = 'own', external_id = 'own-<slug>')
--      bekommen eine Schaetzung aus Seed-Minuten und Schritt-Timern. Rezepte,
--      die es in der Datenbank nicht gibt, werden schlicht nicht getroffen.
--   3. Die Zeit zaehlt wie ein Inhaltsfeld (E18): freigegebene Rezepte sind
--      gesperrt, ausser fuer den Dienst bei verifizierten Autoren (V-4).
-- ============================================================

-- ------------------------------------------------------------
-- 1. Spalte + Wertebereich
-- ------------------------------------------------------------
alter table public.recipes
  add column if not exists prep_minutes integer;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'recipes_prep_minutes_range'
      and conrelid = 'public.recipes'::regclass
  ) then
    alter table public.recipes
      add constraint recipes_prep_minutes_range check (prep_minutes between 1 and 600);
  end if;
end
$$;

comment on column public.recipes.prep_minutes is
  'Fahrplan 30 B1: Zubereitungszeit in Minuten gesamt (inkl. Ruhezeit), 1..600. NULL nur im Bestand ohne Schaetzung.';

-- ------------------------------------------------------------
-- 2. Schaetzung fuer die Bestandsrezepte
-- ------------------------------------------------------------
-- Vor dem Trigger-Update unten: prep_minutes ist hier noch kein Inhaltsfeld,
-- die Sperre fuer freigegebene Rezepte (E18) greift also nicht.
update public.recipes r
   set prep_minutes = v.minutes
  from (values
    ('own-haferbrei-mit-banane-und-walnuessen', 15),
    ('own-ruehrei-mit-vollkornbrot-und-tomaten', 15),
    ('own-overnight-oats-mit-skyr-und-beeren', 490),
    ('own-vollkorn-pfannkuchen-mit-quark-und-apfel', 25),
    ('own-linsen-bolognese-mit-vollkornnudeln', 35),
    ('own-haehnchen-reis-pfanne-mit-paprika-und-brokkoli', 30),
    ('own-lachs-mit-kartoffeln-und-gruenen-bohnen', 40),
    ('own-kichererbsen-gemuese-curry-mit-reis', 35),
    ('own-thunfisch-vollkornwrap-mit-salat', 15),
    ('own-ofenkartoffeln-mit-kraeuterquark', 50),
    ('own-bananen-haferriegel-mit-erdnussmus', 40),
    ('own-skyr-mit-beeren-und-mandeln', 5),
    ('own-suesskartoffel-bohnen-bowl', 40),
    ('own-nudelsalat-mit-feta-und-gemuese', 25),
    ('own-chia-pudding-mit-kokosmilch-und-mango', 130),
    ('own-bratkartoffeln-mit-spiegelei', 25),
    ('own-porridge-mit-haferdrink-apfel-und-zimt', 10),
    ('own-joghurt-bowl-mit-obst-und-leinsamen', 5),
    ('own-vollkornbrot-mit-avocado-und-ei', 15),
    ('own-ruehr-tofu-mit-spinat-und-tomaten', 25),
    ('own-milchreis-mit-apfelmus-und-zimt', 35),
    ('own-bananen-pfannkuchen-mit-haferflocken', 20),
    ('own-hirsebrei-mit-apfel-und-sonnenblumenkernen', 20),
    ('own-kaese-omelett-mit-tomaten-und-avocado', 15),
    ('own-vollkornbroetchen-mit-huettenkaese-und-gurke', 10),
    ('own-reisbrei-mit-banane-und-honig', 25),
    ('own-reiswaffeln-mit-erdnussmus-und-banane', 5),
    ('own-quark-mit-beeren-und-haferflocken', 5),
    ('own-dattel-mandel-kugeln', 15),
    ('own-hummus-mit-gemuesesticks', 15),
    ('own-hartgekochte-eier-mit-tomaten-und-reiswaffeln', 15),
    ('own-reisbaellchen-mit-thunfisch', 30),
    ('own-bananen-stulle-mit-honig', 5),
    ('own-beeren-skyr-smoothie', 5),
    ('own-beeren-bananen-smoothie-mit-sojadrink', 5),
    ('own-huettenkaese-mit-birne-und-walnuessen', 5),
    ('own-apfel-mit-mandelmus-und-zimt', 5),
    ('own-ofen-kichererbsen', 35),
    ('own-rote-linsen-kokos-suppe-mit-reis', 30),
    ('own-chili-sin-carne-mit-reis', 35),
    ('own-vollkornnudeln-mit-tomatensosse-und-haehnchen', 30),
    ('own-haehnchen-kokos-curry-mit-reis', 30),
    ('own-aglio-e-olio-mit-brokkoli-und-kichererbsen', 25),
    ('own-tofu-gemuese-pfanne-mit-reis', 25),
    ('own-shakshuka-mit-vollkornbrot', 25),
    ('own-spanische-kartoffel-tortilla-mit-salat', 35),
    ('own-quinoa-salat-mit-feta-und-gurke', 25),
    ('own-linsensalat-mit-paprika-und-petersilie', 30),
    ('own-kichererbsen-salat-mit-tahini-dressing', 20),
    ('own-kabeljau-mit-kartoffeln-und-gurkensalat', 35),
    ('own-garnelen-reispfanne-mit-paprika', 25),
    ('own-rinderhack-paprika-pfanne-mit-reis', 30),
    ('own-putengeschnetzeltes-mit-brokkoli-und-reis', 30),
    ('own-haehnchen-ofengemuese-mit-kartoffeln', 45),
    ('own-gebratener-reis-mit-ei-und-erbsen', 25),
    ('own-kartoffel-lauch-suppe-mit-vollkornbrot', 30),
    ('own-vollkornnudeln-mit-spinat-und-feta', 20),
    ('own-thunfisch-reis-salat-mit-mais', 25),
    ('own-hirse-gemuesepfanne-mit-joghurt-dip', 30),
    ('own-lachs-reis-bowl-mit-gurke-und-avocado', 30)
  ) as v(external_id, minutes)
 where r.external_id = v.external_id
   and r.source = 'own'
   and r.prep_minutes is null;

-- ------------------------------------------------------------
-- 3. Inhaltssperre: prep_minutes zaehlt als Inhaltsfeld
-- ------------------------------------------------------------
-- Rumpf wie in 0071, nur um prep_minutes erweitert.
create or replace function public.recipes_check_content_update()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.title is distinct from old.title
     or new.ingredients is distinct from old.ingredients
     or new.instructions is distinct from old.instructions
     or new.contains_tags is distinct from old.contains_tags
     or new.meal_type is distinct from old.meal_type
     or new.diet_tags is distinct from old.diet_tags
     or new.servings is distinct from old.servings
     or new.nutrition is distinct from old.nutrition
     or new.image_url is distinct from old.image_url
     or new.prep_minutes is distinct from old.prep_minutes
  then
    if old.status is distinct from 'pending' then
      -- Ausnahme V-4: nur der Dienst und nur fuer das freigegebene Rezept eines
      -- (noch) verifizierten Autors. Alles andere bleibt E18.
      if old.status = 'approved' and auth.role() = 'service_role' then
        if not public.is_verified_author(old.submitted_by) then
          raise exception 'E18: content fields can only be modified while recipe status = pending';
        end if;
      else
        raise exception 'E18: content fields can only be modified while recipe status = pending';
      end if;
    end if;
    if auth.role() <> 'service_role'
       and old.submitted_by is distinct from auth.uid() then
      raise exception 'E18: only the submitter may modify content fields';
    end if;
  end if;

  if new.status is distinct from old.status
     or new.rejection_reason is distinct from old.rejection_reason
  then
    if not public.is_admin() and auth.role() <> 'service_role' then
      raise exception 'E16: only admin or service_role may change status or rejection_reason';
    end if;
  end if;

  return new;
end;
$$;

-- migrate:down
-- Bewusst leer: dieses Projekt rollt Migrationen nie automatisiert zurueck
-- (s. AGENTS.md, Migrations-Workflow). dbmate verlangt den Marker trotzdem.
