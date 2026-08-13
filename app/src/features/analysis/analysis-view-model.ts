/* ============================================================
   FEATURES/ANALYSIS/ANALYSIS-VIEW-MODEL.TS — reine Ableitungen für den
   Analyse-Tab (kein DOM — Muster wie logbook-view-model.ts).

   Etappe 11d portierte die ersten zwei Sektionen aus assets/js/ui/analysis.js:
   Belastung (_renderLoad) und Intensität (_renderZones + _renderTypDistribution),
   plus die KPI-Hero-Reihe (_renderKPIs) — die gehört zu keiner einzelnen
   späteren Sektion (11e/11f), sondern ist Seiten-weit, deshalb hier im
   "Grundgerüst" mit gebaut statt offen zu bleiben. Etappe 11e ergänzt Aerobe
   Entwicklung (_renderAerobic) und Leistungsdiagnostik (_renderPower).
   Alle Kern-Berechnungen kommen unverändert aus core/* (loadguard.js,
   zones.js, pmc.js, stats.js, efficiency.js, cadence.js, ftp-forecast.js,
   records.js, body.js).
   ============================================================ */

import { cadenceCoach } from "../../core/cadence.js";
import {
  availability,
  energyView,
  estimateBMR,
  hydrationSeries,
  wattsPerKg,
  weightTrend,
} from "../../core/body.js";
import { buildConsistency as buildConsistencyCore } from "../../core/adherence.js";
import {
  DECOUPLING_MIN_POINTS,
  DECOUPLING_STABLE,
  decouplingTrend,
  efficiencyTrend,
} from "../../core/efficiency.js";
import {
  dateForTarget,
  eftpHistory,
  eftpHistoryFromWellness,
  forecastFtp,
  mergeEftpHistories,
} from "../../core/ftp-forecast.js";
import { buildLoadGuard, describeWeek } from "../../core/loadguard.js";
import { isoWeekKey } from "../../core/aggregate.js";
import { fmt, fmtDate, fmtInt } from "../../core/format.js";
import { phaseCompliance } from "../../core/periodization.js";
import { currentPmc } from "../../core/pmc.js";
import { recordProgression } from "../../core/records.js";
import { avg, maxVal, sum } from "../../core/stats.js";
import { distributionShape, overallBandsFromIF, overallZoneShares } from "../../core/zones.js";
import { CADENCE_TARGET_RPM } from "../../sports/cycling/metrics.js";
import type { PlanCard } from "../../api/types";

type Ride = import("../../types.js").Ride;
type WellnessDay = import("../../types.js").WellnessDay;

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

/* ── Aerobe Entwicklung ───────────────────────────────────── */

export interface AerobicSub {
  text: string;
  color?: string;
}

export interface AerobicCard {
  title: string;
  value?: string;
  unit?: string;
  valueColor?: string;
  subs?: AerobicSub[];
  empty?: string;
}

/** Port von analysis.js::_renderAerobic — Effizienzfaktor, HF-Decoupling,
 *  Kadenz-Ökonomie, immer in dieser Reihenfolge (auch je eine leere Karte,
 *  wenn die Datenbasis fehlt — 1:1 wie im Original, keine Karte entfällt). */
