/* ============================================================
   API/HOOKS/USEPLANCARDS.TS — Plankarten lesen und schreiben

   Ersetzt state/plan-cards.js (Vanilla). Zwei Dinge sind bewusst anders:

   1. `loadedForAthleteId` entfällt. Der Query-Key trägt die athleteId, eine
      Antwort kann also gar nicht mehr im Cache eines anderen Athleten
      landen — genau der Fall, gegen den das Feld verteidigte.

   2. Move/Cancel/Undo/Vollbearbeitung teilen sich EINE Mutation. Alle vier
      patchen dieselbe Zeile; was sie unterscheidet, ist allein der Patch,
      und dessen Regeln liegen als reine Funktionen in ../plan-cards/patch.ts
      (dort auch getestet). Übrig bleibt hier die Async-Seite: Optimistik,
      Rollback, Cache-Pflege.

   Der Reihenfolgeschutz aus der Vanilla-Version bleibt erhalten, siehe
   ../write-guard.ts — React Querys Standard-Rollback allein wäre hier
   falsch.
   ============================================================ */

import { useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createPlanCard as createPlanCardAdapter,
  listPlanCards,
  removePlanCard,
  updatePlanCard as updatePlanCardAdapter,
} from "../supabase/plan-cards";
import {
  applyMoveOptimistic,
  buildCancelPatch,
  buildMovePatch,
  buildUndoPatch,
  nextSortOrder,
  sortCards,
} from "../plan-cards/patch";
import { fetchAthleteProfileId } from "./useAthleteProfileId";
import { useAthletePlanOffset } from "./useAthletePlanOffset";
import { useAuthUserId, useSessionProfile } from "./useSession";
import { useIsSelfAthlete } from "./useWriteAuthorization";
import { useUpdatePlanOffsetWeeks } from "./useProfile";
import { qk } from "../keys";
import { catchResult, ResultError_, unwrap } from "../result";
import { beginWrite, isCurrentWrite } from "../write-guard";
import { pushCardWorkout } from "../intervals/push";
import { planShiftPatches } from "../../core/plan-shift.js";
import { localISODate } from "../../core/format.js";
import { hasGeneratedPlan } from "../../config";
import type { PlanCard, PlanCardInput, PlanCardPatch, Result } from "../types";

const NOT_LOGGED_IN = { code: "UNKNOWN" as const, message: "Nicht eingeloggt" };
const NO_ACCOUNT = {
  code: "NO_DATA" as const,
  message: "Athlet hat (noch) keinen Supabase-Account",
};
const CARD_NOT_FOUND = { code: "NO_DATA" as const, message: "Karte nicht gefunden" };

const scopeOf = (athleteId: string) => `plan-cards:${athleteId}`;

/** Alle Karten des angezeigten Athleten. Öffentlich lesbar (E1), kein Login
 *  nötig. Ein Athlet ohne Supabase-Account ist ein Fehlerfall (NO_DATA) und
 *  keine leere Liste — anders als bei Events, wo das absichtlich als "keine
 *  Events" durchgeht (s. useEvents). Der Unterschied stammt aus der
 *  Vanilla-Version und bleibt erhalten: eine leere Kartenliste würde im
 *  Planungstab wie ein leerer Plan aussehen statt wie ein fehlender Account. */
export function usePlanCards(athleteId: string) {
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: qk.planCards(athleteId),
    queryFn: async (): Promise<PlanCard[]> => {
      const profileId = await fetchAthleteProfileId(queryClient, athleteId);
      if (!profileId) throw new ResultError_(NO_ACCOUNT);
      return unwrap(await listPlanCards(profileId)).cards;
    },
  });
}

interface PatchVars {
  id: string;
  patch: PlanCardPatch;
  /** Wie die Karte während des Schreibens aussehen soll. Nur das Verschieben
   *  nutzt das — Ausfallen/Rückgängig warten die Serverantwort ab, weil sie
   *  keine sichtbare Zieh-Geste haben, die sofort reagieren müsste. */
  optimistic?: PlanCard;
}

