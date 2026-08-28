/* ============================================================
   SCRIPTS/LIB/INTERVALS-CREDENTIALS-FETCH.JS — intervals.icu-Zugangsdaten
   eines Athleten aus Supabase laden (Tabelle intervals_credentials,
   Migration 0019).

   Anlass: Athlet 4 ("Bentastiic", Einsteiger) hinterlegt seinen
   intervals.icu-API-Key + die eigene intervals.icu-Athlete-ID NICHT als
   GitHub Secret, sondern selbst in Settings → intervals.icu (owner-only
   RLS, kein anon-Grant). Der Sync liest sie deshalb erstmals aus Supabase
   statt aus ENV — für Athlet 1/2 bleibt es beim GitHub-Secret-Weg
   (ENV.INTERVALS_KEY / _2).

   Login-Muster 1:1 aus scripts/lib/plan-cards-fetch.js::loadPlanCards und
   scripts/lib/ftp-history.js::loadFtpHistory (dieselben Athleten-
   Credentials liegen in generate-data.js bereits im Scope).

   Gibt bei fehlenden Credentials / Login-Fehler / noch nicht eingetragener
   Zeile `null` zurück statt zu werfen — generate-data.js schreibt dann
   rides-4.json trotzdem (nur Plan, keine Fahrten), der Sync bricht nicht ab.
   ============================================================ */

import { ENV } from "./env.js";
import { log } from "./log.js";

/**
 * intervals.icu-Zugangsdaten eines Profils aus Supabase lesen.
 * @param {{email:string, password:string}} credentials Supabase-Login des Athleten
 * @returns {Promise<{apiKey:string, athleteId:string}|null>}
 */
export async function loadIntervalsCredentials({ email, password } = {}) {
  if (!ENV.SUPABASE_URL || !ENV.SUPABASE_ANON_KEY || !email || !password) {
    return null;
  }
  try {
    const signIn = await fetch(`${ENV.SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: ENV.SUPABASE_ANON_KEY },
      body: JSON.stringify({ email, password }),
    });
    if (!signIn.ok) {
      log.warn(
        `intervals_credentials: Supabase-Login fehlgeschlagen (HTTP ${signIn.status}) — keine Fahrten für diesen Athleten`
      );
      return null;
    }
    const { access_token: token, user } = await signIn.json();

    const res = await fetch(
      `${ENV.SUPABASE_URL}/rest/v1/intervals_credentials?profile_id=eq.${user.id}&select=api_key,intervals_athlete_id`,
      { headers: { apikey: ENV.SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` } }
    );
    if (!res.ok) {
      log.warn(
        `intervals_credentials: Abruf fehlgeschlagen (HTTP ${res.status}) — keine Fahrten für diesen Athleten`
      );
      return null;
    }
    const rows = await res.json();
    if (!Array.isArray(rows) || rows.length === 0 || !rows[0].api_key) {
      log.info(
        "intervals_credentials: noch keine Zeile — Athlet hat den Key noch nicht in Settings eingetragen"
      );
      return null;
    }
    return { apiKey: rows[0].api_key, athleteId: rows[0].intervals_athlete_id };
  } catch (e) {
    log.warn(`intervals_credentials: Netzwerkfehler beim Abruf (${e.message}) — keine Fahrten für diesen Athleten`);
    return null;
  }
}
