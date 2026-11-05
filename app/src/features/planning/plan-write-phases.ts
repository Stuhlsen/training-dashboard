/* ============================================================
   FEATURES/PLANNING/PLAN-WRITE-PHASES.TS — die zwei Schreibphasen hinter
   „Neuer Plan" (Fahrplan 8 E6, erweitert in Fahrplan 44 E4).

   PHASE 1 · VORBEREITEN (`preparePlans`) — legt nur NEUES an:
     Alt-Plan je Sportart lesen → evtl. Event (einmal für alle) → neue
     Plan-Zeile (inaktiv) → Karten einfügen. Bestehendes bleibt unberührt.
     Scheitert etwas, nimmt `rollbackRun` alles aus diesem Lauf zurück;
     am Bestand hat sich nichts geändert.

   PHASE 2 · SCHARFSCHALTEN (`activatePlans`) — erst wenn ALLE vorbereitet
     sind: je Sportart Zukunfts-Karten des Alt-Plans + planlose Vorlagen-
     Karten löschen, Alt-Plan deaktivieren, neuen aktivieren. Hier werden
     Daten angefasst; gelöschte Karten sind nicht rückholbar (der Nutzer hat
     dem Ersetzen im Dialog zugestimmt). Der Rückbau ist Best-Effort.

   Eine Sportart durchläuft dieselben Bausteine in derselben Reihenfolge wie
   vor Fahrplan 44 (useCreateTrainingPlan.test.tsx hält das fest).

   „SPORTART HINZUFÜGEN" (Fahrplan 44 E5, useAddSportToPlan.ts) nutzt dieselben
   Phasen im Modus „nur Neues" (`newAddSportRun`): kein Alt-Plan der Sportart
   wird ersetzt, und zwischen Phase 1 und 2 setzt `attachPlanGroup` die Gruppe
   auf laufende Pläne ohne Gruppe — die einzige Änderung an ihnen. Der Rückbau
   setzt nur eine selbst gesetzte Gruppe wieder auf null.

   Kein React hier — der Hook (useCreateTrainingPlan.ts) hängt Cache-
   Invalidierung und Mutation daran.
   ============================================================ */

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
  setTrainingPlanGroup,
} from "../../api/supabase/training-plans";
import { ResultError_, unwrap } from "../../api/result";
import { flattenPlanCards, trainingPlanDraft } from "./plan-persist";
import type { GeneratedPlan, NewPlanFormState, PlanGeneratorInput } from "./new-plan-dialog-view-model";

type PlanSport = "ride" | "run" | "swim";

/** Eine Sportart des Laufs: die gezeigte Vorschau + der Input dazu. */
export interface PlanWriteItem {
  /** Ausgabe von `generatePlan()` (die gezeigte Vorschau). */
  generated: GeneratedPlan;
  /** Der an `generatePlan()` übergebene V2-Input (für `training_plans`). */
  input: PlanGeneratorInput;
  /** Roh-Formularzustand — für `params` und die Event-Anlage. */
  form: NewPlanFormState;
  /** Profil-UUID des eingeloggten Users (`created_by`). */
  createdBy: string;
}

/** Buchführung einer Sportart: was dieser Lauf angelegt/angefasst hat. */
export interface PreparedPlan {
  item: PlanWriteItem;
  sport: PlanSport;
  /** Aktiver Alt-Plan derselben Sportart (aus der DB), sonst null. */
  replacePlanId: string | null;
  newPlanId: string | null;
  deactivatedOld: boolean;
  /** Der neue Plan ist schon scharf — beim Rückbau zuerst ausschalten, sonst
   *  lehnt der Unique-Index „ein aktiver Plan je Athlet+Sportart" den Alt-Plan ab. */
  activatedNew: boolean;
}

/** Buchführung des ganzen Laufs — wird VOR dem ersten Schreiben angelegt, damit
 *  der Rückbau auch nach einem Wurf mitten in einer Phase weiß, was zu tun ist. */
