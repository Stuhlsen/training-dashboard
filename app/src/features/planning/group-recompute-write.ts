/* ============================================================
   FEATURES/PLANNING/GROUP-RECOMPUTE-WRITE.TS — Schreibweg für „Plan anpassen"
   bei verknüpften Plänen (Fahrplan 44 E6)

   Der Einzelplan-Weg (useRecomputeRemainingPlan) löscht künftige Karten ohne
   Rückweg. Bei zwei Plänen darf nie einer neu und einer halb sein. Darum:

     a) Alle Pläne sind VOR dem Aufruf mit generatePlan() gerechnet
        (group-recompute-view-model.ts). Scheitert das, kommt es nie hierher.
     b) Je betroffenem Plan die künftigen, ersetzbaren Karten ab `replaceFrom`
        und die Zeilenwerte als Sicherung lesen. Danach — und erst danach —
        schreiben. Pläne, deren Karten und Zeilenwerte sich nicht ändern, werden
        übersprungen.
     c) Je Plan: löschen → neu einfügen → Plan-Zeile aktualisieren.
     d) Scheitert ein Schritt: ALLE bereits angefassten Pläne (auch der gerade
        betroffene) aus der Sicherung wiederherstellen — Karten und Zeilenwerte.
     e) Scheitert auch das, nennt die Meldung je Sportart den Stand und wie ein
        neuer Versuch ihn behebt.

   Keine Postgres-RPC, keine Transaktion: Das ist ein bewusst ehrliches
   Best-Effort mit Sicherung. Karten vor `replaceFrom` werden nie gelesen,
   gelöscht oder geschrieben.
   ============================================================ */

import {
  createPlanCards,
  deleteFuturePlanCardsForPlan,
  listReplaceablePlanCardsForPlan,
  type PlanCardBulkDraft,
} from "../../api/supabase/plan-cards";
import {
  restoreTrainingPlanValues,
  updateTrainingPlan,
  type TrainingPlanValues,
} from "../../api/supabase/training-plans";
import type { ActiveSport } from "../../api/hooks/useActiveSport";
import { ResultError_, toResultError, unwrap } from "../../api/result";
import type { TrainingPlan } from "../../api/types";
import { fmtDate } from "../../core/format.js";
import { stableJson } from "./group-recompute-view-model";
import { MULTI_SPORT_LABEL } from "./multi-sport-plan-view-model";
import type { GeneratedPlan } from "./new-plan-dialog-view-model";
import { flattenPlanCards } from "./plan-persist";
import type { RecomputePatch } from "./recompute-plan-view-model";

/** Ein betroffener Plan: das gerechnete Ergebnis und die Zeilenwerte dazu. */
export interface GroupWriteJob {
  sport: ActiveSport;
  /** Die Plan-Zeile, wie sie vor dem Schreiben ist (Quelle der Zeilen-Sicherung). */
  plan: TrainingPlan;
  generated: GeneratedPlan;
  patch: RecomputePatch;
  /** Ab hier werden Karten ersetzt; davor wird nichts angefasst. */
  replaceFrom: string;
}

export interface GroupWriteResult {
  written: ActiveSport[];
  skipped: ActiveSport[];
}

/** Wie weit ein Plan im Schreiben gekommen ist — bestimmt, was wiederherzustellen
 *  ist und was die Meldung sagt. */
type Stage = "none" | "deleting" | "inserting" | "updating" | "done";

interface Tracked {
  job: GroupWriteJob;
  newCards: PlanCardBulkDraft[];
  backup: PlanCardBulkDraft[];
  snapshot: TrainingPlanValues;
  skip: boolean;
  stage: Stage;
  /** `undefined` = noch nicht versucht, sonst Ergebnis der Wiederherstellung. */
  restored?: boolean;
}

const cardSignature = (c: PlanCardBulkDraft) => ({
  date: c.date,
  name: c.name,
  typ: c.typ,
  phase: c.phase ?? null,
  week: c.week ?? null,
  tssPlanned: c.tssPlanned ?? null,
  durationMin: c.durationMin ?? null,
  km: c.km ?? null,
  workout: c.workout ?? null,
  workoutStructure: c.workoutStructure ?? null,
  sortOrder: c.sortOrder,
});

function sameCards(a: PlanCardBulkDraft[], b: PlanCardBulkDraft[]): boolean {
  const key = (c: PlanCardBulkDraft) => `${c.date}|${String(c.sortOrder).padStart(4, "0")}`;
  const norm = (xs: PlanCardBulkDraft[]) =>
    xs
      .map((c) => ({ k: key(c), s: cardSignature(c) }))
      .sort((x, y) => x.k.localeCompare(y.k))
      .map((x) => x.s);
  return stableJson(norm(a)) === stableJson(norm(b));
}

/** Ändert der Patch an der Zeile etwas Wesentliches? (`params` bleibt außen vor —
 *  Historie und Zeitstempel ändern sich bei jeder Berechnung.) */
function sameRow(plan: TrainingPlan, patch: RecomputePatch): boolean {
  if (stableJson(patch.weekModel) !== stableJson(plan.weekModel ?? [])) return false;
  if (patch.trainingWeekdays && stableJson(patch.trainingWeekdays) !== stableJson(plan.trainingWeekdays ?? [])) {
    return false;
  }
  if (patch.ftpTarget != null && patch.ftpTarget !== plan.ftpTarget) return false;
  if (patch.weeklyHours != null && patch.weeklyHours !== plan.weeklyHours) return false;
  return true;
}

