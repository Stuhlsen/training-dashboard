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

// Umfang früh hoch/locker, Intensität wandert nach hinten — Einsteiger /
// lange Vorlaufzeit. Von `reverse` unten geteilt (gleiche Anteile, nur
// umgekehrte Blockreihenfolge), damit eine künftige Kalibrierung nicht
// versehentlich nur eine der beiden Kopien trifft.
const LINEAR_SHARES = Object.freeze({ Grundlage: 0.4, "Sweet Spot": 0.25, Schwelle: 0.2, VO2max: 0.15 });

/**
 * Anteil je Aufbau-Phase an den Nicht-Taper-, Nicht-Erholungs-Wochen — nur
 * für `pyramidal` + `linear`/`reverse`. `polarized`/`block` haben eigene
 * Sequenz-Builder (polarizedSequence / blockSequence) und stehen bewusst
 * nicht in dieser Tabelle. In E2 finalisiert (Fahrplan „Feinentscheidungen").
 * Erste begründete Näherung, nach echter Nutzung gegen die Ist-Daten zu
 * kalibrieren (wie CONFLICT_THRESHOLDS, K1).
 * @type {Record<"pyramidal"|"linear"|"reverse", Record<string, number>>}
 */
export const MODEL_BLOCK_SHARES = Object.freeze({
  // Allrounder / TID-Pyramide — gleichmäßig über die vier Systeme.
  pyramidal: Object.freeze({ Grundlage: 0.25, "Sweet Spot": 0.25, Schwelle: 0.25, VO2max: 0.25 }),
  linear: LINEAR_SHARES,
  // Gleiche Anteile wie `linear`, aber umgekehrte Reihenfolge (VO2max zuerst,
  // Grundlage zuletzt vor dem Taper) — für erfahrene Athlet:innen mit knapper
  // Vorlaufzeit oder bereits hoher Basisfitness (Reverse-Periodisierung).
  reverse: LINEAR_SHARES,
});

/** Fahrplan 14 E2/E3: Aufbau-Phasen für Nicht-Rad-Sportarten — kein Sweet
 *  Spot (Fahrplan-Feinentscheidung „3 Phasen: Grundlage/Schwelle/VO2max",
 *  deckungsgleich mit RUNNING_PHASE_SIGNATURES/SWIMMING_PHASE_SIGNATURES).
 *  Wird `buildPhaseSequence()` als `phases`-Override durchgereicht. */
export const GENERIC_BUILD_PHASES = ["Grundlage", "Schwelle", "VO2max"];

/** Fahrplan 14 E2/E3, Alex-Entscheidung 2026-09-14: das `block`-Modell hat
 *  für Rad drei konzentrierte Blöcke (VO2max/Schwelle/Sweet Spot); Lauf/
 *  Schwimm kennen kein Sweet-Spot-Äquivalent, darum nur zwei Blöcke
 *  (VO2max, Schwelle) — die frei werdende Zeit wandert in die Grundlage
 *  (dieselbe „zu wenig Wochen"-Weiche wie unten in blockSequence()). */
export const GENERIC_BLOCK_SYSTEMS = ["VO2max", "Schwelle"];

/** GENERIC_BUILD_PHASES-Anteile, aus MODEL_BLOCK_SHARES abgeleitet: der
 *  „Sweet Spot"-Anteil entfällt, die übrigen drei Anteile werden proportional
 *  auf 1 renormalisiert. Keine neue Kalibrierung (Fahrplan-14-Nicht-Ziel) —
 *  nur eine konsistente Projektion der (ebenfalls unkalibrierten) Rad-Anteile.
 *  @param {Record<string, number>} shares @returns {Record<string, number>} */
function dropSweetSpot(shares) {
  const kept = GENERIC_BUILD_PHASES.map((p) => shares[p] ?? 0);
  const sum = kept.reduce((s, v) => s + v, 0) || 1;
  return Object.fromEntries(GENERIC_BUILD_PHASES.map((p, i) => [p, kept[i] / sum]));
}

