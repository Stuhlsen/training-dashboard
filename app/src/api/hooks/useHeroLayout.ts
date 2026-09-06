/* ============================================================
   API/HOOKS/USEHEROLAYOUT.TS — Hero-Kachel-Anordnung (Edit-Modus)

   1:1 nach useExportPrefs.ts-Muster, mit einer Abweichung: der Key hängt
   NICHT nur am eingeloggten User, sondern zusätzlich am gerade angesehenen
   Athleten-Tab (athleteId), seit Migration 0033 — Primärschlüssel
   (profile_id, athlete_id). Vorher landete die Anordnung EINES Athleten-
   Tabs für alle Tabs gleich (Bug-Fund Alex, 07.09.2026: Stuhlsens eigene
   Umsortierung erschien identisch bei hc_diZee/bentastiic), weil profile_id
   allein nicht unterscheidet, WESSEN Ansicht der Betrachter sich gerade
   anschaut. Die Anordnung bleibt trotzdem eine rein persönliche
   UI-Einstellung des eingeloggten Betrachters (kein Athleten-Datenfeld,
   RLS weiterhin nur `profile_id = auth.uid()`) — athleteId ist nur eine
   zusätzliche Dimension SEINER eigenen Zeilen, kein Fremdzugriff auf den
   angesehenen Athleten. Speichert 2D-Positionen (`{i,x,y}[]`), nicht nur
   eine Reihenfolge — s. core/hero-layout.js::resolveTileLayout. */

import { useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getHeroLayout, setHeroLayout, type HeroTilePosition } from "../supabase/hero-layout";
import { useAuthUserId } from "./useSession";
import { qk } from "../keys";
import { unwrap } from "../result";

/** Lädt/speichert die Hero-Kachel-Anordnung des eingeloggten Profils für
 *  den gerade angesehenen Athleten-Tab (athleteId = interne App-Kennung,
 *  "athlete1"/"athlete2"/"athlete4" aus config.ts — s. HeroPage.tsx). Kein
 *  gespeicherter Eintrag (frischer Tab) → `null` (der Aufrufer löst das
 *  über core/hero-layout.js::resolveTileLayout in eine kanonische
 *  Platzierung auf). Speichern ist optimistisch, wie useExportPrefs — ein
 *  Speicherfehler dreht die gerade gewählte Anordnung nicht wieder zurück
 *  (der Athlet hat sie im Editor schon gesehen). */
export function useHeroLayout(athleteId: string) {
  const userId = useAuthUserId();
  const queryClient = useQueryClient();
  const enabled = !!userId;
  const key = qk.heroLayout(userId ?? "anonymous", athleteId);

  const query = useQuery({
    queryKey: key,
    enabled,
    queryFn: async (): Promise<HeroTilePosition[] | null> => {
      const result = unwrap(await getHeroLayout(userId!, athleteId));
      return result.layout;
    },
  });

  const mutation = useMutation({
    mutationFn: async (next: HeroTilePosition[]) => {
      queryClient.setQueryData(key, next);
      return unwrap(await setHeroLayout(userId!, athleteId, next));
    },
  });

  const save = useCallback(
    (layout: HeroTilePosition[]) => {
      if (!enabled) return;
      mutation.mutate(layout);
    },
    [enabled, mutation],
  );

  return {
    layout: query.data ?? null,
    save,
    isLoading: query.isLoading,
  };
}
