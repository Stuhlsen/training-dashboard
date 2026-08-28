import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  pointerWithin,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { useQueryClient } from "@tanstack/react-query";
import { GlassCard } from "../../components/GlassCard";
import { PageShell } from "../../components/PageShell";
import { isReadOnlyAthlete } from "../../config";
import { useActiveAthlete } from "../../api/hooks/useActiveAthlete";
import { useCanWriteForAthlete } from "../../api/hooks/useWriteAuthorization";
import { useTrainerContext } from "../../api/hooks/useTrainerContext";
import { useEvents } from "../../api/hooks/useEvents";
import { useRides } from "../../api/hooks/useRides";
import {
  useCancelPlanCard,
  useMovePlanCard,
  usePlanCards,
  usePushPlanCard,
  useUndoAdjustment,
} from "../../api/hooks/usePlanCards";
import { useCreateTrainerProposal } from "../../api/hooks/useProposals";
import { qk } from "../../api/keys";
import { fmtDate, localISODate } from "../../core/format.js";
import { resolveDrop } from "../../core/plan-drag.js";
import { detectConflicts } from "../../core/conflicts.js";
import { projectLoad } from "../../core/projection.js";
import { weekDisplayLabels } from "../../core/week-labels.js";
import { moveProposalArgs, cancelProposalArgs } from "../../core/proposal-payload.js";
import { DeltaBanner } from "./DeltaBanner";
import { computeDeltaBanner, type DeltaBannerState } from "./planning-delta";
import { PlanCardForm } from "./PlanCardForm";
import { ExportImportBar } from "./ExportImportBar";
import { BlockDialogGate } from "./BlockDialog";
import { ProposalBanner } from "./ProposalBanner";
import { ProposalList } from "./ProposalList";
import { ProposalCompare } from "./ProposalCompare";
import { TrainerBar } from "./TrainerBar";
import { isTrainerProposalMode, type SaveMode } from "./trainer-bar-view-model";
import { WeekGrid } from "./WeekGrid";
import { WeekGridDetailRow } from "./WeekGridDetailRow";
import { buildWeekGrid } from "./week-grid-view-model";
import { DoneTable } from "./DoneTable";
import { DoneDetailChart } from "./DoneDetailChart";
import { useIntervalsCredentials } from "../../api/hooks/useIntervalsCredentials";
import { buildDoneRows, gapsChips, planFidelitySummary } from "./done-table-view-model";
import {
  buildPlanningSections,
  computePlanningDerivedSets,
  matchRideForCard,
  resolvePlanningFtp,
  typeColor,
  typeIcon,
  type PlannedSessionRef,
} from "./planning-view-model";
import type { EventItem, PlanCard as PlanCardT, Proposal, Result } from "../../api/types";

type Ride = import("../../types.js").Ride;
type WellnessDay = import("../../types.js").WellnessDay;

const TODAY = localISODate();

type DialogState = "closed" | "new" | PlanCardT;

/** core/projection.js::projectLoad + core/conflicts.js::detectConflicts sind
 *  reine JS-Module mit JSDoc-Typen (`checkJs` bleibt repoweit aus, s.
 *  app/src/core/README.md) — beim Aufruf aus TS passen `PlanCard.workout`
 *  (`unknown`) und `EventItem.priority` (`string | null`) nicht exakt auf die
 *  inferrierten Parametertypen. Schmale, lokale Adapter statt eines
 *  pauschalen `as any` am Call-Standort. */
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

const SECTION_TITLE_STYLE: React.CSSProperties = {
  fontSize: ".7rem",
  letterSpacing: ".14em",
  textTransform: "uppercase",
  color: "var(--ink-3)",
  fontWeight: 600,
};

