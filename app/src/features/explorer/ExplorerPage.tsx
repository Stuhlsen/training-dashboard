import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { AthleteToggle } from "../../components/AthleteToggle";
import { GlassCard } from "../../components/GlassCard";
import { PageShell } from "../../components/PageShell";
import { useActiveAthlete } from "../../api/hooks/useActiveAthlete";
import { useExplorerRange } from "../../api/hooks/useExplorerRange";
import { useExplorerScenario } from "../../api/hooks/useExplorerScenario";
import { useExplorerCompare } from "../../api/hooks/useExplorerCompare";
import { useRides } from "../../api/hooks/useRides";
import { usePlanCards } from "../../api/hooks/usePlanCards";
import { useEvents } from "../../api/hooks/useEvents";
import { localISODate } from "../../core/format.js";
import { projectLoad } from "../../core/projection.js";
import { buildScenario } from "../../core/scenario.js";
import { buildCompare } from "../../core/compare.js";
import { pmcSkeletonAnchor } from "../../core/days.js";
import { PLAN2_SCHEDULE } from "../../core/plan2-schedule.js";
import {
  weeklyVolumeAvailable,
  zoneWeeklyAvailable,
  powerCurveAvailable,
  efficiencyAvailable,
  speedHrScatterAvailable,
  cadenceAvailable,
  hrTrendAvailable,
  decouplingAvailable,
  wellnessChartAvailable,
  sleepAvailable,
  weatherWeeklyAvailable,
  energyWeightAvailable,
  tempoAvailable,
  trimpAvailable,
  hydrationAvailable,
  countEmpty,
} from "../../core/chart-availability.js";
import { athleteConfig, PRIMARY_ATHLETE_ID, RETEST_DATE } from "../../config";
import { resolvePlanningFtp } from "../planning/planning-view-model";
import { PmcChart } from "../../charts/PmcChart";
import { BrushBar } from "../../charts/BrushBar";
import { WhatIfPanel } from "../../charts/WhatIfPanel";
import { CompareChart } from "../../charts/CompareChart";
import { ComparePanel } from "../../charts/ComparePanel";
import { PowerCurveChart } from "../../charts/PowerCurveChart";
import { WeeklyVolumeChart } from "../../charts/WeeklyVolumeChart";
import { FtpForecastChart } from "../../charts/FtpForecastChart";
import { EfficiencyChart } from "../../charts/EfficiencyChart";
import { DecouplingChart } from "../../charts/DecouplingChart";
import { CadenceChart } from "../../charts/CadenceChart";
import { SpeedHrScatterChart } from "../../charts/SpeedHrScatterChart";
import { HrTrendChart } from "../../charts/HrTrendChart";
import { ZoneWeeklyChart } from "../../charts/ZoneWeeklyChart";
import { WeatherWeeklyChart } from "../../charts/WeatherWeeklyChart";
import { SleepChart } from "../../charts/SleepChart";
import { EnergyWeightChart } from "../../charts/EnergyWeightChart";
import { WellnessChart, type WellnessMetric } from "../../charts/WellnessChart";
import { TempoTrendChart } from "../../charts/TempoTrendChart";
import { TrimpLoadChart } from "../../charts/TrimpLoadChart";
import { HydrationChart } from "../../charts/HydrationChart";
import type { EventItem, PlanCard as PlanCardT } from "../../api/types";

type Ride = import("../../types.js").Ride;
type WellnessDay = import("../../types.js").WellnessDay;

const TODAY = localISODate();

/* Adapter wie in PlanningPage.tsx::toProjectionCard/toProjectionEvent —
   hier lokal dupliziert statt importiert, weil sie dort nicht exportiert
   sind und die beiden Feature-Ordner sonst unnötig aneinander koppeln
   würden (nur `resolvePlanningFtp` ist als geteilte Ableitung gedacht,
   s. Kommentar unten). */
function toProjectionCard(c: PlanCardT) {
  return {
    id: c.id,
    date: c.date,
    typ: c.typ,
    phase: c.phase,
    cancelled: c.cancelled,
    tssPlanned: c.tssPlanned,
    workout: c.workout as object | null,
  };
}

function toProjectionEvent(e: EventItem) {
  return { eventDate: e.eventDate, title: e.title, type: e.type, priority: e.priority ?? undefined };
}

