/* ============================================================
   FEATURES/HERO/ZONE-EXPLAINER-VIEW-MODEL.TS — Datenaufbereitung für den
   Zonen-Erklärer im Hero (Fahrplan 24, E2). Kein React, kein DOM.

   Rechnet NICHTS Neues: Watt-Grenzen kommen fertig aus buildPowerScale()
   (core/zones.js), die HF-Prozentgrenzen aus sports/cycling/metrics.ts
   (HR_ZONES) × HFmax — dieselbe Multiplikation wie
   analysis/pace-section-view-model.ts (dort nur für Lauf).

   E3 (Lauf/Schwimmen): HF-Zonen je Sportart (RUNNING_HR_ZONES /
   SWIMMING_HR_ZONES aus den metrics.ts der Sportprofile) und die Pace-Zonen-Kachel. Die
   Pace-Zonen kommen unverändert aus buildPaceSection() (Analyse-Tab, dieselbe
   Schwellenschätzung) — hier wird nur umbenannt/formatiert.
   ============================================================ */

import { fmtPace } from "../../core/format.js";
import { sportProfileFor } from "../../sports";
import { COGGAN_ZONE_META } from "../../sports/cycling/zones";
import type { HrZone, PaceSectionViewModel, PaceZone } from "../analysis/pace-section-view-model";
import type { ExplainerCallout, ExplainerZone } from "./ZoneExplainer";
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

/** Hero-Sportart (Umschalter) → Sportart-Schlüssel der Erklärtexte. */
export const EXPLAINER_SPORT = { ride: "cycling", run: "running", swim: "swimming" } as const;
export type HeroZoneSport = keyof typeof EXPLAINER_SPORT;

/** Welche Zonen-Kacheln ein Hero-Tab zeigt (Fahrplan 24). `sport` ist der
 *  EFFEKTIVE Tab (auf die Sportarten des Athleten geklemmt, s.
 *  useEffectiveSport): ein Athlet ohne Lauf/Schwimmen landet auf "ride" und
 *  bekommt diese Kacheln nie. Rad: nur mit FTP-Daten (Watt-Skala); Lauf/
 *  Schwimmen: immer — fehlende Schwelle/HFmax zeigt die Kachel selbst als
 *  degradierten Zustand, statt zu verschwinden. */
export function heroZoneTileIds(sport: HeroZoneSport, hasFtpData: boolean): readonly string[] {
  if (sport === "ride") return hasFtpData ? ["powerScale", "hrZones"] : [];
  return ["paceZones", "hrZones"];
}

/** Rad-HF-Zonen (E2) — Kurzform von buildHrZones("ride", …). */
export const buildCyclingHrZones = (hrMax: number | null): HrZonesViewModel => buildHrZones("ride", hrMax);

/** HF-Zonen (% HFmax je Sportart, sports/*) × HFmax. Ohne HFmax: degradiert,
 *  die Erklärer-Zonen tragen dann nur Label/Farbe, keine Zahlen. Die
 *  Anzeigenamen sind sportartübergreifend "Z1 Recovery"…"Z5 VO2max"
 *  (COGGAN_ZONE_META; deckungsgleich mit HR_ZONE_META im Analyse-Tab). */
export function buildHrZones(sport: HeroZoneSport, hrMax: number | null): HrZonesViewModel {
  const pct = sportProfileFor(sport)?.metrics.hrZones ?? {};
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

/** Pflichthinweis der Pace-Kachel (Fahrplan 24, Q5): fester Text, immer
 *  sichtbar. Gilt für Schwelle und Zonengrenzen, nicht für die Erklärtexte. */
export const PACE_RICHTWERT_HINT: ExplainerCallout = {
  text: "Richtwert, nicht an deinen Daten geprüft. Das gilt für die geschätzte Schwelle und die Zonengrenzen, nicht für die Beschreibungen.",
  quelleKeys: [],
};

/** Bereichstext einer Pace-Zone, schnellere Grenze zuletzt: "5:30–5:00 min/km".
 *  Unterste Zone (keine langsamere Grenze): "langsamer als 6:20 min/km". */
export function paceRangeText(vonPaceSec: number | null, bisPaceSec: number | null, unit: string): string | null {
  if (bisPaceSec == null) return null;
  return vonPaceSec == null ? `langsamer als ${fmtPace(bisPaceSec)} ${unit}` : `${fmtPace(vonPaceSec)}–${fmtPace(bisPaceSec)} ${unit}`;
}

export interface PaceZonesViewModel {
  /** Zonen für PaceZoneScale (Sekunden je Anzeige-Einheit: s/km bzw. s/100 m) */
  scaleZones: PaceZone[];
  degraded: boolean;
  explainerZones: ExplainerZone[];
}

/** Pace-Zonen-Kachel aus dem Pace-View-Model des Analyse-Tabs. buildPaceSection()
 *  rechnet die Pace immer in s/km (PACE_FROM_KMH); fürs Schwimmen (min/100 m)
 *  also durch 10. Ohne Schwelle: keine Zahlen, Labels/Farben aus dem
 *  Sportprofil (sports/*), damit die Beschreibungen lesbar bleiben (Q7). */
export function buildPaceZonesViewModel(pace: PaceSectionViewModel): PaceZonesViewModel {
  const divisor = pace.sport === "swim" ? 10 : 1;
  const scale = (sec: number | null) => (sec == null ? null : sec / divisor);
  const scaleZones: PaceZone[] = pace.zones.map((z) => ({
    ...z,
    vonPaceSec: scale(z.vonPaceSec),
    bisPaceSec: scale(z.bisPaceSec),
  }));
  const degraded = pace.degraded;
  const explainerZones: ExplainerZone[] = degraded
    ? (sportProfileFor(pace.sport)?.zones.meta ?? []).map((m) => ({ id: m.id, label: m.label, color: m.farbe, range: null }))
    : scaleZones.map((z) => ({
        id: z.id,
        label: z.label,
        color: z.farbe,
        range: paceRangeText(z.vonPaceSec, z.bisPaceSec, pace.thresholdUnit),
      }));
  return { scaleZones, degraded, explainerZones };
}
