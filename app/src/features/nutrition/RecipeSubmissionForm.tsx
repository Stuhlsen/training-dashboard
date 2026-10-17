/* ============================================================
   FEATURES/NUTRITION/RECIPESUBMISSIONFORM.TSX — Rezept einreichen
   (Fahrplan 25, S2a; Q6, Q9, S1-3 bis S1-11)

   Eigene Unter-Ansicht im Rezepte-Bereich (kein Dialog: langes Formular,
   auf dem Handy öffnet die Tastatur). Aufbau: Titel, Portionen, Mahlzeit,
   Zutaten (Suche), Schritte, Foto, Vorschau, Absenden.

   Gerechnet wird nichts: Vorschau und Einreichen gehen an admin-api, das
   Nährwerte, Allergene und Diät-Tags aus der Zutatentabelle ableitet.
   Formularfehler (422, details je Feld) stehen am Feld, das Limit offener
   Rezepte (409) als Klartext oben. Zurückziehen/Bearbeiten: S2b.
   ============================================================ */

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { GlassCard } from "../../components/GlassCard";
import { useRecipePreview, useSubmitRecipe } from "../../api/hooks/useRecipeSubmission";
import type { RecipePreview } from "../../api/recipe-submission";
import type { ResultError } from "../../api/types";
import {
  buildSubmissionBody,
  openRecipesMessage,
  splitFieldErrors,
  type StepDraft,
} from "../../core/recipe-submission.js";
import { SLOT_LABELS, SLOT_ORDER } from "./nutrition-week-model";
import { IngredientPicker, type IngredientRow } from "./IngredientPicker";
import { StepsEditor } from "./StepsEditor";
import { PhotoField } from "./PhotoField";
import { SubmissionPreview } from "./SubmissionPreview";
import {
  FIELD_ERROR_STYLE,
  FIELD_STYLE,
  HEADING_STYLE,
  LABEL_STYLE,
  META_STYLE,
  PRIMARY_BUTTON_DISABLED_STYLE,
  PRIMARY_BUTTON_STYLE,
  TAP_BUTTON_DISABLED_STYLE,
  TAP_BUTTON_STYLE,
  TAP_MIN,
  TEXT_STYLE,
} from "./nutrition-styles";

const CARD_STYLE = { padding: "24px 28px", marginBottom: 16 } as const;
const PHOTO_RIGHTS_MISSING = "Bitte bestätige zuerst, dass du das Foto verwenden darfst.";

/** Verständlicher Text für Fehler ohne Feldbezug. */
function describeError(error: ResultError): string {
  if (error.code === "NETWORK") return "Keine Verbindung zum Server. Bitte versuche es gleich noch einmal.";
  if (error.code === "TOKEN_INVALID") return "Du bist nicht angemeldet. Bitte melde dich neu an.";
  return error.message;
}