export interface WriteRun {
  profileId: string;
  today: string;
  planGroupId: string | null;
  plans: PreparedPlan[];
  createdEventId: string | null;
  /** true, sobald Phase 2 begonnen hat (Bestehendes wurde angefasst). */
  touchedExisting: boolean;
  /** Fahrplan 44 E5 („Sportart hinzufügen"): es wird nur NEUES angelegt. Läuft für
   *  eine Sportart schon ein aktiver Plan, bricht Phase 1 ab, statt ihn zu ersetzen. */
  addOnly?: boolean;
  /** Fahrplan 44 E5: laufende Pläne ohne Gruppe, die die Gruppe des neuen Plans
   *  bekommen. `attached` = gesetzt, beim Rückbau wieder auf null. Die Gruppe ist
   *  die einzige Änderung an einem laufenden Plan. */
  groupAttach?: Array<{ planId: string; attached: boolean }>;
}

/** Lauf für „Sportart hinzufügen" (Fahrplan 44 E5): ein neuer Plan neben den
 *  laufenden. Hat ein laufender Plan schon eine Gruppe, nimmt der neue sie;
 *  sonst entsteht eine, und die laufenden Pläne ohne Gruppe bekommen sie
 *  (`attachPlanGroup`). */
export function newAddSportRun(
  profileId: string,
  today: string,
  item: PlanWriteItem,
  runningPlans: ReadonlyArray<{ id: string; planGroupId: string | null }>,
): WriteRun {
  const existing = runningPlans.find((p) => p.planGroupId)?.planGroupId ?? null;
  const planGroupId = existing ?? crypto.randomUUID();
  return {
    ...newWriteRun(profileId, today, planGroupId, [item]),
    addOnly: true,
    groupAttach: runningPlans.filter((p) => !p.planGroupId).map((p) => ({ planId: p.id, attached: false })),
  };
}

/** Setzt die Gruppe auf die laufenden Pläne ohne Gruppe. Erst NACH Phase 1
 *  aufrufen (alles Neue steht), vor Phase 2. Wirft bei Fehler; `rollbackRun`
 *  löst bis dahin Gesetztes wieder. */
export async function attachPlanGroup(run: WriteRun): Promise<void> {
  for (const g of run.groupAttach ?? []) {
    unwrap(await setTrainingPlanGroup(g.planId, run.planGroupId));
    g.attached = true;
  }
}

export function newWriteRun(
  profileId: string,
  today: string,
  planGroupId: string | null,
  items: PlanWriteItem[],
): WriteRun {
  return {
    profileId,
    today,
    planGroupId,
    plans: items.map((item) => ({
      item,
      sport: item.input.sport ?? "ride",
      replacePlanId: null,
      newPlanId: null,
      deactivatedOld: false,
      activatedNew: false,
    })),
    createdEventId: null,
    touchedExisting: false,
  };
}

