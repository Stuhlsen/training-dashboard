/* ============================================================
   CORE/VALIDATE.JS — Leichte Laufzeit-Schema-Validierung (kein DOM)
   Warnt früh, wenn sich das Schema von rides.json/rides-2.json
   unbeabsichtigt ändert — statt dass Charts einfach leer bleiben.

   Schema-Syntax: "typ" oder "typ?" (nullable/optional).
   Typen: string, number, boolean, object, array
   Enum:  "enum:a|b|c" bzw. "enum:a|b|c?" (fester Wertevorrat, optional)
   ============================================================ */

/** Prüft einen Wert gegen einen Schema-Typ ("number?", "string", "enum:x|y?", …)
 *  @param {unknown} value @param {string} spec @returns {boolean} */
function matchesType(value, spec) {
  const optional = spec.endsWith("?");
  const type = optional ? spec.slice(0, -1) : spec;
  if (value == null) return optional;
  // Fester Wertevorrat (z.B. sport: "ride"|"run"|"swim"|"other") — eine
  // Abweichung ist wie jede andere RIDE_SCHEMA-Abweichung nur eine Warnung,
  // nicht fatal (nur fehlende/leere `rides` brechen den Load ab).
  if (type.startsWith("enum:")) return type.slice(5).split("|").includes(String(value));
  if (type === "array") return Array.isArray(value);
  if (type === "object") return typeof value === "object" && !Array.isArray(value);
  return typeof value === type;
}

/**
 * Prüft ein Objekt gegen ein Schema und liefert Abweichungen als Strings.
 * @param {Object|null|undefined} obj
 * @param {Record<string, string>} schema Feld → Typ-Spec
 * @param {string} label Kontext für die Meldung (z.B. "rides[0]")
 * @returns {string[]}
 */
export function checkObject(obj, schema, label) {
  if (obj == null || typeof obj !== "object") return [`${label}: kein Objekt`];
  const problems = [];
  for (const [field, spec] of Object.entries(schema)) {
    if (!matchesType(obj[field], spec)) {
      // Bei einem Enum ist der konkrete Wert aussagekräftiger als sein `typeof`.
      const got =
        obj[field] === null
          ? "null"
          : spec.startsWith("enum:")
            ? JSON.stringify(obj[field])
            : typeof obj[field];
      problems.push(`${label}.${field}: erwartet ${spec}, erhalten ${got}`);
    }
  }
  return problems;
}

/* ── Schemata ────────────────────────────────────────────────── */

export const RIDE_SCHEMA = {
  date: "string",
  activityId: "string?",
  name: "string?",
  typ: "string?",
  typPlanned: "string?",
  typDetected: "string?",
  typDetection: "object?",
  compliance: "object?",
  typSource: "string?",
  dataSource: "string?",
  // Fahrplan 10 V1/V2 — optionales Sportart-Feld. Fehlt in Alt-Payloads;
  // wird überall als "ride" gelesen (app/src/core/activity-sport.js).
  sport: "enum:ride|run|swim|other?",
  week: "string?",
  km: "number?",
  hmProKm: "number?",
  min: "number?",
  kmh: "number?",
  hf: "number?",
  hfMax: "number?",
  kad: "number?",
  watt: "number?",
  np: "number?",
  trimp: "number?",
  tss: "number?",
  ctl: "number?",
  atl: "number?",
  tsb: "number?",
  decoupling: "number?",
  ruhepuls: "number?",
  hrv: "number?",
  feel: "string?",
  // Nach-Fahrt-Befinden aus intervals.icu (nicht das manuelle `feel` oben)
  rpe: "number?",
  feelIcu: "number?",
  weather: "object?",
  zoneTimes: "array?",
  eftp: "number?",
};

export const WELLNESS_SCHEMA = {
  date: "string",
  sleepHours: "number?",
  sleepScore: "number?",
  avgSleepingHR: "number?",
  restingHR: "number?",
  hrv: "number?",
  // "sdnn" (Apple Health) oder "rmssd" (Garmin) — HRV-Messmethode der Reihe,
  // nie gemischt (scripts/lib/wellness.js::pickHrvMethod)
  hrvMethod: "string?",
  // Regeneration & Körper (Sync-Erweiterung, siehe scripts/lib/wellness.js)
  weight: "number?",
  bodyFat: "number?",
  activeEnergy: "number?",
  restingEnergy: "number?",
  kcalConsumed: "number?",
  hydration: "number?",
  hydrationVolume: "number?",
  // eFTP aus Wellness-sportInfo (Tageswert für die FTP-Prognose)
  eftp: "number?",
};

/** Öffentlicher Ramp-Test-Eintrag im rides*.json-Payload (Migration 0025,
 *  scripts/generate-data.js::publicFtpFields) — Teilmenge von ftp_history
 *  ohne `note`, mit synthetischer id. */
export const FTP_HISTORY_SCHEMA = {
  id: "string",
  ftpWatt: "number",
  validFrom: "string",
  source: "string?",
};

const PAYLOAD_SCHEMA = {
  rides: "array",
  wellness: "array?",
  wellnessMeta: "object?",
  powerCurves: "object?",
  athleteWeight: "number?",
  // Aktuelle gemessene FTP + Sichtbarkeits-Flag + Ramp-Test-Zeitstrahl
  // (scripts/generate-data.js::publicFtpFields, Migration 0025). `ftp` fehlte
  // hier bisher, obwohl Athlet 2 es seit jeher liefert — mit ergänzt.
  ftp: "number?",
  ftpPublic: "boolean?",
  ftpHistory: "array?",
  plannedSessions: "array?",
  adjustments: "object?",
  forecast: "object?",
  updated: "string?",
};

/**
 * Validiert das komplette rides.json/rides-2.json-Payload.
 * Prüft Top-Level-Felder plus stichprobenartig die ersten Einträge der
 * Listen (Vollprüfung wäre bei jedem Load unnötig teuer).
 * @param {Object|null|undefined} json
 * @returns {string[]} Liste der Probleme — leer wenn alles passt
 */
export function validateRidesPayload(json) {
  const problems = checkObject(json, PAYLOAD_SCHEMA, "payload");
  if (problems.length) return problems;

  if (!json.rides.length) {
    problems.push("payload.rides: leeres Array");
    return problems;
  }

  const sampleSize = Math.min(3, json.rides.length);
  for (let i = 0; i < sampleSize; i++) {
    problems.push(...checkObject(json.rides[i], RIDE_SCHEMA, `rides[${i}]`));
  }
  const wellness = json.wellness || [];
  for (let i = 0; i < Math.min(2, wellness.length); i++) {
    problems.push(...checkObject(wellness[i], WELLNESS_SCHEMA, `wellness[${i}]`));
  }
  const ftpHistory = Array.isArray(json.ftpHistory) ? json.ftpHistory : [];
  for (let i = 0; i < Math.min(2, ftpHistory.length); i++) {
    problems.push(...checkObject(ftpHistory[i], FTP_HISTORY_SCHEMA, `ftpHistory[${i}]`));
  }
  return problems;
}
