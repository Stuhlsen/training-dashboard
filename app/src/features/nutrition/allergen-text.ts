/* Texte der Allergen-Zeile (Fahrplan 23, E10) — getrennt von der Komponente
   (react-refresh/only-export-components). */

import { allergenLabel, normalizeAllergenKeys } from "../../core/nutrition-taxonomy.js";

export const ALLERGEN_NOTE =
  "Orientierung auf Basis der eingetragenen Zutaten, kein Ersatz für eigene Sorgfalt bei echten Allergien.";

export function allergenText(tags: readonly string[] | null | undefined): string {
  const keys = normalizeAllergenKeys(tags ? [...tags] : []);
  return keys.length > 0 ? `Enthält: ${keys.map(allergenLabel).join(", ")}` : "Keine Allergene hinterlegt";
}
