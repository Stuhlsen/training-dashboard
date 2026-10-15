/* ============================================================
   FEATURES/HERO/ZONE-EXPLAINER-VIEW-MODEL.TS — Datenaufbereitung für den
   Zonen-Erklärer im Hero (Fahrplan 24, E2). Kein React, kein DOM.

   Rechnet NICHTS Neues: Watt-Grenzen kommen fertig aus buildPowerScale()
   (core/zones.js), die HF-Prozentgrenzen aus sports/cycling/metrics.ts
   (HR_ZONES) × HFmax — dieselbe Multiplikation wie
   analysis/pace-section-view-model.ts (dort nur für Lauf).
   ============================================================ */

import { sportProfileFor } from "../../sports";
import { COGGAN_ZONE_META } from "../../sports/cycling/zones";
import type { HrZone } from "../analysis/pace-section-view-model";
import type { ExplainerZone } from "./ZoneExplainer";
import type { HeroZoneSegment } from "./hero-view-model";

/** Bereichstext einer Zone: "bis 120 W" (unterste Zone), sonst "120–160 W". */
export function zoneRangeText(from: number, to: number, unit: "W" | "bpm"): string {
  return from <= 0 ? `bis ${to} ${unit}` : `${from}–${to} ${unit}`;
}

/** Watt-Zonen des Hero-Balkens als Erklärer-Zonen (kein degradierter Fall:
 *  die Kachel gibt es nur mit FTP-Wert). */
export function powerExplainerZones(segments: readonly HeroZoneSegment[]): ExplainerZone[] {
  return segments.map((s) => ({
    id: s.id,
    label: s.label,
    color: s.color,
    range: zoneRangeText(s.fromW, s.toW, "W"),
  }));
}

export interface HrMaxSource {
  /** profiles_own.hr_max — nur in der Eigenansicht lesbar */
  profileHrMax?: number | null;
  /** config.ts-Legacy-Wert des Athleten */
  configHrMax?: number | null;
  /** Sync-Schätzung aus rides.json (wie im Analyse-Tab) */
  payloadHrMax?: number | null;
  payloadEstimated?: boolean;
}

const isValid = (n: number | null | undefined): n is number => n != null && n > 0;

/** Welcher HFmax gilt und ob er geschätzt ist. Reihenfolge wie im Auftrag
 *  ("profiles.hr_max, sonst geschätzt"): eigener Profilwert, dann der
 *  config-Wert (beides vom Athleten gesetzt, nicht geschätzt), zuletzt die
 *  Sync-Schätzung — dieselbe wie der Analyse-Tab (`athleteData.hrMax`). */
export function resolveHrMax(src: HrMaxSource): { hrMax: number | null; estimated: boolean } {
  if (isValid(src.profileHrMax)) return { hrMax: src.profileHrMax, estimated: false };
  if (isValid(src.configHrMax)) return { hrMax: src.configHrMax, estimated: false };
  if (isValid(src.payloadHrMax)) return { hrMax: src.payloadHrMax, estimated: src.payloadEstimated ?? true };
  return { hrMax: null, estimated: false };
}

export interface HrZonesViewModel {
  /** bpm-Zonen für HrZoneScale; leer, wenn kein HFmax vorliegt */
  zones: HrZone[];
  degraded: boolean;
  explainerZones: ExplainerZone[];
}

/** Rad-HF-Zonen (HR_ZONES in % HFmax) × HFmax. Ohne HFmax: degradiert, die
 *  Erklärer-Zonen tragen dann nur Label/Farbe, keine Zahlen. */
export function buildCyclingHrZones(hrMax: number | null): HrZonesViewModel {
  const pct = sportProfileFor("ride")?.metrics.hrZones ?? {};
  const metaById = new Map(COGGAN_ZONE_META.map((m) => [m.id, m]));
  const ids = Object.keys(pct);
  const hasMax = isValid(hrMax);
  const zones: HrZone[] = hasMax
    ? ids.map((id) => {
        const [lo, hi] = pct[id];
        return {
          id,
          label: metaById.get(id)?.label ?? id.toUpperCase(),
          farbe: metaById.get(id)?.farbe ?? "var(--z1)",
          vonBpm: Math.round(hrMax * lo),
          bisBpm: Math.round(hrMax * hi),
        };
      })
    : [];
  const explainerZones: ExplainerZone[] = ids.map((id) => {
    const z = zones.find((x) => x.id === id);
    return {
      id,
      label: metaById.get(id)?.label ?? id.toUpperCase(),
      color: metaById.get(id)?.farbe ?? "var(--z1)",
      range: z ? zoneRangeText(z.vonBpm, z.bisBpm, "bpm") : null,
    };
  });
  return { zones, degraded: !hasMax, explainerZones };
}
