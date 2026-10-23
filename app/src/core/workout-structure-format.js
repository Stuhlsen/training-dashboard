/* ============================================================
   CORE/WORKOUT-STRUCTURE-FORMAT.JS — workout_structure → Segmente,
   Kurztext und intervals.icu-Text (kein DOM, kein I/O)

   Der Plangenerator (plan-workout-select.js) speichert jede Qualitätskarte
   zweimal: grob als `workout` (N × M min @ Band) und genau als
   `workoutStructure`. Over-Under (`alternating`) und 30/15 lassen sich im
   groben Format nicht abbilden — die Kartenansicht, der .zwo-Export und der
   intervals.icu-Push lesen darum über dieses Modul die genaue Version, wenn
   `usableStructure()` sie freigibt.

   Pausen-Konvention: die letzte Pause eines Schritts fällt weg, wenn danach
   nur noch der Cool-down (oder nichts) kommt — dieselbe Regel wie
   `(reps-1)×rest` im Generator und in zwo-export.js. Folgt ein weiterer
   Arbeitsschritt (z. B. Sprints nach dem Sweet-Spot-Satz), bleibt sie.

   intervals.icu kennt keine verschachtelten Wiederholungen — die inneren
   Zyklen eines `alternating`-Blocks werden darum unter EINER `Nx`-Ebene
   ausgeschrieben. Sprints (`target: "max"`) gehen als `freeride`.
   ============================================================ */

import { validateWorkoutStructure } from "./workout-validator.js";

const INTERVAL_KINDS = new Set(["set", "alternating"]);

function isBlockWorkout(w) {
  return !!w && typeof w === "object" && Array.isArray(w.blocks);
}

/**
 * Die genaue Struktur einer Karte, wenn sie gelten soll: gültig, mit
 * mindestens einem Intervall-Schritt, und die Karte wurde nicht im Formular
 * zur Blockform editiert (dann bleibt die alte Struktur stehen, gilt aber
 * nicht mehr).
 * @param {{workout?: unknown, workoutStructure?: unknown}|null|undefined} card
 * @returns {{version:number, steps:Array<Object>}|null}
 */
export function usableStructure(card) {
  const structure = card?.workoutStructure;
  if (!structure || isBlockWorkout(card.workout)) return null;
  if (!validateWorkoutStructure(structure).valid) return null;
  const steps = /** @type {{steps: Array<{kind: string}>}} */ (structure).steps;
  return steps.some((s) => INTERVAL_KINDS.has(s.kind)) ? /** @type {any} */ (structure) : null;
}

/** Folgt nach Schritt `i` noch Arbeit (also kein reiner Cool-down/Ende)? */
function workFollows(steps, i) {
  return steps.slice(i + 1).some((s) => s && s.kind !== "cooldown");
}

function seg(role, phase) {
  return { role, durationS: phase.duration_s, pct: phase.target === "max" ? null : phase.target_pct_ftp };
}

/**
 * Faltet die Struktur in die zeitliche Segmentfolge auf.
 * @param {{steps?: Array<any>}|null|undefined} structure
 * @returns {Array<{role: "warmup"|"work"|"over"|"under"|"recovery"|"sprint"|"cooldown", durationS: number, pct: number|null}>}
 */
export function structureSegments(structure) {
  const steps = Array.isArray(structure?.steps) ? structure.steps : [];
  const out = [];
  steps.forEach((step, i) => {
    if (!step || typeof step !== "object") return;
    const keepLast = workFollows(steps, i);
    if (step.kind === "warmup" || step.kind === "cooldown") out.push(seg(step.kind, step));
    else if (step.kind === "steady") out.push(seg("work", step));
    else if (step.kind === "set" || step.kind === "accessory") {
      const role = step.kind === "set" ? "work" : "sprint";
      for (let r = 0; r < step.reps; r++) {
        out.push(seg(role, step.work));
        if (r < step.reps - 1 || keepLast) out.push(seg("recovery", step.recovery));
      }
    } else if (step.kind === "alternating") {
      for (let r = 0; r < step.reps; r++) {
        for (let c = 0; c < step.cycles; c++) out.push(seg("over", step.over), seg("under", step.under));
        if (r < step.reps - 1 || keepLast) out.push(seg("recovery", step.recovery));
      }
    }
  });
  return out;
}