export function RecipeSubmissionForm({ onClose }: { onClose: () => void }) {
  const titleId = useId();
  const servingsId = useId();
  const titleErrorId = useId();
  const servingsErrorId = useId();
  const summaryRef = useRef<HTMLDivElement>(null);

  const [title, setTitle] = useState("");
  const [servings, setServings] = useState("2");
  const [mealTypes, setMealTypes] = useState<string[]>([]);
  const [rows, setRows] = useState<IngredientRow[]>([]);
  const [steps, setSteps] = useState<StepDraft[]>([{ text: "", timerMinutes: "" }]);
  const [photo, setPhoto] = useState<Blob | null>(null);
  const [rights, setRights] = useState(false);

  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [summary, setSummary] = useState<string[]>([]);
  const [errorTick, setErrorTick] = useState(0);
  const [previewState, setPreviewState] = useState<{ key: string; data: RecipePreview } | null>(null);
  const [submittedTitle, setSubmittedTitle] = useState<string | null>(null);

  const { preview, isPending: previewing } = useRecipePreview();
  const { submit, isPending: submitting } = useSubmitRecipe();
  const busy = previewing || submitting;

  const body = buildSubmissionBody({ title, servings, mealTypes, ingredients: rows, steps });
  const bodyKey = JSON.stringify(body);

  // Fehler nach vorn holen: Fokus auf die Fehlerübersicht, damit Screenreader sie vorlesen
  useEffect(() => {
    if (errorTick > 0) summaryRef.current?.focus();
  }, [errorTick]);

  function clearErrors() {
    setFieldErrors({});
    setSummary([]);
  }

  function applyError(error: ResultError) {
    if (error.code === "VALIDATION") {
      const { fields, rest } = splitFieldErrors(error.details);
      const limit = openRecipesMessage(error.details);
      setFieldErrors(fields);
      setSummary(limit ? [limit] : rest.length > 0 ? rest : ["Bitte prüfe die markierten Felder."]);
    } else {
      setFieldErrors({});
      setSummary([describeError(error)]);
    }
    setErrorTick((t) => t + 1);
  }

  async function handlePreview() {
    clearErrors();
    const result = await preview(body);
    if (result.ok) setPreviewState({ key: bodyKey, data: result });
    else applyError(result.error);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    clearErrors();
    if (photo && !rights) {
      setFieldErrors({ image_url: [PHOTO_RIGHTS_MISSING] });
      setSummary(["Bitte prüfe die markierten Felder."]);
      setErrorTick((t) => t + 1);
      return;
    }
    const result = await submit(body, photo);
    if (result.ok) setSubmittedTitle(title.trim());
    else applyError(result.error);
  }

  function toggleMeal(slot: string) {
    setMealTypes((prev) => (prev.includes(slot) ? prev.filter((s) => s !== slot) : [...prev, slot]));
  }

  if (submittedTitle !== null) {
    return (
      <GlassCard style={CARD_STYLE}>
        <h2 style={HEADING_STYLE}>Rezept eingereicht</h2>
        <p role="status" style={TEXT_STYLE}>
          „{submittedTitle}“ wartet jetzt auf die Prüfung. Nährwerte und Allergene hat das System aus deinen Zutaten berechnet.
        </p>
        <button type="button" style={PRIMARY_BUTTON_STYLE} onClick={onClose}>
          Zurück zu den Rezepten
        </button>
      </GlassCard>
    );
  }

  const titleErrors = fieldErrors.title;
  const servingsErrors = fieldErrors.servings;

  return (
    <form onSubmit={(e) => void handleSubmit(e)} noValidate aria-label="Rezept einreichen">
      <GlassCard style={CARD_STYLE}>
        <h2 style={HEADING_STYLE}>Rezept einreichen</h2>
        <p style={TEXT_STYLE}>
          Wähle Zutaten aus der Liste und gib Mengen an. Nährwerte, Allergene und Ernährungsform berechnet das System selbst; ein
          Admin prüft dein Rezept, bevor es für alle sichtbar wird.
        </p>

        {summary.length > 0 && (
          <div
            ref={summaryRef}
            tabIndex={-1}
            role="alert"
            style={{ border: "1px solid var(--danger)", borderRadius: "var(--radius)", padding: "10px 14px", margin: "0 0 16px" }}
          >
            {summary.map((m) => (
              <p key={m} style={{ ...TEXT_STYLE, color: "var(--danger)", margin: 0 }}>
                {m}
              </p>
            ))}
          </div>
        )}

        <div style={{ display: "grid", gap: 20 }}>
          <div>
            <label htmlFor={titleId} style={LABEL_STYLE}>
              Titel
            </label>
            <input
              id={titleId}
              value={title}
              maxLength={100}
              onChange={(e) => setTitle(e.target.value)}
              aria-invalid={!!titleErrors}
              aria-describedby={titleErrors ? titleErrorId : undefined}
              style={{ ...FIELD_STYLE, width: "100%", boxSizing: "border-box" }}
            />
            {titleErrors?.map((m) => (
              <p key={m} id={titleErrorId} style={FIELD_ERROR_STYLE}>
                {m}
              </p>
            ))}
          </div>

          <div>
            <label htmlFor={servingsId} style={LABEL_STYLE}>
              Portionen
            </label>
            <input
              id={servingsId}
              inputMode="decimal"
              value={servings}
              onChange={(e) => setServings(e.target.value)}
              aria-invalid={!!servingsErrors}
              aria-describedby={servingsErrors ? servingsErrorId : undefined}
              style={{ ...FIELD_STYLE, width: 110, boxSizing: "border-box" }}
            />
            {servingsErrors?.map((m) => (
              <p key={m} id={servingsErrorId} style={FIELD_ERROR_STYLE}>
                {m}
              </p>
            ))}
          </div>

          <fieldset style={{ border: "none", margin: 0, padding: 0, minWidth: 0 }}>
            <legend style={LABEL_STYLE}>Mahlzeit (mindestens eine)</legend>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {SLOT_ORDER.map((slot) => {
                const on = mealTypes.includes(slot);
                return (
                  <label
                    key={slot}
                    style={{
                      ...(on ? PRIMARY_BUTTON_STYLE : TAP_BUTTON_STYLE),
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 8,
                      minHeight: TAP_MIN,
                    }}
                  >
                    <input type="checkbox" checked={on} onChange={() => toggleMeal(slot)} />
                    {SLOT_LABELS[slot]}
                  </label>
                );
              })}
            </div>
            {fieldErrors.meal_type?.map((m) => (
              <p key={m} style={FIELD_ERROR_STYLE}>
                {m}
              </p>
            ))}
          </fieldset>

          <IngredientPicker rows={rows} onChange={setRows} errors={fieldErrors.ingredients} />
          <StepsEditor steps={steps} onChange={setSteps} errors={fieldErrors.instructions} />
          <PhotoField photo={photo} rights={rights} onPhoto={setPhoto} onRights={setRights} errors={fieldErrors.image_url} />
        </div>
      </GlassCard>

      <GlassCard style={CARD_STYLE}>
        <h2 style={HEADING_STYLE}>Vorschau</h2>
        {previewState ? (
          <SubmissionPreview preview={previewState.data} stale={previewState.key !== bodyKey} />
        ) : (
          <p style={TEXT_STYLE}>Berechne die Vorschau, um Nährwerte und Allergene zu sehen, bevor du einreichst.</p>
        )}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 16 }}>
          <button type="button" disabled={busy} style={busy ? TAP_BUTTON_DISABLED_STYLE : TAP_BUTTON_STYLE} onClick={() => void handlePreview()}>
            {previewing ? "Berechne …" : "Vorschau berechnen"}
          </button>
          <button type="submit" disabled={busy} style={busy ? PRIMARY_BUTTON_DISABLED_STYLE : PRIMARY_BUTTON_STYLE}>
            {submitting ? "Reiche ein …" : "Rezept einreichen"}
          </button>
          <button type="button" disabled={busy} style={busy ? TAP_BUTTON_DISABLED_STYLE : TAP_BUTTON_STYLE} onClick={onClose}>
            Abbrechen
          </button>
        </div>
        <p style={{ ...META_STYLE, marginTop: 12 }}>Bis zu 5 Rezepte können gleichzeitig auf ihre Prüfung warten.</p>
      </GlassCard>
    </form>
  );
}
