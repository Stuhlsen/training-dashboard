/* ============================================================
   CORE/COMPLIANCE-MATCH.JS — Soll-Ist-Matching + Compliance-Ampel
   (kein DOM, kein I/O)
   (Progressionssteuerung — docs/konzept-progressionssteuerung.md C1/C2)

   Nimmt eine (idealerweise per core/workout-validator.js geprüfte)
   workout_structure und die rohen icu_intervals-Segmente einer Fahrt
   (scripts/lib/interval-blocks.js-Cache) entgegen und berechnet, ob die
   geplanten Intervalle erfüllt wurden. `ftp` wird als fertiger Wert
   entgegengenommen, dieselbe Aufrufkonvention wie core/session-classify.js
   und core/workout-math.js — keine eigene Beschaffung hier.

   Matching-Prinzip (C1): geplante `set`-Reps und `alternating`-Reps werden
   in ZEITLICHER REIHENFOLGE gegen zusammenhängende Ist-Blöcke gematcht
   (Positions-Matching, NICHT Dauergleichheit) — ein abgebrochenes drittes
   Intervall darf nicht fälschlich dem zweiten zugeordnet werden.

   Blockerkennung: dieselbe "absoluter Watt-Schwellenwert + Gap-Toleranz"-
   Logik wie scripts/lib/interval-blocks.js::longestBlockAboveThreshold(),
   hier aber ALLE qualifizierenden Blöcke statt nur des längsten — bewusst
   frisch implementiert statt importiert (core/ importiert nicht aus
   scripts/lib/, s. Schichtenregel AGENTS.md). Die Schwelle wird nicht aus
   der v2-Typerkennung übernommen (die ist auf "Sweet-Spot-oder-höher" fix
   kalibriert), sondern je Workout aus dessen eigener niedrigster aktiver
   Zielintensität abgeleitet (deriveThresholdWatts) — ein VO2max- und ein
   Sweet-Spot-Workout brauchen unterschiedliche Blockgrenzen.

   `accessory`-Schritte (Sprints, D1.3/L6.1) sind hier grundsätzlich nicht
   matchbar — sie haben eine eigene Währung (Wiederholungen/Spitzenleistung)
   und dürfen die Ampel des Hauptteils nicht beeinflussen.
   ============================================================ */

import { COMPLIANCE } from "./plan-config.js";

