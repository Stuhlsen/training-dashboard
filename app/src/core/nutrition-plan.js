/* ============================================================
   CORE/NUTRITION-PLAN.JS — Tageszusammenstellung (kein I/O)
   (Fahrplan 23, E6 PR B; Entscheidungen E19, E31, E32)

   composeDay      → Vorschlag je Slot für einen Tag
   swapCandidates  → 2–3 Alternativen für einen Slot
   dayAmpel        → rot/gelb/grün aus Tagessumme, Ziel und RED-S-Boden

   Ziel (E31): die SUMME der vier Mahlzeiten passt zum Tagesziel. Keine
   festen Prozent-Anteile je Mahlzeit. Eiweiß je Hauptmahlzeit
   (Frühstück, Mittag, Abend; der Snack nicht) liegt BEVORZUGT bei
   max(0,25 g/kg; 20 g) bis 40 g (ISSN 2017): der untere Rand ist ein
   weicher Strafterm (nur 47 % der Frühstücke erreichen 20 g), die
   Obergrenze 40 g ist hart.

   Suchansatz (Rechenzeit < 50 ms bei ~60 Rezepten):
   1. Optionen je Slot = Rezept × Portion (0,5er-Schritte), Optionen über
      der Eiweiß-Obergrenze fallen weg.
   2. Vorauswahl je Slot: höchstens zwei Portionen je Rezept (die
      besten nach Einzel-Score; Richtwert Ziel/4 ist nur Sortierhilfe,
      keine Vorgabe), davon die PRESELECT_PER_SLOT besten.
   3. Kombination über die vier Slots: höchstens 6⁴ = 1296 Tupel, bewertet
      mit dem Gesamt-Score. Nie alle Portionen aller Rezepte über vier
      Slots.

   Deterministisch: gleiche Eingabe → gleiches Ergebnis. Die Rotation über
   die Tage kommt aus einem kleinen, vom Datum abhängigen Hash-Term plus
   einer Strafe für Rezepte der letzten zwei Tage (`planned`).
   ============================================================ */

import { filterByIntolerances } from "./nutrition.js";

/** Reihenfolge der Slots am Tag. */
export const MEAL_SLOTS = Object.freeze(["breakfast", "lunch", "dinner", "snack"]);

/** Hauptmahlzeiten — nur für sie gilt der Eiweißbereich. */
const MAIN_SLOTS = new Set(["breakfast", "lunch", "dinner"]);

/** Portionen in 0,5er-Schritten von 0,5 bis 2. Oberflächen-Grenze, kein Literaturwert. */
export const PORTION_STEPS = Object.freeze([0.5, 1, 1.5, 2]);

/** 10 Prozent: Genauigkeit der Grundumsatz-Rechnung bei Sportlern (O'Neill 2023); keine medizinische Schwelle. */
export const AMPEL_GREEN_BAND = 0.1;

/** Eiweiß je Hauptmahlzeit (ISSN 2017): Untergrenze max(0,25 g/kg; 20 g), Obergrenze 40 g. */
const PROTEIN_MIN_PER_KG = 0.25;
const PROTEIN_MIN_FLOOR_G = 20;
export const PROTEIN_MAX_G = 40;

/* Heuristik-Gewichte der Suche (Oberflächen-Wahl, keine Literaturwerte): alles in "kcal-Äquivalenten". */
const PROTEIN_SHORTFALL_KCAL_PER_G = 10;
const RECENT_RECIPE_PENALTY_KCAL = 60;
/** Weiche Strafe, wenn ein Rezept am selben Tag mehrfach vorkommt (Abwechslung). Bewusst KEIN Verbot:
 *  einmal kochen, zweimal essen spart Zeit und Einkauf (Meal-Prep). Etwa 6 % eines 2400-kcal-Tages, also
 *  deutlich unter dem grünen Band (10 %): eine Wiederholung gewinnt nur, wenn sie das Ziel klar besser trifft. */
const SAME_DAY_REPEAT_PENALTY_KCAL = 150;
const ROTATION_JITTER_KCAL = 25;
const PRESELECT_PER_SLOT = 6;
const MAX_PORTIONS_PER_RECIPE = 2;
const MAX_SWAPS = 3;

