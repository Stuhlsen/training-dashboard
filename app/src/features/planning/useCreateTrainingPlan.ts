/* ============================================================
   FEATURES/PLANNING/USECREATETRAININGPLAN.TS — Schreibpfad des „Neuer
   Plan"-Dialogs (Fahrplan 8 E6, Entscheidungen 15/16).

   „Übernehmen" schreibt eine `training_plans`-Zeile + die Tageskarten in
   `plan_cards`. Ein bestehender aktiver Plan wird dabei ersetzt: seine
   zukünftigen, noch geplanten Karten werden gelöscht, er selbst auf
   `is_active = false` gesetzt; Vergangenes / Ausgefallenes bleibt.

   Der Hook lebt beim Feature (nicht in api/hooks/), weil er an die
   Formular-/Vorschau-Shape des Dialogs gebunden ist — die generische
   api/-Schicht bleibt frei von features/-Importen.

   REIHENFOLGE (partieller Unique-Index „ein aktiver Plan je Athlet"):
     1. aktiven Alt-Plan AUS DER DB lesen (nicht aus dem Dialog-Hook — der
        kann beim Klick noch laden), dieser ist maßgeblich für „ersetzen".
     2. evtl. neues Ziel-Event anlegen
     3. neue Plan-Zeile — `is_active = false` (Adapter erzwingt das)
     4. Karten-Bulk-Insert mit `plan_id` der neuen Zeile
     — ab hier werden bestehende Daten angefasst —
     5. Zukunfts-Karten des Alt-Plans + plan-lose Vorlagen-Karten löschen
     6. Alt-Plan deaktivieren
     7. neue Zeile scharf schalten
     8. Caches invalidieren

   FEHLERBEHANDLUNG: `try/catch` mit Best-Effort-Rückbau der in DIESEM Lauf
   angelegten neuen Artefakte (neue Karten, neue Plan-Zeile, frisch
   angelegtes Event; Alt-Plan wieder aktiv, falls schon deaktiviert). NICHT
   rückholbar sind bereits gelöschte Zukunfts-/Vorlagen-Karten (Schritt 5) —
   der Nutzer hat dem Ersetzen künftiger Karten im Dialog zugestimmt, ein
   erneuter Anlauf baut sie neu. Eine echte Transaktion bräuchte eine
   Postgres-RPC (bewusst außerhalb E6).
   ============================================================ */

import { useCallback } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createEvent, removeEvent } from "../../api/supabase/events";
import {
  createPlanCards,
  deleteFuturePlanCardsForPlan,
  deleteFuturePlanlessPlanCards,
  deletePlanCardsForPlan,
} from "../../api/supabase/plan-cards";
import {
  createTrainingPlan,
  deleteTrainingPlan,
  listActiveTrainingPlan,
  setTrainingPlanActive,
} from "../../api/supabase/training-plans";
import { fetchAthleteProfileId } from "../../api/hooks/useAthleteProfileId";
import { useAuthUserId } from "../../api/hooks/useSession";
import { qk } from "../../api/keys";
import { catchResult, ResultError_, toResultError, unwrap } from "../../api/result";
import { localISODate } from "../../core/format.js";
import { flattenPlanCards, trainingPlanDraft } from "./plan-persist";
import type {
  GeneratedPlan,
  NewPlanFormState,
  PlanGeneratorInput,
} from "./new-plan-dialog-view-model";
import type { Result } from "../../api/types";

const NOT_LOGGED_IN = { code: "UNKNOWN" as const, message: "Nicht eingeloggt" };
const NO_ACCOUNT = {
  code: "NO_DATA" as const,
  message: "Athlet hat (noch) keinen Supabase-Account",
};

export interface CreateTrainingPlanArgs {
  /** Ausgabe von `generatePlan()` (die gezeigte Vorschau). */
  generated: GeneratedPlan;
  /** Der an `generatePlan()` übergebene V2-Input (für `training_plans`). */
  input: PlanGeneratorInput;
  /** Roh-Formularzustand — für `params` und die Event-Anlage. */
  form: NewPlanFormState;
  /** Profil-UUID des eingeloggten Users (`created_by`). */
  createdBy: string;
}

