/* ============================================================
   CORE/RECIPE-SUBMISSION.JS — Formular → Request-Body (Fahrplan 25, S2a)

   Reine Umformung, KEINE Nährwert-/Allergenrechnung: die macht
   ausschließlich der Server (admin-api POST /api/recipes[/preview]).
   Hier nur: Mengen-Text ("1,5") → Zahl, Timer-Minuten → Sekunden,
   Leerzeilen weglassen, Foto-Zielgröße, Fehler je Feld einsammeln.
   ============================================================ */

/** Längste Bildkante nach der Verkleinerung im Browser (Q9). */
export const PHOTO_MAX_EDGE = 1200;

const MEAL_TYPE_MESSAGE = "Wähle mindestens eine Mahlzeit.";

/** Formularfelder, für die der Server Fehler je Feld liefert. */
export const FIELD_ORDER = ["title", "meal_type", "servings", "ingredients", "instructions", "image_url"];

/**
 * "1,5" / "1.5" / " 2 " → Zahl; alles andere (leer, Text, ≤ 0) → null.
 * @param {string} text
 * @returns {number | null}
 */
export function parseAmount(text) {
  const cleaned = String(text ?? "").trim().replace(",", ".");
  if (!/^\d+(\.\d+)?$/.test(cleaned)) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * @typedef {{ name: string, amount: string, unit: string }} IngredientDraft
 * @typedef {{ text: string, timerMinutes: string }} StepDraft
 * @typedef {{
 *   title: string, servings: string, mealTypes: string[],
 *   ingredients: IngredientDraft[], steps: StepDraft[]
 * }} SubmissionDraft
 */

/**
 * Formularstand → Body für preview/POST/PUT. Unlesbare Mengen gehen als 0
 * weiter, damit der Server sie als Feldfehler meldet, statt dass hier geraten
 * wird; Schritte ohne Text fallen weg.
 * @param {SubmissionDraft} draft
 * @param {string | null} [imagePath]
 */
export function buildSubmissionBody(draft, imagePath = null) {
  const body = {
    title: draft.title.trim(),
    meal_type: [...draft.mealTypes],
    servings: parseAmount(draft.servings) ?? 0,
    ingredients: draft.ingredients.map((ing) => ({
      name: ing.name,
      amount: parseAmount(ing.amount) ?? 0,
      unit: ing.unit,
    })),
    instructions: draft.steps
      .filter((s) => s.text.trim() !== "")
      .map((s) => {
        const minutes = parseAmount(s.timerMinutes);
        const step = { text: s.text.trim() };
        return minutes ? { ...step, timerSeconds: Math.round(minutes * 60) } : step;
      }),
  };
  return imagePath ? { ...body, image_url: imagePath } : body;
}

/**
 * Zielgröße bei Verkleinerung: längste Kante ≤ max, Seitenverhältnis bleibt,
 * kleinere Bilder werden nie vergrößert.
 * @param {number} width
 * @param {number} height
 * @param {number} [max]
 * @returns {{ width: number, height: number }}
 */
export function fitWithin(width, height, max = PHOTO_MAX_EDGE) {
  const longest = Math.max(width, height);
  if (!(longest > max)) return { width, height };
  const scale = max / longest;
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/**
 * Server-`details` ({ feld: [meldung, …] }) in bekannte Formularfelder und
 * "Rest" (z. B. open_recipes, recipe) trennen.
 * @param {Record<string, string[]> | undefined | null} details
 * @returns {{ fields: Record<string, string[]>, rest: string[] }}
 */
export function splitFieldErrors(details) {
  /** @type {Record<string, string[]>} */
  const fields = {};
  /** @type {string[]} */
  const rest = [];
  for (const [key, messages] of Object.entries(details ?? {})) {
    const list = Array.isArray(messages) ? messages.map(String) : [];
    if (key === "meal_type") fields[key] = [MEAL_TYPE_MESSAGE]; // Servertext nennt die englischen Schlüssel
    else if (FIELD_ORDER.includes(key)) fields[key] = list;
    else rest.push(...list);
  }
  return { fields, rest };
}

/**
 * Freundlicher Text für das 409-Limit offener Rezepte, sonst null.
 * @param {Record<string, string[]> | undefined | null} details
 * @returns {string | null}
 */
export function openRecipesMessage(details) {
  return details && Array.isArray(details.open_recipes) && details.open_recipes.length > 0
    ? "Du hast schon 5 offene Rezepte. Warte auf die Entscheidung zu einem davon, bevor du ein weiteres einreichst."
    : null;
}
