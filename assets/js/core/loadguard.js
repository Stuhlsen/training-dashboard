/* ============================================================
   CORE/LOADGUARD.JS — Belastungswächter (kein DOM)
   Kombiniert zwei etablierte Überlastungs-Frühindikatoren:
   - CTL-Ramp-Rate (PMC): Fitness-Anstieg pro Woche, sicherer
     Korridor ~+3 bis +6 CTL/Woche, ab ~+8 deutlich riskant
   - Foster-Monotonie & Strain: Ø Tageslast ÷ SD der Tageslast
     (7 Tage inkl. Ruhetage=0); Monotonie ≥ 2,0 gilt als eintönig,
     Strain = Wochenlast × Monotonie
   ============================================================ */

/** Sichere Ramp-Korridor-Grenzen (CTL/Woche) */
export const RAMP_OK_MIN = 3;
export const RAMP_OK_MAX = 6;
export const RAMP_HIGH = 8;
export const MONOTONY_WARN = 2.0;

/** Tageslast einer Fahrt: TSS bevorzugt, TRIMP als Fallback
 *  @param {import("../types.js").Ride} r @returns {number} */
export function rideLoad(r) {
  if (r.tss != null) return r.tss;
  if (r.trimp != null) return r.trimp;
  return 0;
}

/**
 * Foster-Kennzahlen für eine Woche aus 7 Tageslasten (Ruhetage = 0).
 * @param {number[]} dailyLoads Genau die Tageslasten der Woche
 * @returns {{total: number, mean: number, sd: number, monotony: number|null, strain: number|null}}
 */
export function fosterWeek(dailyLoads) {
  const n = dailyLoads.length || 1;
  const total = dailyLoads.reduce((s, v) => s + v, 0);
  const mean = total / n;
  const sd = Math.sqrt(dailyLoads.reduce((s, v) => s + (v - mean) ** 2, 0) / n);
  if (sd === 0) return { total, mean, sd, monotony: null, strain: null };
  const monotony = mean / sd;
  return { total, mean, sd, monotony, strain: total * monotony };
}

/** Risiko-Einstufung einer Woche aus Ramp und Monotonie
 *  @returns {"ok"|"caution"|"high"} */
export function riskLevel(ramp, monotony) {
  if ((ramp != null && ramp > RAMP_HIGH) || (monotony != null && monotony >= 2.5)) return "high";
  if ((ramp != null && ramp > RAMP_OK_MAX) || (monotony != null && monotony >= MONOTONY_WARN)) return "caution";
  return "ok";
}

/**
 * Belastungswächter pro Trainingswoche. Gruppiert Fahrten nach r.week
 * (Plan-Wochen) bzw. weekKeyFn-Fallback, füllt fehlende Tage mit 0 und
 * berechnet Foster-Werte + CTL-Ramp gegen die Vorwoche.
 * @param {import("../types.js").Ride[]} rides
 * @param {(r: import("../types.js").Ride) => string} weekKeyFn Woche einer Fahrt
 * @param {(a: string, b: string) => number} weekSortFn Sortierung der Wochen
 * @returns {Array<{week: string, total: number, monotony: number|null, strain: number|null, ctlEnd: number|null, ramp: number|null, risk: "ok"|"caution"|"high"}>}
 */
export function buildLoadGuard(rides, weekKeyFn, weekSortFn) {
  const byWeek = {};
  for (const r of rides) {
    const key = weekKeyFn(r);
    if (!key) continue;
    if (!byWeek[key]) byWeek[key] = [];
    byWeek[key].push(r);
  }

  const weeks = Object.keys(byWeek).sort(weekSortFn);
  let prevCtl = null;

  return weeks.map((week) => {
    const wr = byWeek[week];
    // Tageslasten: pro Datum summieren, auf 7 Slots auffüllen (Ruhetage = 0)
    const perDay = {};
    for (const r of wr) perDay[r.dateISO] = (perDay[r.dateISO] || 0) + rideLoad(r);
    const dailyLoads = Object.values(perDay);
    while (dailyLoads.length < 7) dailyLoads.push(0);

    const foster = fosterWeek(dailyLoads);

    const withCtl = wr.filter((r) => r.ctl != null).sort((a, b) => a.dateISO.localeCompare(b.dateISO));
    const ctlEnd = withCtl.length ? withCtl[withCtl.length - 1].ctl : null;
    const ramp = ctlEnd != null && prevCtl != null ? Math.round((ctlEnd - prevCtl) * 10) / 10 : null;
    if (ctlEnd != null) prevCtl = ctlEnd;

    return {
      week,
      total: Math.round(foster.total),
      monotony: foster.monotony != null ? Math.round(foster.monotony * 100) / 100 : null,
      strain: foster.strain != null ? Math.round(foster.strain) : null,
      ctlEnd,
      ramp,
      risk: riskLevel(ramp, foster.monotony),
    };
  });
}
