/* ============================================================
   FEATURES/PLANNING/GUIDEDPLANSTEPS.TSX — die einzelnen Bildschirme des
   Plan-Wizards (Fahrplan 32 E6). Je Schritt eine kleine Komponente; Ablauf,
   Prüfung und Ergebnis liegen in GuidedPlanQuestions.tsx bzw.
   guided-wizard-view-model.ts. Reine Darstellung, kein Fetch.
   ============================================================ */

import { Fragment } from "react";
import { fmtDate } from "../../core/format.js";
import {
  FIELD_STYLE,
  HINT_STYLE,
  LABEL_STYLE,
  PILL_STYLE,
  PRIMARY_BTN_STYLE,
} from "./new-plan-dialog-styles";
import type { WizardAnswers } from "./guided-wizard-view-model";
import {
  DAY_ENVIRONMENT_LABELS,
  FOCUS_DESCRIPTIONS,
  FOCUS_LABELS,
  LEVEL_DESCRIPTIONS,
  MAX_PLAN_WEEKS,
  MIN_PLAN_WEEKS,
  parseDescriptionSegments,
  WEEKDAY_LABELS,
  type PlanFocus,
} from "./new-plan-dialog-view-model";
import type { EventItem } from "../../api/types";

const NEW_EVENT_VALUE = "__new__";

const EXPERIENCE_OPTIONS = [
  { value: "unter1Jahr", label: "Unter 1 Jahr", level: "einsteiger" },
  { value: "ueber1Jahr", label: "Über 1 Jahr", level: "fortgeschritten" },
] as const;

export interface StepProps {
  answers: WizardAnswers;
  set: (next: Partial<WizardAnswers>) => void;
}

export function Choice({
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

export function GoalStep({
  answers,
  set,
  events,
}: StepProps & {
  events: ReadonlyArray<Pick<EventItem, "id" | "title" | "eventDate">>;
}) {
  return (
    <>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <Choice
          on={answers.mode === "event"}
          onClick={() => set({ mode: "event", eventId: answers.eventId || events[0]?.id || "" })}
        >
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
  );
}

export function ExperienceStep({ answers, set }: StepProps) {
  const level = EXPERIENCE_OPTIONS.find((o) => o.value === answers.experience)?.level;
  return (
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
      {level && <Segments text={LEVEL_DESCRIPTIONS[level]} />}
    </>
  );
}

export function FocusStep({ answers, set }: StepProps) {
  return (
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
  );
}

export function ScheduleStep({ answers, set }: StepProps) {
  function toggleWeekday(iso: number) {
    const has = answers.trainingWeekdays.includes(iso);
    set({
      trainingWeekdays: has
        ? answers.trainingWeekdays.filter((d) => d !== iso)
        : [...answers.trainingWeekdays, iso].sort((a, b) => a - b),
    });
  }
  return (
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
  );
}

export function RoleStep({
  answers,
  set,
  canSaveRoleToProfile,
}: StepProps & { canSaveRoleToProfile: boolean }) {
  return (
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
  );
}

export function EnvironmentStep({ answers, set }: StepProps) {
  return (
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
              <span style={{ width: 26, color: "var(--ink-2)", fontSize: ".82rem" }}>{dayLabel}</span>
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
  );
}

export function FtpStep({ answers, set, todayISO }: StepProps & { todayISO: string }) {
  return (
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
  );
}

export function PaceStep({ answers, set }: StepProps) {
  return (
    <label style={LABEL_STYLE}>
      Schwellenpace (km/h), optional
      <input
        type="number"
        min={1}
        max={30}
        step={0.1}
        style={{ ...FIELD_STYLE, maxWidth: 200 }}
        value={answers.thresholdSpeed ?? ""}
        onChange={(e) => set({ thresholdSpeed: e.target.value ? Number(e.target.value) : null })}
      />
      <span style={HINT_STYLE}>Leer lassen ist in Ordnung — du kannst sie im Formular ergänzen.</span>
    </label>
  );
}
