/* ============================================================
   SCRIPTS/SEED-OWN-RECIPES.JS — Einmal-Seed für eigene Rezepte
   (Fahrplan 23, Etappe E3, V3/V4/V5/V7)

   Liest eine JSON-Datei mit Rezepten, validiert jedes und
   schreibt sie (per Upsert auf external_id) in die `recipes`-
   Tabelle mit source='own', status='approved', submitted_by=null.

   Auth-Modell: Service-Role-Key (SUPABASE_SERVICE_ROLE_KEY) via
   scripts/lib/env.js — kein Athleten-Login nötig.

   Flags / Env:
     --file <path>   Pflicht: JSON-Datei mit Array von Rezept-Objekten
     --apply         Schreibt wirklich (Dry-Run ohne dieses Flag)
     --env=prod      Nutzt die *_PROD-Credentials aus .env (dashboard-prod
                     auf supabase.co — Altlast). Für den Live-Stack (apps01)
                     URL/Key als Shell-Env überschreiben:
                       SUPABASE_URL_OVERRIDE / SUPABASE_SERVICE_ROLE_KEY_OVERRIDE

   Idempotent: external_id = "own-" + slug(title); upsert auf
   external_id — wiederholtes Ausführen aktualisiert bestehende Zeilen.

   Input-Format (JSON-Array, jedes Objekt — snake_case = DB-Spaltennamen):

   {
     title: string,               // Pflicht, nicht leer
     meal_type: string[],         // Pflicht: "breakfast"/"lunch"/"dinner"/"snack"
     diet_tags: string[],         // Optional: "veg"/"vegan"/"glutenfrei"/"omnivor"
                                 //  (vegan = ["veg", "vegan"])
     contains_tags: string[],     // Optional: gültige AllergenKeys aus ALLERGEN_KEYS
                                 //  (leeres Array = "unremarkable")
     servings: number,            // Pflicht, > 0
     ingredients: [{              // Optional, wenn vorhanden:
       name: string,              //   Pflicht
       amount: number,            //   Pflicht (> 0)
       unit: string,              //   Pflicht
       category: string           //   Pflicht — für Einkaufsliste (E6), z.B.:
                                 //     "Obst & Gemüse", "Milchprodukte",
                                 //     "Getreide & Backwaren", "Fleisch & Fisch",
                                 //     "Eier", "Hülsenfrüchte & Konserven",
                                 //     "Nüsse & Samen", "Öle", "Gewürze & Vorrat"
     }],
     instructions: [{             // Optional, wenn vorhanden:
       text: string,              //   Pflicht
       timerSeconds: number       //   Optional
     }],
     nutrition: {                 // Optional — fehlend = Warning, kein Fehler
       kcal: number,              //   Pflicht, wenn nutrition vorhanden
       protein: number,           //   Pflicht, wenn nutrition vorhanden
       carbs: number,             //   Pflicht, wenn nutrition vorhanden
       fat: number                //   Pflicht, wenn nutrition vorhanden
     },
     image_url: string            // Optional
   }

   Der echte Datenbestand (Alex' Rezepte) liegt im privaten
   planning-Repo und wird über --file übergeben — NICHT committed.
   ============================================================ */

import { readFileSync } from "node:fs";
import { ENV, requireEnv } from "./lib/env.js";
import { log } from "./lib/log.js";
import { validateRecipes, titleToSlug } from "./lib/validate-recipe.js";

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const PROD = args.includes("--env=prod");
const FILE_ARG = (() => {
  const idx = args.indexOf("--file");
  if (idx === -1 || idx + 1 >= args.length) return null;
  return args[idx + 1];
})();

// Nur source + status, die wir setzen: own/approved.
// Die DB erlaubt beim Upsert nur gültige Werte — hier keine Prüfung nötig,
// da validateRecipes nichts zu source/status sagt (sie sind fest verdrahtet).

/* ── CLI-Parsing ──────────────────────────────────────────── */

if (!FILE_ARG) {
  console.error("❌ --file <path> ist Pflicht. Beispiel: node scripts/seed-own-recipes.js --file rezepte.json");
  process.exit(1);
}

requireEnv(
  PROD
    ? ["SUPABASE_URL_PROD", "SUPABASE_SERVICE_ROLE_KEY_PROD"]
    : ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]
);

const URL_OVERRIDE = process.env.SUPABASE_URL_OVERRIDE || "";
const KEY_OVERRIDE = process.env.SUPABASE_SERVICE_ROLE_KEY_OVERRIDE || "";
if (!!URL_OVERRIDE !== !!KEY_OVERRIDE) {
  log.error("SUPABASE_URL_OVERRIDE und SUPABASE_SERVICE_ROLE_KEY_OVERRIDE nur zusammen setzen.");
  process.exit(1);
}
const SUPABASE_URL = URL_OVERRIDE || (PROD ? ENV.SUPABASE_URL_PROD : ENV.SUPABASE_URL);
const SERVICE_ROLE_KEY = KEY_OVERRIDE || (PROD ? ENV.SUPABASE_SERVICE_ROLE_KEY_PROD : ENV.SUPABASE_SERVICE_ROLE_KEY);
if (URL_OVERRIDE) log.info("⚙️  URL/Service-Role-Key via Shell-Override (apps01-Pfad).");

// Keine URL in Ausgabe (Issue #25 Edge Case: "Output must never print
// SUPABASE_SERVICE_ROLE_KEY, the target URL").
log.info(`🌐 Ziel: ${PROD ? "prod" : "dev"}`);
log.info(
  APPLY
    ? "🚀 Seed eigener Rezepte (--apply) …"
    : "🔍 Dry-Run (kein --apply — es wird nichts geschrieben) …"
);

