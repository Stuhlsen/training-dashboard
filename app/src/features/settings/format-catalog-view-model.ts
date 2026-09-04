/* ============================================================
   FEATURES/SETTINGS/FORMAT-CATALOG-VIEW-MODEL.TS — Admin-Editor für
   session_formats (Fahrplan 8 E11, docs/fahrplan-8-plan-generator.md)

   Reine Funktionen: Formularentwurf ⇄ SessionFormatInput, Feld- und
   `axes.explicitSteps`-Schema-Validierung, BEVOR
   api/supabase/session-formats.ts überhaupt schreibt. Kein I/O, kein React
   — dasselbe Muster wie formats-view-model.ts (L1.1-Regel) und
   new-plan-dialog-view-model.ts.

   Die erlaubten Enum-Werte spiegeln die CHECK-Constraints aus Migration
   0014_session_formats.sql. Das Step-Schema je `currency` folgt der
   Feldbelegung der sechs Startformate (0014) und dem, was
   core/plan-workout-select.js / core/ladder.js je Familie lesen.
   ============================================================ */

export const TARGET_SYSTEMS = [
  "aerob-ermuedungsresistenz",
  "schwelle",
  "laktat-clearance",
  "vo2max",
  "neuromuskulaer",
] as const;

export const CURRENCIES = ["zone-time", "over-time", "time-above-90", "reps"] as const;

export const EVIDENCE_GRADES = ["studienlage", "coaching-konsens"] as const;

/** Vorschläge fürs Blockziel-Feld (Periodisierungs-Vokabular, V4 im
 *  Fahrplan / app/src/config.ts::PHASES). Freitext bleibt erlaubt — die
 *  Coaching-Praxis kann neue Blöcke einführen. */
export const BLOCK_TARGET_SUGGESTIONS = [
  "Grundlage",
  "Sweet Spot",
  "Schwelle",
  "VO2max",
  "Taper",
  "Erholung",
] as const;

/** Pflicht-Zahlenfelder je Stufe, abhängig von der `currency`. */
const STEP_NUMERIC_KEYS: Record<(typeof CURRENCIES)[number], string[]> = {
  "zone-time": ["pctFtp", "zoneTimeMin"],
  "time-above-90": ["pctFtp", "zoneTimeMin"],
  "over-time": ["pctFtpOver", "pctFtpUnder"],
  reps: ["reps", "workSec", "restMin"],
};

/** Formularzustand — alle Felder als Strings (Roh-Eingabe). */
export interface FormatDraft {
  id: string;
  label: string;
  targetSystem: string;
  currency: string;
  evidenceGrade: string;
  /** Komma-getrennt */
  blockTargets: string;
  /** JSON-Array-Text für `axes.explicitSteps` */
  stepsJson: string;
}

/** Validierter Schreibwert — Feldnamen wie im Adapter (createSessionFormat). */
export interface SessionFormatInput {
  id: string;
  label: string;
  targetSystem: string;
  currency: string;
  evidenceGrade: string;
  blockTargets: string[];
  axes: { explicitSteps: Record<string, unknown>[] };
}

export type ValidationResult =
  | { ok: true; value: SessionFormatInput }
  | { ok: false; errors: string[] };

export function emptyDraft(): FormatDraft {
  return {
    id: "",
    label: "",
    targetSystem: TARGET_SYSTEMS[0],
    currency: CURRENCIES[0],
    evidenceGrade: EVIDENCE_GRADES[1],
    blockTargets: "",
    stepsJson: "[\n  \n]",
  };
}

/** Bestehendes Format → Formularentwurf (für „Bearbeiten"). */
export function draftFromFormat(f: {
  id: string;
  label: string;
  targetSystem: string;
  currency: string;
  evidenceGrade: string;
  blockTargets: unknown[];
  axes: Record<string, unknown>;
}): FormatDraft {
  const steps = Array.isArray(f.axes?.explicitSteps) ? f.axes.explicitSteps : [];
  return {
    id: f.id,
    label: f.label,
    targetSystem: f.targetSystem,
    currency: f.currency,
    evidenceGrade: f.evidenceGrade,
    blockTargets: (f.blockTargets as unknown[]).map((b) => String(b)).join(", "),
    stepsJson: JSON.stringify(steps, null, 2),
  };
}