/** @type {Record<"pyramidal"|"linear"|"reverse", Record<string, number>>} */
export const GENERIC_MODEL_BLOCK_SHARES = Object.freeze({
  pyramidal: Object.freeze(dropSweetSpot(MODEL_BLOCK_SHARES.pyramidal)),
  linear: Object.freeze(dropSweetSpot(MODEL_BLOCK_SHARES.linear)),
  reverse: Object.freeze(dropSweetSpot(MODEL_BLOCK_SHARES.reverse)),
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

/**
 * Verschiebt eine Aufbau-Woche zugunsten des schwächsten Systems (E10,
 * Power-Curve-Schwäche bei allgemeinem Fokus). Spender ist die Phase mit
 * dem größten `counts`-Wert unter allen Nicht-Ziel-, Nicht-`Grundlage`-
 * Phasen mit `> 1` Woche — die Grundlage wird nie verkleinert. Kein
 * Spielraum → kein Shift. Mutiert `counts`, hängt ggf. eine Warnung an.
 * @param {number[]} counts  Länge/Reihenfolge wie `buildPhases`
 * @param {string|null} weaknessPhase
 * @param {string[]} warnings
 * @param {string[]} buildPhases  Fahrplan 14 E2/E3: sport-abhängige Phasenliste
 *   (Default `BUILD_PHASES`, s. Aufrufer)
 */
function applyWeaknessBias(counts, weaknessPhase, warnings, buildPhases) {
  if (!weaknessPhase) return;
  const target = buildPhases.indexOf(weaknessPhase);
  if (target < 0) return;

  let donor = -1;
  for (let i = 0; i < counts.length; i++) {
    if (i === target || buildPhases[i] === "Grundlage") continue;
    if (counts[i] > 1 && (donor < 0 || counts[i] > counts[donor])) donor = i;
  }
  if (donor < 0) return;

  counts[donor]--;
  counts[target]++;
  warnings.push(
    `Power-Kurve: schwächste Dauer „${weaknessPhase}" — eine Woche mehr zulasten „${buildPhases[donor]}".`
  );
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
 *  @param {number[]} counts @param {string[]} buildPhases @returns {string[]} */
function expandPhaseRun(counts, buildPhases) {
  const run = [];
  buildPhases.forEach((p, i) => {
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
 * @param {string} [fallbackPhase]  Phase für einen (eigentlich nicht
 *   vorkommenden) Cursor-Überlauf — Default "VO2max" (letzte BUILD_PHASES-Phase)
 * @returns {{ phases: string[], isRecovery: boolean[], warnings: string[] }}
 */
function interleaveRecovery(buildWeeks, recIdxSet, phaseRun, warnings, fallbackPhase = "VO2max") {
  const phases = [];
  const isRecovery = [];
  let cursor = 0;
  for (let i = 0; i < buildWeeks; i++) {
    if (recIdxSet.has(i)) {
      phases.push("Erholung");
      isRecovery.push(true);
    } else {
      phases.push(phaseRun[cursor] ?? fallbackPhase);
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
 * @param {{ buildWeeks: number, model: "pyramidal"|"linear"|"reverse",
 *   level: "einsteiger"|"fortgeschritten", ageYears: number|null,
 *   weaknessPhase?: string|null, buildPhases?: string[],
 *   shareTable?: Record<string, Record<string, number>> }} a
 *   `buildPhases`/`shareTable` — Fahrplan 14 E2/E3: sport-abhängige
 *   Überschreibung (Default `BUILD_PHASES`/`MODEL_BLOCK_SHARES`, Rad).
 * @returns {{ phases: string[], isRecovery: boolean[], warnings: string[] }}
 */
function classicSequence({
  buildWeeks,
  model,
  level,
  ageYears,
  weaknessPhase = null,
  buildPhases = BUILD_PHASES,
  shareTable = MODEL_BLOCK_SHARES,
}) {
  const warnings = [];
  const period = recoveryPeriod(level, ageYears);
  const recIdx = new Set(recoveryWeekIndices(buildWeeks, period));
  const workWeeks = buildWeeks - recIdx.size;

  const shares = shareTable[model] || shareTable.pyramidal;
  const counts = largestRemainder(
    buildPhases.map((p) => shares[p] ?? 0),
    workWeeks
  );

  if (workWeeks >= buildPhases.length) {
    ensureEachPhaseHasAWeek(counts);
    applyWeaknessBias(counts, weaknessPhase, warnings, buildPhases);
  } else if (workWeeks > 0) {
    warnings.push(
      `Nur ${workWeeks} Aufbau-Woche(n) — nicht jede Phase (${buildPhases.join("/")}) hat eine eigene Woche.`
    );
  }

  return interleaveRecovery(
    buildWeeks,
    recIdx,
    expandPhaseRun(counts, buildPhases),
    warnings,
    buildPhases[buildPhases.length - 1]
  );
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
 * @param {string[]} [systems]  Fahrplan 14 E2/E3: sport-abhängige
 *   Block-Reihenfolge (Default `BLOCK_SYSTEMS`, Rad — 3 Blöcke inkl.
 *   Sweet Spot; Lauf/Schwimm nutzen `GENERIC_BLOCK_SYSTEMS`, 2 Blöcke)
 * @param {boolean} [isGeneric]  Fahrplan-14-Review: explizites Signal statt
 *   `systems === BLOCK_SYSTEMS`-Identitätsvergleich (fragil gegen jeden
 *   Aufrufer, der ein wertgleiches, aber anderes Array übergibt) — vom
 *   Aufrufer (`buildPhaseSequence()`) aus demselben `phases`-Flag gesetzt,
 *   das auch `buildPhases`/`shareTable`/`blockSystems` bestimmt.
 * @returns {{ phases: string[], isRecovery: boolean[], warnings: string[] }}
 */
function blockSequence(buildWeeks, systems = BLOCK_SYSTEMS, isGeneric = false) {
  const warnings = [];
  if (buildWeeks <= 0) return { phases: [], isRecovery: [], warnings };

  const nBlocks = systems.length;
  const recoveries = buildWeeks >= 9 ? 2 : buildWeeks >= 6 ? 1 : 0;
  let grundlage = Math.max(1, Math.round(buildWeeks * 0.15));
  const pool = Math.max(0, buildWeeks - grundlage - recoveries);

  const minEach = pool < nBlocks * BLOCK_MIN_WEEKS ? 1 : BLOCK_MIN_WEEKS;
  if (pool < nBlocks * BLOCK_MIN_WEEKS) {
    // Ride-Pfad (isGeneric: false): Text unverändert (Golden-Master-Schutz).
    // Generischer Pfad (Lauf/Schwimm, andere Blockzahl): dynamisch berechnet.
    warnings.push(
      !isGeneric
        ? `Nur ${buildWeeks} Aufbau-Wochen — das Block-Modell braucht ~9+; Blöcke auf ${minEach} Woche(n) verkürzt.`
        : `Nur ${buildWeeks} Aufbau-Wochen — das Block-Modell braucht mindestens ${nBlocks * BLOCK_MIN_WEEKS} Wochen für ${nBlocks} Blöcke (+ Grundlage); Blöcke auf ${minEach} Woche(n) verkürzt.`
    );
  }
  const counts = largestRemainder(new Array(nBlocks).fill(1), Math.max(nBlocks * minEach, pool)).map((c) =>
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
  systems.forEach((sys, i) => {
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
 * @param {"pyramidal"|"polarized"|"block"|"linear"|"reverse"} args.model
 * @param {"einsteiger"|"fortgeschritten"} args.level
 * @param {number|null} [args.ageYears]
 * @param {string|null} [args.weaknessPhase]  E10: Aufbau-Phase, die eine Woche
 *   mehr bekommt (nur `pyramidal`/`linear` — `polarized`/`block` haben keine
 *   tunbaren Anteile und ignorieren den Wert bewusst).
 * @param {string[]|null} [args.phases]  Fahrplan 14 E2/E3: sport-abhängige
 *   Aufbau-Phasenliste (Default `null` → Rad-Vokabular `BUILD_PHASES` +
 *   `MODEL_BLOCK_SHARES`/`BLOCK_SYSTEMS`; gesetzt → `classicSequence()`
 *   nutzt diese Liste + `GENERIC_MODEL_BLOCK_SHARES`, `blockSequence()`
 *   `GENERIC_BLOCK_SYSTEMS`. `polarizedSequence()` braucht keine Anpassung —
 *   sie nutzt bereits nur Grundlage/Schwelle/VO2max, nie Sweet Spot.)
 * @returns {{ phases: string[], isRecovery: boolean[], warnings: string[] }}
 *   `phases`/`isRecovery` haben Länge `totalWeeks`.
 */
/**
 * Fahrplan 8 E13 („Rest neu berechnen"): die eingefrorene Blockstruktur eines
 * bestehenden Plans aus seinem `week_model` rekonstruieren, statt sie neu
 * abzuleiten. `phases`/`isRecovery` haben Länge `baseWeekModel.length`.
 * Erholungswochen tragen im `week_model` `phase === "Erholung"` (s.
 * interleaveRecovery), die Taper-Wochen stehen am Ende.
 * @param {Array<{phase: string, start: string}>} baseWeekModel  V4 WeekModelEntry[]
 * @returns {{ phases: string[], isRecovery: boolean[], taperWeeks: number }}
 */
export function sequenceFromWeekModel(baseWeekModel) {
  const phases = baseWeekModel.map((w) => w.phase);
  const isRecovery = phases.map((p) => p === "Erholung");
  let taperWeeks = 0;
  for (let i = phases.length - 1; i >= 0 && phases[i] === "Taper"; i--) taperWeeks++;
  return { phases, isRecovery, taperWeeks };
}

export function buildPhaseSequence({
  totalWeeks,
  taperWeeks,
  model,
  level,
  ageYears = null,
  weaknessPhase = null,
  phases = null,
}) {
  const buildWeeks = Math.max(0, totalWeeks - taperWeeks);
  const buildPhases = phases || BUILD_PHASES;
  const shareTable = phases ? GENERIC_MODEL_BLOCK_SHARES : MODEL_BLOCK_SHARES;
  const blockSystems = phases ? GENERIC_BLOCK_SYSTEMS : BLOCK_SYSTEMS;

  const seq =
    model === "block"
      ? blockSequence(buildWeeks, blockSystems, Boolean(phases))
      : model === "polarized"
        ? polarizedSequence(buildWeeks, level, ageYears)
        : model === "reverse"
          ? classicSequence({
              buildWeeks,
              model,
              level,
              ageYears,
              weaknessPhase,
              buildPhases: [...buildPhases].reverse(),
              shareTable,
            })
          : classicSequence({ buildWeeks, model, level, ageYears, weaknessPhase, buildPhases, shareTable });

  const phasesOut = seq.phases.slice();
  const isRecovery = seq.isRecovery.slice();
  for (let i = 0; i < taperWeeks; i++) {
    phasesOut.push("Taper");
    isRecovery.push(false);
  }
  return { phases: phasesOut, isRecovery, warnings: seq.warnings };
}