/**
 * @typedef {"breakfast"|"lunch"|"dinner"|"snack"} Slot
 * @typedef {{recipeId:string, servings:number}} Choice
 * @typedef {{kcal:number, protein:number, carbs:number, fat:number}} Totals
 * @typedef {"red"|"yellow"|"green"} Ampel
 */

const isNum = (n) => typeof n === "number" && Number.isFinite(n);

/**
 * Ampel nach E32 (vereinfacht): rot NUR unter dem RED-S-Boden (immer);
 * grün bei höchstens 10 % Abweichung vom Ziel; alles andere gelb.
 * @param {number} totalKcal
 * @param {number} target
 * @param {number} floor
 * @returns {Ampel}
 */
export function dayAmpel(totalKcal, target, floor) {
  if (isNum(floor) && totalKcal < floor) return "red";
  if (isNum(target) && target > 0 && Math.abs(totalKcal - target) <= target * AMPEL_GREEN_BAND) return "green";
  return "yellow";
}

/** Untergrenze Eiweiß je Hauptmahlzeit in g. */
export function proteinMinFor(weightKg) {
  return Math.max(isNum(weightKg) && weightKg > 0 ? PROTEIN_MIN_PER_KG * weightKg : 0, PROTEIN_MIN_FLOOR_G);
}

function hasNutrition(recipe) {
  const n = recipe?.nutrition;
  return !!n && isNum(n.kcal) && n.kcal > 0 && isNum(n.protein) && isNum(n.carbs) && isNum(n.fat);
}

/** Genehmigt, mit Nährwerten und bestanden durch den harten Intoleranz-Filter (E19). */
function eligibleRecipes(recipes, intolerances) {
  const usable = (Array.isArray(recipes) ? recipes : []).filter(
    (r) => r && (r.status == null || r.status === "approved") && hasNutrition(r) && Array.isArray(r.mealType),
  );
  return filterByIntolerances(usable, intolerances);
}

/** Kleiner, deterministischer Hash (0..1) aus Text — für die Datums-Rotation. */
function hash01(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 1000) / 1000;
}

function scaled(n, servings) {
  return {
    kcal: n.kcal * servings,
    protein: n.protein * servings,
    carbs: n.carbs * servings,
    fat: n.fat * servings,
  };
}

function sumTotals(options) {
  const t = { kcal: 0, protein: 0, carbs: 0, fat: 0 };
  for (const o of options) {
    if (!o) continue;
    t.kcal += o.nutrition.kcal;
    t.protein += o.nutrition.protein;
    t.carbs += o.nutrition.carbs;
    t.fat += o.nutrition.fat;
  }
  return {
    kcal: Math.round(t.kcal),
    protein: Math.round(t.protein * 10) / 10,
    carbs: Math.round(t.carbs * 10) / 10,
    fat: Math.round(t.fat * 10) / 10,
  };
}

/** Strafe (kcal-Äquivalente) für Eiweiß unter dem Bereich einer Hauptmahlzeit — weich. */
function proteinPenalty(slot, protein, proteinMin) {
  if (!MAIN_SLOTS.has(slot) || protein >= proteinMin) return 0;
  return (proteinMin - protein) * PROTEIN_SHORTFALL_KCAL_PER_G;
}

/** Strafe für ein Rezept der letzten zwei Tage, plus Datums-Rotation. */
function rotationPenalty(option, dateISO, recent) {
  return (
    (recent.has(option.recipeId) ? RECENT_RECIPE_PENALTY_KCAL : 0) +
    hash01(`${dateISO}|${option.recipeId}|${option.servings}`) * ROTATION_JITTER_KCAL
  );
}

/** Alle Optionen (Rezept × Portion) eines Slots; Eiweiß-Obergrenze ist hart. */
function slotOptions(slot, pool) {
  const options = [];
  for (const recipe of pool) {
    if (!recipe.mealType.includes(slot)) continue;
    for (const servings of PORTION_STEPS) {
      const nutrition = scaled(recipe.nutrition, servings);
      if (MAIN_SLOTS.has(slot) && nutrition.protein > PROTEIN_MAX_G) continue;
      options.push({ recipeId: recipe.id, servings, nutrition });
    }
  }
  return options;
}

