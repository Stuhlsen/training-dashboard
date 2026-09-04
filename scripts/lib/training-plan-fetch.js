/* ============================================================
   SCRIPTS/LIB/TRAINING-PLAN-FETCH.JS — die aktive training_plans-Zeile
   eines Athleten aus Supabase laden (Tabelle training_plans, Migration
   0028; Service-Role-GRANT Migration 0029).

   Fahrplan 8 E8 (Sync-Umschaltung): Hat ein Athlet einen selbst gebauten,
   aktiven Trainingsplan, ist plan_cards die ALLEINIGE Planquelle — die
   Code-Vorlage (scripts/lib/plan-athlete2.js / plan-athlete4.js) wird in
   generate-data.js dann nicht mehr gespreadet (weder in effectivePlan
   noch in output*.plannedSessions).

   Zugriffsmuster identisch zu scripts/lib/ftp-history.js::loadFtpHistory()
   und plan-cards-fetch.js::loadPlanCards(): ein GET mit dem
   Service-Role-Key (RLS-Bypass), profileId aus athlete_sync_config
   (scripts/lib/sync-config-fetch.js).

   FEHLERVERHALTEN — bewusst NICHT fatal (anders als sync-config-fetch.js):
   fehlen Credentials/profileId oder scheitert der Read, gibt die Funktion
   `null` zurück. generate-data.js fällt dann auf die Code-Vorlage zurück —
   kein Datenverlust, schlimmstenfalls ein Lauf mit dem alten Vorlagen-Plan
   statt dem frischen DB-Plan. Derselbe Degradationspfad wie
   ftp-history.js / plan-cards-fetch.js (loadFtpHistory -> [],
   loadPlanCards -> []).
   ============================================================ */

import { ENV } from "./env.js";
import { fetchJson } from "./http.js";

const SELECT_COLS = "id,is_active,start_date,end_date,week_model";

/**
 * Roh-Zeile (PostgREST) -> schlanke Shape für generate-data.js.
 * `week_model` ist jsonb und kommt bereits geparst als Array; gegen
 * null / unerwartete Typen absichern.
 * @param {Object|null|undefined} row
 * @returns {{id:string, startDate:string|null, endDate:string|null,
 *   weekModel:Array<Object>}|null}
 */
export function toPlanSummary(row) {
  if (!row || !row.id) return null;
  return {
    id: row.id,
    startDate: row.start_date ?? null,
    endDate: row.end_date ?? null,
    weekModel: Array.isArray(row.week_model) ? row.week_model : [],
  };
}

/**
 * Die aktive training_plans-Zeile eines Profils laden.
 * @param {{profileId?:string, serviceRoleKey?:string}} credentials
 *   profileId aus athlete_sync_config; serviceRoleKey = ENV.SUPABASE_SERVICE_ROLE_KEY.
 * @returns {Promise<{id:string, startDate:string|null, endDate:string|null,
 *   weekModel:Array<Object>}|null>} `null`, wenn keine Credentials/profileId,
 *   kein aktiver Plan oder der Read scheitert (Degradation auf die Code-Vorlage).
 */
export async function loadActiveTrainingPlan({ profileId, serviceRoleKey } = {}) {
  if (!ENV.SUPABASE_URL || !serviceRoleKey || !profileId) return null;

  const rows = await fetchJson(
    `${ENV.SUPABASE_URL}/rest/v1/training_plans` +
      `?athlete_id=eq.${profileId}&is_active=eq.true` +
      `&select=${SELECT_COLS}&order=created_at.desc&limit=1`,
    { headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` } },
    { label: "training_plans: aktive Zeile (service_role)" },
  );
  if (!rows || !rows.length) return null;
  return toPlanSummary(rows[0]);
}