/** Phase 1. Gibt die IDs der neuen Pläne zurück (Reihenfolge wie `run.plans`). */
export async function preparePlans(run: WriteRun): Promise<string[]> {
  // (1) Maßgebliche Alt-Pläne direkt aus der DB. Scheitert ein Read, ist noch
  //     nichts geschrieben.
  for (const p of run.plans) {
    const { plan } = unwrap(await listActiveTrainingPlan(run.profileId, p.sport));
    p.replacePlanId = plan?.id ?? null;
  }
  // „Sportart hinzufügen": ein laufender Plan wird nie ersetzt. Abbruch, bevor
  // irgendetwas geschrieben ist.
  if (run.addOnly && run.plans.some((p) => p.replacePlanId)) {
    throw new ResultError_({
      code: "VALIDATION",
      message: "Für diese Sportart läuft schon ein Plan. Dazunehmen ersetzt keinen laufenden Plan.",
    });
  }

  // (2) Event höchstens einmal anlegen und unter den Plänen teilen.
  const first = run.plans[0].item;
  const needsNewEvent = first.form.mode === "event" && !first.form.eventId;
  let goalEventId: string | null = first.form.mode === "event" ? first.form.eventId || null : null;
  if (needsNewEvent) {
    // Ziel-FTP = der vom Generator übernommene/abgeleitete Wert des Radplans,
    // damit Event und Plan-Zeile dieselbe Zahl tragen.
    const ride = run.plans.find((p) => p.sport === "ride") ?? run.plans[0];
    const { event } = unwrap(
      await createEvent(run.profileId, {
        title: first.form.newEventName.trim(),
        eventDate: first.form.newEventDate,
        type: "race",
        priority: "main",
        ftpGoal: ride.item.generated.ftpTarget ?? null,
      }),
    );
    goalEventId = event.id;
    run.createdEventId = event.id;
  }

  // (3) + (4) je Sportart: neue Zeile (inaktiv), dann die Karten.
  const ids: string[] = [];
  for (const p of run.plans) {
    const { item } = p;
    const draft = {
      ...trainingPlanDraft(item.input, item.form, item.generated, goalEventId, p.sport),
      ...(run.planGroupId ? { planGroupId: run.planGroupId } : {}),
    };
    const { plan } = unwrap(await createTrainingPlan(run.profileId, item.createdBy, draft));
    p.newPlanId = plan.id;
    unwrap(await createPlanCards(run.profileId, plan.id, flattenPlanCards(item.generated, p.sport)));
    ids.push(plan.id);
  }
  return ids;
}

/** Phase 2. Nur aufrufen, wenn `preparePlans` ohne Fehler durch ist. */
export async function activatePlans(run: WriteRun): Promise<void> {
  for (const p of run.plans) {
    if (!p.newPlanId) continue; // nur zur Typsicherheit — nach Phase 1 immer gesetzt
    run.touchedExisting = true;
    if (p.replacePlanId) {
      unwrap(await deleteFuturePlanCardsForPlan(p.replacePlanId, run.today));
    }
    // Übergangs-Aufräumer: eingefrorene Code-Vorlagen-Karten ohne plan_id,
    // damit der erste eigene Plan nicht doppelt im Raster steht. Sport-
    // gefiltert, sonst würde eine Lauf-Neuanlage plan-lose Rad-Karten wegräumen.
    unwrap(await deleteFuturePlanlessPlanCards(run.profileId, run.today, p.sport));

    if (p.replacePlanId) {
      unwrap(await setTrainingPlanActive(p.replacePlanId, false));
      p.deactivatedOld = true;
    }
    unwrap(await setTrainingPlanActive(p.newPlanId, true));
    p.activatedNew = true;
  }
}

/** Best-Effort-Rückbau aller neuen Artefakte dieses Laufs (beide Phasen).
 *  Wirft nie; Einzelfehler werden verschluckt, weil nichts Besseres bleibt. */
export async function rollbackRun(run: WriteRun): Promise<void> {
  for (const p of [...run.plans].reverse()) {
    if (p.activatedNew && p.newPlanId) {
      await setTrainingPlanActive(p.newPlanId, false).catch(() => {});
    }
    if (p.deactivatedOld && p.replacePlanId) {
      await setTrainingPlanActive(p.replacePlanId, true).catch(() => {});
    }
    if (p.newPlanId) {
      await deletePlanCardsForPlan(p.newPlanId).catch(() => {});
      await deleteTrainingPlan(p.newPlanId).catch(() => {});
    }
  }
  // Gruppe nur dort lösen, wo DIESER Lauf sie gesetzt hat — eine vorher
  // bestehende Gruppe bleibt immer stehen.
  for (const g of run.groupAttach ?? []) {
    if (g.attached) await setTrainingPlanGroup(g.planId, null).catch(() => {});
  }
  if (run.createdEventId) {
    await removeEvent(run.createdEventId).catch(() => {});
  }
}