export function buildAerobicCards(rides: Ride[], ownPlan: boolean): AerobicCard[] {
  const cards: AerobicCard[] = [];

  const ef = efficiencyTrend(rides);
  if (ef && ef.first != null && ef.last != null) {
    const delta = Math.round((ef.last - ef.first) * 100) / 100;
    const up = delta > 0;
    const subs: AerobicSub[] = [
      {
        text: `${delta > 0 ? "+" : ""}${delta} seit Beginn · ${ef.comparable.length} vergleichbare Z2-Fahrten`,
        color: up ? "var(--z1, #4a9a6e)" : "var(--dim)",
      },
    ];
    if (ef.slopePer30d != null) {
      subs.push({ text: `Trend: ${ef.slopePer30d > 0 ? "+" : ""}${ef.slopePer30d} / 30 Tage` });
    }
    cards.push({ title: "Effizienzfaktor", value: `${ef.last}`, unit: "W/bpm", subs });
  } else {
    cards.push({ title: "Effizienzfaktor", empty: "Zu wenig vergleichbare Z2-Fahrten (≥60 min)." });
  }

  const dc = decouplingTrend(rides);
  if (dc) {
    const stable = dc.median < DECOUPLING_STABLE;
    const subs: AerobicSub[] = [
      { text: `${dc.stableShare}% der Fahrten aerob stabil (<${DECOUPLING_STABLE}%) · n=${dc.n}` },
    ];
    if (dc.slopePer30d != null) {
      subs.push({ text: `Trend: ${dc.slopePer30d > 0 ? "+" : ""}${dc.slopePer30d} %-Pkt. / 30 Tage` });
    }
    cards.push({
      title: "HF-Decoupling",
      value: `${dc.median}`,
      unit: "% Median",
      valueColor: stable ? "var(--z1, #4a9a6e)" : "var(--ss, #e08a3c)",
      subs,
    });
  } else {
    const nNow = rides.filter((r) => r.decoupling != null).length;
    cards.push({
      title: "HF-Decoupling",
      empty: `Datenbasis wächst noch (${Math.min(nNow, DECOUPLING_MIN_POINTS)}/${DECOUPLING_MIN_POINTS} geeignete Steady-State-Fahrten).`,
    });
  }

  const kad = cadenceCoach(rides, CADENCE_TARGET_RPM);
  if (kad) {
    const deltaText = kad.delta != null ? `${kad.delta > 0 ? "+" : ""}${kad.delta} RPM seit Beginn · ` : "";
    const targetText = ownPlan ? `≥ Ziel ${CADENCE_TARGET_RPM}` : "≥ 90";
    cards.push({
      title: "Kadenz-Ökonomie",
      value: `${kad.recentAvg}`,
      unit: "RPM zuletzt",
      subs: [{ text: `${deltaText}${kad.shareAbove}% der Fahrten ${targetText} RPM` }],
    });
  } else {
    cards.push({ title: "Kadenz-Ökonomie", empty: "Zu wenig Fahrten mit Kadenzdaten." });
  }

  return cards;
}

/* ── Leistungsdiagnostik ──────────────────────────────────── */

export interface FtpTriadRow {
  icon: string;
  label: string;
  value: number | null;
  wkgLabel: string;
  meta: string;
}

export interface ForecastSegment {
  text: string;
  strong?: boolean;
}

export interface PowerForecast {
  /** "line" = ftp-forecast-line (Retest-/Zielhorizont-Prognose vorhanden),
   *  "note" = analysis-note (eFTP-Historie noch zu jung für eine Prognose). */
  kind: "line" | "note";
  segments: ForecastSegment[];
}

export interface PowerDiagnosticsInput {
  rides: Ride[];
  wellness: WellnessDay[];
  weight: number | null;
  ftpMeasured: number | null;
  ftpMeasuredDate: string | null;
  ftpGoal: number | null;
  ownPlan: boolean;
  retestDateISO: string | null;
}

export interface PowerDiagnostics {
  rows: FtpTriadRow[];
  weightNote: string | null;
  forecast: PowerForecast | null;
}

/** Port von analysis.js::_renderPower (ohne den Bestwerte-Digest, s.
 *  buildRecordChips). FTP-Dreiklang gemessen/geschätzt/Ziel nie vermischen
 *  (s. AGENTS.md) — die drei Zeilen bleiben strikt getrennte Quellen. */
