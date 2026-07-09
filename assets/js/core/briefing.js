/* ============================================================
   CORE/BRIEFING.JS — Status-Briefing / Entscheidungskopf (kein DOM)
   Fusioniert drei Signale zu EINEM Tagesstatus mit Empfehlung:
   - Readiness-Ampel (HRV/Ruhepuls/Schlaf vs. 42d-Baseline)
   - TSB (Belastungsbilanz aus dem PMC)
   - LoadGuard-Risiko der aktuellen Woche (Ramp/Monotonie)
   Kein Einzelmarker ist allein entscheidungsreif — die Kombination
   aus Erholungslage UND Belastungsbilanz ist der etablierte Ansatz
   zur Tagessteuerung. Rote Erholungs-/Strain-Signale schlagen dabei
   immer einen grünen TSB (Priorisierung: Schutz vor Übersteuerung).
   ============================================================ */

/** TSB-Schwellen für die Interpretation */
export const TSB_FRESH = 5; // darüber: frisch/erholt
export const TSB_DEEP_FATIGUE = -20; // darunter: tiefe Ermüdung

/** TSB-Einordnung als Signal
 *  @param {number|null|undefined} tsb
 *  @returns {{status: "ok"|"caution"|"alert"|"nodata", text: string}} */
export function tsbSignal(tsb) {
  if (tsb == null) return { status: "nodata", text: "Kein TSB verfügbar" };
  const v = Math.round(tsb);
  if (tsb < TSB_DEEP_FATIGUE) return { status: "alert", text: `TSB ${v}: tiefe Ermüdung` };
  if (tsb < -10) return { status: "caution", text: `TSB ${v}: deutliche Ermüdung` };
  if (tsb > TSB_FRESH) return { status: "ok", text: `TSB +${v}: frisch` };
  return { status: "ok", text: `TSB ${v > 0 ? "+" + v : v}: produktiver Bereich` };
}

/** LoadGuard-Risiko als Signal
 *  @param {"ok"|"caution"|"high"|null|undefined} risk
 *  @returns {{status: "ok"|"caution"|"alert"|"nodata", text: string}} */
export function loadSignal(risk) {
  if (risk == null) return { status: "nodata", text: "Keine Wochenlast-Daten" };
  if (risk === "high")
    return { status: "alert", text: "Belastungswächter: hohes Risiko (Ramp/Monotonie)" };
  if (risk === "caution")
    return { status: "caution", text: "Belastungswächter: erhöht (Ramp/Monotonie)" };
  return { status: "ok", text: "Belastungsaufbau im sicheren Korridor" };
}

/** Readiness-Level als Signal (degradiert sauber ohne HRV-Basis)
 *  @param {null|{level: "green"|"yellow"|"red"}} readiness
 *  @returns {{status: "ok"|"caution"|"alert"|"nodata", text: string}} */
export function readinessSignal(readiness) {
  if (!readiness)
    return { status: "nodata", text: "Keine HRV-Baseline — Status ohne Erholungsmarker" };
  if (readiness.level === "red")
    return { status: "alert", text: "Tagesform: Erholungsmarker deutlich unter Baseline" };
  if (readiness.level === "yellow")
    return { status: "caution", text: "Tagesform: Erholungsmarker leicht unter Baseline" };
  return { status: "ok", text: "Tagesform: Erholungsmarker im Normalbereich" };
}

/**
 * Gesamtstatus aus den drei Signalen.
 * Priorisierung: irgendein alert → red · ≥1 caution → yellow · sonst green.
 * @param {Object} input
 * @param {null|{level: string, recommendation?: string}} input.readiness  aus core/readiness.js
 * @param {number|null} input.tsb                     aktuellster TSB
 * @param {"ok"|"caution"|"high"|null} input.loadRisk aktuelle LoadGuard-Woche
 * @param {null|{date: string, title?: string, typ?: string}} [input.nextSession] nächste geplante Einheit (nur Athlet 1)
 * @returns {{
 *   level: "green"|"yellow"|"red",
 *   headline: string,
 *   recommendation: string,
 *   signals: Array<{status: string, text: string}>,
 *   degraded: boolean
 * }}
 */
export function buildBriefing({ readiness, tsb, loadRisk, nextSession = null }) {
  const signals = [readinessSignal(readiness), tsbSignal(tsb), loadSignal(loadRisk)];
  const statuses = signals.map((s) => s.status);
  const degraded = !readiness; // ohne HRV-Baseline: Status nur aus Last-Signalen

  let level = "green";
  if (statuses.includes("alert")) level = "red";
  else if (statuses.includes("caution")) level = "yellow";

  const headline =
    level === "green"
      ? "Grünes Licht"
      : level === "yellow"
        ? "Mit Bedacht"
        : "Erholung priorisieren";

  let recommendation;
  if (level === "red") {
    recommendation = "Heute keinen harten Reiz setzen — Ruhetag oder lockeres Ausrollen.";
  } else if (level === "yellow") {
    recommendation =
      "Intensität eine Stufe reduzieren oder die harte Einheit verschieben — Umfang ist okay.";
  } else {
    recommendation = "Harter Trainingsreiz heute vertretbar.";
  }

  if (nextSession) {
    const label = nextSession.title || nextSession.typ || "geplante Einheit";
    if (level === "green") {
      recommendation = `Nächste Einheit („${label}", ${nextSession.date}) wie geplant fahren.`;
    } else if (level === "yellow") {
      recommendation = `Nächste Einheit („${label}", ${nextSession.date}) entschärfen oder verschieben — Umfang ist okay.`;
    } else {
      recommendation = `Nächste Einheit („${label}", ${nextSession.date}) verschieben — Erholung geht vor.`;
    }
  }

  return { level, headline, recommendation, signals, degraded };
}
