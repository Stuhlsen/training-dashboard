/* ============================================================
   CORE/READINESS.JS — Tagesform-Ampel (kein DOM)
   Vergleicht die letzten 7 Tage (HRV/SDNN, Ruhepuls, Schlaf)
   gegen eine rollierende 42-Tage-Baseline (Mittelwert ± SD).
   Hintergrund: HRV-gesteuertes Training zeigte in Studien
   (u.a. Javaloyes 2019) bessere Anpassung als starre Pläne.
   Methodik: nutzt ausschließlich die intervals.icu-Wellness-Reihe
   (durchgehend SDNN) — kein Mischen mit Plan-1-RMSSD-Werten.
   ============================================================ */

/** Einzige Quelle für alle Readiness-Schwellenwerte — core/briefing.js liest
 *  nur den fertigen `level`/`confidence`-Output, keine eigene Kopie dieser
 *  Zahlen (siehe Konsistenztest in tests/readiness-confidence.test.js). */
export const READINESS_CONFIG = {
  baselineDays: 42,
  recentDays: 7,
  zCaution: 0.75,
  zAlert: 1.5,
  freshMaxAgeDays: 1, // letzter Wert ≤1 Tag alt → "vorhanden"
  staleMinAgeDays: 5, // ≥5 Tage alt (oder nie erfasst) → "veraltet"; dazwischen "ausstehend"
};
export const BASELINE_DAYS = READINESS_CONFIG.baselineDays;
export const RECENT_DAYS = READINESS_CONFIG.recentDays;
const Z_CAUTION = READINESS_CONFIG.zCaution;
const Z_ALERT = READINESS_CONFIG.zAlert;

/** Tage zwischen zwei ISO-Datumsangaben (lokal, kein UTC-Versatz), a − b.
 *  @param {string} aISO @param {string} bISO @returns {number} */
function diffDays(aISO, bISO) {
  const a = new Date(`${aISO}T00:00:00`);
  const b = new Date(`${bISO}T00:00:00`);
  return Math.round((a.getTime() - b.getTime()) / 86400000);
}

/** Konfidenz einer Metrik anhand des Alters ihres letzten bekannten Werts.
 *  `null` (nie erfasst) wird wie "veraltet" behandelt — kein Sync-Lag,
 *  sondern strukturell fehlende Datenquelle.
 *  @param {number|null} daysSinceLastValue
 *  @returns {"vorhanden"|"ausstehend"|"veraltet"} */
export function metricConfidence(daysSinceLastValue) {
  if (daysSinceLastValue == null) return "veraltet";
  if (daysSinceLastValue <= READINESS_CONFIG.freshMaxAgeDays) return "vorhanden";
  if (daysSinceLastValue < READINESS_CONFIG.staleMinAgeDays) return "ausstehend";
  return "veraltet";
}

/** Mittelwert + Standardabweichung (Population), null-sicher
 *  @param {number[]} values @returns {{mean: number, sd: number, n: number}|null} */
export function baselineStats(values) {
  const v = values.filter((x) => x != null && !isNaN(x));
  if (v.length < 5) return null; // zu wenig Historie für eine belastbare Baseline
  const mean = v.reduce((s, x) => s + x, 0) / v.length;
  const sd = Math.sqrt(v.reduce((s, x) => s + (x - mean) ** 2, 0) / v.length);
  return { mean, sd, n: v.length };
}

/** Status eines Metrik-Z-Werts. `higherIsBetter` dreht das Vorzeichen.
 *  @returns {"ok"|"caution"|"alert"|"nodata"} */
export function metricStatus(z, higherIsBetter) {
  if (z == null) return "nodata";
  const bad = higherIsBetter ? -z : z; // positive Werte = schlechter
  if (bad >= Z_ALERT) return "alert";
  if (bad >= Z_CAUTION) return "caution";
  return "ok";
}

/**
 * Tagesform aus der Wellness-Reihe bestimmen.
 * @param {import("../types.js").WellnessDay[]} wellness (beliebig sortiert)
 * @param {string} todayISO
 * @returns {null | {
 *   level: "green"|"yellow"|"red",
 *   metrics: Array<{key: string, label: string, recent: number|null, baseline: number|null, z: number|null, status: string, higherIsBetter: boolean, confidence: "vorhanden"|"ausstehend"|"veraltet", daysSinceLastValue: number|null}>,
 *   recommendation: string,
 *   basisNote: string,
 *   staleWarning: string|null
 * }} null wenn zu wenig Daten
 */
