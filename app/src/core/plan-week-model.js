/* ============================================================
   CORE/PLAN-WEEK-MODEL.JS — Plan-Wochen-Modell (kein DOM)

   Eine card-unabhängige Quelle für „welche ISO-Woche gehört zu welcher
   Phase, und welche Wochentage darin sind Trainings-Slots" — für ALLE
   Athleten über dieselbe Struktur und dieselben Funktionen
   (Fahrplan 6, docs/fahrplan-6-ruhetag-planwochen-modell.md, Fenster RUH1).

   Ersetzt das bisherige Konzept „Ruhetag = gespeicherte plan_cards-Zeile":
   ein Ruhetag ist abgeleitet — ein Tag in einer aktiven Planwoche, der
   laut Wochen-Vorlage kein Trainings-Slot ist UND keine aktive Karte
   trägt (isDeliberateRestDay()).

   RUH1 baut nur die Datenstruktur + Funktionen + Tests. NICHTS ist
   angeschlossen — die Umstellung von conflicts.js / Frontend / Sync auf
   dieses Modul passiert erst in RUH3–RUH5.

   Parallelkopie: scripts/lib/core/plan-week-model.js (byte-identisch,
   gemeinsam pflegen — s. AGENTS.md „Codebase-Qualität").

   Herkunft der trainingWeekdays (einmalig abgeleitet, dann fest —
   RUH1-Entscheidungspunkt: statische Konstante, keine data/*.json-Datei):
   - Athlet 1: Wochentage mit typ !== "Ruhetag" in
     scripts/lib/plan2.js::PLANNED_SESSIONS. Standardmuster [1,2,4,5,6]
     (Mo lockere Z2 · Di Gruppenfahrt · Do Intervalle · Fr Recovery ·
     Sa SS-Ausdauerfahrt); Mi + So sind Ruhe-Slots. Woche/Phase/Datums-
     grenzen kommen unverändert aus PLAN2_SCHEDULE (plan2-schedule.js) —
     nicht dupliziert, nur um die Slot-Ebene erweitert.
   - Athlet 2: aus scripts/lib/plan-athlete2.js::PLANNED_SESSIONS_ATHLETE2.
     Standardmuster [2,3,4,6,7] (Mo + Fr Ruhe); die NLS-Wochen KW25/KW31
     (Do–Sa Renn-Trip statt Training, So frei) und die Taper-Woche KW35
     (Sa 29.08. bewusst frei, So 30.08. Renntag) weichen ab.
   - Athlet 4: aus scripts/lib/plan-athlete4.js::PLANNED_SESSIONS_ATHLETE4
     (deterministisch generiert). Muster [2,4,6,7] (Mo/Mi/Fr Ruhe),
     Testwoche KW47 zusätzlich ohne Do.

   ISO-Wochentag: 1 = Montag … 7 = Sonntag.
   ============================================================ */

import { PLAN2_SCHEDULE } from "./plan2-schedule.js";

/**
 * @typedef {Object} PlanWeekEntry
 * @property {string} week   ISO-Kalenderwoche (Athlet 1: "YYYY-KWnn", Athlet 2/4: "KWnn")
 * @property {string} phase  Periodisierungsphase
 * @property {string} start  erster Tag der Woche (ISO, "YYYY-MM-DD")
 * @property {string} end    letzter Tag der Woche (ISO, inklusive)
 * @property {number[]} trainingWeekdays  ISO-Wochentage (1=Mo…7=So) mit geplantem Training; Rest = Ruhe-Slot
 */

/** trainingWeekdays je ISO-Woche für Athlet 1 (s. Modulkopf). Deckt jede
 *  Woche aus PLAN2_SCHEDULE ab — der Abgleich wird im Test erzwungen. */
const ATHLETE1_TRAINING_WEEKDAYS = /** @type {Record<string, number[]>} */ ({
  "2026-KW26": [2, 4, 6], //          W0 Übergang (Historie, Teilwoche Di/Do/Sa)
  "2026-KW27": [1, 2, 4, 5, 6], //    W1 Sweet Spot
  "2026-KW28": [1, 2, 4, 5, 6], //    W2 Sweet Spot
  "2026-KW29": [1, 2, 4, 5, 6], //    W3 Sweet Spot
  "2026-KW30": [1, 2, 4, 5, 6], //    W4 Erholung
  "2026-KW31": [1, 2, 4, 5, 6], //    W5 Schwelle
  "2026-KW32": [1, 2, 4, 5, 6], //    W6 Schwelle
  "2026-KW33": [1, 2, 4, 5, 6], //    W7 Schwelle
  "2026-KW34": [1, 2, 4, 5, 6], //    W8 Erholung
  "2026-KW35": [1, 2, 4, 5, 6], //    W9 VO2max
  "2026-KW36": [1, 2, 4, 5, 6], //    W10 VO2max
  "2026-KW37": [1, 2, 4, 5, 6], //    W11 VO2max
  "2026-KW38": [1, 2, 4, 6], //       W12 Taper — Fr (18.09.) ist Ruhe-Slot, So (20.09.) ebenfalls
});

