/* ============================================================
   FEATURES/ANALYSIS/ANALYSIS-VIEW-MODEL.TS — reine Ableitungen für den
   Analyse-Tab (kein DOM — Muster wie logbook-view-model.ts).

   Etappe 11d portiert nur die ersten zwei Sektionen aus
   assets/js/ui/analysis.js: Belastung (_renderLoad) und Intensität
   (_renderZones + _renderTypDistribution), plus die KPI-Hero-Reihe
   (_renderKPIs) — die gehört zu keiner einzelnen späteren Sektion (11e/
   11f), sondern ist Seiten-weit, deshalb hier im "Grundgerüst" mit
   gebaut statt offen zu bleiben. Alle Kern-Berechnungen kommen
   unverändert aus core/* (loadguard.js, zones.js, pmc.js, stats.js).
   ============================================================ */

import { buildLoadGuard, describeWeek } from "../../core/loadguard.js";
import { isoWeekKey } from "../../core/aggregate.js";
import { fmt, fmtInt } from "../../core/format.js";
import { currentPmc } from "../../core/pmc.js";
import { avg, maxVal, sum } from "../../core/stats.js";
import { distributionShape, overallBandsFromIF, overallZoneShares } from "../../core/zones.js";
import { CADENCE_TARGET_RPM } from "../../sports/cycling/metrics.js";

type Ride = import("../../types.js").Ride;

/* ── KPI-Hero ─────────────────────────────────────────────── */

export interface AnalysisKpi {
  value: string;
  label: string;
  sub?: string | null;
  color?: string;
}

/** Port von analysis.js::_renderKPIs. `ftpMeasured` kommt vom Aufrufer aus
 *  athleteConfig(id) — das Äquivalent zu Data.ftpValue() im React-Port
 *  (s. hero-view-model.ts). */
export function buildAnalysisKpis(rides: Ride[], ftpMeasured: number | null, todayISO: string): AnalysisKpi[] {
  const totalKm = Math.round(sum(rides, "km"));
  const totalMin = Math.round(sum(rides, "min"));
  const totalH = (totalMin / 60).toFixed(0);
  const avgKm = rides.length ? fmt(totalKm / rides.length) : "–";
  const maxCTL = fmtInt(maxVal(rides.filter((r) => r.ctl != null), "ctl"));
  const avgHF = fmtInt(avg(rides.filter((r) => r.hf), "hf"));
  const avgKad = fmtInt(avg(rides.filter((r) => r.kad), "kad"));
  const totalTSS = Math.round(sum(rides.filter((r) => r.tss), "tss"));
  const ownPlan = rides.some((r) => r.week);
  // TSB ist ein athletenweiter "heute"-Wert (auf heute fortgeschrieben,
  // s. currentPmc()), kein Sektions-gefilterter — sonst widerspricht diese
  // Kachel der Belastungsempfehlung (kommt erst mit 11e/11f).
  const lastTSB = currentPmc(rides, todayISO)?.tsb ?? null;

  return [
    { value: String(rides.length), label: "Fahrten" },
    { value: `${totalKm.toLocaleString("de")} km`, label: "Distanz", sub: `Ø ${avgKm} km/Fahrt` },
    { value: `${totalH} h`, label: "Trainingszeit", sub: `${totalMin.toLocaleString("de")} min gesamt` },
    { value: ftpMeasured ? `${ftpMeasured}W` : "–", label: "FTP (gemessen)", color: "var(--accent)" },
    {
      value: maxCTL,
      label: "Peak CTL",
      sub: lastTSB != null ? `TSB heute: ${lastTSB > 0 ? "+" : ""}${fmt(lastTSB)}` : null,
    },
    { value: `${avgHF} bpm`, label: "Ø Herzfrequenz" },
    { value: `${avgKad} RPM`, label: "Ø Kadenz", sub: ownPlan ? `Ziel: ${CADENCE_TARGET_RPM}+ RPM` : null },
    { value: totalTSS.toLocaleString("de"), label: "Gesamt TSS" },
  ];
}

/* ── Belastung & Erholung ─────────────────────────────────── */

export interface LoadRow {
  week: string;
  total: number;
  ramp: number | null;
  monotony: number | null;
  strain: number | null;
  risk: "ok" | "caution" | "high";
  label: string;
  detail: string;
}

