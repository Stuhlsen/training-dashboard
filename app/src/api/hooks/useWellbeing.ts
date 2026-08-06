/* ============================================================
   API/HOOKS/USEWELLBEING.TS — Morgen-Check-in

   Ersetzt state/wellbeing.js (Vanilla). Anders als Karten/Events/Vorschläge
   hängt der Check-in an der `auth.uid()` des EINGELOGGTEN Users, nicht am
   Athleten-Toggle — wer eine fremde Athletenseite ansieht, sieht dort
   trotzdem seinen eigenen Check-in-Dialog. Der Query-Key trägt deshalb die
   User-ID, nicht die athleteId.

   Damit erledigt sich auch der aufwendigste Teil des Vanilla-Moduls: dort
   lauschte ein `onSessionChange`-Handler auf Login/Logout, um den Modul-
   State zu leeren bzw. neu zu laden, und ein requestGuard verhinderte, dass
   eine Antwort für den vorherigen User im State landet. Beides ist mit
   einem user-gebundenen Key gegenstandslos.
   ============================================================ */

import { useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getRange, getSharedRange, upsertToday } from "../supabase/wellbeing";
import { fetchAthleteProfileId } from "./useAthleteProfileId";
import { useAuthUserId } from "./useSession";
import { addDaysISO, localISODate } from "../../core/format.js";
import { getSubjectiveReadiness } from "../../core/readiness.js";
import { qk } from "../keys";
import { catchResult, unwrap } from "../result";
import type { Checkin, CheckinInput, Result, SharedCheckin } from "../types";

const NOT_LOGGED_IN = { code: "UNKNOWN" as const, message: "Nicht eingeloggt" };

export interface TodayCheckin {
  /** Exakter "heute"-Treffer — nie ein Vortagswert. Der Check-in-Dialog
   *  füllt daraus sein Formular und darf dort nichts von gestern zeigen. */
  checkin: Checkin | null;
  /** Subjektiver Kanal für den Governor (core/briefing.js). Anders als
   *  `checkin` zählt hier auch der gestrige Wert als "veraltet aber
   *  relevant" — deshalb lädt der Hook zwei Tage, nicht einen. */
  subjective: ReturnType<typeof getSubjectiveReadiness> | null;
}

/** Heutiger (+ gestriger) Check-in des eingeloggten Users. */
export function useTodayCheckin() {
  const userId = useAuthUserId();
  const today = localISODate();
  const from = addDaysISO(today, -1);

  return useQuery({
    queryKey: qk.wellbeingRange(userId ?? "anonymous", from, today),
    enabled: !!userId,
    queryFn: async (): Promise<TodayCheckin> => {
      const { checkins } = unwrap(await getRange(userId!, from, today));
      return {
        checkin: checkins.find((c) => c.date === today) ?? null,
        subjective: getSubjectiveReadiness(checkins, today),
      };
    },
  });
}

/** Speichert den heutigen Check-in (Upsert auf denselben Tag).
 *
 *  Der frisch geschriebene Wert geht direkt in den Cache: "heute vorhanden"
 *  allein genügt für die Frische-Einstufung, ein zweiter Range-Request nur
 *  um den gestrigen Wert erneut mitzuschleppen wäre verschwendet. */
export function useSaveCheckin() {
  const queryClient = useQueryClient();
  const userId = useAuthUserId();
  const today = localISODate();
  const key = qk.wellbeingRange(userId ?? "anonymous", addDaysISO(today, -1), today);

  const mutation = useMutation({
    mutationFn: async (input: CheckinInput) => unwrap(await upsertToday(userId!, today, input)),
    onSuccess: ({ checkin }) => {
      queryClient.setQueryData<TodayCheckin>(key, {
        checkin,
        subjective: getSubjectiveReadiness([checkin], today),
      });
    },
  });

  const save = useCallback(
    async (input: CheckinInput): Promise<Result<{ checkin: Checkin }>> => {
      if (!userId) return { ok: false, error: NOT_LOGGED_IN };
      return catchResult(() => mutation.mutateAsync(input));
    },
    [mutation, userId],
  );

  return { save, isPending: mutation.isPending };
}

/** Check-ins eines BELIEBIGEN Athleten im Zeitraum — für die Trainer-Leiste:
 *  ein Trainer braucht die Check-ins SEINES Athleten, nicht seine eigenen
 *  (RLS erlaubt das via is_coach_of). Liest die Basistabelle, greift also
 *  nur für den Athleten selbst oder dessen Coach. */
export function useCheckinRange(athleteProfileId: string | null, fromIso: string, toIso: string) {
  return useQuery({
    queryKey: qk.wellbeingRange(athleteProfileId ?? "anonymous", fromIso, toIso),
    enabled: !!athleteProfileId,
    queryFn: async (): Promise<Checkin[]> =>
      unwrap(await getRange(athleteProfileId!, fromIso, toIso)).checkins,
  });
}

/** Heutiger FREIGEGEBENER Check-in eines beliebigen Athleten — für
 *  Betrachter, die weder der Athlet noch dessen Trainer sind (Besucher,
 *  fremder Coach; kein Login nötig). Liest die öffentliche
 *  `wellbeing_shared`-View, die ohne aktiven Toggle serverseitig leer
 *  bleibt; "kein Toggle" und "kein Eintrag" sind hier nicht unterscheidbar
 *  und müssen es auch nicht sein. */
export function useSharedCheckin(athleteId: string) {
  const queryClient = useQueryClient();
  const today = localISODate();

  return useQuery({
    queryKey: qk.wellbeingShared(athleteId, today),
    queryFn: async (): Promise<SharedCheckin | null> => {
      const profileId = await fetchAthleteProfileId(queryClient, athleteId);
      if (!profileId) return null;
      const { checkins } = unwrap(await getSharedRange(profileId, today, today));
      return checkins[0] ?? null;
    },
  });
}
