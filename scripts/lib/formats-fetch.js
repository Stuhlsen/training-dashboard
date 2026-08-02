/* ============================================================
   SCRIPTS/LIB/FORMATS-FETCH.JS — session_formats-Katalog laden (Node-Seite)
   (Ride↔Format-Brücke, Auftrag "Ride↔Format-Brücke, Verdrahtung, echte
   Sperre" Schritt 1)

   session_formats ist öffentlich lesbar (Migration 0014, GRANT für anon) —
   anders als scripts/lib/ftp-history.js::loadFtpHistory() braucht dieser
   Abruf kein Athleten-Login, ein anonymer PostgREST-GET reicht.
   ============================================================ */

import { ENV } from "./env.js";
import { log } from "./log.js";

/**
 * Formatkatalog aus Supabase laden — bei fehlenden Credentials/Netzwerk-
 * fehlern `[]` statt zu werfen (core/session-format-match.js::inferFormatId
 * liefert dann konsequent `null`, der Sync bricht nicht ab).
 * @returns {Promise<Array<{id:string, label:string, currency:string, axes:Object}>>}
 */
export async function loadSessionFormats() {
  if (!ENV.SUPABASE_URL || !ENV.SUPABASE_ANON_KEY) return [];
  try {
    const res = await fetch(`${ENV.SUPABASE_URL}/rest/v1/session_formats?select=id,label,currency,axes`, {
      headers: { apikey: ENV.SUPABASE_ANON_KEY },
    });
    if (!res.ok) {
      log.warn(`session_formats: Abruf fehlgeschlagen (HTTP ${res.status}) — Ride↔Format-Brücke bleibt für diesen Lauf unbesetzt`);
      return [];
    }
    return await res.json();
  } catch (e) {
    log.warn(`session_formats: Netzwerkfehler beim Abruf (${e.message}) — Ride↔Format-Brücke bleibt für diesen Lauf unbesetzt`);
    return [];
  }
}