function splitBlockTargets(raw: string): string[] {
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isPositiveNumber(v: unknown): boolean {
  return typeof v === "number" && Number.isFinite(v) && v > 0;
}

/**
 * Prüft den `explicitSteps`-Text: gültiges JSON-Array, jede Stufe mit
 * nicht-leerem `id`/`structureLabel`, eindeutigen Stufen-IDs und den
 * `currency`-abhängigen Pflicht-Zahlenfeldern (> 0).
 */
export function validateSteps(
  stepsJson: string,
  currency: string,
): { ok: true; steps: Record<string, unknown>[] } | { ok: false; errors: string[] } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stepsJson);
  } catch (e) {
    return { ok: false, errors: [`Stufen-JSON ist ungültig: ${(e as Error).message}`] };
  }
  if (!Array.isArray(parsed)) return { ok: false, errors: ["Stufen müssen ein JSON-Array sein."] };
  if (parsed.length === 0) return { ok: false, errors: ["Mindestens eine Stufe angeben."] };

  const numericKeys = STEP_NUMERIC_KEYS[currency as (typeof CURRENCIES)[number]] ?? [];
  const errors: string[] = [];
  const seenIds = new Set<string>();

  parsed.forEach((step, i) => {
    const where = `Stufe ${i + 1}`;
    if (!isPlainObject(step)) {
      errors.push(`${where}: muss ein Objekt sein.`);
      return;
    }
    const id = step.id;
    if (typeof id !== "string" || !id.trim()) {
      errors.push(`${where}: \`id\` fehlt oder ist leer.`);
    } else if (seenIds.has(id)) {
      errors.push(`${where}: \`id\` "${id}" ist doppelt.`);
    } else {
      seenIds.add(id);
    }
    if (typeof step.structureLabel !== "string" || !step.structureLabel.trim()) {
      errors.push(`${where}: \`structureLabel\` fehlt oder ist leer.`);
    }
    for (const key of numericKeys) {
      if (!isPositiveNumber(step[key])) {
        errors.push(`${where}: \`${key}\` muss eine Zahl > 0 sein (currency "${currency}").`);
      }
    }
  });

  if (errors.length) return { ok: false, errors };
  return { ok: true, steps: parsed as Record<string, unknown>[] };
}

/** Kompletter Formularentwurf → Schreibwert oder Fehlerliste. */
export function validateFormatDraft(draft: FormatDraft): ValidationResult {
  const errors: string[] = [];

  const id = draft.id.trim();
  if (!id) errors.push("`id` ist Pflicht.");
  else if (!/^[a-z0-9][a-z0-9-]*$/.test(id))
    errors.push("`id` darf nur Kleinbuchstaben, Ziffern und Bindestriche enthalten.");

  const label = draft.label.trim();
  if (!label) errors.push("`label` ist Pflicht.");

  if (!TARGET_SYSTEMS.includes(draft.targetSystem as (typeof TARGET_SYSTEMS)[number]))
    errors.push(`\`target_system\` unbekannt: "${draft.targetSystem}".`);
  if (!CURRENCIES.includes(draft.currency as (typeof CURRENCIES)[number]))
    errors.push(`\`currency\` unbekannt: "${draft.currency}".`);
  if (!EVIDENCE_GRADES.includes(draft.evidenceGrade as (typeof EVIDENCE_GRADES)[number]))
    errors.push(`\`evidence_grade\` unbekannt: "${draft.evidenceGrade}".`);

  const stepsResult = validateSteps(draft.stepsJson, draft.currency);
  if (!stepsResult.ok) errors.push(...stepsResult.errors);

  if (errors.length) return { ok: false, errors };

  return {
    ok: true,
    value: {
      id,
      label,
      targetSystem: draft.targetSystem,
      currency: draft.currency,
      evidenceGrade: draft.evidenceGrade,
      blockTargets: splitBlockTargets(draft.blockTargets),
      axes: { explicitSteps: (stepsResult as { ok: true; steps: Record<string, unknown>[] }).steps },
    },
  };
}
