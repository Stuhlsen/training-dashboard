/* ============================================================
   CORE/WORKOUT-MATH.JS — Berechnung aus plan_cards.workout_structure
   (kein DOM)
   (Progressionssteuerung — docs/konzept-progressionssteuerung.md D1,
   Schritt 3)

   Reine Rechenschicht über dem in core/workout-validator.js geprüften
   Schema. Erwartet grundsätzlich gültige Strukturen, bleibt aber defensiv
   (überspringt Schritte/Phasen mit fehlenden/unplausiblen Werten statt zu
   werfen) — dieselbe Haltung wie core/ftp-progress.js::estimateSessionTSS
   gegenüber dem älteren Freitext-`workout`.

   computedTss = Σ (duration_s × IF²) / 36, IF = target_pct_ftp / 100 (D1).
   `accessory`-Phasen mit target:"max" haben keine relative Intensität und
   tragen deshalb weder zu computedTss noch zu timeInZone_s bei — ihre
   Währung ist Wiederholungszahl/Spitzenleistung, nicht Zeit-in-Zone (D1.3).
   `targetZoneTime_s` zählt ausschließlich die `work`-Anteile von `set`-
   Schritten (die Progressionswährung, D1); `alternating` hat mit
   `overTime_s` eine eigene, getrennt ausgewiesene Währung.
   ============================================================ */

import { COGGAN_ZONE_UPPER_PCT } from "./zones.js";

const ZONE_IDS = ["z1", "z2", "z3", "z4", "z5"];

