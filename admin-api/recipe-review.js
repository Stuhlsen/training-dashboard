// Fahrplan 30 B4 — Rezepte in Pruefung freigeben oder mit Grund ablehnen (nur Admin).
//
// Das Audit-Log wird VOR der Aenderung geschrieben (wie verify-author): eine
// Entscheidung ohne Aufzeichnung gibt es nicht, bei Fehler wird nichts geaendert.
// Der PATCH filtert zusaetzlich auf status=pending, damit zwei gleichzeitige
// Entscheidungen nicht aufeinander laufen; trifft er keine Zeile, ist das ein 409.
// Daumen (recipe_votes) bleiben bei der Entscheidung stehen — die View blendet das
// Rezept danach aus.
const { fetchJson, writeAuditLog } = require("./users.js");

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_REASON_CHARS = 500;

const DECISIONS = {
  approve: { status: "approved", action: "approve_recipe" },
  reject: { status: "rejected", action: "reject_recipe" },
};

/**
 * @param {string} recipeId
 * @param {"approve"|"reject"} decision
 * @param {unknown} reason Pflicht bei "reject" (1-500 Zeichen), bei "approve" ignoriert
 * @param {string} actorId Admin-ID aus dem Token
 */
async function decideRecipe(recipeId, decision, reason, actorId, env, fetchImpl = fetch) {
  const notFound = { ok: false, status: 404, error: { code: "NO_DATA", message: "Rezept nicht gefunden" } };
  const rule = DECISIONS[decision];
  if (!rule) return notFound;
  if (typeof recipeId !== "string" || !UUID_RE.test(recipeId)) return notFound;

  let cleanReason = null;
  if (decision === "reject") {
    cleanReason = typeof reason === "string" ? reason.trim() : "";
    if (cleanReason.length === 0) {
      return { ok: false, status: 400, error: { code: "SCHEMA", message: "Bitte einen Grund angeben" } };
    }
    if (cleanReason.length > MAX_REASON_CHARS) {
      return {
        ok: false,
        status: 400,
        error: { code: "SCHEMA", message: `Der Grund darf höchstens ${MAX_REASON_CHARS} Zeichen lang sein` },
      };
    }
  }

  let rows;
  try {
    rows = await fetchJson(
      `${env.POSTGREST_INTERNAL_URL}/recipes?id=eq.${recipeId}&select=id,status,submitted_by`,
      env,
      fetchImpl,
      "PostgREST"
    );
  } catch (err) {
    return { ok: false, status: 502, error: { code: "NETWORK", message: err.message } };
  }
  if (!Array.isArray(rows) || rows.length === 0) return notFound;
  const recipe = rows[0];
  if (recipe.status !== "pending") {
    return { ok: false, status: 409, error: { code: "HTTP", message: "Das Rezept ist nicht mehr in Prüfung" } };
  }

  const auditWritten = await writeAuditLog(env, fetchImpl, {
    actorId,
    // Pending-Rezepte sind Athleten-Rezepte (submitted_by gesetzt); der Rueckfall deckt nur Altdaten ab
    targetUserId: recipe.submitted_by ?? actorId,
    action: rule.action,
    details: { recipeId, ...(cleanReason ? { reason: cleanReason } : {}) },
  });
  if (!auditWritten) {
    return { ok: false, status: 502, error: { code: "NETWORK", message: "Audit-Log nicht schreibbar" } };
  }

  let res;
  try {
    res = await fetchImpl(`${env.POSTGREST_INTERNAL_URL}/recipes?id=eq.${recipeId}&status=eq.pending`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify({ status: rule.status, rejection_reason: cleanReason }),
    });
  } catch {
    return { ok: false, status: 502, error: { code: "NETWORK", message: "PostgREST nicht erreichbar" } };
  }
  if (!res.ok) {
    return { ok: false, status: 502, error: { code: "HTTP", message: `PostgREST antwortete mit ${res.status}` } };
  }
  let changed = [];
  try {
    changed = await res.json();
  } catch {
    // leere Antwort = keine Zeile getroffen
  }
  if (!Array.isArray(changed) || changed.length === 0) {
    return { ok: false, status: 409, error: { code: "HTTP", message: "Das Rezept ist nicht mehr in Prüfung" } };
  }
  return { ok: true, status: rule.status };
}

module.exports = { decideRecipe, MAX_REASON_CHARS };
