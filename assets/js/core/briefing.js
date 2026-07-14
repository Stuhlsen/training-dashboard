/* ============================================================
   CORE/BRIEFING.JS — Belastungsempfehlung / Entscheidungskopf (kein DOM)
   Fusioniert drei Signale zu EINEM Tagesstatus mit Empfehlung:
   - Readiness-Ampel (HRV/Ruhepuls/Schlaf vs. 42d-Baseline)
   - TSB (Belastungsbilanz aus dem PMC, s. core/pmc.js::currentPmc —
     auf "heute" fortgeschrieben statt am Stand der letzten Fahrt
     eingefroren) + dessen 3-Tage-Trend
   - LoadGuard-Risiko der aktuellen Woche (Ramp/Monotonie)
   Kein Einzelmarker ist allein entscheidungsreif — die Kombination
   aus Erholungslage UND Belastungsbilanz ist der etablierte Ansatz
   zur Tagessteuerung. Rote Erholungs-/Strain-Signale schlagen dabei
   immer einen grünen TSB (Priorisierung: Schutz vor Übersteuerung).
   Einzige Ausnahme: TSB ist die ALLEINIGE Alert-Quelle UND der Trend
   zeigt aktive Erholung UND HRV/RHR widersprechen nicht — dann kippt
   der Status von rot auf gelb ("Erholung wirkt bereits", s. unten),
   statt eine schon laufende Erholung fälschlich als Warnung zu zeigen.
   ============================================================ */

/** TSB-Schwellen für die Interpretation */
export const TSB_FRESH = 5; // darüber: frisch/erholt
export const TSB_DEEP_FATIGUE = -20; // darunter: tiefe Ermüdung

/** HRV-Z-Score (vs. 42d-Baseline), ab dem HRV eine TSB-Alert-Entschärfung
 *  nicht blockiert — auch leicht unter Baseline gilt noch als "erholt genug". */
export const HRV_RECOVERING_Z = -0.5;

/** Ruhepuls-Z-Score (höherIsBetter=false — positiv = erhöht), bis zu dem
 *  Ruhepuls eine TSB-Alert-Entschärfung nicht blockiert. */
export const RHR_RECOVERING_Z = 0.5;

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

/** TSB-Trend der letzten Tage als informatives Signal (beeinflusst den
 *  Ampelstatus nicht direkt — das übernimmt die Erholungs-Logik in
 *  buildBriefing) @param {null|{direction: "steigend"|"fallend"|"stabil", delta: number}} trend
 *  @returns {null|{status: "ok", text: string}} */
export function tsbTrendSignal(trend) {
  if (!trend) return null;
  const arrow = trend.direction === "steigend" ? "↑" : trend.direction === "fallend" ? "↓" : "→";
  const sign = trend.delta > 0 ? "+" : "";
  return { status: "ok", text: `TSB-Trend (3 Tage): ${trend.direction} ${arrow} (${sign}${trend.delta})` };
}

/**
 * Gesamtstatus aus den drei Signalen.
 * Priorisierung: irgendein alert → red · ≥1 caution → yellow · sonst green.
 * Ausnahme ("Erholung wirkt bereits"): ist TSB die EINZIGE Alert-Quelle
 * (Readiness und LoadGuard schlagen nicht an), zeigt der 3-Tage-Trend
 * eine steigende TSB UND widerspricht HRV nicht deutlich (Status ok
 * oder z ≥ HRV_RECOVERING_Z; ohne Baseline zählt das als kein Widerspruch),
 * dann kippt der Status auf gelb mit entsprechend angepasster Formulierung —
 * ein rotes Readiness- oder LoadGuard-Signal schlägt weiterhin immer durch.
 * @param {Object} input
 * @param {null|{level: string, metrics?: Array<{key:string, z:number|null}>}} input.readiness  aus core/readiness.js
 * @param {number|null} input.tsb                     aktuellster (ggf. auf heute projizierter) TSB
 * @param {"ok"|"caution"|"high"|null} input.loadRisk aktuelle LoadGuard-Woche
 * @param {null|{date: string, title?: string, typ?: string}} [input.nextSession] nächste geplante Einheit (nur Athlet 1)
 * @param {null|{direction: "steigend"|"fallend"|"stabil", delta: number}} [input.trend] TSB-Trend aus core/pmc.js::tsbTrend
 * @returns {{
 *   level: "green"|"yellow"|"red",
 *   headline: string,
 *   recommendation: string,
 *   signals: Array<{status: string, text: string}>,
 *   degraded: boolean,
 *   recovering: boolean
 * }}
 */
export function buildBriefing({ readiness, tsb, loadRisk, nextSession = null, trend = null }) {
  const rSig = readinessSignal(readiness);
  const tSig = tsbSignal(tsb);
  const lSig = loadSignal(loadRisk);
  const signals = [rSig, tSig, lSig];
  const trendSig = tsbTrendSignal(trend);
  if (trendSig) signals.push(trendSig);
  const statuses = [rSig.status, tSig.status, lSig.status];
  const degraded = !readiness; // ohne HRV-Baseline: Status nur aus Last-Signalen

  let level = "green";
  if (statuses.includes("alert")) level = "red";
  else if (statuses.includes("caution")) level = "yellow";

  // Fehlender Z-Score (keine Baseline für diese Metrik) zählt als kein
  // Widerspruch — nur ein tatsächlich schlechter Wert blockiert die
  // Entschärfung (s. Modul-Kommentar oben: "HRV/RHR widersprechen nicht").
  const hrv = readiness?.metrics?.find((m) => m.key === "hrv") || null;
  const rhr = readiness?.metrics?.find((m) => m.key === "restingHR") || null;
  const hrvOk = hrv?.z == null || hrv.z >= HRV_RECOVERING_Z;
  const rhrOk = rhr?.z == null || rhr.z <= RHR_RECOVERING_Z;
  const hrvNotContradicting = degraded || rSig.status === "ok" || (hrvOk && rhrOk);
  // tSig.status === "alert" impliziert bereits level === "red" (s. oben) —
  // keine separate level-Prüfung nötig.
  let recovering = false;
  if (
    tSig.status === "alert" &&
    rSig.status !== "alert" &&
    lSig.status !== "alert" &&
    hrvNotContradicting &&
    trend?.direction === "steigend"
  ) {
    level = "yellow";
    recovering = true;
  }

  const headline =
    level === "green"
      ? "Grünes Licht"
      : level === "yellow"
        ? "Mit Bedacht"
        : "Erholung priorisieren";

  let recommendation;
  if (recovering) {
    recommendation =
      "Erholung wirkt bereits — TSB steigt im 3-Tage-Trend, Belastung kann vorsichtig gesteigert werden.";
  } else if (level === "red") {
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
    } else if (recovering) {
      recommendation = `Erholung wirkt bereits — nächste Einheit („${label}", ${nextSession.date}) vorsichtig wie geplant angehen, bei Bedarf entschärfen.`;
    } else if (level === "yellow") {
      recommendation = `Nächste Einheit („${label}", ${nextSession.date}) entschärfen oder verschieben — Umfang ist okay.`;
    } else {
      recommendation = `Nächste Einheit („${label}", ${nextSession.date}) verschieben — Erholung geht vor.`;
    }
  }

  return { level, headline, recommendation, signals, degraded, recovering };
}
