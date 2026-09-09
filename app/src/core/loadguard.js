/* ============================================================
   CORE/LOADGUARD.JS — Belastungswächter (kein DOM)
   Kombiniert zwei etablierte Überlastungs-Frühindikatoren:
   - CTL-Ramp-Rate (PMC): Fitness-Anstieg pro Woche, sicherer
     Korridor ~+3 bis +6 CTL/Woche, ab ~+8 deutlich riskant
   - Foster-Monotonie & Strain: Ø Tageslast ÷ SD der Tageslast
     (7 Tage inkl. Ruhetage=0); Monotonie ≥ 2,0 gilt als eintönig,
     Strain = Wochenlast × Monotonie

   Governor-Zweig (Fahrplan 10 E6, OF-4): für Athleten mit > 1 Sport
   (`buildLoadGuard(..., { multiSport: true })`) kommt ein dritter Indikator
   hinzu — die Wochenlast relativ zur eigenen rollierenden Median-Wochenlast
   (OWN_LOAD_MEDIAN_WEEKS / WEEK_LOAD_CEILING_FACTOR in plan-config.js). Ein
   Triathlet hat durch drei Sportarten eine höhere Gesamtlast; absolute
   Rad-Schwellen empfehlen ihm sonst dauerhaft Ruhe. Ohne `multiSport` wird
   nichts davon berechnet und riskLevel() verhält sich exakt wie vor E6
   (Golden-Master 1/2/4 = 0 Diff). Seit Fahrplan 10 E8a setzen die
   Frontend-Aufrufer `multiSport:true` für Athleten mit > 1 Sportart (nur
   Athlet 3); die Zeile trägt dann `weekLoadOverCeiling`, und describeWeek()
   benennt einen deckel-getriebenen "high" eigenständig ("Eigenlast-Deckel")
   statt ihn der Monotonie-Formulierung zuzuschlagen.
   ============================================================ */

import { OWN_LOAD_MEDIAN_WEEKS, WEEK_LOAD_CEILING_FACTOR } from "./plan-config.js";

/** Sichere Ramp-Korridor-Grenzen (CTL/Woche) */
export const RAMP_OK_MIN = 3;
export const RAMP_OK_MAX = 6;
export const RAMP_HIGH = 8;
export const MONOTONY_WARN = 2.0;

/** Tageslast einer Aktivität.
 *  - Rad (`sport` fehlt oder `"ride"`): TSS bevorzugt, TRIMP als Fallback —
 *    unverändert wie vor Fahrplan 10.
 *  - Nicht-Rad (`"run"`/`"swim"`, Fahrplan 10 E8a): TRIMP bevorzugt. Die
 *    Lauf-/Schwimm-Zeilen tragen neben unserem Banister-`trimp` noch den
 *    intervals-`tss` aus dem Rad-Modell — der ist für eine Laufeinheit
 *    bedeutungslos. Bestandsathleten 1/2/4 tragen nie `sport !== "ride"`
 *    und kein `trimp` → dieser Zweig ändert für sie nichts.
 *  @param {import("../types.js").Ride & {sport?: string}} r @returns {number} */
