/* ============================================================
   CORE/WORKOUT-VALIDATOR.JS — Struktur- und Semantikprüfung für
   plan_cards.workout_structure (kein DOM)
   (Progressionssteuerung — docs/konzept-progressionssteuerung.md D1)

   Prüft dasselbe JSON, das core/proposal-validator.js als
   payload.workout_structure durchreicht (Import UND menschlicher Trainer-
   Pfad — ein Validator für beide, analog zum Muster dort). Reihenfolge:
   erst Struktur (Version, bekannte Schrittarten, unbekannte Felder je Art),
   dann Semantik (Prozent-/Dauergrenzen, D1.4-Rest-Prüfung bei alternating).
   Sammelt ALLE Fehler statt beim ersten abzubrechen (Konzept §4-Muster).

   Flach, keine Verschachtelung (Entscheidung D1.1) — der 30/15-Fall wird
   als mehrere aufeinanderfolgende `set`-Schritte abgebildet, nicht als
   ein Schritt mit inneren Wiederholungen.
   ============================================================ */

export const WORKOUT_SCHEMA_VERSION = 1;

/** Bekannte Schrittarten (D1, D1.3). */
export const WORKOUT_STEP_KINDS = ["warmup", "cooldown", "steady", "set", "alternating", "accessory"];

const PCT_FTP_MIN = 1;
const PCT_FTP_MAX = 200; // großzügig, aber nicht unbegrenzt (Auftragsvorgabe)

const STRUCTURE_FIELDS = ["version", "steps"];

// Erlaubte Top-Level-Felder je Schrittart.
const STEP_FIELDS_BY_KIND = {
  warmup: ["kind", "duration_s", "target_pct_ftp"],
  cooldown: ["kind", "duration_s", "target_pct_ftp"],
  steady: ["kind", "duration_s", "target_pct_ftp"],
  set: ["kind", "reps", "work", "recovery"],
  // duration_s = Blockdauer (Entscheidung, s. AUFTRAG-Bericht "selbst
  // entschieden"): das Konzept-Beispiel zu D1.3 nennt "3 × 10 min mit
  // 2/2" nur als Beschriftung, ohne eigenes Dauerfeld — D1.4 ("cycles ×
  // (over+under) muss exakt der Blockdauer entsprechen") ist aber nur
  // gegen einen tatsächlich gespeicherten Zielwert prüfbar. duration_s
  // trägt deshalb hier die vom Ersteller beabsichtigte Blocklänge.
  alternating: ["kind", "reps", "cycles", "duration_s", "over", "under", "recovery"],
  accessory: ["kind", "subtype", "reps", "work", "recovery"],
};

