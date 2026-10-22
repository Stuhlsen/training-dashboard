/* ============================================================
   FEATURES/PLANNING/GUIDEDPLANQUESTIONS.TSX — Schritt-für-Schritt-Wizard im
   „Neuer Plan"-Dialog (Fahrplan 32 E6; vorher zwei Fragen aus Fahrplan 20 E4).

   Ein Schritt pro Bildschirm, Zurück/Weiter, „Schritt x von y". Reine
   Darstellungs-/Ablauflogik, kein Fetch: Schrittfolge, Prüfung und das
   Ergebnis (`Partial<NewPlanFormState>`, V7) kommen aus
   guided-wizard-view-model.ts, die einzelnen Bildschirme aus
   GuidedPlanSteps.tsx. Der Wizard speichert nichts — der Dialog übernimmt das
   Ergebnis ins Formular und legt eine Rolle-Antwort bei Bedarf ins Profil.
   ============================================================ */

import { useState } from "react";
import { HINT_STYLE, PILL_STYLE, PRIMARY_BTN_STYLE } from "./new-plan-dialog-styles";
import {
  buildWizardResult,
  initialWizardAnswers,
  wizardStepError,
  wizardSteps,
  type WizardAnswers,
  type WizardContext,
  type WizardResult,
  type WizardStepId,
} from "./guided-wizard-view-model";
import {
  EnvironmentStep,
  ExperienceStep,
  FocusStep,
  FtpStep,
  GoalStep,
  PaceStep,
  RoleStep,
  ScheduleStep,
} from "./GuidedPlanSteps";
import type { NewPlanFormState } from "./new-plan-dialog-view-model";
import type { ActiveSport } from "../../api/hooks/useActiveSport";
import type { EventItem } from "../../api/types";

const STEP_TITLES: Record<Exclude<WizardStepId, "threshold">, string> = {
  goal: "Worauf trainierst du hin?",
  experience: "Wie lange trainierst du schon strukturiert?",
  focus: "Was ist dir am wichtigsten?",
  schedule: "Wann und wie viel willst du trainieren?",
  role: "Hast du eine Rolle oder einen Smart-Trainer?",
  environment: "Welche Tage drinnen, welche draußen?",
};

const HEADING_STYLE: React.CSSProperties = {
  fontFamily: "var(--font-disp)",
  fontWeight: 700,
  fontSize: ".95rem",
  color: "var(--ink)",
  margin: 0,
};

export interface GuidedPlanQuestionsProps {
  sport: ActiveSport;
  /** Rolle aus dem Profil; `null` = nie angegeben oder (Trainer) nicht lesbar. */
  profileRole: boolean | null;
  /** true nur beim Athleten selbst — dann landet die Rolle-Antwort im Profil. */
  canSaveRoleToProfile: boolean;
  /** Formular wurde aus einem letzten Plan vorbelegt (Erfahrung/Fokus vorgewählt). */
  prefilled: boolean;
  /** Formularstand beim Öffnen — Startwerte der Antworten. */
  initialForm: NewPlanFormState;
  events: ReadonlyArray<Pick<EventItem, "id" | "title" | "eventDate" | "priority" | "ftpGoal">>;
  /** Heute (lokal, ISO) — Obergrenze für das FTP-Messdatum. */
  todayISO: string;
  onComplete: (result: WizardResult) => void;
}

function stepTitle(step: WizardStepId, sport: ActiveSport): string {
  if (step !== "threshold") return STEP_TITLES[step];
  return sport === "ride" ? "Kennst du deine FTP?" : "Kennst du deine Schwellenpace?";
}

export function GuidedPlanQuestions({
  sport,
  profileRole,
  canSaveRoleToProfile,
  prefilled,
  initialForm,
  events,
  todayISO,
  onComplete,
}: GuidedPlanQuestionsProps) {
  const [answers, setAnswers] = useState<WizardAnswers>(() =>
    initialWizardAnswers(initialForm, { prefilled, role: profileRole })
  );
  const [index, setIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const ctx: WizardContext = { sport, profileRole, roleAnswer: answers.role };
  const steps = wizardSteps(ctx);
  const current = Math.min(index, steps.length - 1);
  const step = steps[current];
  const isLast = current === steps.length - 1;

  function set(next: Partial<WizardAnswers>) {
    setAnswers((a) => ({ ...a, ...next }));
    setError(null);
  }

  function next() {
    const problem = wizardStepError(step, answers, ctx, todayISO);
    if (problem) {
      setError(problem);
      return;
    }
    if (isLast) {
      onComplete(buildWizardResult(answers, ctx, { canSaveRoleToProfile, events }));
      return;
    }
    setError(null);
    setIndex(current + 1);
  }

  function back() {
    setError(null);
    setIndex(Math.max(0, current - 1));
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div>
        <div aria-live="polite" style={{ ...HINT_STYLE, marginBottom: 6 }}>
          Schritt {current + 1} von {steps.length}
        </div>
        <div
          role="progressbar"
          aria-label="Fortschritt im Wizard"
          aria-valuemin={1}
          aria-valuemax={steps.length}
          aria-valuenow={current + 1}
          style={{ height: 3, borderRadius: 2, background: "var(--hair)" }}
        >
          <div
            style={{
              height: "100%",
              borderRadius: 2,
              width: `${((current + 1) / steps.length) * 100}%`,
              background: "var(--ss)",
            }}
          />
        </div>
      </div>

      <h3 style={HEADING_STYLE}>{stepTitle(step, sport)}</h3>

      {step === "goal" && <GoalStep answers={answers} set={set} events={events} />}
      {step === "experience" && <ExperienceStep answers={answers} set={set} />}
      {step === "focus" && <FocusStep answers={answers} set={set} />}
      {step === "schedule" && <ScheduleStep answers={answers} set={set} />}
      {step === "role" && (
        <RoleStep answers={answers} set={set} canSaveRoleToProfile={canSaveRoleToProfile} />
      )}
      {step === "environment" && <EnvironmentStep answers={answers} set={set} />}
      {step === "threshold" &&
        (sport === "ride" ? (
          <FtpStep answers={answers} set={set} todayISO={todayISO} />
        ) : (
          <PaceStep answers={answers} set={set} />
        ))}

      {error && (
        <div role="alert" style={{ color: "var(--danger)", fontSize: ".78rem" }}>
          {error}
        </div>
      )}

      <div
        style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}
      >
        <button
          type="button"
          style={current === 0 ? { ...PILL_STYLE, opacity: 0.5, cursor: "not-allowed" } : PILL_STYLE}
          disabled={current === 0}
          onClick={back}
        >
          Zurück
        </button>
        <button type="button" style={PRIMARY_BTN_STYLE} onClick={next}>
          {isLast ? "Zum Formular" : "Weiter"}
        </button>
      </div>
      {isLast && (
        <p style={HINT_STYLE}>
          Im Formular siehst du Startdatum, FTP-Test und Stunden als Übersicht, bevor etwas
          gespeichert wird.
        </p>
      )}
    </div>
  );
}
