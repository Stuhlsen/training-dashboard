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
import { SOURCE_KEYS } from "./nutrition-sources.js";

/* ──────────────────────────────────────────────────────────
   Konstanten
   ────────────────────────────────────────────────────────── */

/** kcal pro kg Körpermasseänderung (gängige Näherung).
 *  Überschätzt die Wirkung über längere Zeit wegen metabolischer
 *  Anpassung (Hall, Obesity 2024, doi 10.1002/oby.24027).
 *  @type {number} */
export const ENERGY_PER_KG_BODY_MASS = 7700;

/** Alltagsverbrauch OHNE regelmäßigen Sport als Faktor auf den Grundumsatz (PAL).
 *  FAO/WHO/UNU: sitzender/leicht aktiver Alltag 1,40–1,69, typischer Mittelwert
 *  ca. 1,55–1,65. Näherung, keine Messung — das Training wird getrennt addiert
 *  (sonst doppelt gezählt). Quelle: fao-who-unu-pal.
 *  @type {number} */
export const NON_EXERCISE_PAL = 1.55;

/** Messmodus: so viele Tage vor "heute" werden betrachtet, und so viele Tage
 *  mit Messwert braucht ein Feld, damit es statt der Schätzung gilt. */
const BASELINE_WINDOW_DAYS = 14;
const BASELINE_MIN_DAYS = 7;

/** Plausibilitätsgrenze für einen gemessenen Grundumsatz (Vielfaches der Formel).
 *  Großzügig gewählt: sie fängt nur offensichtlich kaputte Werte ab. */
const RESTING_PLAUSIBLE = { min: 0.6, max: 1.6 };

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

/** Energie der geplanten Einheit in kcal (Faustregel kJ ≈ kcal, s. body.js::rideKJ).
 *  Fehlende, unvollständige oder unsinnige Werte (<= 0) zählen als 0 — nie NaN.
 *  @param {{watt?:number, min?:number}|null|undefined} session
 *  @returns {number} */
function sessionEnergyKcal(session) {
  const kj = session ? rideKJ(session) : null;
  return Number.isFinite(kj) && kj > 0 ? kj : 0;
}

/** @param {string|null|undefined} sex
 *  @returns {{isMale:boolean, isFemale:boolean, assumed:boolean}} */