export function useCreateTrainingPlan(athleteId: string) {
  const queryClient = useQueryClient();
  const userId = useAuthUserId();

  const mutation = useMutation({
    mutationFn: async (args: CreateTrainingPlanArgs): Promise<{ planId: string }> => {
      const profileId = await fetchAthleteProfileId(queryClient, athleteId);
      if (!profileId) throw new ResultError_(NO_ACCOUNT);
      const today = localISODate();

      // (1) Maßgeblicher Alt-Plan direkt aus der DB. Schlägt der Read fehl,
      //     brechen wir ab, BEVOR irgendetwas geschrieben ist.
      const { plan: activePlan } = unwrap(await listActiveTrainingPlan(profileId));
      const replacePlanId = activePlan?.id ?? null;

      const needsNewEvent = args.form.mode === "event" && !args.form.eventId;
      let goalEventId: string | null =
        args.form.mode === "event" ? args.form.eventId || null : null;

      // Rollback-Buchhaltung
      let createdEventId: string | null = null;
      let newPlanId: string | null = null;
      let deactivatedOld = false;
      let touchedExistingCards = false;

      try {
        if (needsNewEvent) {
          const { event } = unwrap(
            await createEvent(profileId, {
              title: args.form.newEventName.trim(),
              eventDate: args.form.newEventDate,
              type: "race",
              priority: "main",
              // Ziel-FTP = der vom Generator übernommene/abgeleitete Wert,
              // damit Event und Plan-Zeile dieselbe Zahl tragen (nicht das
              // oft leere Rohformular-Feld).
              ftpGoal: args.generated.ftpTarget ?? null,
            }),
          );
          goalEventId = event.id;
          createdEventId = event.id;
        }

        const draft = trainingPlanDraft(args.input, args.form, args.generated, goalEventId);
        const { plan } = unwrap(await createTrainingPlan(profileId, args.createdBy, draft));
        newPlanId = plan.id;

        unwrap(await createPlanCards(profileId, plan.id, flattenPlanCards(args.generated)));

        // --- ab hier werden bestehende Daten angefasst ---
        touchedExistingCards = true;
        if (replacePlanId) {
          unwrap(await deleteFuturePlanCardsForPlan(replacePlanId, today));
        }
        // Übergangs-Aufräumer bis E8: eingefrorene Code-Vorlagen-Karten ohne
        // plan_id, damit der erste eigene Plan nicht doppelt im Raster steht.
        unwrap(await deleteFuturePlanlessPlanCards(profileId, today));

        if (replacePlanId) {
          unwrap(await setTrainingPlanActive(replacePlanId, false));
          deactivatedOld = true;
        }
        unwrap(await setTrainingPlanActive(plan.id, true));

        await Promise.all([
          queryClient.invalidateQueries({ queryKey: qk.planCards(athleteId) }),
          queryClient.invalidateQueries({ queryKey: qk.activeTrainingPlan(athleteId) }),
          needsNewEvent
            ? queryClient.invalidateQueries({ queryKey: qk.events(athleteId) })
            : Promise.resolve(),
        ]);

        return { planId: plan.id };
      } catch (err) {
        // Best-Effort-Rückbau der neuen Artefakte dieses Laufs.
        if (deactivatedOld && replacePlanId) {
          await setTrainingPlanActive(replacePlanId, true).catch(() => {});
        }
        if (newPlanId) {
          await deletePlanCardsForPlan(newPlanId).catch(() => {});
          await deleteTrainingPlan(newPlanId).catch(() => {});
        }
        if (createdEventId) {
          await removeEvent(createdEventId).catch(() => {});
        }
        await queryClient
          .invalidateQueries({ queryKey: qk.planCards(athleteId) })
          .catch(() => {});

        if (touchedExistingCards) {
          throw new ResultError_({
            code: "UNKNOWN",
            message: `${toResultError(err).message} — der neue Plan wurde zurückgenommen, aber einige künftige Karten sind evtl. schon entfernt. Bitte den Plan prüfen und ggf. neu erzeugen.`,
          });
        }
        throw err;
      }
    },
  });

  const createPlan = useCallback(
    async (args: CreateTrainingPlanArgs): Promise<Result<{ planId: string }>> => {
      if (!userId) return { ok: false, error: NOT_LOGGED_IN };
      return catchResult(() => mutation.mutateAsync(args));
    },
    [mutation, userId],
  );

  return { createPlan, isPending: mutation.isPending };
}
