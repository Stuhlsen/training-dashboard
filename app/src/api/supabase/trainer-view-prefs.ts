import { supabase, getAuthedClient } from "./client";
import type { Result } from "../types";

const NOT_CONFIGURED = { code: "UNKNOWN" as const, message: "Supabase nicht konfiguriert" };

/** Liest die gespeicherte Kategorien-Auswahl der Trainer-Leiste für ein
 *  Trainer-Athlet-Paar. `categories: null` bedeutet "noch nie gespeichert" —
 *  der Aufrufer entscheidet über den Default, diese Schicht kennt keine
 *  UI-Defaults.
 *
 *  In Etappe 2b nur mitportiert, weil canWriteForAthlete() den Trainer-
 *  Kontext braucht; die Trainer-Leiste selbst folgt in Etappe 7. */
export async function getViewPrefs(
  trainerId: string,
  athleteId: string,
): Promise<Result<{ categories: string[] | null }>> {
  if (!supabase) return { ok: true, categories: null };
  const client = (await getAuthedClient()) ?? supabase;
  const { data, error } = await client
    .from("trainer_view_prefs")
    .select("categories")
    .eq("trainer_id", trainerId)
    .eq("athlete_id", athleteId)
    .maybeSingle<{ categories: string[] | null }>();
  if (error) return { ok: false, error: { code: "UNKNOWN", message: error.message } };
  return { ok: true, categories: data?.categories ?? null };
}

/** Speichert die Kategorien-Auswahl (Upsert — ein Trainer hat höchstens eine
 *  Zeile pro Athlet, Primärschlüssel (trainer_id, athlete_id) aus 0006). */
export async function setViewPrefs(
  trainerId: string,
  athleteId: string,
  categories: string[],
): Promise<Result> {
  if (!supabase) return { ok: false, error: NOT_CONFIGURED };
  const client = (await getAuthedClient()) ?? supabase;
  const { error } = await client
    .from("trainer_view_prefs")
    .upsert(
      { trainer_id: trainerId, athlete_id: athleteId, categories },
      { onConflict: "trainer_id,athlete_id" },
    );
  if (error) return { ok: false, error: { code: "UNKNOWN", message: error.message } };
  return { ok: true };
}
