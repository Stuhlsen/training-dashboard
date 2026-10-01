/* ============================================================
   CORE/NUTRITION.JS — Tägliche Ernährungsziele, RED-S-Floor,
   Intoleranz-Filter, Banner-Logik (kein I/O)
   (Fahrplan 23, Etappe E1+E2, Entscheidungen E7/E8/E9/E11/E19/E20/E22)

   Schichtenregel: importiert nur core/* (body.js, nutrition-sources.js,
   nutrition-taxonomy.js) + types. Kein api/, hooks/, features/,
   components/, charts/, kein console.*, kein document/window/
   localStorage/fetch.

   Deutsche Code-Kommentare, englische Commit-Subjects.
   ============================================================ */

import { estimateBMR, rideKJ } from "./body.js";
import { normalizeAllergenKeys } from "./nutrition-taxonomy.js";

/* ──────────────────────────────────────────────────────────
   Konstanten
   ────────────────────────────────────────────────────────── */

/** kcal pro kg Körpermasseänderung (gängige Näherung).
 *  Überschätzt die Wirkung über längere Zeit wegen metabolischer
 *  Anpassung (Hall, Obesity 2024, doi 10.1002/oby.24027).
 *  @type {number} */
export const ENERGY_PER_KG_BODY_MASS = 7700;

/** RED-S-Floor: kcal pro kg fettfreier Masse pro Tag.
 *  Frauen/general: 30, Männer: 25. Fehlt das Geschlecht → 30 (strenger).
 *  Quelle: IOC Consensus 2023 (ioc-reds-2023). */
const REDS_KCAL_PER_FFM = { female: 30, male: 25 };

/** Standard-Körperfettanteil bei fehlender Messung.
 *  Männer 12 %, Frauen 20 % (Quelle: standard-bodyfat). */
const DEFAULT_BODY_FAT = { male: 0.12, female: 0.20 };

/** Kohlenhydrat-Bänder g/kg/Tag nach geplanter Belastungsdauer.
 *  Quelle: ACSM/AND/DC 2016 (acsm-and-2016).
 *  Die Lücke 3–4 h zwischen ›1–3 h‹ (5–7) und ›>4–5 h‹ (8–12)
 *  wird als 6–10 interpretiert (eigene Interpretation, s. Quellenvermerk).
 *  Intensität wird hier nicht modelliert (bekannte Einschränkung). */
const CARB_BANDS = [
  { maxMin: 0,    label: "keine",   minG: 3,  maxG: 5 },
  { maxMin: 60,   label: "≤60 min",  minG: 5,  maxG: 7 },
  { maxMin: 240,  label: ">60 ≤240", minG: 6,  maxG: 10 },
  { maxMin: Infinity, label: ">240", minG: 8,  maxG: 12 },
];


/* ──────────────────────────────────────────────────────────
   Hilfsfunktionen
   ────────────────────────────────────────────────────────── */

/** @param {string|null|undefined} sex
 *  @returns {{isMale:boolean, isFemale:boolean, assumed:boolean}} */
function resolveSex(sex) {
  if (sex === "m") return { isMale: true, isFemale: false, assumed: false };
  if (sex === "f" || sex === "w") return { isMale: false, isFemale: true, assumed: false };
  // Ungueltiger Wert (z.B. hand-edited) oder fehlend -> als unbekannt behandeln
  return { isMale: false, isFemale: true, assumed: true };
}

/** Prüft, ob ein numerischer Wert für die Berechnung brauchbar ist.
 *  @param {*} v
 *  @param {boolean} [allowZero]
 *  @param {boolean} [allowNegative]
 *  @returns {boolean} */
function isValidNumber(v, allowZero = false, allowNegative = false) {
  if (typeof v !== "number" || Number.isNaN(v)) return false;
  if (allowNegative) return true;
  return allowZero ? v >= 0 : v > 0;
}

/** Berechnet fettfreie Masse in kg.
 *  @param {number} weightKg
 *  @param {number|null|undefined} bodyFat  Dezimal (0.12 = 12 %)
 *  @returns {{ffm: number, assumed: boolean} | null} */
