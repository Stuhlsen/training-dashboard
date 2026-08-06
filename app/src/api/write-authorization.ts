/* ============================================================
   API/WRITE-AUTHORIZATION.TS — UI-seitiger Autorisierungs-Check

   Portiert aus state/write-authorization.js (Vanilla). Anlass war ein
   echter Fund (31.07.2026): eingeloggt als der eine Athlet, Athleten-Toggle
   auf den anderen gestellt — und ein Event landete beim anderen. Der Fehler
   lag NICHT in der RLS (die erlaubt Trainer/Admin bewusst, für einen
   anderen Athleten zu schreiben) und auch nicht darin, dass die Schreib-
   pfade den angezeigten Athleten verwenden (auch das ist gewollt), sondern
   darin, dass die UI ihre Schreib-Buttons für JEDEN eingeloggten User
   zeigte — ohne zu prüfen, ob überhaupt eine Beziehung zum angezeigten
   Athleten besteht.

   Dieser Check spiegelt exakt die drei RLS-Fälle
   (athlete_id = auth.uid() OR is_coach_of(athlete_id) OR is_admin()) für
   die UI-Sichtbarkeit. Die RLS bleibt die tatsächliche Durchsetzung; hier
   wird nur entschieden, ob die Knöpfe überhaupt erscheinen.

   Das Konzept nennt genau diese Gates als den Ort des letzten echten
   Sicherheitsfundes — der Regressionsdurchlauf in Etappe 10 prüft sie
   gegen die neue UI.
   ============================================================ */

import type { QueryClient } from "@tanstack/react-query";
import { getProfileByDisplayName } from "./supabase/profiles";
import { fetchAthleteProfileId } from "./hooks/useAthleteProfileId";
import { athleteConfig } from "../config";
import type { Profile } from "./types";

/** Darf `user` für den gerade angezeigten Athleten direkt schreiben?
 *
 *  Die Reihenfolge ist Absicht: Self-Match zuerst, weil das der häufigste
 *  Fall ist (ein Athlet sieht seine eigene Seite an) und ohne Trainer-
 *  Lookup auskommt. Ein Nicht-Coach löst ebenfalls keinen Lookup aus — die
 *  Frage "bist du mein Trainer?" stellt sich für ihn gar nicht. */
export async function canWriteForAthlete(
  queryClient: QueryClient,
  user: Profile | null,
  athleteId: string,
): Promise<boolean> {
  if (!user) return false;
  if (user.isAdmin) return true;

  const profileId = await fetchAthleteProfileId(queryClient, athleteId);
  if (profileId && profileId === user.id) return true;

  if (user.role !== "coach") return false;
  const name = athleteConfig(athleteId)?.name;
  if (!name) return false;
  const result = await getProfileByDisplayName(name);
  if (!result.ok) return false;
  return result.profile?.coachId === user.id;
}

/** Ist der angezeigte Athlet der eingeloggte User selbst?
 *
 *  Getrennt von canWriteForAthlete(), das bei Trainer/Admin ebenfalls true
 *  liefert. Gebraucht überall dort, wo ein Dialog sichtbar machen muss, für
 *  WEN gerade gespeichert wird: Trainer und Admin dürfen absichtlich für
 *  fremde Athleten schreiben, aber ein unbeschrifteter Dialog verschleiert
 *  das leicht — genau daran hing der Vorfall vom 31.07.2026, obwohl der
 *  Zugriff selbst korrekt war. */
export async function isSelfAthlete(
  queryClient: QueryClient,
  user: Profile | null,
  athleteId: string,
): Promise<boolean> {
  if (!user) return false;
  const profileId = await fetchAthleteProfileId(queryClient, athleteId);
  return !!profileId && profileId === user.id;
}
