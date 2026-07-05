/* ============================================================
   CORE/PERIODIZATION.JS — Periodisierungs-Erfüllung (kein DOM)
   Nur für den eigenen Plan (Athlet 1, Plan 2): Ist jeder Block
   phasengerecht umgesetzt worden?

   Prüft pro Phase drei Dinge:
   1. Reizsignatur — enthält der Block Einheiten seiner spezifischen
      Intensität? (Typ-Match ODER Ganzfahrt-IF im Signatur-Korridor;
      Typ zuerst, weil Intervalle den Ganzfahrt-IF verwässern)
   2. Quality-Dichte — Sessions mit Signatur pro Woche (Plan sieht
      2 Quality Sessions/Woche vor: Di Gruppe + Do Intervalle)
   3. Erholungswochen — real reduziert? (Wochen-TSS ≤ 60% des Mittels
      der angrenzenden Blockwochen — "Erholungswochen, die keine sind"
      sind der häufigste Grund für stagnierende Blöcke)
   ============================================================ */

/** Reizsignaturen der Plan-2-Blöcke (Ganzfahrt-IF-Korridore).
 *  Untergrenzen bewusst leicht unter Intervall-Zielbereich, weil
 *  Ein-/Ausrollen den Ganzfahrt-IF nach unten zieht. */
export const PHASE_SIGNATURES = {
  "Sweet Spot": { ifMin: 0.80, ifMax: 0.97, types: ["Sweet Spot"] },
  "Schwelle":   { ifMin: 0.90, ifMax: 1.05, types: ["Schwelle"] },
  "VO2max":     { ifMin: 1.00, ifMax: 1.40, types: ["VO2max"] },
};

/** Erholungswoche gilt als erfüllt, wenn Wochen-TSS ≤ RECOVERY_MAX_SHARE
 *  des Mittels der angrenzenden Blockwochen (Plan: Volumen −50%) */
export const RECOVERY_MAX_SHARE = 0.6;

/** Erwartete Quality-Sessions pro Blockwoche (Di Gruppe + Do Intervalle) */
export const QUALITY_PER_WEEK = 2;

/** Zählt eine Fahrt als Signatur-Session der Phase?
 *  @param {import("../types.js").Ride} r @param {string} phase @returns {boolean} */
export function matchesSignature(r, phase) {
  const sig = PHASE_SIGNATURES[phase];
  if (!sig) return false;
  if (r.typ && sig.types.includes(r.typ)) return true;
  if (r.if != null && r.if >= sig.ifMin && r.if <= sig.ifMax && (r.min || 0) >= 30) return true;
  return false;
}

/** Wochen-TSS-Summe @param {import("../types.js").Ride[]} rides */
function weekTss(rides) {
  return Math.round(rides.reduce((s, r) => s + (r.tss || 0), 0));
}

/**
 * Periodisierungs-Erfüllung über die Plan-2-Fahrten.
 * Gruppiert nach week (nur "P2-*"-Wochen), ordnet Wochen ihren Phasen zu
 * und bewertet Blöcke + Erholungswochen.
 * @param {import("../types.js").Ride[]} rides alle Fahrten (wird intern gefiltert)
 * @param {(week: string) => number} weekIndexFn CONFIG.weekIndex für die Sortierung
 * @returns {null | {
 *   blocks: Array<{phase: string, weeks: string[], rides: number, quality: number, expectedQuality: number, share: number, status: "ok"|"teilweise"|"abweichend", note: string}>,
 *   recovery: Array<{week: string, tss: number, refTss: number|null, reduced: boolean|null}>,
 *   totalWeeks: number
 * }} null wenn keine Plan-2-Wochen mit Phase vorhanden
 */
export function phaseCompliance(rides, weekIndexFn) {
  const p2 = (rides || []).filter((r) => r.plan === "Plan 2" && r.week && r.phase);
  if (!p2.length) return null;

  // Wochen → Fahrten + Phase (Phase der Woche = Phase der Mehrheit der Fahrten)
  const byWeek = {};
  for (const r of p2) {
    if (!byWeek[r.week]) byWeek[r.week] = [];
    byWeek[r.week].push(r);
  }
  const weeks = Object.keys(byWeek).sort((a, b) => weekIndexFn(a) - weekIndexFn(b));
  if (!weeks.length) return null;

  const weekPhase = {};
  for (const w of weeks) {
    const counts = {};
    for (const r of byWeek[w]) counts[r.phase] = (counts[r.phase] || 0) + 1;
    weekPhase[w] = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
  }

  // Blöcke: zusammenhängende Wochen mit Signatur-Phase
  const blockPhases = Object.keys(PHASE_SIGNATURES);
  const blocks = [];
  for (const phase of blockPhases) {
    const phaseWeeks = weeks.filter((w) => weekPhase[w] === phase);
    if (!phaseWeeks.length) continue;
    const phaseRides = phaseWeeks.flatMap((w) => byWeek[w]);
    const quality = phaseRides.filter((r) => matchesSignature(r, phase)).length;
    const expectedQuality = phaseWeeks.length * QUALITY_PER_WEEK;
    const share = expectedQuality ? Math.round((quality / expectedQuality) * 100) / 100 : 0;

    let status, note;
    if (share >= 0.75) {
      status = "ok";
      note = `${quality}/${expectedQuality} Quality-Sessions mit ${phase}-Signatur — Block phasengerecht.`;
    } else if (share >= 0.4) {
      status = "teilweise";
      note = `${quality}/${expectedQuality} Quality-Sessions mit ${phase}-Signatur — Reizdichte unter Plan.`;
    } else {
      status = "abweichend";
      note = `Nur ${quality}/${expectedQuality} Sessions mit ${phase}-Signatur — Block ohne spezifischen Reiz.`;
    }
    blocks.push({ phase, weeks: phaseWeeks, rides: phaseRides.length, quality, expectedQuality, share, status, note });
  }

  // Erholungswochen: TSS vs. Mittel der angrenzenden Blockwochen
  const recovery = weeks
    .filter((w) => weekPhase[w] === "Erholung")
    .map((week) => {
      const tss = weekTss(byWeek[week]);
      const idx = weeks.indexOf(week);
      const neighbors = [weeks[idx - 1], weeks[idx + 1]]
        .filter((w) => w && weekPhase[w] !== "Erholung")
        .map((w) => weekTss(byWeek[w]))
        .filter((t) => t > 0);
      const refTss = neighbors.length
        ? Math.round(neighbors.reduce((s, t) => s + t, 0) / neighbors.length)
        : null;
      const reduced = refTss != null ? tss <= refTss * RECOVERY_MAX_SHARE : null;
      return { week, tss, refTss, reduced };
    });

  if (!blocks.length && !recovery.length) return null;
  return { blocks, recovery, totalWeeks: weeks.length };
}
