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

import { estimateRestingEnergy, rideKJ } from "./body.js";
import { fmtDateFull } from "./format.js";
import { normalizeAllergenKeys } from "./nutrition-taxonomy.js";
import { SOURCE_KEYS } from "./nutrition-sources.js";
import { MAX_WEEKLY_LOSS_PCT } from "./goals.js";

/* ──────────────────────────────────────────────────────────
   Konstanten
   ────────────────────────────────────────────────────────── */

/** Strenger Boden bei aktivem Ziel „Fett verlieren“ (Fahrplan 43, Q31):
 *  kcal pro kg fettfreier Masse und Tag, für alle gleich.
 *  Eigene Festlegung, gestützt auf Literaturmarken, keine verbindliche Grenze. */
export const STRICT_FLOOR_KCAL_PER_KG_FFM = 30;

/** Obergrenze des Warnbereichs (30 bis 45 kcal/kg Magermasse), ebenfalls
 *  eigene Festlegung. Der Bereich ist ein ruhiger Hinweis, kein Befund. */
export const STRICT_WARN_UPPER_KCAL_PER_KG_FFM = 45;

/** Warnung „Defizit + hohe Last“ (Idee N): geplante Wochen-TSS über
 *  CTL x Faktor. Eigene Festlegung. Der Plan-Check K-WOCHENTSS warnt erst
 *  bei 8 x CTL; unter Defizit sagen wir es etwas früher. */
export const DEFICIT_LOAD_TSS_FACTOR = 7.5;

/** Schrittweite des Tempo-Deckels in Hundertstel kg pro Woche (nur Rundung). */
const PACE_STEP_HUNDREDTHS = 5;

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
 * Nutzt estimateRestingEnergy aus core/body.js (Cunningham bei gemessenem
 * Körperfett, sonst Ten-Haaf). bodyFatPct nur als GEMESSENER Wert in Prozent.
 *
 * @param {{weightKg?:number, heightCm?:number, age?:number, sex?:string|null,
 *          bodyFatPct?:number|null, bodyFatDate?:string|null}} profile
 * @returns {{ok:true, bmr:number, formula:string, source:string, note:string,
 *            hints:string[], bodyFatDate:string|null}|{ok:false, hint:string}}
 */
export function estimateDailyTarget(profile) {
  if (!profile) {
    return { ok: false, hint: "Profil ergänzen" };
  }

  const r = estimateRestingEnergy(profile);
  if (!r.ok) return r;

  return {
    ok: true,
    bmr: r.kcal,
    formula: r.formula,
    source: r.source,
    note: r.note,
    hints: r.hints,
    bodyFatDate: r.bodyFatDate,
  };
}

/**
 * RED-S-Minimum (Floor): die tägliche Energiezufuhr sollte nicht
 * unter diesen Wert fallen.
 *
 * Quelle: IOC Consensus 2023 (ioc-reds-2023). Der Wert ist eine
 * grobe Orientierung, keine Diagnose.
 *
 * Mit exerciseKcal (Energie der geplanten Einheit) liegt die Mindestaufnahme um diesen
 * Wert hoeher: Energieverfuegbarkeit = (Aufnahme - Training) / fettfreie Masse.
 *
 * @param {{sex?:string, weightKg?:number, bodyFat?:number, exerciseKcal?:number}} params
 * @returns {{ok:true, floorKcal:number, eaFloorKcal:number, exerciseKcal:number, ffm:number, source:string, note:string,
 *            bodyFatAssumed:boolean, sexAssumed:boolean}|{ok:false, hint:string}}
 */
export function redSFloor(params) {
  const { sex, weightKg, bodyFat, exerciseKcal } = params || {};

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
  const eaFloorKcal = Math.round(kcalPerFfm * ffm);
  // EA = (EI - EEE) / FFM (IOC 2023, Box 1): die kcal/kg-Grenze gilt NACH Abzug des
  // Trainingsverbrauchs, die Mindestaufnahme liegt also um EEE hoeher. Brutto-Verbrauch
  // der Einheit (leicht vorsichtig: zaehlt etwas mehr als den Nettoverbrauch).
  const exercise = Number.isFinite(exerciseKcal) && exerciseKcal > 0 ? Math.round(exerciseKcal) : 0;
  const floorKcal = eaFloorKcal + exercise;

  return {
    ok: true,
    floorKcal,
    eaFloorKcal,
    exerciseKcal: exercise,
    ffm: Math.round(ffm * 100) / 100,
    source: SOURCE_KEYS.IOC_REDS_2023,
    bodyFatAssumed,
    sexAssumed,
    note: "Richtwert, keine Diagnose - grobe Orientierung fuer die Mindestzufuhr.",
  };
}