export function rideLoad(r) {
  const isRide = !r.sport || r.sport === "ride";
  if (isRide) {
    if (r.tss != null) return r.tss;
    if (r.trimp != null) return r.trimp;
    return 0;
  }
  if (r.trimp != null) return r.trimp;
  if (r.tss != null) return r.tss;
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

/** Median einer nicht-leeren Zahlenliste (die Kopie wird sortiert). */
function median(nums) {
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** Risiko-Einstufung einer Woche aus Ramp, Monotonie und — nur für
 *  Multi-Sport-Athleten (Fahrplan 10 E6) — dem Eigenlast-Wochendeckel.
 *  `weekLoadOverCeiling` ist `false`, solange kein Aufrufer den Governor-Zweig
 *  aktiviert; dann verhält sich die Funktion exakt wie vor E6.
 *  @param {number|null} ramp @param {number|null} monotony
 *  @param {boolean} [weekLoadOverCeiling]
 *  @returns {"ok"|"caution"|"high"} */
export function riskLevel(ramp, monotony, weekLoadOverCeiling = false) {
  if (
    weekLoadOverCeiling ||
    (ramp != null && ramp > RAMP_HIGH) ||
    (monotony != null && monotony >= 2.5)
  )
    return "high";
  if ((ramp != null && ramp > RAMP_OK_MAX) || (monotony != null && monotony >= MONOTONY_WARN))
    return "caution";
  return "ok";
}

/**
 * Belastungswächter pro Trainingswoche. Gruppiert Fahrten nach r.week
 * (Plan-Wochen) bzw. weekKeyFn-Fallback, füllt fehlende Tage mit 0 und
 * berechnet Foster-Werte + CTL-Ramp gegen die Vorwoche.
 * @param {import("../types.js").Ride[]} rides
 * @param {(r: import("../types.js").Ride) => string} weekKeyFn Woche einer Fahrt
 * @param {(a: string, b: string) => number} weekSortFn Sortierung der Wochen
 * @param {{multiSport?: boolean}} [opts]  `multiSport: true` (Fahrplan 10 E6,
 *   Athleten mit > 1 Sport) schaltet den Eigenlast-Wochendeckel frei — die
 *   Wochenlast wird gegen den Median der bis zu OWN_LOAD_MEDIAN_WEEKS
 *   vorangehenden Wochen bezogen, Bruch → risk "high". Default aus: exakt das
 *   Verhalten vor E6 (Golden-Master 1/2/4 = 0 Diff).
 * @returns {Array<{week: string, total: number, monotony: number|null, strain: number|null, ctlEnd: number|null, ramp: number|null, weekLoadOverCeiling: boolean, risk: "ok"|"caution"|"high"}>}
 */
export function buildLoadGuard(rides, weekKeyFn, weekSortFn, opts = {}) {
  const multiSport = opts.multiSport === true;
  const byWeek = {};
  for (const r of rides) {
    const key = weekKeyFn(r);
    if (!key) continue;
    if (!byWeek[key]) byWeek[key] = [];
    byWeek[key].push(r);
  }

  const weeks = Object.keys(byWeek).sort(weekSortFn);
  let prevCtl = null;
  // Chronologische Wochen-`total`-Werte der bisher verarbeiteten Wochen — nur
  // für den Multi-Sport-Deckel (Median der Vorwochen). Ohne multiSport
  // ungenutzt.
  const priorTotals = [];

  return weeks.map((week) => {
    const wr = byWeek[week];
    // Tageslasten: pro Datum summieren, auf 7 Slots auffüllen (Ruhetage = 0)
    const perDay = {};
    for (const r of wr) perDay[r.dateISO] = (perDay[r.dateISO] || 0) + rideLoad(r);
    const dailyLoads = Object.values(perDay);
    while (dailyLoads.length < 7) dailyLoads.push(0);

    const foster = fosterWeek(dailyLoads);
    const total = Math.round(foster.total);

    // Governor-Deckel (E6): nur bei multiSport und nur, wenn Vorwochen
    // vorliegen. Median der letzten OWN_LOAD_MEDIAN_WEEKS Wochen; Bruch der
    // Wochenlast über Median × WEEK_LOAD_CEILING_FACTOR → "high".
    let weekLoadOverCeiling = false;
    if (multiSport && priorTotals.length) {
      const med = median(priorTotals.slice(-OWN_LOAD_MEDIAN_WEEKS));
      if (med > 0 && total > med * WEEK_LOAD_CEILING_FACTOR) weekLoadOverCeiling = true;
    }
    priorTotals.push(total);

    const withCtl = wr
      .filter((r) => r.ctl != null)
      .sort((a, b) => a.dateISO.localeCompare(b.dateISO));
    const ctlEnd = withCtl.length ? withCtl[withCtl.length - 1].ctl : null;
    const ramp =
      ctlEnd != null && prevCtl != null ? Math.round((ctlEnd - prevCtl) * 10) / 10 : null;
    if (ctlEnd != null) prevCtl = ctlEnd;

    return {
      week,
      total,
      monotony: foster.monotony != null ? Math.round(foster.monotony * 100) / 100 : null,
      strain: foster.strain != null ? Math.round(foster.strain) : null,
      ctlEnd,
      ramp,
      weekLoadOverCeiling,
      risk: riskLevel(ramp, foster.monotony, weekLoadOverCeiling),
    };
  });
}

/**
 * Interpretierte Wochen-Einordnung für die Analyse-Tabelle:
 * benennt, WELCHES Signal die Einstufung treibt (Ramp vs. Monotonie).
 * @param {{ramp: number|null, monotony: number|null, weekLoadOverCeiling?: boolean, risk: "ok"|"caution"|"high"}} row Zeile aus buildLoadGuard
 * @returns {{label: string, detail: string}}
 */
export function describeWeek(row) {
  const { ramp, monotony, risk } = row;
  if (risk === "high") {
    // Multi-Sport-Governor (Fahrplan 10 E6/E8a): der Eigenlast-Wochendeckel
    // ist die spezifischste Ursache, vor Ramp/Monotonie benennen.
    if (row.weekLoadOverCeiling) {
      return {
        label: "Eigenlast-Deckel",
        detail: `Wochenlast über ${WEEK_LOAD_CEILING_FACTOR}× dem ${OWN_LOAD_MEDIAN_WEEKS}-Wochen-Median der eigenen Last — Multi-Sport-Governor.`,
      };
    }
    if (ramp != null && ramp > RAMP_HIGH) {
      return {
        label: "Übersteuert",
        detail: `Ramp +${ramp} CTL/Woche — deutlich über dem sicheren Korridor (${RAMP_OK_MIN}–${RAMP_OK_MAX}).`,
      };
    }
    return {
      label: "Eintönig hart",
      detail: `Monotonie ${monotony} — Belastung ohne Rhythmuswechsel, Strain-Risiko.`,
    };
  }
  if (risk === "caution") {
    if (ramp != null && ramp > RAMP_OK_MAX) {
      return {
        label: "Zügiger Aufbau",
        detail: `Ramp +${ramp} CTL/Woche — leicht über dem Korridor, beobachten.`,
      };
    }
    return {
      label: "Wenig Rhythmus",
      detail: `Monotonie ${monotony} — mehr Wechsel zwischen harten und leichten Tagen einplanen.`,
    };
  }
  if (ramp != null && ramp < 0) {
    return { label: "Entlastung", detail: `CTL ${ramp} — Erholungs- oder reduzierte Woche.` };
  }
  if (ramp != null && ramp >= RAMP_OK_MIN) {
    return { label: "Produktiver Aufbau", detail: `Ramp +${ramp} CTL/Woche im sicheren Korridor.` };
  }
  return { label: "Stabil", detail: "Belastung gehalten — weder Aufbau noch Entlastung." };
}
