/* ============================================================
   CORE/GOALS.JS — Ziel-Katalog und Zuordnung Ziel → Plan/Ernährung

   Reine Berechnung (kein I/O). Fahrplan 43, Verträge V2 und V3.
   Liefert nur Daten: was ein Ziel am Plan und an der Ernährung ändern
   WÜRDE. Angewendet wird das später (Plan-Generator, Ernährung) — hier nicht.

   Beleglage: `planning/recherche/ziele-belege.md`. Alles, was dort nicht
   gedeckt ist, steht unten als „eigene Festlegung".

   Profil-Konvention: `null` heißt „offen, keine Wirkung". Das Hauptziel
   gewinnt; das Nebenziel füllt nur, was das Hauptziel offen lässt.
   ============================================================ */

/** Schlüssel MÜSSEN dem Check in supabase/migrations/0084_goals_catalog_fields.sql
 *  entsprechen (Test liest die SQL-Datei).
 *  @typedef {"ausdauer"|"ftp"|"fett_verlieren"|"bergauf"|"muskeln_kraft"|"event"|"laufen_starten"|"fit_bleiben"|"wiedereinstieg"|"sonstiges"} GoalKey */

/**
 * @typedef {Object} GoalCatalogEntry
 * @property {GoalKey} key
 * @property {string} label
 * @property {readonly ("ride"|"run"|"swim")[]} sports
 * @property {boolean} hasTargetValue
 * @property {"ready"|"needsStrength"} availability
 */

/** @type {readonly GoalCatalogEntry[]} */
export const GOAL_CATALOG = Object.freeze([
  { key: "ausdauer", label: "Ausdauer", sports: ["ride", "run", "swim"], hasTargetValue: false, availability: "ready" },
  { key: "ftp", label: "FTP steigern", sports: ["ride"], hasTargetValue: true, availability: "ready" },
  { key: "fett_verlieren", label: "Fett verlieren", sports: ["ride", "run", "swim"], hasTargetValue: true, availability: "ready" },
  { key: "bergauf", label: "Besser bergauf", sports: ["ride", "run"], hasTargetValue: false, availability: "ready" },
  { key: "muskeln_kraft", label: "Muskeln / Kraft", sports: ["ride", "run", "swim"], hasTargetValue: false, availability: "needsStrength" },
  { key: "event", label: "Event", sports: ["ride", "run", "swim"], hasTargetValue: false, availability: "ready" },
  { key: "laufen_starten", label: "Laufen starten", sports: ["run"], hasTargetValue: false, availability: "ready" },
  { key: "fit_bleiben", label: "Fit bleiben", sports: ["ride", "run", "swim"], hasTargetValue: false, availability: "ready" },
  { key: "wiedereinstieg", label: "Wiedereinstieg", sports: ["ride", "run", "swim"], hasTargetValue: false, availability: "ready" },
  // Z9: nur eine Notiz, ohne Wirkung auf Plan und Ernährung.
  { key: "sonstiges", label: "Sonstiges", sports: ["ride", "run", "swim"], hasTargetValue: false, availability: "ready" },
]);

/** @type {readonly GoalKey[]} */
export const GOAL_KEYS = Object.freeze(GOAL_CATALOG.map((e) => e.key));

/* Eigene Festlegung (nicht belegt für Ausdauersport, s. ziele-belege.md §2.4):
   Wochen-Obergrenze des Gewichtsverlusts in % Körpergewicht. */
export const MAX_WEEKLY_LOSS_PCT = 0.5;

/* Eigene Festlegung (Richtung gestützt, Gramm sind Entscheidung, §3.4):
   Eiweiß in g pro kg Körpergewicht und Tag. */
export const PROTEIN_G_PER_KG = Object.freeze({
  fett_verlieren: Object.freeze({ min: 1.8, max: 2.2 }),
  muskeln_kraft: Object.freeze({ min: 1.6, max: 2.0 }),
});

/**
 * @typedef {Object} GoalPlanProfile
 * @property {"allgemein"|"berg"|"langstrecke"|"crit"|null} focus
 * @property {"einsteiger"|"fortgeschritten"|null} level
 * @property {"flach"|"sanft"|null} ramp
 * @property {boolean|null} moreEasyVolume    mehr lockerer Umfang (eigene Festlegung)
 * @property {"schwelle-vo2max"|null} intensityFocus
 * @property {"ergaenzung"|null} sweetSpot    nur als Ergänzung, ohne Wirkungsversprechen
 * @property {boolean|null} keepHardStimuli
 * @property {boolean|null} eventMode         heutiger Event-Modus mit Taper (eigene Festlegung)
 * @property {boolean|null} lowStartVolume    niedriger Startumfang (eigene Festlegung)
 */

/**
 * Gruppen (Energie, Eiweiß, Kohlenhydrate) werden als Ganzes übernommen,
 * damit kein Nebenziel einzelne Felder in ein fremdes Energie-Ziel schiebt.
 * @typedef {Object} GoalNutritionProfile
 * @property {{mode:"lose"|"maintain", maxWeeklyLossPct?:number, noDeficitBeforeHardDays?:boolean, smallDeficitOk?:boolean}|null} energy
 * @property {{min:number, max:number}|null} protein
 * @property {{followLoad?:boolean, trainLow?:boolean, hardDaysFueled?:boolean}|null} carbs
 * @property {boolean|null} raceDayFueling    Renntag-Verpflegung (eigene Festlegung)
 */