export function buildPowerDiagnostics(input: PowerDiagnosticsInput): PowerDiagnostics {
  const { rides, wellness, weight, ftpMeasured, ftpMeasuredDate, ftpGoal, ownPlan, retestDateISO } = input;

  const history = mergeEftpHistories(eftpHistory(rides), eftpHistoryFromWellness(wellness));
  const lastEftp = history.length ? history[history.length - 1] : null;
  const wkgLabel = (w: number | null) => {
    const v = wattsPerKg(w, weight);
    return v != null ? `${fmt(v)} W/kg` : "–";
  };

  const rows: FtpTriadRow[] = [
    {
      icon: "🔬",
      label: "gemessen",
      value: ftpMeasured,
      wkgLabel: ftpMeasured != null ? wkgLabel(ftpMeasured) : "",
      meta: ftpMeasuredDate ? `Ramp-Test · ${fmtDate(ftpMeasuredDate)}` : "Ramp-Test (letzter)",
    },
    {
      icon: "〜",
      label: "geschätzt",
      value: lastEftp?.eftp ?? null,
      wkgLabel: lastEftp ? wkgLabel(lastEftp.eftp) : "",
      meta: lastEftp ? `eFTP intervals.icu · Stand ${fmtDate(lastEftp.date)} · ≠ Ramp-Test-Wert` : "eFTP intervals.icu",
    },
    {
      icon: "🎯",
      label: "Ziel",
      value: ftpGoal,
      wkgLabel: ftpGoal != null ? wkgLabel(ftpGoal) : "",
      meta: ownPlan && retestDateISO ? `Retest ${fmtDate(retestDateISO)}` : "ohne Termin",
    },
  ];

  const weightNote = weight
    ? `W/kg bezogen auf ${fmt(weight)} kg (letzter Wellness-Wert) — Bezugsgröße pro Zeile beachten (gemessen ≠ geschätzt ≠ Ziel).`
    : null;

  let forecast: PowerForecast | null = null;
  if (history.length >= 3) {
    if (ownPlan && retestDateISO) {
      const fc = forecastFtp(history, retestDateISO);
      if (fc) {
        const hit = fc.projected >= (ftpGoal || 0);
        forecast = {
          kind: "line",
          segments: [
            { text: `Retest-Erwartung (${fmtDate(retestDateISO)}): ` },
            { text: `${fc.low}–${fc.high} W`, strong: true },
            {
              text: ` (Projektion ${fc.projected} W, Trend ${fc.slopePerWeek > 0 ? "+" : ""}${fc.slopePerWeek} W/Woche) — Ziel ${ftpGoal} W ${hit ? "in Reichweite" : "aktuell außerhalb der Projektion"}.`,
            },
          ],
        };
      }
    } else if (ftpGoal) {
      const t = dateForTarget(history, ftpGoal);
      if (t?.reached && t.days === 0) {
        forecast = {
          kind: "line",
          segments: [
            {
              text: `Der eFTP-Trend hat das Ziel ${ftpGoal} W bereits erreicht — Zeit für einen bestätigenden Ramp-Test.`,
            },
          ],
        };
      } else if (t?.reached) {
        forecast = {
          kind: "line",
          segments: [
            { text: `Bei aktuellem eFTP-Trend (${t.slopePerWeek > 0 ? "+" : ""}${t.slopePerWeek} W/Woche) wird das Ziel ${ftpGoal} W ca. ` },
            { text: fmtDate(t.date), strong: true },
            { text: " erreicht." },
          ],
        };
      } else if (t) {
        forecast = {
          kind: "line",
          segments: [
            {
              text:
                t.reason === "flat"
                  ? "Der eFTP-Trend ist aktuell flach — kein belastbarer Zielhorizont für " + ftpGoal + " W ableitbar."
                  : `Ziel ${ftpGoal} W liegt beim aktuellen Trend mehr als 12 Monate entfernt.`,
            },
          ],
        };
      }
    }
  } else {
    forecast = {
      kind: "note",
      segments: [{ text: "eFTP-Historie noch leer — wird nach dem nächsten Daten-Sync befüllt (Wellness-sportInfo / icu_eftp)." }],
    };
  }

  return { rows, weightNote, forecast };
}

/* ── Bestwerte-Digest ─────────────────────────────────────── */

export interface RecordChip {
  key: string;
  icon: string;
  value: string;
  unit: string;
  label: string;
  name: string;
  date: string;
  historyCount: number;
}

