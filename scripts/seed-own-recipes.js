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

   Idempotent: external_id = "own-" + slug(title). Neue Rezepte werden angelegt,
   unveränderte übersprungen, geänderte aktualisiert. Da E18 den Inhalt
   freigegebener Rezepte sperrt, läuft eine Änderung über den Admin-Weg
   (Status kurz 'pending', Inhalt ändern, wieder 'approved'; die ID bleibt).

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
                                 //     "Nüsse & Samen", "Öle, Gewürze & Vorrat"
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
import { fileURLToPath } from "node:url";
import { ENV, requireEnv } from "./lib/env.js";
import { log as logModule } from "./lib/log.js";
import { validateRecipes, titleToSlug } from "./lib/validate-recipe.js";

/* ── buildRows ─────────────────────────────────────────────── */

/**
 * Validiere Rezepte und baue Upsert-Rows.
 * @param {Object[]} recipes
 * @param {Object} [logger]  optional log-Interface (default: logModule)
 * @returns {{
 *   ok:true,
 *   rows:Array<{slug:string, externalId:string, row:Object}>,
 *   warnings?:string[]
 * } | {ok:false, errors:string[], warnings?:string[]}}
 */
function buildRows(recipes, logger = logModule) {
  const validation = validateRecipes(recipes);
  if (!validation.ok) return validation;

  const seenSlugs = new Set();
  const rows = [];
  const errors = [];

  for (const r of recipes) {
    const slug = titleToSlug(r.title);
    const externalId = `own-${slug}`;
    if (slug && seenSlugs.has(slug)) {
      errors.push(`Slug-Kollision: "${r.title}" → external_id "${externalId}" bereits belegt durch einen anderen Titel`);
    }
    if (slug) seenSlugs.add(slug);

    rows.push({
      slug,
      externalId,
      row: {
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
      },
    });
  }
  if (errors.length > 0) {
    for (const w of validation.warnings || []) logger.warn(w);
    return { ok: false, errors };
  }
  return { ok: true, rows, warnings: validation.warnings };
}

/* ── Schreiben: neu anlegen, überspringen, ändern ───────────── */

/** Inhaltsfelder, die E18 (Trigger recipes_check_content_update) schützt. */
const CONTENT_FIELDS = [
  "title", "meal_type", "diet_tags", "contains_tags", "servings",
  "ingredients", "instructions", "nutrition", "image_url",
];

/** Schlüssel-sortierte JSON-Darstellung (jsonb liefert die Schlüssel in anderer Reihenfolge). */
function stable(v) {
  if (Array.isArray(v)) return `[${v.map(stable).join(",")}]`;
  if (v && typeof v === "object") {
    return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${stable(v[k])}`).join(",")}}`;
  }
  return JSON.stringify(v ?? null);
}

/** Gleicher Inhalt? (contains_tags: null und [] gelten als gleich) */
function sameContent(a, b) {
  return CONTENT_FIELDS.every((f) => {
    const x = f === "contains_tags" ? (a[f] ?? []) : (a[f] ?? null);
    const y = f === "contains_tags" ? (b[f] ?? []) : (b[f] ?? null);
    return stable(x) === stable(y);
  });
}

function contentOf(row) {
  return Object.fromEntries(CONTENT_FIELDS.map((f) => [f, row[f] ?? (f === "contains_tags" ? [] : null)]));
}

/**
 * Schreibt die Rezepte:
 *  - neu: Upsert auf external_id (race-sicher, in Batches mit Einzel-Rückfall)
 *  - vorhanden und gleich: nichts
 *  - vorhanden und geändert: E18 sperrt Inhaltsänderungen an freigegebenen
 *    Rezepten (auch für service_role). Erlaubt ist der Weg des Admins (E16):
 *    Status kurz auf 'pending', Inhalt ändern, wieder 'approved'. Die ID bleibt,
 *    Stimmen und Wochenpläne bleiben erhalten. Bricht ein Schritt ab, wird der
 *    Status best-effort zurückgesetzt; ein verbliebenes 'pending' korrigiert der
 *    nächste Lauf.
 * Schlägt schon das Lesen der vorhandenen Rezepte fehl, wird nichts geschrieben.
 */