export function PlanningPage() {
  const queryClient = useQueryClient();
  const location = useLocation();
  const navigate = useNavigate();
  const { activeAthleteId } = useActiveAthlete();
  const { data: cards, isLoading, error } = usePlanCards(activeAthleteId);
  const { data: rideData } = useRides(activeAthleteId);
  const { data: events } = useEvents(activeAthleteId);
  const { canWrite } = useCanWriteForAthlete(activeAthleteId);
  const { isTrainer } = useTrainerContext(activeAthleteId);

  const { move } = useMovePlanCard(activeAthleteId);
  const { cancel } = useCancelPlanCard(activeAthleteId);
  const { undo } = useUndoAdjustment(activeAthleteId);
  const { push } = usePushPlanCard(activeAthleteId);
  const { create: createTrainerProposal } = useCreateTrainerProposal(activeAthleteId);
  // Trainer sehen weder den Push-Button (s. canPush unten) noch den
  // Rausch-Chart — die eigenen intervals.icu-Zugangsdaten des Trainers
  // (falls vorhanden) gehören nicht zum gerade angezeigten Athleten.
  const { credentials: intervalsCredentialsRaw } = useIntervalsCredentials();
  const intervalsCredentials = isTrainer ? null : intervalsCredentialsRaw;

  const [dialog, setDialog] = useState<DialogState>("closed");
  const [activeId, setActiveId] = useState<string | null>(null);
  // Etappe 7b: Liste unabhängig von der Vergleichsansicht offen halten —
  // "Vergleichen…" öffnet die Vergleichsansicht ÜBER der weiterhin
  // sichtbaren Liste (höherer z-index), wie ui/proposal-compare.js über
  // ui/proposal-list.js.
  const [proposalListOpen, setProposalListOpen] = useState(false);
  const [compareProposal, setCompareProposal] = useState<Proposal | null>(null);
  // Etappe 7a: Default "proposal" (Trainer-Sicht-Konzept §5, konservative
  // Vorgabe) — reiner Session-State, kein Reset bei Athletenwechsel, keine
  // Persistenz (spiegelt Vanillas modul-globale state/trainer-view.js::saveMode).
  const [saveMode, setSaveMode] = useState<SaveMode>("proposal");
  const trainerProposalMode = isTrainerProposalMode(isTrainer, saveMode);

  // useMemo, weil buildPlanningSections() mehrere Filter-/Sort-Durchläufe +
  // Set/Map-Aufbau macht — ohne das liefe die Berechnung bei jedem
  // Drag-Start/-Ende (setActiveId) und Dialog-Öffnen/-Schließen (setDialog)
  // unnötig neu, obwohl cards/rideData dabei unverändert bleiben. `rides`
  // steckt bewusst MIT im Callback (nicht als eigene Variable davor) — der
  // `?? []`-Fallback erzeugt sonst bei jedem Render ein neues Array und
  // würde die Memoisierung selbst wieder aushebeln.
  //
  // computePlanningDerivedSets() (doneDates/recoveryWeeks) EINMAL geteilt
  // zwischen sections UND weekGrid unten — beide bräuchten sonst dieselbe
  // Set-/Gruppierungs-Berechnung doppelt pro Render-Zyklus.
  const derivedSets = useMemo(() => {
    const rides = (rideData?.rides as Ride[] | undefined) ?? [];
    return computePlanningDerivedSets(cards ?? [], rides);
  }, [cards, rideData]);
  const sections = useMemo(() => {
    const rides = (rideData?.rides as Ride[] | undefined) ?? [];
    return buildPlanningSections(cards ?? [], rides, TODAY, derivedSets);
  }, [cards, rideData, derivedSets]);
  // Athlet 2 bleibt bewusst read-only (reiner Vergleichsathlet, s. AGENTS.md).
  // Sonst entscheidet allein die Autorisierung: `canWrite` deckt Self +
  // Trainer + Admin ab, Trainer speichern über den Vorschlagspfad
  // (trainerProposalMode). Athlet 4 ("Bentastiic") ist damit editierbar,
  // wenn als er selbst eingeloggt.
  const editable = canWrite && !isReadOnlyAthlete(activeAthleteId);
  const activeCard = (cards ?? []).find((c) => c.id === activeId) ?? null;

  const ftp = resolvePlanningFtp(activeAthleteId, rideData?.athleteFtp ?? null);

  // Etappe 6c: entspricht Vanillas state/plan-cards.js::recomputeProjection()
  // (dort Modul-State, hier reine Ableitung aus dem React-Query-Cache).
  // Grundlage für Wirkungsanzeige (cardImpact), Delta-Banner und
  // Konflikt-Badges — core/projection.js/core/conflicts.js sind bereits
  // seit Etappe 2a portiert und getestet, hier nur verdrahtet.
  const { projection, conflicts } = useMemo(() => {
    const rides = (rideData?.rides as Ride[] | undefined) ?? [];
    const projectionCards = (cards ?? []).map(toProjectionCard);
    const projectionEvents = (events ?? []).map(toProjectionEvent);
    const projection = projectLoad(projectionCards, rides, { today: TODAY, events: projectionEvents, ftp });
    const conflicts = detectConflicts(projection, projectionCards, projectionEvents, rides, {
      athleteId: activeAthleteId,
    });
    return { projection, conflicts };
  }, [cards, rideData, events, ftp, activeAthleteId]);

  const doneRides = useMemo(
    () => new Map(sections.done.map((c) => [c.id, matchRideForCard((rideData?.rides as Ride[] | undefined) ?? [], c, editable)])),
    [sections.done, rideData, editable],
  );

  // Etappe 13a: einheitliche Kalenderstruktur (alle Wochen mit ≥1 Karte,
  // Vergangenheit UND Zukunft) fürs Mo–So-Raster — ersetzt sections.weeks
  // als Datenquelle des Rasters, buildPlanningSections() bleibt weiter
  // Grundlage der Fortschritts-Statistik/Done-Liste oben.
  const weekGrid = useMemo(() => {
    const rides = (rideData?.rides as Ride[] | undefined) ?? [];
    return buildWeekGrid(cards ?? [], rides, TODAY, activeAthleteId, derivedSets);
  }, [cards, rideData, activeAthleteId, derivedSets]);

  // Etappe 13d: Soll/Ist-Tabellen-Projektion über sections.done — berechnet
  // nichts neu, reicht nur Zahlen aus buildDoneCompareRows()/visibleCompliance()
  // durch (s. done-table-view-model.ts Kopfkommentar).
  const doneTableRows = useMemo(
    () => buildDoneRows(sections.done, doneRides, editable),
    [sections.done, doneRides, editable],
  );
  const fidelity = useMemo(
    () => planFidelitySummary(sections.done, doneRides, TODAY),
    [sections.done, doneRides],
  );
  const gaps = useMemo(() => gapsChips(sections.missed, sections.cancelled), [sections.missed, sections.cancelled]);

  const forecast = (rideData?.forecast as Record<string, unknown> | undefined) ?? {};
  const wellness = (rideData?.wellness as WellnessDay[] | undefined) ?? [];
  const plannedSessions = (rideData?.plannedSessions as PlannedSessionRef[] | undefined) ?? [];
  // Für TrainerBar (Etappe 7a) — die beiden useMemo-Blöcke oben halten ihr
  // eigenes, lokal geshadowtes `rides` bewusst unverändert, daher hier ein
  // eigener Name statt einer dritten Ableitung derselben Quelle.
  const allRides = (rideData?.rides as Ride[] | undefined) ?? [];
  // Für ExportImportBar (Etappe 7c) — Bestwerte-Vergleich im Briefing
  // (core/progress-indicators.js::bestEffortComparison).
  const powerCurveBlocks =
    (rideData?.powerCurveBlocks as Array<{ key: string; curve?: object | null }> | undefined) ?? [];

  // Etappe 6c: Vorher/Nachher-Vergleich nach Verschieben/Ausfallen/Drag,
  // Port von ui/planned.js::_recordDelta (dort Modul-State `deltaBanner` +
  // `deltaBannerAthleteId`). Persistent bis manuell geschlossen, verworfen
  // bei Athletenwechsel — als "State während des Renderns anpassen" statt
  // Effekt (kein separater Rendertakt nötig, React verwirft den
  // Zwischenstand selbst: https://react.dev/learn/you-might-not-need-an-effect).
  const [deltaBanner, setDeltaBanner] = useState<DeltaBannerState | null>(null);
  const [deltaBannerAthleteId, setDeltaBannerAthleteId] = useState(activeAthleteId);
  if (activeAthleteId !== deltaBannerAthleteId) {
    setDeltaBannerAthleteId(activeAthleteId);
    setDeltaBanner(null);
  }

  // Klick-Sprung aus dem Explorer (Etappe 8c, docs/phase-5-konzept-explorer.md
  // §3) — Port von assets/js/ui/planned.js::scrollToDate. `highlightedRef`
  // sorgt dafür, dass derselbe Sprung nicht bei jedem Re-Render erneut
  // ausgeführt wird; der Router-State wird danach geräumt, damit ein
  // Zurück-Navigieren auf diese Seite den Sprung nicht wiederholt. Kein
  // Fehlerfall, wenn keine Karte zum Datum existiert (stiller No-op, wie im
  // Vanilla-Vorbild).
  const highlightDate = (location.state as { highlightDate?: string } | null)?.highlightDate ?? null;
  const highlightedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!highlightDate || isLoading || highlightedRef.current === highlightDate) return;
    highlightedRef.current = highlightDate;
    const target = document.querySelector<HTMLElement>(`[data-plan-card-date="${highlightDate}"]`);
    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "center" });
      target.classList.add("row-highlight");
      setTimeout(() => target.classList.remove("row-highlight"), 2500);
    }
    navigate(location.pathname, { replace: true, state: null });
  }, [highlightDate, isLoading, location.pathname, navigate]);

  /** Nach einer erfolgreichen Mutation ist der React-Query-Cache bereits
   *  aktualisiert (onSuccess läuft vor dem mutateAsync-Resolve) — der frische
   *  Kartenstand kommt deshalb direkt aus dem Cache (wie useCardsSnapshot in
   *  usePlanCards.ts), nicht aus der u.U. noch alten `cards`-Closure-Variable. */
  function recordDelta(cardDateIso?: string) {
    const freshCards = queryClient.getQueryData<PlanCardT[]>(qk.planCards(activeAthleteId)) ?? [];
    const rides = (rideData?.rides as Ride[] | undefined) ?? [];
    const afterProjection = projectLoad(freshCards.map(toProjectionCard), rides, {
      today: TODAY,
      events: (events ?? []).map(toProjectionEvent),
      ftp,
    });
    setDeltaBanner(computeDeltaBanner(projection, afterProjection, events ?? [], TODAY, cardDateIso));
  }

  // Etappe 7a: im Vorschlagsmodus erzeugt ein Trainer über
  // createTrainerProposal(moveProposalArgs/cancelProposalArgs(...)) einen
  // proposals-Eintrag statt die Karte direkt zu ändern — kein Delta-Banner,
  // weil sich der tatsächliche Planzustand dabei nicht ändert.
  async function handleMove(id: string, date: string, reason?: string): Promise<Result> {
    if (trainerProposalMode) {
      const card = (cards ?? []).find((c) => c.id === id) ?? null;
      return createTrainerProposal(moveProposalArgs(card, date, reason));
    }
    const result = await move(id, date, reason);
    if (result.ok) recordDelta(date);
    return result;
  }

  async function handleCancel(id: string, reason?: string): Promise<Result> {
    const cardDate = (cards ?? []).find((c) => c.id === id)?.date;
    if (trainerProposalMode) {
      const card = (cards ?? []).find((c) => c.id === id) ?? null;
      return createTrainerProposal(cancelProposalArgs(card, reason));
    }
    const result = await cancel(id, reason);
    if (result.ok) recordDelta(cardDate);
    return result;
  }

  // distance:5 entspricht Vanilla DRAG_THRESHOLD_PX (ui/plan-drag.js) — erst
  // ab dieser Zeigerbewegung wird aus einem Klick auf den Griff ein Drag.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  function handleDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id));
  }

  function handleDragEnd(event: DragEndEvent) {
    const targetDate = event.over?.id ? String(event.over.id) : "";
    if (activeCard) {
      const { action } = resolveDrop({ id: activeCard.id, date: activeCard.date }, targetDate, TODAY);
      if (action === "move") void handleMove(activeCard.id, targetDate);
    }
    setActiveId(null);
  }

  const heroTitle = editable ? "Trainingsplan" : "Trainingsplan — Übersicht";
  const heroDesc = editable
    ? "Alle geplanten Trainingseinheiten. Absolvierte Sessions werden automatisch erkannt, sobald die Fahrt erfasst ist."
    : "Alle geplanten Trainingseinheiten im Überblick. Absolvierte Sessions werden automatisch erkannt, sobald die Fahrt erfasst ist.";

  return (
    <DndContext
      sensors={sensors}
      // pointerWithin statt der Default-Kollisionsberechnung
      // (rectIntersection): die misst gegen das ÜBERSETZTE Rechteck des
      // Kartenknotens (setNodeRef sitzt auf der ganzen Karte, nicht auf
      // dem Griff) — bei zeilenbreiten Karten über einer 7-Spalten-
      // Tages-Slot-Zeile überlappt das translatierte Rechteck mehrere
      // Slots gleichzeitig, das Zieltag-Feststellen wird uneindeutig.
      // pointerWithin prüft stattdessen die reine Zeigerposition, wie
      // Vanillas elementFromPoint(pointer.x, pointer.y).
      collisionDetection={pointerWithin}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActiveId(null)}
    >
    <PageShell>
    <div style={{ maxWidth: 1100, margin: "0 auto", display: "flex", flexDirection: "column", gap: 24 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap" }}>
        <h1 style={{ margin: 0, fontFamily: "var(--font-disp)", fontSize: "1.6rem", fontWeight: 600, color: "var(--ink)" }}>
          Planungstab
        </h1>
      </div>

      <TrainerBar
        athleteId={activeAthleteId}
        saveMode={saveMode}
        onSaveModeChange={setSaveMode}
        cards={cards ?? []}
        rides={allRides}
        wellness={wellness}
        events={events ?? []}
        projection={projection}
        conflicts={conflicts}
        onOpenProposals={() => setProposalListOpen(true)}
      />

      <ProposalBanner athleteId={activeAthleteId} onOpen={() => setProposalListOpen(true)} />
      <BlockDialogGate athleteId={activeAthleteId} cards={cards ?? []} />

      <ExportImportBar
        athleteId={activeAthleteId}
        ftp={ftp ?? null}
        cards={cards ?? []}
        rides={allRides}
        wellness={wellness}
        powerCurveBlocks={powerCurveBlocks}
        events={events ?? []}
        projection={projection}
        conflicts={conflicts}
      />

      {deltaBanner && <DeltaBanner state={deltaBanner} onClose={() => setDeltaBanner(null)} />}

      {isLoading && <p style={{ color: "var(--ink-3)" }}>Lädt …</p>}

      {!isLoading && error && (
        <p style={{ color: "var(--danger)" }}>⚠️ Trainingsplan konnte nicht geladen werden.</p>
      )}

      {!isLoading && !error && !weekGrid.length && !sections.done.length && (
        <p style={{ color: "var(--ink-3)" }}>Alle geplanten Sessions sind abgeschlossen 🎉</p>
      )}

      {!isLoading && !error && (weekGrid.length > 0 || sections.done.length > 0) && (
        <>
          <GlassCard variant="soft" style={{ padding: "20px 22px", display: "flex", flexDirection: "column", gap: 16 }}>
            <div>
              <h2 style={{ margin: "0 0 4px", fontFamily: "var(--font-disp)", fontSize: "1.15rem", color: "var(--ink)" }}>
                {heroTitle}
              </h2>
              <p style={{ margin: 0, fontSize: ".84rem", color: "var(--ink-3)" }}>{heroDesc}</p>
            </div>

            <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
              <Stat value={sections.stats.doneCount} label="absolviert" />
              <Stat value={sections.stats.upcomingCount} label="ausstehend" />
              <Stat value={sections.stats.weeksLeft} label="Wochen" />
              <Stat
                value={sections.stats.currentWeekLabel ? weekDisplayLabels([sections.stats.currentWeekLabel])[0] : "–"}
                label="aktuell"
              />
              {sections.stats.cancelledCount > 0 && (
                <Stat value={sections.stats.cancelledCount} label="ausgefallen" color="var(--danger)" />
              )}
              {sections.stats.missedCount > 0 && (
                <Stat value={sections.stats.missedCount} label="verpasst" color="var(--gold)" />
              )}
            </div>

            <div>
              <div style={{ height: 6, borderRadius: 3, background: "rgba(255,255,255,.08)", overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${sections.stats.pct}%`, background: "var(--ss)" }} />
              </div>
              <div style={{ marginTop: 6, fontSize: ".76rem", color: "var(--ink-3)" }}>
                {sections.stats.pct}% abgeschlossen · {sections.stats.totalSessions} Sessions gesamt
              </div>
            </div>
          </GlassCard>

          {weekGrid.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                <span style={SECTION_TITLE_STYLE}>📅 Ausstehend — {sections.stats.upcomingCount} Sessions</span>
                {editable && (
                  <button
                    type="button"
                    onClick={() => setDialog("new")}
                    style={{
                      padding: "9px 18px",
                      borderRadius: "var(--pill)",
                      border: "1px solid var(--hair)",
                      background: "transparent",
                      color: "var(--ink)",
                      fontSize: ".84rem",
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    + Karte
                  </button>
                )}
              </div>
              <WeekGrid
                weeks={weekGrid}
                today={TODAY}
                canEdit={editable}
                trainerProposalMode={trainerProposalMode}
                renderDetail={(cell) => {
                  if (!cell.card) return null;
                  const card = cell.card;
                  return (
                    <WeekGridDetailRow
                      key={card.id}
                      card={card}
                      canEdit={editable}
                      // Push bleibt athletenexklusiv (docs/phase-4-konzept-
                      // trainer-sicht.md: "Kein Wahoo-Push durch den
                      // Trainer") — anders als Verschieben/Ausfallen gibt
                      // es dafür keinen Vorschlag-Ersatz, der Token gehört
                      // dem Athleten. editable allein reicht nicht, weil
                      // es auch für den Trainer true ist (RLS T2).
                      canPush={editable && !isTrainer}
                      onPush={push}
                      intervalsCredentials={intervalsCredentials}
                      trainerProposalMode={trainerProposalMode}
                      rides={allRides}
                      conflicts={conflicts}
                      projection={projection}
                      ftp={ftp}
                      forecast={forecast}
                      wellness={wellness}
                      plannedSessions={plannedSessions}
                      onEdit={() => setDialog(card)}
                      onMove={handleMove}
                      onCancel={handleCancel}
                      onUndo={undo}
                    />
                  );
                }}
              />
            </div>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <span style={SECTION_TITLE_STYLE}>✅ Absolviert — {sections.done.length}</span>
            <DoneTable
              rows={doneTableRows}
              fidelity={fidelity}
              gaps={gaps}
              canEdit={editable}
              renderChart={(row) => <DoneDetailChart {...row} intervalsCredentials={intervalsCredentials} />}
            />
          </div>
        </>
      )}

      {dialog !== "closed" && (
        <PlanCardForm
          athleteId={activeAthleteId}
          editingCard={dialog === "new" ? null : dialog}
          onClose={() => setDialog("closed")}
          isTrainerSaving={isTrainer}
          saveMode={saveMode}
        />
      )}

      {proposalListOpen && (
        <ProposalList
          athleteId={activeAthleteId}
          onClose={() => setProposalListOpen(false)}
          onCompare={setCompareProposal}
        />
      )}
      {compareProposal && (
        <ProposalCompare
          athleteId={activeAthleteId}
          proposal={compareProposal}
          onClose={() => setCompareProposal(null)}
        />
      )}
    </div>
    </PageShell>
    <DragOverlay>{activeCard && <DragPreview card={activeCard} />}</DragOverlay>
    </DndContext>
  );
}

/** Kompakte Zieh-Vorschau im DragOverlay-Portal — bewusst ohne Buttons/
 *  Inputs (kein verschachteltes interaktives Element in einem Overlay). */
function DragPreview({ card }: { card: PlanCardT }) {
  const color = typeColor(card.typ);
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "12px 14px",
        borderRadius: "var(--radius-sm)",
        background: "var(--glass-2)",
        border: `1px solid ${color}`,
        boxShadow: "var(--e3)",
        cursor: "grabbing",
        maxWidth: 320,
      }}
    >
      <span aria-hidden="true">{typeIcon(card.typ)}</span>
      <span style={{ fontFamily: "var(--font-mono)", fontSize: ".76rem", color: "var(--ink-3)" }}>{fmtDate(card.date)}</span>
      <span style={{ fontSize: ".9rem", fontWeight: 500, color: "var(--ink)" }}>{card.name}</span>
    </div>
  );
}

function Stat({ value, label, color }: { value: number | string; label: string; color?: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <span style={{ fontFamily: "var(--font-disp)", fontSize: "1.3rem", fontWeight: 600, color: color ?? "var(--ink)" }}>
        {value}
      </span>
      <span style={{ fontSize: ".68rem", color: "var(--ink-3)" }}>{label}</span>
    </div>
  );
}