function calcFFM(weightKg, bodyFat) {
  if (!isValidNumber(weightKg)) return null;

  // bodyFat 0 oder >100 (Prozent-Werte, die keinem sinnvollen
  // Bereich entsprechen) → kein brauchbarer Wert
  if (bodyFat != null && (bodyFat <= 0 || bodyFat >= 1 || bodyFat > 100)) {
    return null;
  }

  if (bodyFat == null) {
    return { ffm: null, assumed: true };
  }

  return { ffm: weightKg * (1 - bodyFat), assumed: false };
}


/* ──────────────────────────────────────────────────────────
   Exportierte Funktionen
   ────────────────────────────────────────────────────────── */

/**
 * Grundumsatzbasierte tägliche Kalorien-Schätzung.
 * Nutzt estimateBMR aus core/body.js (Mifflin-St-Jeor).
 *
 * @param {{weightKg?:number, heightCm?:number, age?:number, sex?:string}} profile
 * @returns {{ok:true, bmr:number, source:string, note:string}|{ok:false, hint:string}}
 */
export function estimateDailyTarget(profile) {
  if (!profile) {
    return { ok: false, hint: "Profil ergänzen" };
  }

  const bmr = estimateBMR({
    weightKg: profile.weightKg,
    heightCm: profile.heightCm,
    age: profile.age,
    sex: profile.sex,
  });

  if (bmr == null) {
    // Ermitteln, welches Feld fehlt
    const missing = [];
    if (!isValidNumber(profile.weightKg)) missing.push("Gewicht (kg)");
    if (!isValidNumber(profile.heightCm)) missing.push("Größe (cm)");
    if (!isValidNumber(profile.age)) missing.push("Alter");
    const hint = missing.length
      ? `Profil ergänzen: ${missing.join(", ")}`
      : "Profil ergänzen";
    return { ok: false, hint };
  }

  return {
    ok: true,
    bmr,
    source: "mifflin-st-jeor",
    note: `Schätzung ±100–400 kcal, kein exakter Wert (Grundumsatz nach Mifflin-St-Jeor).`,
  };
}

/**
 * RED-S-Minimum (Floor): die tägliche Energiezufuhr sollte nicht
 * unter diesen Wert fallen.
 *
 * Quelle: IOC Consensus 2023 (ioc-reds-2023). Der Wert ist eine
 * grobe Orientierung, keine Diagnose.
 *
 * @param {{sex?:string, weightKg?:number, bodyFat?:number}} params
 * @returns {{ok:true, floorKcal:number, ffm:number, source:string, note:string,
 *            bodyFatAssumed:boolean, sexAssumed:boolean}|{ok:false, hint:string}}
 */
export function redSFloor(params) {
  const { sex, weightKg, bodyFat } = params || {};

  if (!isValidNumber(weightKg)) {
    return { ok: false, hint: "Profil ergänzen: Gewicht (kg)" };
  }

  // Geschlecht auflösen
  const { isMale, assumed: sexAssumed } = resolveSex(sex);

  // FFM berechnen
  const ffmResult = calcFFM(weightKg, bodyFat);
  if (ffmResult == null) {
    // bodyFat außerhalb des gültigen Bereichs
    return {
      ok: false,
      hint: `Körperfett-Wert ungültig (${bodyFat}); bitte korrigieren.`,
    };
  }

  let ffm;
  let bodyFatAssumed = ffmResult.assumed;

  if (ffmResult.assumed) {
    // Kein bodyFat → Default verwenden
    const defaultBf = isMale ? DEFAULT_BODY_FAT.male : DEFAULT_BODY_FAT.female;
    ffm = weightKg * (1 - defaultBf);
  } else {
    ffm = ffmResult.ffm;
  }

  // kcal/kg FFM: Männer 25, Frauen/general 30
  const kcalPerFfm = isMale ? REDS_KCAL_PER_FFM.male : REDS_KCAL_PER_FFM.female;
  const floorKcal = Math.round(kcalPerFfm * ffm);

  return {
    ok: true,
    floorKcal,
    ffm: Math.round(ffm * 100) / 100,
    source: "ioc-reds-2023",
    bodyFatAssumed,
    sexAssumed,
    note: "Richtwert, keine Diagnose — grobe Orientierung für die Mindestzufuhr.",
  };
}