/** Stabile Reihenfolge, damit gleiche Scores deterministisch entschieden werden. */
function byScoreThenId(a, b) {
  if (a.score !== b.score) return a.score - b.score;
  if (a.option.recipeId !== b.option.recipeId) return a.option.recipeId < b.option.recipeId ? -1 : 1;
  return a.option.servings - b.option.servings;
}

/** Vorauswahl je Slot (Schritt 2 im Kopfkommentar). */
function preselect(slot, options, ctx) {
  const reference = ctx.target / MEAL_SLOTS.length; // nur Sortierhilfe
  const scored = options
    .map((option) => ({
      option,
      score:
        Math.abs(option.nutrition.kcal - reference) +
        proteinPenalty(slot, option.nutrition.protein, ctx.proteinMin) +
        rotationPenalty(option, ctx.dateISO, ctx.recent),
    }))
    .sort(byScoreThenId);

  const perRecipe = new Map();
  const kept = [];
  for (const entry of scored) {
    const count = perRecipe.get(entry.option.recipeId) ?? 0;
    if (count >= MAX_PORTIONS_PER_RECIPE) continue;
    perRecipe.set(entry.option.recipeId, count + 1);
    kept.push(entry.option);
    if (kept.length >= PRESELECT_PER_SLOT) break;
  }
  return kept;
}

/** Gesamt-Score eines Tages (kleiner = besser); `chosen` folgt der Reihenfolge von MEAL_SLOTS. */
function dayScore(chosen, ctx) {
  let score = Math.abs(sumTotals(chosen).kcal - ctx.target);
  const seen = new Set();
  MEAL_SLOTS.forEach((slot, i) => {
    const o = chosen[i];
    if (!o) return;
    score += proteinPenalty(slot, o.nutrition.protein, ctx.proteinMin) + rotationPenalty(o, ctx.dateISO, ctx.recent);
    if (seen.has(o.recipeId)) score += SAME_DAY_REPEAT_PENALTY_KCAL;
    seen.add(o.recipeId);
  });
  return score;
}

function makeContext({ recipes, intolerances, target, weightKg, dateISO, planned }) {
  return {
    pool: eligibleRecipes(recipes, intolerances),
    target: isNum(target) && target > 0 ? target : 0,
    proteinMin: proteinMinFor(weightKg),
    dateISO: String(dateISO ?? ""),
    recent: new Set(Array.isArray(planned) ? planned : []),
  };
}

/** Bester Tupel über die Vorauswahl-Listen; Slots ohne Option bleiben `null`. */
function searchBest(lists, ctx) {
  const choices = lists.map((l) => (l.length > 0 ? l : [null]));
  let best = null;
  let bestScore = Infinity;
  const chosen = new Array(choices.length);

  const walk = (i) => {
    if (i === choices.length) {
      const score = dayScore(chosen, ctx);
      if (score < bestScore) {
        bestScore = score;
        best = chosen.slice();
      }
      return;
    }
    for (const option of choices[i]) {
      chosen[i] = option;
      walk(i + 1);
    }
  };
  walk(0);
  return best ?? new Array(choices.length).fill(null);
}

function describeDay(chosen, ctx, params, poolBySlot) {
  const totals = sumTotals(chosen);
  const slots = {};
  const proteinLow = [];
  const noMatch = [];
  MEAL_SLOTS.forEach((slot, i) => {
    const o = chosen[i];
    slots[slot] = o ? { recipeId: o.recipeId, servings: o.servings } : null;
    if (!o) noMatch.push(slot);
    else if (MAIN_SLOTS.has(slot) && o.nutrition.protein < ctx.proteinMin) proteinLow.push(slot);
  });
  const ampel = dayAmpel(totals.kcal, params.target, params.floor);
  return {
    slots,
    totals,
    ampel,
    flags: {
      proteinLow,
      noMatch,
      poolSize: poolBySlot,
      // beste Kombination des Pools liegt trotzdem außerhalb des grünen Bands
      targetUnreachable: ampel !== "green" && noMatch.length < MEAL_SLOTS.length,
    },
  };
}

