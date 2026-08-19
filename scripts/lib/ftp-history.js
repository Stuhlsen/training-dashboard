/* ============================================================
   SCRIPTS/LIB/FTP-HISTORY.JS — zeitpunktbezogene FTP-Auflösung
   (ftp_history-Tabelle, Migration 0009)

   ftpAt() ist rein (kein Netzwerk, kein state) — Auflösungslogik und
   Datenbeschaffung sind bewusst getrennt, dasselbe Prinzip wie
   core/ vs. data-access/ in assets/js/ (s. Schichtenregel, AGENTS.md),
   nur dass hier auf Node-Seite (scripts/lib/) kein eigenes core/-Modul
   dafür nötig ist — ftpAt() ist klein genug, um direkt hier zu leben,
   und wird ausschließlich von scripts/ konsumiert (map-activity.js
   importiert weiterhin nur aus core/ für reine Logik, s. dortige Header-
   Kommentare — das bleibt unverändert).
   ============================================================ */

import { ENV } from "./env.js";
import { fetchJson } from "./http.js";

/**
 * Zu einem Fahrtdatum gültige FTP aus einer Historie ermitteln: der
 * Eintrag mit dem größten `validFrom` <= `dateISO` (Reihenfolge der
 * übergebenen Liste egal, wird hier sortiert). Kein Eintrag <= dateISO
 * vorhanden (Datum vor dem ältesten Eintrag, oder Historie leer) ->
 * `fallbackFtp` mit `source: "fallback"` — die "geschätzt/keine
 * Historie"-Markierung aus dem Auftrag, damit Aufrufer erkennen können,
 * dass der Wert nicht aus einer echten Messung stammt.
 * @param {Array<{ftpWatt:number, validFrom:string, source?:string}>} history
 * @param {string} dateISO Fahrtdatum (YYYY-MM-DD)
 * @param {number} fallbackFtp
 * @returns {{ftpWatt:number, source:string, validFrom:string|null}}
 */
export function ftpAt(history, dateISO, fallbackFtp) {
  const applicable = (history || [])
    .filter((h) => h.validFrom <= dateISO)
    .sort((a, b) => b.validFrom.localeCompare(a.validFrom));
  if (applicable.length) {
    const { ftpWatt, validFrom, source } = applicable[0];
    return { ftpWatt, source: source || "history", validFrom };
  }
  return { ftpWatt: fallbackFtp, source: "fallback", validFrom: null };
}

/**
 * FTP-Historie eines Profils aus Supabase laden (PostgREST, Login-Muster
 * analog scripts/migrate-plan-to-supabase.js) — RLS lässt nur den
 * Athleten selbst lesen (s. Migration 0009), ein service_role-Key ist
 * dafür nicht nötig, die vorhandenen Athleten-Credentials reichen.
 *
 * Gibt bei fehlenden Credentials/Netzwerkfehlern `[]` zurück statt zu
 * werfen — ftpAt() fällt dann automatisch auf fallbackFtp zurück, der
 * Sync bricht nicht ab. NICHT von generate-data.js aufgerufen (noch
 * keine SUPABASE_*-Secrets im sync-data.yml-Workflow hinterlegt, s.
 * ENV.js-Kommentar "generate-data.js/npm run sync braucht diese nicht")
 * — das Verdrahten ist bewusst Schritt 3 vorbehalten (Bericht folgt).
 * Nutzt fetchJson() (scripts/lib/http.js, Timeout + ein Retry) statt
 * rohem fetch() — Fehler/Timeout werden dort bereits geloggt.
 * @param {{email:string, password:string}} credentials
 * @returns {Promise<Array<{ftpWatt:number, validFrom:string, source:string}>>}
 */
export async function loadFtpHistory({ email, password } = {}) {
  if (!ENV.SUPABASE_URL || !ENV.SUPABASE_ANON_KEY || !email || !password) {
    return [];
  }
  const signIn = await fetchJson(
    `${ENV.SUPABASE_URL}/auth/v1/token?grant_type=password`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: ENV.SUPABASE_ANON_KEY },
      body: JSON.stringify({ email, password }),
    },
    { label: "ftp_history: Supabase-Login" }
  );
  if (!signIn) return [];

  const rows = await fetchJson(
    `${ENV.SUPABASE_URL}/rest/v1/ftp_history?profile_id=eq.${signIn.user.id}&select=ftp_watt,valid_from,source&order=valid_from.asc`,
    { headers: { apikey: ENV.SUPABASE_ANON_KEY, Authorization: `Bearer ${signIn.access_token}` } },
    { label: "ftp_history: Abruf" }
  );
  if (!rows) return [];

  return rows.map((r) => ({ ftpWatt: r.ftp_watt, validFrom: r.valid_from, source: r.source }));
}
