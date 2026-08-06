/* ============================================================
   CORE/PERIODIZATION.JS — Periodisierungs-Erfüllung (kein DOM)
   Nur für den eigenen Trainingsblock (Athlet 1, intervals.icu-Ära):
   Ist jeder Block phasengerecht umgesetzt worden?

   Prüft pro Phase drei Dinge:
   1. Reizsignatur — enthält der Block Einheiten seiner spezifischen
      Intensität? (Typ-Match ODER Ganzfahrt-IF im Signatur-Korridor;
      Typ zuerst, weil Intervalle den Ganzfahrt-IF verwässern)
   2. Quality-Dichte — Sessions mit Signatur pro Woche (Plan sieht
      2 Quality Sessions/Woche vor: Di Gruppe + Do Intervalle)
   3. Erholungswochen — real reduziert? (Wochen-TSS ≤ 60% des Mittels
      der angrenzenden Blockwochen — "Erholungswochen, die keine sind"
      sind der häufigste Grund für stagnierende Blöcke)

   currentBlockTarget()/blockStartDate() (D3/E2, Architekturentscheidung
   Fenster D) sind die VORWÄRTSGEWANDTE Ergänzung: phaseCompliance() oben
   bewertet vergangene Ist-Fahrten, aber L1.1 ("Das Blockziel aus
   periodization.js bestimmt, welche Familien überhaupt zulässig sind")
   braucht das Blockziel AM PLANDATUM, aus plan_cards.phase — diese
   Funktion existierte im Konzept nur als Verweis, nicht als Code. Nutzt
   dieselben Phase-Strings wie PHASE_SIGNATURES/CONFIG.phases ("Sweet
   Spot"/"Schwelle"/"VO2max"), keine zweite Vokabular-Übersetzung nötig,
   weil session_formats.block_targets (Migration 0014) bewusst genau diese
   Strings trägt statt des `target_system`-Vokabulars derselben Zeile.
   ============================================================ */

import { addDaysISO } from "./format.js";

/** Reizsignaturen der Plan-2-Blöcke (Ganzfahrt-IF-Korridore).
 *  Untergrenzen bewusst leicht unter Intervall-Zielbereich, weil
 *  Ein-/Ausrollen den Ganzfahrt-IF nach unten zieht. */
export const PHASE_SIGNATURES = {
  "Sweet Spot": { ifMin: 0.8, ifMax: 0.97, types: ["Sweet Spot"] },
  Schwelle: { ifMin: 0.9, ifMax: 1.05, types: ["Schwelle"] },
  VO2max: { ifMin: 1.0, ifMax: 1.4, types: ["VO2max"] },
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
 * Periodisierungs-Erfüllung über die Fahrten der intervals.icu-Ära.
 * Gruppiert nach week (nur Wochen mit Block-Phase), ordnet Wochen ihren
 * Phasen zu und bewertet Blöcke + Erholungswochen.
 * @param {import("../types.js").Ride[]} rides alle Fahrten (wird intern gefiltert)
 * @param {(week: string) => number} weekIndexFn CONFIG.weekIndex für die Sortierung
 * @returns {null | {
 *   blocks: Array<{phase: string, weeks: string[], rides: number, quality: number, expectedQuality: number, share: number, status: "ok"|"teilweise"|"abweichend", note: string}>,
 *   recovery: Array<{week: string, tss: number, refTss: number|null, reduced: boolean|null}>,
 *   totalWeeks: number
 * }} null wenn keine Wochen mit Block-Phase vorhanden
 */
export function phaseCompliance(rides, weekIndexFn) {
  const p2 = (rides || []).filter((r) => r.dataSource === "intervals" && r.week && r.phase);
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
    blocks.push({
      phase,
      weeks: phaseWeeks,
      rides: phaseRides.length,
      quality,
      expectedQuality,
      share,
      status,
      note,
    });
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

/**
 * Blockziel am angegebenen Datum (D3/E2, L1.1) — die Phase der nächsten
 * anstehenden Plankarte mit gesetztem `phase`-Feld (`date >= dateIso`),
 * sonst die der zuletzt vergangenen. `null`, wenn keine Karte ein Blockziel
 * trägt (z. B. Athlet 2s GFNY-Plan, der `phase` bewusst NICHT auf
 * einzelnen Ride-Objekten setzt — hier geht es aber um plan_cards, die bei
 * Athlet 2 durchaus `phase` tragen können, s. `plan-athlete2.js`-Blöcke
 * Basis/Aufbau/Rennhärte/Taper).
 * @param {Array<{date:string, phase?:string|null, cancelled?:boolean}>} cards
 * @param {string} dateIso
 * @returns {string|null}
 */
export function currentBlockTarget(cards, dateIso) {
  const withPhase = (cards || []).filter((c) => c.phase && !c.cancelled);
  if (!withPhase.length) return null;

  const upcoming = withPhase.filter((c) => c.date >= dateIso).sort((a, b) => a.date.localeCompare(b.date));
  if (upcoming.length) return upcoming[0].phase;

  const past = withPhase.filter((c) => c.date < dateIso).sort((a, b) => b.date.localeCompare(a.date));
  return past.length ? past[0].phase : null;
}

/**
 * Frühestes Datum (innerhalb `lookbackDays`), an dem `currentBlockTarget()`
 * noch dasselbe Ergebnis wie an `dateIso` liefert — eine Annäherung an den
 * Blockbeginn, für die Blockstart-Dialog-Erkennung (E2, state/
 * block-transition.js): "hat sich das Blockziel geändert" lässt sich so an
 * einem konkreten Datum festmachen statt nur "vor n Tagen" zu vermuten.
 * Läuft an der `lookbackDays`-Grenze aus, statt unbegrenzt zurückzusuchen
 * (ein durchgehend gleiches Blockziel über Monate ist kein Blockstart mehr).
 * @param {Array<{date:string, phase?:string|null, cancelled?:boolean}>} cards
 * @param {string} dateIso
 * @param {number} [lookbackDays]
 * @returns {string|null} null, wenn an dateIso selbst kein Blockziel vorliegt
 */
export function blockStartDate(cards, dateIso, lookbackDays = 120) {
  const target = currentBlockTarget(cards, dateIso);
  if (!target) return null;

  let start = dateIso;
  let cursor = dateIso;
  for (let i = 0; i < lookbackDays; i++) {
    cursor = addDaysISO(cursor, -1);
    if (currentBlockTarget(cards, cursor) !== target) break;
    start = cursor;
  }
  return start;
}