/**
 * Tagesgrundlage OHNE Training: Grundumsatz (Formel) + Alltag (Grundumsatz x (PAL - 1)).
 *
 * Bewusst KEINE Uhr-Daten (activeEnergy/restingEnergy aus der Wellness-Pipeline):
 *  - Metaanalyse 2025 (Choe & Kang, Physiol Meas, 56 Studien, doi 10.1088/1361-6579/adca82):
 *    bei der Energie liegen alle Untergruppen ueber 10 % Fehler (laut Pressemitteilung der
 *    Universitaet ca. 28 % bei der Apple Watch; die Zahl steht nicht im Abstract).
 *  - Der "Grundumsatz" der Uhr ist laut Foren/Blogs eine Formel aus Profildaten, keine
 *    Messung (nicht offiziell belegt).
 *  - Der aktive Verbrauch ist anders definiert als der Alltagsverbrauch (unsere Vermutung):
 *    an Ruhetagen lag er in lokalen Daten bei ca. 230 kcal gegen ca. 960 kcal nach PAL.
 *    Ein zu niedriges Ziel waere die gefaehrliche Richtung (zu wenig essen).
 * @param {number} bmr
 * @returns {{restingKcal:number, activityKcal:number, totalKcal:number}}
 */
function dailyBaseline(bmr) {
  const activityKcal = Math.round(bmr * (NON_EXERCISE_PAL - 1));
  return { restingKcal: bmr, activityKcal, totalKcal: bmr + activityKcal };
}

/**
 * Zusammengesetztes, zieladjustiertes taegliches Kalorienziel inklusive
 * RED-S-Floor-Cap.
 *
 * Verknuepft estimateDailyTarget (BMR), paceToDailyKcal (Ziel-Anpassung
 * aus nutrition_goals.pace_per_week_kg) und redSFloor (Minimalgrenze).
 *
 * @param {{
 *   profile: {weightKg?:number, heightCm?:number, age?:number, sex?:string|null,
 *             bodyFat?:number|null, bodyFatDate?:string|null},
 *   goal?: {goalType?:string, pacePerWeekKg?:number, targetWeightKg?:number},
 *   session?: {watt?:number, min?:number},
 *   goalContext?: {fatLoss?:boolean, hardDay?:boolean, hardTomorrow?:boolean|null}|null
 * }} params  goalContext nur bei aktivem Ziel „Fett verlieren“ (Fahrplan 43 E6);
 *   hardTomorrow null = Folgetag unbekannt. Ohne goalContext rechnet alles wie zuvor.
 * @returns {{
 *   ok:true, target:number, bmr:number, formula:"cunningham-1980"|"ten-haaf-2014", hints:string[],
 *   bodyFatDate:string|null,
 *   baseline:object, trainingKcal:number, adjustment:number,
 *   floor:number, eaFloorKcal:number, capped:boolean, bodyFatAssumed:boolean, sexAssumed:boolean,
 *   source:string[], note:string
 * }|{ok:false, hint:string}}
 */