interface WriteContext {
  token: number;
  previous: PlanCard[] | undefined;
}

/** Ersetzt eine Karte im Cache und hält die Sortierung stabil. */
function replaceCard(cards: PlanCard[] | undefined, next: PlanCard): PlanCard[] {
  return sortCards((cards ?? []).map((c) => (c.id === next.id ? next : c)));
}

/** Die eine Schreib-Mutation, auf der Move/Cancel/Undo/Bearbeiten sitzen. */
function usePatchCard(athleteId: string) {
  const queryClient = useQueryClient();
  const key = qk.planCards(athleteId);
  const scope = scopeOf(athleteId);

  return useMutation<{ card: PlanCard }, unknown, PatchVars, WriteContext>({
    mutationFn: async ({ id, patch }) => unwrap(await updatePlanCardAdapter(id, patch)),

    onMutate: async ({ optimistic }) => {
      // cancelQueries verhindert, dass ein gerade laufender Ladevorgang die
      // optimistische Änderung gleich wieder überschreibt.
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<PlanCard[]>(key);
      // Token NACH dem Abbrechen holen, aber VOR dem Schreiben — ab hier
      // gilt dieser Vorgang als der jüngste auf diesem Athleten.
      const token = beginWrite(scope);
      if (optimistic) {
        queryClient.setQueryData<PlanCard[]>(key, (cards) => replaceCard(cards, optimistic));
      }
      return { token, previous };
    },

    onError: (_err, _vars, context) => {
      // Kein blinder Rollback: hat inzwischen ein neuerer Vorgang begonnen,
      // gehört ihm der Zustand. Ein Zurückspielen des alten Snapshots würde
      // dessen Änderung unsichtbar machen, obwohl die DB sie führt.
      if (!context || !isCurrentWrite(scope, context.token)) return;
      if (context.previous) queryClient.setQueryData(key, context.previous);
    },

    onSuccess: (data, _vars, context) => {
      // Dieselbe Prüfung für den Erfolgsfall: eine verspätete Antwort trägt
      // einen überholten Stand und darf den neueren nicht überschreiben.
      if (!context || !isCurrentWrite(scope, context.token)) return;
      queryClient.setQueryData<PlanCard[]>(key, (cards) => replaceCard(cards, data.card));
    },
  });
}

/** Liest den aktuellen Kartenstand aus dem Cache — Grundlage für alle
 *  Patch-Berechnungen. Bewusst der Cache und nicht der Hook-Rückgabewert:
 *  zwei schnell aufeinanderfolgende Aktionen müssen die jeweils frischere
 *  Liste sehen, nicht den Stand des letzten Renders. */
function useCardsSnapshot(athleteId: string) {
  const queryClient = useQueryClient();
  // Der Key wird IM Callback gebildet, nicht davor: `qk.planCards()` liefert
  // bei jedem Render ein neues Array, als Dependency würde es die
  // Memoisierung bei jedem Render brechen — und über die abhängigen
  // useCallbacks bis zu `move`/`undo` durchschlagen, die dann in fremden
  // Effect-Dependencies unnötig neu feuern.
  return useCallback(
    () => queryClient.getQueryData<PlanCard[]>(qk.planCards(athleteId)) ?? [],
    [queryClient, athleteId],
  );
}

/** Verschieben — gemeinsamer Schreibpfad für den "Verschieben"-Button UND
 *  Drag & Drop. Optimistik und Rollback liegen deshalb hier und nicht im
 *  Drag-Handler, sonst hätte der Button-Pfad sie nicht. */
