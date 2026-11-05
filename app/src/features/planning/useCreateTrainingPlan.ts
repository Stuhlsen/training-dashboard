/* ============================================================
   FEATURES/PLANNING/USECREATETRAININGPLAN.TS — Schreibpfad des „Neuer
   Plan"-Dialogs (Fahrplan 8 E6, Entscheidungen 15/16; Fahrplan 44 E4).

   „Übernehmen" schreibt je Sportart eine `training_plans`-Zeile + die
   Tageskarten in `plan_cards`. Ein bestehender aktiver Plan DERSELBEN
   Sportart wird dabei ersetzt: seine zukünftigen, noch geplanten Karten
   werden gelöscht, er selbst auf `is_active = false` gesetzt; Vergangenes /
   Ausgefallenes bleibt.

   Der Hook lebt beim Feature (nicht in api/hooks/), weil er an die
   Formular-/Vorschau-Shape des Dialogs gebunden ist — die generische
   api/-Schicht bleibt frei von features/-Importen.

   ABLAUF (Details + Reihenfolge: plan-write-phases.ts):
     Phase 1 „Vorbereiten" — nur NEUES anlegen (Event, inaktive Plan-Zeilen,
       Karten). Scheitert hier etwas, wird alles aus dem Lauf zurückgenommen;
       am Bestand hat sich nichts geändert.
     Phase 2 „Scharfschalten" — erst wenn ALLE Sportarten vorbereitet sind:
       Zukunfts-Karten löschen, Alt-Pläne aus, neue an.
     danach Caches invalidieren.
   Mehrere Sportarten teilen sich eine `plan_group_id` (im Hook erzeugt) und
   ein Event; eine Sportart läuft unverändert ohne Gruppe.

   FEHLERBEHANDLUNG: Best-Effort-Rückbau der in DIESEM Lauf angelegten
   Artefakte (neue Karten, neue Plan-Zeilen, frisch angelegtes Event;
   Alt-Pläne wieder aktiv, falls schon deaktiviert). NICHT rückholbar sind
   bereits gelöschte Zukunfts-/Vorlagen-Karten (Phase 2) — der Nutzer hat dem
   Ersetzen künftiger Karten im Dialog zugestimmt, ein erneuter Anlauf baut
   sie neu. Eine echte Transaktion bräuchte eine Postgres-RPC (bewusst
   außerhalb von E6/E4).
   ============================================================ */

import { useCallback } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchAthleteProfileId } from "../../api/hooks/useAthleteProfileId";
import { useAuthUserId } from "../../api/hooks/useSession";
import { qk } from "../../api/keys";
import { catchResult, ResultError_, toResultError } from "../../api/result";
import { localISODate } from "../../core/format.js";
import {
  activatePlans,
  newWriteRun,
  preparePlans,
  rollbackRun,
  type PlanWriteItem,
} from "./plan-write-phases";
import type { Result } from "../../api/types";

const NOT_LOGGED_IN = { code: "UNKNOWN" as const, message: "Nicht eingeloggt" };
const NO_ACCOUNT = {
  code: "NO_DATA" as const,
  message: "Athlet hat (noch) keinen Supabase-Account",
};

/** Eine Sportart des Laufs (Vorschau + Input + Formular + `created_by`). */
export type CreateTrainingPlanArgs = PlanWriteItem;

export function useCreateTrainingPlan(athleteId: string) {
  const queryClient = useQueryClient();
  const userId = useAuthUserId();

  const mutation = useMutation({
    mutationFn: async (items: CreateTrainingPlanArgs[]): Promise<{ planIds: string[] }> => {
      if (items.length === 0) {
        throw new ResultError_({ code: "VALIDATION", message: "Keine Sportart zum Speichern." });
      }
      const sports = items.map((i) => i.input.sport ?? "ride");
      if (new Set(sports).size !== sports.length) {
        throw new ResultError_({
          code: "VALIDATION",
          message: "Jede Sportart darf nur einmal vorkommen.",
        });
      }
      const profileId = await fetchAthleteProfileId(queryClient, athleteId);
      if (!profileId) throw new ResultError_(NO_ACCOUNT);

      // Eine Gruppe gibt es nur bei mehreren Plänen; eine Sportart bleibt wie bisher ohne.
      const planGroupId = items.length > 1 ? crypto.randomUUID() : null;
      const run = newWriteRun(profileId, localISODate(), planGroupId, items);

      const invalidate = () =>
        Promise.all([
          queryClient.invalidateQueries({ queryKey: qk.planCards(athleteId) }),
          ...run.plans.map((p) =>
            queryClient.invalidateQueries({ queryKey: qk.activeTrainingPlan(athleteId, p.sport) }),
          ),
          run.createdEventId
            ? queryClient.invalidateQueries({ queryKey: qk.events(athleteId) })
            : Promise.resolve(),
        ]);

      try {
        const planIds = await preparePlans(run);
        await activatePlans(run);
        await invalidate();
        return { planIds };
      } catch (err) {
        await rollbackRun(run);
        await queryClient.invalidateQueries({ queryKey: qk.planCards(athleteId) }).catch(() => {});

        if (run.touchedExisting) {
          const what = items.length > 1 ? "Die neuen Pläne wurden" : "Der neue Plan wurde";
          throw new ResultError_({
            code: "UNKNOWN",
            message: `${toResultError(err).message} — ${what} zurückgenommen, aber einige künftige Karten sind evtl. schon entfernt. Bitte den Plan prüfen und ggf. neu erzeugen.`,
          });
        }
        throw err;
      }
    },
  });

  /** Mehrere Sportarten in einem Lauf (Fahrplan 44 E4). */
  const createPlans = useCallback(
    async (items: CreateTrainingPlanArgs[]): Promise<Result<{ planIds: string[] }>> => {
      if (!userId) return { ok: false, error: NOT_LOGGED_IN };
      return catchResult(() => mutation.mutateAsync(items));
    },
    [mutation, userId],
  );

  /** Eine Sportart — der bisherige Weg, ohne `plan_group_id`. */
  const createPlan = useCallback(
    async (args: CreateTrainingPlanArgs): Promise<Result<{ planId: string }>> => {
      const res = await createPlans([args]);
      return res.ok ? { ok: true, planId: res.planIds[0] } : res;
    },
    [createPlans],
  );

  return { createPlan, createPlans, isPending: mutation.isPending };
}