export function assessReadiness(wellness, todayISO) {
  const sorted = [...(wellness || [])]
    .filter((w) => (w.dateISO || w.date) <= todayISO)
    .sort((a, b) => (a.dateISO || a.date).localeCompare(b.dateISO || b.date));
  if (sorted.length < 10) return null;

  const recent = sorted.slice(-RECENT_DAYS);
  const base = sorted.slice(-(BASELINE_DAYS + RECENT_DAYS), -RECENT_DAYS);
  if (base.length < 10) return null;

  const defs = [
    { key: "hrv", label: "HRV (SDNN)", get: (w) => w.hrv, higherIsBetter: true },
    { key: "restingHR", label: "Ruhepuls", get: (w) => w.restingHR, higherIsBetter: false },
    { key: "sleep", label: "Schlaf", get: (w) => w.sleepHours, higherIsBetter: true },
  ];

  const metrics = defs.map((d) => {
    const b = baselineStats(base.map(d.get));
    const rVals = recent.map(d.get).filter((x) => x != null && !isNaN(x));
    const rMean = rVals.length ? rVals.reduce((s, x) => s + x, 0) / rVals.length : null;
    const z = b && b.sd > 0 && rMean != null ? (rMean - b.mean) / b.sd : null;

    // Letzter Tag mit einem echten Wert (über die GESAMTE Historie, nicht
    // nur das 7-Tage-Fenster) → Grundlage für die Konfidenz.
    let lastDate = null;
    for (let i = sorted.length - 1; i >= 0; i--) {
      const day = sorted[i];
      if (d.get(day) != null) {
        lastDate = day.dateISO || day.date;
        break;
      }
    }
    const daysSinceLastValue = lastDate != null ? diffDays(todayISO, lastDate) : null;

    return {
      key: d.key,
      label: d.label,
      recent: rMean != null ? Math.round(rMean * 10) / 10 : null,
      baseline: b ? Math.round(b.mean * 10) / 10 : null,
      z: z != null ? Math.round(z * 100) / 100 : null,
      status: metricStatus(z, d.higherIsBetter),
      higherIsBetter: d.higherIsBetter,
      confidence: metricConfidence(daysSinceLastValue),
      daysSinceLastValue,
    };
  });

  // Einmal nach Konfidenz gruppieren — Grundlage für Ampel, Basis-Note
  // und Stale-Warnung, statt dreimal denselben Array zu filtern.
  const byConfidence = { vorhanden: [], ausstehend: [], veraltet: [] };
  for (const m of metrics) byConfidence[m.confidence].push(m);
  const { vorhanden: usable, ausstehend: pending, veraltet: stale } = byConfidence;

  // Ampel nur aus tatsächlich vorhandenen Metriken kombinieren — ausstehende
  // Metriken bleiben stumm ausgeschlossen (normaler Sync-Lag).
  const statuses = usable.map((m) => m.status);
  let level = "green";
  if (statuses.includes("alert")) level = "red";
  else if (statuses.filter((s) => s === "caution").length >= 2) level = "yellow";
  else if (statuses.includes("caution")) level = "yellow";

  // Veraltete Daten (oder gar keine vorhandene Metrik) dürfen nie ein falsches
  // "Bereit" erzeugen — anders als "ausstehend" wird das explizit eskaliert.
  if (level === "green" && (stale.length > 0 || usable.length === 0)) level = "yellow";

  const recommendation =
    level === "green"
      ? "Einheit wie geplant fahren."
      : level === "yellow"
        ? "Intensität heute eine Stufe reduzieren — Umfang ist okay."
        : "Erholung priorisieren: Ruhetag oder lockeres Ausrollen erwägen.";

  const basisSegments = [`Basiert auf ${usable.length}/${metrics.length} Metriken`];
  if (pending.length) basisSegments.push(`${pending.map((m) => m.label).join(", ")} ausstehend`);
  if (stale.length) basisSegments.push(`${stale.map((m) => m.label).join(", ")} veraltet`);
  const basisNote = basisSegments.join(" — ");

  const staleWarning = stale.length
    ? stale
        .map((m) =>
          m.daysSinceLastValue == null
            ? `${m.label}: nie erfasst`
            : `${m.label}: seit ${m.daysSinceLastValue} Tagen keine neuen Werte`
        )
        .join(" · ")
    : null;

  return { level, metrics, recommendation, basisNote, staleWarning };
}
