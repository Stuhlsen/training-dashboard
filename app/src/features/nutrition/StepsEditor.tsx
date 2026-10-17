/* ============================================================
   FEATURES/NUTRITION/STEPSEDITOR.TSX — Zubereitungsschritte
   (Fahrplan 25, S2a) — je Schritt Text und optionale Timer-Dauer in
   Minuten (der Kochmodus startet daraus einen Timer).
   ============================================================ */

import { useId } from "react";
import type { StepDraft } from "../../core/recipe-submission.js";
import { FIELD_ERROR_STYLE, FIELD_STYLE, GLASS, LABEL_STYLE, META_STYLE, TAP_BUTTON_STYLE } from "./nutrition-styles";

interface Props {
  steps: StepDraft[];
  onChange: (steps: StepDraft[]) => void;
  errors?: string[];
}

export function StepsEditor({ steps, onChange, errors }: Props) {
  const errorId = useId();

  function update(index: number, patch: Partial<StepDraft>) {
    onChange(steps.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  }

  return (
    <fieldset style={{ border: "none", margin: 0, padding: 0, minWidth: 0 }} aria-describedby={errors?.length ? errorId : undefined}>
      <legend style={LABEL_STYLE}>Schritte</legend>
      <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 10 }}>
        {steps.map((step, i) => (
          <li key={i} style={{ ...GLASS, borderRadius: "var(--radius)", padding: "10px 12px", display: "grid", gap: 8 }}>
            <label htmlFor={`step-text-${i}`} style={META_STYLE}>
              Schritt {i + 1}
            </label>
            <textarea
              id={`step-text-${i}`}
              rows={3}
              maxLength={500}
              placeholder="Was passiert in diesem Schritt?"
              value={step.text}
              onChange={(e) => update(i, { text: e.target.value })}
              style={{ ...FIELD_STYLE, minHeight: 80, resize: "vertical", width: "100%", boxSizing: "border-box" }}
            />
            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
              <label htmlFor={`step-timer-${i}`} style={{ ...META_STYLE, margin: 0 }}>
                Timer (Minuten, optional)
              </label>
              <input
                id={`step-timer-${i}`}
                inputMode="decimal"
                placeholder="z. B. 5"
                value={step.timerMinutes}
                onChange={(e) => update(i, { timerMinutes: e.target.value })}
                style={{ ...FIELD_STYLE, width: 96, boxSizing: "border-box" }}
              />
              {steps.length > 1 && (
                <button
                  type="button"
                  aria-label={`Schritt ${i + 1} entfernen`}
                  style={{ ...TAP_BUTTON_STYLE, marginLeft: "auto" }}
                  onClick={() => onChange(steps.filter((_, j) => j !== i))}
                >
                  Entfernen
                </button>
              )}
            </div>
          </li>
        ))}
      </ol>
      <button
        type="button"
        disabled={steps.length >= 20}
        style={{ ...TAP_BUTTON_STYLE, marginTop: 10 }}
        onClick={() => onChange([...steps, { text: "", timerMinutes: "" }])}
      >
        Schritt hinzufügen
      </button>
      {errors?.map((m) => (
        <p key={m} id={errorId} style={FIELD_ERROR_STYLE}>
          {m}
        </p>
      ))}
    </fieldset>
  );
}
