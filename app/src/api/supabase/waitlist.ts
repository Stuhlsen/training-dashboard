import { supabase, getAuthedClient } from "./client";
import type { Result } from "../types";

const NOT_CONFIGURED = { code: "UNKNOWN" as const, message: "Supabase nicht konfiguriert" };

/** Postgres-Fehlercode für unique-violation (eindeutiger lower(email)-Index
 *  der waitlist, Migration 0054). */
const PG_UNIQUE_VIOLATION = "23505";

/** Trägt eine E-Mail in die öffentliche Warteliste der Landingpage ein
 *  (Migration 0054, Fahrplan 22 E6). Die Adresse wird vor dem Senden
 *  getrimmt und kleingeschrieben, damit sie exakt dem lower(email)-Index
 *  entspricht und Groß-/Kleinschreibungs-Varianten nicht doppelt stehen.
 *
 *  Ist die Adresse schon eingetragen (23505), gilt das bewusst als Erfolg:
 *  so verrät das Formular nicht, wer bereits auf der Liste steht.
 *
 *  Wer auf der Landingpage schon eingeloggt ist, schreibt über den
 *  Session-Client (Rolle "authenticated"), ansonsten über den anon-Client —
 *  die Insert-Policy deckt beide Rollen ab (s. Migration). */
export async function addToWaitlist(email: string): Promise<Result> {
  if (!supabase) return { ok: false, error: NOT_CONFIGURED };
  const client = (await getAuthedClient()) ?? supabase;
  const normalized = email.trim().toLowerCase();
  const { error } = await client.from("waitlist").insert({ email: normalized });
  if (!error) return { ok: true };
  if (error.code === PG_UNIQUE_VIOLATION) return { ok: true };
  return { ok: false, error: { code: "UNKNOWN", message: error.message } };
}
