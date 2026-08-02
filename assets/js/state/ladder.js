/* ============================================================
   STATE/LADDER.JS — Leiterzustand des eingeloggten Athleten
   (Progressionssteuerung — docs/konzept-progressionssteuerung.md D2, L8)

   getLadderState() ist die zentrale Zusammenstellung für E1 (Export-Panel-
   Zeile) und das Briefing-Gedächtnis (core/export-briefing.js::
   buildMemorySection): NUR aktive Formate × aktuelle Stufe × die zwei
   Nachbarstufen × evidence_grade — nie der volle Katalog (L8).

   getPresetSuggestion() (D4b, Auftrag "Preset-Umstellung, scharf geschaltet
   nur für Athlet 1"): die Stelle, die profiles.ladder_progression_enabled
   (Migration 0016) VOR core/ladder-progression.js::presetAction() prüft —
   ohne Freigabe bleibt es beim reinen D4a-Beobachtungsmodus (kein
   Stufenvorschlag). Schreibt selbst nichts nach ladder_history (s.
   Kopfkommentar core/ladder-progression.js) — liefert nur den
   gate-geprüften Vorschlag, den ein Aufrufer anzeigen (oder später bestätigt
   selbst schreiben) kann.
   ============================================================ */

import { getSessionFormats as getSessionFormatsAdapter } from "../data-access/supabase/formats.js";
import { getAthleteFormats as getAthleteFormatsAdapter } from "../data-access/supabase/formats.js";
import {
  getLadderHistory as getLadderHistoryAdapter,
  recordLadderStep as recordLadderStepAdapter,
} from "../data-access/supabase/ladder.js";
import { getProfile as getProfileAdapter } from "../data-access/supabase/profiles.js";
import { getSession } from "./session.js";
import { localISODate } from "../core/format.js";
import { currentLadderStep, stepAt, neighborSteps, formatSummary } from "../core/ladder.js";
import { presetAction } from "../core/ladder-progression.js";

/** Rohe Leiterhistorie des eingeloggten Athleten. */
export async function getLadderHistory() {
  const user = getSession();
  if (!user) return { ok: true, history: [] };
  return getLadderHistoryAdapter(user.id);
}

/** Neuer Leiterstand-Eintrag für den eingeloggten Athleten — `validFrom`
 *  defaultet auf heute (state/ darf core/format.js importieren, anders als
 *  data-access/, s. dortiger Kommentar).
 *  @param {{formatId:string, step:number, reason:string, sourceRideId?:string|null}} entry */
export async function recordLadderStep(entry) {
  const user = getSession();
  if (!user) return { ok: false, error: { code: "UNKNOWN", message: "Nicht eingeloggt" } };
  return recordLadderStepAdapter(user.id, { ...entry, validFrom: localISODate() });
}

/**
 * Zusammengesetzter Leiterzustand für E1/Briefing (L8): je aktivem Format
 * die aktuelle Stufe + zwei Nachbarstufen + evidence_grade. Inaktive/nicht
 * zugeordnete Formate tauchen hier nicht auf.
 * @returns {Promise<import("../types.js").Result & {formats?: Array<{
 *   formatId:string, label:string, evidenceGrade:string, step:number,
 *   stepData:Object|null, summary:string, neighbors:{prev:Object|null,next:Object|null}
 * }>}>}
 */
export async function getLadderState() {
  const user = getSession();
  if (!user) return { ok: true, formats: [] };

  const [catalogResult, athleteFormatsResult, historyResult] = await Promise.all([
    getSessionFormatsAdapter(),
    getAthleteFormatsAdapter(user.id),
    getLadderHistoryAdapter(user.id),
  ]);
  if (!catalogResult.ok) return catalogResult;
  if (!athleteFormatsResult.ok) return athleteFormatsResult;
  if (!historyResult.ok) return historyResult;

  const catalogById = new Map(catalogResult.formats.map((f) => [f.id, f]));
  const activeFormatIds = athleteFormatsResult.athleteFormats.filter((af) => af.active).map((af) => af.formatId);
  const today = localISODate();

  const formats = activeFormatIds
    .map((formatId) => {
      const format = catalogById.get(formatId);
      if (!format) return null;
      const current = currentLadderStep(historyResult.history, formatId, today);
      const step = current?.step ?? 1;
      const stepData = stepAt(format, step);
      return {
        formatId,
        label: format.label,
        evidenceGrade: format.evidenceGrade,
        step,
        stepData,
        summary: formatSummary(format, stepData, step),
        neighbors: neighborSteps(format, step),
      };
    })
    .filter(Boolean);

  return { ok: true, formats };
}

/**
 * D4b: Preset-Stufenvorschlag für ein Format — prüft ZUERST die
 * athletenweite Freigabe (profiles.ladder_progression_enabled, Migration
 * 0016). Ohne Freigabe (Default, aktuell für BEIDE Athleten, solange die
 * Migration nicht angewendet ist) bleibt es beim D4a-Beobachtungsmodus:
 * `enabled: false`, `suggestion: null` — kein Stufenvorschlag, nur die
 * bereits vorhandene Ampel-/Leiterstand-Information (getLadderState())
 * bleibt unverändert verfügbar. Mit Freigabe wird presetAction() (C4) auf
 * die aktuelle Stufe dieses Formats angewendet.
 * @param {"general"|"event"|"check"|"reduce"|"build"} preset
 * @param {string} formatId
 * @param {{rating?:string|null, rpe?:number|null, locked?:boolean,
 *   isTestEvent?:boolean, inTaper?:boolean}} [ctx]
 * @returns {Promise<import("../types.js").Result & {
 *   enabled?: boolean,
 *   suggestion?: {step:number, action:string, lockWeeks?:number}|null,
 * }>}
 */
export async function getPresetSuggestion(preset, formatId, ctx = {}) {
  const user = getSession();
  if (!user) return { ok: true, enabled: false, suggestion: null };

  const profileResult = await getProfileAdapter(user.id);
  if (!profileResult.ok) return profileResult;
  if (!profileResult.profile?.ladderProgressionEnabled) {
    return { ok: true, enabled: false, suggestion: null };
  }

  const historyResult = await getLadderHistoryAdapter(user.id);
  if (!historyResult.ok) return historyResult;

  const today = localISODate();
  const current = currentLadderStep(historyResult.history, formatId, today);
  const currentStep = current?.step ?? 1;
  const suggestion = presetAction(preset, { currentStep, ...ctx });

  return { ok: true, enabled: true, suggestion };
}