/** Port von analysis.js::_renderLoad. Wochen-Zuordnung immer über die
 *  ISO-Kalenderwoche (wie _weekFns() im Original — der dortige ownPlan-
 *  Parameter blieb dort bereits ungenutzt, keine Regression hier). Zeigt
 *  die letzten 8 Wochen mit Daten. */
export function buildLoadRows(rides: Ride[]): LoadRow[] {
  const weekKeyFn = (r: Ride) => isoWeekKey(r.dateISO);
  const weekSortFn = (a: string, b: string) => a.localeCompare(b);
  const guard = buildLoadGuard(rides, weekKeyFn, weekSortFn);
  return guard.slice(-8).map((r) => {
    const d = describeWeek(r);
    return { ...r, label: d.label, detail: d.detail };
  });
}

/* ── Intensitätsverteilung ────────────────────────────────── */

export interface IntensityDistribution {
  source: "zoneTimes" | "if";
  shares: { low: number; mid: number; high: number };
  nRides: number;
  hours: number;
  representative: boolean;
  sourceLabel: string;
  shapeLabel: string | null;
  note: string;
}

/** Port von analysis.js::_renderZones. Nur bei ausreichender Abdeckung
 *  (Zeit-in-Zone ODER ≥60% der Fahrten mit IF-Näherung) ein Formurteil
 *  ("polarisiert"/…) — sonst ehrlich als Vorschau labeln, s. Kommentar im
 *  Original. */
export function buildIntensityDistribution(rides: Ride[]): IntensityDistribution | null {
  const zoneBased = overallZoneShares(rides);
  const dist = zoneBased || overallBandsFromIF(rides);
  if (!dist) return null;

  const coverage = rides.length ? dist.nRides / rides.length : 0;
  const representative = dist.source === "zoneTimes" || coverage >= 0.6;

  const sourceLabel =
    dist.source === "zoneTimes"
      ? `Zeit in Zone (intervals.icu) · ${dist.nRides} Fahrten · ${dist.hours} h`
      : `Näherung über Intensitätsfaktor · nur ${dist.nRides}/${rides.length} Fahrten mit Leistungsdaten · ${dist.hours} h`;

  let shapeLabel: string | null = null;
  let note: string;
  if (representative) {
    const s = distributionShape(dist.shares);
    shapeLabel = s.shape.charAt(0).toUpperCase() + s.shape.slice(1);
    note = s.note;
  } else {
    note = `Für ein belastbares Verteilungs-Urteil fehlen noch Zeit-in-Zone-Daten (aktuell nur ${dist.nRides} von ${rides.length} Fahrten mit Leistungswerten). Das Band unten ist eine grobe Vorschau über die kraftbasierten Fahrten — es unterschätzt den Grundlagenanteil, weil vielen lockeren Einheiten NP/FTP fehlt.`;
  }

  return {
    source: dist.source,
    shares: dist.shares,
    nRides: dist.nRides,
    hours: dist.hours,
    representative,
    sourceLabel,
    shapeLabel,
    note,
  };
}

/* ── Trainingstyp-Verteilung ──────────────────────────────── */

export interface TypDistributionRow {
  typ: string;
  count: number;
  km: number;
  pct: number;
  color: string;
}

/** 1:1 aus analysis.js::_renderTypDistribution. */
const TYP_COLORS: Record<string, string> = {
  "Z2 Lang": "#4a7fa8",
  "Z2 Dauer": "#4a7fa8",
  "Z1 Recovery": "#4a9a6e",
  "Sweet Spot": "#e08a3c",
  Schwelle: "#d94f4f",
  VO2max: "#a24ad0",
  Gruppenfahrt: "#c9a84c",
  Etappe: "#c9a84c",
  Ausserplanmaessig: "#6b7280",
  Freestyle: "#6b7280",
  "FTP-Test": "#c9a84c",
};

export function buildTypDistribution(rides: Ride[]): TypDistributionRow[] {
  const typMap: Record<string, { count: number; km: number }> = {};
  for (const r of rides) {
    const t = r.typ || "Sonstige";
    if (!typMap[t]) typMap[t] = { count: 0, km: 0 };
    typMap[t].count++;
    typMap[t].km += r.km || 0;
  }

  const totalKm = sum(rides, "km");
  return Object.entries(typMap)
    .sort((a, b) => b[1].km - a[1].km)
    .map(([typ, d]) => ({
      typ,
      count: d.count,
      km: Math.round(d.km),
      pct: totalKm > 0 ? (d.km / totalKm) * 100 : 0,
      color: TYP_COLORS[typ] || "#6b7280",
    }));
}
