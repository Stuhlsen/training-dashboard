/* ============================================================
   STATE/WRITE-AUTHORIZATION.JS — UI-seitiger Autorisierungs-Check für
   toggle-basierte Schreibpfade (Events, plan_cards)

   Bugreport (Alex, live auf main, 31.07.2026): eingeloggt als Stuhlsen,
   Athleten-Toggle auf hc_diZee gestellt → ein Event wurde bei hc_diZee
   angelegt. state/events.js::createEvent() schreibt bewusst für den per
   Toggle angezeigten Athleten (Data.activeAthleteId), nicht für den
   eingeloggten User selbst — das ist gewollt (Konzept
   docs/phase-2-konzept-event-verwaltung.md Abschnitt 5: ein Trainer soll
   direkt Events für seinen Athleten anlegen können, analog plan_cards).
   Der eigentliche Fehler war, dass ui/event-timeline.js die Schreib-Buttons
   für JEDEN eingeloggten User zeigte (`!!getSession()`), unabhängig davon,
   ob überhaupt eine Beziehung zum angezeigten Athleten besteht.

   Dieser Check spiegelt exakt die drei RLS-Fälle aus
   supabase/migrations/0001_initial_schema.sql / 0004_events.sql
   (athlete_id = auth.uid() OR is_coach_of(athlete_id) OR is_admin()) für
   die UI-Sichtbarkeit — RLS bleibt die tatsächliche Durchsetzung, das hier
   entscheidet nur, ob die Schreib-Buttons überhaupt angezeigt werden.
   ============================================================ */

import { getSession, isAdmin } from "./session.js";
import { resolveAthleteProfileId } from "./plan-cards.js";
import { loadTrainerContext, getState as getTrainerViewState } from "./trainer-view.js";

/** Darf der eingeloggte User für `athleteId` ("athlete1"/"athlete2", der
 *  gerade per Toggle angezeigte Athlet) direkt schreiben? Prüft Self-Match
 *  zuerst (häufigster Fall — Athlet betrachtet die eigene Seite — kommt
 *  ohne Trainer-Lookup aus), dann die Trainer-Beziehung über
 *  state/trainer-view.js (bereits geteilte Logik, kein neuer Supabase-Call
 *  für Nicht-Trainer, da loadTrainerContext() bei !isCoach() intern sofort
 *  mit isTrainer:false zurückkehrt). */
export async function canWriteForAthlete(athleteId) {
  const session = getSession();
  if (!session) return false;
  if (isAdmin()) return true;
  const profileId = await resolveAthleteProfileId(athleteId);
  if (profileId && profileId === session.id) return true;
  await loadTrainerContext(athleteId);
  return getTrainerViewState().trainerContext.isTrainer;
}

/** Ist `athleteId` das Profil des eingeloggten Users selbst? Getrennt von
 *  canWriteForAthlete() (das auch bei Trainer/Admin true liefert) — für
 *  UI-Stellen, die einen Schreibvorgang für einen ANDEREN Athleten sichtbar
 *  machen wollen (Bugreport 31.07.2026: Admin/Trainer können absichtlich für
 *  fremde Athleten schreiben, ein unbeschrifteter Dialog verschleiert dann
 *  aber leicht, für wen gerade gespeichert wird — genau das hat den Vorfall
 *  ausgelöst, obwohl der Zugriff selbst laut RLS/Konzept korrekt war). */
export async function isSelfAthlete(athleteId) {
  const session = getSession();
  if (!session) return false;
  const profileId = await resolveAthleteProfileId(athleteId);
  return !!profileId && profileId === session.id;
}
