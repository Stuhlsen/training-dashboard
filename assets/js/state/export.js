/* ============================================================
   STATE/EXPORT.JS — Claude-Export: Domänenobjekte zusammenziehen
   (Phase 4 — Export/Import-Workflow-Konzept §2)

   Zieht Profil (state/config.js/state/session.js), Events, Plan-Fenster,
   Ist-Fahrten, Wellbeing-Verlauf und Projektion/Konflikte aus den
   jeweiligen state/-Modulen zusammen und reicht sie an
   core/export-briefing.js weiter — der Dialog (ui/export-panel.js) kennt
   core/export-briefing.js nicht direkt (Konzept §2: "Datensammlung sitzt
   in state/, der Dialog in ui/ ruft nur state/ auf").
   ============================================================ */

import { buildExportText, exportFileName } from "../core/export-briefing.js";
import { localISODate, addDaysISO } from "../core/format.js";
import { CONFIG } from "./config.js";
import { Data } from "./data.js";
import { getState as getEventsState } from "./events.js";
import { getState as getPlanCardsState } from "./plan-cards.js";
import { loadRangeForAthlete } from "./wellbeing.js";
import { getSession } from "./session.js";

// Fester Umfang, kein Zeitraum-Regler (Konzept §2, Entscheidung): Plan-
// Fenster ohne Enddatum-Cutoff, Ist-Daten/Wellbeing je 4 Wochen zurück.
const ACTUALS_WEEKS = 4;
const WELLBEING_WEEKS = 4;

/** Baut den fertigen Export-Text (Prompt-Vorlage mit eingesetztem Briefing,
 *  eine Zeichenkette — Konzept §2) für den eingeloggten Athleten. Nur für
 *  den EIGENEN Plan sinnvoll; das Gate (nur der Athlet selbst, unabhängig
 *  vom betrachteten Athleten-Toggle) liegt bei ui/export-panel.js, analog
 *  zu ui/planned.js::_canEdit().
 *  @param {string} athleteId interne Kennung ("athlete1"/"athlete2") — nur
 *    für Dateiname/Config-Lookup, die Daten selbst kommen immer vom
 *    eingeloggten Athleten (Session), nie von einem betrachteten Fremdplan.
 *  @returns {Promise<{ok:true, text:string, fileName:string}|{ok:false, error:{code:string,message:string}}>} */
export async function buildClaudeExport(athleteId) {
  const user = getSession();
  if (!user) return { ok: false, error: { code: "UNKNOWN", message: "Nicht eingeloggt" } };

  const today = localISODate();
  const athleteCfg = CONFIG.athleteConfig(athleteId);
  const planState = getPlanCardsState();
  const planCards = (planState.cards || []).filter((c) => c.date >= today);

  const actualsFrom = addDaysISO(today, -7 * ACTUALS_WEEKS);
  const actuals = Data.byDate().filter((r) => r.dateISO >= actualsFrom);

  const wellbeingFrom = addDaysISO(today, -7 * WELLBEING_WEEKS);
  const wellbeingResult = await loadRangeForAthlete(user.id, wellbeingFrom, today);
  const wellbeing = wellbeingResult.ok ? wellbeingResult.checkins : [];

  const text = buildExportText({
    athleteId: user.id,
    displayName: user.displayName,
    ftp: athleteCfg?.ftpMeasured ?? Data.ftpValue(),
    ftpGoal: athleteCfg?.ftpGoal ?? null,
    dataSources: athleteCfg?.dataSources ?? [],
    events: getEventsState().events,
    planCards,
    actuals,
    wellbeing,
    projection: planState.projection,
    conflicts: planState.conflicts,
    today,
  });

  return { ok: true, text, fileName: exportFileName(athleteId, today) };
}
