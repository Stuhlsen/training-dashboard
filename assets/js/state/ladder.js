/* ============================================================
   STATE/LADDER.JS — Leiterzustand des eingeloggten Athleten
   (Progressionssteuerung — docs/konzept-progressionssteuerung.md D2, L8)

   getLadderState() ist die zentrale Zusammenstellung für E1 (Export-Panel-
   Zeile) und das Briefing-Gedächtnis (core/export-briefing.js::
   buildMemorySection): NUR aktive Formate × aktuelle Stufe × die zwei
   Nachbarstufen × evidence_grade — nie der volle Katalog (L8).
   ============================================================ */

import { getSessionFormats as getSessionFormatsAdapter } from "../data-access/supabase/formats.js";
import { getAthleteFormats as getAthleteFormatsAdapter } from "../data-access/supabase/formats.js";
import {
  getLadderHistory as getLadderHistoryAdapter,
  recordLadderStep as recordLadderStepAdapter,
} from "../data-access/supabase/ladder.js";
import { getSession } from "./session.js";
import { localISODate } from "../core/format.js";
import { currentLadderStep, stepAt, neighborSteps, formatSummary } from "../core/ladder.js";

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