async function applyRows(rows, supabaseUrl, serviceRoleKey, fetchFn, logger) {
  const base = `${supabaseUrl}/rest/v1/recipes`;
  const auth = {
    "Content-Type": "application/json",
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
  };
  const counts = { insertedCount: 0, updatedCount: 0, unchangedCount: 0, errorCount: 0 };

  async function check(res) {
    if (!res.ok) throw new Error(`PostgREST-Fehler (HTTP ${res.status}): ${await res.text()}`);
  }

  // 1. Vorhandene Rezepte lesen
  let existing;
  try {
    const ids = rows.map((r) => r.externalId).join(",");
    const select = ["external_id", "source", "status", ...CONTENT_FIELDS].join(",");
    const res = await fetchFn(`${base}?select=${select}&external_id=in.(${ids})`, { method: "GET", headers: auth });
    await check(res);
    existing = new Map((await res.json()).map((e) => [e.external_id, e]));
  } catch (e) {
    logger.error(`Vorhandene Rezepte konnten nicht gelesen werden: ${e.message}`);
    return { ...counts, errorCount: rows.length, successCount: 0 };
  }

  const toInsert = [];
  const toUpdate = [];
  for (const entry of rows) {
    const found = existing.get(entry.externalId);
    if (!found) toInsert.push(entry);
    else if (found.source !== "own") {
      logger.error(`"${entry.row.title}": external_id ${entry.externalId} gehört zu einer anderen Quelle (${found.source}) — übersprungen.`);
      counts.errorCount++;
    } else if (sameContent(entry.row, found) && found.status === "approved") counts.unchangedCount++;
    else toUpdate.push({ entry, found });
  }

  // 2. Neue Rezepte (Upsert auf external_id)
  async function upsertBatch(batch) {
    const res = await fetchFn(`${base}?on_conflict=external_id`, {
      method: "POST",
      headers: { ...auth, Prefer: "resolution=merge-duplicates" },
      body: JSON.stringify(batch.map(({ row }) => row)),
    });
    await check(res);
  }
  const BATCH_SIZE = 50;
  for (let i = 0; i < toInsert.length; i += BATCH_SIZE) {
    const batch = toInsert.slice(i, i + BATCH_SIZE);
    try {
      await upsertBatch(batch);
      counts.insertedCount += batch.length;
    } catch {
      for (const entry of batch) {
        try { await upsertBatch([entry]); counts.insertedCount++; }
        catch (e2) { logger.error(`Fehler bei "${entry.row.title}": ${e2.message}`); counts.errorCount++; }
      }
    }
  }

  // 3. Geänderte Rezepte (pending -> ändern -> approved)
  async function patch(externalId, body) {
    await check(await fetchFn(`${base}?external_id=eq.${externalId}`, {
      method: "PATCH",
      headers: { ...auth, Prefer: "return=minimal" },
      body: JSON.stringify(body),
    }));
  }
  for (const { entry, found } of toUpdate) {
    const { externalId, row } = entry;
    const frozen = found.status !== "pending";
    try {
      if (frozen) await patch(externalId, { status: "pending" });
      try {
        await patch(externalId, contentOf(row));
      } catch (e) {
        if (frozen) { try { await patch(externalId, { status: "approved" }); } catch { /* nächster Lauf korrigiert */ } }
        throw e;
      }
      await patch(externalId, { status: "approved" });
      counts.updatedCount++;
    } catch (e) {
      logger.error(`Fehler beim Ändern von "${row.title}": ${e.message}`);
      counts.errorCount++;
    }
  }

  return {
    ...counts,
    successCount: counts.insertedCount + counts.updatedCount + counts.unchangedCount,
  };
}

/* ── seedOwnRecipes (öffentliche API, testbar) ─────────────── */

