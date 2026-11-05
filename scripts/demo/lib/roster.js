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
 * @property {"demo1"|"demo2"|"demo3"} id
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
 * @property {Array<"ride"|"run"|"swim">} [planGroup]  Sportarten, deren Pläne eine gemeinsame
 *   plan_group_id tragen (Fahrplan 44 E7); fehlt = keine Gruppe
 * @property {string[]} raceNames  fiktive Rennnamen, ohne Ortsbezug
 * @property {DemoGoal[]} goals  Hauptziel zuerst, höchstens ein Nebenziel (Fahrplan 43 E7)
 * @property {DemoNutritionGoal|null} nutritionGoal  Ernährungsziel passend zu "Fett verlieren", sonst null
 */

/**
 * Ein Ziel der Demo. `key` = Katalogschlüssel (app/src/core/goals.js), `kind` =
 * Freitext-Art in goals.kind (für FTP fest "FTP", sonst das Katalog-Label).
 * `ftpValue`: Zielwert = ftpGoal der Besetzung; `dated`: Zieldatum = nächstes
 * Hauptrennen. Gewichtswerte stehen nie hier, nur in DemoNutritionGoal.
 * @typedef {Object} DemoGoal
 * @property {string} key
 * @property {"main"|"side"} role
 * @property {string} kind
 * @property {boolean} [ftpValue]
 * @property {boolean} [dated]
 */

/**
 * Erfundene Werte, append-only in nutrition_goals (Tempo als Betrag in kg/Woche).
 * @typedef {Object} DemoNutritionGoal
 * @property {"lose"} goalType
 * @property {number} targetWeightKg
 * @property {number} pacePerWeekKg
 */

/** Feste, erfundene uuid der Demo-Plangruppe (Fahrplan 44 E7). Fest statt
 *  zufällig, damit der ergänzende Seed sie bei jedem Lauf wiederfindet. */
export const DEMO_PLAN_GROUP_ID = "d3a0c0de-0000-4000-8000-000000000044";

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
    goals: [
      { key: "ftp", role: "main", kind: "FTP", ftpValue: true, dated: true },
      { key: "bergauf", role: "side", kind: "Besser bergauf" },
    ],
    nutritionGoal: null,
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
      { sport: "run", trainingWeekdays: [3, 5, 7], weeklyHours: 4, thresholdSpeed: 13.5 },
      { sport: "swim", trainingWeekdays: [2, 5], weeklyHours: 2, thresholdSpeed: 3.6 },
    ],
    // Rad + Laufen sind verknüpft (eine plan_group_id), Schwimmen läuft frei daneben.
    planGroup: ["ride", "run"],
    raceNames: ["Sprint-Triathlon", "Duathlon-Cup", "Olympische Distanz", "Mitteldistanz"],
    // Ausdauer als Hauptziel; "Fett verlieren" als Nebenziel füllt die offene Energie-Zeile
    // (goalNutritionProfile) — dazu passt die lose-Zeile in nutrition_goals.
    goals: [
      { key: "ausdauer", role: "main", kind: "Ausdauer", dated: true },
      { key: "fett_verlieren", role: "side", kind: "Fett verlieren" },
    ],
    nutritionGoal: { goalType: "lose", targetWeightKg: 70, pacePerWeekKg: 0.3 },
  },
];

/**
 * Demo-Athleten OHNE festen Platz in app/src/config.ts (Fahrplan 26 E3): kein
 * `rides-demo*.json`, die App liest sie über ihre Profil-UUID aus den
 * training_*-Tabellen — wie ein echter Account ohne Platz. Bewusst NICHT in
 * DEMO_ROSTER: generate.js schreibt nur Dateien für DEMO_ROSTER, und
 * config.demo.test.ts hält DEMO_ROSTER und DEMO_ATHLETES deckungsgleich.
 * Rein fiktiv; kein Trainer (self-only, wie ein Account ohne Platz).
 * @type {DemoAthlete[]}
 */
export const DEMO_TABLE_ONLY = [
  {
    id: "demo3",
    displayName: "nora.tables",
    email: "nora.tables@demo.local",
    endpoint: "",
    sports: ["ride"],
    ftpSeason: [190, 196, 203],
    ftpGoal: 212,
    profile: { birthdate: "1999-02-20", heightCm: 171, sex: "f", gender: "weiblich" },
    weightKg: 60,
    hrMax: 190,
    hrRest: 52,
    hrvBase: 66,
    weeklyTss: { base: 300, peak: 460 },
    sourceLabel: "Wahoo",
    level: "einsteiger",
    plans: [{ sport: "ride", trainingWeekdays: [3, 6, 7], weeklyHours: 5, thresholdSpeed: null }],
    // Genau CYCLES_PER_SEASON (4) Namen — ein fehlender macht das Event-Insert ungleich.
    raceNames: ["Stadtrunde-Kriterium", "Uferweg-Rennen", "Sommer-Rundfahrt", "Herbst-Tour"],
    goals: [{ key: "ftp", role: "main", kind: "FTP", ftpValue: true, dated: true }],
    nutritionGoal: null,
  },
];

/** Alle Demo-Athleten (mit und ohne Platz in config.ts). */
export const ALL_DEMO_ATHLETES = [...DEMO_ROSTER, ...DEMO_TABLE_ONLY];

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
  const a = ALL_DEMO_ATHLETES.find((x) => x.id === athleteId);
  if (!a) throw new Error(`Unbekannter Demo-Athlet: ${athleteId}`);
  return a;
}
