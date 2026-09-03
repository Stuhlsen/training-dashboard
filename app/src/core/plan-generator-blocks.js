/* ============================================================
   CORE/PLAN-GENERATOR-BLOCKS.JS — Blockfolge & Wochen-Verteilung (kein DOM)

   Fahrplan 8 E2 (docs/fahrplan-8-plan-generator.md). Reine Tabellen +
   Verteilungslogik für den Trainingsplan-Generator: welche Periodisierungs-
   phase trägt welche Woche, wie liegen die Erholungswochen. Ausgelagert aus
   plan-generator.js, damit keine der beiden Dateien zu groß wird (Fallow
   „Unit Size").

   Deckt nur `pyramidal` + `linear` ab — `polarized` + `block` kommen in E9
   (Abhängigkeitsgraph im Fahrplan). Kein I/O, kein React, kein document/window.
   ============================================================ */

/** Aufbau-Phasen in fester Reihenfolge (aerob → spezifisch). Der neue String
 *  „Grundlage" ergänzt das bestehende Phasen-Vokabular (config.ts::PHASES,
 *  periodization.js::PHASE_SIGNATURES) um die rein-aerobe Basisphase —
 *  Feinentscheidung aus dem Fahrplan. */
export const BUILD_PHASES = ["Grundlage", "Sweet Spot", "Schwelle", "VO2max"];

/**
 * Anteil je Aufbau-Phase an den Nicht-Taper-, Nicht-Erholungs-Wochen.
 * In E2 finalisiert (Fahrplan „Feinentscheidungen"). Erste begründete
 * Näherung, nach echter Nutzung gegen die Ist-Daten zu kalibrieren
 * (wie CONFLICT_THRESHOLDS, K1).
 * @type {Record<"pyramidal"|"linear", Record<string, number>>}
 */
export const MODEL_BLOCK_SHARES = Object.freeze({
  // Allrounder / TID-Pyramide — gleichmäßig über die vier Systeme.
  pyramidal: Object.freeze({ Grundlage: 0.25, "Sweet Spot": 0.25, Schwelle: 0.25, VO2max: 0.25 }),
  // Umfang früh hoch/locker, Intensität wandert nach hinten — Einsteiger /
  // lange Vorlaufzeit.
  linear: Object.freeze({ Grundlage: 0.4, "Sweet Spot": 0.25, Schwelle: 0.2, VO2max: 0.15 }),
});

/**
 * Erholungsrhythmus-Periode: jede `period`-te Woche ist eine Erholungswoche
 * (2:1 → 3, 3:1 → 4). Level-abhängig; ab 40 Jahren immer 2:1 (Fahrplan
 * Entscheidung 9).
 * @param {"einsteiger"|"fortgeschritten"} level
 * @param {number|null} [ageYears]
 * @returns {3|4}
 */
export function recoveryPeriod(level, ageYears) {
  if (ageYears != null && ageYears >= 40) return 3;
  return level === "einsteiger" ? 3 : 4;
}

/**
 * 0-basierte Indizes der Erholungswochen innerhalb der Bau-Wochen
 * (Bau-Wochen = alle Wochen ohne Taper). Nie Woche 0; nie die letzte
 * Bau-Woche (die soll voll in den Taper übergehen) — eine solche wird eine
 * Woche vorgezogen, wenn dort noch frei.
 * @param {number} buildWeeks
 * @param {number} period
 * @returns {number[]} aufsteigend
 */
export function recoveryWeekIndices(buildWeeks, period) {
  const idx = [];
  for (let i = period - 1; i < buildWeeks; i += period) {
    if (i === 0) continue;
    idx.push(i);
  }
  const last = buildWeeks - 1;
  const pos = idx.indexOf(last);
  if (pos !== -1) {
    if (last - 1 > 0 && !idx.includes(last - 1)) idx[pos] = last - 1;
    else idx.splice(pos, 1);
  }
  return idx;
}

