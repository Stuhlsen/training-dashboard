/* ============================================================
   FEATURES/PLANNING/GUIDEDPLANQUESTIONS.TSX — Schritt-für-Schritt-Wizard im
   „Neuer Plan"-Dialog (Fahrplan 32 E6; vorher zwei Fragen aus Fahrplan 20 E4).

   Ein Schritt pro Bildschirm, Zurück/Weiter, „Schritt x von y". Reine
   Darstellungs-/Ablauflogik, kein Fetch: Schrittfolge, Prüfung und das
   Ergebnis (`Partial<NewPlanFormState>`, V7) kommen aus
   guided-wizard-view-model.ts. Der Wizard speichert nichts — der Dialog
   übernimmt das Ergebnis ins Formular und legt eine Rolle-Antwort bei Bedarf
   ins Profil. Pill-Buttons im Stil der Modus-/Wochentag-Pillen des Dialogs.
   ============================================================ */

import { Fragment, useState } from "react";
import { fmtDate } from "../../core/format.js";
import { FIELD_STYLE, LABEL_STYLE, PILL_STYLE, PRIMARY_BTN_STYLE } from "./new-plan-dialog-styles";
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
  DAY_ENVIRONMENT_LABELS,
  FOCUS_DESCRIPTIONS,
  FOCUS_LABELS,
  LEVEL_DESCRIPTIONS,
  MAX_PLAN_WEEKS,
  MIN_PLAN_WEEKS,
  parseDescriptionSegments,
  WEEKDAY_LABELS,
  type NewPlanFormState,
  type PlanFocus,
} from "./new-plan-dialog-view-model";
import type { ActiveSport } from "../../api/hooks/useActiveSport";
import type { EventItem } from "../../api/types";

const NEW_EVENT_VALUE = "__new__";

const EXPERIENCE_OPTIONS = [
  { value: "unter1Jahr", label: "Unter 1 Jahr", level: "einsteiger" },
  { value: "ueber1Jahr", label: "Über 1 Jahr", level: "fortgeschritten" },
] as const;

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

const HINT_STYLE: React.CSSProperties = { fontSize: ".74rem", color: "var(--ink-3)", margin: 0 };

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