/** Unter-Phasen unter diesem %FTP sind lockere Erholung (30/15: 15 s @ 50 %),
 *  kein „Unter" eines Over-Under — Anzeige und Wattspanne behandeln sie wie
 *  eine Pause. */
export const EASY_UNDER_PCT = 70;

/** Harte Phase = Arbeit/Über, oder Unter ab EASY_UNDER_PCT. Sprints (ohne
 *  %FTP) zählen nicht. */
function isHardSegment(s) {
  if (s.pct == null) return false;
  return s.role === "work" || s.role === "over" || (s.role === "under" && s.pct >= EASY_UNDER_PCT);
}

/** [min, max] %FTP der harten Phasen, `null` ohne harte Phase.
 *  @param {any} structure @returns {[number, number]|null} */
export function structureHardPctRange(structure) {
  const pcts = structureSegments(structure)
    .filter(isHardSegment)
    .map((s) => /** @type {number} */ (s.pct));
  return pcts.length ? [Math.min(...pcts), Math.max(...pcts)] : null;
}

/**
 * Der erste Intervallschritt (`set`/`alternating`) als Kurzfassung: Anzahl
 * Wiederholungen, Dauer einer Wiederholung in s und %FTP-Spanne der harten
 * Phasen. Bei `alternating` ist eine Wiederholung ein Block aus `cycles`
 * Über/Unter-Paaren. `null` ohne Intervallschritt.
 * @param {{steps?: Array<any>}|null|undefined} structure
 * @returns {{reps: number, workS: number, pctRange: [number, number]}|null}
 */
export function mainIntervalSummary(structure) {
  const steps = Array.isArray(structure?.steps) ? structure.steps : [];
  const step = steps.find((s) => s && INTERVAL_KINDS.has(s.kind));
  if (!step) return null;
  const isSet = step.kind === "set";
  const workS = isSet ? step.work.duration_s : step.cycles * (step.over.duration_s + step.under.duration_s);
  const pcts = (isSet ? [step.work] : [step.over, step.under])
    .map((p, i) => (isSet || i === 0 || p.target_pct_ftp >= EASY_UNDER_PCT ? p.target_pct_ftp : null))
    .filter((p) => typeof p === "number");
  if (!pcts.length) return null;
  return { reps: step.reps, workS, pctRange: [Math.min(...pcts), Math.max(...pcts)] };
}

/** Anzahl der Sprints (`accessory` mit `target: "max"`), sonst `null`.
 *  @param {{steps?: Array<any>}|null|undefined} structure @returns {number|null} */
export function sprintReps(structure) {
  const steps = Array.isArray(structure?.steps) ? structure.steps : [];
  const step = steps.find((s) => s?.kind === "accessory" && s.work?.target === "max");
  return step && Number.isInteger(step.reps) ? step.reps : null;
}

/** Die Pausen zwischen Wiederholungen/Sätzen, wenn sie einheitlich sind
 *  (gleiche Dauer und %FTP) — sonst `null`. Lockere Unter-Phasen eines 30/15
 *  gehören zum Satz und zählen hier nicht.
 *  @param {any} structure @returns {{count: number, durationS: number, pct: number|null}|null} */
export function structureRecoveries(structure) {
  const recs = structureSegments(structure).filter((s) => s.role === "recovery");
  if (!recs.length) return null;
  const [first] = recs;
  const uniform = recs.every((r) => r.durationS === first.durationS && r.pct === first.pct);
  return uniform ? { count: recs.length, durationS: first.durationS, pct: first.pct } : null;
}

/** TSS über die Segmentfolge: Σ Dauer × IF² / 36 (IF = %FTP/100), gleiche
 *  Formel wie core/workout-math.js::computeWorkoutSummary — aber ohne die
 *  Pause nach der letzten Wiederholung, passend zu Dauer und Anzeige.
 *  @param {any} structure @returns {number} */
