/* ============================================================
   API/SUPABASE/NUTRITION-GOALS.TS — Ernährungsziele-Adapter
   (Migration 0061, Fahrplan 23 E0/E5)

   Result-Konvention exakt wie goals.ts:
   `{ ok: true, ... }` / `{ ok: false, error: { code, message } }`.

   Tabelle nutrition_goals ist append-only — ein neues Ziel = neue
   Zeile. Die aktuell gültige Zeile ist die mit der neuesten
   created_at (Consumer sortieren selbst). Bewusst KEIN update/delete
   für den normalen authenticated-Pfad (nur service_role).

   Validierung auf App-Ebene (nicht DB), siehe 0061-Kopfkommentar:
   - pace_per_week_kg > 0 für lose/gain (Betrag; Richtung lebt in goal_type)
   - maintain braucht kein pace
   - target_weight_kg > 0 wenn gesetzt
   ============================================================ */

import { supabase, getAuthedClient } from "./client";
import type { NutritionGoal, NutritionGoalInput, Result } from "../types";

const NOT_CONFIGURED = { code: "UNKNOWN" as const, message: "Supabase nicht konfiguriert" };

interface NutritionGoalRow {
  id: string;
  profile_id: string;
  goal_type: NutritionGoal["goalType"];
  target_weight_kg: number | null;
  pace_per_week_kg: number | null;
  target_date: string | null;
  created_at: string;
}

function toNutritionGoal(row: NutritionGoalRow): NutritionGoal {
  return {
    id: row.id,
    profileId: row.profile_id,
    goalType: row.goal_type,
    targetWeightKg: row.target_weight_kg,
    pacePerWeekKg: row.pace_per_week_kg,
    targetDate: row.target_date,
    createdAt: row.created_at,
  };
}

/** Validiert einen NutritionGoalInput auf App-Ebene (wie 0061-Kopfkommentar).
 *  Liefert einen Fehlertext oder null bei Gültigkeit.
 *  NaN (Number("")) wird als ungültig abgewiesen. */
function validateGoalInput(input: NutritionGoalInput): string | null {
  if (input.goalType !== "lose" && input.goalType !== "gain" && input.goalType !== "maintain") {
    return "Ungültiger Zieltyp.";
  }
  // NaN-Prüfung für Zahlenwerte — Number("") bzw. ungültige Eingaben werden abgewiesen
  if (input.targetWeightKg != null && (Number.isNaN(input.targetWeightKg) || input.targetWeightKg <= 0)) {
    return "Zielgewicht muss größer als 0 sein.";
  }
  // pace_per_week_kg: für lose/gain erforderlich und > 0 (Betrag)
  if (input.goalType === "lose" || input.goalType === "gain") {
    if (input.pacePerWeekKg == null || Number.isNaN(input.pacePerWeekKg)) {
      return `pace_per_week_kg ist für "${input.goalType}" erforderlich.`;
    }
    if (input.pacePerWeekKg <= 0) {
      return "pace_per_week_kg muss größer als 0 sein.";
    }
  }
  // maintain: pace ist optional
  return null;
}

/** Das aktuell gültige Ernährungsziel eines Profils (neuestes created_at).
 *  Liefert null, wenn keine Zeile existiert. */
export async function getActiveNutritionGoal(
  profileId: string,
): Promise<Result<{ goal: NutritionGoal | null }>> {
  if (!supabase) return { ok: true, goal: null };
  const client = (await getAuthedClient()) ?? supabase;
  const { data, error } = await client
    .from("nutrition_goals")
    .select("id, profile_id, goal_type, target_weight_kg, pace_per_week_kg, target_date, created_at")
    .eq("profile_id", profileId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<NutritionGoalRow>();
  if (error) return { ok: false, error: { code: "UNKNOWN", message: error.message } };
  return { ok: true, goal: data ? toNutritionGoal(data) : null };
}

/** Legt ein neues Ernährungsziel an (append-only). Validiert vor dem
 *  Schreiben auf App-Ebene (pace für lose/gain, target_weight_kg > 0). */
export async function addNutritionGoal(
  profileId: string,
  input: NutritionGoalInput,
): Promise<Result<{ id: string }>> {
  if (!supabase) return { ok: false, error: NOT_CONFIGURED };

  const validationError = validateGoalInput(input);
  if (validationError) {
    return { ok: false, error: { code: "SCHEMA" as const, message: validationError } };
  }

  const client = (await getAuthedClient()) ?? supabase;
  const { data, error } = await client
    .from("nutrition_goals")
    .insert({
      profile_id: profileId,
      goal_type: input.goalType,
      target_weight_kg: input.targetWeightKg ?? null,
      pace_per_week_kg: input.pacePerWeekKg ?? null,
      target_date: input.targetDate ?? null,
    })
    .select("id")
    .single<{ id: string }>();
  if (error) return { ok: false, error: { code: "UNKNOWN", message: error.message } };
  return { ok: true, id: data.id };
}