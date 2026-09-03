/* ============================================================
   API/HOOKS/USEATHLETEPLANOFFSET.TS — plan_offset_weeks (Migration 0026)
   des GERADE BETRACHTETEN Athleten (nicht des eingeloggten Users).

   Gebraucht für die Anzeige-Kohärenz im Planungstab (Ruhetag-Ableitung,
   Erholungs-Schattierung, Phasen-Überschriften) und die week/phase-
   Neuvergabe beim Einzel-Move.

   NUR für Athleten mit generierter Plan-Vorlage (`hasGeneratedPlan`, aktuell
   nur Athlet 4). Für alle anderen ist der Offset per Definition 0 — auch
   wenn jemand die `profiles`-Spalte von Hand setzt, darf ein handgeschriebener
   Plan (Athlet 1/2) NICHT per Offset wandern (CLAUDE.md). Damit ist der
   Read-Pfad genauso gegatet wie der Write-Pfad (useShiftPlan +
   „Plan verschieben…"-Button).

   Für den betrachteten Athleten == eingeloggter User (der Normalfall, und der
   EINZIGE, der schreiben kann — RLS auf die eigene profiles-Zeile) kommt der
   Wert direkt aus `useCurrentProfile()`: EINE Quelle (qk.profile), die
   `useUpdatePlanOffsetWeeks` synchron aktualisiert, kein zweiter Fetch.
   Self-Erkennung synchron über den Anzeigenamen (kein Warten auf eine
   zweite Query).

   Nur ein GECOACHTER Fremdathlet zieht `profiles_visible`
   (getProfileByDisplayName); der Cache-Key trägt die Viewer-UID, weil der
   Wert autorisierungsabhängig ist (Nicht-Coach → 0).
   ============================================================ */

import { useQuery } from "@tanstack/react-query";
import { getProfileByDisplayName } from "../supabase/profiles";
import { athleteConfig, hasGeneratedPlan } from "../../config";
import { qk } from "../keys";
import { unwrap } from "../result";
import { useAuthUserId, useCurrentProfile } from "./useSession";

async function resolve(athleteId: string): Promise<number> {
  const name = athleteConfig(athleteId)?.name;
  if (!name) return 0;
  const { profile } = unwrap(await getProfileByDisplayName(name));
  return profile?.planOffsetWeeks ?? 0;
}

/** Ganzwochen-Verschiebung des betrachteten Athleten, `0` solange unbekannt
 *  und `0` für jeden Athleten ohne generierte Plan-Vorlage. */
export function useAthletePlanOffset(athleteId: string): number {
  const userId = useAuthUserId();
  const selfProfile = useCurrentProfile().data ?? null;
  const gated = hasGeneratedPlan(athleteId);
  const isSelf = !!selfProfile && athleteConfig(athleteId)?.name === selfProfile.displayName;

  const other = useQuery({
    queryKey: qk.athletePlanOffset(userId ?? "anon", athleteId),
    queryFn: () => resolve(athleteId),
    // Nur bei einem gecoachten Fremdathleten mit generierter Vorlage.
    enabled: !!userId && gated && !isSelf,
    staleTime: 5 * 60_000,
  });

  if (!gated) return 0;
  if (isSelf) return selfProfile.planOffsetWeeks ?? 0;
  return other.data ?? 0;
}