const snapshotOf = (plan: TrainingPlan): TrainingPlanValues => ({
  weekModel: [...(plan.weekModel ?? [])],
  params: { ...(plan.params ?? {}) },
  trainingWeekdays: [...(plan.trainingWeekdays ?? [])],
  ftpTarget: plan.ftpTarget ?? null,
  weeklyHours: plan.weeklyHours ?? null,
});

/** Stellt einen angefassten Plan aus der Sicherung wieder her: ab `replaceFrom`
 *  alles Ersetzbare löschen (alt, neu oder halb), die gesicherten Karten wieder
 *  einfügen, die Zeilenwerte zurückschreiben. */
async function restore(profileId: string, t: Tracked): Promise<boolean> {
  try {
    unwrap(await deleteFuturePlanCardsForPlan(t.job.plan.id, t.job.replaceFrom));
    unwrap(await createPlanCards(profileId, t.job.plan.id, t.backup));
    unwrap(await restoreTrainingPlanValues(t.job.plan.id, t.snapshot));
    return true;
  } catch {
    return false;
  }
}

const STAGE_TEXT: Record<Exclude<Stage, "none">, (from: string) => string> = {
  deleting: (from) => `künftige Karten ab ${fmtDate(from)} sind evtl. teilweise oder ganz gelöscht`,
  inserting: (from) => `alte Karten ab ${fmtDate(from)} sind gelöscht, die neuen evtl. nur teilweise geschrieben`,
  updating: () => "neue Karten sind geschrieben, die Plan-Zeile ist evtl. noch alt",
  done: () => "neue Karten und Plan-Zeile sind geschrieben, aber nicht zurückgesetzt",
};

function failureMessage(cause: string, failedSport: ActiveSport, touched: Tracked[], from: string): string {
  const label = (t: Tracked) => MULTI_SPORT_LABEL[t.job.sport];
  const stuck = touched.filter((t) => !t.restored);
  const head = `${MULTI_SPORT_LABEL[failedSport]}: ${cause}`;
  if (stuck.length === 0) {
    return `${head} — Alles wurde auf den Stand vor dem Versuch zurückgesetzt, es hat sich nichts geändert.`;
  }
  const lines = touched.map((t) =>
    t.restored
      ? `${label(t)}: zurückgesetzt`
      : `${label(t)}: nicht zurückgesetzt (${STAGE_TEXT[t.stage as Exclude<Stage, "none">](from)})`,
  );
  return (
    `${head} — Das Zurücksetzen ist nicht überall gelungen. ${lines.join("; ")}. ` +
    `Öffne „Plan anpassen“ und übernimm erneut: Das schreibt die künftigen Karten ab ${fmtDate(from)} ` +
    `für die gewählten Sportarten neu und behebt den Stand.`
  );
}

/**
 * Schreibt die betroffenen Pläne einer Gruppe — alle oder (bei einem Fehler) keinen
 * halben. Wirft einen `ResultError_` mit ehrlicher Meldung.
 */
export async function writeGroupRecompute(profileId: string, jobs: GroupWriteJob[]): Promise<GroupWriteResult> {
  if (jobs.length === 0) return { written: [], skipped: [] };

  // (b) Sicherung aller Pläne, bevor irgendetwas schreibt.
  const tracked: Tracked[] = [];
  for (const job of jobs) {
    const sport = MULTI_SPORT_LABEL[job.sport];
    let backup: PlanCardBulkDraft[];
    try {
      backup = unwrap(await listReplaceablePlanCardsForPlan(job.plan.id, job.replaceFrom)).cards;
    } catch (err) {
      throw new ResultError_({
        code: "UNKNOWN",
        message: `${sport}: ${toResultError(err).message} — Es wurde nichts geändert.`,
      });
    }
    const newCards = flattenPlanCards(job.generated, job.sport).filter((c) => c.date >= job.replaceFrom);
    tracked.push({
      job,
      newCards,
      backup,
      snapshot: snapshotOf(job.plan),
      skip: sameCards(backup, newCards) && sameRow(job.plan, job.patch),
      stage: "none",
    });
  }

  // (c) Je Plan löschen → einfügen → Zeile.
  for (const t of tracked.filter((x) => !x.skip)) {
    const { plan, patch, replaceFrom } = t.job;
    try {
      t.stage = "deleting";
      unwrap(await deleteFuturePlanCardsForPlan(plan.id, replaceFrom));
      t.stage = "inserting";
      unwrap(await createPlanCards(profileId, plan.id, t.newCards));
      t.stage = "updating";
      unwrap(await updateTrainingPlan(plan.id, patch));
      t.stage = "done";
    } catch (err) {
      // (d) Alle angefassten Pläne zurück — der gerade betroffene zuerst, dann rückwärts.
      const touched = tracked.filter((x) => x.stage !== "none");
      for (const x of [...touched].reverse()) x.restored = await restore(profileId, x);
      // (e) Ehrliche Meldung.
      throw new ResultError_({
        code: "UNKNOWN",
        message: failureMessage(toResultError(err).message, t.job.sport, touched, replaceFrom),
      });
    }
  }

  return {
    written: tracked.filter((t) => !t.skip).map((t) => t.job.sport),
    skipped: tracked.filter((t) => t.skip).map((t) => t.job.sport),
  };
}