/** Port von analysis.js::_renderPower's Bestwerte-Digest (`recBox`). */
export function buildRecordChips(rides: Ride[]): RecordChip[] {
  return recordProgression(rides).map((r) => ({
    key: r.key,
    icon: r.icon,
    value: r.unit === "min" ? fmtInt(r.value) : fmt(r.value),
    unit: r.unit,
    label: r.label,
    name: r.name || "",
    date: fmtDate(r.date),
    historyCount: r.history.length,
  }));
}

/* ── Regeneration & Körper ─────────────────────────────────── */

/** Port von analysis.js::_renderBody. Nutzt bewusst dasselbe `AerobicCard`-
 *  Ergebnistyp wie buildAerobicCards() — das Original zeichnet Gewicht/
 *  Energie/Hydration mit derselben `.aerobic-card`-Klasse, hier also
 *  dieselbe Komponente (AerobicCards.tsx) wiederverwenden statt eine
 *  Kopie zu bauen. Leeres Array = Sektion komplett ausblenden (Aufrufer),
 *  1:1 wie `section.classList.toggle("hidden", !avail.any)` im Original. */
export function buildBodyCards(
  wellness: WellnessDay[],
  todayISO: string,
  ftpMeasured: number | null,
  bmr: { heightCm: number; age: number; sex?: string; weightKg: number } | undefined
): AerobicCard[] {
  const avail = availability(wellness, todayISO);
  if (!avail.any) return [];

  const cards: AerobicCard[] = [];

  if (avail.weight) {
    const t = weightTrend(wellness);
    if (t) {
      const wkgMeasured = wattsPerKg(ftpMeasured, t.current);
      const deltaColor =
        t.delta30d == null || Math.abs(t.delta30d) < 0.3
          ? "var(--dim)"
          : t.delta30d < 0
            ? "var(--z1, #4a9a6e)"
            : "var(--ss, #e08a3c)";
      const subs: AerobicSub[] = [
        {
          text: `${t.delta30d != null ? `${t.delta30d > 0 ? "+" : ""}${t.delta30d} kg / 30 Tage` : ""} · ${t.n} Messungen`,
          color: deltaColor,
        },
      ];
      if (wkgMeasured != null) {
        subs.push({ text: `${fmt(wkgMeasured)} W/kg (bezogen auf gemessene FTP ${ftpMeasured} W)` });
      }
      cards.push({ title: "Gewicht", value: `${fmt(t.current)}`, unit: "kg", subs });
    }
  }

  if (avail.energy) {
    let estBMR: number | null = null;
    if (bmr) {
      const wt = weightTrend(wellness);
      const recentWeight = wt?.points.length ? wt.points[wt.points.length - 1].weight : bmr.weightKg;
      estBMR = estimateBMR({ weightKg: recentWeight, heightCm: bmr.heightCm, age: bmr.age, sex: bmr.sex });
    }
    const e = energyView(wellness, estBMR);
    if (e) {
      const gu = e.restingEstimated ? "Grundumsatz gesch." : "Grundumsatz";
      const parts: string[] = [];
      if (e.hasExpenditure) {
        parts.push(
          e.hasResting
            ? `Verbrauch Ø ${(e.avgBurned ?? 0).toLocaleString("de")} kcal/Tag (${gu} ${e.avgResting} + aktiv ${e.avgActive})`
            : `Aktiv verbrannt Ø ${(e.avgActive ?? 0).toLocaleString("de")} kcal/Tag`
        );
      }
      if (e.hasIntake) parts.push(`Zufuhr Ø ${(e.avgIntake ?? 0).toLocaleString("de")} kcal/Tag`);
      const headVal = e.hasExpenditure ? (e.hasResting ? e.avgBurned : e.avgActive) : e.avgIntake;
      const headUnit = e.hasExpenditure ? (e.hasResting ? "kcal/Tag Ø Verbrauch" : "kcal/Tag Ø aktiv") : "kcal/Tag Ø Zufuhr";
      cards.push({
        title: "Energie",
        value: headVal != null ? headVal.toLocaleString("de") : "–",
        unit: headUnit,
        subs: [
          { text: `${parts.join(" · ")} · ${e.n} Tage` },
          {
            text:
              e.hasExpenditure && e.hasIntake
                ? "Zufuhr unter dem Verbrauch = negatives Energiedefizit — bei hoher Last die Regeneration im Blick behalten."
                : "Quelle: intervals.icu (Apple Health / Amazfit).",
          },
        ],
      });
    }
  }

  if (avail.hydration) {
    const h = hydrationSeries(wellness);
    if (h) {
      cards.push({
        title: "Hydration",
        value: h.field === "hydrationVolume" ? h.avg.toLocaleString("de") : fmt(h.avg),
        unit: h.field === "hydrationVolume" ? "ml/Tag Ø" : "Score Ø",
        subs: [{ text: `${h.n} Tage erfasst · Dehydration treibt HF-Drift und verfälscht EF/Decoupling` }],
      });
    }
  }

  return cards;
}