function resolveSex(sex) {
  if (sex === "m") return { isMale: true, isFemale: false, assumed: false };
  if (sex === "f") return { isMale: false, isFemale: true, assumed: false };
  // profiles.sex (Migration 0059) ist 'm'|'f'|null — "w" und andere Werte
  // zählen als unbekannt -> strengeren Floor (30) und sexAssumed=true
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

  // bodyFat <= 0 oder > 1 (Dezimalbereich) ist kein brauchbarer Wert
  if (bodyFat != null && (bodyFat <= 0 || bodyFat > 1)) {
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

  // Negatives/ungültiges Gewicht früh abweisen, bevor estimateBMR
  // aufgerufen wird (isValidNumber prüft > 0, rejects NaN/0/negative)
  if (!isValidNumber(profile.weightKg)) {
    const missing = [];
    if (!isValidNumber(profile.weightKg)) missing.push("Gewicht (kg)");
    if (!isValidNumber(profile.heightCm)) missing.push("Größe (cm)");
    if (!isValidNumber(profile.age)) missing.push("Alter");
    const hint = missing.length
      ? `Profil ergänzen: ${missing.join(", ")}`
      : "Profil ergänzen";
    return { ok: false, hint };
  }

  const bmr = estimateBMR({
    weightKg: profile.weightKg,
    heightCm: profile.heightCm,
    age: profile.age,
    sex: profile.sex,
  });

  if (bmr == null) {
    // Ermitteln, welches Feld fehlt (weightKg ist hier bereits validiert)
    const missing = [];
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
    source: SOURCE_KEYS.MIFFLIN_ST_JEOR,
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
    source: SOURCE_KEYS.IOC_REDS_2023,
    bodyFatAssumed,
    sexAssumed,
    note: "Richtwert, keine Diagnose - grobe Orientierung fuer die Mindestzufuhr.",
  };
}

/** ISO-Datum n Tage vor todayISO (UTC-rechnen, keine Zeitzonen-Sprünge).
 *  @param {string} todayISO @param {number} n @returns {string|null} */
function isoDaysBefore(todayISO, n) {
  const d = new Date(`${todayISO}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

/** @param {number|null|undefined} v @returns {boolean} positive, endliche Zahl */
function isPositive(v) {
  return typeof v === "number" && Number.isFinite(v) && v > 0;
}

/**
 * Tagesgrundlage OHNE Training: Grundumsatz + Alltag. Jedes Feld entscheidet für
 * sich (Messung nur bei genug Tagen, sonst Rückfall auf die Formel/Schätzung):
 *  - Grundumsatz: Mittel von wellness.restingEnergy, sonst die Formel (Mifflin-St-Jeor).
 *  - Alltag: Mittel von (activeEnergy − Energie der Einheiten dieses Tages), sonst
 *    Grundumsatz × (NON_EXERCISE_PAL − 1). Gemessen nur, wenn `rides` übergeben
 *    wurde (vollständige Fahrten-Liste): activeEnergy enthält das Training, ohne
 *    Abzug würde es zusätzlich zur geplanten Einheit doppelt gezählt.
 * Betrachtet werden die BASELINE_WINDOW_DAYS Tage vor todayISO (ohne heute).
 * Die Messung enthält die Nahrungswärme-Wirkung (TEF) nicht — sie kann den
 * Alltag um einige Prozent unterschätzen; der RED-S-Boden fängt das nach unten ab.
 *
 * @param {{bmr:number, wellness?:Array<object>, rides?:Array<{dateISO?:string, watt?:number, min?:number}>, todayISO?:string}} params
 * @returns {{restingKcal:number, activityKcal:number, totalKcal:number,
 *            restingSource:"measured"|"formula", activitySource:"measured"|"estimate",
 *            restingDays:number, activityDays:number}}
 */
export function estimateBaselineExpenditure(params) {
  const { bmr, wellness, rides, todayISO } = params || {};

  const to = todayISO ? isoDaysBefore(todayISO, 1) : null;
  const from = todayISO ? isoDaysBefore(todayISO, BASELINE_WINDOW_DAYS) : null;
  const days = new Map(); // dateISO -> Wellness-Zeile (letzte gewinnt)
  if (Array.isArray(wellness) && from && to) {
    for (const w of wellness) {
      const d = w && (w.dateISO || w.date);
      if (typeof d === "string" && d >= from && d <= to) days.set(d, w);
    }
  }

  // Grundumsatz
  let restingKcal = bmr;
  let restingSource = /** @type {"measured"|"formula"} */ ("formula");
  const resting = [...days.values()].map((w) => w.restingEnergy).filter(isPositive);
  if (resting.length >= BASELINE_MIN_DAYS) {
    const mean = resting.reduce((a, b) => a + b, 0) / resting.length;
    if (mean >= bmr * RESTING_PLAUSIBLE.min && mean <= bmr * RESTING_PLAUSIBLE.max) {
      restingKcal = Math.round(mean);
      restingSource = "measured";
    }
  }

  // Alltag
  let activityKcal = Math.round(restingKcal * (NON_EXERCISE_PAL - 1));
  let activitySource = /** @type {"measured"|"estimate"} */ ("estimate");
  let activityDays = 0;
  if (Array.isArray(rides)) {
    const nonExercise = [];
    for (const [day, w] of days) {
      if (!isPositive(w.activeEnergy)) continue;
      const trainingKcal = rides
        .filter((r) => r && r.dateISO === day)
        .reduce((sum, r) => sum + sessionEnergyKcal(r), 0);
      nonExercise.push(Math.max(0, w.activeEnergy - trainingKcal));
    }
    activityDays = nonExercise.length;
    if (nonExercise.length >= BASELINE_MIN_DAYS) {
      activityKcal = Math.round(nonExercise.reduce((a, b) => a + b, 0) / nonExercise.length);
      activitySource = "measured";
    }
  }

  return {
    restingKcal,
    activityKcal,
    totalKcal: restingKcal + activityKcal,
    restingSource,
    activitySource,
    restingDays: resting.length,
    activityDays,
  };
}

/**
 * Zusammengesetztes, zieladjustiertes taegliches Kalorienziel inklusive
 * RED-S-Floor-Cap.
 *
 * Verknuepft estimateDailyTarget (BMR), paceToDailyKcal (Ziel-Anpassung
 * aus nutrition_goals.pace_per_week_kg) und redSFloor (Minimalgrenze).
 *
 * @param {{
 *   profile: {weightKg?:number, heightCm?:number, age?:number, sex?:string, bodyFat?:number},
 *   goal?: {goalType?:string, pacePerWeekKg?:number, targetWeightKg?:number},
 *   session?: {watt?:number, min?:number},
 *   wellness?: Array<object>, rides?: Array<object>, todayISO?: string
 * }} params
 * @returns {{
 *   ok:true, target:number, bmr:number, baseline:object, trainingKcal:number, adjustment:number,
 *   floor:number, capped:boolean, bodyFatAssumed:boolean, sexAssumed:boolean,
 *   source:string[], note:string
 * }|{ok:false, hint:string}}
 */
export function estimateDailyGoal(params) {
  const { profile, goal, session, wellness, rides, todayISO } = params || {};

  // BMR aus dem Profil
  if (!profile) {
    return { ok: false, hint: "Profil ergaenzen" };
  }
  const bmrResult = estimateDailyTarget({
    weightKg: profile.weightKg,
    heightCm: profile.heightCm,
    age: profile.age,
    sex: profile.sex,
  });
  if (!bmrResult.ok) return bmrResult;

  const bmr = bmrResult.bmr;

  // Ziel-Adjustment aus der Goal (nur lose/gain mit pace)
  let adjustment = 0;

  if (goal) {
    if (goal.goalType === "lose" || goal.goalType === "gain") {
      if (isValidNumber(goal.pacePerWeekKg, true, true) && goal.pacePerWeekKg !== 0) {
        // paceToDailyKcal liefert immer den Kalorienwert zur Magnitude:
        //   |+0.5| = 550, |-0.5| = 550
        // Richtung bestimmt goalType:
        //   lose  -> adjustment = +pace (deficit, ziehe von BMR ab)
        //   gain  -> adjustment = -pace (surplus, addiere zu BMR)
        const raw = paceToDailyKcal(Math.abs(goal.pacePerWeekKg));
        adjustment = goal.goalType === "lose" ? raw : -raw;
      }
    }
    // 'maintain' or no goalType: keine Anpassung (der Boden gilt trotzdem)
  }

  // Tagesgrundlage ohne Training: Grundumsatz + Alltag (gemessen oder geschaetzt)
  const baseline = estimateBaselineExpenditure({ bmr, wellness, rides, todayISO });

  // Energie der geplanten Einheit (E8: Trainingsenergie separat addieren)
  const trainingKcal = sessionEnergyKcal(session);

  // Rohes Target vor Floor: Grundlage + Training - adjustment
  // adjustment > 0 = deficit (subtract from BMR)
  // adjustment < 0 = surplus (add to BMR)
  let target = baseline.totalKcal + trainingKcal - adjustment;

  // RED-S-Floor: gilt IMMER (Fahrplan: das Tagesziel darf ihn nie unterschreiten),
  // nicht nur bei Defizit. Fail-closed: laesst sich der Boden nicht berechnen
  // (z. B. ungueltiger Koerperfett-Wert), gibt es KEIN Ziel — sonst wuerde ein
  // Defizit ohne Boden und ohne Hinweis ausgeliefert.
  const floorResult = redSFloor({
    sex: profile.sex,
    weightKg: profile.weightKg,
    bodyFat: profile.bodyFat,
  });
  if (!floorResult.ok) return floorResult;

  const floor = floorResult.floorKcal;
  let capped = false;
  if (target < floor) {
    target = floor;
    capped = true;
  }

  // Notiz zusammenbauen
  const parts = [];
  const sourceSet = new Set([SOURCE_KEYS.MIFFLIN_ST_JEOR]);

  parts.push(
    `Grundlage ${baseline.totalKcal} kcal (Grundumsatz ${baseline.restingKcal} ${
      baseline.restingSource === "measured" ? "gemessen" : "berechnet"
    } + Alltag ${baseline.activityKcal} ${baseline.activitySource === "measured" ? "gemessen" : "geschaetzt"})`
  );
  if (baseline.activitySource === "estimate") sourceSet.add(SOURCE_KEYS.FAO_WHO_UNU_PAL);
  if (trainingKcal > 0) {
    parts.push(`Training +${trainingKcal} kcal (Faustregel kJ ≈ kcal)`);
  }
  if (adjustment !== 0) {
    const label = adjustment > 0 ? "Defizit" : "Ueberschuss";
    parts.push(
      `Ziel-Anpassung ${label} ${Math.abs(adjustment)} kcal (${Math.abs(goal.pacePerWeekKg)} kg/Woche)`
    );
    sourceSet.add(SOURCE_KEYS.KCAL_PER_KG_7700);
  }
  if (capped) {
    parts.push(`Durch RED-S-Minimum (${floor} kcal) begrenzt`);
    sourceSet.add(SOURCE_KEYS.IOC_REDS_2023);
  }
  if (!capped) {
    parts.push(`RED-S-Minimum ${floor} kcal (nicht unterschritten)`);
    sourceSet.add(SOURCE_KEYS.IOC_REDS_2023);
  }

  const tag = goal && goal.goalType === "maintain" ? " (Erhalt)" : "";
  const note = parts.length
    ? `Ziel ${target} kcal/Tag${tag}. ${parts.join("; ")}.`
    : `Ziel ${target} kcal/Tag${tag}.`;

  return {
    ok: true,
    target,
    bmr,
    baseline,
    trainingKcal,
    adjustment,
    floor,
    capped,
    bodyFatAssumed: floorResult.bodyFatAssumed,
    sexAssumed: floorResult.sexAssumed,
    source: [...sourceSet],
    note,
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

  // Fehlende/ungültige Dauer als "Ruhetag / keine Angabe" werten,
  // da das Issue "0 min oder none" explizit in die 3-5 g/kg-Band einordnet.
  const duration = (plannedDurationMin == null || !isValidNumber(plannedDurationMin, true) || plannedDurationMin < 0)
    ? 0
    : plannedDurationMin;

  // Band finden
  let band = CARB_BANDS[0]; // Default: no session
  for (const b of CARB_BANDS) {
    if (duration <= b.maxMin) {
      band = b;
      break;
    }
  }

  const gramLow = Math.round(weightKg * band.minG);
  const gramHigh = Math.round(weightKg * band.maxG);

  let note;
  if (duration === 0) {
    if (plannedDurationMin == null || plannedDurationMin < 0) {
      note = "Keine Trainingsdauer angegeben - als Ruhetag gewertet (3-5 g/kg).";
    } else {
      note = "Ruhetag: untere Bandbreite (3-5 g/kg).";
    }
  } else if (duration > 60 && duration <= 240) {
    note = "Die 3-4 h-Lücke (6-10 g/kg) ist eigene Interpretation der ACSM/AND/DC-Tabelle.";
  } else {
    note = "Bandbreite nach ACSM/AND/DC 2016.";
  }

  return {
    ok: true,
    band: [band.minG, band.maxG],
    gramRange: [gramLow, gramHigh],
    source: SOURCE_KEYS.ACSM_AND_2016,
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