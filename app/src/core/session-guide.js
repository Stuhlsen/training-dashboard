/* ============================================================
   CORE/SESSION-GUIDE.JS — Trainings-Guide einer Karte bauen
   (rein, deterministisch, kein DOM, kein I/O)
   (Fahrplan 34, Etappe E2: nur Rad; Lauf/Schwimmen kommt in E6)

   `buildSessionGuide(card, ctx)` nimmt den Text aus
   session-guide-texts.js (Schlüssel aus session-guide-key.js), füllt die
   Lücken {reps}/{workMin}/{wattRange} aus der genauen Struktur der Karte
   und ergänzt Kadenz und Fueling. Fehlt ein Wert für eine Lücke, gilt die
   Fallback-Fassung des Textes — nie bleibt „{…}" oder „undefined" stehen.

   Fueling-Zahlen: ACSM 2016 (Essen vorher, < 60 min), Morton 2026 (während),
   Ijaz 2025 (Hinweis). Die Umschaltung bei 60 statt 75 min und die
   Untergrenze 60 g/h über 150 min sind EIGENE SETZUNG (Beleg §2a, privat:
   planning/recherche/trainingskarten-erklaeren-belege.md).

   `ctx` = { cadenceTarget, weightKg, ftp, phase? }. `phase` ist für E6
   (Schwimm-Intervalle) reserviert und wird hier noch nicht gelesen.
   ============================================================ */

import { SESSION_GUIDE_TEXTS, GUIDE_CUE_PLACEHOLDERS } from "./session-guide-texts.js";
import { GUIDE_SOURCE_KEYS as S } from "./session-guide-sources.js";
import { guideKeyFor, hasSprintStep } from "./session-guide-key.js";
import { usableStructure, mainIntervalSummary, sprintReps, structureTotalMin } from "./workout-structure-format.js";

/** Unter dieser Dauer reicht Wasser (ACSM: „Not needed"). */
export const FUEL_NOT_NEEDED_MAX_MIN = 45;
/** Ab dieser Dauer 30–60 g KH/h (eigene Setzung: ACSM schaltet bei 75 min). */
export const FUEL_SMALL_MAX_MIN = 60;
/** Über dieser Dauer (2,5 h) 60–90 g KH/h. */
export const FUEL_LONG_MIN = 150;
/** KH vor der Einheit in g pro kg Körpergewicht [min, max] (ACSM 2016). */
export const PRE_MEAL_G_PER_KG = Object.freeze([1, 4]);
/** Bis zu dieser Dauer reicht die normale Mahlzeit (eigene Setzung). */
const PRE_MEAL_NORMAL_MAX_MIN = 60;

const SPRINT_KEY = "ride:sprint-accessory";
const REPS_WORDS = Object.freeze(["", "", "zwei", "drei", "vier", "fünf", "sechs", "sieben", "acht", "neun", "zehn", "elf", "zwölf"]);

const KADENZ_GENERAL = "Wähle eine flüssige Trittfrequenz, die du im ganzen Intervall gleich halten kannst.";
const PRE_MEAL_TEXT =
  "Iss 1–4 Stunden vorher eine kohlenhydratreiche Mahlzeit, z. B. 2–3 Stunden vorher Brot mit Marmelade oder Reis. Wenig Fett und Ballaststoffe, nicht zu viel Eiweiß.";
const HINT_BIG_RIDERS = "Größere, kräftigere Fahrer vertragen oft eher das obere Ende.";
const HINT_UP_TO_120 = "Bis 120 g/h nur, wenn dein Magen das im Training gelernt hat.";

/**
 * @typedef {Object} GuideSection
 * @property {"ziel"|"rpe"|"cue"|"kadenz"|"fuelPre"|"fuelInter"} id
 * @property {string} title
 * @property {string} text
 * @property {string|null} [hint]
 * @property {ReadonlyArray<string>} quelleKeys
 *
 * @typedef {Object} SessionGuide
 * @property {string} key
 * @property {{min:number, max:number}} rpe
 * @property {ReadonlyArray<GuideSection>} sections
 *
 * @typedef {{text:string, hint:string|null, quelleKeys:string[]}} FuelingAdvice
 */

const isPositive = (n) => typeof n === "number" && Number.isFinite(n) && n > 0;

/** Zahlwort bis 12 („drei"), darüber Ziffer; unter 2 → null (Fallback). */
function repsWord(reps) {
  if (!Number.isInteger(reps) || reps < 2) return null;
  return REPS_WORDS[reps] || String(reps);
}

