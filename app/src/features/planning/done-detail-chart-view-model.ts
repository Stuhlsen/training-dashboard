/* ============================================================
   FEATURES/PLANNING/DONE-DETAIL-CHART-VIEW-MODEL.TS — reine Ableitung für
   den aufklappbaren Detail-Chart der "Absolviert"-Tabelle (Etappe 13e,
   Redesign nach "Planungstab Live"-Mockup). Ersetzt den im Mockup gezeigten
   Rausch-Trace (Sekunden-Leistungs-/Puls-Kurve) durch zwei Varianten:

   - Intervall-Workouts (RideCompliance vorhanden): targetBandFromCompliance()
     liefert die Ziel-Watt-Spanne (min/max plannedWatts über compliance.matched),
     die DoneDetailChart als flaches Band HINTER die echte Sekunden-Watt-Kurve
     legt (gemeinsame Watt-Achse). Ohne Streams (keine intervals.icu-
     Zugangsdaten) fällt die Komponente auf fallbackIntervalRows() zurück —
     eine kompakte Soll/Ist-Textliste je Intervall. Die gestufte, zeit-
     ausgerichtete Ziel-Linie wäre der größere Umbau (Intervall-Startzeiten
     müssten durch die Sync-Pipeline exponiert werden, s.
     docs/offene-punkte.md).
   - Ohne Intervallstruktur (Z2/Recovery/Gruppenfahrt): zoneMixFromRide() —
     echte Zonenzeiten der Fahrt, drei-drei-fünf gemappt auf
     COGGAN_ZONE_META statt der drei groben Bänder aus core/zones.js::
     bandZoneTimes (die App zeigt an dieser Stelle die volle 5-Zonen-
     Auflösung, näher am Mockup). ============================== */

import { accumulateZoneBuckets, normalizeZoneTimes } from "../../core/zones.js";
import { expandWorkoutPhases } from "../../core/workout-math.js";
import { COGGAN_ZONE_META } from "../../sports/cycling/zones.js";

type Ride = import("../../types.js").Ride;
type RideCompliance = import("../../types.js").RideCompliance;

export interface TargetBand {
  lowW: number;
  highW: number;
  meanW: number;
}

/** Ziel-Watt-Spanne über alle matchbaren Arbeits-Intervalle
 *  (`compliance.matched`, kind "set"|"alternating") — min/max/Mittel der
 *  `plannedWatts` (0/undefined übersprungen). DoneDetailChart legt das als
 *  flaches, getöntes Band hinter die echte Sekunden-Watt-Kurve; bei einem
 *  Pyramiden-Workout wird das Band einfach höher. `null` ohne matchbare
 *  Intervalle mit gültigem Zielwert (kein Band statt eines erfundenen). */
export function targetBandFromCompliance(compliance: RideCompliance | null | undefined): TargetBand | null {
  if (!compliance || !compliance.matched.length) return null;
  const watts = compliance.matched
    .map((m) => m.plannedWatts)
    .filter((w): w is number => typeof w === "number" && w > 0);
  if (!watts.length) return null;
  return {
    lowW: Math.round(Math.min(...watts)),
    highW: Math.round(Math.max(...watts)),
    meanW: Math.round(watts.reduce((sum, w) => sum + w, 0) / watts.length),
  };
}

export interface TargetProfilePhase {
  /** Ziel-Watt der Phase; `null` bei Phasen ohne relative Intensität (all-out
   *  Sprint) — der Chart lässt dort eine Lücke, die Zeitachse läuft weiter. */
  watts: number | null;
  durationS: number;
}

export interface TargetProfile {
  phases: TargetProfilePhase[];
  /** Summe aller Phasen-Dauern (geplante Gesamtdauer, Sekunden). */
  totalS: number;
}

