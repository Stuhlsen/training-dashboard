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
import { qk } from "./keys";
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

  // fetchQuery statt direktem Aufruf: teilt sich Cache/Deduplizierung mit
  // useTrainerContext() (identischer qk.trainerContext-Key, Muster wie
  // fetchAthleteProfileId oben) — ein Coach, der eine Athletenseite
  // betrachtet, löst sonst denselben getProfileByDisplayName()-Lookup
  // zweimal aus (einmal hier, einmal in der Trainer-Leiste).
  const { isTrainer } = await queryClient.fetchQuery({
    queryKey: qk.trainerContext(user.id, athleteId),
    queryFn: () => resolveTrainerContext(user, athleteId),
    staleTime: 5 * 60_000,
  });
  return isTrainer;
}

/** Ist `user` (Coach-Rolle vorausgesetzt) der Trainer DIESES Athleten —
 *  und falls ja, was ist die Supabase-Profil-UUID des Athleten? Extrahiert
 *  aus canWriteForAthlete()s bisherigem Coach-Zweig (Etappe 7a): die
 *  Trainer-Leiste (`useTrainerContext`) braucht denselben Lookup, zusätzlich
 *  aber `athleteProfileId` für `trainer_view_prefs` — canWriteForAthlete
 *  selbst braucht nur das Bool-Ergebnis. Ein Nicht-Coach löst keinen
 *  Lookup aus, exakt wie vorher. */
export async function resolveTrainerContext(
  user: Profile | null,
  athleteId: string,
): Promise<{ isTrainer: boolean; athleteProfileId: string | null }> {
  if (!user || user.role !== "coach") return { isTrainer: false, athleteProfileId: null };
  const name = athleteConfig(athleteId)?.name;
  if (!name) return { isTrainer: false, athleteProfileId: null };
  const result = await getProfileByDisplayName(name);
  if (!result.ok || !result.profile) return { isTrainer: false, athleteProfileId: null };
  return { isTrainer: result.profile.coachId === user.id, athleteProfileId: result.profile.id };
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