export function estimateDailyGoal(params) {
  const { profile, goal, session, goalContext } = params || {};

  // BMR aus dem Profil
  if (!profile) {
    return { ok: false, hint: "Profil ergaenzen" };
  }
  const bmrResult = estimateDailyTarget({
    weightKg: profile.weightKg,
    heightCm: profile.heightCm,
    age: profile.age,
    sex: profile.sex,
    // profile.bodyFat ist Dezimal und nur gesetzt, wenn gemessen (null = Standardwert,
    // der Cunningham nie auslösen darf)
    bodyFatPct: profile.bodyFat != null ? profile.bodyFat * 100 : null,
    bodyFatDate: profile.bodyFatDate,
  });
  if (!bmrResult.ok) return bmrResult;

  const bmr = bmrResult.bmr;

  // Zielkontext (Fahrplan 43 E6): nur bei aktivem Ziel „Fett verlieren“.
  // Ohne Kontext läuft alles wie zuvor, auch das Ergebnis trägt keine neuen Felder.
  const ctx = goalContext && goalContext.fatLoss ? goalContext : null;
  const bodyFatMeasured = isValidNumber(profile.bodyFat) && profile.bodyFat <= 1;

  // Ziel-Adjustment aus der Goal (nur lose/gain mit pace)
  let adjustment = 0;
  // Tempo, das tatsächlich gerechnet wird (mit Kontext gegen das Gewicht gedeckelt)
  let effectivePace = goal ? goal.pacePerWeekKg : undefined;
  let paceCapped = false;

  if (goal) {
    if (goal.goalType === "lose" || goal.goalType === "gain") {
      if (isValidNumber(goal.pacePerWeekKg, true, true) && goal.pacePerWeekKg !== 0) {
        if (ctx && goal.goalType === "lose") {
          // Nie still ändern: gekürzt wird nur gegen das aktuelle Gewicht und wird gemeldet.
          const cap = maxPacePerWeekKg(profile.weightKg);
          if (cap != null && Math.abs(goal.pacePerWeekKg) > cap) {
            effectivePace = cap;
            paceCapped = true;
          }
        }
        // paceToDailyKcal liefert immer den Kalorienwert zur Magnitude:
        //   |+0.5| = 550, |-0.5| = 550
        // Richtung bestimmt goalType:
        //   lose  -> adjustment = +pace (deficit, ziehe von BMR ab)
        //   gain  -> adjustment = -pace (surplus, addiere zu BMR)
        const raw = paceToDailyKcal(Math.abs(/** @type {number} */ (effectivePace)));
        adjustment = goal.goalType === "lose" ? raw : -raw;
      }
    }
    // 'maintain' or no goalType: keine Anpassung (der Boden gilt trotzdem)
  }

  // Defizit streichen: ohne gemessenes Körperfett (kein Standardwert) und vor/an harten Tagen.
  // Folgetag unbekannt (null): Defizit bleibt, das Ergebnis meldet es.
  /** @type {"no-body-fat"|"hard-day"|null} */
  let deficitBlockedReason = null;
  let nextDayUnknown = false;
  if (ctx && adjustment > 0) {
    if (!bodyFatMeasured) {
      deficitBlockedReason = "no-body-fat";
    } else if (ctx.hardDay === true || ctx.hardTomorrow === true) {
      deficitBlockedReason = "hard-day";
    } else if (ctx.hardTomorrow === null) {
      nextDayUnknown = true;
    }
    if (deficitBlockedReason) adjustment = 0;
  }

  // Tagesgrundlage ohne Training: Grundumsatz + Alltag (beides berechnet/geschaetzt)
  const baseline = dailyBaseline(bmr);

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
  // Energieverfuegbarkeit = (Aufnahme - Trainingsverbrauch) / FFM (IOC 2023, Box 1):
  // die geplante Einheit hebt den Boden um ihren Verbrauch an.
  const floorResult = redSFloor({
    sex: profile.sex,
    weightKg: profile.weightKg,
    bodyFat: profile.bodyFat,
    exerciseKcal: trainingKcal,
  });
  if (!floorResult.ok) return floorResult;

  // Strenger Boden (nur mit Kontext und gemessenem Körperfett): 30 kcal/kg Magermasse
  // für alle, der Trainingsverbrauch zählt wie beim normalen Boden oben drauf.
  const strictFloor = !!ctx && bodyFatMeasured && !floorResult.bodyFatAssumed;
  const ffmKg = strictFloor ? profile.weightKg * (1 - profile.bodyFat) : null;
  const eaFloorKcal = strictFloor
    ? Math.max(floorResult.eaFloorKcal, Math.round(STRICT_FLOOR_KCAL_PER_KG_FFM * /** @type {number} */ (ffmKg)))
    : floorResult.eaFloorKcal;
  const floor = strictFloor ? eaFloorKcal + floorResult.exerciseKcal : floorResult.floorKcal;
  let capped = false;
  if (target < floor) {
    target = floor;
    capped = true;
  }

  // Notiz zusammenbauen
  const parts = [];
  const sourceSet = new Set([bmrResult.source]);

  parts.push(
    `Grundlage ${baseline.totalKcal} kcal (Grundumsatz ${baseline.restingKcal} berechnet + Alltag ${baseline.activityKcal} geschaetzt)`
  );
  sourceSet.add(SOURCE_KEYS.FAO_WHO_UNU_PAL);
  if (trainingKcal > 0) {
    parts.push(`Training +${trainingKcal} kcal (Faustregel kJ ≈ kcal)`);
  }
  if (adjustment !== 0) {
    const label = adjustment > 0 ? "Defizit" : "Ueberschuss";
    parts.push(
      `Ziel-Anpassung ${label} ${Math.abs(adjustment)} kcal (${Math.abs(/** @type {number} */ (effectivePace))} kg/Woche)`
    );
    sourceSet.add(SOURCE_KEYS.KCAL_PER_KG_7700);
  }
  const floorText =
    trainingKcal > 0
      ? `${floor} kcal = ${eaFloorKcal} + Training ${floorResult.exerciseKcal}`
      : `${floor} kcal`;
  parts.push(
    capped
      ? `Durch RED-S-Minimum (${floorText}) begrenzt`
      : `RED-S-Minimum ${floorText} (nicht unterschritten)`
  );
  sourceSet.add(SOURCE_KEYS.IOC_REDS_2023);

  const tag = goal && goal.goalType === "maintain" ? " (Erhalt)" : "";
  const note = parts.length
    ? `Ziel ${target} kcal/Tag${tag}. ${parts.join("; ")}.`
    : `Ziel ${target} kcal/Tag${tag}.`;

  const result = {
    ok: /** @type {const} */ (true),
    target,
    bmr,
    // Formel, Unsicherheits-Hinweise und Datum des Körperfett-Werts reichen wir
    // an die Anzeige durch (Tab zeigt Formelname + Datum, E33–E35)
    formula: bmrResult.formula,
    hints: bmrResult.hints,
    bodyFatDate: bmrResult.bodyFatDate,
    baseline,
    trainingKcal,
    adjustment,
    floor,
    eaFloorKcal,
    capped,
    bodyFatAssumed: floorResult.bodyFatAssumed,
    sexAssumed: floorResult.sexAssumed,
    source: [...sourceSet],
    note,
  };
  if (!ctx) return result;

  // Nur mit Zielkontext: Gründe und Hinweise, die die Anzeige braucht.
  // Energieverfügbarkeit nach Abzug des Trainings, pro kg Magermasse.
  const availability = strictFloor ? (target - trainingKcal) / /** @type {number} */ (ffmKg) : null;
  return {
    ...result,
    strictFloor,
    deficitBlockedReason,
    nextDayUnknown,
    paceCapped,
    eaWarn:
      availability != null &&
      availability >= STRICT_FLOOR_KCAL_PER_KG_FFM &&
      availability < STRICT_WARN_UPPER_KCAL_PER_KG_FFM,
  };
}

