/* ============================================================
   FEATURES/PLANNING/DONE-DETAIL-CHART-VIEW-MODEL.TS — reine Ableitung für
   den aufklappbaren Detail-Chart der "Absolviert"-Tabelle (Etappe 13e,
   Redesign nach "Planungstab Live"-Mockup). Ersetzt den im Mockup gezeigten
   Rausch-Trace (Sekunden-Leistungs-/Puls-Kurve) durch zwei einfachere,
   tatsächlich baubare Varianten — echte Streams-Rohdaten existieren
   nirgends in der Pipeline (s. Etappe-13-Plan, dokumentiert in
   docs/offene-punkte.md, Etappe 13i):

   - Intervall-Workouts (RideCompliance vorhanden): buildStepChart() —
     Soll/Ist je gematchtem Intervall aus compliance.matched, direkt aus
     core/compliance-match.js über die Fahrt. KEINE HR-Linie: RideCompliance
     hat kein Puls-Feld je Intervall (core/compliance-match.js), nicht
     erfinden.
   - Ohne Intervallstruktur (Z2/Recovery/Gruppenfahrt): zoneMixFromRide() —
     echte Zonenzeiten der Fahrt, drei-drei-fünf gemappt auf
     COGGAN_ZONE_META statt der drei groben Bänder aus core/zones.js::
     bandZoneTimes (die App zeigt an dieser Stelle die volle 5-Zonen-
     Auflösung, näher am Mockup). ============================== */

import { accumulateZoneBuckets, normalizeZoneTimes } from "../../core/zones.js";
import { COGGAN_ZONE_META } from "../../sports/cycling/zones.js";

type Ride = import("../../types.js").Ride;
type RideCompliance = import("../../types.js").RideCompliance;

export interface StepChartBar {
  index: number;
  fulfilled: boolean;
  plannedDurationS: number;
  actualDurationS: number;
  plannedWatts: number;
  /** `null` ohne Ist-Block (avgWatts fehlt) — Komponente zeichnet dann
   *  keinen Ist-Balken für dieses Intervall, statt eine erfundene Null zu
   *  zeigen. */
  actualWatts: number | null;
  /** 0–100, Breite relativ zur Summe aller `plannedDurationS` (Zeitachse
   *  über alle Balken). */
  widthPct: number;
  /** 0–100, Höhe relativ zum höchsten Watt-Wert (Soll ODER Ist) unter allen
   *  Balken — gemeinsame Skala, damit Soll- und Ist-Balken direkt
   *  vergleichbar bleiben. */
  plannedHeightPct: number;
  /** wie `plannedHeightPct`, aber für den Ist-Wert — `null` ohne `avgWatts`. */
  actualHeightPct: number | null;
}

/** Ein Balken je `compliance.matched[i]` — Soll (gestrichelt) vs. Ist
 *  (gefüllt), `fulfilled` steuert ✓/✗ in der Komponente. Nutzt NUR
 *  `compliance.matched` (bereits auf Arbeits-Intervalle beschränkt, kind
 *  "set"|"alternating") — Nicht-Arbeits-Segmente (Ein-/Ausfahren/Pause) aus
 *  `workoutStructure` fließen hier bewusst nicht ein, sie haben keine
 *  gematchten Ist-Werte. `null` ohne Intervalle (kein Chart statt leerer
 *  Balkenreihe). */
export function buildStepChart(compliance: RideCompliance | null | undefined): StepChartBar[] | null {
  if (!compliance || !compliance.matched.length) return null;

  const totalDuration = compliance.matched.reduce((sum, m) => sum + (m.plannedDurationS || 0), 0) || 1;
  const maxWatts = Math.max(
    1,
    ...compliance.matched.map((m) => m.plannedWatts || 0),
    ...compliance.matched.map((m) => m.avgWatts ?? 0),
  );

  return compliance.matched.map((m, index) => ({
    index,
    fulfilled: m.fulfilled,
    plannedDurationS: m.plannedDurationS,
    actualDurationS: m.actualDurationS,
    plannedWatts: m.plannedWatts,
    actualWatts: m.avgWatts,
    widthPct: Math.round(((m.plannedDurationS || 0) / totalDuration) * 1000) / 10,
    plannedHeightPct: Math.round(((m.plannedWatts || 0) / maxWatts) * 100),
    actualHeightPct: m.avgWatts != null ? Math.round((m.avgWatts / maxWatts) * 100) : null,
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
