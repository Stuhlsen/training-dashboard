import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AthleteToggle } from "../../components/AthleteToggle";
import { GlassCard } from "../../components/GlassCard";
import { useActiveAthlete } from "../../api/hooks/useActiveAthlete";
import { useExplorerRange } from "../../api/hooks/useExplorerRange";
import { useRides } from "../../api/hooks/useRides";
import { usePlanCards } from "../../api/hooks/usePlanCards";
import { useEvents } from "../../api/hooks/useEvents";
import { localISODate } from "../../core/format.js";
import { projectLoad } from "../../core/projection.js";
import { pmcSkeletonAnchor } from "../../core/days.js";
import { PLAN2_SCHEDULE } from "../../core/plan2-schedule.js";
import { PRIMARY_ATHLETE_ID } from "../../config";
import { resolvePlanningFtp } from "../planning/planning-view-model";
import { PmcChart } from "../../charts/PmcChart";
import { BrushBar } from "../../charts/BrushBar";
import type { EventItem, PlanCard as PlanCardT } from "../../api/types";

type Ride = import("../../types.js").Ride;

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

export function ExplorerPage() {
  const navigate = useNavigate();
  const { activeAthleteId, setActiveAthleteId } = useActiveAthlete();
  const { data: rideData } = useRides(activeAthleteId);
  const { data: cards } = usePlanCards(activeAthleteId);
  const { data: events } = useEvents(activeAthleteId);

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

  const rides = (rideData?.rides as Ride[] | undefined) ?? [];

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

  function handleSelectDate(dateISO: string) {
    navigate("/planning", { state: { highlightDate: dateISO } });
  }

  return (
    <div style={{ maxWidth: 880, margin: "0 auto", padding: "48px 24px", display: "flex", flexDirection: "column", gap: 24 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 20, flexWrap: "wrap" }}>
        <h1 style={{ margin: 0, fontFamily: "var(--font-disp)", fontSize: "1.6rem", fontWeight: 600, color: "var(--ink)" }}>
          Explorer
        </h1>
        <AthleteToggle activeAthleteId={activeAthleteId} onChange={setActiveAthleteId} />
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
        <PmcChart
          rides={rides}
          projection={projection}
          range={range}
          hoveredDate={hoveredDate}
          onHoverChange={setHoveredDate}
          onSelectDate={handleSelectDate}
        />
      </GlassCard>
    </div>
  );
}
