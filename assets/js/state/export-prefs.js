/* ============================================================
   STATE/EXPORT-PREFS.JS — Export-Richtungsvorgabe: Preset + Zielevent
   (Phase 4 — Export-Richtungsvorgabe-Konzept R5/R6)

   Persistiert, welches Preset (general/event/check/reduce/build) und —
   bei "event" — welches Zielevent der Athlet zuletzt im Export-Panel
   gewählt hat. Ein Profil hat höchstens eine Zeile (Primärschlüssel
   profile_id aus 0008_export_prefs.sql), deshalb auf Abruf geladen/
   gespeichert wie state/trainer-view.js::loadCategories/saveCategories,
   nicht datumsgekoppelt wie state/wellbeing.js. Kein automatisches
   onSessionChange-Abo (nichts konsumiert diesen State, bevor das
   Export-Panel geöffnet wird) — der Aufrufer lädt bei Bedarf.
   ============================================================ */

import { getExportPrefs, setExportPrefs } from "../data-access/supabase/export-prefs.js";
import { getSession } from "./session.js";
import { createRequestGuard } from "../core/request-guard.js";

export const DEFAULT_PRESET = "general";

let preset = DEFAULT_PRESET;
let eventId = null;
let loading = false;
let error = null;
const requestGuard = createRequestGuard();
const listeners = new Set();

function notify() {
  for (const fn of listeners) fn(getState());
}

export function getState() {
  return { preset, eventId, loading, error };
}

/** Lädt die gespeicherte Vorgabe des eingeloggten Profils neu. Kein
 *  gespeicherter Eintrag (frisches Profil) oder keine Session → Default
 *  ('general', kein Zielevent), kein Fehler. */
export async function loadExportPrefs() {
  const myRequest = requestGuard.bump();
  const user = getSession();
  if (!user) {
    preset = DEFAULT_PRESET;
    eventId = null;
    error = null;
    loading = false;
    notify();
    return { ok: true, preset, eventId };
  }
  loading = true;
  error = null;
  notify();
  const result = await getExportPrefs(user.id);
  if (!requestGuard.isCurrent(myRequest)) return result.ok ? { ok: true, preset, eventId } : result; // überholt
  loading = false;
  if (result.ok) {
    preset = result.preset ?? DEFAULT_PRESET;
    eventId = result.eventId;
  } else {
    error = result.error;
  }
  notify();
  return result.ok ? { ok: true, preset, eventId } : result;
}

/** Speichert Preset + Zielevent des eingeloggten Profils (Upsert).
 *  Optimistisch — das Panel soll sofort auf die neue Auswahl reagieren. */
export async function saveExportPrefs(nextPreset, nextEventId = null) {
  preset = nextPreset;
  eventId = nextEventId;
  notify();
  const user = getSession();
  if (!user) return { ok: false, error: { code: "UNKNOWN", message: "Nicht eingeloggt" } };
  const myRequest = requestGuard.bump();
  const result = await setExportPrefs(user.id, { preset: nextPreset, eventId: nextEventId });
  if (!requestGuard.isCurrent(myRequest)) return result; // überholt
  if (!result.ok) error = result.error;
  notify();
  return result;
}

export function onExportPrefsChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
