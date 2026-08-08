import { supabase } from "./client";
import type { Result } from "../types";

export interface SessionFormat {
  id: string;
  label: string;
  targetSystem: string;
  currency: string;
  evidenceGrade: string;
  blockTargets: unknown[];
  /** `explicitSteps`-Liste oder `primary`/`secondary`/`tertiary`-Achsen —
   *  core/ladder.js liest beide Formen (s. dortiger Kopfkommentar). Immer
   *  ein JSON-Objekt zur Laufzeit, deshalb `Record<string, unknown>` statt
   *  `unknown` — sonst lässt sich der Wert nicht an core/ladder.js
   *  durchreichen (dessen JSDoc-Parametertyp `Object` erwartet). */
  axes: Record<string, unknown>;
}

interface FormatRow {
  id: string;
  label: string;
  target_system: string;
  currency: string;
  evidence_grade: string;
  block_targets: unknown[] | null;
  axes: Record<string, unknown>;
}

function toFormat(row: FormatRow): SessionFormat {
  return {
    id: row.id,
    label: row.label,
    targetSystem: row.target_system,
    currency: row.currency,
    evidenceGrade: row.evidence_grade,
    blockTargets: row.block_targets ?? [],
    axes: row.axes,
  };
}

/** Formatkatalog (D4, Migration 0014) — öffentlich lesbar, kein Login nötig. */
export async function getSessionFormats(): Promise<Result<{ formats: SessionFormat[] }>> {
  if (!supabase) return { ok: true, formats: [] };
  const { data, error } = await supabase
    .from("session_formats")
    .select("id, label, target_system, currency, evidence_grade, block_targets, axes");
  if (error) return { ok: false, error: { code: "UNKNOWN", message: error.message } };
  return { ok: true, formats: (data as FormatRow[]).map(toFormat) };
}