function Choice({
  on,
  onClick,
  children,
}: {
  on: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      style={on ? PRIMARY_BTN_STYLE : PILL_STYLE}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

/** Plus-/Minus-Beschreibung (V1-Markup) wie im Formular. */
function Segments({ text }: { text: string }) {
  return (
    <span style={{ fontSize: ".74rem" }}>
      {parseDescriptionSegments(text).map((seg, i) => (
        <Fragment key={i}>
          {i > 0 && " · "}
          <span style={{ color: seg.sign === "plus" ? "var(--z1)" : "var(--danger)" }}>{seg.text}</span>
        </Fragment>
      ))}
    </span>
  );
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

  function toggleWeekday(iso: number) {
    const has = answers.trainingWeekdays.includes(iso);
    set({
      trainingWeekdays: has
        ? answers.trainingWeekdays.filter((d) => d !== iso)
        : [...answers.trainingWeekdays, iso].sort((a, b) => a - b),
    });
  }

  const title =
    step === "threshold"
      ? sport === "ride"
        ? "Kennst du deine FTP?"
        : "Kennst du deine Schwellenpace?"
      : STEP_TITLES[step];

  const experienceLevel = EXPERIENCE_OPTIONS.find((o) => o.value === answers.experience)?.level;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div>
        <div aria-live="polite" style={{ ...HINT_STYLE, marginBottom: 6 }}>
          Schritt {current + 1} von {steps.length}
        </div>
        <div style={{ height: 3, borderRadius: 2, background: "var(--hair)" }}>
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

      <h3 style={HEADING_STYLE}>{title}</h3>

      {step === "goal" && (
        <>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Choice on={answers.mode === "event"} onClick={() => set({ mode: "event" })}>
              Auf ein Event hin
            </Choice>
            <Choice on={answers.mode === "open"} onClick={() => set({ mode: "open" })}>
              Ohne festes Ende
            </Choice>
          </div>
          {answers.mode === "open" ? (
            <label style={LABEL_STYLE}>
              Planlänge (Wochen)
              <input
                type="number"
                min={MIN_PLAN_WEEKS}
                max={MAX_PLAN_WEEKS}
                style={{ ...FIELD_STYLE, maxWidth: 200 }}
                value={answers.weeks}
                onChange={(e) => set({ weeks: Number(e.target.value) || 0 })}
              />
            </label>
          ) : (
            <>
              <label style={LABEL_STYLE}>
                Ziel-Event
                <select
                  style={FIELD_STYLE}
                  value={answers.eventId || NEW_EVENT_VALUE}
                  onChange={(e) =>
                    set({ eventId: e.target.value === NEW_EVENT_VALUE ? "" : e.target.value })
                  }
                >
                  {events.map((e) => (
                    <option key={e.id} value={e.id}>
                      {fmtDate(e.eventDate)} — {e.title}
                    </option>
                  ))}
                  <option value={NEW_EVENT_VALUE}>Anderes Event anlegen …</option>
                </select>
              </label>
              {!answers.eventId && (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <label style={LABEL_STYLE}>
                    Renntag
                    <input
                      type="date"
                      style={FIELD_STYLE}
                      value={answers.newEventDate}
                      onChange={(e) => set({ newEventDate: e.target.value })}
                    />
                  </label>
                  <label style={LABEL_STYLE}>
                    Event-Name
                    <input
                      type="text"
                      style={FIELD_STYLE}
                      value={answers.newEventName}
                      placeholder="z. B. GFNY Hamburg"
                      onChange={(e) => set({ newEventName: e.target.value })}
                    />
                  </label>
                </div>
              )}
            </>
          )}
        </>
      )}

      {step === "experience" && (
        <>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {EXPERIENCE_OPTIONS.map((opt) => (
              <Choice
                key={opt.value}
                on={answers.experience === opt.value}
                onClick={() => set({ experience: opt.value })}
              >
                {opt.label}
              </Choice>
            ))}
          </div>
          {experienceLevel && <Segments text={LEVEL_DESCRIPTIONS[experienceLevel]} />}
        </>
      )}

      {step === "focus" && (
        <>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {(Object.keys(FOCUS_LABELS) as PlanFocus[]).map((f) => (
              <Choice key={f} on={answers.focus === f} onClick={() => set({ focus: f })}>
                {FOCUS_LABELS[f]}
              </Choice>
            ))}
          </div>
          {answers.focus && <Segments text={FOCUS_DESCRIPTIONS[answers.focus]} />}
        </>
      )}

      {step === "schedule" && (
        <>
          <div style={LABEL_STYLE}>
            Trainingstage
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {WEEKDAY_LABELS.map((d) => (
                <Choice
                  key={d.iso}
                  on={answers.trainingWeekdays.includes(d.iso)}
                  onClick={() => toggleWeekday(d.iso)}
                >
                  {d.short}
                </Choice>
              ))}
            </div>
          </div>
          <label style={LABEL_STYLE}>
            Zeitbudget (h/Woche)
            <input
              type="number"
              min={1}
              max={25}
              step={0.5}
              style={{ ...FIELD_STYLE, maxWidth: 200 }}
              value={answers.weeklyHours}
              onChange={(e) => set({ weeklyHours: Number(e.target.value) || 0 })}
            />
            <span style={HINT_STYLE}>Das ist eine Obergrenze — der Plan bleibt darunter.</span>
          </label>
        </>
      )}

      {step === "role" && (
        <>
          <div style={{ display: "flex", gap: 8 }}>
            <Choice on={answers.role === true} onClick={() => set({ role: true })}>
              Ja
            </Choice>
            <Choice on={answers.role === false} onClick={() => set({ role: false })}>
              Nein
            </Choice>
          </div>
          <p style={HINT_STYLE}>
            {canSaveRoleToProfile
              ? "Die Antwort wird in deinem Profil gespeichert (änderbar unter Einstellungen → Profil)."
              : "Die Antwort gilt nur für diesen Plan."}
          </p>
        </>
      )}

      {step === "environment" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {[...answers.trainingWeekdays]
            .sort((a, b) => a - b)
            .map((iso) => {
              const chosen = answers.dayEnvironment[iso] ?? "any";
              const dayLabel = WEEKDAY_LABELS.find((w) => w.iso === iso)?.short;
              return (
                <div
                  key={iso}
                  role="group"
                  aria-label={`Drinnen oder draußen am ${dayLabel}`}
                  style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}
                >
                  <span style={{ width: 26, color: "var(--ink-2)", fontSize: ".82rem" }}>
                    {dayLabel}
                  </span>
                  {DAY_ENVIRONMENT_LABELS.map((opt) => (
                    <Choice
                      key={opt.value}
                      on={chosen === opt.value}
                      onClick={() =>
                        set({ dayEnvironment: { ...answers.dayEnvironment, [iso]: opt.value } })
                      }
                    >
                      {opt.label}
                    </Choice>
                  ))}
                </div>
              );
            })}
          <p style={HINT_STYLE}>
            „Egal“ lässt dem Plan freie Wahl. Harte Einheiten legt er bevorzugt auf Drinnen-Tage.
          </p>
        </div>
      )}

      {step === "threshold" && sport === "ride" && (
        <>
          <div style={{ display: "flex", gap: 8 }}>
            <Choice on={answers.ftpKnown === true} onClick={() => set({ ftpKnown: true })}>
              Ja, ungefähr
            </Choice>
            <Choice on={answers.ftpKnown === false} onClick={() => set({ ftpKnown: false })}>
              Nein
            </Choice>
          </div>
          {answers.ftpKnown === true && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <label style={LABEL_STYLE}>
                FTP (W)
                <input
                  type="number"
                  min={80}
                  max={500}
                  style={FIELD_STYLE}
                  value={answers.ftpWatt ?? ""}
                  onChange={(e) => set({ ftpWatt: e.target.value ? Number(e.target.value) : null })}
                />
              </label>
              <label style={LABEL_STYLE}>
                Gemessen etwa am
                <input
                  type="date"
                  max={todayISO}
                  style={FIELD_STYLE}
                  value={answers.ftpDate}
                  onChange={(e) => set({ ftpDate: e.target.value })}
                />
              </label>
            </div>
          )}
          <p style={HINT_STYLE}>
            {answers.ftpKnown === false
              ? "Dann beginnt der Plan mit einem FTP-Test. Im Formular kannst du das ändern."
              : "Ist die Messung älter als 6 Wochen, beginnt der Plan mit einem FTP-Test."}
          </p>
        </>
      )}

      {step === "threshold" && sport !== "ride" && (
        <label style={LABEL_STYLE}>
          Schwellenpace (km/h), optional
          <input
            type="number"
            min={1}
            max={30}
            step={0.1}
            style={{ ...FIELD_STYLE, maxWidth: 200 }}
            value={answers.thresholdSpeed ?? ""}
            onChange={(e) =>
              set({ thresholdSpeed: e.target.value ? Number(e.target.value) : null })
            }
          />
          <span style={HINT_STYLE}>
            Leer lassen ist in Ordnung — du kannst sie im Formular ergänzen.
          </span>
        </label>
      )}

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
