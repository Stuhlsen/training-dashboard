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

   === Abweichung: Admin-Fall ===

   Der Gate prüft user.isAdmin && true (Zeile 86), aber NICHT alle
   Tabellen haben eine is_admin()-RLS-Policy. Die RLS bleibt die
   tatsächliche Durchsetzung — dieser Gate ist grosszügiger als die
   RLS und kann Admin-Schreibbuttons anzeigen, die beim POST/PUT/PATCH
   mit 403 scheitern. Das ist sicher (keine unbefugten Schreibvorgänge
   moeglich), aber die Buttons sind tote UI.

   Tabellen MIT is_admin()-RLS (Admin darf schreiben):
     events          — migration 0004 (FOR ALL with is_admin())
     training_plans  — migration 0028 (FOR ALL with is_admin())
     bikes           — migration 0047 (FOR ALL with is_admin())
     bikefit         — migration 0049 (storage policies with is_admin())

   Tabellen OHNE is_admin()-RLS (Admin wuerde 403 erhalten):
     goals           — migration 0001 (nur uid/is_coach_of, FOR ALL)
     plan_cards      — migration 0001 + 0011 (nur uid/is_coach_of, UPDATE-T2)
     wellbeing       — migration 0001 (uid/is_coach_of fuer SELECT,
                       nur uid fuer INSERT/UPDATE/DELETE)
     ftp_history     — migration 0009 (uid/is_coach_of fuer SELECT,
                       nur uid fuer INSERT/UPDATE/DELETE)
     ladder_history  — migration 0015 (uid/is_coach_of fuer SELECT,
                       nur uid fuer INSERT/UPDATE/DELETE)
     athlete_formats — migration 0014 (uid/is_coach_of fuer SELECT,
                       nur uid fuer INSERT/UPDATE/DELETE)

   === Abweichung: Coach-Fall ===

   Der Gate gibt fuer Trainer ebenfalls true (resolveTrainerContext),
   aber die RLS granularisiert pro Tabelle und Aktion:
     goals:          Coach darf FOR ALL (Insert/Update/Delete) —
                     Gate trifft zu.
     events:         Coach darf FOR ALL (Insert/Update/Delete) —
                     Gate trifft zu.
     plan_cards:     Coach darf SEIT MIGRATION 0011 NUR UPDATE
                     (kein Insert/Delete). Gate ist zu grosszuegig.
     wellbeing:      Coach darf NUR SELECT (Insert/Update/Delete
                     sind athlete-only). Gate ist zu grosszuegig.
     ftp_history:    Coach darf NUR SELECT. Gate zu grosszuegig.
     ladder_history: Coach darf NUR SELECT. Gate zu grosszuegig.
     athlete_formats: Coach darf NUR SELECT. Gate zu grosszuegig.

   *** Sicherheitsbewertung ***
   In allen Faellen faellt die Entscheidung sicherheitskonservativ aus:
   die UI zeigt Buttons, die RLS kann sie ablehnen. Kein unbefugter
   Schreibvorgang ist moeglich. Ein zukuenftiger Umbau sollte entweder
   (a) die fehlenden Admin-Policies ergaenzen oder (b) isAdmin aus dem
   generischen Gate entfernen und pro Feature zulassen, das es wirklich
   braucht. Coach-Granularitaet koennte per per-table whitelist
   geloest werden.
   ============================================================ */

import type { QueryClient } from "@tanstack/react-query";
import { getProfile } from "./supabase/profiles";
import { fetchAthleteProfileId } from "./hooks/useAthleteProfileId";
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
  // betrachtet, löst sonst denselben Lookup zweimal aus (einmal hier,
  // einmal in der Trainer-Leiste).
  const { isTrainer } = await queryClient.fetchQuery({
    queryKey: qk.trainerContext(user.id, athleteId),
    queryFn: () => resolveTrainerContext(user, profileId),
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
 *  Lookup aus, exakt wie vorher.
 *
 *  `athleteProfileId` ist die Supabase-Profil-UUID des betrachteten Athleten
 *  (aufgelöst über fetchAthleteProfileId/useAthleteProfileId), NICHT der
 *  Anzeigename — ein Lookup über profiles.display_name wäre nicht
 *  eindeutig, weil das Feld self-service writable und ohne unique
 *  Constraint ist. Stattdessen läuft der Lookup über die UUID (getProfile). */
export async function resolveTrainerContext(
  user: Profile | null,
  athleteProfileId: string | null,
): Promise<{ isTrainer: boolean; athleteProfileId: string | null }> {
  if (!user || user.role !== "coach" || !athleteProfileId) return { isTrainer: false, athleteProfileId: null };
  const result = await getProfile(athleteProfileId);
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
