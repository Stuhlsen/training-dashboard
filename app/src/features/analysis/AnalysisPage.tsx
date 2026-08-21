/* ============================================================
   FEATURES/ANALYSIS/ANALYSISPAGE.TSX — Analyse-Tab „Antworten & Spuren"
   (Redesign, Umsetzungsplan Etappe 3).

   Ersetzt den früheren Kennzahlen/Verläufe-Tab-Umschalter: Hero-Urteil +
   "Das läuft" + vier Leitfragen mit Spurenkarten sind jetzt die GANZE
   Seite. Der bisherige Kennzahlen-Inhalt (Last-Tabelle, Periodisierung,
   Rekorde, Typverteilung, Konsistenz, FTP-Dreiklang) ist nicht verloren,
   sondern lebt eingeklappt in LegacyKpiAppendix.tsx weiter (Absprache mit
   Alex, s. Umsetzungsplan). ExplorerSection.tsx (bisheriger Verläufe-Tab,
   17 Karten) wird hier nicht mehr eingebunden — bleibt vorerst unangetastet
   im Repo, Aufräumen ist ein bewusst separater, noch nicht freigegebener
   Schritt (s. Umsetzungsplan Etappe 3).
   ============================================================ */

import { useMemo, useState } from "react";
import { AthleteToggle } from "../../components/AthleteToggle";
import { GlassCard } from "../../components/GlassCard";
import { PageShell } from "../../components/PageShell";
import { useActiveAthlete } from "../../api/hooks/useActiveAthlete";
import { usePlanCards } from "../../api/hooks/usePlanCards";
import { useRides } from "../../api/hooks/useRides";
import { useEvents } from "../../api/hooks/useEvents";
import { useExplorerRange } from "../../api/hooks/useExplorerRange";
import { weekSortIndex } from "../../core/aggregate.js";
import { fmt, fmtInt, localISODate } from "../../core/format.js";
import { presetWindow } from "../../core/brush.js";
import { projectLoad } from "../../core/projection.js";
import { athleteConfig, RETEST_DATE, weekIndex } from "../../config";
import { resolvePlanningFtp } from "../planning/planning-view-model";
import { TraceCard } from "../../charts/TraceCard";
import { PowerCurveTraceCard } from "../../charts/PowerCurveTraceCard";
import { LegacyKpiAppendix } from "./LegacyKpiAppendix";
import { buildAnswersViewModel, type PowerUnit } from "./answers-view-model";
import {
  buildAerobicCards,
  buildAnalysisKpis,
  buildBodyCards,
  buildConsistencySummary,
  buildIntensityDistribution,
  buildLoadRows,
  buildPeriodization,
  buildPowerDiagnostics,
  buildRecordChips,
  buildTypDistribution,
} from "./analysis-view-model";
import { BrushBar } from "../../charts/BrushBar";
import type { PlanCard as PlanCardT, EventItem } from "../../api/types";

type Ride = import("../../types.js").Ride;
type WellnessDay = import("../../types.js").WellnessDay;

const TODAY = localISODate();
const HERO_PRESETS: Array<{ key: "30" | "90" | "all"; label: string }> = [
  { key: "30", label: "30 Tage" },
  { key: "90", label: "90 Tage" },
  { key: "all", label: "Mit Prognose" },
];

function toProjectionCard(c: PlanCardT) {
  return { id: c.id, date: c.date, typ: c.typ, phase: c.phase, cancelled: c.cancelled, tssPlanned: c.tssPlanned, workout: c.workout as object | null };
}
function toProjectionEvent(e: EventItem) {
  return { eventDate: e.eventDate, title: e.title, type: e.type, priority: e.priority ?? undefined };
}

const PILL_ROW_STYLE = { display: "flex", gap: 3, padding: 3, borderRadius: "var(--pill)", background: "rgba(20,24,34,.62)", backdropFilter: "blur(18px)", border: "1px solid var(--hair)" } as const;