/** @param {number|null|undefined} v */
function numOrNull(v) {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/**
 * Bei mehreren Fahrten am selben Tag die für Compliance relevante
 * Hauptfahrt wählen: als "Ausrollen" erkannte Fahrten (map-activity.js::
 * classifyCooldowns) scheiden aus, von den verbleibenden gewinnt die mit
 * dem höheren TSS (Tiebreak: Dauer). Begründete Auswahl statt
 * stillschweigend die erste zu nehmen (Auftragsvorgabe).
 * @param {Array<{typ?:string, tss?:number|null, min?:number|null}>} ridesOfDay
 * @returns {Object|null}
 */
export function pickPrimaryRide(ridesOfDay) {
  const candidates = (ridesOfDay || []).filter((r) => r && r.typ !== "Ausrollen");
  if (!candidates.length) return null;
  return candidates.reduce((best, r) => {
    if (!best) return r;
    const rScore = numOrNull(r.tss) ?? 0;
    const bestScore = numOrNull(best.tss) ?? 0;
    if (rScore !== bestScore) return rScore > bestScore ? r : best;
    return (numOrNull(r.min) ?? 0) > (numOrNull(best.min) ?? 0) ? r : best;
  }, null);
}

/**
 * Vorfilter: darf diese Karte überhaupt gegen eine Fahrt evaluiert werden?
 * Deckt die im Auftrag genannten Ausschlussfälle strukturell ab (Karte ohne
 * Struktur/Altbestand, ausgefallene Karte, rest-Karte — D6.1: ein
 * gefahrener Ruhetag bekommt das bestehende eigene Trainer-Signal, kein
 * Compliance-Objekt).
 * @param {{workoutStructure?:any, status?:string, typ?:string}} card
 */
export function shouldEvaluateCard(card) {
  if (!card) return false;
  if (card.status === "ausgefallen") return false;
  if (card.typ === "rest") return false;
  const structure = card.workoutStructure;
  return !!structure && typeof structure === "object" && Array.isArray(structure.steps) && structure.steps.length > 0;
}

/** Eine Dauer/Intensitäts-Phase in Sollwatt übersetzen — `null` bei
 *  fehlenden/unplausiblen Werten (defensiv, wie workout-math.js::phaseInstance).
 *  @param {any} phase @param {number} ftp
 *  @returns {{durationS:number, targetPct:number, targetWatts:number}|null} */
function phaseTarget(phase, ftp) {
  if (!phase || typeof phase !== "object") return null;
  const durationS = numOrNull(phase.duration_s);
  const targetPct = numOrNull(phase.target_pct_ftp);
  if (!durationS || durationS <= 0 || targetPct == null || !ftp) return null;
  return { durationS, targetPct, targetWatts: (targetPct / 100) * ftp };
}

/**
 * Geordnete Liste matchbarer Einheiten aus workout_structure — ein Eintrag
 * je geplantem `set`-Rep (Work-Phase) bzw. je `alternating`-Rep (ein
 * zusammenhängender Over/Under-Block, D1.3). `accessory`/`warmup`/
 * `cooldown`/`steady` sind nicht matchbar und werden übersprungen.
 * @param {{steps?:Array<Object>}|null|undefined} structure
 * @param {number} ftp
 * @returns {Array<Object>} geordnete Einheiten, s. Kommentare an den beiden Zweigen
 */
export function expandPlannedIntervals(structure, ftp) {
  const units = [];
  const steps = Array.isArray(structure?.steps) ? structure.steps : [];
  for (const step of steps) {
    if (!step || typeof step !== "object") continue;

    if (step.kind === "set") {
      const work = phaseTarget(step.work, ftp);
      if (!work) continue;
      const reps = Number.isInteger(step.reps) && step.reps > 0 ? step.reps : 0;
      for (let i = 0; i < reps; i++) {
        units.push({
          kind: "set",
          plannedDurationS: work.durationS,
          targetPct: work.targetPct,
          targetWatts: work.targetWatts,
        });
      }
      continue;
    }

    if (step.kind === "alternating") {
      const over = phaseTarget(step.over, ftp);
      const under = phaseTarget(step.under, ftp);
      const cycles = Number.isInteger(step.cycles) && step.cycles > 0 ? step.cycles : 0;
      const reps = Number.isInteger(step.reps) && step.reps > 0 ? step.reps : 0;
      if (!over || !under || !cycles) continue;
      for (let i = 0; i < reps; i++) {
        units.push({
          kind: "alternating",
          plannedDurationS: cycles * (over.durationS + under.durationS),
          plannedOverTimeS: cycles * over.durationS,
          overTargetPct: over.targetPct,
          overTargetWatts: over.targetWatts,
          underTargetPct: under.targetPct,
          underTargetWatts: under.targetWatts,
        });
      }
      continue;
    }
    // warmup/cooldown/steady/accessory: nicht matchbar (s. Kopfkommentar)
  }
  return units;
}

/**
 * Je Workout eigene Merge-Schwelle: niedrigste "aktive" Zielintensität der
 * matchbaren Einheiten (set-Work bzw. alternating-Under — das Under muss
 * die Schwelle auch reißen, sonst zerfällt ein Over/Under-Block beim Merge
 * in einzelne Over-Spitzen) minus COMPLIANCE.mergeMarginPct. Trennt
 * Warmup/Cooldown/echte Erholung von Arbeitsblöcken, ohne pro Fahrt neu zu
 * raten. `null`, wenn keine matchbaren Einheiten vorliegen.
 * @param {Array<Object>} units @param {number} ftp @returns {number|null}
 */
export function deriveThresholdWatts(units, ftp) {
  if (!units.length || !ftp) return null;
  const activePcts = units.map((u) => (u.kind === "alternating" ? u.underTargetPct : u.targetPct));
  const minPct = Math.min(...activePcts);
  return Math.round(((minPct - COMPLIANCE.mergeMarginPct) / 100) * ftp);
}

/**
 * Rohe Segmente zu zusammenhängenden Blöcken oberhalb einer Watt-Schwelle
 * mergen — ALLE qualifizierenden Blöcke (zeitlich geordnet), nicht nur der
 * längste. Gleiches Prinzip wie
 * scripts/lib/interval-blocks.js::longestBlockAboveThreshold(), bewusst
 * dupliziert statt importiert (s. Kopfkommentar).
 * @param {Array<{start_time:number, end_time:number, average_watts:number}>} segments
 * @param {number} thresholdWatts @param {number} gapToleranceSec
 * @returns {Array<{startSec:number, endSec:number, totalDurationSec:number, workDurationSec:number, avgWatts:number}>}
 */
export function mergeActiveSegments(segments, thresholdWatts, gapToleranceSec) {
  if (!Array.isArray(segments) || !segments.length || thresholdWatts == null) return [];
  const sorted = [...segments].sort((a, b) => a.start_time - b.start_time);

  const blocks = [];
  let run = null;

  const finalizeRun = () => {
    if (!run || run.workDurationSec <= 0) return;
    blocks.push({
      startSec: run.startSec,
      endSec: run.endSec,
      totalDurationSec: run.endSec - run.startSec,
      workDurationSec: run.workDurationSec,
      avgWatts: Math.round(run.weightedWattSecs / run.workDurationSec),
    });
  };

  for (const seg of sorted) {
    const dur = seg.end_time - seg.start_time;
    if (dur <= 0) continue;
    const qualifies = seg.average_watts >= thresholdWatts;

    if (qualifies) {
      if (!run) run = { startSec: seg.start_time, endSec: seg.end_time, workDurationSec: 0, weightedWattSecs: 0 };
      run.endSec = seg.end_time;
      run.workDurationSec += dur;
      run.weightedWattSecs += seg.average_watts * dur;
    } else if (run && dur <= gapToleranceSec) {
      run.endSec = seg.end_time;
    } else {
      finalizeRun();
      run = null;
    }
  }
  finalizeRun();
  return blocks;
}

/** Segmente, die (mind. teilweise) im Zeitfenster [startSec, endSec] liegen. */
function segmentsInWindow(segments, startSec, endSec) {
  return segments.filter((s) => s.end_time > startSec && s.start_time < endSec);
}

/**
 * Geplante Einheiten (zeitlich geordnet) gegen Ist-Blöcke matchen —
 * Positions-Matching (Auftragsvorgabe: "über die zeitliche Reihenfolge,
 * nicht über Dauergleichheit"), keine Zuordnung über Dauer-/Leistungs-
 * ähnlichkeit. Weniger Ist-Blöcke als geplante Einheiten → die
 * überzähligen Einheiten am Ende gelten als nicht erfüllt (abgebrochen/
 * ausgelassen). Mehr Ist-Blöcke als geplant → überzählige Blöcke werden
 * nicht gewertet (weder positiv noch negativ; z.B. ein spontaner
 * zusätzlicher Effort außerhalb des Plans).
 * @param {{steps?:Array<Object>}} structure
 * @param {Array<{start_time:number, end_time:number, average_watts:number}>} segments
 * @param {number} ftp
 * @param {{gapToleranceSec?:number}} [opts]
 * @returns {{
 *   intervalsPlanned:number, intervalsCompleted:number,
 *   plannedZoneTime_s:number, actualZoneTime_s:number,
 *   matched: Array<{kind:string, fulfilled:boolean, plannedDurationS:number,
 *     actualDurationS:number, avgWatts:number|null}>,
 * }}
 */
export function matchWorkoutToSegments(structure, segments, ftp, opts = {}) {
  const gapToleranceSec = opts.gapToleranceSec ?? COMPLIANCE.defaultGapToleranceSec;
  const units = expandPlannedIntervals(structure, ftp);
  const safeSegments = Array.isArray(segments) ? segments : [];

  if (!units.length) {
    return { intervalsPlanned: 0, intervalsCompleted: 0, plannedZoneTime_s: 0, actualZoneTime_s: 0, matched: [] };
  }

  const thresholdWatts = deriveThresholdWatts(units, ftp);
  const blocks = mergeActiveSegments(safeSegments, thresholdWatts, gapToleranceSec);

  let plannedZoneTime_s = 0;
  let actualZoneTime_s = 0;
  let intervalsCompleted = 0;
  const matched = [];

  units.forEach((unit, i) => {
    const block = blocks[i] || null;
    plannedZoneTime_s += unit.kind === "alternating" ? unit.plannedOverTimeS : unit.plannedDurationS;

    if (unit.kind === "set") {
      const actualDurationS = block ? block.workDurationSec : 0;
      const avgWatts = block ? block.avgWatts : null;
      const fulfilled =
        !!block &&
        actualDurationS >= unit.plannedDurationS * COMPLIANCE.durationFulfillMinRatio &&
        avgWatts >= unit.targetWatts * (1 - COMPLIANCE.powerFulfillTolerancePct);
      actualZoneTime_s += actualDurationS;
      if (fulfilled) intervalsCompleted++;
      matched.push({
        kind: "set",
        fulfilled,
        plannedDurationS: unit.plannedDurationS,
        actualDurationS,
        plannedWatts: unit.targetWatts,
        avgWatts,
      });
      return;
    }

    // alternating — bewertet gegen overTime_s (Sonderfall, Auftragsvorgabe):
    // innerhalb des gematchten Blocks wird der Over-Anteil per zweiter,
    // höherer Schwelle (Mittelwert Over-/Under-Zielwatt) herausgetrennt.
    let actualOverTimeS = 0;
    let avgWatts = null;
    if (block) {
      const overThresholdWatts = (unit.overTargetWatts + unit.underTargetWatts) / 2;
      const windowSegments = segmentsInWindow(safeSegments, block.startSec, block.endSec);
      const overBlocks = mergeActiveSegments(windowSegments, overThresholdWatts, gapToleranceSec);
      actualOverTimeS = overBlocks.reduce((s, b) => s + b.workDurationSec, 0);
      avgWatts = block.avgWatts;
    }
    const fulfilled = !!block && actualOverTimeS >= unit.plannedOverTimeS * COMPLIANCE.durationFulfillMinRatio;
    actualZoneTime_s += actualOverTimeS;
    if (fulfilled) intervalsCompleted++;
    matched.push({
      kind: "alternating",
      fulfilled,
      plannedDurationS: unit.plannedOverTimeS,
      actualDurationS: actualOverTimeS,
      // Over-Zeit ist die Währung dieser Familie (s. Kopfkommentar) — die
      // Under-Zielwatt bleiben nur in expandPlannedIntervals(), hier nicht
      // gebraucht, weil Soll-Watt sich auf denselben Anteil bezieht wie
      // Soll-/Ist-Dauer (Over), sonst wären beide Spalten inkonsistent.
      plannedWatts: unit.overTargetWatts,
      avgWatts,
    });
  });

  return {
    intervalsPlanned: units.length,
    intervalsCompleted,
    plannedZoneTime_s: Math.round(plannedZoneTime_s),
    actualZoneTime_s: Math.round(actualZoneTime_s),
    matched,
  };
}

/** Fade = mittlere Leistung des letzten gegenüber dem ersten TATSÄCHLICH
 *  beobachteten Arbeitsintervalls (nicht zwingend das letzte GEPLANTE —
 *  ein fehlendes letztes Intervall trägt selbst kein Leistungssignal).
 *  Weniger als zwei beobachtete Intervalle → 0 (kein Fade bestimmbar).
 *  @param {Array<{avgWatts:number|null}>} matched @returns {number} Fraktion, z.B. -0.024 */
function computeFade(matched) {
  const withPower = matched.filter((m) => m.avgWatts != null);
  if (withPower.length < 2) return 0;
  const first = withPower[0].avgWatts;
  const last = withPower[withPower.length - 1].avgWatts;
  if (!first) return 0;
  return (last - first) / first;
}

/**
 * Matching + Ampel (C1 + C2) zur finalen D3-Schema-Zeile zusammenfassen.
 * `null`, wenn keine matchbaren Einheiten vorliegen (z.B. workout_structure
 * nur mit warmup/cooldown) — dann gibt es nichts zu bewerten.
 * @param {{steps?:Array<Object>}} structure
 * @param {Array<{start_time:number, end_time:number, average_watts:number}>} segments
 * @param {number} ftp
 * @param {{rpe?:number|null, cardId:string, gapToleranceSec?:number}} opts
 * @returns {{matchedCardId:string, plannedZoneTime_s:number,
 *   actualZoneTime_s:number, intervalsPlanned:number, intervalsCompleted:number,
 *   fadePct:number, rating:"green"|"yellow"|"red", rule:string,
 *   matched: Array<{kind:string, fulfilled:boolean, plannedDurationS:number,
 *     actualDurationS:number, plannedWatts:number, avgWatts:number|null}>}|null}
 */
export function computeCompliance(structure, segments, ftp, opts) {
  const { rpe = null, cardId, gapToleranceSec } = opts;
  const result = matchWorkoutToSegments(structure, segments, ftp, { gapToleranceSec });
  if (!result.intervalsPlanned) return null;

  const { intervalsPlanned, intervalsCompleted, plannedZoneTime_s, actualZoneTime_s, matched } = result;
  const fadeFraction = computeFade(matched);
  const zoneTimeRatio = plannedZoneTime_s > 0 ? actualZoneTime_s / plannedZoneTime_s : intervalsCompleted / intervalsPlanned;
  const hasAbortedInterval = intervalsCompleted < intervalsPlanned;

  let rating, rule;
  if (hasAbortedInterval) {
    rating = "red";
    rule = "intervall-abgebrochen";
  } else if (zoneTimeRatio < COMPLIANCE.zoneTimeYellowMinRatio) {
    rating = "red";
    rule = "zeit-in-zone-niedrig";
  } else if (fadeFraction < COMPLIANCE.fadeYellowMinPct) {
    rating = "red";
    rule = "fade-stark";
  } else if (zoneTimeRatio < COMPLIANCE.zoneTimeGreenMinRatio) {
    rating = "yellow";
    rule = "zeit-in-zone-mittel";
  } else if (fadeFraction < COMPLIANCE.fadeGreenMinPct) {
    rating = "yellow";
    rule = "fade-mittel";
  } else if (rpe != null && rpe >= COMPLIANCE.rpeYellowMin) {
    rating = "yellow";
    rule = "rpe-hoch";
  } else {
    rating = "green";
    rule = "alle-intervalle-erfuellt";
  }

  return {
    matchedCardId: cardId,
    plannedZoneTime_s,
    actualZoneTime_s,
    intervalsPlanned,
    intervalsCompleted,
    fadePct: Math.round(fadeFraction * 1000) / 10,
    rating,
    rule,
    // UI-Intervalltabelle (Schritt 6b, docs/konzept-progressionssteuerung.md)
    // braucht die Soll-/Ist-Werte je Intervall — bereits oben berechnet,
    // hier nur zusätzlich zurückgegeben statt verworfen. Keine neue Rechnung.
    matched,
  };
}
