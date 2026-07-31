import { supabase, getAuthedClient } from "./client.js";

const NOT_CONFIGURED = { code: "UNKNOWN", message: "Supabase nicht konfiguriert" };

/** Liest die gespeicherte Export-Richtungsvorgabe (Preset + optionales
 *  Zielevent) eines Profils. `preset: null` bedeutet "noch nie gespeichert" —
 *  der Aufrufer (state/export-prefs.js) entscheidet über den Default
 *  ('general'), diese Schicht kennt keine UI-Defaults (analog zu
 *  trainer-view-prefs.js::getViewPrefs). */
export async function getExportPrefs(profileId) {
  if (!supabase) return { ok: true, preset: null, eventId: null };
  const client = (await getAuthedClient()) ?? supabase;
  const { data, error } = await client
    .from("export_prefs")
    .select("preset, event_id")
    .eq("profile_id", profileId)
    .maybeSingle();
  if (error) return { ok: false, error: { code: "UNKNOWN", message: error.message } };
  return { ok: true, preset: data?.preset ?? null, eventId: data?.event_id ?? null };
}

/** Speichert Preset + Zielevent (Upsert — ein Profil hat höchstens eine
 *  Zeile, Primärschlüssel profile_id aus 0008). `eventId: null` löscht die
 *  Event-Bindung (z. B. Wechsel weg von Preset "event"). */
export async function setExportPrefs(profileId, { preset, eventId }) {
  if (!supabase) return { ok: false, error: NOT_CONFIGURED };
  const client = (await getAuthedClient()) ?? supabase;
  const { error } = await client
    .from("export_prefs")
    .upsert(
      { profile_id: profileId, preset, event_id: eventId ?? null },
      { onConflict: "profile_id" },
    );
  if (error) return { ok: false, error: { code: "UNKNOWN", message: error.message } };
  return { ok: true };
}
