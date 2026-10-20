/* ============================================================
   API/HOOKS/USERECIPEREVIEW.TS — Rezept in Prüfung entscheiden (nur Admin)
   (Fahrplan 30 B4; Schicht: UI → Hook → api/admin-recipes.ts → admin-api)

   Freigeben oder mit Grund ablehnen. Der Server prüft den Admin, schreibt das
   Audit-Log und lehnt ab, wenn das Rezept nicht mehr in Prüfung ist (409).
   Eine Entscheidung lädt ["recipes"] neu — die Listen "In Prüfung", "Alle Rezepte"
   und "Meine Einreichungen" ändern sich damit gemeinsam.
   ============================================================ */

import { useCallback } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { approveRecipe, rejectRecipe, REJECTION_REASON_MAX } from "../admin-recipes";
import { catchResult, unwrap } from "../result";
import type { Result } from "../types";

type DecideVars = { recipeId: string; reason: string | null };

export function useDecideRecipe() {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async ({ recipeId, reason }: DecideVars) =>
      reason === null ? unwrap(await approveRecipe(recipeId)) : unwrap(await rejectRecipe(recipeId, reason)),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["recipes"] });
    },
  });

  const approve = useCallback(
    (recipeId: string): Promise<Result> => catchResult(() => mutation.mutateAsync({ recipeId, reason: null })),
    [mutation],
  );

  const reject = useCallback(
    async (recipeId: string, reason: string): Promise<Result> => {
      const clean = reason.trim();
      if (clean.length === 0) {
        return { ok: false, error: { code: "SCHEMA", message: "Bitte einen Grund angeben." } };
      }
      if (clean.length > REJECTION_REASON_MAX) {
        return {
          ok: false,
          error: { code: "SCHEMA", message: `Der Grund darf höchstens ${REJECTION_REASON_MAX} Zeichen lang sein.` },
        };
      }
      return catchResult(() => mutation.mutateAsync({ recipeId, reason: clean }));
    },
    [mutation],
  );

  return { approve, reject, isPending: mutation.isPending };
}
