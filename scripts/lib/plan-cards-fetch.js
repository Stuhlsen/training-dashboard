/* ============================================================
   SCRIPTS/LIB/PLAN-CARDS-FETCH.JS — plan_cards aus Supabase laden
   (Progressionssteuerung C1, docs/konzept-progressionssteuerung.md)

   `workout_structure` (Migration 0013) existiert ausschließlich in
   Supabase plan_cards — der alte statische Plan (scripts/lib/plan2.js,
   PLANNED_SESSIONS) kennt keine Struktur. Für C1 muss generate-data.js
   deshalb erstmals plan_cards lesen.

   Login-Muster identisch zu scripts/lib/ftp-history.js::loadFtpHistory()
   (dieselben Athleten-Credentials sind in generate-data.js bereits im
   Scope) — plan_cards ist zwar `anon`-lesbar (RLS "öffentlich lesbar",
   0001_initial_schema.sql, seither unverändert), der Login liefert aber
   `user.id` sicher statt eine athlete_id-UUID hart zu kodieren.

   Gibt bei fehlenden Credentials/Netzwerkfehlern `[]` zurück statt zu
   werfen — derselbe Degradationspfad wie ftp-history.js: ohne plan_cards
   gibt es schlicht keine Compliance-Objekte (core/compliance-match.js::
   shouldEvaluateCard() findet dann für keine Fahrt eine passende Karte).
   Keine eigene Datenquellen-Kopplung zu assets/js/data-access/supabase/
   plan-cards.js — das importiert client.js, das per Design nur im Browser
   läuft (esm.sh-URL-Import).
   ============================================================ */

import { ENV } from "./env.js";
import { log } from "./log.js";

const SELECT_COLS = "id,planned_date,title,workout_type,workout_structure,status";

/** Eine plan_cards-Zeile (PostgREST-Spaltennamen) auf die schlanke Shape
 *  mappen, die core/compliance-match.js braucht.
 *  @param {Object} row */
function toCard(row) {
  return {
    id: row.id,
    date: row.planned_date,
    name: row.title,
    typ: row.workout_type,
    workoutStructure: row.workout_structure ?? null,
    status: row.status,
  };
}

/**
 * plan_cards eines Athleten ab `fromDate` laden.
 * @param {{email:string, password:string}} credentials
 * @param {{fromDate:string}} opts Datum (YYYY-MM-DD), ab dem Karten geladen werden
 * @returns {Promise<Array<{id:string, date:string, name:string, typ:string,
 *   workoutStructure:Object|null, status:string}>>}
 */
export async function loadPlanCards({ email, password } = {}, { fromDate } = {}) {
  if (!ENV.SUPABASE_URL || !ENV.SUPABASE_ANON_KEY || !email || !password || !fromDate) {
    return [];
  }
  try {
    const signIn = await fetch(`${ENV.SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: ENV.SUPABASE_ANON_KEY },
      body: JSON.stringify({ email, password }),
    });
    if (!signIn.ok) {
      log.warn(`plan_cards: Supabase-Login fehlgeschlagen (HTTP ${signIn.status}) — keine Compliance-Auswertung`);
      return [];
    }
    const { access_token: token, user } = await signIn.json();

    const res = await fetch(
      `${ENV.SUPABASE_URL}/rest/v1/plan_cards?athlete_id=eq.${user.id}&planned_date=gte.${fromDate}&select=${SELECT_COLS}&order=planned_date.asc`,
      { headers: { apikey: ENV.SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` } }
    );
    if (!res.ok) {
      log.warn(`plan_cards: Abruf fehlgeschlagen (HTTP ${res.status}) — keine Compliance-Auswertung`);
      return [];
    }
    const rows = await res.json();
    return rows.map(toCard);
  } catch (e) {
    log.warn(`plan_cards: Netzwerkfehler beim Abruf (${e.message}) — keine Compliance-Auswertung`);
    return [];
  }
}