export async function seedOwnRecipes({
  recipes, apply, supabaseUrl, serviceRoleKey,
  fetch: fetchFn = globalThis.fetch,
  log: logger = logModule,
}) {
  const built = buildRows(recipes, logger);
  if (!built.ok) return built;

  let noNutritionCount = 0;
  if (built.warnings) {
    noNutritionCount = built.warnings.filter((w) => w.includes("keine Nährwertangaben")).length;
    if (!apply) for (const w of built.warnings) logger.warn(w);
  }

  logger.info(`📦 ${built.rows.length} Rezept(e) für Upsert vorbereitet.`);
  if (noNutritionCount > 0) logger.warn(`${noNutritionCount} Rezept(e) ohne Nährwertangaben.`);
  if (built.rows.length > 0) {
    logger.info("   Rezepte (Titel → external_id):");
    for (const { externalId, row } of built.rows) logger.info(`     "${row.title}" → ${externalId}`);
  }

  if (!apply) return { ok: true, rows: built.rows, dryRun: true, warnings: built.warnings };

  const result = await applyRows(built.rows, supabaseUrl, serviceRoleKey, fetchFn, logger);
  const { successCount, errorCount, insertedCount, updatedCount, unchangedCount } = result;
  logger.info(`✅ ${insertedCount} neu, ${updatedCount} geändert, ${unchangedCount} unverändert.`);
  if (errorCount > 0) logger.error(`${errorCount} Rezept(e) fehlgeschlagen.`);
  return {
    ok: errorCount === 0, rows: built.rows, successCount, errorCount,
    insertedCount, updatedCount, unchangedCount, warnings: built.warnings,
  };
}

/* ── CLI-Entry-Point ────────────────────────────────────────── */

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const APPLY = args.includes("--apply");
  const PROD = args.includes("--env=prod");
  const FILE_ARG = (() => { const idx = args.indexOf("--file"); return (idx === -1 || idx + 1 >= args.length) ? null : args[idx + 1]; })();

  if (!FILE_ARG) { console.error("❌ --file <path> ist Pflicht."); process.exit(1); }

  requireEnv(PROD ? ["SUPABASE_URL_PROD", "SUPABASE_SERVICE_ROLE_KEY_PROD"] : ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]);

  const URL_OVERRIDE = process.env.SUPABASE_URL_OVERRIDE || "";
  const KEY_OVERRIDE = process.env.SUPABASE_SERVICE_ROLE_KEY_OVERRIDE || "";
  if (!!URL_OVERRIDE !== !!KEY_OVERRIDE) { logModule.error("URL/Key-Override nur zusammen setzen."); process.exit(1); }
  const SUPABASE_URL = URL_OVERRIDE || (PROD ? ENV.SUPABASE_URL_PROD : ENV.SUPABASE_URL);
  const SERVICE_ROLE_KEY = KEY_OVERRIDE || (PROD ? ENV.SUPABASE_SERVICE_ROLE_KEY_PROD : ENV.SUPABASE_SERVICE_ROLE_KEY);

  if (URL_OVERRIDE) logModule.info("⚙️  URL/Service-Role-Key via Shell-Override (apps01-Pfad).");
  logModule.info(`🌐 Ziel: ${URL_OVERRIDE ? "Shell-Override (apps01-Pfad)" : PROD ? "prod (supabase.co, Altlast)" : "dev"}`);
  logModule.info(APPLY ? "🚀 Seed eigener Rezepte (--apply) …" : "🔍 Dry-Run …");

  let raw;
  try { raw = readFileSync(FILE_ARG, "utf-8"); } catch (e) { logModule.error(`Datei nicht lesbar: ${FILE_ARG} — ${e.message}`); process.exit(1); }

  let recipes;
  try { recipes = JSON.parse(raw); } catch (e) { logModule.error(`Kein gültiges JSON: ${e.message}`); process.exit(1); }

  if (!Array.isArray(recipes)) { logModule.error("Datei enthält kein Array."); process.exit(1); }
  logModule.info(`📖 ${recipes.length} Rezept(e) aus ${FILE_ARG} gelesen.`);

  seedOwnRecipes({ recipes, apply: APPLY, supabaseUrl: SUPABASE_URL, serviceRoleKey: SERVICE_ROLE_KEY, log: logModule })
    .then((result) => {
      if (!result.ok && result.errors) {
        logModule.error("Validierung fehlgeschlagen:");
        for (const err of result.errors) logModule.error(`  - ${err}`);
      }
      if (result.dryRun) logModule.info("🔍 Dry-Run beendet — mit --apply werden die Rezepte in die DB geschrieben.");
      if (result.warnings && APPLY && result.warnings.some((w) => w.includes("keine Nährwertangaben"))) {
        logModule.warn(`${result.warnings.filter((w) => w.includes("keine Nährwertangaben")).length} Rezept(e) ohne Nährwertangaben.`);
      }
      logModule.summary();
      if (!result.ok) process.exit(1);
    })
    .catch((err) => { logModule.error("Unerwarteter Fehler:", err.message); process.exit(1); });
}