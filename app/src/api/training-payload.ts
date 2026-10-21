/* ============================================================
   API/TRAINING-PAYLOAD.TS — Trainingsdaten je Profil aus den Tabellen
   (Fahrplan 26, E3; Schema: Migration 0078)

   `assemblePayload()` ist die Umkehrung von `splitPayload()` in
   `scripts/lib/training-store.js` (E2): aus den Zeilen von
   `training_rides` / `training_wellness` / `training_profile_data` entsteht
   genau die Payload-Form der heutigen `rides*.json`. Danach läuft sie durch
   dieselbe Prüfung wie die Datei-Pipeline (`parseRidesPayload` →
   `core/validate.js`); `core/` bleibt unverändert.

   Zuordnung (muss zu training-store.js passen, abgesichert in
   training-payload.test.ts):
   - eigene Spalten: power_curves, forecast, athlete_weight, wellness_meta
   - `extra`: ftpHistory, plannedSessions, adjustments, powerCurveBlocks
   - `meta`: alles übrige (updated, source, count, ftp, ftpPublic, …)
   - athleteName: profiles.display_name (steht nicht in der Tabelle)
   ============================================================ */

import { parseRidesPayload, type AthleteData, type RidesPayload } from "./pipeline";
import { getTrainingRides } from "./supabase/training-rides";
import { getTrainingWellness } from "./supabase/training-wellness";
import {
  getTrainingProfileData,
  type TrainingProfileDataRow,
} from "./supabase/training-profile-data";
import { getProfile } from "./supabase/profiles";
import type { Result } from "./types";

export interface PayloadParts {
  rides: unknown[];
  wellness: unknown[];
  profileData: TrainingProfileDataRow | null;
  athleteName?: string | null;
}

/** Spalte → Payload-Feld. Ein `null` in der Spalte heißt „Feld fehlte" und
 *  wird weggelassen (der Sync schreibt `value ?? null`). */
function columnFields(row: TrainingProfileDataRow): Record<string, unknown> {
  const columns: Record<string, unknown> = {
    powerCurves: row.powerCurves,
    forecast: row.forecast,
    athleteWeight: row.athleteWeight,
    wellnessMeta: row.wellnessMeta,
  };
  return Object.fromEntries(Object.entries(columns).filter(([, value]) => value != null));
}

export function assemblePayload(parts: PayloadParts): RidesPayload {
  const { rides, wellness, profileData, athleteName } = parts;
  return {
    ...(athleteName ? { athleteName } : {}),
    ...(profileData?.meta ?? {}),
    ...(profileData?.extra ?? {}),
    ...(profileData ? columnFields(profileData) : {}),
    rides,
    wellness,
  } as RidesPayload;
}

/** Lädt die Trainingsdaten eines Profils aus den Tabellen und setzt die
 *  Payload zusammen. `data.trainingDataEmpty` ist `true`, solange für das
 *  Profil nichts in den Tabellen steht (Sync noch nicht gelaufen) — davon
 *  getrennt: ein Lesefehler kommt als `ok: false`. Result-Konvention: jeder Lesefehler wird zu
 *  `{ ok: false }`, auch wenn nur eine der drei Tabellen scheitert — eine
 *  halbe Payload würde als „kaum Daten" fehlgedeutet.
 *
 *  Hinweis: Verweigert RLS das Lesen, liefert PostgREST keinen Fehler,
 *  sondern leere Zeilen — das ist von „Sync noch nicht gelaufen" nicht zu
 *  unterscheiden. Fehler entstehen nur bei echten Lesefehlern (Netz, HTTP,
 *  fehlende Rechte auf Tabellenebene). */
export async function loadProfileTrainingData(
  profileId: string,
): Promise<Result<{ data: AthleteData }>> {
  const [ridesRes, wellnessRes, profileRes, nameRes] = await Promise.all([
    getTrainingRides(profileId),
    getTrainingWellness(profileId),
    getTrainingProfileData(profileId),
    getProfile(profileId),
  ]);
  if (!ridesRes.ok) return ridesRes;
  if (!wellnessRes.ok) return wellnessRes;
  if (!profileRes.ok) return profileRes;

  const payload = assemblePayload({
    rides: ridesRes.rides,
    wellness: wellnessRes.wellness,
    profileData: profileRes.row,
    // Der Name ist nur Beschriftung — ein Fehler dort ist kein Grund, die
    // Trainingsdaten zu verwerfen.
    athleteName: nameRes.ok ? nameRes.profile.displayName : null,
  });
  const parsed = parseRidesPayload(payload);
  if (!parsed.ok) return parsed;

  const hasData =
    profileRes.row !== null || ridesRes.rides.length > 0 || wellnessRes.wellness.length > 0;
  return { ok: true, data: { ...parsed.data, trainingDataEmpty: !hasData } };
}
