/* ============================================================
   CORE/PLAN-GENERATOR-BLOCKS.JS — Blockfolge & Wochen-Verteilung (kein DOM)

   Fahrplan 8 E2 (docs/fahrplan-8-plan-generator.md). Reine Tabellen +
   Verteilungslogik für den Trainingsplan-Generator: welche Periodisierungs-
   phase trägt welche Woche, wie liegen die Erholungswochen. Ausgelagert aus
   plan-generator.js, damit keine der beiden Dateien zu groß wird (Fallow
   „Unit Size").

   Deckt alle vier Modelle ab: `pyramidal` + `linear` (E2, geteilte
   Share-Tabelle) sowie `polarized` + `block` (E9, je eigener Sequenz-Builder,
   weil ihre Block-/Erholungsstruktur nicht in eine Anteilstabelle passt).
   Kein I/O, kein React, kein document/window.
   ============================================================ */

/** Aufbau-Phasen in fester Reihenfolge (aerob → spezifisch). Der neue String
 *  „Grundlage" ergänzt das bestehende Phasen-Vokabular (config.ts::PHASES,
 *  periodization.js::PHASE_SIGNATURES) um die rein-aerobe Basisphase —
 *  Feinentscheidung aus dem Fahrplan. */
export const BUILD_PHASES = ["Grundlage", "Sweet Spot", "Schwelle", "VO2max"];

/** Die drei konzentrierten System-Blöcke des `block`-Modells, in Reihenfolge.
 *  „rennspezifisch" wird aufs bestehende Phasen-Vokabular „Sweet Spot"
 *  abgebildet (sustained race-pace) — kein neuer Phasen-String, damit
 *  selectWorkout()/PHASE_PLAN ohne Übersetzungsschicht greifen. */
export const BLOCK_SYSTEMS = ["VO2max", "Schwelle", "Sweet Spot"];
const BLOCK_MIN_WEEKS = 2;
const BLOCK_MAX_WEEKS = 3;

/** @param {number} v @param {number} lo @param {number} hi @returns {number} */
const clampInt = (v, lo, hi) => Math.min(hi, Math.max(lo, Math.round(v)));

/**
 * Anteil je Aufbau-Phase an den Nicht-Taper-, Nicht-Erholungs-Wochen — nur
 * für `pyramidal` + `linear`. `polarized`/`block` haben eigene Sequenz-Builder
 * (polarizedSequence / blockSequence) und stehen bewusst nicht in dieser
 * Tabelle. In E2 finalisiert (Fahrplan „Feinentscheidungen"). Erste begründete
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
 * Aufbau-Phasenlauf (nur die Nicht-Erholungs-Wochen) + Erholungsindizes zu
 * Woche-für-Woche-Arrays der Länge `buildWeeks` verweben.
 * @param {number} buildWeeks
 * @param {Set<number>} recIdxSet  0-basierte Erholungswochen-Indizes
 * @param {string[]} phaseRun  Phasen der Nicht-Erholungs-Wochen, in Reihenfolge
 * @param {string[]} warnings  durchgereicht
 * @returns {{ phases: string[], isRecovery: boolean[], warnings: string[] }}
 */
function interleaveRecovery(buildWeeks, recIdxSet, phaseRun, warnings) {
  const phases = [];
  const isRecovery = [];
  let cursor = 0;
  for (let i = 0; i < buildWeeks; i++) {
    if (recIdxSet.has(i)) {
      phases.push("Erholung");
      isRecovery.push(true);
    } else {
      phases.push(phaseRun[cursor] ?? BUILD_PHASES[BUILD_PHASES.length - 1]);
      cursor++;
      isRecovery.push(false);
    }
  }
  return { phases, isRecovery, warnings };
}

/**
 * `pyramidal` / `linear`: BUILD_PHASES nach MODEL_BLOCK_SHARES über die
 * Arbeitswochen verteilen, Erholungswochen im level-/altersabhängigen
 * Rhythmus (recoveryPeriod) dazwischen.
 * @param {{ buildWeeks: number, model: "pyramidal"|"linear",
 *   level: "einsteiger"|"fortgeschritten", ageYears: number|null }} a
 * @returns {{ phases: string[], isRecovery: boolean[], warnings: string[] }}
 */
function classicSequence({ buildWeeks, model, level, ageYears }) {
  const warnings = [];
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

  return interleaveRecovery(buildWeeks, recIdx, expandPhaseRun(counts), warnings);
}

/**
 * `polarized`: kurzer Grundlagen-Block (~20 % der Arbeitswochen), danach
 * durchgehend abwechselnd Schwelle-/VO2max-Qualitätswochen. Kein „Sweet Spot".
 * Die lockeren Tage bleiben in jedem Modell strikt Z2 (buildWeekCards) — das
 * ergibt zusammen die 80/20-TID. Erholungsrhythmus wie im klassischen Fall.
 * @param {number} buildWeeks
 * @param {"einsteiger"|"fortgeschritten"} level
 * @param {number|null} ageYears
 * @returns {{ phases: string[], isRecovery: boolean[], warnings: string[] }}
 */