/**
 * Tagesvorschlag: je Slot ein Rezept samt Portion, Summen, Ampel und Markierungen.
 *
 * @param {{recipes:Array<object>, intolerances?:string[], target:number, floor:number,
 *          weightKg?:number, dateISO:string, planned?:string[]}} params
 *   `planned`: Rezept-IDs der vorherigen zwei Tage (Rotation).
 * @returns {{slots:Record<Slot,Choice|null>, totals:Totals, ampel:Ampel,
 *            flags:{proteinLow:Slot[], noMatch:Slot[], poolSize:Record<Slot,number>, targetUnreachable:boolean}}}
 */
export function composeDay(params) {
  const ctx = makeContext(params);
  const lists = [];
  const poolBySlot = {};
  for (const slot of MEAL_SLOTS) {
    poolBySlot[slot] = ctx.pool.filter((r) => r.mealType.includes(slot)).length;
    lists.push(preselect(slot, slotOptions(slot, ctx.pool), ctx));
  }
  return describeDay(searchBest(lists, ctx), ctx, params, poolBySlot);
}

/**
 * Bis zu drei Alternativen für einen Slot; der Rest des Tages bleibt wie in `current`.
 *
 * @param {Parameters<typeof composeDay>[0] & {slot:Slot, current:Partial<Record<Slot,Choice|null>>}} params
 * @returns {Array<Choice & {totals:Totals, ampel:Ampel, repeat:boolean}>}
 *   `repeat`: das Rezept steht am selben Tag schon in einer anderen Mahlzeit (bewusste Wiederholung, Meal-Prep).
 */
export function swapCandidates(params) {
  const { slot, current } = params;
  const slotIndex = MEAL_SLOTS.indexOf(slot);
  if (slotIndex < 0) return [];
  const ctx = makeContext(params);
  const byId = new Map(ctx.pool.map((r) => [r.id, r]));

  const rest = MEAL_SLOTS.map((s) => {
    const c = s === slot ? null : current?.[s];
    const recipe = c ? byId.get(c.recipeId) : null;
    return recipe && isNum(c.servings) ? { ...c, nutrition: scaled(recipe.nutrition, c.servings) } : null;
  });

  const currentId = current?.[slot]?.recipeId;
  const usedElsewhere = new Set(rest.filter(Boolean).map((o) => o.recipeId));
  const bestPerRecipe = new Map();
  for (const option of slotOptions(slot, ctx.pool)) {
    if (option.recipeId === currentId) continue;
    const day = rest.slice();
    day[slotIndex] = option;
    const score = dayScore(day, ctx);
    const known = bestPerRecipe.get(option.recipeId);
    if (!known || score < known.score) {
      bestPerRecipe.set(option.recipeId, { option, score, day, repeat: usedElsewhere.has(option.recipeId) });
    }
  }

  // Ein Rezept, das am selben Tag schon in einer anderen Mahlzeit steht, wird wegen der weichen Strafe
  // sonst selten gezeigt. Damit bewusstes Wiederholen (Meal-Prep) immer möglich bleibt, bekommt die beste
  // Wiederholung einen festen Platz in der Liste (höchstens MAX_SWAPS Einträge insgesamt).
  const ranked = [...bestPerRecipe.values()].sort(byScoreThenId);
  const repeats = ranked.filter((e) => e.repeat);
  const fresh = ranked.filter((e) => !e.repeat);
  const picked = repeats.length > 0 ? [...fresh.slice(0, MAX_SWAPS - 1), repeats[0]] : fresh.slice(0, MAX_SWAPS);
  picked.sort(byScoreThenId);

  return picked.map(({ option, day, repeat }) => {
    const totals = sumTotals(day);
    return {
      recipeId: option.recipeId,
      servings: option.servings,
      totals,
      ampel: dayAmpel(totals.kcal, params.target, params.floor),
      repeat,
    };
  });
}
