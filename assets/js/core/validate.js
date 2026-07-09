/* ============================================================
   CORE/VALIDATE.JS — Leichte Laufzeit-Schema-Validierung (kein DOM)
   Warnt früh, wenn sich das Schema von rides.json/rides-2.json
   unbeabsichtigt ändert — statt dass Charts einfach leer bleiben.

   Schema-Syntax: "typ" oder "typ?" (nullable/optional).
   Typen: string, number, boolean, object, array
   ============================================================ */

/** Prüft einen Wert gegen einen Schema-Typ ("number?", "string", …)
 *  @param {unknown} value @param {string} spec @returns {boolean} */
function matchesType(value, spec) {
  const optional = spec.endsWith("?");
  const type = optional ? spec.slice(0, -1) : spec;
  if (value == null) return optional;
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
      problems.push(
        `${label}.${field}: erwartet ${spec}, erhalten ${obj[field] === null ? "null" : typeof obj[field]}`
      );
    }
  }
  return problems;
}

/* ── Schemata ────────────────────────────────────────────────── */

export const RIDE_SCHEMA = {
  date: "string",
  name: "string?",
  typ: "string?",
  plan: "string?",
  week: "string?",
  km: "number?",
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
  weather: "object?",
  zoneTimes: "array?",
  eftp: "number?",
};

export const WELLNESS_SCHEMA = {
  date: "string",
  sleepHours: "number?",
  avgSleepingHR: "number?",
  restingHR: "number?",
  hrv: "number?",
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

const PAYLOAD_SCHEMA = {
  rides: "array",
  wellness: "array?",
  powerCurves: "object?",
  athleteWeight: "number?",
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
  return problems;
}
