/* ============================================================
   CORE/WORKOUT-STRUCTURE-DERIVE.JS — Ableitung von workout_structure aus
   dem Freitext-Titel einer Plankarte (kein DOM, kein I/O)
   (Progressionssteuerung — Auftrag "Rückwirkende Strukturableitung",
   docs/konzept-progressionssteuerung.md D1/L2/L3/L4)

   NICHT für plan_cards bestimmt — der Rückgabewert speist ausschließlich
   die Compliance-Berechnung (scripts/lib/compliance.js), niemals einen
   Schreibpfad auf plan_cards.workout_structure. `derived: true` ist deshalb
   ein Begleitfeld der Rückgabe, NICHT ein Feld innerhalb der Struktur selbst
   — core/workout-validator.js::validateWorkoutStructure() lehnt unbekannte
   Top-Level-Felder auf `structure` ab (STRUCTURE_FIELDS dort).

   Erkennt genau EIN Muster: "<Intensität> <N>×<M> min" (Groß-/Kleinschreibung,
   "x"/"X"/"×", "min"/"Min"/"Minuten" austauschbar; Suffixe wie "@95%" oder
   "+ Sprint" werden ignoriert, nicht interpretiert) und bildet es auf einen
   einzelnen `set`-Schritt ab (D1). Nichts anderes wird geraten:

   - `alternating` (Over-Under, D1.3) wird bewusst NICHT unterstützt — im
     realen Kartenbestand (beide Athleten, geprüft bei Erstellung dieses
     Moduls) trägt kein "Over-Under"/"Threshold"-Titel eine eindeutige
     Over/Under-Aufteilung (z. B. "2/2") im Freitext, nur eine Blockdauer.
     Ohne einen einzigen verifizierbaren Beispielfall wäre die Ableitung
     Spekulation — die Auftragsvorgabe "im Zweifel nicht raten, auslassen"
     gilt hier auf Feature-Ebene, nicht nur pro Karte.
   - Titel mit "Over-Under"/"Over/Under" werden deshalb IMMER übersprungen,
     auch wenn sie das Zahl×Zahl-Muster tragen — eine `set`-Struktur mit
     konstanter Intensität würde sie physiologisch falsch darstellen.
   - Zusätze ("+ Sprint") werden ignoriert, nicht als eigener accessory-
     Schritt nachgebildet (L6.1: Zusätze zählen ohnehin nicht in die
     Hauptampel, ihre Struktur ist aus dem Freitext nicht rekonstruierbar).
   - Warmup/Cooldown werden nicht erzeugt — der Freitext trägt keinerlei
     Information darüber, und core/compliance-match.js::expandPlannedIntervals
     braucht sie für das Matching ohnehin nicht (nur `set`/`alternating`
     zählen in Zeit-in-Zone/Schwellenherleitung).
   ============================================================ */

import { validateWorkoutStructure } from "./workout-validator.js";

/**
 * Ziel-%FTP je Familie = Mittelpunkt aus min/max der jeweiligen Leitertabelle
 * (docs/konzept-progressionssteuerung.md), NICHT die exakte Stufe — die ist
 * aus dem Freitext-Titel nicht rekonstruierbar (keine Info über Trainingsalter/
 * Leiterstand im Titel). `vo2-short` (30/15, Sekundenbasis) bleibt außen vor:
 * das Muster "N×M min" passt nur zu vo2-long.
 *   sweetspot-long (L2): 88/88/90/90/91/90/91/90 → min 88, max 91 → 89.5 → 90
 *   threshold-long (L3): 98/98/100/100/100/100/102 → min 98, max 102 → 100
 *   vo2-long       (L4): 112/112/108/106/106 → min 106, max 112 → 109
 */
const FAMILY_PCT_FTP = Object.freeze({
  "sweetspot-long": 90,
  "threshold-long": 100,
  "vo2-long": 109,
});

const NUMERIC_PATTERN = /(\d+)\s*[×xX]\s*(\d+)\s*min(?:uten)?/i;
const AMBIGUOUS_OVER_UNDER = /over[\s-]?\/?[\s-]?under/i;

/** @param {string} normalizedTitle @returns {keyof FAMILY_PCT_FTP|null} */
function detectFamily(normalizedTitle) {
  if (AMBIGUOUS_OVER_UNDER.test(normalizedTitle)) return null;
  if (/vo\s*2\s*max/i.test(normalizedTitle)) return "vo2-long";
  if (/sweet\s*spot/i.test(normalizedTitle) || /\bss-/i.test(normalizedTitle)) return "sweetspot-long";
  if (/schwelle|threshold/i.test(normalizedTitle)) return "threshold-long";
  return null;
}

/**
 * Erholungspause zwischen Wiederholungen — die einzige im Konzept genannte
 * Pausenregel (L2-Kopfkommentar: "5 min bei Intervallen ≤ 15 min, 8 min
 * darüber"), hier familienübergreifend angewendet, weil L3/L4 keine eigene
 * Vorgabe nennen. Zielintensität 50 % FTP wie im D1-Beispiel (recovery/
 * cooldown ebenfalls 50 %).
 * @param {number} workMinutes
 */
function recoveryPhase(workMinutes) {
  return { duration_s: workMinutes <= 15 ? 300 : 480, target_pct_ftp: 50 };
}

/**
 * @param {string|null|undefined} title Freitext-Titel der Plankarte (plan_cards.title)
 * @returns {{structure: {version:1, steps: Array<Object>}, derived: true}|null}
 */
export function deriveWorkoutStructure(title) {
  if (typeof title !== "string" || !title.trim()) return null;

  // NFKC löst z. B. "VO₂max" (Unicode-Subskript-Ziffer) zu "VO2max" auf —
  // ohne das würde /vo\s*2\s*max/ nicht greifen.
  const normalized = title.normalize("NFKC");

  const family = detectFamily(normalized);
  if (!family) return null;

  const match = normalized.match(NUMERIC_PATTERN);
  if (!match) return null;

  const reps = Number.parseInt(match[1], 10);
  const workMinutes = Number.parseInt(match[2], 10);
  if (!(reps > 0) || !(workMinutes > 0)) return null;

  const structure = {
    version: 1,
    steps: [
      {
        kind: "set",
        reps,
        work: { duration_s: workMinutes * 60, target_pct_ftp: FAMILY_PCT_FTP[family] },
        recovery: recoveryPhase(workMinutes),
      },
    ],
  };

  // Sicherheitsnetz: nur ausliefern, was derselbe Validator auch für eine
  // echte Karte akzeptieren würde.
  const { valid } = validateWorkoutStructure(structure);
  if (!valid) return null;

  return { structure, derived: true };
}
