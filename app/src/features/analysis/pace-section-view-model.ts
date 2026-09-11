/* ============================================================
   FEATURES/ANALYSIS/PACE-SECTION-VIEW-MODEL.TS — Datenverdrahtung der
   Pace-Sektion (Lauf/Schwimm) im Analyse-Tab. Fahrplan 10 E8b.

   Reine Funktion auf bereits geladenen Rides — kein Hook, kein DOM
   (Muster wie answers-view-model.ts). Verdrahtet die vier E7-`core/`-
   Module (unverändert konsumiert):
     - critical-speed.js  → estimateThresholdSpeed (nur Lauf; 2-Punkt-CS)
     - pace-zones.js      → computePaceZones / paceScaleMax
     - pace-curve.js      → buildPaceCurve (beste Ø-Pace je Distanz-Bucket)
   pace-decoupling.js bleibt bewusst UNVERDRAHTET (rides-N.json trägt weder
   Samples noch ein `decoupling`-Feld) — die Sektion zeigt dafür nur einen
   Fußzeilen-Satz.

   HF-bpm-Zonen (Fahrplan 12 E7, nur Lauf): `hrMax` kommt als geschätzter
   Athleten-Wert aus dem Sync-Output (api/pipeline.ts), NICHT aus den Rides
   selbst — anders als die Pace-Zonen oben hängt die HF-Zonen-Kette nicht an
   `estimateThresholdSpeed`. `sports/running/metrics.ts::RUNNING_HR_ZONES`
   (%HFmax, UNKALIBRIERT) × `hrMax` ergibt die bpm-Grenzen.

   GUARDRAIL 4 (Zonen-Vorbehalt): `ridesForSport()` vorweg — die Pace-
   Auswertung bekommt nie eine Aktivität einer fremden Sportart.

   !!! UNKALIBRIERT !!! Alle Pace-Zonen-/CS-Konstanten (Daniels für Lauf,
   Maglischo/CSS für Schwimm) sind Lehrbuchwerte ohne echte Kalibrierung
   an Athlet 3s Daten (2 Läufe, 0 Schwimm-Einheiten, E0-Bericht
   2026-09-07). Gegen echte Efforts gegenprüfen, sobald welche vorliegen.
   ============================================================ */

import { ridesForSport } from "../../core/activity-sport.js";
import { estimateThresholdSpeed } from "../../core/critical-speed.js";
import { computePaceZones, paceScaleMax, PACE_FROM_KMH } from "../../core/pace-zones.js";
import { buildPaceCurve } from "../../core/pace-curve.js";
import { sportProfileFor } from "../../sports";

type Ride = import("../../types.js").Ride;
type PaceSport = "run" | "swim";

/** Eine Pace-Zone wie sie computePaceZones() liefert (meta + Grenzen). */
export interface PaceZone {
  id: string;
  label: string;
  farbe: string;
  vonSpeed: number;
  bisSpeed: number;
  vonPaceSec: number | null;
  bisPaceSec: number | null;
}

export interface PaceCurvePoint {
  distance: number;
  actualDistance: number;
  paceSec: number;
  label: string;
}

/** Eine HF-Zone in bpm, aus RUNNING_HR_ZONES (%HFmax) × geschätztem hrMax. */
export interface HrZone {
  id: string;
  label: string;
  farbe: string;
  vonBpm: number;
  bisBpm: number;
}

/** Zonen-Metadaten für die HF-bpm-Skala — lokal dupliziert (gleiches Muster
 *  wie PaceZoneScale.FALLBACK_LABELS), weil RUNNING_HR_ZONES nur Prozent-
 *  Grenzen trägt, keine Anzeigenamen/Farben. Label-/Farb-Konvention
 *  deckungsgleich mit sports/cycling/zones.ts::COGGAN_ZONE_META. */
const HR_ZONE_META: Readonly<Record<string, { label: string; farbe: string }>> = {
  z1: { label: "Z1 Recovery", farbe: "var(--z1)" },
  z2: { label: "Z2 Endurance", farbe: "var(--z2)" },
  z3: { label: "Z3 Tempo", farbe: "var(--z3)" },
  z4: { label: "Z4 Threshold", farbe: "var(--thr)" },
  z5: { label: "Z5 VO2max", farbe: "var(--vo2)" },
};

