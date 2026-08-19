/* ============================================================
   CORE/SESSION-FORMAT-MATCH.JS — Ride↔Format-Brücke (kein DOM, kein I/O)
   (Progressionssteuerung — docs/konzept-progressionssteuerung.md D4,
   Auftrag "Ride↔Format-Brücke, Verdrahtung, echte Sperre" Schritt 1)

   Leitet aus einer bereits vorhandenen workout_structure (echt oder per
   core/workout-structure-derive.js aus dem Freitext-Titel abgeleitet) das
   zugehörige session_formats.id ab. Ohne diese Brücke weiß
   state/ladder.js::getPresetSuggestion() nie, welche Leiter zu einer
   gematchten Plankarte (ride.compliance.matchedCardId) gehört.

   Routing über session_formats.currency (Migration 0014), NICHT über
   Freitext: `alternating`-Schritte → `over-time` (over-under), reine
   `accessory`-Schritte → `reps` (sprint-accessory), `set`-Schritte →
   `zone-time`-Familien, dort weiter über das target_pct_ftp der Haupt-
   Arbeitsphase gegen das Pct-Band jedes Kandidaten (aus dessen
   axes.explicitSteps[].pctFtp hergeleitet — kein zweiter, fest codierter
   Wertesatz neben dem Katalog).

   vo2-short/vo2-long überlappen im Pct-Band (106-112 vs. 110-112, s.
   Migration 0014) — FORMAT_MATCH.vo2ShortMaxWorkS (core/plan-config.js)
   entscheidet dann über die Sekunden je Wiederholung der dominanten
   Arbeitsphase (30/15-Bauart vs. 3-5-min-Reps), Tie-Break über die
   `-short`/`-long`-Endung des Katalog-`id` (Primärschlüssel, stabil) statt
   über das frei editierbare `label` (19.08.2026, docs/offene-punkte.md:
   ein umbenanntes/englisches Label hätte den vorherigen /kurz/i-Regex-
   Tie-Break stillschweigend auf null fallen lassen) — liest weiterhin nur
   bereits vorhandene, strukturierte Katalogdaten, kein Rateverfahren aus
   einem Kartentitel (anders als core/workout-structure-derive.js).

   Kein eindeutiger Kandidat (leere/unmatchbare Struktur, kein Katalog,
   weiterhin mehrdeutig nach dem Tie-Break) → null. Der Aufrufer
   entscheidet, ob das eine Lücke ist, die geloggt/übersprungen wird.
   ============================================================ */

import { FORMAT_MATCH } from "./plan-config.js";

function isPlainObject(v) {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Matchbare Schritte einer Struktur — warmup/cooldown/steady tragen keine
 *  Formatinformation und werden ausgeschlossen.
 *  @param {{steps?:Array<Object>}|null|undefined} structure @returns {Array<Object>} */
function matchableSteps(structure) {
  const steps = Array.isArray(structure?.steps) ? structure.steps : [];
  return steps.filter((s) => isPlainObject(s) && (s.kind === "set" || s.kind === "alternating" || s.kind === "accessory"));
}

/** Pct-Band [min,max] eines Katalogeintrags aus axes.explicitSteps[].pctFtp.
 *  over-under nutzt stattdessen pctFtpOver/pctFtpUnder — wird hier nicht
 *  gebraucht, over-under ist bereits über die Schrittart geroutet, bevor
 *  ein Pct-Band gebraucht wird.
 *  @param {{axes?:Object}} format @returns {{min:number,max:number}|null} */
function pctBand(format) {
  const steps = format?.axes?.explicitSteps;
  if (!Array.isArray(steps) || !steps.length) return null;
  const pcts = steps.map((s) => s.pctFtp).filter((v) => typeof v === "number");
  if (!pcts.length) return null;
  return { min: Math.min(...pcts), max: Math.max(...pcts) };
}

/** Dominante `set`-Einheit einer Struktur — die mit der größten
 *  Gesamtarbeitszeit (reps × work.duration_s), damit ein angehängter
 *  Zusatz-Satz mit anderer Intensität die Hauptklassifikation nicht kippt.
 *  @param {Array<Object>} steps @returns {{targetPct:number, workDurationS:number}|null} */
function dominantSetUnit(steps) {
  const setSteps = steps.filter(
    (s) => s.kind === "set" && isPlainObject(s.work) && typeof s.work.target_pct_ftp === "number" && typeof s.work.duration_s === "number",
  );
  if (!setSteps.length) return null;
  const best = setSteps.reduce((a, b) => {
    const totalA = (Number.isInteger(a.reps) ? a.reps : 1) * a.work.duration_s;
    const totalB = (Number.isInteger(b.reps) ? b.reps : 1) * b.work.duration_s;
    return totalB > totalA ? b : a;
  });
  return { targetPct: best.work.target_pct_ftp, workDurationS: best.work.duration_s };
}

/**
 * Format-ID aus einer workout_structure ableiten.
 * @param {{steps?:Array<Object>}|null|undefined} structure
 * @param {Array<{id:string, label?:string, currency:string, axes?:Object}>} catalog session_formats-Zeilen
 * @returns {string|null}
 */
export function inferFormatId(structure, catalog) {
  const steps = matchableSteps(structure);
  if (!steps.length || !Array.isArray(catalog) || !catalog.length) return null;

  if (steps.some((s) => s.kind === "alternating")) {
    const candidates = catalog.filter((f) => f.currency === "over-time");
    return candidates.length === 1 ? candidates[0].id : null;
  }

  if (steps.some((s) => s.kind === "set")) {
    const unit = dominantSetUnit(steps);
    if (!unit) return null;
    const inBand = catalog.filter((f) => f.currency === "zone-time").filter((f) => {
      const band = pctBand(f);
      return !!band && unit.targetPct >= band.min && unit.targetPct <= band.max;
    });
    if (inBand.length === 1) return inBand[0].id;
    if (inBand.length > 1) {
      const wantShort = unit.workDurationS <= FORMAT_MATCH.vo2ShortMaxWorkS;
      const suffix = wantShort ? "-short" : "-long";
      const tieBroken = inBand.filter((f) => typeof f.id === "string" && f.id.endsWith(suffix));
      return tieBroken.length === 1 ? tieBroken[0].id : null;
    }
    return null;
  }

  // nur accessory-Schritte übrig (L6.1: eigene Währung, eigene Familie).
  const candidates = catalog.filter((f) => f.currency === "reps");
  return candidates.length === 1 ? candidates[0].id : null;
}
