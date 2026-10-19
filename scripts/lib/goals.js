/* ============================================================
   SCRIPTS/LIB/GOALS.JS — aktuelles FTP-Ziel eines Profils fürs öffentliche
   rides*.json (Feld `ftpGoal`, neben `ftp`/`ftpHistory`)

   Die Tabelle `goals` ist owner-only (RLS) — Besucher kommen nur über die
   JSON-Pipeline an das Ziel. Der Sync liest es mit dem Service-Role-Key und
   schreibt NUR die Zahl ins Payload (kein `note`, keine anderen Ziel-Arten).

   Regel (muss zu app/src/core/ftp-goal.js::pickFtpGoal passen): aktive Ziele,
   deren Art „ftp" enthält (Groß-/Kleinschreibung egal), mit positivem
   Zielwert — bei mehreren gewinnt das zuletzt angelegte.
   ============================================================ */

import { ENV } from "./env.js";
import { fetchJson } from "./http.js";

/**
 * @param {Array<{kind?:string|null, targetValue?:number|null, createdAt?:string|null}>} goals
 * @returns {number|null}
 */
export function pickFtpGoal(goals) {
  const candidates = (goals || []).filter(
    (g) =>
      typeof g.kind === "string" &&
      g.kind.toLowerCase().includes("ftp") &&
      Number.isFinite(g.targetValue) &&
      g.targetValue > 0
  );
  if (!candidates.length) return null;
  const newest = candidates.reduce((a, b) =>
    String(b.createdAt ?? "") >= String(a.createdAt ?? "") ? b : a
  );
  return Math.round(newest.targetValue);
}

/**
 * Aktives FTP-Ziel eines Profils (Service-Role-Read). `null` ohne Credentials,
 * ohne Treffer oder bei Netzwerkfehler — der Sync bricht deswegen nicht ab
 * (fetchJson loggt Fehler/Timeout selbst), die Kachel fällt dann auf den
 * `config.ts`-Wert zurück.
 * @param {{profileId?:string, serviceRoleKey?:string}} credentials
 * @returns {Promise<number|null>}
 */
export async function loadFtpGoal({ profileId, serviceRoleKey } = {}) {
  if (!profileId || !serviceRoleKey || !ENV.SUPABASE_URL) return null;
  const rows = await fetchJson(
    `${ENV.SUPABASE_URL}/rest/v1/goals?athlete_id=eq.${profileId}&is_active=eq.true&select=kind,target_value,created_at&order=created_at.asc`,
    { headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` } },
    { label: "goals: Abruf (service_role)" }
  );
  if (!Array.isArray(rows)) return null;
  return pickFtpGoal(
    rows.map((r) => ({ kind: r.kind, targetValue: r.target_value, createdAt: r.created_at }))
  );
}
