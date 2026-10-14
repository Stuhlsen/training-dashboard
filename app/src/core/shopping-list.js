/* ============================================================
   CORE/SHOPPING-LIST.JS — Einkaufsliste aus dem Essensplan (kein I/O)
   (Fahrplan 23, E8)

   aggregateShoppingList → Zutaten der geplanten Rezepte, summiert und
                           nach Kategorie gruppiert
   formatShoppingAmount  → Menge mit deutschem Dezimalkomma

   Regeln:
   - Faktor = gegessene Portionen (Plan-Eintrag) ÷ Rezept-Portionen; die
     Mengen im Rezept gelten für recipe.servings Portionen.
   - Zeilenschlüssel = Kategorie + Zutatname; Mengen werden je Einheit
     summiert. Vergleich exakt, nur ohne Groß-/Kleinschreibung und ohne
     Randleerzeichen — KEINE unscharfe Zusammenführung ("Beeren" und
     "Beeren (tiefgekühlt)" bleiben getrennt).
   - Gleitkomma: erst über alle Einträge summieren, erst am Ende runden.
     g und ml ganzzahlig, alle anderen Einheiten auf 0,5. Eine Menge
     über 0 wird nie auf 0 gerundet (mindestens 1 bzw. 0,5).
   ============================================================ */

/** Marktreihenfolge der Kategorien — eigene Wahl (Fahrplan 23, E8), kein Standard.
 *  Der Vorrat steht bewusst zuletzt. */
export const CATEGORY_ORDER = Object.freeze([
  "Obst & Gemüse",
  "Fleisch & Fisch",
  "Milchprodukte",
  "Eier",
  "Getreide & Backwaren",
  "Hülsenfrüchte & Konserven",
  "Nüsse & Samen",
]);

/** Kategorie, die in der Oberfläche eingeklappt ("Vorrat prüfen") erscheint. */
export const PANTRY_CATEGORY = "Öle, Gewürze & Vorrat";

/** Einheiten, die ganzzahlig gerundet werden. */
const WHOLE_UNITS = new Set(["g", "ml"]);

/** Toleranz gegen Gleitkomma-Rauschen vor dem Runden (z. B. 2,4999999999). */
const EPSILON = 1e-9;

const norm = (s) => String(s ?? "").trim().toLowerCase();

/** Rundet eine Menge je Einheit; positive Mengen werden nie zu 0. */
export function roundAmount(amount, unit) {
  if (WHOLE_UNITS.has(norm(unit))) {
    return Math.max(1, Math.round(amount + EPSILON));
  }
  return Math.max(0.5, Math.round(amount * 2 + EPSILON) / 2);
}

/** Menge mit deutschem Dezimalkomma ("1,5"), ganze Zahlen ohne Komma. */
export function formatShoppingAmount(amount) {
  return String(amount).replace(".", ",");
}

/** Sortierplatz einer Kategorie: bekannte nach Marktreihenfolge, unbekannte
 *  dahinter (alphabetisch), der Vorrat ganz am Ende. */
function categoryRank(category) {
  if (norm(category) === norm(PANTRY_CATEGORY)) return Number.MAX_SAFE_INTEGER;
  const known = CATEGORY_ORDER.findIndex((c) => norm(c) === norm(category));
  return known >= 0 ? known : CATEGORY_ORDER.length;
}

/**
 * @typedef {{ unit: string, amount: number }} ShoppingAmount
 * @typedef {{ key: string, name: string, amounts: ShoppingAmount[], rezepte: string[] }} ShoppingRow
 * @typedef {{ category: string, isPantry: boolean, rows: ShoppingRow[] }} ShoppingGroup
 * @typedef {{ groups: ShoppingGroup[], missingIngredients: string[] }} ShoppingList
 */

/**
 * @param {{
 *   entries: ReadonlyArray<{ date: string, recipeId: string, servings: number }>,
 *   recipes: ReadonlyArray<{ id: string, title: string, servings: number,
 *     ingredients: ReadonlyArray<{ name: string, amount: number, unit: string, category: string }> | null }>,
 *   excludedDates?: ReadonlyArray<string>,
 * }} params
 * @returns {ShoppingList}
 */
export function aggregateShoppingList({ entries, recipes, excludedDates = [] }) {
  const excluded = new Set(excludedDates);
  const recipesById = new Map(recipes.map((r) => [r.id, r]));

  /** @type {Map<string, { category: string, name: string, units: Map<string, { unit: string, raw: number }>, titles: Set<string> }>} */
  const rowsByKey = new Map();
  const missing = new Set();

  for (const entry of entries) {
    if (excluded.has(entry.date)) continue;
    const recipe = recipesById.get(entry.recipeId);
    if (!recipe) continue; // Rezept nicht (mehr) im Pool — nichts zu listen

    const lines = recipe.ingredients;
    if (!lines || lines.length === 0) {
      missing.add(recipe.title);
      continue;
    }

    const factor = entry.servings / recipe.servings;
    if (!Number.isFinite(factor) || factor <= 0) continue;

    for (const line of lines) {
      const name = String(line.name ?? "").trim();
      const scaled = line.amount * factor;
      if (!name || !Number.isFinite(scaled) || scaled <= 0) continue;

      const category = String(line.category ?? "").trim();
      const rowKey = `${norm(category)}|${norm(name)}`;
      let row = rowsByKey.get(rowKey);
      if (!row) {
        row = { category, name, units: new Map(), titles: new Set() };
        rowsByKey.set(rowKey, row);
      }
      const unitKey = norm(line.unit);
      const slot = row.units.get(unitKey) ?? { unit: String(line.unit ?? "").trim(), raw: 0 };
      slot.raw += scaled;
      row.units.set(unitKey, slot);
      row.titles.add(recipe.title);
    }
  }

  /** @type {Map<string, ShoppingGroup>} */
  const groupsByCategory = new Map();
  for (const [rowKey, row] of rowsByKey) {
    const amounts = [...row.units.values()]
      .sort((a, b) => a.unit.localeCompare(b.unit, "de"))
      .map(({ unit, raw }) => ({ unit, amount: roundAmount(raw, unit) }));
    const unitsKey = [...row.units.keys()].sort().join("+");

    const catKey = norm(row.category);
    let group = groupsByCategory.get(catKey);
    if (!group) {
      group = { category: row.category, isPantry: catKey === norm(PANTRY_CATEGORY), rows: [] };
      groupsByCategory.set(catKey, group);
    }
    group.rows.push({
      key: `${rowKey}|${unitsKey}`,
      name: row.name,
      amounts,
      rezepte: [...row.titles].sort((a, b) => a.localeCompare(b, "de")),
    });
  }

  const groups = [...groupsByCategory.values()].sort(
    (a, b) => categoryRank(a.category) - categoryRank(b.category) || a.category.localeCompare(b.category, "de"),
  );
  for (const group of groups) group.rows.sort((a, b) => a.name.localeCompare(b.name, "de"));

  return {
    groups,
    missingIngredients: [...missing].sort((a, b) => a.localeCompare(b, "de")),
  };
}