/** Minuten deutsch mit höchstens einer Stelle: 12 → „12", 90 s → „1,5". */
function minutesDe(seconds) {
  if (!isPositive(seconds)) return null;
  return String(Math.round((seconds / 60) * 10) / 10).replace(".", ",");
}

/** „225 W" bzw. „213–263 W" aus %FTP-Spanne und FTP. */
function wattRangeDe(pctRange, ftp) {
  if (!pctRange || !isPositive(ftp)) return null;
  const [lo, hi] = pctRange.map((pct) => Math.round((ftp * pct) / 100));
  return lo === hi ? `${lo} W` : `${lo}–${hi} W`;
}

/** Vorlage füllen; fehlt ein benötigter Wert → Fallback-Fassung. */
function fillCue(cue, values) {
  const needed = GUIDE_CUE_PLACEHOLDERS.filter((p) => cue.template.includes(p));
  if (needed.some((p) => !values[p])) return cue.fallback;
  return needed.reduce((text, p) => text.split(p).join(values[p]), cue.template);
}

/** Werte der Lücken aus der Struktur der Karte (leer, wo etwas fehlt). */
function cueValues(structure, ftp) {
  const main = mainIntervalSummary(structure);
  return {
    "{reps}": main && repsWord(main.reps),
    "{workMin}": main && minutesDe(main.workS),
    "{wattRange}": main && wattRangeDe(main.pctRange, ftp),
  };
}

/** Kadenz-Satz: eigenes Ziel als Zahl, sonst allgemeiner Satz. */
function kadenzText(cadenceTarget) {
  return isPositive(cadenceTarget)
    ? `Halte etwa ${Math.round(cadenceTarget)} U/min, rund und gleichmäßig.`
    : KADENZ_GENERAL;
}

/**
 * Essen während der Einheit nach Dauer (Fahrplan 34, V4).
 * @param {number|null|undefined} durationMin
 * @param {string} sport  `swim` → null (Abschnitt entfällt)
 * @returns {FuelingAdvice|null}
 */
export function fuelingDuring(durationMin, sport) {
  if (sport === "swim" || !isPositive(durationMin)) return null;
  if (durationMin < FUEL_NOT_NEEDED_MAX_MIN) {
    return { text: "Wasser reicht.", hint: null, quelleKeys: [S.ACSM_2016] };
  }
  if (durationMin < FUEL_SMALL_MAX_MIN) {
    return {
      text: "Wasser reicht. Bei harten Einheiten hilft ein Schluck Sportgetränk.",
      hint: null,
      quelleKeys: [S.ACSM_2016],
    };
  }
  if (durationMin <= FUEL_LONG_MIN) {
    return {
      text: "30–60 g KH pro Stunde",
      hint: HINT_BIG_RIDERS,
      quelleKeys: [S.ACSM_2016, S.MORTON_2026, S.IJAZ_2025],
    };
  }
  return {
    text: "60–90 g KH pro Stunde",
    hint: `${HINT_UP_TO_120} ${HINT_BIG_RIDERS}`,
    quelleKeys: [S.ACSM_2016, S.MORTON_2026, S.IJAZ_2025, S.EIGENE_SETZUNG],
  };
}

/** Auf 10 g gerundet. */
const round10 = (grams) => Math.round(grams / 10) * 10;

/**
 * Essen vor der Einheit (Fahrplan 34, V4). Mit Gewicht steht im Hinweis die
 * persönliche Gramm-Spanne, ohne nur die Spanne pro kg.
 * @param {number|null|undefined} durationMin
 * @param {number|null|undefined} weightKg
 * @returns {FuelingAdvice|null}
 */
export function fuelingBefore(durationMin, weightKg) {
  if (!isPositive(durationMin)) return null;
  if (durationMin <= PRE_MEAL_NORMAL_MAX_MIN) {
    return { text: "Deine normale Mahlzeit reicht.", hint: null, quelleKeys: [S.EIGENE_SETZUNG] };
  }
  const [perKgMin, perKgMax] = PRE_MEAL_G_PER_KG;
  const perKg = `${perKgMin}–${perKgMax} g KH pro kg`;
  const hint = isPositive(weightKg)
    ? `${perKg} (bei dir ca. ${round10(weightKg * perKgMin)}–${round10(weightKg * perKgMax)} g)`
    : `${perKg} Körpergewicht`;
  return { text: PRE_MEAL_TEXT, hint, quelleKeys: [S.ACSM_2016] };
}

