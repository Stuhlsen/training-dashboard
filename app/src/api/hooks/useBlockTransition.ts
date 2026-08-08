/* ============================================================
   API/HOOKS/USEBLOCKTRANSITION.TS — Blockstart-Dialog-Erkennung (D3/E2)
   (Etappe 7d, Port von state/block-transition.js)

   Nutzt ladder_history selbst als Marker "schon entschieden" — ein Block
   gilt als bereits entschieden, wenn seit seinem (per core/periodization.js
   ::blockStartDate angenäherten) Beginn schon ein reason='block-start'-
   Eintrag für eine der zulässigen Familien existiert. `cards` kommt vom
   Aufrufer (PlanningPage hat sie ohnehin schon über usePlanCards geladen)
   statt hier ein zweites Mal zu laden.
   ============================================================ */

import { useCallback, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getSessionFormats, type SessionFormat } from "../supabase/session-formats";
import { getAthleteFormats } from "../supabase/athlete-formats";
import { getLadderHistory, recordLadderStep } from "../supabase/ladder";
import { unwrap } from "../result";
import { useAuthUserId } from "./useSession";
import { useIsSelfAthlete } from "./useWriteAuthorization";
import { qk } from "../keys";
import { currentBlockTarget, blockStartDate } from "../../core/periodization.js";
import { localISODate, addDaysISO } from "../../core/format.js";
import type { Result } from "../types";

type PlanCardLike = { id: string; date: string; phase: string | null; cancelled?: boolean };

export interface BlockTransition {
  shouldPrompt: boolean;
  blockTarget?: string | null;
  candidates?: SessionFormat[];
}

const NO_PROMPT: BlockTransition = { shouldPrompt: false };

async function detectBlockTransition(profileId: string, cards: PlanCardLike[]): Promise<BlockTransition> {
  const today = localISODate();

  const blockTarget = currentBlockTarget(cards, today);
  if (!blockTarget) return NO_PROMPT;

  const targetSevenDaysAgo = currentBlockTarget(cards, addDaysISO(today, -7));
  if (targetSevenDaysAgo === blockTarget) return NO_PROMPT;

  const [catalogResult, athleteFormatsResult, historyResult] = await Promise.all([
    getSessionFormats(),
    getAthleteFormats(profileId),
    getLadderHistory(profileId),
  ]);
  const { formats: catalogFormats } = unwrap(catalogResult);
  const { athleteFormats } = unwrap(athleteFormatsResult);
  const { history } = unwrap(historyResult);

  const activeFormatIds = new Set(athleteFormats.filter((af) => af.active).map((af) => af.formatId));
  const candidates = catalogFormats.filter(
    (f) => activeFormatIds.has(f.id) && (f.blockTargets as string[]).includes(blockTarget),
  );
  if (candidates.length <= 1) return NO_PROMPT;

  const start = blockStartDate(cards, today) ?? today;
  const alreadyDecided = history.some(
    (h) => h.reason === "block-start" && h.validFrom >= start && candidates.some((c) => c.id === h.formatId),
  );
  if (alreadyDecided) return NO_PROMPT;

  return { shouldPrompt: true, blockTarget, candidates };
}

function cardsFingerprint(cards: PlanCardLike[]): string {
  return cards.map((c) => `${c.id}:${c.date}:${c.phase ?? ""}:${c.cancelled ? 1 : 0}`).join("|");
}

/** Prüft, ob der Blockstart-Dialog (E2) für den eingeloggten User jetzt
 *  erscheinen soll — nur relevant, wenn er auch der Athlet selbst ist
 *  (s. useIsSelfAthlete, Aufrufer gated das zusätzlich vor dem Rendern des
 *  Dialogs, wie ui/block-dialog.js::maybeOpenBlockDialog). */
export function useBlockTransition(athleteId: string, cards: PlanCardLike[]) {
  const userId = useAuthUserId();
  const { isSelf } = useIsSelfAthlete(athleteId);
  const fingerprint = useMemo(() => cardsFingerprint(cards), [cards]);

  const query = useQuery({
    queryKey: qk.blockTransition(userId ?? "anonymous", fingerprint),
    enabled: !!userId && isSelf,
    queryFn: () => detectBlockTransition(userId!, cards),
  });

  return { transition: query.data ?? NO_PROMPT, isLoading: query.isLoading };
}

/** Schreibt die Familienwahl (immer `step:1, reason:"block-start"`) und
 *  stößt einen frischen Stand für Export-Panel-Zeile (useLadderState) und
 *  die Blockstart-Erkennung selbst an — anders als bei plan-cards gibt es
 *  hier keine rohe Liste im Cache, die sich per setQueryData direkt
 *  patchen ließe (beide Hooks berechnen aus mehreren Quellen), deshalb
 *  invalidateQueries statt optimistischem Update. */
export function useRecordBlockStart(athleteId: string) {
  const userId = useAuthUserId();
  const queryClient = useQueryClient();
  const { isSelf } = useIsSelfAthlete(athleteId);

  const mutation = useMutation({
    mutationFn: (formatId: string) =>
      recordLadderStep(userId!, { formatId, step: 1, reason: "block-start", validFrom: localISODate() }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.ladderState(userId!) });
      queryClient.invalidateQueries({ queryKey: ["block-transition", userId!] });
    },
  });

  return useCallback(
    async (formatId: string): Promise<Result<{ id: string }>> => {
      if (!userId || !isSelf) return { ok: false, error: { code: "UNKNOWN", message: "Nicht berechtigt." } };
      return mutation.mutateAsync(formatId);
    },
    [userId, isSelf, mutation],
  );
}