/* ── Datei lesen ───────────────────────────────────────────── */

let raw;
try {
  raw = readFileSync(FILE_ARG, "utf-8");
} catch (e) {
  log.error(`Datei kann nicht gelesen werden: ${FILE_ARG} — ${e.message}`);
  process.exit(1);
}

let recipes;
try {
  recipes = JSON.parse(raw);
} catch (e) {
  log.error(`Datei ist kein gültiges JSON: ${e.message}`);
  process.exit(1);
}

if (!Array.isArray(recipes)) {
  log.error("Datei enthält kein Array von Rezepten.");
  process.exit(1);
}

log.info(`📖 ${recipes.length} Rezept(e) aus ${FILE_ARG} gelesen.`);

/* ── Validieren ────────────────────────────────────────────── */

const validation = validateRecipes(recipes);
if (!validation.ok) {
  log.error("❌ Validierung fehlgeschlagen:");
  for (const err of validation.errors) {
    log.error(`   - ${err}`);
  }
  process.exit(1);
}

log.info("✅ Validierung bestanden.");

// Warnings aus der Validierung loggen (z.B. fehlende Nährwerte)
let noNutritionCount = 0;
if (validation.warnings) {
  for (const w of validation.warnings) {
    if (w.includes("keine Nährwertangaben")) {
      noNutritionCount++;
    }
  }
  // Beim Dry-Run alle Warnings zeigen, beim Apply nur zählen
  if (!APPLY) {
    for (const w of validation.warnings) {
      log.warn(w);
    }
  }
}

/* ── Upsert-Vorbereitung ───────────────────────────────────── */

const rows = [];
const seenSlugs = new Set();

for (const r of recipes) {
  const slug = titleToSlug(r.title);
  const externalId = `own-${slug}`;

  // Kollision erkennen (zwei verschiedene Titel → gleicher Slug)
  if (slug && seenSlugs.has(slug)) {
    log.warn(`⚠️  Slug-Kollision: "${r.title}" → external_id "${externalId}" bereits belegt.`);
  }
  if (slug) seenSlugs.add(slug);

  const row = {
    source: "own",
    external_id: externalId,
    status: "approved",
    submitted_by: null,
    rejection_reason: null,
    title: r.title,
    meal_type: r.meal_type,
    diet_tags: r.diet_tags ?? null,
    contains_tags: r.contains_tags ?? [],
    servings: r.servings,
    ingredients: r.ingredients ?? null,
    instructions: r.instructions ?? null,
    nutrition: r.nutrition ?? null,
    image_url: r.image_url ?? null,
  };

  rows.push({ slug, externalId, row });
}

log.info(`📦 ${rows.length} Rezept(e) für Upsert vorbereitet.`);
if (noNutritionCount > 0) {
  log.warn(`⚠️  ${noNutritionCount} Rezept(e) ohne Nährwertangaben.`);
}

if (rows.length > 0) {
  log.info("   Rezepte (Titel → external_id):");
  for (const { externalId, row } of rows) {
    log.info(`     "${row.title}" → ${externalId}`);
  }
}

/* ── Dry-Run ───────────────────────────────────────────────── */

if (!APPLY) {
  log.info("🔍 Dry-Run beendet — mit --apply werden die Rezepte in die DB geschrieben.");
  log.summary();
  process.exit(0);
}

/* ── Wirklicher Write (PostgREST Upsert) ──────────────────── */

const headers = {
  "Content-Type": "application/json",
  apikey: SERVICE_ROLE_KEY,
  Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
  Prefer: "resolution=merge-duplicates",
};

const url = `${SUPABASE_URL}/rest/v1/recipes?on_conflict=external_id`;

let successCount = 0;
let errorCount = 0;

// PostgREST akzeptiert upsert with POST (resolution=merge-duplicates)
// bei on_conflict auf einem unique column. external_id hat einen
// partial unique index (WHERE external_id is not null) aus Migration 0060.
// Der Upsert-Key ist external_id.
//
// Wir senden alle Zeilen in einem Request (Batch-Upsert).
// Bei Fehlern einzelner Zeilen bricht PostgREST den gesamten Request ab —
// darum im Fehlerfall in kleinere Batches zerlegen.

async function upsertBatch(batch) {
  const body = batch.map(({ row }) => row);
  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`PostgREST-Fehler (HTTP ${res.status}): ${text}`);
  }
}

// PostgREST hat einen Default-Request-Body-Limit (~1 MB).
// Wir teilen in Batches à 50.
const BATCH_SIZE = 50;

for (let i = 0; i < rows.length; i += BATCH_SIZE) {
  const batch = rows.slice(i, i + BATCH_SIZE);
  try {
    await upsertBatch(batch);
    successCount += batch.length;
  } catch {
    // Bei Fehler einzeln versuchen, damit erfolgreiche nicht verloren gehen
    for (const entry of batch) {
      try {
        await upsertBatch([entry]);
        successCount++;
      } catch (e2) {
        log.error(`❌ Fehler bei "${entry.row.title}": ${e2.message}`);
        errorCount++;
      }
    }
  }
}

/* ── Abschluss ──────────────────────────────────────────────── */

log.info(`✅ ${successCount} Rezept(e) erfolgreich geschrieben.`);
if (errorCount > 0) {
  log.error(`❌ ${errorCount} Rezept(e) fehlgeschlagen.`);
}
log.summary();

if (errorCount > 0) process.exit(1);