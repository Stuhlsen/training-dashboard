/* ============================================================
   API/HOOKS/USEFTPGOAL.TS — das FTP-Ziel, das für den angezeigten Athleten
   gilt (Hero-Ringe/Zeitstrahl, Analyse, Coach-Panel).

   Quellen (core/ftp-goal.js::resolveFtpGoal): eigenes Settings-Ziel (nur
   wenn der angezeigte Athlet der eingeloggte User ist — `goals` ist
   owner-only, `useGoals()` hängt an der Session) → `ftpGoal` aus dem
   öffentlichen rides*.json (Trainer/Besucher, Sync schreibt es bei
   `ftpPublic`) → fester `config.ts`-Wert.
   ============================================================ */

import { athleteConfig } from "../../config";
import { pickFtpGoal, resolveFtpGoal } from "../../core/ftp-goal.js";
import { useGoals } from "./useGoals";
import { useRides } from "./useRides";
import { useIsSelfAthlete } from "./useWriteAuthorization";

export function useFtpGoal(athleteId: string): { ftpGoal: number | null } {
  const { goals } = useGoals();
  const { isSelf } = useIsSelfAthlete(athleteId);
  const { data } = useRides(athleteId);
  return {
    ftpGoal: resolveFtpGoal({
      ownGoal: isSelf ? pickFtpGoal(goals) : null,
      publicGoal: data?.athleteFtpGoal ?? null,
      configGoal: athleteConfig(athleteId)?.ftpGoal ?? null,
    }),
  };
}
