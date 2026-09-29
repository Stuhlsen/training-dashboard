/* ============================================================
   CORE/NUTRITION-TAXONOMY.JS — EU-Allergen-Taxonomie (kein I/O)
   (Fahrplan 23, Etappe E0, Entscheidungen E20/E21)

   Einzige, gemeinsam genutzte Quelle der Wahrheit für beide
   DB-Spalten profiles.intolerances UND recipes.contains_tags.

   Diese Taxonomie ist INTENTIONALLY NICHT zur Laufzeit erweiterbar
   (E20: feste Liste der 14 EU-Hauptallergene + ein catch-all).
   Keys sind stabile, ascii-kompatible Machine-Keys für die DB;
   Labels sind Deutsch (Repo-Konvention). Das UI bezieht Labels
   ausschließlich aus dieser Konstante (keine zweite Übersetzung).

   `sonstiges` ist ein Marker für "anderes, nicht in der Liste" —
   der freie Text wird in der App-State (nicht hier) verwaltet.
   ============================================================ */

/** @type {Readonly<{key: string, label: string, isFreetext?: true}>} */
// Jeder Eintrag: Machine-Key (ascii, lowercase) + deutsches Label.
const ENTRIES = [
  { key: "gluten",        label: "Gluten" },
  { key: "crustaceans",   label: "Krebstiere" },
  { key: "eggs",          label: "Eier" },
  { key: "fish",          label: "Fisch" },
  { key: "peanuts",       label: "Erdnüsse" },
  { key: "soybeans",      label: "Soja" },
  { key: "milk",          label: "Milch/Laktose" },
  { key: "nuts",          label: "Schalenfrüchte" },
  { key: "celery",        label: "Sellerie" },
  { key: "mustard",       label: "Senf" },
  { key: "sesame",        label: "Sesam" },
  { key: "sulphites",     label: "Sulfite/Schwefeldioxid" },
  { key: "lupin",         label: "Lupinen" },
  { key: "molluscs",      label: "Weichtiere" },
  { key: "sonstiges",     label: "Sonstiges", isFreetext: true },
];

/** Gefrorener Array — einmal importiert, nie verändert.
 *  @type {ReadonlyArray<Readonly<{key:string,label:string,isFreetext?:true}>>} */
export const ALLERGEN_TAXONOMY = Object.freeze(
  ENTRIES.map((e) => Object.freeze({ ...e }))
);

/** Nur die Machine-Keys (für Set-Prüfungen, DB-Vergleiche).
 *  @type {ReadonlySet<string>} */
export const ALLERGEN_KEYS = Object.freeze(
  new Set(ALLERGEN_TAXONOMY.map((e) => e.key))
);

/** Key des Freitext-Markers.
 *  @type {string} */
export const ALLERGEN_FREETEXT_KEY = "sonstiges";

/** Lookup: Machine-Key → deutsches Label. Unbekannte Keys geben undefined.
 *  @type {ReadonlyMap<string, string>} */
export const ALLERGEN_LABEL_MAP = Object.freeze(
  new Map(ALLERGEN_TAXONOMY.map((e) => [e.key, e.label]))
);

/** Prüft, ob ein Key Teil der gültigen Taxonomie ist.
 *  @param {string} key
 *  @returns {boolean} */
export function isValidAllergenKey(key) {
  return ALLERGEN_KEYS.has(key);
}

/** Gibt das deutsche Label für einen Key zurück (oder den Key selbst bei
 *  unbekannten Werten — sanfte Degradation für hand-edited DB-Zeilen).
 *  @param {string} key
 *  @returns {string} */
export function allergenLabel(key) {
  return ALLERGEN_LABEL_MAP.get(key) ?? key;
}

/** Filtert ein Array auf gültige Keys + entfernt Duplikate.
 *  Unbekannte Werte werden still ignoriert (DB-seitig kein CHECK-Constraint).
 *  @param {string[]} keys
 *  @returns {string[]} */
export function normalizeAllergenKeys(keys) {
  if (!Array.isArray(keys)) return [];
  const seen = new Set();
  const result = [];
  for (const k of keys) {
    if (isValidAllergenKey(k) && !seen.has(k)) {
      seen.add(k);
      result.push(k);
    }
  }
  return result;
}