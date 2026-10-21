/* ============================================================
   DEMO/LIB/ROSTER.JS — Demo-Besetzung (Fahrplan 31, Vertrag V2)
   Rein fiktive Personen. Namen/IDs müssen exakt zu
   app/src/config.ts::DEMO_ATHLETES passen (E5). Keine echten Namen,
   Orte oder Koordinaten in dieser Datei.
   ============================================================ */

/**
 * Plan-Eingabe je Sportart für generatePlan() — eine Sportart pro Aufruf,
 * Mehrsport = mehrere Aufrufe, zusammengeführt in timeline.js.
 * @typedef {Object} DemoSportPlan
 * @property {"ride"|"run"|"swim"} sport
 * @property {number[]} trainingWeekdays  ISO 1..7, aufsteigend
 * @property {number} weeklyHours
 * @property {number|null} thresholdSpeed  km/h — nur "run"/"swim"
 */

/**
 * @typedef {Object} DemoAthlete
 * @property {"demo1"|"demo2"} id
 * @property {string} displayName  = profiles.display_name = DEMO_ATHLETES[].name
 * @property {string} email
 * @property {string} endpoint  URL-Pfad, den die App abruft (nie <repo>/data/ auf der Platte)
 * @property {Array<"ride"|"run"|"swim">} sports
 * @property {[number, number, number]} ftpSeason  FTP Saisonstart → nach Sprung 1 → nach Sprung 2
 * @property {number} ftpGoal  = DEMO_ATHLETES[].ftpGoal (E7: eine Quelle für Ziel-Ring und goals)
 * @property {{ birthdate: string, heightCm: number, sex: "m"|"f", gender: "maennlich"|"weiblich" }} profile
 *   erfundene Profil-Grunddaten (E7) — der Seed ergänzt damit leere Felder
 * @property {number} weightKg
 * @property {number} hrMax
 * @property {number} hrRest
 * @property {number} hrvBase  rMSSD in ms
 * @property {{ base: number, peak: number }} weeklyTss  Grundlage → Peak (für E2)
 * @property {string} sourceLabel  Datenquellen-Text
 * @property {"einsteiger"|"fortgeschritten"} level
 * @property {DemoSportPlan[]} plans
 * @property {string[]} raceNames  fiktive Rennnamen, ohne Ortsbezug
 */

/** @type {DemoAthlete[]} */
export const DEMO_ROSTER = [
  {
    id: "demo1",
    displayName: "lena.rides",
    email: "lena.rides@demo.local",
    endpoint: "data/rides-demo1.json",
    sports: ["ride"],
    ftpSeason: [205, 214, 222],
    ftpGoal: 232,
    profile: { birthdate: "1995-04-12", heightCm: 168, sex: "f", gender: "weiblich" },
    weightKg: 64,
    hrMax: 188,
    hrRest: 50,
    hrvBase: 62,
    weeklyTss: { base: 380, peak: 560 },
    sourceLabel: "Wahoo · Garmin",
    level: "fortgeschritten",
    plans: [
      { sport: "ride", trainingWeekdays: [2, 3, 4, 6, 7], weeklyHours: 8, thresholdSpeed: null },
    ],
    raceNames: [
      "Frühjahrs-Klassiker",
      "Hügel-Rundfahrt",
      "Gravel-Marathon",
      "Saisonfinale-Kriterium",
    ],
  },
  {
    id: "demo2",
    displayName: "tri_jonas",
    email: "tri_jonas@demo.local",
    endpoint: "data/rides-demo2.json",
    sports: ["ride", "run", "swim"],
    ftpSeason: [238, 246, 252],
    ftpGoal: 262,
    profile: { birthdate: "1991-09-03", heightCm: 181, sex: "m", gender: "maennlich" },
    weightKg: 73,
    hrMax: 182,
    hrRest: 46,
    hrvBase: 75,
    weeklyTss: { base: 480, peak: 720 },
    sourceLabel: "Garmin",
    level: "fortgeschritten",
    // 6 Trainingstage (Mo frei), Doppel-Tage Di/Fr/So
    plans: [
      { sport: "ride", trainingWeekdays: [2, 4, 6, 7], weeklyHours: 5, thresholdSpeed: null },
      { sport: "run", trainingWeekdays: [3, 5, 7], weeklyHours: 3, thresholdSpeed: 13.5 },
      { sport: "swim", trainingWeekdays: [2, 5], weeklyHours: 2, thresholdSpeed: 3.6 },
    ],
    raceNames: ["Sprint-Triathlon", "Duathlon-Cup", "Olympische Distanz", "Mitteldistanz"],
  },
];

/** Festes, dokumentiertes Passwort aller Demo-Accounts (Q13). Nur in der
 *  lokalen Demo-Datenbank gültig — kein echtes Geheimnis. */
export const DEMO_PASSWORD = "demo-lokal-2026";

/** Trainer der Demo — ohne eigenen Datenslot. */
export const DEMO_COACH = {
  displayName: "Coach Mara",
  email: "coach.mara@demo.local",
  coachOf: ["demo1", "demo2"],
};

/**
 * @param {string} athleteId
 * @returns {DemoAthlete}
 */
export function demoAthlete(athleteId) {
  const a = DEMO_ROSTER.find((x) => x.id === athleteId);
  if (!a) throw new Error(`Unbekannter Demo-Athlet: ${athleteId}`);
  return a;
}