/** Athlet 1: PLAN2_SCHEDULE (Woche/Phase/Datumsgrenzen) + Slot-Ebene. */
const ATHLETE1_WEEKS = PLAN2_SCHEDULE.map((w) => ({
  ...w,
  trainingWeekdays: ATHLETE1_TRAINING_WEEKDAYS[w.week] ?? [],
}));

/** Athlet 2 — GFNY Bremen 2026 (scripts/lib/plan-athlete2.js). Renntag
 *  So 30.08. (KW35). Wochen-Keys ohne Jahrespräfix wie im Plan. */
const ATHLETE2_WEEKS = /** @type {PlanWeekEntry[]} */ ([
  { week: "KW23", phase: "Basis", start: "2026-06-01", end: "2026-06-07", trainingWeekdays: [2, 3, 4, 6, 7] },
  { week: "KW24", phase: "Basis", start: "2026-06-08", end: "2026-06-14", trainingWeekdays: [2, 3, 4, 6, 7] },
  { week: "KW25", phase: "Basis", start: "2026-06-15", end: "2026-06-21", trainingWeekdays: [2, 3, 4, 5, 6] }, // NLS6 Eifel Trophy: Do–Sa Renn-Trip, So frei
  { week: "KW26", phase: "Basis", start: "2026-06-22", end: "2026-06-28", trainingWeekdays: [2, 3, 4, 6, 7] },
  { week: "KW27", phase: "Aufbau", start: "2026-06-29", end: "2026-07-05", trainingWeekdays: [2, 3, 4, 6, 7] },
  { week: "KW28", phase: "Aufbau", start: "2026-07-06", end: "2026-07-12", trainingWeekdays: [2, 3, 4, 6, 7] },
  { week: "KW29", phase: "Aufbau", start: "2026-07-13", end: "2026-07-19", trainingWeekdays: [2, 3, 4, 6, 7] },
  { week: "KW30", phase: "Aufbau", start: "2026-07-20", end: "2026-07-26", trainingWeekdays: [2, 3, 4, 6, 7] },
  { week: "KW31", phase: "Rennhärte", start: "2026-07-27", end: "2026-08-02", trainingWeekdays: [2, 3, 4, 5, 6] }, // NLS7 Ruhr-Pokal: Do–Sa Renn-Trip, So frei
  { week: "KW32", phase: "Rennhärte", start: "2026-08-03", end: "2026-08-09", trainingWeekdays: [2, 3, 4, 6, 7] },
  { week: "KW33", phase: "Rennhärte", start: "2026-08-10", end: "2026-08-16", trainingWeekdays: [2, 3, 4, 6, 7] },
  { week: "KW34", phase: "Rennhärte", start: "2026-08-17", end: "2026-08-23", trainingWeekdays: [2, 3, 4, 6, 7] },
  { week: "KW35", phase: "Taper", start: "2026-08-24", end: "2026-08-30", trainingWeekdays: [2, 3, 4, 5, 7] }, // Fr 28.08. = Notiz-Karte (RUH2), Sa 29.08. bewusst frei, So 30.08. Renntag
]);

/** Athlet 4 — Einsteigervorlage „bentastiic" (scripts/lib/plan-athlete4.js),
 *  12 Wochen ab Mo 2026-08-31 (KW36). Muster Di/Do/Sa/So, Testwoche KW47
 *  ohne Do. */