function numOrNull(v) {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/** Eine Dauer/Intensitäts-Phase ({duration_s, target_pct_ftp} bzw.
 *  {duration_s, target:"max"}) in eine rechenbare Instanz übersetzen —
 *  `null` bei fehlenden Werten oder target:"max" (keine relative
 *  Intensität, s. Kopfkommentar). @returns {{durationS:number, pct:number}|null} */
function phaseInstance(phase) {
  if (!phase || typeof phase !== "object" || phase.target === "max") return null;
  const durationS = numOrNull(phase.duration_s);
  const pct = numOrNull(phase.target_pct_ftp);
  if (!durationS || durationS <= 0 || pct == null) return null;
  return { durationS, pct };
}

/** Ein Schritt (D1/D1.3) → Liste rechenbarer Phaseninstanzen, mit
 *  reps/cycles bereits ausmultipliziert. `isTargetZone`/`isOverTime`
 *  markieren die beiden Progressionswährungen (targetZoneTime_s/overTime_s). */
function expandStep(step) {
  const kind = step?.kind;
  const instances = [];

  if (kind === "warmup" || kind === "cooldown" || kind === "steady") {
    const inst = phaseInstance(step);
    if (inst) instances.push(inst);
    return instances;
  }

  const reps = Number.isInteger(step?.reps) && step.reps > 0 ? step.reps : 0;

  if (kind === "set") {
    const work = phaseInstance(step.work);
    const recovery = phaseInstance(step.recovery);
    for (let i = 0; i < reps; i++) {
      if (work) instances.push({ ...work, isTargetZone: true });
      if (recovery) instances.push(recovery);
    }
    return instances;
  }

  if (kind === "accessory") {
    const work = phaseInstance(step.work);
    const recovery = phaseInstance(step.recovery);
    for (let i = 0; i < reps; i++) {
      if (work) instances.push(work); // null bei target:"max" — kein Beitrag
      if (recovery) instances.push(recovery);
    }
    return instances;
  }

  if (kind === "alternating") {
    const cycles = Number.isInteger(step?.cycles) && step.cycles > 0 ? step.cycles : 0;
    const over = phaseInstance(step.over);
    const under = phaseInstance(step.under);
    const recovery = phaseInstance(step.recovery);
    for (let r = 0; r < reps; r++) {
      for (let c = 0; c < cycles; c++) {
        if (over) instances.push({ ...over, isOverTime: true });
        if (under) instances.push(under);
      }
      if (recovery) instances.push(recovery);
    }
    return instances;
  }

  return instances;
}

/** Eine Dauer-Phase roh in `{durationS, pct}` übersetzen — anders als
 *  `phaseInstance` bleibt eine Phase OHNE relative Intensität (target:"max"
 *  oder fehlendes `target_pct_ftp`) erhalten, mit `pct: null`. `null` nur,
 *  wenn gar keine verwertbare Dauer da ist. @returns {{durationS:number, pct:number|null}|null} */
function rawPhase(phase) {
  if (!phase || typeof phase !== "object") return null;
  const durationS = numOrNull(phase.duration_s);
  if (!durationS || durationS <= 0) return null;
  const pct = phase.target === "max" ? null : numOrNull(phase.target_pct_ftp);
  return { durationS, pct };
}

/**
 * Faltet eine workout_structure in die geordnete Phasenfolge auf, so wie sie
 * zeitlich abläuft (reps/cycles ausmultipliziert, Reihenfolge erhalten).
 * Anders als computeWorkoutSummary bleibt JEDE Phase mit ihrer Dauer stehen,
 * auch die ohne relative Intensität (target:"max"/unplausibel → `pct: null`) —
 * damit eine zeitachsentreue Ziel-Linie (Done-Detail-Chart, s.
 * docs/offene-punkte.md) keine Lücke in der Uhr bekommt, sondern nur an der
 * betreffenden Stelle keinen Wert zeichnet.
 * @param {{steps?: Array<unknown>}|null|undefined} structure
 * @returns {Array<{durationS: number, pct: number|null}>}
 */
export function expandWorkoutPhases(structure) {
  const steps = Array.isArray(structure?.steps) ? structure.steps : [];
  const out = [];

  for (const step of steps) {
    if (!step || typeof step !== "object") continue;
    const kind = step.kind;

    if (kind === "warmup" || kind === "cooldown" || kind === "steady") {
      const p = rawPhase(step);
      if (p) out.push(p);
      continue;
    }

    const reps = Number.isInteger(step.reps) && step.reps > 0 ? step.reps : 0;

    if (kind === "set" || kind === "accessory") {
      const work = rawPhase(step.work);
      const recovery = rawPhase(step.recovery);
      for (let i = 0; i < reps; i++) {
        if (work) out.push({ ...work });
        if (recovery) out.push({ ...recovery });
      }
      continue;
    }

    if (kind === "alternating") {
      const cycles = Number.isInteger(step.cycles) && step.cycles > 0 ? step.cycles : 0;
      const over = rawPhase(step.over);
      const under = rawPhase(step.under);
      const recovery = rawPhase(step.recovery);
      for (let r = 0; r < reps; r++) {
        for (let c = 0; c < cycles; c++) {
          if (over) out.push({ ...over });
          if (under) out.push({ ...under });
        }
        if (recovery) out.push({ ...recovery });
      }
      continue;
    }
  }

  return out;
}

function zoneIdForPct(pct) {
  const frac = pct / 100;
  for (let i = 0; i < COGGAN_ZONE_UPPER_PCT.length; i++) {
    if (frac <= COGGAN_ZONE_UPPER_PCT[i]) return ZONE_IDS[i];
  }
  // >120% FTP: zones.js modelliert kein eigenes Z6-Segment (s. dortiger
  // Kommentar), wird hier in Z5 gebündelt statt eine neue Zone zu erfinden.
  return ZONE_IDS[ZONE_IDS.length - 1];
}

/**
 * Berechnet computedTss, timeInZone_s, targetZoneTime_s und overTime_s aus
 * einer (idealerweise per core/workout-validator.js geprüften)
 * workout_structure. `ftp` wird als fertiger Wert entgegengenommen (Schicht-
 * grenze wie core/session-classify.js — ftpAt() bleibt in data-access/),
 * fließt aber in KEINE der vier Größen ein: workout_structure ist per D1.2
 * durchgehend %FTP-relativ, eine Watt-Auflösung ist erst bei der Ausgabe
 * nötig (Schritt 4). Der Parameter besteht trotzdem, damit dieses Modul
 * dieselbe Aufrufkonvention wie session-classify.js einhält.
 * @param {{version?: number, steps?: Array<Object>}|null|undefined} structure
 * @param {number} [ftp] aktuell ungenutzt, s. Kommentar oben
 * @returns {{computedTss: number, timeInZone_s: Record<string, number>, targetZoneTime_s: number, overTime_s: number}}
 */
export function computeWorkoutSummary(structure, ftp) {
  const timeInZone_s = {};
  let computedTss = 0;
  let targetZoneTime_s = 0;
  let overTime_s = 0;

  const steps = Array.isArray(structure?.steps) ? structure.steps : [];
  for (const step of steps) {
    if (!step || typeof step !== "object") continue;
    for (const inst of expandStep(step)) {
      computedTss += (inst.durationS * (inst.pct / 100) * (inst.pct / 100)) / 36;
      const zoneId = zoneIdForPct(inst.pct);
      timeInZone_s[zoneId] = (timeInZone_s[zoneId] || 0) + inst.durationS;
      if (inst.isTargetZone) targetZoneTime_s += inst.durationS;
      if (inst.isOverTime) overTime_s += inst.durationS;
    }
  }

  return { computedTss: Math.round(computedTss), timeInZone_s, targetZoneTime_s, overTime_s };
}