const SECTION_HEADER_STYLE = {
  fontSize: ".7rem",
  letterSpacing: ".14em",
  textTransform: "uppercase" as const,
  color: "var(--ink-3)",
  fontWeight: 600,
  marginBottom: 12,
};

/** Port von ui/chart-visibility.js::apply() — blendet eine Chart-Karte aus,
 *  wenn der aktive Athlet keine Daten für sie hat, außer der Umschalter
 *  (`showEmpty`) ist an. Kein separater Platzhaltertext nötig (anders als
 *  Vanillas `_placeholder()`): jede React-Chart-Komponente zeigt bereits
 *  selbst einen "nicht genug Daten"-Empty-State, wenn sie mit leeren/
 *  unzureichenden Daten gerendert wird. */
function ChartSection({ title, available, showEmpty, children }: { title: string; available: boolean; showEmpty: boolean; children: ReactNode }) {
  if (!available && !showEmpty) return null;
  return (
    <GlassCard style={{ padding: 20 }}>
      <div style={SECTION_HEADER_STYLE}>{title}</div>
      {children}
    </GlassCard>
  );
}

export function ExplorerPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { activeAthleteId, setActiveAthleteId } = useActiveAthlete();
  const { data: rideData } = useRides(activeAthleteId);
  const { data: cards } = usePlanCards(activeAthleteId);
  const { data: events } = useEvents(activeAthleteId);
  const athleteCfg = athleteConfig(activeAthleteId);

  // resolvePlanningFtp vereinfacht bewusst ggü. Data.ftpValue() (Begründung:
  // planning-view-model.ts:227-231, "keine kritische Anzeigezahl" — dort
  // steuert der Wert nur ein Label). Hier fließt derselbe FTP-Wert direkt in
  // projectLoad()s TSS-Schätzung und damit in die geplottete CTL/ATL/TSB-
  // Kurve ein — ein spürbarerer Verbrauch derselben Vereinfachung, für 8a
  // aber kein Blocker (Etappe-8a-Plan, Q5).
  const ftp = resolvePlanningFtp(activeAthleteId, rideData?.athleteFtp ?? null);

  const projection = useMemo(() => {
    const projectionCards = (cards ?? []).map(toProjectionCard);
    const projectionEvents = (events ?? []).map(toProjectionEvent);
    const rides = (rideData?.rides as Ride[] | undefined) ?? [];
    return projectLoad(projectionCards, rides, { today: TODAY, events: projectionEvents, ftp });
  }, [cards, events, rideData, ftp]);

  // Gememoized (nicht wie zuvor ein frischer `?? []`-Fallback pro Render) —
  // Etappe 8e braucht `rides` erstmals als useMemo-Abhängigkeit
  // (`compareResult` unten); ohne stabile Referenz würde das bei jedem
  // Render neu rechnen, solange `rideData?.rides` undefined ist
  // (react-hooks/exhaustive-deps-Warnung).
  const rides = useMemo(() => (rideData?.rides as Ride[] | undefined) ?? [], [rideData]);
  const wellness = useMemo(() => (rideData?.wellness as WellnessDay[] | undefined) ?? [], [rideData]);
  // Wie AnalysisPage.tsx::ownPlan — Athlet 2s Fahrten tragen bewusst kein
  // `week` (AGENTS.md "Bekannte Eigenheiten"), deshalb kein belastbarer
  // Retest-Termin für die Prognose-Fächer im FTP-Chart.
  const ownPlan = useMemo(() => rides.some((r) => r.week), [rides]);

  // Bounds für Brush + Presets (Etappe 8b, docs/phase-5-konzept-explorer.md
  // §4): "Plan 2" ergibt nur für Athlet 1 Sinn (Athlet 2 hat GFNY Bremen als
  // eigenständigen Plan ohne "Plan 2"-Bezug, s. AGENTS.md "Bekannte
  // Eigenheiten"), deshalb hier athletenscoped statt global.
  const anchorISO = pmcSkeletonAnchor(rides);
  const horizonEndISO = projection?.horizonEnd ?? null;
  const plan2StartISO = activeAthleteId === PRIMARY_ATHLETE_ID ? (PLAN2_SCHEDULE[0]?.start ?? null) : null;

  const { range, setRange } = useExplorerRange(activeAthleteId, { todayISO: TODAY, anchorISO, horizonEndISO });

  // Cursor-Sync + Klick-Sprung (Etappe 8c, docs/phase-5-konzept-explorer.md
  // §3) — `hoveredDate` lebt hier (Lift-State-Up wie `range`/`setRange`),
  // damit PmcChart und BrushBar dieselbe Quelle teilen. Kein localStorage:
  // Hover ist flüchtig, wie `hoveredDate` in assets/js/state/chart-view.js.
  const [hoveredDate, setHoveredDate] = useState<string | null>(null);

  // Rückrichtung Fahrtenbuch → PMC-Crosshair (Etappe 11b) — Port von
  // assets/js/state/chart-view.js::setSelected() (dort ein persistenter
  // Cross-Tab-Pin). In der Routing-Welt hier stattdessen dasselbe
  // `location.state.highlightDate`-Sprungmuster wie handleSelectDate oben
  // (→ PlanningPage): ein einmaliges Setzen von `hoveredDate` beim Landen
  // auf dieser Seite, kein dauerhafter Pin über einen globalen Store — der
  // nächste eigene Hover überschreibt es ganz normal. Liegt das Datum
  // außerhalb des aktuell sichtbaren Brush-Fensters, passiert nichts
  // (stiller No-op, wie beim Planungstab-Sprung bei fehlender Karte).
  //
  // "Zustand während des Renderns anpassen"-Muster (wie deltaBanner-
  // Reset in PlanningPage.tsx) statt setHoveredDate() in einem Effekt —
  // vermeidet den kaskadierenden Re-Render, den react-hooks/set-state-
  // in-effect zurecht verbietet. Nur das Räumen des Router-State (echter
  // externer Seiteneffekt, kein lokales setState) bleibt im Effekt.
  const highlightDate = (location.state as { highlightDate?: string } | null)?.highlightDate ?? null;
  const [handledHighlight, setHandledHighlight] = useState<string | null>(null);
  if (highlightDate !== handledHighlight && range) {
    setHandledHighlight(highlightDate);
    if (highlightDate && highlightDate >= range.fromISO && highlightDate <= range.toISO) {
      setHoveredDate(highlightDate);
    }
  }
  useEffect(() => {
    if (highlightDate && handledHighlight === highlightDate) {
      navigate(location.pathname, { replace: true, state: null });
    }
  }, [highlightDate, handledHighlight, location.pathname, navigate]);

  // Wellness-Metrik-Umschalter (Etappe 8f, §3 im Plan) — flüchtiger UI-
  // Zustand wie `hoveredDate`, kein localStorage.
  const [wellnessMetric, setWellnessMetric] = useState<WellnessMetric>("hrv");

  // What-if-Szenario (Etappe 8d, §6) — Port von assets/js/state/chart-view.js
  // ::recomputeScenario(), hier als reine Ableitung statt injizierter
  // Provider (Begründung: useExplorerScenario.ts-Kopfkommentar). Läuft nur,
  // wenn `scenario.enabled` — kein Recompute-Overhead für "aus" (gleiche
  // Kurzschluss-Logik wie im Vanilla-Original).
  const { scenario, setScenarioParams, setScenarioEnabled } = useExplorerScenario(activeAthleteId);
  const scenarioProjection = useMemo(() => {
    if (!scenario.enabled) return null;
    const projectionCards = (cards ?? []).map(toProjectionCard);
    const projectionEvents = (events ?? []).map(toProjectionEvent);
    const scenarioRides = (rideData?.rides as Ride[] | undefined) ?? [];
    const { cards: syntheticCards, uncertainCardIds } = buildScenario(projectionCards, scenario, { ftp });
    const proj = projectLoad(syntheticCards, scenarioRides, { events: projectionEvents, ftp });
    return {
      ...proj,
      days: proj.days.map((d) =>
        !d.uncertain && d.cardIds.some((id: string) => uncertainCardIds.has(id)) ? { ...d, uncertain: true } : d,
      ),
    };
  }, [scenario, cards, events, rideData, ftp]);

  // Vergleichsmodus (Etappe 8e, §5) — Port von assets/js/state/chart-view.js
  // ::compareSlots + ui/charts/pmc.js::drawCompareView. `buildCompare()`
  // (core/compare.js) wird wie im Vanilla-Original NICHT im Hook, sondern
  // hier bei jedem Render mit den aktuellen Rides neu aufgerufen (kein
  // gecachtes Ableitungsergebnis wie `scenarioProjection`) — buildCompare
  // ist billig (kein projectLoad()) und braucht keine injizierten Quellen.
  // "Als A/B merken" übernimmt das aktuelle Brush-Fenster direkt als ISO-
  // Bereich — anders als vanilla (das ws/we-Tagesindizes über das zuletzt
  // gezeichnete PMC-Skelett zurückrechnet) ist `range` hier bereits ISO.
  const { compareSlots, setCompareSlot, setCompareEnabled } = useExplorerCompare(activeAthleteId);
  const compareResult = useMemo(() => buildCompare(rides, compareSlots.a, compareSlots.b), [rides, compareSlots]);
  const compareActive = compareSlots.enabled && !!compareSlots.a && !!compareSlots.b;

  function handleSaveCompareSlot(slot: "a" | "b") {
    if (!range) return;
    setCompareSlot(slot, { from: range.fromISO, to: range.toISO });
  }

  function handleSelectDate(dateISO: string) {
    navigate("/planning", { state: { highlightDate: dateISO } });
  }

  // Chart-Sichtbarkeit (Fahrplan 1 V1, Port von ui/chart-visibility.js) —
  // flüchtiger Seitenzustand wie Vanillas ChartVisibility.showEmpty, kein
  // localStorage. Belastung-Karte und FTP-Prognose sind bewusst NICHT Teil
  // dieser Prüfung, s. core/chart-availability.js-Kopfkommentar.
  const [showEmpty, setShowEmpty] = useState(false);
  const powerCurves = rideData?.powerCurves;
  const availability = {
    weeklyVolume: weeklyVolumeAvailable(rides),
    zoneWeekly: zoneWeeklyAvailable(rides),
    powerCurve: powerCurveAvailable(powerCurves),
    efficiency: efficiencyAvailable(rides),
    speedHrScatter: speedHrScatterAvailable(rides),
    cadence: cadenceAvailable(rides),
    hrTrend: hrTrendAvailable(rides),
    decoupling: decouplingAvailable(rides),
    wellnessChart: wellnessChartAvailable(wellness),
    sleep: sleepAvailable(wellness),
    weatherWeekly: weatherWeeklyAvailable(rides),
    energyWeight: energyWeightAvailable(wellness),
    tempo: tempoAvailable(rides),
    trimp: trimpAvailable(rides),
    hydration: hydrationAvailable(wellness),
  };
  const emptyChartCount = countEmpty(Object.values(availability));

  return (
    <PageShell>
    <div style={{ maxWidth: 880, margin: "0 auto", display: "flex", flexDirection: "column", gap: 24 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 20, flexWrap: "wrap" }}>
        <h1 style={{ margin: 0, fontFamily: "var(--font-disp)", fontSize: "1.6rem", fontWeight: 600, color: "var(--ink)" }}>
          Explorer
        </h1>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button
            type="button"
            aria-pressed={showEmpty}
            onClick={() => setShowEmpty((v) => !v)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "6px 14px",
              borderRadius: "var(--pill)",
              border: "1px solid var(--hair)",
              background: showEmpty ? "var(--glass-2)" : "transparent",
              color: "var(--ink-2)",
              fontSize: ".78rem",
              cursor: "pointer",
            }}
          >
            {showEmpty ? "Leere Charts ausblenden" : "Leere Charts einblenden"}
            <span style={{ fontSize: ".7rem", fontWeight: 600, color: emptyChartCount > 0 ? "var(--ink)" : "var(--ink-3)" }}>
              {emptyChartCount}
            </span>
          </button>
          <AthleteToggle activeAthleteId={activeAthleteId} onChange={setActiveAthleteId} />
        </div>
      </div>

      <GlassCard style={{ padding: 20 }}>
        <div
          style={{
            fontSize: ".7rem",
            letterSpacing: ".14em",
            textTransform: "uppercase",
            color: "var(--ink-3)",
            fontWeight: 600,
            marginBottom: 12,
          }}
        >
          Belastung — CTL / ATL / TSB
        </div>
        <BrushBar
          rides={rides}
          projection={projection}
          range={range}
          onRangeChange={setRange}
          plan2StartISO={plan2StartISO}
          hoveredDate={hoveredDate}
        />
        <div style={{ height: 20 }} />
        {compareActive ? (
          <CompareChart result={compareResult} />
        ) : (
          <PmcChart
            rides={rides}
            projection={projection}
            range={range}
            hoveredDate={hoveredDate}
            onHoverChange={setHoveredDate}
            onSelectDate={handleSelectDate}
            scenarioProjection={scenarioProjection}
          />
        )}
        <div style={{ height: 1, background: "var(--hair)", margin: "20px 0" }} />
        <WhatIfPanel scenario={scenario} onParamsChange={setScenarioParams} onEnabledChange={setScenarioEnabled} />
        <div style={{ height: 1, background: "var(--hair)", margin: "20px 0" }} />
        <ComparePanel
          enabled={compareSlots.enabled}
          onEnabledChange={setCompareEnabled}
          slotA={compareSlots.a}
          slotB={compareSlots.b}
          metricsA={compareResult.a.metrics}
          metricsB={compareResult.b.metrics}
          compareActive={compareActive}
          onSaveSlot={handleSaveCompareSlot}
          canSave={!!range}
        />
      </GlassCard>

      <GlassCard style={{ padding: 20 }}>
        <div
          style={{
            fontSize: ".7rem",
            letterSpacing: ".14em",
            textTransform: "uppercase",
            color: "var(--ink-3)",
            fontWeight: 600,
            marginBottom: 12,
          }}
        >
          FTP-Prognose
        </div>
        <FtpForecastChart rides={rides} wellness={wellness} ftpGoal={athleteCfg?.ftpGoal ?? null} ownPlan={ownPlan} retestDateISO={RETEST_DATE} />
      </GlassCard>

      <ChartSection title="Aerobe Effizienz" available={availability.efficiency} showEmpty={showEmpty}>
        <EfficiencyChart rides={rides} />
      </ChartSection>

      <ChartSection title="Aerobe Entkopplung" available={availability.decoupling} showEmpty={showEmpty}>
        <DecouplingChart rides={rides} />
      </ChartSection>

      <ChartSection title="Kadenz-Coach" available={availability.cadence} showEmpty={showEmpty}>
        <CadenceChart rides={rides} ownPlan={ownPlan} />
      </ChartSection>

      <ChartSection title="Tempo vs. Herzfrequenz" available={availability.speedHrScatter} showEmpty={showEmpty}>
        <SpeedHrScatterChart rides={rides} />
      </ChartSection>

      <ChartSection title="Ø Tempo · Entwicklung" available={availability.tempo} showEmpty={showEmpty}>
        <TempoTrendChart rides={rides} />
      </ChartSection>

      <ChartSection title="Ø-Herzfrequenz" available={availability.hrTrend} showEmpty={showEmpty}>
        <HrTrendChart rides={rides} />
      </ChartSection>

      <ChartSection title="Zeit in Zonen" available={availability.zoneWeekly} showEmpty={showEmpty}>
        <ZoneWeeklyChart rides={rides} />
      </ChartSection>

      <ChartSection title="Belastungswächter" available={availability.trimp} showEmpty={showEmpty}>
        <TrimpLoadChart rides={rides} />
      </ChartSection>

      <ChartSection title="Wetter" available={availability.weatherWeekly} showEmpty={showEmpty}>
        <WeatherWeeklyChart rides={rides} />
      </ChartSection>

      <ChartSection title="Schlaf" available={availability.sleep} showEmpty={showEmpty}>
        <SleepChart wellness={wellness} ownPlan={ownPlan} />
      </ChartSection>

      <ChartSection title="Energie & Gewicht" available={availability.energyWeight} showEmpty={showEmpty}>
        <EnergyWeightChart wellness={wellness} bmr={athleteCfg?.bmr} />
      </ChartSection>

      <ChartSection title="Hydration" available={availability.hydration} showEmpty={showEmpty}>
        <HydrationChart wellness={wellness} />
      </ChartSection>

      <ChartSection title="Power-Curve" available={availability.powerCurve} showEmpty={showEmpty}>
        <PowerCurveChart powerCurves={rideData?.powerCurves} ftp={ftp} />
      </ChartSection>

      <ChartSection title="Wochenvolumen" available={availability.weeklyVolume} showEmpty={showEmpty}>
        <WeeklyVolumeChart rides={rides} />
      </ChartSection>

      <ChartSection title="Wellness" available={availability.wellnessChart} showEmpty={showEmpty}>
        <WellnessChart
          rides={rides}
          wellness={(rideData?.wellness as WellnessDay[] | undefined) ?? []}
          metric={wellnessMetric}
          onMetricChange={setWellnessMetric}
        />
      </ChartSection>
    </div>
    </PageShell>
  );
}