/** Volles geplantes Ziel-Watt-Profil aus `card.workoutStructure` — die
 *  komplette Phasenfolge (Warmup → Work → Pause → … → Cooldown), `%FTP` über
 *  `ftp` in Watt umgerechnet. Basis der zeit-ausgerichteten Treppen-Linie im
 *  DoneDetailChart (genauer als das flache targetBandFromCompliance-Band, das
 *  nur die Arbeits-Intervalle kennt). `null` ohne gültiges `ftp` (keine
 *  Watt-Achse möglich → Chart fällt aufs flache Band zurück) oder ohne
 *  verwertbare Phasen (z.B. Karte ohne `workout_structure`, alte Fahrt). */
export function targetProfileFromCard(
  card: { workoutStructure?: unknown } | null | undefined,
  ftp: number | null | undefined,
): TargetProfile | null {
  if (!card || ftp == null || !(ftp > 0)) return null;
  // `workoutStructure` ist projektweit als `unknown` durchgereicht (WorkoutJson,
  // s. api/types.ts) — expandWorkoutPhases geht defensiv mit beliebiger Form um.
  const raw = expandWorkoutPhases(card.workoutStructure as { steps?: unknown[] } | null | undefined);
  if (!raw.length) return null;
  const phases: TargetProfilePhase[] = raw.map((p) => ({
    durationS: p.durationS,
    watts: p.pct == null ? null : Math.round((p.pct / 100) * ftp),
  }));
  const totalS = phases.reduce((sum, p) => sum + p.durationS, 0);
  if (!totalS) return null;
  return { phases, totalS };
}

export interface FallbackIntervalRow {
  index: number;
  plannedWatts: number;
  /** `null` ohne Ist-Block (avgWatts fehlt) — Komponente zeigt "–". */
  actualWatts: number | null;
  fulfilled: boolean;
}

/** Kompakte Soll/Ist-Liste je `compliance.matched[i]` — Ersatz für den
 *  früheren Stufenchart, wenn KEINE intervals.icu-Streams vorliegen (ohne
 *  echte Sekunden-Kurve gibt es nichts, was ein Zielband hinterlegen
 *  könnte). `null` ohne Intervalle. */
export function fallbackIntervalRows(compliance: RideCompliance | null | undefined): FallbackIntervalRow[] | null {
  if (!compliance || !compliance.matched.length) return null;
  return compliance.matched.map((m, index) => ({
    index,
    plannedWatts: Math.round(m.plannedWatts || 0),
    actualWatts: m.avgWatts != null ? Math.round(m.avgWatts) : null,
    fulfilled: m.fulfilled,
  }));
}

export interface ZoneMixSegment {
  id: string;
  label: string;
  /** Token-Name (tokens.css), aus COGGAN_ZONE_META — keine Hex-Werte. */
  color: string;
  secs: number;
  /** 0–100, Anteil an der Gesamtzeit mit Zonendaten. */
  pct: number;
}

/** Echte Zonenzeiten der Fahrt (normalizeZoneTimes()) auf die 5
 *  COGGAN_ZONE_META-Bänder gemappt — nutzt denselben Bucket-Kern wie
 *  core/zones.js::last7DayZoneTimes (accumulateZoneBuckets(), Index ≥4 wird
 *  zu Z5+ zusammengefasst — mehr Zonen als Meta-Einträge liefert
 *  intervals.icu z.B. bei Z6/Z7). `null` bei fehlenden/leeren `zoneTimes`
 *  ODER wenn die Summe 0 ist (keine sinnvollen Anteile berechenbar) —
 *  Komponente rendert dann keinen Zonen-Mix statt einer leeren Leiste. */
export function zoneMixFromRide(ride: Ride): ZoneMixSegment[] | null {
  const secs = normalizeZoneTimes(ride.zoneTimes);
  if (!secs) return null;

  const bucketed = accumulateZoneBuckets(secs, [0, 0, 0, 0, 0]);
  const total = bucketed.reduce((sum, v) => sum + v, 0);
  if (!total) return null;

  return COGGAN_ZONE_META.map((meta, i) => ({
    id: meta.id,
    label: meta.label,
    color: meta.farbe,
    secs: bucketed[i],
    pct: Math.round((bucketed[i] / total) * 1000) / 10,
  }));
}
