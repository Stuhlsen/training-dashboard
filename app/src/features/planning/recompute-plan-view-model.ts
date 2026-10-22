/* ============================================================
   FEATURES/PLANNING/RECOMPUTE-PLAN-VIEW-MODEL.TS — reine Eingabe-Logik für
   „Rest neu berechnen" (Fahrplan 8 E13).

   Kein React, kein Fetch: aus der aktiven `training_plans`-Zeile + einem
   frischen Historie-Aggregat (V3) + heute einen `PlanGeneratorInput` (V2)
   bauen, der `regenerateFrom` (= Montag der laufenden KW) und `baseWeekModel`
   (= die eingefrorene Blockstruktur des Ur-Plans) trägt. `generatePlan()`
   rechnet damit nur die Wochen ab `regenerateFrom` neu, die Vergangenheit +
   Blockfolge bleiben unangetastet.

   Die Rahmenbedingungen kommen aus den `training_plans`-Spalten (bei der
   Erstellung validiert); nur die aktuelle FTP / das Messdatum reicht der
   Aufrufer frisch aus `config.ts` durch (die Spalte `ftp_at_creation` ist der
   Stand von damals).
   ============================================================ */

import {
  FIXED_DAY_TYPES,
  FIXED_INTERVAL_TYP,
  isValidFixedDuration,
  mondayOf,
} from "./new-plan-dialog-view-model";
import type { PlanGeneratorInput, AthleteDefaults, FixedDay } from "./new-plan-dialog-view-model";
import type { TrainingPlan, WeekModelEntry } from "../../api/types";

/** Gespeichertes Roh-Formular des Plans (`params.form`, s. plan-persist.ts).
 *  Nur die Felder, die der Recompute braucht — alles optional, ältere Pläne
 *  kennen sie nicht. */
interface SavedForm {
  fixedDays?: unknown;
  keepAllTrainingDays?: unknown;
  startWithFtpTest?: unknown;
}

function savedForm(plan: TrainingPlan): SavedForm {
  const form = (plan.params as { form?: unknown } | null | undefined)?.form;
  return form && typeof form === "object" ? (form as SavedForm) : {};
}

/** Feste Tage aus `params.form` — nur wohlgeformte Einträge (Wochentag 1..7,
 *  bekannter Typ). Kaputte/fremde Einträge werden still verworfen statt den
 *  Recompute zu blockieren. */
function savedFixedDays(plan: TrainingPlan): FixedDay[] {
  const raw = savedForm(plan).fixedDays;
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (d): d is FixedDay =>
        !!d &&
        typeof d === "object" &&
        Number.isInteger((d as FixedDay).weekday) &&
        (d as FixedDay).weekday >= 1 &&
        (d as FixedDay).weekday <= 7 &&
        FIXED_DAY_TYPES.includes((d as FixedDay).typ)
    )
    .map((d) => ({
      weekday: d.weekday,
      typ: d.typ,
      keepInRecoveryWeek: d.keepInRecoveryWeek === true,
      ...(d.typ !== FIXED_INTERVAL_TYP && isValidFixedDuration(d.durationMin)
        ? { durationMin: d.durationMin }
        : {}),
    }));
}

/** Die Trainingstage, die der Plan ab der Restberechnung heute nutzt
 *  (Vorbelegung der Tage-Auswahl im Dialog). */
export function currentTailWeekdays(plan: TrainingPlan, todayISO: string): number[] {
  const base = (plan.weekModel ?? []) as WeekModelEntry[];
  const cut = base.findIndex((w) => w.start >= mondayOf(todayISO));
  const fromModel = cut >= 0 ? base[cut]?.trainingWeekdays : undefined;
  return fromModel?.length ? [...fromModel] : [...(plan.trainingWeekdays ?? [])];
}

export interface RecomputeArgs {
  plan: TrainingPlan;
  /** Frisches V3-Aggregat aus `usePlanHistoryAggregate` (durchgereicht). */
  history?: unknown;
  /** Heute (lokal, ISO). */
  todayISO: string;
  /** Aktuelle FTP / Messdatum aus `athleteConfig()` — nicht der Erstell-Stand.
   *  Nur für `plan.sport === "ride"` relevant. */
  athleteDefaults: AthleteDefaults | null;
  /** Aktuelle Schwellenpace (km/h) aus `usePlanHistoryAggregate(athleteId, sport)
   *  .aggregate.currentThresholdSpeed` — das Äquivalent zu `athleteDefaults.
   *  ftpMeasured` für `plan.sport !== "ride"`. `config.ts` hat dafür (anders als
   *  bei FTP) keinen statischen Startwert, deshalb ein eigenes Argument statt
   *  Teil von `athleteDefaults` (Fahrplan 14 E7). */
  currentThresholdSpeed?: number | null;
  /** Vom Athleten im Dialog gewählte Trainingstage (ISO 1..7). Fehlt → die
   *  Tage, die der Plan heute nutzt. */
  trainingWeekdays?: number[];
  /** Häkchen „alle Tage behalten" (bei schwacher Planerfüllung). Fehlt → der
   *  beim Erstellen gespeicherte Wert, sonst false. */
  keepAllTrainingDays?: boolean;
}