export function AnalysisPage() {
  const { activeAthleteId, setActiveAthleteId } = useActiveAthlete();
  const athleteCfg = athleteConfig(activeAthleteId);
  const { data: athleteData, isLoading, error } = useRides(activeAthleteId);
  const { data: planCards } = usePlanCards(activeAthleteId);
  const { data: events } = useEvents(activeAthleteId);

  const [unit, setUnit] = useState<PowerUnit>("W");
  const [dense, setDense] = useState(false);

  const rides = useMemo(() => (athleteData?.rides as Ride[] | undefined) ?? [], [athleteData]);
  const wellness = useMemo(() => (athleteData?.wellness as WellnessDay[] | undefined) ?? [], [athleteData]);
  const cards = useMemo(() => planCards ?? [], [planCards]);
  const eventList = useMemo(() => events ?? [], [events]);
  const ownPlan = useMemo(() => rides.some((r) => r.week), [rides]);
  const ftp = resolvePlanningFtp(activeAthleteId, athleteData?.athleteFtp ?? null);

  const vm = useMemo(
    () =>
      buildAnswersViewModel({
        rides,
        wellness,
        planCards: cards,
        events: eventList,
        athleteCfg,
        athleteFtp: athleteData?.athleteFtp ?? null,
        athleteWeightKg: (athleteData?.athleteWeight as number | null | undefined) ?? null,
        powerCurves: athleteData?.powerCurves ?? null,
        unit,
        todayISO: TODAY,
      }),
    [rides, wellness, cards, eventList, athleteCfg, athleteData, unit],
  );

  const projection = useMemo(() => {
    const projectionCards = cards.map(toProjectionCard);
    const projectionEvents = eventList.map(toProjectionEvent);
    return projectLoad(projectionCards, rides, { today: TODAY, events: projectionEvents, ftp });
  }, [cards, eventList, rides, ftp]);

  const anchorISO = vm?.skeletonDates[0] ?? null;
  const horizonEndISO = vm?.skeletonDates[vm.skeletonDates.length - 1] ?? null;
  const { range, setRange } = useExplorerRange(activeAthleteId, { todayISO: TODAY, anchorISO, horizonEndISO });

  const indexByDate = useMemo(() => new Map((vm?.skeletonDates ?? []).map((d, i) => [d, i])), [vm]);
  const r0 = range && indexByDate.has(range.fromISO) ? (indexByDate.get(range.fromISO) as number) : 0;
  const r1 = range && indexByDate.has(range.toISO) ? (indexByDate.get(range.toISO) as number) : (vm ? vm.N - 1 : 0);

  const activePreset = useMemo(() => {
    if (!range || !anchorISO || !horizonEndISO) return null;
    for (const p of HERO_PRESETS) {
      const win = presetWindow(p.key, { todayISO: TODAY, anchorISO, horizonEndISO });
      if (win && win.fromISO === range.fromISO && win.toISO === range.toISO) return p.key;
    }
    return null;
  }, [range, anchorISO, horizonEndISO]);

  // Legacy-Anhang: unveränderte Verdrahtung aus dem bisherigen Kennzahlen-Tab.
  const kpis = useMemo(() => buildAnalysisKpis(rides, athleteCfg?.ftpMeasured ?? null, TODAY), [rides, athleteCfg]);
  const loadRows = useMemo(() => buildLoadRows(rides), [rides]);
  const intensity = useMemo(() => buildIntensityDistribution(rides), [rides]);
  const typDist = useMemo(() => buildTypDistribution(rides), [rides]);
  const aerobicCards = useMemo(() => buildAerobicCards(rides, ownPlan), [rides, ownPlan]);
  const powerDiagnostics = useMemo(
    () =>
      buildPowerDiagnostics({
        rides,
        wellness,
        weight: (athleteData?.athleteWeight as number | null | undefined) ?? null,
        ftpMeasured: athleteCfg?.ftpMeasured ?? null,
        ftpMeasuredDate: athleteCfg?.ftpMeasuredDate ?? null,
        ftpGoal: athleteCfg?.ftpGoal ?? null,
        ownPlan,
        retestDateISO: RETEST_DATE,
      }),
    [rides, wellness, athleteData, athleteCfg, ownPlan],
  );
  const records = useMemo(() => buildRecordChips(rides), [rides]);
  const bodyCards = useMemo(() => buildBodyCards(wellness, TODAY, athleteCfg?.ftpMeasured ?? null, athleteCfg?.bmr), [wellness, athleteCfg]);
  const consistency = useMemo(() => buildConsistencySummary(rides, ownPlan ? (cards ?? null) : null, TODAY), [rides, ownPlan, cards]);
  const periodization = useMemo(() => (ownPlan ? buildPeriodization(rides, (w) => weekSortIndex(w, weekIndex)) : null), [rides, ownPlan]);

  if (isLoading || !athleteData) {
    return <p style={{ color: "var(--ink-3)", padding: 40 }}>{error ? "Fehler beim Laden der Trainingsdaten." : "Lädt…"}</p>;
  }

  return (
    <PageShell>
      <div style={{ display: "flex", flexDirection: "column", gap: 26 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 20, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 14 }}>
            <h1 style={{ margin: 0, fontFamily: "var(--font-disp)", fontSize: "1.6rem", fontWeight: 600, color: "var(--text-ink)" }}>Analyse</h1>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: ".66rem", letterSpacing: ".14em", textTransform: "uppercase", color: "var(--text-label)" }}>Antworten &amp; Spuren</span>
          </div>
          <AthleteToggle activeAthleteId={activeAthleteId} onChange={setActiveAthleteId} />
        </div>

        {!vm ? (
          <p style={{ color: "var(--text-soft)" }}>Noch keine ausreichende Belastungshistorie (CTL/ATL) für diese Ansicht.</p>
        ) : (
          <>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <div style={{ marginLeft: "auto", display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                <div style={PILL_ROW_STYLE}>
                  {(["W", "W/kg"] as const).map((u) => (
                    <button
                      key={u}
                      type="button"
                      onClick={() => setUnit(u)}
                      style={{ padding: "6px 13px", borderRadius: "var(--pill)", border: "none", background: unit === u ? "rgba(255,255,255,.16)" : "transparent", color: unit === u ? "var(--text-ink)" : "var(--text-soft)", fontFamily: "var(--font-mono)", fontSize: ".72rem", letterSpacing: ".04em", cursor: "pointer" }}
                    >
                      {u}
                    </button>
                  ))}
                </div>
                {HERO_PRESETS.map((p) => (
                  <button
                    key={p.key}
                    type="button"
                    onClick={() => {
                      if (!anchorISO || !horizonEndISO) return;
                      const win = presetWindow(p.key, { todayISO: TODAY, anchorISO, horizonEndISO });
                      if (win) setRange(win);
                    }}
                    aria-pressed={activePreset === p.key}
                    style={{ padding: "7px 13px", borderRadius: "var(--pill)", border: "1px solid var(--hair)", background: activePreset === p.key ? "rgba(255,255,255,.16)" : "rgba(20,24,34,.62)", backdropFilter: "blur(18px)", color: activePreset === p.key ? "var(--text-ink)" : "var(--text-soft)", fontSize: ".78rem", cursor: "pointer" }}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            <GlassCard variant="strong" radius="22px" style={{ padding: "24px 26px 20px", display: "flex", flexDirection: "column", gap: 18, backdropFilter: "blur(22px)" }}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 28, flexWrap: "wrap" }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 10, maxWidth: "48ch" }}>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: ".62rem", letterSpacing: ".18em", textTransform: "uppercase", color: "var(--text-label)" }}>{vm.hero.readoutDate}</span>
                  <h2 style={{ margin: 0, fontFamily: "var(--font-disp)", fontSize: "1.7rem", fontWeight: 600, letterSpacing: "-.02em", lineHeight: 1.2, color: "var(--text-ink)" }}>{vm.hero.headline}</h2>
                  <p style={{ margin: 0, fontSize: ".92rem", color: "var(--text-soft)", lineHeight: 1.6 }}>{vm.hero.text}</p>
                </div>
                <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
                  {vm.hero.stats.map((s) => (
                    <div key={s.label} style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 92 }}>
                      <span style={{ fontFamily: "var(--font-disp)", fontSize: "1.6rem", fontWeight: 600, color: s.colorVar, fontVariantNumeric: "tabular-nums", lineHeight: 1 }}>{s.value}</span>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: ".6rem", letterSpacing: ".14em", textTransform: "uppercase", color: "var(--text-label)" }}>{s.label}</span>
                      <span style={{ fontSize: ".72rem", color: "var(--text-soft)" }}>{s.sub}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 8, paddingTop: 4, borderTop: "1px solid rgba(255,255,255,.07)" }}>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: ".62rem", letterSpacing: ".16em", textTransform: "uppercase", color: "var(--text-label)" }}>Zeitfenster · Balken ziehen, Ränder greifen</span>
                <BrushBar rides={rides} projection={projection} range={range} onRangeChange={setRange} eventDate={vm.eventDateISO} variant="hero" hidePresets />
              </div>
            </GlassCard>

            {vm.wins.length > 0 && (
              <div style={{ display: "grid", gridTemplateColumns: "190px minmax(0, 1fr)", gap: 20, alignItems: "start", padding: "18px 22px", borderRadius: 20, background: "rgba(14,17,25,.66)", backdropFilter: "blur(22px)", border: "1px solid rgba(111,196,140,.22)" }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <span style={{ fontFamily: "var(--font-disp)", fontSize: "1.05rem", fontWeight: 600, color: "var(--text-ink)" }}>Das läuft</span>
                  <span style={{ fontSize: ".76rem", color: "var(--text-soft)", lineHeight: 1.45 }}>Was du halten solltest.</span>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: "16px 22px" }}>
                  {vm.wins.map((w) => (
                    <div key={w.label} style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                        <span style={{ fontFamily: "var(--font-disp)", fontSize: "1.2rem", fontWeight: 600, color: "var(--role-positive)", fontVariantNumeric: "tabular-nums", lineHeight: 1 }}>{w.value}</span>
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: ".66rem", color: "var(--role-positive)" }}>{w.delta}</span>
                      </div>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: ".6rem", letterSpacing: ".12em", textTransform: "uppercase", color: "var(--text-label)" }}>{w.label}</span>
                      <span style={{ fontSize: ".76rem", color: "var(--text-soft)", lineHeight: 1.45 }}>{w.note}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {vm.groups.map((g) => (
              <section key={g.key} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 14, flexWrap: "wrap" }}>
                  <h2 style={{ margin: 0, fontFamily: "var(--font-disp)", fontSize: "1.2rem", fontWeight: 600, letterSpacing: "-.01em", color: "var(--text-ink)" }}>{g.question}</h2>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 12px", borderRadius: "var(--pill)", background: `color-mix(in srgb, ${g.colorVar} 12%, transparent)`, border: `1px solid color-mix(in srgb, ${g.colorVar} 30%, transparent)` }}>
                    <span style={{ width: 8, height: 8, borderRadius: "var(--pill)", background: g.colorVar }} />
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: ".64rem", letterSpacing: ".1em", textTransform: "uppercase", color: g.colorVar }}>{g.verdict}</span>
                  </div>
                </div>
                <p style={{ margin: 0, fontSize: ".92rem", color: "var(--text-soft)", lineHeight: 1.6, maxWidth: "84ch" }}>{g.answer}</p>

                <TraceCard lanes={g.lanes} r0={r0} r1={r1} todayIdx={vm.todayIdx} eventIdx={vm.eventIdx} formatDay={vm.formatDay} dense={dense} />

                {g.hasPowerCurve && (
                  <PowerCurveTraceCard powerCurves={vm.powerCurves} unit={unit} weightKg={vm.weightKg} formatValue={(v) => (unit === "W/kg" ? fmt(v, 2) : fmtInt(v))} />
                )}
              </section>
            ))}

            <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap", padding: "14px 20px", borderRadius: 18, border: "1px dashed rgba(255,255,255,.14)", background: "rgba(20,24,34,.5)", backdropFilter: "blur(18px)" }}>
              <span style={{ fontSize: ".84rem", color: "var(--text-soft)" }}>Spur anklicken öffnet Legende und Einordnung</span>
              <button
                type="button"
                onClick={() => setDense((d) => !d)}
                style={{ marginLeft: "auto", padding: "7px 15px", borderRadius: "var(--pill)", border: "1px solid var(--hair)", background: "transparent", color: "var(--text-ink)", fontSize: ".78rem", fontWeight: 600, cursor: "pointer" }}
              >
                {dense ? "Spuren höher" : "Spuren kompakter"}
              </button>
            </div>

            <LegacyKpiAppendix
              kpis={kpis}
              loadRows={loadRows}
              intensity={intensity}
              typDist={typDist}
              aerobicCards={aerobicCards}
              powerDiagnostics={powerDiagnostics}
              records={records}
              bodyCards={bodyCards}
              consistency={consistency}
              periodization={periodization}
              ownPlan={ownPlan}
            />
          </>
        )}
      </div>
    </PageShell>
  );
}
