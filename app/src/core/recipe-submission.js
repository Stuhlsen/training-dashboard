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
export const FIELD_ORDER = ["title", "meal_type", "servings", "prep_minutes", "ingredients", "instructions", "image_url"];

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
 * "25" / " 25 " → ganze Minuten; alles andere (leer, Text, Komma, ≤ 0) → null.
 * @param {string} text
 * @returns {number | null}
 */
export function parseMinutes(text) {
  const cleaned = String(text ?? "").trim();
  if (!/^\d+$/.test(cleaned)) return null;
  const n = Number(cleaned);
  return n > 0 ? n : null;
}

/**
 * @typedef {{ name: string, amount: string, unit: string }} IngredientDraft
 * @typedef {{ text: string, timerMinutes: string }} StepDraft
 * @typedef {{
 *   title: string, servings: string, prepMinutes: string, mealTypes: string[],
 *   ingredients: IngredientDraft[], steps: StepDraft[]
 * }} SubmissionDraft
 */

/**
 * Formularstand → Body für preview/POST/PUT. Unlesbare Mengen und Zeiten gehen als 0
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
    prep_minutes: parseMinutes(draft.prepMinutes) ?? 0,
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
 * Zahl → Eingabetext mit Komma ("80,5"); höchstens zwei Nachkommastellen.
 * @param {number} n
 * @returns {string}
 */
export function formatAmount(n) {
  return String(Math.round(n * 100) / 100).replace(".", ",");
}

/**
 * Gespeichertes Rezept → Formularstand fürs Bearbeiten. Umkehrung von
 * buildSubmissionBody (Menge als Text, Timer in Minuten).
 * @param {{ title?: string, servings?: number, prepMinutes?: number | null, mealType?: string[] | null,
 *   ingredients?: { name: string, amount: number, unit: string }[] | null,
 *   instructions?: { text: string, timerSeconds?: number }[] | null }} recipe
 * @returns {SubmissionDraft}
 */
export function draftFromRecipe(recipe) {
  const steps = (recipe.instructions ?? []).map((s) => ({
    text: s.text,
    timerMinutes: s.timerSeconds ? formatAmount(s.timerSeconds / 60) : "",
  }));
  return {
    title: recipe.title ?? "",
    servings: formatAmount(recipe.servings ?? 1),
    prepMinutes: recipe.prepMinutes ? String(recipe.prepMinutes) : "",
    mealTypes: [...(recipe.mealType ?? [])],
    ingredients: (recipe.ingredients ?? []).map((i) => ({ name: i.name, amount: formatAmount(i.amount), unit: i.unit })),
    steps: steps.length > 0 ? steps : [{ text: "", timerMinutes: "" }],
  };
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
