/* ============================================================
   API/HOOKS/USEHEROLAYOUT.TS — Hero-Kachel-Anordnung (Edit-Modus)

   1:1 nach useExportPrefs.ts-Muster: ein Profil hat höchstens eine Zeile
   (Primärschlüssel profile_id aus 0030_hero_tile_order.sql), Key hängt nur
   am eingeloggten User, nicht am Athleten-Toggle — die Anordnung ist eine
   persönliche UI-Einstellung des eingeloggten Athleten, kein Athleten-
   Datenfeld. Speichert 2D-Positionen (`{i,x,y}[]`), nicht nur eine
   Reihenfolge — s. core/hero-layout.js::resolveTileLayout.
   ============================================================ */

import { useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getHeroLayout, setHeroLayout, type HeroTilePosition } from "../supabase/hero-layout";
import { useAuthUserId } from "./useSession";
import { qk } from "../keys";
import { unwrap } from "../result";

/** Lädt/speichert die Hero-Kachel-Anordnung des eingeloggten Profils.
 *  Kein gespeicherter Eintrag (frisches Profil) → `null` (der Aufrufer
 *  löst das über core/hero-layout.js::resolveTileLayout in eine
 *  kanonische Platzierung auf). Speichern ist optimistisch, wie
 *  useExportPrefs — ein Speicherfehler dreht die gerade gewählte
 *  Anordnung nicht wieder zurück (der Athlet hat sie im Editor schon
 *  gesehen). */
export function useHeroLayout() {
  const userId = useAuthUserId();
  const queryClient = useQueryClient();
  const enabled = !!userId;
  const key = qk.heroLayout(userId ?? "anonymous");

  const query = useQuery({
    queryKey: key,
    enabled,
    queryFn: async (): Promise<HeroTilePosition[] | null> => {
      const result = unwrap(await getHeroLayout(userId!));
      return result.layout;
    },
  });

  const mutation = useMutation({
    mutationFn: async (next: HeroTilePosition[]) => {
      queryClient.setQueryData(key, next);
      return unwrap(await setHeroLayout(userId!, next));
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