/**
 * Filtert Rezepte nach Athleten-Intoleranzen (harter Filter, E19).
 * Ein Rezept wird DROPPED (aus dem Ergebnis entfernt), wenn einer
 * seiner contains_tags in den Intoleranzen des Athleten vorkommt.
 *
 * Leere/fehlende Intoleranzen oder contains_tags → nichts gefiltert.
 * Unbekannte/ungültige Intoleranz-Keys werden via normalizeAllergenKeys
 * ignoriert (kein Crash bei hand-edited DB-Zeilen).
 *
 * @param {Array<{id:string, title:string, containsTags?:string[]}>} recipes
 * @param {string[]} athleteIntolerances
 * @returns {Array<{id:string, title:string, containsTags?:string[]}>}
 */
export function filterByIntolerances(recipes, athleteIntolerances) {
  if (!Array.isArray(recipes) || recipes.length === 0) return recipes || [];
  if (!Array.isArray(athleteIntolerances) || athleteIntolerances.length === 0) {
    return recipes;
  }

  const cleanIntolerances = new Set(normalizeAllergenKeys(athleteIntolerances));
  if (cleanIntolerances.size === 0) return recipes;

  return recipes.filter((recipe) => {
    if (!recipe || !Array.isArray(recipe.containsTags)) return true;
    const cleanTags = normalizeAllergenKeys(recipe.containsTags);
    return !cleanTags.some((tag) => cleanIntolerances.has(tag));
  });
}

/**
 * Trainings-Hinweis: Text zu Abweichung zwischen Ziel und
 * tatsächlicher Aufnahme, verknüpft mit der morgigen Einheit.
 *
 * Kein Rezept-Lenkung (E7) — reiner Text.
 *
 * @param {{target?:number, actualIntake?:number, tomorrowSession?:{watt?:number, min?:number}}} params
 * @returns {string|null}  Hinweistext oder null, wenn nichts zu sagen.
 */
export function trainingNutritionHint(params) {
  const { target, actualIntake, tomorrowSession } = params || {};

  // Keine morgige Session oder keine brauchbaren Daten → kein Hinweis
  const sessionKj = tomorrowSession ? rideKJ(tomorrowSession) : null;
  if (sessionKj == null) return null;

  // Kein Ziel zum Vergleichen
  if (target == null) return null;

  // kJ ≈ kcal Nahrungsäquivalent (Faustregel, ~20–25 % Wirkungsgrad)
  const sessionKcal = sessionKj;

  let hint = "";
  if (actualIntake != null && actualIntake < target) {
    const diff = Math.round(target - actualIntake);
    hint += `Heutige Aufnahme (${Math.round(actualIntake)} kcal) liegt ${diff} kcal unter dem Ziel `;
  } else {
    hint += "Heutige Aufnahme entspricht dem Ziel. ";
  }

  hint += `Morgen: ca. ${sessionKcal} kcal Verbrauch durch die Einheit (${tomorrowSession.min} min).`;

  if (actualIntake != null && actualIntake < target) {
    hint += " Achte darauf, morgen frühzeitig genug zu essen.";
  }

  return hint;
}

/**
 * Gewichts-Hinweis: Banner, wenn keine Gewichtseintragung seit
 * mehr als 7 Tagen.
 *
 * @param {Array<{date?:string, dateISO?:string, weight?:number|null}>} wellness
 * @param {string} todayISO  ISO-Datum (YYYY-MM-DD)
 * @returns {string|null}  Hinweistext oder null, wenn aktuell.
 */
