import { supabase, getAuthedClient } from "./client";
import type { Result } from "../types";

const NOT_CONFIGURED = { code: "UNKNOWN" as const, message: "Supabase nicht konfiguriert" };

/** Schreibwert für den Admin-Editor (Fahrplan 8 E11). Feldnamen wie im
 *  Formular-View-Model; hier nach snake_case für die Tabelle übersetzt. */
export interface SessionFormatInput {
  id: string;
  label: string;
  targetSystem: string;
  currency: string;
  evidenceGrade: string;
  blockTargets: string[];
  axes: { explicitSteps: Record<string, unknown>[] };
}

/** Änderbare Spalten in snake_case — ohne den Primärschlüssel `id`. */
function toPatch(input: SessionFormatInput) {
  return {
    label: input.label,
    target_system: input.targetSystem,
    currency: input.currency,
    evidence_grade: input.evidenceGrade,
    block_targets: input.blockTargets,
    axes: input.axes,
  };
}

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

/** Neues Format anlegen (Admin, Migration 0014: Insert nur für `is_admin()`).
 *  RLS wirft bei fehlender Berechtigung — kein clientseitiges Rollen-Gate hier. */
export async function createSessionFormat(input: SessionFormatInput): Promise<Result<{ id: string }>> {
  if (!supabase) return { ok: false, error: NOT_CONFIGURED };
  const client = (await getAuthedClient()) ?? supabase;
  const { error } = await client.from("session_formats").insert({ id: input.id, ...toPatch(input) });
  if (error) return { ok: false, error: { code: "UNKNOWN", message: error.message } };
  return { ok: true, id: input.id };
}

/** Bestehendes Format ändern. `id` bleibt der Primärschlüssel und wird nicht
 *  mitgeschrieben. */
export async function updateSessionFormat(id: string, input: SessionFormatInput): Promise<Result> {
  if (!supabase) return { ok: false, error: NOT_CONFIGURED };
  const client = (await getAuthedClient()) ?? supabase;
  const { error } = await client.from("session_formats").update(toPatch(input)).eq("id", id);
  if (error) return { ok: false, error: { code: "UNKNOWN", message: error.message } };
  return { ok: true };
}

/** Format löschen. `athlete_formats.format_id` hat `on delete cascade`
 *  (Migration 0014) — eine Zuordnung, die das Format nutzt, verschwindet mit. */
export async function deleteSessionFormat(id: string): Promise<Result> {
  if (!supabase) return { ok: false, error: NOT_CONFIGURED };
  const client = (await getAuthedClient()) ?? supabase;
  const { error } = await client.from("session_formats").delete().eq("id", id);
  if (error) return { ok: false, error: { code: "UNKNOWN", message: error.message } };
  return { ok: true };
}
