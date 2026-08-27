/* ============================================================
   API/SUPABASE/ACCOUNT-DELETION.TS — Löschantrag des eingeloggten Users
   (Settings, Bereich "Datenschutz & Account", Migration 0021)

   Kein echtes Sofort-Löschen (bräuchte die Supabase Admin-API/service_role,
   die nie clientseitig laufen darf) — nur ein Antrag, der eine Zeile
   anlegt/aktualisiert. Muster wie intervals-credentials.ts (ein Eintrag pro
   Profil, strikte Owner-only-RLS).
   ============================================================ */

import { supabase, getAuthedClient } from "./client";
import type { Result } from "../types";

const NOT_CONFIGURED = { code: "UNKNOWN" as const, message: "Supabase nicht konfiguriert" };

export async function getAccountDeletionRequest(
  userId: string,
): Promise<Result<{ requestedAt: string | null }>> {
  if (!supabase) return { ok: true, requestedAt: null };
  const client = (await getAuthedClient()) ?? supabase;
  const { data, error } = await client
    .from("account_deletion_requests")
    .select("requested_at")
    .eq("profile_id", userId)
    .maybeSingle<{ requested_at: string }>();
  if (error) return { ok: false, error: { code: "UNKNOWN", message: error.message } };
  return { ok: true, requestedAt: data?.requested_at ?? null };
}

/** Upsert statt Insert — ein erneuter Antrag (z. B. nach Ablehnung) aktualisiert
 *  nur requested_at, statt an der PK (profile_id) zu scheitern. */
export async function requestAccountDeletion(userId: string): Promise<Result<{ requestedAt: string }>> {
  if (!supabase) return { ok: false, error: NOT_CONFIGURED };
  const client = (await getAuthedClient()) ?? supabase;
  const requestedAt = new Date().toISOString();
  const { error } = await client
    .from("account_deletion_requests")
    .upsert({ profile_id: userId, requested_at: requestedAt }, { onConflict: "profile_id" });
  if (error) return { ok: false, error: { code: "UNKNOWN", message: error.message } };
  return { ok: true, requestedAt };
}
