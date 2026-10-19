/* ============================================================
   FEATURES/NUTRITION/RECIPESUBMISSIONFORM.TSX — Rezept einreichen
   (Fahrplan 25, S2a; Q6, Q9, S1-3 bis S1-11)

   Eigene Unter-Ansicht im Rezepte-Bereich (kein Dialog: langes Formular,
   auf dem Handy öffnet die Tastatur). Aufbau: Titel, Portionen, Mahlzeit,
   Zutaten (Suche), Schritte, Foto, Vorschau, Absenden.

   Gerechnet wird nichts: Vorschau und Einreichen gehen an admin-api, das
   Nährwerte, Allergene und Diät-Tags aus der Zutatentabelle ableitet.
   Formularfehler (422, details je Feld) stehen am Feld, das Limit offener
   Rezepte (409) als Klartext oben.

   S2b: Mit `recipe` wird ein offenes (`pending`) Rezept bearbeitet. Das Formular
   ist dann vorbelegt, speichern ersetzt das Rezept per PUT (der Server löscht
   dabei alle Stimmen, S1-10) und das bisherige Foto bleibt, wenn kein neues
   gewählt oder es nicht entfernt wird.
   ============================================================ */

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { GlassCard } from "../../components/GlassCard";
import { useIngredientUnits, useRecipePreview, useSubmitRecipe } from "../../api/hooks/useRecipeSubmission";
import type { RecipePreview } from "../../api/recipe-submission";
import type { Recipe, ResultError } from "../../api/types";
import {
  buildSubmissionBody,
  draftFromRecipe,
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
const NO_NAMES: readonly string[] = [];
const NOT_PENDING =
  "Dieses Rezept wurde inzwischen entschieden und lässt sich nicht mehr ändern. Lade die Seite neu, um den aktuellen Stand zu sehen.";

/** Verständlicher Text für Fehler ohne Feldbezug. */
function describeError(error: ResultError): string {
  if (error.code === "NETWORK") return "Keine Verbindung zum Server. Bitte versuche es gleich noch einmal.";
  if (error.code === "TOKEN_INVALID") return "Du bist nicht angemeldet. Bitte melde dich neu an.";
  if (error.code === "NO_DATA") return "Dieses Rezept gibt es nicht mehr (zurückgezogen oder gelöscht).";
  return error.message;
}

export function RecipeSubmissionForm({ onClose, recipe }: { onClose: () => void; recipe?: Recipe }) {
  const titleId = useId();
  const servingsId = useId();
  const titleErrorId = useId();
  const servingsErrorId = useId();
  const summaryRef = useRef<HTMLDivElement>(null);

  const editing = !!recipe;
  const initial = recipe ? draftFromRecipe(recipe) : null;
  const existingPath = recipe?.imageUrl ?? null;

  const [title, setTitle] = useState(initial?.title ?? "");
  const [servings, setServings] = useState(initial?.servings ?? "2");
  const [mealTypes, setMealTypes] = useState<string[]>(initial?.mealTypes ?? []);
  const [rows, setRows] = useState<IngredientRow[]>(() =>
    (initial?.ingredients ?? []).map((i) => ({ ...i, units: [i.unit] })),
  );
  const [steps, setSteps] = useState<StepDraft[]>(initial?.steps ?? [{ text: "", timerMinutes: "" }]);
  const [photo, setPhoto] = useState<Blob | null>(null);
  const [keepPhoto, setKeepPhoto] = useState(true); // Bearbeiten: bisheriges Foto behalten
  const [rights, setRights] = useState(false);

  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [summary, setSummary] = useState<string[]>([]);
  const [errorTick, setErrorTick] = useState(0);
  const [previewState, setPreviewState] = useState<{ key: string; data: RecipePreview } | null>(null);
  const [submittedTitle, setSubmittedTitle] = useState<string | null>(null);

  const { preview, isPending: previewing } = useRecipePreview();
  const { submit, isPending: submitting } = useSubmitRecipe();
  const busy = previewing || submitting;
  // Beim Bearbeiten tragen die gespeicherten Zeilen nur die gewählte Einheit; die übrigen kommen aus der Suche
  const unitsByName = useIngredientUnits(editing ? rows.map((r) => r.name) : NO_NAMES);

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
      if (limit) setSummary([limit]);
      else if (rest.length > 0) setSummary(rest);
      else if (Object.keys(fields).length > 0) setSummary(["Bitte prüfe die markierten Felder."]);
      // Ohne Feldfehler: beim Bearbeiten heißt das 409 "nicht mehr offen" — der Servertext wäre technisch
      else setSummary([editing ? NOT_PENDING : error.message]);
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
    const options = recipe ? { recipeId: recipe.id, keepImagePath: keepPhoto ? existingPath : null } : {};
    const result = await submit(body, photo, options);
    if (result.ok) setSubmittedTitle(title.trim());
    else applyError(result.error);
  }

  function toggleMeal(slot: string) {
    setMealTypes((prev) => (prev.includes(slot) ? prev.filter((s) => s !== slot) : [...prev, slot]));
  }

  if (submittedTitle !== null) {
    return (
      <GlassCard style={CARD_STYLE}>
        <h2 style={HEADING_STYLE}>{editing ? "Änderungen gespeichert" : "Rezept eingereicht"}</h2>
        <p role="status" style={TEXT_STYLE}>
          {editing
            ? `„${submittedTitle}“ wurde aktualisiert und wartet weiter auf die Prüfung. Bisherige Stimmen zu diesem Rezept wurden gelöscht, weil sich der Inhalt geändert hat.`
            : `„${submittedTitle}“ wartet jetzt auf die Prüfung. Nährwerte und Allergene hat das System aus deinen Zutaten berechnet.`}
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
    <form onSubmit={(e) => void handleSubmit(e)} noValidate aria-label={editing ? "Rezept bearbeiten" : "Rezept einreichen"}>
      <GlassCard style={CARD_STYLE}>
        <h2 style={HEADING_STYLE}>{editing ? "Rezept bearbeiten" : "Rezept einreichen"}</h2>
        {editing && (
          <p style={TEXT_STYLE}>
            Du bearbeitest ein Rezept, das noch auf die Prüfung wartet. Mit dem Speichern werden bisherige Stimmen dazu gelöscht.
          </p>
        )}
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

          <IngredientPicker rows={rows} onChange={setRows} errors={fieldErrors.ingredients} unitsByName={unitsByName} />
          <StepsEditor steps={steps} onChange={setSteps} errors={fieldErrors.instructions} />
          <PhotoField
            photo={photo}
            rights={rights}
            onPhoto={setPhoto}
            onRights={setRights}
            errors={fieldErrors.image_url}
            existing={!!existingPath && keepPhoto}
            existingRemoved={!!existingPath && !keepPhoto}
            onRemoveExisting={() => setKeepPhoto(false)}
          />
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
            {submitting ? (editing ? "Speichere …" : "Reiche ein …") : editing ? "Änderungen speichern" : "Rezept einreichen"}
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
