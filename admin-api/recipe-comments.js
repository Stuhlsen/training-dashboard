// Fahrplan 30 B5 — Kommentar zu einem Rezept löschen (nur Admin).
//
// Der Schreiber löscht den eigenen Kommentar selbst (RLS-Policy); jeden anderen löscht nur der
// Admin, und zwar hier. Das Audit-Log wird VOR dem Löschen geschrieben (wie decideRecipe):
// ein Löschen ohne Aufzeichnung gibt es nicht, bei Fehler bleibt der Kommentar stehen.
// Im Log stehen nur IDs (Kommentar, Rezept), nie der Text — der ist Nutzertext und nach dem
// Löschen ohnehin weg. Das Löschen entfernt per FK-cascade auch die Daumen auf den Kommentar.
const { fetchJson, writeAuditLog } = require("./users.js");

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * @param {string} commentId
 * @param {string} actorId Admin-ID aus dem Token
 */
async function deleteRecipeComment(commentId, actorId, env, fetchImpl = fetch) {
  const notFound = { ok: false, status: 404, error: { code: "NO_DATA", message: "Kommentar nicht gefunden" } };
  if (typeof commentId !== "string" || !UUID_RE.test(commentId)) return notFound;

  let rows;
  try {
    rows = await fetchJson(
      `${env.POSTGREST_INTERNAL_URL}/recipe_comments?id=eq.${commentId}&select=id,recipe_id,athlete_id`,
      env,
      fetchImpl,
      "PostgREST"
    );
  } catch (err) {
    return { ok: false, status: 502, error: { code: "NETWORK", message: err.message } };
  }
  if (!Array.isArray(rows) || rows.length === 0) return notFound;
  const comment = rows[0];

  const auditWritten = await writeAuditLog(env, fetchImpl, {
    actorId,
    targetUserId: comment.athlete_id,
    action: "delete_recipe_comment",
    details: { commentId, recipeId: comment.recipe_id },
  });
  if (!auditWritten) {
    return { ok: false, status: 502, error: { code: "NETWORK", message: "Audit-Log nicht schreibbar" } };
  }

  let res;
  try {
    res = await fetchImpl(`${env.POSTGREST_INTERNAL_URL}/recipe_comments?id=eq.${commentId}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Prefer: "return=representation",
      },
    });
  } catch {
    return { ok: false, status: 502, error: { code: "NETWORK", message: "PostgREST nicht erreichbar" } };
  }
  if (!res.ok) {
    return { ok: false, status: 502, error: { code: "HTTP", message: `PostgREST antwortete mit ${res.status}` } };
  }
  let removed = [];
  try {
    removed = await res.json();
  } catch {
    // leere Antwort = keine Zeile getroffen
  }
  // Schon weg (z. B. vom Schreiber selbst gelöscht, während der Admin klickte): 404 statt Erfolg,
  // die Oberfläche lädt die Liste ohnehin neu.
  if (!Array.isArray(removed) || removed.length === 0) return notFound;
  return { ok: true };
}

module.exports = { deleteRecipeComment };