export function useMovePlanCard(athleteId: string) {
  const mutation = usePatchCard(athleteId);
  const snapshot = useCardsSnapshot(athleteId);
  const userId = useAuthUserId();
  // Plan-Verschiebung des angezeigten Athleten — damit ein Einzel-Move das
  // Phasen-Label aus dem verschobenen Plan-Wochen-Modell zieht (Migration 0026).
  const offsetWeeks = useAthletePlanOffset(athleteId);

  const move = useCallback(
    async (id: string, newDate: string, reason?: string): Promise<Result<{ card: PlanCard }>> => {
      if (!userId) return { ok: false, error: NOT_LOGGED_IN };
      const cards = snapshot();
      const card = cards.find((c) => c.id === id);
      if (!card) return { ok: false, error: CARD_NOT_FOUND };
      return catchResult(() =>
        mutation.mutateAsync({
          id,
          patch: buildMovePatch(cards, card, newDate, reason, athleteId, offsetWeeks),
          optimistic: applyMoveOptimistic(cards, card, newDate, reason, athleteId, offsetWeeks),
        }),
      );
    },
    [mutation, snapshot, userId, athleteId, offsetWeeks],
  );

  return { move, isPending: mutation.isPending };
}

export function useCancelPlanCard(athleteId: string) {
  const mutation = usePatchCard(athleteId);
  const userId = useAuthUserId();

  const cancel = useCallback(
    async (id: string, reason?: string): Promise<Result<{ card: PlanCard }>> => {
      if (!userId) return { ok: false, error: NOT_LOGGED_IN };
      return catchResult(() => mutation.mutateAsync({ id, patch: buildCancelPatch(reason) }));
    },
    [mutation, userId],
  );

  return { cancel, isPending: mutation.isPending };
}

/** "Rückgängig" (↩) — deckt beide Fälle ab, die der Knopf auslösen kann:
 *  ausgefallene Karte zurück auf "geplant", verschobene Karte zurück auf ihr
 *  Ursprungsdatum. Gibt es nichts rückgängig zu machen, passiert nichts und
 *  der Aufruf gilt trotzdem als erfolgreich (wie in der Vanilla-Version). */
export function useUndoAdjustment(athleteId: string) {
  const mutation = usePatchCard(athleteId);
  const snapshot = useCardsSnapshot(athleteId);
  const userId = useAuthUserId();
  const offsetWeeks = useAthletePlanOffset(athleteId);

  const undo = useCallback(
    async (id: string): Promise<Result<{ card?: PlanCard }>> => {
      if (!userId) return { ok: false, error: NOT_LOGGED_IN };
      const cards = snapshot();
      const card = cards.find((c) => c.id === id);
      if (!card) return { ok: true };
      const patch = buildUndoPatch(cards, card, athleteId, offsetWeeks);
      if (!patch) return { ok: true };
      return catchResult(() => mutation.mutateAsync({ id, patch }));
    },
    [mutation, snapshot, userId, athleteId, offsetWeeks],
  );

  return { undo, isPending: mutation.isPending };
}

/** Ganzen Trainingsplan um N Wochen verschieben (Migration 0026, Punkt 1 der
 *  6-Punkte-Liste). Nur für Athlet 4 (generierte Vorlage, `hasGeneratedPlan`)
 *  und nur self: der Offset lebt auf der eigenen `profiles`-Zeile
 *  (RLS `id = auth.uid()`), ein Trainer kann ihn nicht für einen Athleten
 *  setzen, und der Sync verschiebt nur diese eine Vorlage mit.
 *
 *  `plan_offset_weeks` ist die Quelle der Wahrheit; `target` ist der neue
 *  Stand, das Delta zum gespeicherten Wert datiert die künftigen, nicht
 *  ausgefallenen Karten um.
 *
 *  Reihenfolge OFFSET ZUERST, dann Karten: schlägt der ERSTE Karten-Patch
 *  fehl, wird der Offset zurückgenommen (sauberer Ausgangszustand). Schlägt
 *  ein SPÄTERER fehl, bleibt der Offset stehen und der Rest ist von Hand
 *  nachzuziehen — ein Wiederholen mit demselben Ziel ist dann ein No-op
 *  (delta 0) statt eines DOPPELTEN Shifts der bereits verschobenen Karten.
 *  Karten sequenziell, nicht parallel: `usePatchCard` vergibt pro Aufruf ein
 *  write-guard-Token, parallele Läufe würden sich gegenseitig aus dem
 *  Cache-Update kegeln. */