export function structureTss(structure) {
  const sum = structureSegments(structure).reduce(
    (acc, s) => (s.pct == null ? acc : acc + (s.durationS * (s.pct / 100) ** 2) / 36),
    0,
  );
  return Math.round(sum);
}

/** Gesamtdauer in ganzen Minuten. @param {any} structure @returns {number} */
export function structureTotalMin(structure) {
  return Math.round(structureSegments(structure).reduce((s, x) => s + x.durationS, 0) / 60);
}

/** Dauer deutsch: „30 s", „2 min", „1:30 min". @param {number} sec @returns {string} */
export function durDe(sec) {
  if (sec < 60) return `${sec} s`;
  if (sec % 60 === 0) return `${sec / 60} min`;
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")} min`;
}

function phaseDe(p) {
  return `${durDe(p.duration_s)} @ ${p.target_pct_ftp} %`;
}

/** Pausenzusatz nur, wenn es überhaupt eine Pause gibt (reps > 1). */
function pauseDe(step) {
  return step.reps > 1 ? ` (Pause ${durDe(step.recovery.duration_s)})` : "";
}

function stepSummary(step) {
  switch (step.kind) {
    case "warmup":
      return `${durDe(step.duration_s)} Warm-up`;
    case "cooldown":
      return `${durDe(step.duration_s)} Cool-down`;
    case "steady":
      return phaseDe(step);
    case "set":
      return `${step.reps}× ${phaseDe(step.work)}${pauseDe(step)}`;
    case "accessory":
      return `${step.reps}× Sprint ${durDe(step.work.duration_s)} max${pauseDe(step)}`;
    case "alternating":
      return `${step.reps}× [${step.cycles}× (${phaseDe(step.over)} / ${phaseDe(step.under)})]${pauseDe(step)}`;
    default:
      return null;
  }
}

/**
 * Deutscher Kurztext für die Kartenansicht, z. B.
 * „15 min Warm-up → 3× [3× (2 min @ 105 % / 1 min @ 88 %)] (Pause 3 min) → …".
 * @param {{steps: Array<any>}} structure @returns {string}
 */
export function structureSummary(structure) {
  const parts = structure.steps.map(stepSummary).filter(Boolean);
  return `${parts.join(" → ")} · ${structureTotalMin(structure)} min gesamt`;
}

/** Dauer im intervals.icu-Format: „30s", „2m", „1m30s". */
function durIcu(sec) {
  if (sec < 60) return `${sec}s`;
  const rest = sec % 60;
  return rest ? `${Math.floor(sec / 60)}m${rest}s` : `${sec / 60}m`;
}

/**
 * Workout-Text für intervals.icu. Kadenz wie der bisherige Push-Text:
 * Warm-up T-5, Arbeit/Over T, Under/Pause/Cool-down T-10.
 * @param {{steps: Array<any>}} structure @param {number} cadenceTarget
 * @returns {string}
 */
export function structureIntervalsText(structure, cadenceTarget) {
  const line = (p, rpm) => `- ${durIcu(p.duration_s)} ${p.target_pct_ftp}% ${rpm}rpm`;
  const work = (p) => line(p, cadenceTarget);
  const easy = (p) => line(p, cadenceTarget - 10);
  const sections = structure.steps.map((step) => {
    switch (step.kind) {
      case "warmup":
        return ["Warmup", line(step, cadenceTarget - 5)];
      case "cooldown":
        return ["Cooldown", easy(step)];
      case "steady":
        return ["Main Set", work(step)];
      case "set":
        return [`Main Set ${step.reps}x`, work(step.work), easy(step.recovery)];
      case "accessory":
        return [`Sprints ${step.reps}x`, `- Sprint max ${durIcu(step.work.duration_s)} freeride`, easy(step.recovery)];
      case "alternating": {
        const cycle = [];
        for (let c = 0; c < step.cycles; c++) cycle.push(work(step.over), easy(step.under));
        return [`Main Set ${step.reps}x`, ...cycle, easy(step.recovery)];
      }
      default:
        return null;
    }
  });
  return sections
    .filter(Boolean)
    .map((s) => s.join("\n"))
    .join("\n\n");
}