export function weightMissingHint(wellness, todayISO) {
  if (!Array.isArray(wellness) || wellness.length === 0) {
    return "Kein Gewicht eingetragen — regelmäßiges Wiegen hilft, den Trend zu erkennen.";
  }

  // Neuesten Gewichtseintrag finden
  let latestWeightDate = null;
  for (const w of wellness) {
    if (w.weight == null) continue;
    const d = w.dateISO || w.date;
    if (!d) continue;
    if (latestWeightDate == null || d > latestWeightDate) {
      latestWeightDate = d;
    }
  }

  if (latestWeightDate == null) {
    // Es gibt Wellness-Einträge, aber keinen mit Gewicht
    return "Kein Gewicht eingetragen — regelmäßiges Wiegen hilft, den Trend zu erkennen.";
  }

  // Tage seit dem letzten Gewichtseintrag
  const today = new Date(todayISO + "T00:00:00");
  const last = new Date(latestWeightDate + "T00:00:00");
  const daysSince = Math.round((today.getTime() - last.getTime()) / 86400000);

  // "Mehr als 7 Tage": > 7
  if (daysSince > 7) {
    return `Letzter Gewichtseintrag am ${latestWeightDate} (vor ${daysSince} Tagen) — bitte wieder wiegen.`;
  }

  return null;
}

/**
 * Kohlenhydrat-Orientierung je nach geplanter Belastungsdauer.
 *
 * Quelle: ACSM/AND/DC Joint Position Statement 2016 (acsm-and-2016).
 * Die 3–4 h-Lücke zwischen den Bändern 1–3 h und >4–5 h ist eigene
 * Interpretation (6–10 g/kg). Intensität wird nicht modelliert.
 *
 * Kein Train-Low / Sleep-Low (DGE 2020 empfiehlt das nicht allgemein).
 *
 * @param {{weightKg?:number, plannedDurationMin?:number}} params
 * @returns {{ok:true, band:[number,number], gramRange:[number,number], source:string,
 *            note:string}|{ok:false, hint:string}}
 */
export function estimateCarbTarget(params) {
  const { weightKg, plannedDurationMin } = params || {};

  if (!isValidNumber(weightKg)) {
    return { ok: false, hint: "Profil ergänzen: Gewicht (kg)" };
  }

  if (plannedDurationMin == null || !isValidNumber(plannedDurationMin, true) || plannedDurationMin < 0) {
    return { ok: false, hint: "Keine gültige Trainingsdauer angegeben." };
  }

  // Band finden
  let band = CARB_BANDS[0]; // Default: no session
  for (const b of CARB_BANDS) {
    if (plannedDurationMin <= b.maxMin) {
      band = b;
      break;
    }
  }

  const gramLow = Math.round(weightKg * band.minG);
  const gramHigh = Math.round(weightKg * band.maxG);

  let note;
  if (plannedDurationMin === 0) {
    note = "Ruhetag: untere Bandbreite (3–5 g/kg).";
  } else if (plannedDurationMin > 60 && plannedDurationMin <= 240) {
    note = "Die 3–4 h-Lücke (6–10 g/kg) ist eigene Interpretation der ACSM/AND/DC-Tabelle.";
  } else {
    note = "Bandbreite nach ACSM/AND/DC 2016.";
  }

  return {
    ok: true,
    band: [band.minG, band.maxG],
    gramRange: [gramLow, gramHigh],
    source: "acsm-and-2016",
    note,
  };
}

/**
 * Rechnet eine wöchentliche Gewichtsänderungsrate (kg/Woche) in
 * ein tägliches Kalorien-Defizit/Überschuss um.
 *
 * Positive pace = Gewichtsverlust → negatives Kalorienziel (Defizit).
 * Negative pace = Gewichtszunahme → positives Kalorienziel (Überschuss).
 *
 * @param {number} pacePerWeekKg  Positive Zahl = gewünschter Verlust pro Woche
 * @returns {number}  Kcal pro Tag (gerundet)
 */
export function paceToDailyKcal(pacePerWeekKg) {
  if (!isValidNumber(pacePerWeekKg, true, true)) return 0;
  return Math.round(pacePerWeekKg * ENERGY_PER_KG_BODY_MASS / 7);
}