export function useShiftPlan(athleteId: string) {
  const queryClient = useQueryClient();
  const mutation = usePatchCard(athleteId);
  const snapshot = useCardsSnapshot(athleteId);
  const userId = useAuthUserId();
  const { isSelf } = useIsSelfAthlete(athleteId);
  const storedOffset = useSessionProfile()?.planOffsetWeeks ?? 0;
  const { update: updateOffset } = useUpdatePlanOffsetWeeks();

  const shift = useCallback(
    async (targetOffsetWeeks: number): Promise<Result<{ moved: number }>> => {
      if (!userId) return { ok: false, error: NOT_LOGGED_IN };
      if (!isSelf || !hasGeneratedPlan(athleteId))
        return { ok: false, error: { code: "UNKNOWN", message: "Der Plan lässt sich hier nicht verschieben" } };
      const target = Math.max(-8, Math.min(12, Math.round(targetOffsetWeeks || 0)));
      const delta = target - storedOffset;
      if (delta === 0) return { ok: true, moved: 0 };

      const cards = snapshot();
      const plan = planShiftPatches(cards, delta, localISODate(), athleteId, target);
      if (!plan.ok) return { ok: false, error: { code: "UNKNOWN", message: plan.reason } };
      if (!plan.patches.length) return { ok: true, moved: 0 };

      const offsetResult = await updateOffset(target);
      if (!offsetResult.ok) return offsetResult;

      let moved = 0;
      for (const { id, ...patch } of plan.patches) {
        const r = await catchResult(() => mutation.mutateAsync({ id, patch }));
        if (!r.ok) {
          if (moved === 0) {
            await updateOffset(storedOffset); // best effort — noch keine Karte bewegt
            return r;
          }
          return {
            ok: false,
            error: {
              code: "UNKNOWN",
              message: `Plan-Offset gesetzt, aber nur ${moved} von ${plan.patches.length} Einheiten verschoben — die übrigen bitte einzeln per Ziehen nachziehen.`,
            },
          };
        }
        moved++;
      }
      // qk.athletePlanOffset ist ein eigener Cache neben qk.profile — die
      // Anzeige (buildWeekGrid/detectConflicts) liest daraus, also frisch ziehen.
      void queryClient.invalidateQueries({ queryKey: qk.athletePlanOffset(athleteId) });
      return { ok: true, moved };
    },
    [queryClient, userId, isSelf, storedOffset, snapshot, athleteId, mutation, updateOffset],
  );

  return { shift, isPending: mutation.isPending };
}

/** Pusht das Workout einer Karte zu intervals.icu (Etappe 6d). Holt die
 *  Karte aus dem bereits geladenen State (trägt das aufgelöste Datum
 *  inkl. Verschiebung), ruft api/intervals/push.ts und persistiert bei
 *  Erfolg `pushedExternalId`, damit ein erneuter Push (nach einem
 *  Verschieben) über external_id aktualisiert statt dupliziert. Kein
 *  useAuthUserId()-Gate — der Push braucht den intervals.icu-API-Key aus
 *  localStorage, keine Supabase-Session (PlanningPage blendet den Button
 *  ohnehin athletenscharf aus, s. `canPush`). */
export function usePushPlanCard(athleteId: string) {
  const mutation = usePatchCard(athleteId);
  const snapshot = useCardsSnapshot(athleteId);

  const push = useCallback(
    async (id: string, token: string, intervalsAthleteId: string): Promise<Result> => {
      const card = snapshot().find((c) => c.id === id);
      if (!card) return { ok: false, error: CARD_NOT_FOUND };

      const result = await pushCardWorkout(card, token, intervalsAthleteId);
      if (!result.ok) return result;

      try {
        await mutation.mutateAsync({ id, patch: { pushedExternalId: card.id } });
      } catch {
        // Push zu intervals.icu war erfolgreich, nur die pushed_external_id-
        // Rückschreibung schlug fehl — nächster Push bleibt möglich, die
        // "Gepusht!"-Rückmeldung unten bleibt davon unberührt (wie Vanilla).
      }
      return result;
    },
    [mutation, snapshot],
  );

  return { push, isPending: mutation.isPending };
}

