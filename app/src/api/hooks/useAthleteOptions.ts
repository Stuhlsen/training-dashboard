import { ATHLETES } from "../../config";
import { athleteOptions, findSlotId } from "../../core/athlete-selection.js";
import { useCurrentProfile } from "./useSession";

/** Einträge der Athleten-Leiste: die festen Plätze aus `config.ts`, plus der
 *  eigene Eintrag (Anzeigename, sonst „Ich"), wenn der eingeloggte Account
 *  auf keinem Platz sitzt. Solange das Profil lädt, nur die Plätze — so
 *  blitzt der eigene Eintrag bei Platzinhabern nie kurz auf. */
export function useAthleteOptions(): Array<{ id: string; name: string }> {
  const selfProfile = useCurrentProfile().data ?? null;
  const slotId = findSlotId(ATHLETES, selfProfile?.displayName);
  return athleteOptions({ athletes: ATHLETES, selfProfile, slotId });
}
