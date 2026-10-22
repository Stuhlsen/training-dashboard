/* ============================================================
   FEATURES/PLANNING/GUIDED-WIZARD-VIEW-MODEL.TS — reine Logik des Schritt-
   für-Schritt-Wizards im „Neuer Plan"-Dialog (Fahrplan 32 E6, PF15–PF18).

   Kein React, kein Fetch. Der Wizard fragt nur; das Ergebnis ist ein
   `Partial<NewPlanFormState>` (V7), das der Dialog ins Formular (Erweitert)
   übernimmt — erzeugt wird der Plan weiterhin ausschließlich dort. Eigene
   Datei statt im new-plan-dialog-view-model.ts, damit dieses unter dem
   800-Zeilen-Richtwert bleibt.

   Schrittfolge (PF16): Ziel → Erfahrung → Fokus → Tage + Stunden → Rolle
   (nur Rad, nur wenn der Profilwert leer ist) → Drinnen/Draußen (nur Rad +
   Rolle) → FTP bzw. Schwellenpace.
   ============================================================ */

import {
  activeDayEnvironment,
  levelFromExperience,
  MAX_PLAN_WEEKS,
  MIN_PLAN_WEEKS,
  type DayEnvironmentMap,
  type NewPlanFormState,
  type PlanFocus,
  type PlanMode,
} from "./new-plan-dialog-view-model";
import type { ActiveSport } from "../../api/hooks/useActiveSport";

export type WizardExperience = "unter1Jahr" | "ueber1Jahr";

export type WizardStepId =
  | "goal"
  | "experience"
  | "focus"
  | "schedule"
  | "role"
  | "environment"
  | "threshold";

export interface WizardContext {
  sport: ActiveSport;
  /** Rolle aus dem Profil; `null` = nie angegeben ODER nicht lesbar (Trainer, PF18). */
  profileRole: boolean | null;
  /** Antwort auf den Rolle-Schritt (nur relevant, solange `profileRole` null ist). */
  roleAnswer: boolean | null;
}

/** Alle Antworten des Wizards; nicht gestellte Fragen behalten ihren Startwert. */
export interface WizardAnswers {
  mode: PlanMode;
  eventId: string;
  newEventDate: string;
  newEventName: string;
  weeks: number;
  experience: WizardExperience | null;
  focus: PlanFocus | null;
  trainingWeekdays: number[];
  weeklyHours: number;
  role: boolean | null;
  dayEnvironment: DayEnvironmentMap;
  ftpKnown: boolean | null;
  ftpWatt: number | null;
  /** ISO-Datum der letzten FTP-Messung, "" = leer. */
  ftpDate: string;
  thresholdSpeed: number | null;
}

/** V7: Ergebnis des Wizards. */
export interface WizardResult {
  form: Partial<NewPlanFormState>;
  /** true: die Rolle-Antwort gehört ins EIGENE Profil (nur beim Athleten selbst). */
  saveIndoorTrainerToProfile: boolean;
}

const WIZARD_MIN_FTP = 80;
const WIZARD_MAX_FTP = 500;
const WIZARD_MIN_SPEED = 1;
const WIZARD_MAX_SPEED = 30;
const WIZARD_MAX_HOURS = 25;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Wirksame Rolle: der Profilwert gewinnt, sonst die Antwort im Wizard. */
function effectiveRole(ctx: WizardContext): boolean | null {
  return ctx.profileRole ?? ctx.roleAnswer;
}

/** Schrittfolge für diesen Kontext. Rolle nur beim Rad und nur ohne Profilwert;
 *  Drinnen/Draußen nur beim Rad mit Rolle „ja"; der letzte Schritt ist beim
 *  Rad die FTP, sonst die Schwellenpace. */
export function wizardSteps(ctx: WizardContext): WizardStepId[] {
  const isRide = ctx.sport === "ride";
  // Der Fokus ist Rad-Vokabular; Lauf/Schwimmen ignorieren ihn (buildGeneratorInput).
  const steps: WizardStepId[] = ["goal", "experience", ...(isRide ? ["focus" as const] : []), "schedule"];
  if (isRide && ctx.profileRole === null) steps.push("role");
  if (isRide && effectiveRole(ctx) === true) steps.push("environment");
  steps.push("threshold");
  return steps;
}

/** Fehlertext, solange der Schritt nicht weiterführen darf; sonst `null`. */
export function wizardStepError(
  step: WizardStepId,
  a: WizardAnswers,
  ctx: WizardContext,
  todayISO: string
): string | null {
  switch (step) {
    case "goal": {
      if (a.mode === "event") {
        if (a.eventId) return null;
        if (!ISO_DATE.test(a.newEventDate)) return "Event wählen oder Renntag + Name angeben.";
        return a.newEventName.trim() ? null : "Name für das neue Event angeben.";
      }
      const weeks = Math.round(a.weeks);
      return weeks >= MIN_PLAN_WEEKS && weeks <= MAX_PLAN_WEEKS
        ? null
        : `Planlänge zwischen ${MIN_PLAN_WEEKS} und ${MAX_PLAN_WEEKS} Wochen.`;
    }
    case "experience":
      return a.experience ? null : "Bitte eine Antwort wählen.";
    case "focus":
      return a.focus ? null : "Bitte eine Antwort wählen.";
    case "schedule": {
      if (new Set(a.trainingWeekdays).size < 2) return "Mindestens zwei Trainingstage wählen.";
      return a.weeklyHours > 0 && a.weeklyHours <= WIZARD_MAX_HOURS
        ? null
        : `Zeitbudget in Stunden pro Woche angeben (bis ${WIZARD_MAX_HOURS}).`;
    }
    case "role":
      return a.role === null ? "Bitte ja oder nein wählen." : null;
    case "environment":
      return null;
    case "threshold": {
      if (ctx.sport !== "ride") {
        const speed = a.thresholdSpeed;
        return speed == null || (speed >= WIZARD_MIN_SPEED && speed <= WIZARD_MAX_SPEED)
          ? null
          : `Schwellenpace zwischen ${WIZARD_MIN_SPEED} und ${WIZARD_MAX_SPEED} km/h oder leer lassen.`;
      }
      if (a.ftpKnown === null) return "Bitte wählen: FTP bekannt oder nicht?";
      if (!a.ftpKnown) return null;
      if (a.ftpWatt == null || a.ftpWatt < WIZARD_MIN_FTP || a.ftpWatt > WIZARD_MAX_FTP) {
        return `FTP in Watt angeben (${WIZARD_MIN_FTP}–${WIZARD_MAX_FTP}).`;
      }
      return ISO_DATE.test(a.ftpDate) && a.ftpDate <= todayISO
        ? null
        : "Ungefähres Messdatum angeben (nicht in der Zukunft).";
    }
  }
}