export interface PaceSectionViewModel {
  sport: PaceSport;
  sportLabel: string;
  thresholdMetric: string;
  thresholdUnit: string;
  /** Geschätzte Schwellen-/CSS-Geschwindigkeit (km/h) oder `null`, wenn keine
   *  belastbare Schätzung möglich ist (kein erschöpfender Effort / keine
   *  Datenbasis). */
  thresholdSpeed: number | null;
  /** Schwellenpace in Sekunden je Distanz-Einheit (für die Anzeige) — `null`
   *  wenn `thresholdSpeed` null ist. */
  thresholdPaceSec: number | null;
  /** true, wenn die Pace-Zonen-Skala mangels Schwelle degradiert gerendert
   *  werden muss (Zonen-Labels ohne Zahlen + Hinweistext). */
  degraded: boolean;
  /** Klartext-Grund aus critical-speed.js (nur als optionaler title-Tooltip
   *  gedacht, NICHT als sichtbarer UI-Text — s. Grill-Punkt 6). */
  degradedReason: string | null;
  /** Vollständige Zonenkette oder `[]` (degradiert). */
  zones: PaceZone[];
  /** Skalenende in Geschwindigkeit (0 = degradiert). */
  scaleMaxSpeed: number;
  /** Pace-Kurve (beste Ø-Pace je belegtem Distanz-Bucket). */
  curve: PaceCurvePoint[];
  /** Anzahl Einheiten der Sportart. */
  nActivities: number;
  /** true, wenn der Athlet in dieser Sportart noch gar nichts geloggt hat
   *  (Schwimm-Tab: 0 Aktivitäten — expliziter Leerzustand). */
  emptySport: boolean;
  /** HF-bpm-Zonen (nur Lauf) — `[]` ohne `hrMax` oder bei Schwimm. */
  hrZones: HrZone[];
  /** true, solange `hrZones` leer ist (kein `hrMax` bzw. Schwimm). */
  hrDegraded: boolean;
  /** true, solange `hrMax` geschätzt statt gemessen ist (Phase 2: immer,
   *  sobald überhaupt ein hrMax vorliegt — s. G13/G15). */
  hrEstimated: boolean;
}

export interface PaceSectionInput {
  rides: Ride[];
  sport: PaceSport;
  /** Geschätzter Athleten-hrMax aus dem Sync-Output (api/pipeline.ts),
   *  `null`/fehlend außerhalb von Multi-Sport-Athleten. */
  hrMax?: number | null;
  hrEstimated?: boolean;
}

/**
 * Baut das View-Model der Pace-Sektion für Lauf oder Schwimm.
 * @param {PaceSectionInput} input  volle Ride-Liste + Zielsportart
 * @returns {PaceSectionViewModel}
 */
export function buildPaceSection({
  rides,
  sport,
  hrMax = null,
  hrEstimated = false,
}: PaceSectionInput): PaceSectionViewModel {
  const profile = sportProfileFor(sport);
  const sportLabel = profile?.label ?? (sport === "run" ? "Laufen" : "Schwimmen");
  const thresholdMetric = profile?.metrics.thresholdMetric ?? "Schwellenpace";
  const thresholdUnit = profile?.metrics.thresholdUnit ?? "min/km";

  // Guardrail 4: erst das Sport-Gate, dann rechnen.
  const subset = ridesForSport(rides, sport);
  const nActivities = subset.length;
  const emptySport = nActivities === 0;

  // Schwellenschätzung: nur Lauf trägt eine rides-basierte 2-Punkt-CS
  // (estimateThresholdSpeed filtert intern selbst auf "run"). Schwimmen hat
  // keine `rides`-Schätzung — CSS bräuchte zwei Distanz-Zeit-Punkte, und der
  // Account trägt 0 Schwimm-Einheiten (E0). Dann bleibt die Skala degradiert.
  const est = sport === "run" ? estimateThresholdSpeed(rides) : null;
  const thresholdSpeed =
    est && typeof est.speed === "number" && est.speed > 0 ? est.speed : null;
  const degradedReason =
    est && typeof est.reason === "string" ? est.reason : null;

  const zoneSource = profile?.zones ?? null;
  const zones: PaceZone[] =
    thresholdSpeed != null && zoneSource
      ? (computePaceZones(thresholdSpeed, zoneSource, PACE_FROM_KMH) as PaceZone[])
      : [];
  const scaleMaxSpeed =
    thresholdSpeed != null && zoneSource ? paceScaleMax(thresholdSpeed, zoneSource) : 0;
  const thresholdPaceSec = thresholdSpeed != null ? PACE_FROM_KMH(thresholdSpeed) : null;

  const curve = buildPaceCurve(subset) as PaceCurvePoint[];

  // HF-bpm-Zonen: nur Lauf (G19-Nicht-Ziel für Schwimm), unabhängig von der
  // Pace-Schwellenschätzung oben — hängt allein am Athleten-hrMax.
  const hrZoneSource = sport === "run" ? sportProfileFor("run")?.metrics.hrZones : null;
  const hrZones: HrZone[] =
    hrMax != null && hrMax > 0 && hrZoneSource
      ? Object.entries(hrZoneSource).map(([id, [lowPct, highPct]]) => {
          const meta = HR_ZONE_META[id] ?? { label: id.toUpperCase(), farbe: "var(--z1)" };
          return {
            id,
            label: meta.label,
            farbe: meta.farbe,
            vonBpm: Math.round(hrMax * lowPct),
            bisBpm: Math.round(hrMax * highPct),
          };
        })
      : [];

  return {
    sport,
    sportLabel,
    thresholdMetric,
    thresholdUnit,
    thresholdSpeed,
    thresholdPaceSec,
    degraded: zones.length === 0,
    degradedReason,
    zones,
    scaleMaxSpeed,
    curve,
    nActivities,
    emptySport,
    hrZones,
    hrDegraded: hrZones.length === 0,
    hrEstimated,
  };
}