/** Vollbearbeitung einer bestehenden Karte — anders als Move/Cancel, die
 *  einzelne Anpassungsfelder patchen, schreibt das Titel/Datum/Typ/TSS/km/
 *  Notiz/Workout in einem Zug. */
export function useUpdatePlanCard(athleteId: string) {
  const mutation = usePatchCard(athleteId);
  const userId = useAuthUserId();

  const update = useCallback(
    async (id: string, cardData: PlanCardInput): Promise<Result<{ card: PlanCard }>> => {
      if (!userId) return { ok: false, error: NOT_LOGGED_IN };
      return catchResult(() =>
        mutation.mutateAsync({
          id,
          patch: {
            plannedDate: cardData.date,
            title: cardData.name,
            typ: cardData.typ,
            tssPlanned: cardData.tssPlanned ?? null,
            km: cardData.km ?? null,
            details: cardData.details ?? null,
            workout: cardData.workout ?? null,
            workoutStructure: cardData.workoutStructure ?? null,
          },
        }),
      );
    },
    [mutation, userId],
  );

  return { update, isPending: mutation.isPending };
}

export function useCreatePlanCard(athleteId: string) {
  const queryClient = useQueryClient();
  const snapshot = useCardsSnapshot(athleteId);
  const userId = useAuthUserId();
  const key = qk.planCards(athleteId);

  const mutation = useMutation({
    mutationFn: async (cardData: PlanCardInput) => {
      const profileId = await fetchAthleteProfileId(queryClient, athleteId);
      if (!profileId) throw new ResultError_(NO_ACCOUNT);
      const sortOrder = nextSortOrder(snapshot(), cardData.date);
      return unwrap(await createPlanCardAdapter(profileId, { ...cardData, sortOrder }));
    },
    onSuccess: ({ card }) => {
      // Kein Athleten-Abgleich nötig: `key` gehört zu genau dem Athleten,
      // für den angelegt wurde. In der Vanilla-Version brauchte es hier
      // einen Vergleich mit loadedForAthleteId, weil ein Athletenwechsel
      // während des Inserts die Karte sonst in die falsche Liste hängte.
      queryClient.setQueryData<PlanCard[]>(key, (cards) => sortCards([...(cards ?? []), card]));
    },
  });

  const create = useCallback(
    async (cardData: PlanCardInput): Promise<Result<{ card: PlanCard }>> => {
      if (!userId) return { ok: false, error: NOT_LOGGED_IN };
      return catchResult(() => mutation.mutateAsync(cardData));
    },
    [mutation, userId],
  );

  return { create, isPending: mutation.isPending };
}

/** Löscht eine Karte unwiderruflich (eigener Fall neben "Ausgefallen").
 *  Entfernt sie erst aus dem Cache, nachdem der Server bestätigt hat — kein
 *  optimistisches Löschen, ein fälschlich verschwundener Plan wäre
 *  beunruhigender als eine kurze Verzögerung. */
export function useDeletePlanCard(athleteId: string) {
  const queryClient = useQueryClient();
  const userId = useAuthUserId();
  const key = qk.planCards(athleteId);

  const mutation = useMutation({
    mutationFn: async (id: string) => {
      unwrap(await removePlanCard(id));
      return { id };
    },
    onSuccess: ({ id }) => {
      queryClient.setQueryData<PlanCard[]>(key, (cards) =>
        (cards ?? []).filter((c) => c.id !== id),
      );
    },
  });

  const remove = useCallback(
    async (id: string): Promise<Result<{ id: string }>> => {
      if (!userId) return { ok: false, error: NOT_LOGGED_IN };
      return catchResult(() => mutation.mutateAsync(id));
    },
    [mutation, userId],
  );

  return { remove, isPending: mutation.isPending };
}
