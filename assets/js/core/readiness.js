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

/* ── Subjektiver Kanal (Morgen-Check-in) ─────────────────────────
   Reine Vertragsfunktion (Schritt F, docs/phase-2-konzept-morgen-
   checkin.md Abschnitt 5.5). Die Governor-Verrechnung mit dem objektiven
   Kanal oben ist in core/briefing.js implementiert (governLevel() +
   subjectiveSignal(), s. dort) — diese Funktion liefert nur den fertigen
   Vertrag ({score, level, freshness, components}), keine Kombinationslogik.
   core/ bleibt Supabase-frei: anders als im Konzept-Pseudocode
   (`getSubjectiveReadiness(athleteId, date)`) nimmt diese Funktion die
   Check-ins als Daten entgegen, nicht als IDs zum Nachladen — exakt
   das Muster von assessReadiness(wellness, todayISO) oben in dieser
   Datei. Der Athleten-/Datums-Bezug passiert beim Aufrufer (state/wellbeing.js).
   Einzige Quelle für die Subjektiv-Schwellen/-Gewichte — core/briefing.js
   bekommt von hier nur das bereits fertig abgeleitete `level`, nie den
   rohen Score, kann `greenMin`/`yellowMin` also strukturell nicht duplizieren
   (kein Import nötig, anders als ursprünglich hier vermerkt). */
export const SUBJECTIVE_READINESS_CONFIG = {
  greenMin: 4.0, // Mittel ≥ 4,0 → grün
  yellowMin: 2.75, // 2,75–3,99 → gelb, < 2,75 → rot
  // v1 gleichgewichtet (Konzept D6) — als Config offen für spätere Tuning.
  weights: { energy: 1, muscleFeel: 1, mood: 1 },
};

/**
 * Subjektive Tagesform aus dem Morgen-Check-in — reiner Vertrag, keine
 * Verrechnung mit dem objektiven Kanal.
 * @param {Array<{date: string, energy: number|null, muscleFeel: number|null, mood: number|null}>} checkins
 *   beliebig sortiert; nur `date === todayISO` bzw. genau ein Tag davor werden betrachtet.
 * @param {string} todayISO
 * @returns {{
 *   score: number|null,
 *   level: "green"|"yellow"|"red"|null,
 *   freshness: "vorhanden"|"ausstehend"|"veraltet",
 *   components: { energy: number|null, muscleFeel: number|null, mood: number|null }
 * }}
 */
export function getSubjectiveReadiness(checkins, todayISO) {
  const list = checkins || [];
  const today = list.find((c) => c.date === todayISO) || null;
  // Nur exakt "gestern" zählt als veraltet-aber-relevant (Konzept 5.4) — älter
  // ist fachlich gleichwertig zu "kein Eintrag", nicht eine weitere Stufe.
  const yesterday = !today ? list.find((c) => diffDays(todayISO, c.date) === 1) || null : null;
  const entry = today || yesterday;
  // Absichtlich ANDERE Bedeutung als metricConfidence() oben in dieser Datei
  // (dort: Tagesalter einer Metrik seit dem letzten Wert). Hier: "heute
  // erfasst" vs. "nur gestern" vs. "noch kein Eintrag" — zwei verschiedene
  // Fragen, dieselben drei Wortlaute (Konzept 5.4).
  const freshness = today ? "vorhanden" : yesterday ? "veraltet" : "ausstehend";

  const components = {
    energy: entry?.energy ?? null,
    muscleFeel: entry?.muscleFeel ?? null,
    mood: entry?.mood ?? null,
  };

  const { weights } = SUBJECTIVE_READINESS_CONFIG;
  let weightSum = 0;
  let valueSum = 0;
  for (const key of Object.keys(weights)) {
    const v = components[key];
    if (v == null) continue;
    weightSum += weights[key];
    valueSum += v * weights[key];
  }
  const score = weightSum > 0 ? Math.round((valueSum / weightSum) * 100) / 100 : null;

  let level = null;
  if (score != null) {
    const { greenMin, yellowMin } = SUBJECTIVE_READINESS_CONFIG;
    level = score >= greenMin ? "green" : score >= yellowMin ? "yellow" : "red";
  }

  return { score, level, freshness, components };
}