function isPlainObject(v) {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isPositiveInt(v) {
  return Number.isInteger(v) && v > 0;
}

function isPlausiblePct(v) {
  return Number.isFinite(v) && v >= PCT_FTP_MIN && v <= PCT_FTP_MAX;
}

/** Validiert eine Dauer/Intensitäts-Phase ({duration_s, target_pct_ftp}
 *  bzw. bei accessory-Arbeit {duration_s, target: "max"} — D1.2-Ausnahme).
 *  @param {any} phase @param {string} path Fehlerpräfix, z. B. "work"
 *  @param {string[]} errors @param {{allowMax?: boolean}} [opts] */
function validatePhase(phase, path, errors, { allowMax = false } = {}) {
  if (!isPlainObject(phase)) {
    errors.push(`${path} fehlt oder ist kein Objekt.`);
    return;
  }
  const allowed = allowMax ? ["duration_s", "target_pct_ftp", "target"] : ["duration_s", "target_pct_ftp"];
  const unknown = Object.keys(phase).filter((k) => !allowed.includes(k));
  if (unknown.length) errors.push(`${path}: unbekannte Felder ${unknown.join(", ")}.`);

  if (!isPositiveInt(phase.duration_s)) errors.push(`${path}.duration_s muss eine positive Ganzzahl sein.`);

  const hasPct = phase.target_pct_ftp != null;
  const hasMax = phase.target != null;
  if (allowMax) {
    if (hasPct && hasMax) {
      errors.push(`${path}: entweder target_pct_ftp oder target:"max", nicht beides.`);
    } else if (hasMax) {
      if (phase.target !== "max") errors.push(`${path}.target erlaubt nur den Wert "max".`);
    } else if (hasPct) {
      if (!isPlausiblePct(phase.target_pct_ftp)) errors.push(`${path}.target_pct_ftp außerhalb ${PCT_FTP_MIN}–${PCT_FTP_MAX}.`);
    } else {
      errors.push(`${path}: target_pct_ftp oder target:"max" fehlt.`);
    }
  } else {
    if (hasMax) errors.push(`${path}: target:"max" nur bei accessory-Arbeitsphasen erlaubt.`);
    if (!hasPct) {
      errors.push(`${path}.target_pct_ftp fehlt.`);
    } else if (!isPlausiblePct(phase.target_pct_ftp)) {
      errors.push(`${path}.target_pct_ftp außerhalb ${PCT_FTP_MIN}–${PCT_FTP_MAX}.`);
    }
  }
}

function validateStep(step, index, errors) {
  const path = `steps[${index}]`;
  if (!isPlainObject(step)) {
    errors.push(`${path} ist kein Objekt.`);
    return;
  }
  const kind = step.kind;
  if (!WORKOUT_STEP_KINDS.includes(kind)) {
    errors.push(`${path}.kind unbekannt oder fehlt ('${kind ?? "fehlt"}').`);
    return;
  }

  const allowedFields = STEP_FIELDS_BY_KIND[kind];
  const unknown = Object.keys(step).filter((k) => !allowedFields.includes(k));
  if (unknown.length) errors.push(`${path}: unbekannte Felder für '${kind}': ${unknown.join(", ")}.`);

  if (kind === "warmup" || kind === "cooldown" || kind === "steady") {
    if (!isPositiveInt(step.duration_s)) errors.push(`${path}.duration_s muss eine positive Ganzzahl sein.`);
    if (!isPlausiblePct(step.target_pct_ftp)) {
      errors.push(`${path}.target_pct_ftp fehlt oder liegt außerhalb ${PCT_FTP_MIN}–${PCT_FTP_MAX}.`);
    }
    return;
  }

  if (kind === "set") {
    if (!isPositiveInt(step.reps)) errors.push(`${path}.reps muss eine positive Ganzzahl sein.`);
    validatePhase(step.work, `${path}.work`, errors);
    validatePhase(step.recovery, `${path}.recovery`, errors);
    return;
  }

  if (kind === "accessory") {
    if (typeof step.subtype !== "string" || !step.subtype.trim()) errors.push(`${path}.subtype fehlt.`);
    if (!isPositiveInt(step.reps)) errors.push(`${path}.reps muss eine positive Ganzzahl sein.`);
    validatePhase(step.work, `${path}.work`, errors, { allowMax: true });
    validatePhase(step.recovery, `${path}.recovery`, errors);
    return;
  }

  // alternating
  if (!isPositiveInt(step.reps)) errors.push(`${path}.reps muss eine positive Ganzzahl sein.`);
  if (!isPositiveInt(step.cycles)) errors.push(`${path}.cycles muss eine positive Ganzzahl sein.`);
  if (!isPositiveInt(step.duration_s)) errors.push(`${path}.duration_s muss eine positive Ganzzahl sein.`);
  validatePhase(step.over, `${path}.over`, errors);
  validatePhase(step.under, `${path}.under`, errors);
  validatePhase(step.recovery, `${path}.recovery`, errors);

  // D1.4: cycles × (over + under) muss exakt der Blockdauer entsprechen —
  // krumme Reste werden abgelehnt, nicht gerundet. Nur prüfbar, wenn die
  // Einzelwerte selbst schon gültig sind (sonst Folgefehler auf bereits
  // gemeldeten Fehlern).
  if (isPositiveInt(step.cycles) && isPositiveInt(step.duration_s) && isPlainObject(step.over) && isPlainObject(step.under)) {
    if (isPositiveInt(step.over.duration_s) && isPositiveInt(step.under.duration_s)) {
      const computed = step.cycles * (step.over.duration_s + step.under.duration_s);
      if (computed !== step.duration_s) {
        errors.push(
          `${path}: cycles × (over.duration_s + under.duration_s) = ${computed}s, erwartet duration_s = ${step.duration_s}s (D1.4, kein Runden).`
        );
      }
    }
  }
}

/** Validiert `plan_cards.workout_structure` — Version, Schrittartenkatalog,
 *  Feld- und Wertegrenzen je Schrittart, D1.4-Restprüfung bei `alternating`.
 *  @param {any} structure @returns {{valid: boolean, errors: string[]}} */
export function validateWorkoutStructure(structure) {
  const errors = [];
  if (!isPlainObject(structure)) {
    return { valid: false, errors: ["workout_structure ist kein Objekt."] };
  }

  const unknown = Object.keys(structure).filter((k) => !STRUCTURE_FIELDS.includes(k));
  if (unknown.length) errors.push(`Unbekannte Felder: ${unknown.join(", ")}.`);

  if (structure.version !== WORKOUT_SCHEMA_VERSION) {
    errors.push(`Unbekannte Version (${structure.version ?? "fehlt"}), erwartet ${WORKOUT_SCHEMA_VERSION}.`);
  }

  if (!Array.isArray(structure.steps) || structure.steps.length === 0) {
    errors.push("steps fehlt oder ist eine leere Liste.");
    return { valid: errors.length === 0, errors };
  }

  structure.steps.forEach((step, i) => validateStep(step, i, errors));

  return { valid: errors.length === 0, errors };
}