const PLAN_KEYS = ["focus", "level", "ramp", "moreEasyVolume", "intensityFocus", "sweetSpot", "keepHardStimuli", "eventMode", "lowStartVolume"];
const NUTRITION_KEYS = ["energy", "protein", "carbs", "raceDayFueling"];

/** @type {Record<string, Partial<GoalPlanProfile>>} */
const PLAN_BY_GOAL = {
  ausdauer: { focus: "langstrecke", moreEasyVolume: true },
  ftp: { focus: "allgemein", intensityFocus: "schwelle-vo2max", sweetSpot: "ergaenzung" },
  fett_verlieren: { keepHardStimuli: true, ramp: "flach" },
  bergauf: { focus: "berg" },
  // muskeln_kraft: bewusst keine Änderung bis zum Kraftbereich.
  event: { eventMode: true },
  laufen_starten: { level: "einsteiger", ramp: "sanft", lowStartVolume: true },
  fit_bleiben: { focus: "allgemein" },
  wiedereinstieg: { ramp: "flach" },
};

/** @type {Record<string, Partial<GoalNutritionProfile>>} */
const NUTRITION_BY_GOAL = {
  // Kein Train-low: kein Leistungsvorteil belegt (Prieto-Bellver 2024).
  ausdauer: { carbs: { followLoad: true, trainLow: false } },
  ftp: { energy: { mode: "maintain" }, carbs: { hardDaysFueled: true } },
  fett_verlieren: {
    energy: { mode: "lose", maxWeeklyLossPct: MAX_WEEKLY_LOSS_PCT, noDeficitBeforeHardDays: true },
    protein: PROTEIN_G_PER_KG.fett_verlieren,
  },
  bergauf: { energy: { mode: "maintain", smallDeficitOk: true } },
  // „Leichter Überschuss" ist unbelegt und entfällt.
  muskeln_kraft: { energy: { mode: "maintain" }, protein: PROTEIN_G_PER_KG.muskeln_kraft },
  event: { raceDayFueling: true },
  fit_bleiben: { energy: { mode: "maintain" } },
  wiedereinstieg: { energy: { mode: "maintain" } },
};

/** @param {readonly string[]} keys @param {Record<string, any>} table
 *  @param {{goalKey?: string}|null|undefined} goal */
function profileOf(keys, table, goal) {
  const key = goal && typeof goal.goalKey === "string" ? goal.goalKey : null;
  const src = key && Object.hasOwn(table, key) ? table[key] : {};
  return Object.fromEntries(keys.map((k) => [k, src[k] ?? null]));
}

/** Hauptziel gewinnt; Nebenziel füllt nur offene (null) Felder. Liefert tiefe Kopien. */
function merge(keys, table, main, side) {
  const m = profileOf(keys, table, main);
  const s = profileOf(keys, table, side);
  // JSON-Kopie statt structuredClone: ESLint kennt das Global nicht; alles hier ist reine Daten.
  return JSON.parse(JSON.stringify(Object.fromEntries(keys.map((k) => [k, m[k] ?? s[k]]))));
}

/** @param {{goalKey?: string}|null} [main] @param {{goalKey?: string}|null} [side] @returns {GoalPlanProfile} */
export function goalPlanProfile(main, side) {
  return merge(PLAN_KEYS, PLAN_BY_GOAL, main, side);
}

/** @param {{goalKey?: string}|null} [main] @param {{goalKey?: string}|null} [side] @returns {GoalNutritionProfile} */
export function goalNutritionProfile(main, side) {
  return merge(NUTRITION_KEYS, NUTRITION_BY_GOAL, main, side);
}

/* Eigene Festlegung (keine Quelle): welche Paare einen Hinweis bekommen.
   Nur Hinweise, nie Sperren (Nicht-Ziel „Kein Sperren von Zielen").
   Schlüssel = beide Ziel-Schlüssel alphabetisch sortiert, mit "+" verbunden. */
const CONFLICT_HINTS = {
  "fett_verlieren+muskeln_kraft":
    "Fett verlieren und Muskelaufbau ziehen in unterschiedliche Richtungen: Ein Defizit macht den Aufbau schwerer. Beides gleichzeitig kann langsamer gehen als eines nach dem anderen.",
  "fett_verlieren+ftp":
    "Ein Defizit kann harte Einheiten schwerer machen. Wenn dein FTP-Ziel wichtig ist, lohnt sich ein kleiner Abstand zwischen Defizit und harten Tagen.",
  "event+fett_verlieren":
    "Vor einem Event kann ein Defizit die Leistung beeinflussen. Du könntest das Abnehmen auf die Zeit davor oder danach legen.",
};

/**
 * @param {{goalKey?: string}|null} [main] @param {{goalKey?: string}|null} [side]
 * @returns {{level: "none"|"hint", text: string}}
 */
export function goalConflicts(main, side) {
  const a = main?.goalKey;
  const b = side?.goalKey;
  if (!a || !b || a === b) return { level: "none", text: "" };
  const text = CONFLICT_HINTS[[a, b].sort().join("+")];
  return text ? { level: "hint", text } : { level: "none", text: "" };
}
