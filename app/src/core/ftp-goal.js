/* ============================================================
   CORE/FTP-GOAL.JS — welches FTP-Ziel gilt für einen Athleten

   Reine Berechnung (kein I/O). Quellen, in dieser Reihenfolge:
     1. eigenes Datenbank-Ziel (Settings → Ziele) — nur der Athlet selbst darf
        die `goals`-Tabelle lesen, sieht seine Änderung also sofort
     2. `ftpGoal` aus dem öffentlichen rides*.json (der Sync schreibt es, wenn
        der Athlet „FTP öffentlich" an hat) — für Trainer und Besucher
     3. fester Wert aus config.ts (Altbestand / letzter Notnagel)

   `pickFtpGoal` MUSS zu scripts/lib/goals.js::pickFtpGoal passen (gleiche
   Regel, dort für den Sync).
   ============================================================ */

/**
 * Aktive Ziele, deren Art „ftp" enthält (Groß-/Kleinschreibung egal), mit
 * positivem Zielwert — bei mehreren gewinnt das zuletzt angelegte. Die Liste
 * kommt aus `useGoals()` (älteste zuerst), „zuletzt" = letzter passender
 * Eintrag.
 * @param {Array<{kind?: string|null, targetValue?: number|null}>|null|undefined} goals
 * @returns {number|null}
 */
export function pickFtpGoal(goals) {
  const matching = (goals || []).filter(
    (g) =>
      typeof g.kind === "string" &&
      g.kind.toLowerCase().includes("ftp") &&
      Number.isFinite(g.targetValue) &&
      /** @type {number} */ (g.targetValue) > 0
  );
  const last = matching[matching.length - 1];
  return last ? Math.round(/** @type {number} */ (last.targetValue)) : null;
}

/**
 * Erste brauchbare Quelle gewinnt (s. Modulkopf).
 * @param {{ownGoal?: number|null, publicGoal?: number|null, configGoal?: number|null}} sources
 * @returns {number|null}
 */
export function resolveFtpGoal({ ownGoal, publicGoal, configGoal }) {
  for (const v of [ownGoal, publicGoal, configGoal]) {
    if (typeof v === "number" && Number.isFinite(v) && v > 0) return v;
  }
  return null;
}
