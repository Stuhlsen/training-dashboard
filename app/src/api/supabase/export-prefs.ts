import { supabase, getAuthedClient } from "./client";
import type { Result } from "../types";

const NOT_CONFIGURED = { code: "UNKNOWN" as const, message: "Supabase nicht konfiguriert" };

/** Liest die gespeicherte Export-Richtungsvorgabe (Preset + optionales
 *  Zielevent) eines Profils. `preset: null` bedeutet "noch nie gespeichert" —
 *  der Aufrufer (useExportPrefs) entscheidet über den Default ('general'),
 *  diese Schicht kennt keine UI-Defaults (analog zu trainer-view-prefs.ts). */
export async function getExportPrefs(
  profileId: string,
): Promise<Result<{ preset: string | null; eventId: string | null }>> {
  if (!supabase) return { ok: true, preset: null, eventId: null };
  const client = (await getAuthedClient()) ?? supabase;
  const { data, error } = await client
    .from("export_prefs")
    .select("preset, event_id")
    .eq("profile_id", profileId)
    .maybeSingle<{ preset: string | null; event_id: string | null }>();
  if (error) return { ok: false, error: { code: "UNKNOWN", message: error.message } };
  return { ok: true, preset: data?.preset ?? null, eventId: data?.event_id ?? null };
}

/** Speichert Preset + Zielevent (Upsert — ein Profil hat höchstens eine
 *  Zeile, Primärschlüssel profile_id aus 0008). `eventId: null` löscht die
 *  Event-Bindung (z. B. Wechsel weg von Preset "event"). */
export async function setExportPrefs(
  profileId: string,
  { preset, eventId }: { preset: string; eventId: string | null },
): Promise<Result> {
  if (!supabase) return { ok: false, error: NOT_CONFIGURED };
  const client = (await getAuthedClient()) ?? supabase;
  const { error } = await client
    .from("export_prefs")
    .upsert({ profile_id: profileId, preset, event_id: eventId ?? null }, { onConflict: "profile_id" });
  if (error) return { ok: false, error: { code: "UNKNOWN", message: error.message } };
  return { ok: true };
}
