import { useQuery, useQueryClient } from "@tanstack/react-query";
import { canWriteForAthlete, isSelfAthlete } from "../write-authorization";
import { useSessionProfile } from "./useSession";
import { qk } from "../keys";

/** Darf der eingeloggte User für den angezeigten Athleten schreiben?
 *  Steuert die Sichtbarkeit von Schreib-Knöpfen, nicht den Zugriff selbst
 *  (das macht die RLS) — s. ../write-authorization.ts.
 *
 *  Der Key hängt an BEIDEN Seiten (User und Athlet): ein Kontowechsel und
 *  ein Toggle-Wechsel müssen je einen eigenen Eintrag ergeben, sonst würde
 *  eine Antwort für die eine Kombination die andere beantworten.
 *
 *  Solange die Antwort aussteht, ist `canWrite` false — im Zweifel keinen
 *  Schreib-Knopf zeigen. */
export function useCanWriteForAthlete(athleteId: string) {
  const queryClient = useQueryClient();
  const user = useSessionProfile();
  const query = useQuery({
    queryKey: qk.writeAuthorization(user?.id ?? null, athleteId),
    queryFn: () => canWriteForAthlete(queryClient, user, athleteId),
    staleTime: 5 * 60_000,
  });
  return { canWrite: query.data === true, isLoading: query.isLoading };
}

/** Darf der eingeloggte User für den angezeigten Athleten einen
 *  Trainingsplan erzeugen (Fahrplan 8 E5)?
 *
 *  Bewusst getrennt von `editable` im Planungstab: dort schließt
 *  `isReadOnlyAthlete()` Athlet 2 komplett vom Schreiben aus (reiner
 *  Vergleichsathlet). Das „Plan bauen" ist die eine Ausnahme, die auch für
 *  einen read-only Athleten gelten soll (Fahrplan-Entscheidung 1, hier als
 *  schmales Gate statt `readOnly` ganz zu entfernen). Autorisierung selbst
 *  = `canWriteForAthlete` (Self + Trainer + Admin, Entscheidung 19); die RLS
 *  auf `training_plans` (E1) setzt es durch. */
export function useCanCreatePlan(athleteId: string) {
  const { canWrite, isLoading } = useCanWriteForAthlete(athleteId);
  return { canCreatePlan: canWrite, isLoading };
}

/** Ist der angezeigte Athlet der eingeloggte User selbst? Für Dialoge, die
 *  sichtbar machen müssen, für wen gespeichert wird. */
export function useIsSelfAthlete(athleteId: string) {
  const queryClient = useQueryClient();
  const user = useSessionProfile();
  const query = useQuery({
    queryKey: [...qk.writeAuthorization(user?.id ?? null, athleteId), "self"],
    queryFn: () => isSelfAthlete(queryClient, user, athleteId),
    staleTime: 5 * 60_000,
  });
  return { isSelf: query.data === true, isLoading: query.isLoading };
}
