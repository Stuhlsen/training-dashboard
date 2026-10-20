/* ============================================================
   API/HOOKS/USERECIPECOMMENTS.TS — Kommentare zu Rezepten
   (Fahrplan 30 B5; Schicht: UI → Hook → api/supabase/recipe-comments.ts bzw. api/admin-recipe-comments.ts)

   - useRecipeComments: Kommentare eines Rezepts, nach Daumen sortiert (core/recipe-comments.js)
   - useCanComment:     Pseudonym gesetzt? Ohne eins zeigt die Oberfläche einen Hinweis statt des Felds
   - useAddComment:     Kommentar schreiben (Länge und Leerraum werden vorher geprüft)
   - useVoteComment:    eigenen Daumen auf einen fremden Kommentar setzen oder ändern
   - useDeleteComment:  Schreiber löscht den eigenen (RLS), der Admin jeden (admin-api, mit Audit)

   Jede Änderung lädt nur die Kommentare dieses einen Rezepts neu.
   ============================================================ */

import { useCallback, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { addRecipeComment, deleteOwnRecipeComment, listRecipeComments, setCommentVote } from "../supabase/recipe-comments";
import { deleteRecipeCommentAsAdmin } from "../admin-recipe-comments";
import { useAuth } from "../auth/useAuth";
import { useAuthUserId, useIsAdmin, useSessionProfile } from "./useSession";
import { qk } from "../keys";
import { catchResult, unwrap } from "../result";
import {
  canDeleteComment,
  canVoteComment,
  COMMENT_MAX_CHARS,
  hasPseudonym,
  sortCommentsByThumbs,
  validateCommentText,
} from "../../core/recipe-comments.js";
import { isValidVote } from "../../core/recipe-votes.js";
import type { RecipeComment, RecipeVote, Result } from "../types";

/** Stabile Referenz für "noch nichts geladen" (s. useFtpHistory.ts). */
const EMPTY_COMMENTS: RecipeComment[] = [];

/** Kommentare eines Rezepts, die meisten Daumen zuerst. */
export function useRecipeComments(recipeId: string | null) {
  const query = useQuery({
    queryKey: qk.recipeComments(recipeId ?? "none"),
    enabled: !!recipeId,
    staleTime: 30_000,
    queryFn: async () => unwrap(await listRecipeComments(recipeId!)).comments,
  });
  const data = query.data;
  const comments = useMemo(
    () => (data && data.length > 0 ? (sortCommentsByThumbs(data) as RecipeComment[]) : EMPTY_COMMENTS),
    [data],
  );
  return { comments, isLoading: !!recipeId && query.isLoading, isError: query.isError, refetch: query.refetch };
}

/** Darf der Athlet schreiben? Nur mit einem eigenen Pseudonym — sonst stünde der Teil seiner
 *  E-Mail vor dem @ öffentlich als Autorname. Solange das Profil lädt: noch nicht entschieden. */
export function useCanComment() {
  const { user } = useAuth();
  const profile = useSessionProfile();
  const loaded = !!profile;
  return {
    loaded,
    canComment: loaded && hasPseudonym(profile.displayName, user?.email ?? null),
  };
}

export function useAddComment(recipeId: string) {
  const queryClient = useQueryClient();
  const userId = useAuthUserId();

  const mutation = useMutation({
    mutationFn: async (body: string) => unwrap(await addRecipeComment(recipeId, userId!, body)),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.recipeComments(recipeId) });
    },
  });

  const add = useCallback(
    async (text: string): Promise<Result> => {
      if (!userId) return { ok: false, error: { code: "TOKEN_INVALID", message: "Nicht eingeloggt" } };
      const checked = validateCommentText(text);
      if (!checked.ok) {
        return {
          ok: false,
          error: {
            code: "SCHEMA",
            message:
              checked.reason === "empty"
                ? "Bitte schreibe einen Text."
                : `Der Kommentar darf höchstens ${COMMENT_MAX_CHARS} Zeichen lang sein.`,
          },
        };
      }
      return catchResult(() => mutation.mutateAsync(checked.text));
    },
    [mutation, userId],
  );

  return { add, isPending: mutation.isPending };
}

type VoteVars = { commentId: string; vote: RecipeVote };

export function useVoteComment(recipeId: string) {
  const queryClient = useQueryClient();
  const userId = useAuthUserId();

  const mutation = useMutation({
    mutationFn: async ({ commentId, vote }: VoteVars) => unwrap(await setCommentVote(commentId, userId!, vote)),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.recipeComments(recipeId) });
    },
  });

  const vote = useCallback(
    async (comment: RecipeComment, value: RecipeVote): Promise<Result> => {
      if (!userId) return { ok: false, error: { code: "TOKEN_INVALID", message: "Nicht eingeloggt" } };
      if (!isValidVote(value)) {
        return { ok: false, error: { code: "SCHEMA", message: "Der Daumen muss hoch oder runter sein." } };
      }
      if (!canVoteComment(comment, userId)) {
        return { ok: false, error: { code: "SCHEMA", message: "Auf den eigenen Kommentar gibt es keinen Daumen." } };
      }
      return catchResult(() => mutation.mutateAsync({ commentId: comment.id, vote: value }));
    },
    [mutation, userId],
  );

  return { vote, isPending: mutation.isPending };
}

export function useDeleteComment(recipeId: string) {
  const queryClient = useQueryClient();
  const isAdmin = useIsAdmin();

  const mutation = useMutation({
    mutationFn: async (comment: RecipeComment) =>
      // Den eigenen Kommentar löscht der Schreiber per RLS; fremde nur der Admin über die admin-api.
      unwrap(comment.isMine ? await deleteOwnRecipeComment(comment.id) : await deleteRecipeCommentAsAdmin(comment.id)),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.recipeComments(recipeId) });
    },
  });

  const remove = useCallback(
    async (comment: RecipeComment): Promise<Result> => {
      if (!canDeleteComment(comment, isAdmin)) {
        return { ok: false, error: { code: "SCHEMA", message: "Diesen Kommentar darfst du nicht löschen." } };
      }
      return catchResult(() => mutation.mutateAsync(comment));
    },
    [mutation, isAdmin],
  );

  return { remove, isPending: mutation.isPending };
}