/** Dauer der Karte in Minuten: Feld der Karte, sonst aus der Struktur. */
function cardDurationMin(card, structure) {
  if (isPositive(card.durationMin)) return card.durationMin;
  return structure ? structureTotalMin(structure) : null;
}

/** @param {FuelingAdvice|null} advice @param {GuideSection["id"]} id @param {string} title @returns {GuideSection[]} */
function fuelSection(advice, id, title) {
  return advice ? [{ id, title, text: advice.text, hint: advice.hint, quelleKeys: advice.quelleKeys }] : [];
}

/**
 * Trainings-Guide einer Karte (Fahrplan 34, V1). `null`, wenn es für die
 * Karte keinen Guide gibt (unbekannter Typ, Lauf/Schwimmen bis E6).
 * @param {{typ?: unknown, sport?: unknown, durationMin?: number|null, workout?: unknown, workoutStructure?: unknown}|null|undefined} card
 * @param {{cadenceTarget?: number|null, weightKg?: number|null, ftp?: number|null, phase?: string|null}} [ctx]
 * @returns {SessionGuide|null}
 */
export function buildSessionGuide(card, ctx = {}) {
  const key = guideKeyFor(card);
  const entry = key ? SESSION_GUIDE_TEXTS[key] : null;
  if (!card || !key || !entry) return null;

  const structure = usableStructure(card);
  const cueParts = [fillCue(entry.cue, cueValues(structure, ctx.ftp))];
  if (hasSprintStep(card)) {
    const sprint = SESSION_GUIDE_TEXTS[SPRINT_KEY];
    cueParts.push(fillCue(sprint.cue, { "{reps}": repsWord(sprintReps(structure)) }));
  }
  cueParts.push(entry.abbruch);

  const durationMin = cardDurationMin(card, structure);
  const sport = typeof card.sport === "string" ? card.sport : "ride";

  return {
    key,
    rpe: { min: entry.rpe.min, max: entry.rpe.max },
    sections: [
      { id: "ziel", title: "Ziel der Einheit", text: entry.ziel, quelleKeys: [] },
      { id: "rpe", title: "RPE", text: entry.gefuehl, quelleKeys: [...entry.quelleKeys] },
      { id: "cue", title: "So fährst du es", text: cueParts.join(" "), quelleKeys: [] },
      { id: "kadenz", title: "Kadenz", text: kadenzText(ctx.cadenceTarget), quelleKeys: [S.EIGENE_SETZUNG] },
      ...fuelSection(fuelingBefore(durationMin, ctx.weightKg), "fuelPre", "Essen vorher"),
      ...fuelSection(fuelingDuring(durationMin, sport), "fuelInter", "Essen während"),
    ],
  };
}

const endSentence = (text) => (/[.!?]$/.test(text) ? text : `${text}.`);
const withHint = (text, hint) => (hint ? `${endSentence(text)} ${hint}` : text);

/** Export-Fassung des „Essen vorher"-Hinweises: ohne persönliche Gramm-Zahl
 *  (sie würde das Gewicht verraten), endet auf „1–4 g KH pro kg". */
const plainPreHint = (hint) =>
  hint ? hint.replace(/\s*\(bei dir[^)]*\)/, "").replace(/ Körpergewicht$/, "") : hint;

const rpeLabel = ({ min, max }) => (min === max ? `RPE ${min}` : `RPE ${min}–${max}`);

/**
 * Klartext für .zwo und intervals.icu-Push (Fahrplan 34, V6): eine Zeile je
 * Abschnitt, ohne Quellen und ohne persönliche Gramm-Zahl. Leerer Guide → "".
 * @param {SessionGuide|null|undefined} guide
 * @returns {string}
 */
export function sessionGuideText(guide) {
  if (!guide || !Array.isArray(guide.sections)) return "";
  /** @type {Record<string, (s: GuideSection) => string>} */
  const line = {
    ziel: (s) => `Ziel: ${s.text}`,
    rpe: (s) => `${rpeLabel(guide.rpe)}: ${s.text}`,
    cue: (s) => `So fährst du es: ${s.text}`,
    kadenz: (s) => `Kadenz: ${s.text}`,
    fuelPre: (s) => `Essen vorher: ${withHint(s.text, plainPreHint(s.hint ?? null))}`,
    fuelInter: (s) => `Essen während: ${withHint(s.text, s.hint ?? null)}`,
  };
  return guide.sections
    .filter((s) => line[s.id])
    .map((s) => line[s.id](s))
    .join("\n");
}