/* ── Konsistenz & Adhärenz ─────────────────────────────────── */

export interface ConsistencySummary {
  chips: AnalysisKpi[];
  missedText: string | null;
}

/** Port von analysis.js::_renderConsistency. `planCards` kommt roh von
 *  usePlanCards() rein (Session-Shape, `date`/`cancelled`/`name` bereits
 *  aufgelöst) — core/adherence.js::planAdherence fällt intern auf `.name`
 *  zurück, wenn `.title` fehlt, exakt wie im Vanilla-Original mit
 *  plan_cards-Objekten. `null` bei Athlet 2 (kein eigener Plan im Sinne
 *  von ownPlan, s. AGENTS.md "Bekannte Eigenheiten" zu mapActivity2()). */
export function buildConsistencySummary(rides: Ride[], planCards: PlanCard[] | null, todayISO: string): ConsistencySummary {
  const c = buildConsistencyCore(rides, planCards, {}, todayISO);

  const freq = c.frequency;
  const freqStr = freq
    ? `${fmt(freq.recent)} Fahrten/Woche${freq.delta != null ? ` (${freq.delta > 0 ? "+" : ""}${freq.delta} vs. Vormonat)` : ""}`
    : "–";

  const chips: AnalysisKpi[] = [
    { value: `${c.streak}`, label: "Wochen-Streak", sub: "aufeinanderfolgende Trainingswochen" },
    { value: freqStr, label: "Frequenz (4 Wochen)" },
  ];
  if (c.adherence) {
    chips.push({
      value: `${c.adherence.quote}%`,
      label: "Plan-Adhärenz",
      sub: `${c.adherence.done}/${c.adherence.planned} geplante Einheiten absolviert`,
    });
  }

  const missedText = c.adherence?.missed?.length
    ? `Zuletzt verpasst: ${c.adherence.missed.map((m: { title: string; date: string }) => `${m.title} (${fmtDate(m.date)})`).join(" · ")}`
    : null;

  return { chips, missedText };
}

/* ── Periodisierungs-Erfüllung ────────────────────────────── */

export interface PeriodizationBlock {
  phase: string;
  weeks: string[];
  status: "ok" | "teilweise" | "abweichend";
  note: string;
}

export interface PeriodizationRecoveryWeek {
  week: string;
  tss: number;
  refTss: number | null;
  reduced: boolean | null;
}

export interface PeriodizationSummary {
  blocks: PeriodizationBlock[];
  recovery: PeriodizationRecoveryWeek[];
}

/** Port von analysis.js::_renderPeriodization (nur eigener Plan, vom
 *  Aufrufer über `ownPlan` gegated). `weekIndexFn` kommt vom Aufrufer
 *  (`weekSortIndex` + `weekIndex` aus config.ts), wie im Original
 *  `weekSortIndex(w, (x) => CONFIG.weekIndex(x))`. */
export function buildPeriodization(rides: Ride[], weekIndexFn: (week: string) => number): PeriodizationSummary | null {
  const c = phaseCompliance(rides, weekIndexFn);
  if (!c) return null;
  return {
    blocks: c.blocks.map((b: PeriodizationBlock) => ({ phase: b.phase, weeks: b.weeks, status: b.status, note: b.note })),
    recovery: c.recovery,
  };
}
