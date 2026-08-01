import {
  getSessionFormats as getSessionFormatsAdapter,
  getAthleteFormats as getAthleteFormatsAdapter,
  setAthleteFormatActive as setAthleteFormatActiveAdapter,
} from "../data-access/supabase/formats.js";
import { getSession } from "./session.js";

/** Formatkatalog (D4) — öffentlich, kein Login nötig. */
export async function getSessionFormats() {
  return getSessionFormatsAdapter();
}

/** Formatzuordnung des eingeloggten Athleten (D2, L1.1). */
export async function getAthleteFormats() {
  const user = getSession();
  if (!user) return { ok: true, athleteFormats: [] };
  return getAthleteFormatsAdapter(user.id);
}

/** Setzt/upsertet den Aktiv-Status eines Formats für den eingeloggten Athleten. */
export async function setAthleteFormatActive(formatId, active) {
  const user = getSession();
  if (!user) return { ok: false, error: { code: "UNKNOWN", message: "Nicht eingeloggt" } };
  return setAthleteFormatActiveAdapter(user.id, formatId, active);
}