function polarizedSequence(buildWeeks, level, ageYears) {
  const warnings = [];
  if (buildWeeks <= 0) return { phases: [], isRecovery: [], warnings };

  const period = recoveryPeriod(level, ageYears);
  const recIdx = new Set(recoveryWeekIndices(buildWeeks, period));
  const workWeeks = buildWeeks - recIdx.size;

  // Grundlage: ~20 %, aber mind. 1 (bei ≥ 3 Arbeitswochen) und so, dass für
  // je eine Schwelle- und VO2max-Woche Platz bleibt.
  let grundlage = clampInt(workWeeks * 0.2, workWeeks >= 3 ? 1 : 0, Math.max(0, workWeeks - 2));
  if (workWeeks < 3) {
    grundlage = 0;
    warnings.push(`Nur ${workWeeks} Aufbau-Woche(n) — polarisierter Plan ohne vollen Grundlagen-Block.`);
  }

  const run = [];
  for (let i = 0; i < grundlage; i++) run.push("Grundlage");
  for (let k = 0; run.length < workWeeks; k++) run.push(k % 2 === 0 ? "Schwelle" : "VO2max");

  return interleaveRecovery(buildWeeks, recIdx, run, warnings);
}

/**
 * `block`: kurzer Grundlagen-Block (~15 %), danach drei konzentrierte
 * 2–3-Wochen-Blöcke (BLOCK_SYSTEMS: VO2max → Schwelle → rennspezifisch) mit je
 * einer Erholungswoche dazwischen. Für kurze Vorbereitungen gedacht; bei zu
 * vielen Wochen wandert der Rest in die Grundlage (mit Warnung).
 * @param {number} buildWeeks
 * @returns {{ phases: string[], isRecovery: boolean[], warnings: string[] }}
 */
function blockSequence(buildWeeks) {
  const warnings = [];
  if (buildWeeks <= 0) return { phases: [], isRecovery: [], warnings };

  const nBlocks = BLOCK_SYSTEMS.length;
  const recoveries = buildWeeks >= 9 ? 2 : buildWeeks >= 6 ? 1 : 0;
  let grundlage = Math.max(1, Math.round(buildWeeks * 0.15));
  const pool = Math.max(0, buildWeeks - grundlage - recoveries);

  const minEach = pool < nBlocks * BLOCK_MIN_WEEKS ? 1 : BLOCK_MIN_WEEKS;
  if (pool < nBlocks * BLOCK_MIN_WEEKS) {
    warnings.push(
      `Nur ${buildWeeks} Aufbau-Wochen — das Block-Modell braucht ~9+; Blöcke auf ${minEach} Woche(n) verkürzt.`
    );
  }
  const counts = largestRemainder([1, 1, 1], Math.max(nBlocks * minEach, pool)).map((c) =>
    clampInt(c, minEach, BLOCK_MAX_WEEKS)
  );
  const leftover = Math.max(0, pool - counts.reduce((s, c) => s + c, 0));
  if (leftover > 0) {
    grundlage += leftover;
    warnings.push(
      `Block-Modell: ${leftover} Zusatzwoche(n) in die Grundlage gelegt — eine lange Vorbereitung passt schlecht zum Block-Modell.`
    );
  }

  const phases = [];
  const isRecovery = [];
  const push = (n, label) => {
    for (let i = 0; i < n && phases.length < buildWeeks; i++) {
      phases.push(label);
      isRecovery.push(label === "Erholung");
    }
  };
  push(grundlage, "Grundlage");
  BLOCK_SYSTEMS.forEach((sys, i) => {
    push(counts[i], sys);
    if (i < recoveries) push(1, "Erholung");
  });
  // Rundungsreste angleichen (Clamping kann die Summe knapp verfehlen).
  while (phases.length < buildWeeks) {
    phases.push("Grundlage");
    isRecovery.push(false);
  }
  phases.length = buildWeeks;
  isRecovery.length = buildWeeks;
  return { phases, isRecovery, warnings };
}

/**
 * Phasen-Label + Erholungsflag je Woche für den gesamten Plan.
 * @param {object} args
 * @param {number} args.totalWeeks
 * @param {number} args.taperWeeks  0 im `open`-Modus
 * @param {"pyramidal"|"polarized"|"block"|"linear"} args.model
 * @param {"einsteiger"|"fortgeschritten"} args.level
 * @param {number|null} [args.ageYears]
 * @returns {{ phases: string[], isRecovery: boolean[], warnings: string[] }}
 *   `phases`/`isRecovery` haben Länge `totalWeeks`.
 */
export function buildPhaseSequence({ totalWeeks, taperWeeks, model, level, ageYears = null }) {
  const buildWeeks = Math.max(0, totalWeeks - taperWeeks);

  const seq =
    model === "block"
      ? blockSequence(buildWeeks)
      : model === "polarized"
        ? polarizedSequence(buildWeeks, level, ageYears)
        : classicSequence({ buildWeeks, model, level, ageYears });

  const phases = seq.phases.slice();
  const isRecovery = seq.isRecovery.slice();
  for (let i = 0; i < taperWeeks; i++) {
    phases.push("Taper");
    isRecovery.push(false);
  }
  return { phases, isRecovery, warnings: seq.warnings };
}
