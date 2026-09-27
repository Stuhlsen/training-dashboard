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
 *  Bewusst NICHT `canWriteForAthlete` (Self + Trainer + Admin) — ein neuer
 *  Plan legt per Bulk-INSERT komplett neue `plan_cards`-Zeilen an (und
 *  löscht/deaktiviert ggf. bestehende, s. useCreateTrainingPlan.ts). Die
 *  RLS auf `plan_cards` (0011) erlaubt das ausschließlich dem Athleten
 *  selbst — Trainer darf dort nur UPDATE (kein INSERT/DELETE), Admin hat
 *  gar keine Policy. Vor Issue #103 zeigte "+ Neuer Plan" den Button auch
 *  für Trainer/Admin, der Bulk-Insert scheiterte dann an der RLS (403,
 *  Rollback greift zwar, aber der Button war dead UI). */
export function useCanCreatePlan(athleteId: string) {
  const { isSelf, isLoading } = useIsSelfAthlete(athleteId);
  return { canCreatePlan: isSelf, isLoading };
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
