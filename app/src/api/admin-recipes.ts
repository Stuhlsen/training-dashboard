/* ============================================================
   API/ADMIN-RECIPES.TS — Rezepte in Prüfung entscheiden (nur Admin)
   (Fahrplan 30 B4; admin-api POST /admin/recipes/:id/approve|reject)

   Der Server prüft den Admin bei jedem Aufruf, verlangt beim Ablehnen einen
   Grund (höchstens 500 Zeichen) und schreibt vorher das Audit-Log. Die Antwort
   ist schon in der Result-Form und wird nur durchgereicht.
   ============================================================ */

import { adminFetch } from "./admin-athletes";
import type { RecipeStatus, Result } from "./types";

/** Höchstlänge des Ablehnungsgrunds — dieselbe Grenze prüft der Server. */
export const REJECTION_REASON_MAX = 500;

export async function approveRecipe(recipeId: string): Promise<Result<{ status: RecipeStatus }>> {
  return adminFetch(`/admin/recipes/${encodeURIComponent(recipeId)}/approve`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
}

export async function rejectRecipe(recipeId: string, reason: string): Promise<Result<{ status: RecipeStatus }>> {
  return adminFetch(`/admin/recipes/${encodeURIComponent(recipeId)}/reject`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reason }),
  });
}