export type RecomputeInput =
  | {
      ok: true;
      input: PlanGeneratorInput;
      regenerateFromISO: string;
      /** Zahl der neu zu rechnenden Wochen (für den Dialog-Hinweis). */
      affectedWeeks: number;
      /** Wochentage fester Tage, die entfallen, weil der Athlet den Tag
       *  abgewählt hat (für den Hinweis im Dialog). */
      droppedFixedWeekdays: number[];
    }
  | { ok: false; reason: string };

/**
 * `PlanGeneratorInput` (V2) für eine Restberechnung des aktiven Plans.
 * `regenerateFrom` = Montag der laufenden Kalenderwoche (deckt sich mit E6
 * „ab heute"). Gibt `{ ok:false, reason }` zurück, wenn nichts mehr zu
 * rechnen ist.
 */
export function buildRecomputeInput(args: RecomputeArgs): RecomputeInput {
  const { plan, history, todayISO, athleteDefaults, currentThresholdSpeed } = args;
  const sport = plan.sport ?? "ride";

  const base = (plan.weekModel ?? []) as WeekModelEntry[];
  if (!base.length) {
    return { ok: false, reason: "Dieser Plan hat kein Wochenmodell — bitte den Plan neu erzeugen." };
  }

  const regenerateFromISO = mondayOf(todayISO);
  const cut = base.findIndex((w) => w.start >= regenerateFromISO);
  if (cut < 0) {
    return {
      ok: false,
      reason: "Der Plan endet vor der laufenden Woche — es gibt keine Restwochen zum Neuberechnen.",
    };
  }
  const affectedWeeks = base.length - cut;

  // Die Wahl des Athleten gewinnt; sonst sind die bespielten Wochentage der
  // ersten neu zu rechnenden Woche maßgeblich (Fallback: Plan-Spalte).
  const chosen = args.trainingWeekdays
    ? [...new Set(args.trainingWeekdays)].filter((d) => d >= 1 && d <= 7).sort((a, b) => a - b)
    : null;
  if (chosen && chosen.length < 2) {
    return { ok: false, reason: "Mindestens zwei Trainingstage wählen." };
  }
  const tailWeekdays = chosen ?? currentTailWeekdays(plan, todayISO);

  // Feste Tage nur für Rad (FIXED_DAY_TYPES kennt nur das Rad-Vokabular). Ein
  // fester Tag auf einem abgewählten Wochentag entfällt (Entscheidung Q6).
  const allFixed = sport === "ride" ? savedFixedDays(plan) : [];
  const fixedDays = allFixed.filter((d) => tailWeekdays.includes(d.weekday));
  const droppedFixedWeekdays = allFixed
    .filter((d) => !tailWeekdays.includes(d.weekday))
    .map((d) => d.weekday);

  const form = savedForm(plan);
  const keepAllTrainingDays =
    args.keepAllTrainingDays ?? (form.keepAllTrainingDays === true);

  const input: PlanGeneratorInput = {
    sport,
    startDate: base[0].start,
    mode: plan.mode,
    ...(plan.mode === "event" && plan.endDate ? { eventDate: plan.endDate } : {}),
    weeks: plan.weeks,
    trainingWeekdays: tailWeekdays,
    fixedDays,
    ...(keepAllTrainingDays ? { keepAllTrainingDays: true } : {}),
    ...(sport === "ride" && typeof form.startWithFtpTest === "boolean"
      ? { startWithFtpTest: form.startWithFtpTest }
      : {}),
    weeklyHours: plan.weeklyHours ?? 6,
    // Aktuelle FTP zuerst; erst dahinter der (u. U. veraltete) Erstell-Stand.
    // Nur sport === "ride" (V1) — für Lauf/Schwimm bleibt es null.
    currentFtp:
      sport === "ride"
        ? (athleteDefaults?.ftpMeasured ?? athleteDefaults?.eFTP ?? plan.ftpAtCreation ?? null)
        : null,
    ftpMeasuredDate: sport === "ride" ? (athleteDefaults?.ftpMeasuredDate ?? null) : null,
    // Ziel-FTP des Ur-Plans beibehalten — eine Restberechnung verschiebt nicht
    // das Saisonziel (deriveFtpTarget übernimmt einen gesetzten Wert 1:1).
    ftpTarget: sport === "ride" ? (plan.ftpTarget ?? null) : null,
    // Schwellenpace-Äquivalent (V1) für sport !== "ride": aktueller Aggregat-
    // Wert zuerst, sonst der (u. U. veraltete) Erstell-Stand des Plans.
    currentThresholdSpeed:
      sport === "ride" ? null : (currentThresholdSpeed ?? plan.thresholdSpeedAtCreation ?? null),
    // Kein persistiertes Messdatum für die Schwellenpace (V3-Schema hat keine
    // entsprechende Spalte) — die Testtag-Regel für run/swim ignoriert es ohnehin.
    thresholdSpeedMeasuredDate: null,
    // Ziel-Pace des Ur-Plans beibehalten, analog ftpTarget.
    thresholdSpeedTarget: sport === "ride" ? null : (plan.thresholdSpeedTarget ?? null),
    indoorShare: plan.indoorShare ?? 0,
    focus: plan.focus,
    level: plan.level,
    model: plan.model,
    history,
    regenerateFrom: regenerateFromISO,
    baseWeekModel: base,
  };

  return { ok: true, input, regenerateFromISO, affectedWeeks, droppedFixedWeekdays };
}