/**
 * Obergrenze für das Abnehm-Tempo in kg pro Woche: MAX_WEEKLY_LOSS_PCT des
 * aktuellen Gewichts, abgerundet auf 0,05 kg (eigene Festlegung, s. core/goals.js).
 * @param {number|null|undefined} weightKg
 * @returns {number|null}  null ohne brauchbares Gewicht
 */
export function maxPacePerWeekKg(weightKg) {
  if (!isValidNumber(weightKg)) return null;
  // in Hundertstel kg rechnen und mit Toleranz abrunden (70 x 0,5 / 5 = 6,999… wäre sonst 6)
  const hundredths = (weightKg * MAX_WEEKLY_LOSS_PCT) / PACE_STEP_HUNDREDTHS;
  const steps = Math.floor(hundredths + 1e-9);
  const pace = (steps * PACE_STEP_HUNDREDTHS) / 100;
  return pace > 0 ? Math.round(pace * 100) / 100 : null;
}

/**
 * Eiweiß-Bereich in Gramm pro Tag aus g/kg (core/goals.js::PROTEIN_G_PER_KG).
 * @param {{min:number, max:number}|null|undefined} range  g pro kg Körpergewicht
 * @param {number|null|undefined} weightKg
 * @returns {{min:number, max:number}|null}
 */
export function proteinRangeG(range, weightKg) {
  if (!range || !isValidNumber(range.min) || !isValidNumber(range.max) || !isValidNumber(weightKg)) {
    return null;
  }
  return { min: Math.round(range.min * weightKg), max: Math.round(range.max * weightKg) };
}

/**
 * Ruhiger Hinweis (Idee N): Defizit und hohe geplante Wochenlast fallen zusammen.
 * Sachlich, kein Druck. Ohne Defizit, CTL oder Last kein Hinweis.
 * @param {{deficitActive?:boolean, weekPlannedTss?:number|null, ctl?:number|null}} [params]
 * @returns {{warn:boolean, text:string}}
 */
export function deficitLoadWarning(params) {
  const { deficitActive, weekPlannedTss, ctl } = params || {};
  const none = { warn: false, text: "" };
  if (!deficitActive || !isValidNumber(weekPlannedTss) || !isValidNumber(ctl)) return none;
  if (weekPlannedTss <= ctl * DEFICIT_LOAD_TSS_FACTOR) return none;
  return {
    warn: true,
    text: "Diese Woche sind ein Defizit und viel Training zusammen geplant. Das kann Einheiten schwerer machen. Du kannst die Woche im Plan anschauen oder das Tempo in den Einstellungen ändern.",
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
    return `Letzter Gewichtseintrag am ${fmtDateFull(latestWeightDate)} (vor ${daysSince} Tagen) — bitte wieder wiegen.`;
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