/** Startwerte der Antworten aus dem aktuellen Formularstand. `prefilled` =
 *  das Formular wurde aus einem letzten Plan vorbelegt: nur dann sind
 *  Erfahrung und Fokus vorgewählt — beim ersten Plan antwortet der Athlet
 *  bewusst selbst statt einen Vorgabewert zu bestätigen. */
export function initialWizardAnswers(
  form: NewPlanFormState,
  opts: { prefilled: boolean; role: boolean | null }
): WizardAnswers {
  const ftpKnown = form.ftpMeasuredDate ? true : null;
  return {
    mode: form.mode,
    eventId: form.eventId,
    newEventDate: form.newEventDate,
    newEventName: form.newEventName,
    weeks: form.weeks,
    experience: opts.prefilled ? (form.level === "einsteiger" ? "unter1Jahr" : "ueber1Jahr") : null,
    focus: opts.prefilled ? form.focus : null,
    trainingWeekdays: [...form.trainingWeekdays],
    weeklyHours: form.weeklyHours,
    role: opts.role,
    dayEnvironment: { ...(form.dayEnvironment ?? {}) },
    ftpKnown,
    ftpWatt: ftpKnown ? form.currentFtp : null,
    ftpDate: form.ftpMeasuredDate ?? "",
    thresholdSpeed: form.currentThresholdSpeed,
  };
}

/** Antworten → `Partial<NewPlanFormState>` (V7). Setzt nur Felder, zu denen
 *  der Wizard auch gefragt hat. Eine Rolle-Antwort gilt als Plan-Kopie
 *  (`params.form`) und nur im Selbst-Fall zusätzlich fürs Profil — im
 *  Trainer-Fall nie (PF18). */
export function buildWizardResult(
  a: WizardAnswers,
  ctx: WizardContext,
  opts: {
    canSaveRoleToProfile: boolean;
    events: ReadonlyArray<{ id: string; ftpGoal: number | null }>;
  }
): WizardResult {
  const isRide = ctx.sport === "ride";
  const weekdays = [...new Set(a.trainingWeekdays)]
    .filter((d) => d >= 1 && d <= 7)
    .sort((x, y) => x - y);
  const roleAsked = isRide && ctx.profileRole === null;
  const role = ctx.profileRole ?? a.role;

  const form: Partial<NewPlanFormState> = {
    mode: a.mode,
    trainingWeekdays: weekdays,
    weeklyHours: a.weeklyHours,
    ...(a.experience ? { level: levelFromExperience(a.experience) } : {}),
    ...(isRide && a.focus ? { focus: a.focus } : {}),
  };

  if (a.mode === "event") {
    form.eventId = a.eventId;
    form.newEventDate = a.eventId ? "" : a.newEventDate;
    form.newEventName = a.eventId ? "" : a.newEventName.trim();
    const goal = opts.events.find((e) => e.id === a.eventId)?.ftpGoal ?? null;
    if (isRide && goal != null) form.ftpTarget = goal;
  } else {
    form.weeks = Math.round(a.weeks);
  }

  if (roleAsked && a.role !== null) form.hasIndoorTrainer = a.role;
  if (isRide) {
    form.dayEnvironment = role === true ? (activeDayEnvironment(a.dayEnvironment, weekdays) ?? {}) : {};
    if (a.ftpKnown === true && a.ftpWatt != null) {
      form.currentFtp = a.ftpWatt;
      form.ftpMeasuredDate = a.ftpDate;
    } else if (a.ftpKnown === false) {
      form.ftpMeasuredDate = null;
    }
    // Den FTP-Test entscheidet die Automatik samt Grund (V6), nicht der Wizard.
    if (a.ftpKnown !== null) form.startWithFtpTest = null;
  } else {
    form.currentThresholdSpeed = a.thresholdSpeed;
  }

  return {
    form,
    saveIndoorTrainerToProfile: roleAsked && opts.canSaveRoleToProfile && a.role !== null,
  };
}

/** Wizard-Ergebnis über das Formular legen. Feste Tage auf abgewählten
 *  Wochentagen entfallen (wie beim Abwählen im Formular). */
export function applyWizardResult(form: NewPlanFormState, result: WizardResult): NewPlanFormState {
  const merged: NewPlanFormState = { ...form, ...result.form };
  return {
    ...merged,
    fixedDays: merged.fixedDays.filter((d) => merged.trainingWeekdays.includes(d.weekday)),
  };
}