const ATHLETE4_WEEKS = /** @type {PlanWeekEntry[]} */ ([
  { week: "KW36", phase: "Einstieg", start: "2026-08-31", end: "2026-09-06", trainingWeekdays: [2, 4, 6, 7] },
  { week: "KW37", phase: "Einstieg", start: "2026-09-07", end: "2026-09-13", trainingWeekdays: [2, 4, 6, 7] },
  { week: "KW38", phase: "Einstieg", start: "2026-09-14", end: "2026-09-20", trainingWeekdays: [2, 4, 6, 7] },
  { week: "KW39", phase: "Erholung", start: "2026-09-21", end: "2026-09-27", trainingWeekdays: [2, 4, 6, 7] },
  { week: "KW40", phase: "Grundlagen", start: "2026-09-28", end: "2026-10-04", trainingWeekdays: [2, 4, 6, 7] },
  { week: "KW41", phase: "Grundlagen", start: "2026-10-05", end: "2026-10-11", trainingWeekdays: [2, 4, 6, 7] },
  { week: "KW42", phase: "Grundlagen", start: "2026-10-12", end: "2026-10-18", trainingWeekdays: [2, 4, 6, 7] },
  { week: "KW43", phase: "Erholung", start: "2026-10-19", end: "2026-10-25", trainingWeekdays: [2, 4, 6, 7] },
  { week: "KW44", phase: "Steigerung", start: "2026-10-26", end: "2026-11-01", trainingWeekdays: [2, 4, 6, 7] },
  { week: "KW45", phase: "Steigerung", start: "2026-11-02", end: "2026-11-08", trainingWeekdays: [2, 4, 6, 7] },
  { week: "KW46", phase: "Steigerung", start: "2026-11-09", end: "2026-11-15", trainingWeekdays: [2, 4, 6, 7] },
  { week: "KW47", phase: "Test", start: "2026-11-16", end: "2026-11-22", trainingWeekdays: [2, 6, 7] }, // Do frei (Testwoche)
]);

/**
 * Plan-Wochen je Athlet. Schlüssel = interne Athleten-ID (app/src/config.ts
 * → athletes[].id). Die interne ID `athlete3` ist reserviert, aber nicht
 * verdrahtet (s. AGENTS.md „Athleten").
 * @type {Record<string, PlanWeekEntry[]>}
 */
export const PLAN_WEEK_MODEL = {
  athlete1: ATHLETE1_WEEKS,
  athlete2: ATHLETE2_WEEKS,
  athlete4: ATHLETE4_WEEKS,
};

/** ISO-Wochentag (1 = Mo … 7 = So) eines ISO-Datums, zeitzonenfrei über
 *  Date.UTC (kein „T00:00:00"-Parsing, das je nach Serverzeitzone kippt).
 *  @param {string} dateISO "YYYY-MM-DD"
 *  @returns {number} */
function isoWeekday(dateISO) {
  const [y, m, d] = dateISO.split("-").map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = So … 6 = Sa
  return ((dow + 6) % 7) + 1;
}

/**
 * Woche/Phase + Slot-Art für ein Datum, rein aus dem Plan-Wochen-Modell —
 * keine Karte, kein Ride nötig (analog getPlan2WeekPhase, aber athleten-
 * agnostisch und mit Trainings-/Ruhe-Slot).
 * @param {string} athleteId interne Athleten-ID ("athlete1"/"athlete2"/"athlete4")
 * @param {string} dateISO ISO-Datum ("YYYY-MM-DD")
 * @returns {{week: string|null, phase: string|null, isTrainingSlot: boolean, isRestSlot: boolean}}
 *   Kein Treffer (Datum außerhalb aller Planwochen, Athlet ohne Modell) →
 *   `{ week: null, phase: null, isTrainingSlot: false, isRestSlot: false }`.
 */
export function planWeekFor(athleteId, dateISO) {
  const miss = { week: null, phase: null, isTrainingSlot: false, isRestSlot: false };
  const weeks = PLAN_WEEK_MODEL[athleteId];
  if (!weeks || !dateISO) return miss;
  const entry = weeks.find((w) => dateISO >= w.start && dateISO <= w.end);
  if (!entry) return miss;
  const isTrainingSlot = entry.trainingWeekdays.includes(isoWeekday(dateISO));
  return { week: entry.week, phase: entry.phase, isTrainingSlot, isRestSlot: !isTrainingSlot };
}

/**
 * Abgeleiteter Ruhetag (Fahrplan-6-Definition): ein Tag in einer aktiven
 * Planwoche, der laut Vorlage KEIN Trainings-Slot ist UND KEINE aktive
 * (nicht ausgefallene) Karte trägt. Ein Datum außerhalb aller Planwochen
 * ist kein Ruhetag (`isRestSlot === false` dort) — nur innerhalb eines
 * definierten Plan-Zeitraums ist ein freier Tag ein bewusster Ruhetag
 * (dieselbe Logik wie fillRestDays() bisher, nur ohne die Karte zu
 * materialisieren).
 * @param {string} athleteId
 * @param {string} dateISO
 * @param {boolean} hasActiveCard ob an dem Datum eine nicht-ausgefallene Karte liegt
 * @returns {boolean}
 */
export function isDeliberateRestDay(athleteId, dateISO, hasActiveCard) {
  return planWeekFor(athleteId, dateISO).isRestSlot && !hasActiveCard;
}
