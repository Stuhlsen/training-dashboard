/* ============================================================
   API/ADMIN-RECIPE-COMMENTS.TS — Kommentar zu einem Rezept löschen (nur Admin)
   (Fahrplan 30 B5; admin-api DELETE /admin/recipe-comments/:id)

   Der Server prüft den Admin bei jedem Aufruf und schreibt vor dem Löschen das Audit-Log
   (nur IDs). Die Antwort ist schon in der Result-Form und wird nur durchgereicht.
   ============================================================ */

import { adminFetch } from "./admin-athletes";
import type { Result } from "./types";

export async function deleteRecipeCommentAsAdmin(commentId: string): Promise<Result> {
  return adminFetch(`/admin/recipe-comments/${encodeURIComponent(commentId)}`, { method: "DELETE" });
}
