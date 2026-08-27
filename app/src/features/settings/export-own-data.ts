/* ============================================================
   FEATURES/SETTINGS/EXPORT-OWN-DATA.TS — "Eigene Daten exportieren"
   (Datenschutz & Account)

   Reine Funktion, kein Hook — einmaliger Klick-Trigger, keine gecachte
   Query. Komponiert bestehende Adapter (kein neuer Supabase-Zugriff),
   löst einen normalen Browser-Download aus (Blob + <a download>), keine
   sandboxed-Artifact-API.

   Umfang bewusst: NUR aktive Ziele (getGoals() filtert serverseitig auf
   is_active — es gibt keinen Lesepfad für deaktivierte Ziele) — im
   erzeugten JSON als "activeGoals" benannt, damit das nicht als "alle
   Ziele" missverstanden wird.
   ============================================================ */

import { getGoals } from "../../api/supabase/goals";
import { getFtpHistory } from "../../api/supabase/ftp-history";
import { listPlanCards } from "../../api/supabase/plan-cards";
import { getRange } from "../../api/supabase/wellbeing";
import { catchResult, unwrap } from "../../api/result";
import { localISODate } from "../../core/format.js";
import type { Result } from "../../api/types";

async function collectOwnData(userId: string) {
  const [goalsResult, ftpResult, planCardsResult, checkinsResult] = await Promise.all([
    getGoals(userId),
    getFtpHistory(userId),
    listPlanCards(userId),
    getRange(userId, "2020-01-01", localISODate()),
  ]);
  const activeGoals = unwrap(goalsResult);
  const ftpHistory = unwrap(ftpResult);
  const planCards = unwrap(planCardsResult);
  const checkins = unwrap(checkinsResult);
  return {
    exportedAt: new Date().toISOString(),
    activeGoals: activeGoals.goals,
    ftpHistory: ftpHistory.entries,
    planCards: planCards.cards,
    checkins: checkins.checkins,
  };
}

/** Baut den Export und startet den Download. Result-Rückgabe wie die
 *  Adapter selbst — der Aufrufer prüft `result.ok` wie überall sonst. */
export async function exportOwnData(userId: string): Promise<Result> {
  return catchResult(async () => {
    const payload = await collectOwnData(userId);
    const json = JSON.stringify(payload, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `training-dashboard-export-${localISODate()}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    return {};
  });
}