/**
 * Largest-Remainder-Verteilung: verteilt `total` ganze Einheiten nach
 * `weights`, sodass die Summe exakt `total` ist. Bei Gleichstand im
 * Restanteil gewinnt der kleinere Index (deterministisch).
 * @param {number[]} weights
 * @param {number} total  ganzzahlig ≥ 0
 * @returns {number[]} gleiche Länge wie `weights`, Summe = total
 */
export function largestRemainder(weights, total) {
  const wsum = weights.reduce((s, w) => s + w, 0) || 1;
  const raw = weights.map((w) => (w / wsum) * total);
  const out = raw.map((x) => Math.floor(x));
  let rem = total - out.reduce((s, x) => s + x, 0);
  const order = raw
    .map((x, i) => ({ i, frac: x - Math.floor(x) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (let k = 0; k < order.length && rem > 0; k++) {
    out[order[k].i]++;
    rem--;
  }
  return out;
}

/** Sorgt dafür, dass jede Aufbau-Phase mindestens eine Woche trägt, indem
 *  Wochen vom jeweils größten Block abgezweigt werden. Mutiert `counts`.
 *  @param {number[]} counts */
function ensureEachPhaseHasAWeek(counts) {
  for (let i = 0; i < counts.length; i++) {
    if (counts[i] > 0) continue;
    const donor = counts.indexOf(Math.max(...counts));
    if (counts[donor] > 1) {
      counts[donor]--;
      counts[i]++;
    }
  }
}

/** Aufbau-Phasen-Zähler zu einer Woche-für-Woche-Sequenz expandieren.
 *  @param {number[]} counts @returns {string[]} */
function expandPhaseRun(counts) {
  const run = [];
  BUILD_PHASES.forEach((p, i) => {
    for (let k = 0; k < counts[i]; k++) run.push(p);
  });
  return run;
}

/**
 * Phasen-Label + Erholungsflag je Woche für den gesamten Plan.
 * @param {object} args
 * @param {number} args.totalWeeks
 * @param {number} args.taperWeeks  0 im `open`-Modus
 * @param {"pyramidal"|"linear"} args.model
 * @param {"einsteiger"|"fortgeschritten"} args.level
 * @param {number|null} [args.ageYears]
 * @returns {{ phases: string[], isRecovery: boolean[], warnings: string[] }}
 *   `phases`/`isRecovery` haben Länge `totalWeeks`.
 */
export function buildPhaseSequence({ totalWeeks, taperWeeks, model, level, ageYears = null }) {
  const warnings = [];
  const buildWeeks = Math.max(0, totalWeeks - taperWeeks);
  const period = recoveryPeriod(level, ageYears);
  const recIdx = new Set(recoveryWeekIndices(buildWeeks, period));
  const workWeeks = buildWeeks - recIdx.size;

  const shares = MODEL_BLOCK_SHARES[model] || MODEL_BLOCK_SHARES.pyramidal;
  const counts = largestRemainder(
    BUILD_PHASES.map((p) => shares[p]),
    workWeeks
  );

  if (workWeeks >= BUILD_PHASES.length) {
    ensureEachPhaseHasAWeek(counts);
  } else if (workWeeks > 0) {
    warnings.push(
      `Nur ${workWeeks} Aufbau-Woche(n) — nicht jede Phase (${BUILD_PHASES.join("/")}) hat eine eigene Woche.`
    );
  }

  const phaseRun = expandPhaseRun(counts);
  const phases = [];
  const isRecovery = [];
  let cursor = 0;
  for (let i = 0; i < buildWeeks; i++) {
    if (recIdx.has(i)) {
      phases.push("Erholung");
      isRecovery.push(true);
    } else {
      phases.push(phaseRun[cursor] ?? BUILD_PHASES[BUILD_PHASES.length - 1]);
      cursor++;
      isRecovery.push(false);
    }
  }
  for (let i = 0; i < taperWeeks; i++) {
    phases.push("Taper");
    isRecovery.push(false);
  }
  return { phases, isRecovery, warnings };
}
