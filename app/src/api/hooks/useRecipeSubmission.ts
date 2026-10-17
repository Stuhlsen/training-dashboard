/* ============================================================
   API/HOOKS/USERECIPESUBMISSION.TS — Rezept einreichen
   (Fahrplan 25, S2a; Schicht: UI → Hook → api/recipe-submission.ts)

   - useIngredientSearch: Zutaten-Suche (Server: höchstens 20 Treffer)
   - useRecipePreview:    Nährwerte/Allergene/Diät-Tags vom Server, speichert nichts
   - useSubmitRecipe:     optional Foto hochladen, dann einreichen

   Die App rechnet nichts selbst; sie reicht nur Formularstand und Foto weiter.
   ============================================================ */

import { useCallback, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  previewRecipe,
  searchIngredients,
  submitRecipe,
  type IngredientHit,
  type RecipePreview,
  type RecipeSubmissionBody,
  type SubmittedRecipeRow,
} from "../recipe-submission";
import { uploadRecipePhoto } from "../supabase/recipe-images";
import { useAuthUserId } from "./useSession";
import { qk } from "../keys";
import { catchResult, unwrap } from "../result";
import type { Result } from "../types";

const EMPTY_HITS: IngredientHit[] = [];
/** Ab so vielen Zeichen wird der Server gefragt (1 Buchstabe trifft fast alles). */
export const MIN_SEARCH_CHARS = 2;

/** Treffer der Zutaten-Suche. `query` kommt schon entprellt von der UI. */
export function useIngredientSearch(query: string) {
  const q = query.trim();
  const enabled = q.length >= MIN_SEARCH_CHARS;
  const result = useQuery({
    queryKey: qk.ingredientSearch(q),
    enabled,
    staleTime: 10 * 60_000,
    queryFn: async () => unwrap(await searchIngredients(q)).ingredients,
  });
  return {
    hits: enabled ? (result.data ?? EMPTY_HITS) : EMPTY_HITS,
    isFetching: enabled && result.isFetching,
    isError: enabled && result.isError,
    searched: enabled && !result.isFetching && !result.isError && result.data !== undefined,
  };
}

/** Server-Vorschau. Das Ergebnis hängt an der UI (der Formularstand wechselt). */
export function useRecipePreview() {
  const mutation = useMutation({
    mutationFn: async (body: RecipeSubmissionBody) => unwrap(await previewRecipe(body)),
  });
  const preview = useCallback(
    (body: RecipeSubmissionBody): Promise<Result<RecipePreview>> =>
      catchResult(() => mutation.mutateAsync(body)) as Promise<Result<RecipePreview>>,
    [mutation],
  );
  return { preview, isPending: mutation.isPending };
}

/** Foto (falls vorhanden) hochladen, dann einreichen. Ein schon hochgeladenes
 *  Foto wird bei einem erneuten Versuch (z. B. nach einem 422) wiederverwendet,
 *  damit kein verwaister Upload zurückbleibt. */
export function useSubmitRecipe() {
  const queryClient = useQueryClient();
  const userId = useAuthUserId();
  const uploaded = useRef<{ photo: Blob; path: string } | null>(null);

  const mutation = useMutation({
    mutationFn: async ({ body, photo }: { body: RecipeSubmissionBody; photo: Blob | null }) => {
      let imagePath: string | null = null;
      if (photo) {
        if (uploaded.current?.photo !== photo) {
          const up = unwrap(await uploadRecipePhoto(photo));
          uploaded.current = { photo, path: up.path };
        }
        imagePath = uploaded.current.path;
      }
      return unwrap(await submitRecipe(imagePath ? { ...body, image_url: imagePath } : body));
    },
    onSuccess: () => {
      uploaded.current = null;
      void queryClient.invalidateQueries({ queryKey: ["recipes"] });
    },
  });

  const submit = useCallback(
    async (body: RecipeSubmissionBody, photo: Blob | null): Promise<Result<{ recipe: SubmittedRecipeRow }>> => {
      if (!userId) return { ok: false, error: { code: "TOKEN_INVALID", message: "Nicht eingeloggt" } };
      return catchResult(() => mutation.mutateAsync({ body, photo }));
    },
    [mutation, userId],
  );

  return { submit, isPending: mutation.isPending };
}
