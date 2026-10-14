/* ============================================================
   API/SUPABASE/MEAL-PLAN.TS — Essensplan-Adapter
   (Migration 0064, Fahrplan 23 E6 PR A)

   Result-Konvention exakt wie nutrition-goals.ts / recipes.ts:
   `{ ok: true, ... }` / `{ ok: false, error: { code, message } }`.

   Tabelle meal_plan_entries: UNIQUE (athlete_id, date, meal_slot) — ein
   Slot eines Tages trägt höchstens ein Rezept, ein erneutes Setzen ersetzt
   es (Upsert). `athleteId` ist die Profil-UUID, nicht die App-Kennung.

   RLS (0064): lesen dürfen alle Eingeloggten, schreiben nur der Eigentümer;
   ein Coach darf nur UPDATEn. Die RLS bleibt die Durchsetzung — hier nur die
   App-seitige Prüfung (Slot, servings > 0 und kein NaN, ISO-Datum), damit
   keine rohe Postgres-Constraint-Meldung in der UI landet.
   ============================================================ */

import { supabase, getAuthedClient } from "./client";
import type { MealPlanEntry, MealPlanEntryInput, MealSlot, Result } from "../types";

const NOT_CONFIGURED = { code: "UNKNOWN" as const, message: "Supabase nicht konfiguriert" };

const COLUMNS = "id, athlete_id, date, meal_slot, recipe_id, servings, created_at, updated_at";

const MEAL_SLOTS: readonly MealSlot[] = ["breakfast", "lunch", "dinner", "snack"];

interface MealPlanRow {
  id: string;
  athlete_id: string;
  date: string;
  meal_slot: MealSlot;
  recipe_id: string;
  servings: number | string;
  created_at: string;
  updated_at: string;
}

function toMealPlanEntry(row: MealPlanRow): MealPlanEntry {
  return {
    id: row.id,
    athleteId: row.athlete_id,
    date: row.date,
    mealSlot: row.meal_slot,
    recipeId: row.recipe_id,
    // numeric kann je nach Treiber als String ankommen
    servings: Number(row.servings),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Echtes Kalenderdatum im Format YYYY-MM-DD? ("2026-02-30" ist keins.) */
function isISODate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

/** Validiert einen Eintrag auf App-Ebene. Liefert einen Fehlertext oder null. */
function validateEntryInput(input: MealPlanEntryInput): string | null {
  if (!input.athleteId) return "Athlet fehlt.";
  if (!input.recipeId) return "Rezept fehlt.";
  if (!MEAL_SLOTS.includes(input.mealSlot)) return "Ungültige Mahlzeit.";
  if (!isISODate(input.date)) return "Ungültiges Datum.";
  if (typeof input.servings !== "number" || !Number.isFinite(input.servings) || input.servings <= 0) {
    return "Portionen müssen größer als 0 sein.";
  }
  return null;
}

/** Einträge eines Athleten im Zeitraum [fromISO, toISO] (beide inklusive),
 *  nach Datum aufsteigend. */
export async function listMealPlan(
  athleteId: string,
  fromISO: string,
  toISO: string,
): Promise<Result<{ entries: MealPlanEntry[] }>> {
  if (!supabase) return { ok: false, error: NOT_CONFIGURED };
  if (!isISODate(fromISO) || !isISODate(toISO)) {
    return { ok: false, error: { code: "SCHEMA", message: "Ungültiger Zeitraum." } };
  }

  const client = (await getAuthedClient()) ?? supabase;
  const { data, error } = await client
    .from("meal_plan_entries")
    .select(COLUMNS)
    .eq("athlete_id", athleteId)
    .gte("date", fromISO)
    .lte("date", toISO)
    .order("date", { ascending: true });
  if (error) return { ok: false, error: { code: "UNKNOWN", message: error.message } };
  return { ok: true, entries: ((data as MealPlanRow[] | null) ?? []).map(toMealPlanEntry) };
}

/** Setzt das Rezept eines Slots (Upsert auf athlete_id + date + meal_slot). */
export async function upsertMealPlanEntry(
  input: MealPlanEntryInput,
): Promise<Result<{ entry: MealPlanEntry }>> {
  if (!supabase) return { ok: false, error: NOT_CONFIGURED };

  const validationError = validateEntryInput(input);
  if (validationError) {
    return { ok: false, error: { code: "SCHEMA", message: validationError } };
  }

  const client = (await getAuthedClient()) ?? supabase;
  const { data, error } = await client
    .from("meal_plan_entries")
    .upsert(
      {
        athlete_id: input.athleteId,
        date: input.date,
        meal_slot: input.mealSlot,
        recipe_id: input.recipeId,
        servings: input.servings,
      },
      { onConflict: "athlete_id,date,meal_slot" },
    )
    .select(COLUMNS)
    .single<MealPlanRow>();
  if (error) return { ok: false, error: { code: "UNKNOWN", message: error.message } };
  return { ok: true, entry: toMealPlanEntry(data) };
}

/** Löscht einen Eintrag. Die RLS verbirgt fremde Zeilen still (0 Treffer, kein
 *  Fehler) — deshalb wird die Rückgabe geprüft, statt "gelöscht" zu melden. */
export async function deleteMealPlanEntry(id: string): Promise<Result> {
  if (!supabase) return { ok: false, error: NOT_CONFIGURED };
  if (!id) return { ok: false, error: { code: "SCHEMA", message: "Eintrag fehlt." } };

  const client = (await getAuthedClient()) ?? supabase;
  const { data, error } = await client.from("meal_plan_entries").delete().eq("id", id).select("id");
  if (error) return { ok: false, error: { code: "UNKNOWN", message: error.message } };
  if (!Array.isArray(data) || data.length === 0) {
    return { ok: false, error: { code: "NO_DATA", message: "Eintrag nicht gefunden oder nicht löschbar." } };
  }
  return { ok: true };
}
