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
import { athleteConfig, hasGeneratedPlan } from "../../config";
import { useActiveAthlete } from "../../api/hooks/useActiveAthlete";
import { useEffectiveSport, type ActiveSport } from "../../api/hooks/useActiveSport";
import { usePlanningSportFilter } from "../../api/hooks/usePlanningSportFilter";
import { useAthletePlanOffset } from "../../api/hooks/useAthletePlanOffset";
import { useAthleteSports } from "../../api/hooks/useAthleteSports";
import { useActiveTrainingPlan, useActiveWeekModel } from "../../api/hooks/useActiveTrainingPlan";
import { useCanCreatePlan, useCanWriteForAthlete, useIsSelfAthlete } from "../../api/hooks/useWriteAuthorization";
import { useTrainerContext } from "../../api/hooks/useTrainerContext";
import { useEvents } from "../../api/hooks/useEvents";
import { useRides } from "../../api/hooks/useRides";
import {
  useCancelPlanCard,
  useCreatePlanCard,
  useMovePlanCard,
  usePlanCards,
  usePushPlanCard,
  useReorderPlanCard,
  useUndoAdjustment,
} from "../../api/hooks/usePlanCards";
import { buildCopyInput } from "../../api/plan-cards/patch";
import { useCreateTrainerProposal } from "../../api/hooks/useProposals";
import { qk } from "../../api/keys";
import { fmtDate, localISODate } from "../../core/format.js";
import { activitySport, ridesForSport, sportBadge } from "../../core/activity-sport.js";
import { resolveDrop } from "../../core/plan-drag.js";
import { detectConflicts } from "../../core/conflicts.js";
import { projectLoad } from "../../core/projection.js";
import { weekDisplayLabels } from "../../core/week-labels.js";
import { isoWeekKey, weeklyVolumeBySport } from "../../core/aggregate.js";
import { moveProposalArgs, cancelProposalArgs } from "../../core/proposal-payload.js";
import { DeltaBanner } from "./DeltaBanner";
import { computeDeltaBanner, type DeltaBannerState } from "./planning-delta";
import { PlanCardForm } from "./PlanCardForm";
import { ShiftPlanDialog } from "./ShiftPlanDialog";
import { NewPlanDialog } from "./NewPlanDialog";
import { RecomputePlanDialog } from "./RecomputePlanDialog";
import { goalPlanHint } from "./goal-plan-view-model";
import { useGoalPlanContext } from "./useGoalPlanContext";
import { FtpRescaleDialog } from "./FtpRescaleDialog";
import { detectDoneFtpTest } from "./ftp-rescale-dialog-view-model";
import { ExportImportBar } from "./ExportImportBar";
import { BlockDialogGate } from "./BlockDialog";
import { MoveCopyDialog } from "./MoveCopyDialog";
import { ActionSportPicker } from "./ActionSportPicker";
import { buildPlanningScope, buildSportScopes, type PlanningScope } from "./planning-scope-view-model";
import { ProposalBanner } from "./ProposalBanner";
import { ProposalList } from "./ProposalList";
import { ProposalCompare } from "./ProposalCompare";
import { TrainerBar } from "./TrainerBar";
import { canEditPlanCards, isTrainerProposalMode, type SaveMode } from "./trainer-bar-view-model";
import { WeekGrid } from "./WeekGrid";
import { WeekGridDetailRow } from "./WeekGridDetailRow";
import { buildWeekGrid } from "./week-grid-view-model";
import { DoneTable } from "./DoneTable";
import { DoneDetailChart } from "./DoneDetailChart";
import { useIntervalsCredentials } from "../../api/hooks/useIntervalsCredentials";
import { useCadenceTarget } from "../../api/hooks/useCadenceTarget";
import { useProfileBasics } from "../../api/hooks/useProfile";
import type { NutritionWellnessDay } from "../nutrition/nutrition-day-model";
import { guideWeightKg } from "./session-guide-view-model";
import {
  computePlanningDerivedSets,
  resolvePlanningFtp,
  typeColor,
  typeIcon,
  type PlannedSessionRef,
} from "./planning-view-model";
import type { EventItem, PlanCard as PlanCardT, Proposal, Result } from "../../api/types";

type Ride = import("../../types.js").Ride;
type WellnessDay = import("../../types.js").WellnessDay;

const TODAY = localISODate();
const CURRENT_WEEK_KEY = isoWeekKey(TODAY);

const VOLUME_SPORT_LABEL: Record<"ride" | "run" | "swim", string> = {
  ride: "Radfahren",
  run: "Laufen",
  swim: "Schwimmen",
};

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
    // Fahrplan 12 E6 (Nachtrag zu E4): ohne `sport` dispatcht estimateTss()
    // stillschweigend auf Rad-Konstanten — K-HARTFOLGE "harter Lauf nach
    // hartem Rad" hätte sonst nie ausgelöst.
    sport: c.sport,
    workoutStructure: c.workoutStructure as object | null,
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

/** Aktions-Pille in der „Ausstehend"-Kopfzeile (bisher inline am „+ Karte"-
 *  Knopf — jetzt geteilt mit „Plan verschieben…"). Glass-Fill + Hairline +
 *  Schatten, damit die Pille auch über dem Seiten-Hintergrundfoto (außerhalb
 *  einer GlassCard) klar als Bedienelement lesbar bleibt — s. DESIGN.md
 *  → Components → Buttons → „Ghost über dem Seitengrund". */
const SECTION_ACTION_BTN_STYLE: React.CSSProperties = {
  padding: "9px 18px",
  borderRadius: "var(--pill)",
  border: "1px solid rgba(255, 255, 255, 0.14)",
  background: "var(--glass)",
  backdropFilter: "blur(16px)",
  boxShadow: "var(--e2)",
  color: "var(--ink)",
  fontSize: ".84rem",
  fontWeight: 600,
  cursor: "pointer",
};

export function PlanningPage() {
  const queryClient = useQueryClient();
  const location = useLocation();
  const navigate = useNavigate();
  const { activeAthleteId } = useActiveAthlete();
  // Aktive Sportart des Umschalters (Fahrplan 12 E3) — steuert den
  // Leerzustand-Text für den Lauf-Tab. Die Kartenliste selbst filtert bereits
  // usePlanCards (select). Athlet 1/2/4 ⇒ immer "ride", kein Unterschied.
  //
  // Fahrplan 44 E1: gemeinsamer Kalender. `sportFilter` ist ein EIGENER Zustand
  // der Planungsseite (Standard "Alle") und ändert den globalen Umschalter nie.
  // Einzelsport-Athleten: isMultiSport=false ⇒ alles wie bisher.
  //  - sharedMode:  "Alle" — Raster zeigt alle Sportarten, Fortschritt/Done je Sportart
  //  - filterSport: eine Sportart gewählt — Seite verhält sich wie der alte Sport-Tab
  const { filter: sportFilter, isMultiSport } = usePlanningSportFilter(activeAthleteId);
  const sharedMode = isMultiSport && sportFilter === "all";
  const filterSport: ActiveSport | undefined = isMultiSport && sportFilter !== "all" ? sportFilter : undefined;
  const { effectiveSport } = useEffectiveSport(activeAthleteId, filterSport);
  // Im Modus "Alle" wirken "Neuer Plan"/"Plan anpassen"/"Plan verschieben" nur
  // auf eine ausdrücklich gewählte Sportart (ActionSportPicker) — nie still auf
  // die zuletzt global gewählte.
  const [actionSport, setActionSport] = useState<ActiveSport | undefined>(undefined);
  const [pickerFor, setPickerFor] = useState<"new" | "recompute" | "shift" | null>(null);
  // Plan-Verschiebung (`profiles.plan_offset_weeks`, Migration 0026) — verschiebt
  // Ruhetag-Ableitung, Erholungs-Schattierung und Phasen-Überschriften im
  // Wochenraster + die Ruhe-Slot-Konfliktprüfung um N ganze Wochen mit. Zieht
  // die Zeile des BETRACHTETEN Athleten (self + gecoachte Athleten); ein
  // Nicht-Coach-Betrachter sieht 0 (nur Anzeige-Drift, s. useAthletePlanOffset).
  const planOffsetWeeks = useAthletePlanOffset(activeAthleteId);
  // Fahrplan 8 E7: hat der Athlet einen selbst gebauten Plan (`training_plans`),
  // kommen Woche/Phase/Ruhe-Slots aus dessen `week_model` statt aus der
  // Code-Vorlage in `core/plan-week-model.js`. `null` ⇒ Code-Vorlage wie bisher.
  // Fahrplan 14 E7: sport-bewusst — sonst zeigt der Lauf-/Schwimm-Tab
  // fälschlich den Status (u. a. den „Rest neu berechnen…"-Knopf) des Rad-Plans.
  const activeWeekModel = useActiveWeekModel(activeAthleteId, effectiveSport);
  const { data: cards, isLoading, error } = usePlanCards(activeAthleteId, { allSports: sharedMode, sport: filterSport });
  // Fahrplan 12 E6 (Nachtrag zu E4): NUR für Projektion/Konfliktprüfung —
  // K-HARTFOLGE muss einen harten Lauf nach hartem Rad übergreifend sehen.
  // Die sichtbar gerenderte Kartenliste (`cards` oben) bleibt sportgefiltert.
  const { data: allSportCards } = usePlanCards(activeAthleteId, { allSports: true });
  const { data: rideData, isLoading: ridesLoading, error: ridesError } = useRides(activeAthleteId);
  const { data: events } = useEvents(activeAthleteId);
  // Fahrplan 13 E4/X3: Wochenvolumen je Sport (reine Dauer-Summe, kein
  // Lastmodell), sichtbar nur bei >1 Sportart (wie SportToggle). "Diese
  // Woche" ist die echte, laufende Kalenderwoche (CURRENT_WEEK_KEY) —
  // unabhängig vom gerade betrachteten Plan-Block/Sport-Tab, deshalb aus
  // `ridesAll` (ungefiltert über alle Sportarten) statt `rides`.
  const athleteSports = useAthleteSports(activeAthleteId);
  const showWeeklyVolume = athleteSports.length > 1;
  // Fahrplan 44 E1: Wochenmodell je Sportart für Ruhetage/Phase im Kalender "Alle".
  // Nur für Sportarten, die der Athlet hat (kein Zusatz-Read für Rad-only).
  const rideWeekModel = useActiveWeekModel(activeAthleteId, "ride");
  const runWeekModel = useActiveWeekModel(activeAthleteId, "run", { enabled: athleteSports.includes("run") });
  const swimWeekModel = useActiveWeekModel(activeAthleteId, "swim", { enabled: athleteSports.includes("swim") });
  const weeklyVolume = useMemo(
    () => weeklyVolumeBySport((rideData?.ridesAll as Ride[] | undefined) ?? [], CURRENT_WEEK_KEY),
    [rideData?.ridesAll],
  );
  const { canWrite } = useCanWriteForAthlete(activeAthleteId);
  const { canCreatePlan } = useCanCreatePlan(activeAthleteId);
  const { isTrainer } = useTrainerContext(activeAthleteId);

  const { move } = useMovePlanCard(activeAthleteId);
  const { cancel } = useCancelPlanCard(activeAthleteId);
  const { undo } = useUndoAdjustment(activeAthleteId);
  const { reorder } = useReorderPlanCard(activeAthleteId);
  const { push } = usePushPlanCard(activeAthleteId);
  const { create: createPlanCard } = useCreatePlanCard(activeAthleteId);
  const { create: createTrainerProposal } = useCreateTrainerProposal(activeAthleteId);
  // Trainer sehen weder den Push-Button (s. canPush unten) noch den
  // Rausch-Chart — die eigenen intervals.icu-Zugangsdaten des Trainers
  // (falls vorhanden) gehören nicht zum gerade angezeigten Athleten.
  const { credentials: intervalsCredentialsRaw } = useIntervalsCredentials();
  const intervalsCredentials = isTrainer ? null : intervalsCredentialsRaw;

  const [dialog, setDialog] = useState<DialogState>("closed");
  const [shiftOpen, setShiftOpen] = useState(false);
  // Hinweis „Falscher Start? → Plan verschieben…" direkt nach dem Erstellen eines Plans.
  // Merkt sich den Athleten, für den der Plan erstellt wurde — beim Wechsel
  // des Athleten verschwindet der Hinweis damit von selbst.
  const [shiftHintFor, setShiftHintFor] = useState<string | null>(null);
  const [newPlanOpen, setNewPlanOpen] = useState(false);
  const [recomputeOpen, setRecomputeOpen] = useState(false);
  const [ftpRescaleOpen, setFtpRescaleOpen] = useState(false);
  // Testtag-ID, für die das FTP-Umrechnungs-Banner bereits weggeklickt wurde
  // (localStorage-gestützt, s. useEffect unten).
  const [ftpRescaleDismissed, setFtpRescaleDismissed] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  // Drop auf einen freien Zieltag fragt erst nach "Verschieben oder
  // Kopieren?" statt sofort zu schreiben (Bugreport 02.09.2026) — dieser
  // State hält die Wahl offen, bis der Dialog eine Entscheidung meldet.
  const [pendingDrop, setPendingDrop] = useState<{ cardId: string; targetDate: string } | null>(null);
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
  // Aktivitäten, gegen die Raster/Fortschritt rechnen: Einzelsport wie bisher
  // (`rides`, vom globalen Umschalter gefiltert); gewählter Filter ⇒ genau diese
  // Sportart; "Alle" ⇒ alle Sportarten (Fahrplan 44 E1) — sonst erschiene ein
  // gelaufener Lauf als "verpasst". `ridesAll` ist ungefiltert (useRides).
  const ridesAllList = useMemo(
    () => (rideData?.ridesAll as Ride[] | undefined) ?? (rideData?.rides as Ride[] | undefined) ?? [],
    [rideData],
  );
  const scopeRides = useMemo(() => {
    if (sharedMode) return ridesAllList;
    if (filterSport) return ridesForSport(ridesAllList, filterSport) as Ride[];
    return (rideData?.rides as Ride[] | undefined) ?? [];
  }, [sharedMode, filterSport, ridesAllList, rideData]);
  const derivedSets = useMemo(() => computePlanningDerivedSets(cards ?? [], scopeRides), [cards, scopeRides]);
  // „Plan verschieben" ist self-only: der Offset lebt auf der eigenen
  // profiles-Zeile (RLS), ein Trainer kann ihn nicht für den Athleten setzen.
  const { isSelf } = useIsSelfAthlete(activeAthleteId);
  const editable = canEditPlanCards(isSelf, isTrainer);
  // Dieselbe Bedingung wie beim Knopf „Plan verschieben…" (self + generierter Plan).
  const canShiftPlan = isSelf && hasGeneratedPlan(activeAthleteId);
  const activeCard = (cards ?? []).find((c) => c.id === activeId) ?? null;

  // Intervall-Kadenzziel: session-gebunden, greift nur beim Blick auf den
  // eigenen Plan. Fremder Athlet ⇒ Standard 90 (wie früher fest verdrahtet).
  const { target: ownCadenceTarget } = useCadenceTarget();
  const cadenceTarget = isSelf ? ownCadenceTarget : 90;

  // Planungstab-Pulsband (Fahrplan 17 E2): DB-Wert (profiles_own.hr_max)
  // nur bei Eigenansicht — die View ist per RLS ohnehin nur für auth.uid()
  // lesbar, ein Trainer/Fremdblick bekäme hier nie eine Zeile. Fremdansicht
  // bzw. noch kein eigener DB-Wert eingetragen ⇒ config.ts-Legacy-Fallback
  // (identisch zum bisherigen Verhalten, Golden Master).
  const { data: profileBasics } = useProfileBasics();
  const configHrMax = athleteConfig(activeAthleteId)?.hrMax ?? null;
  const hrMax = isSelf ? (profileBasics?.hrMax ?? configHrMax) : configHrMax;

  const ftp = resolvePlanningFtp(activeAthleteId, rideData?.athleteFtp ?? null);

  // Etappe 6c: entspricht Vanillas state/plan-cards.js::recomputeProjection()
  // (dort Modul-State, hier reine Ableitung aus dem React-Query-Cache).
  // Grundlage für Wirkungsanzeige (cardImpact), Delta-Banner und
  // Konflikt-Badges — core/projection.js/core/conflicts.js sind bereits
  // seit Etappe 2a portiert und getestet, hier nur verdrahtet.
  const { projection, conflicts } = useMemo(() => {
    const rides = (rideData?.rides as Ride[] | undefined) ?? [];
    // Fahrplan 12 E6: sportübergreifend, damit K-HARTFOLGE einen harten Lauf
    // nach hartem Rad sieht — die gerenderte Kartenliste bleibt sportgefiltert.
    const projectionCards = (allSportCards ?? []).map(toProjectionCard);
    const projectionEvents = (events ?? []).map(toProjectionEvent);
    const projection = projectLoad(projectionCards, rides, { today: TODAY, events: projectionEvents, ftp });
    // Fahrplan 13 E5: multiSport schaltet den Rad-only-Filter von K-WOCHENTSS/
    // K-TID in detectConflicts() ab (`showWeeklyVolume` trägt dieselbe
    // Bedingung `athleteSports.length > 1`, hier bewusst wiederverwendet
    // statt eines zweiten Booleans). K-WOCHENTSS hängt dabei nur an den
    // (bereits sportübergreifenden) Plankarten — `rides` reicht. K-TID liest
    // die Ist-Fahrten aber direkt aus `actuals`: mit dem tab-gefilterten
    // `rides` sähe es Lauf-/Schwimm-Intensität nie, egal was `multiSport`
    // sagt — deshalb hier `ridesAll` wie schon bei `projectionCards`. Wirkt
    // als Nebeneffekt zusätzlich auf den K-WOCHENSPRUNG-Ist-Seed
    // (lastRiddenWeekTss() in conflicts.js summiert `actuals` sportunabhängig)
    // — gewollt: die Vergleichswoche soll dieselbe Sport-Mischung tragen wie
    // die (bereits sportübergreifende) erste volle Planwoche, sonst wäre
    // jeder Vergleich ein Äpfel-Birnen-Sprung.
    const conflictActuals = showWeeklyVolume ? ((rideData?.ridesAll as Ride[] | undefined) ?? rides) : rides;
    const conflicts = detectConflicts(projection, projectionCards, projectionEvents, conflictActuals, {
      athleteId: activeAthleteId,
      offsetWeeks: planOffsetWeeks,
      weekModel: activeWeekModel,
      multiSport: showWeeklyVolume,
    });
    return { projection, conflicts };
  }, [allSportCards, rideData, events, ftp, activeAthleteId, planOffsetWeeks, activeWeekModel, showWeeklyVolume]);

  // Etappe 13a: einheitliche Kalenderstruktur (alle Wochen mit ≥1 Karte,
  // Vergangenheit UND Zukunft) fürs Mo–So-Raster — ersetzt sections.weeks
  // als Datenquelle des Rasters, buildPlanningSections() bleibt weiter
  // Grundlage der Fortschritts-Statistik/Done-Liste oben.
  const weekGrid = useMemo(
    () =>
      buildWeekGrid(
        cards ?? [],
        scopeRides,
        TODAY,
        activeAthleteId,
        derivedSets,
        planOffsetWeeks,
        activeWeekModel,
        sharedMode
          ? { rides: scopeRides, weekModels: { ride: rideWeekModel, run: runWeekModel, swim: swimWeekModel } }
          : undefined,
      ),
    [
      cards,
      scopeRides,
      activeAthleteId,
      derivedSets,
      planOffsetWeeks,
      activeWeekModel,
      sharedMode,
      rideWeekModel,
      runWeekModel,
      swimWeekModel,
    ],
  );

  // Etappe 13d: Soll/Ist-Tabellen-Projektion über sections.done — berechnet
  // nichts neu, reicht nur Zahlen aus buildDoneCompareRows()/visibleCompliance()
  // durch (s. done-table-view-model.ts Kopfkommentar).
  //
  // Fahrplan 44 E1: je Sportart ein Block ("Alle"), sonst genau einer wie bisher.
  const scopeBlocks: PlanningScope[] = useMemo(() => {
    const common = { todayIso: TODAY, athleteId: activeAthleteId, ftp: ftp ?? null, canEdit: editable };
    if (sharedMode) {
      return buildSportScopes({ ...common, sports: athleteSports, cards: cards ?? [], rides: scopeRides });
    }
    return [buildPlanningScope({ ...common, sport: null, cards: cards ?? [], rides: scopeRides })];
  }, [sharedMode, athleteSports, cards, scopeRides, activeAthleteId, ftp, editable]);
  const totalDone = scopeBlocks.reduce((n, b) => n + b.sections.done.length, 0);
  const totalUpcoming = scopeBlocks.reduce((n, b) => n + b.sections.stats.upcomingCount, 0);

  const forecast = (rideData?.forecast as Record<string, unknown> | undefined) ?? {};
  const wellness = (rideData?.wellness as WellnessDay[] | undefined) ?? [];
  // Gewicht für „Essen vorher" (Fahrplan 34 E3): nur Eigenansicht, s. guideWeightKg.
  const weightKg = guideWeightKg({
    isSelf,
    wellness: wellness as NutritionWellnessDay[],
    profileWeightKg: profileBasics?.weightKg ?? null,
    todayISO: TODAY,
  });

  const plannedSessions = (rideData?.plannedSessions as PlannedSessionRef[] | undefined) ?? [];
  // Für TrainerBar (Etappe 7a) — die beiden useMemo-Blöcke oben halten ihr
  // eigenes, lokal geshadowtes `rides` bewusst unverändert, daher hier ein
  // eigener Name statt einer dritten Ableitung derselben Quelle.
  const allRides = scopeRides;
  // Für ExportImportBar (Etappe 7c) — Bestwerte-Vergleich im Briefing
  // (core/progress-indicators.js::bestEffortComparison).
  const powerCurveBlocks =
    (rideData?.powerCurveBlocks as Array<{ key: string; curve?: object | null }> | undefined) ?? [];

  // Fahrplan 8 E12: jüngster gefahrener FTP-Testtag eines selbst gebauten
  // Plans → Banner „künftige Watt-Ziele anpassen?". Nur für Schreibberechtigte
  // (self + Trainer). Weggeklickte Testtage merkt localStorage (pro testCardId).
  const doneFtpTest = useMemo(
    () =>
      canWrite
        ? detectDoneFtpTest({
            // FTP-Tests sind Radkarten — im gemeinsamen Kalender nur diese.
            cards: sharedMode ? (cards ?? []).filter((c) => activitySport(c) === "ride") : (cards ?? []),
            rides: sharedMode ? (ridesForSport(scopeRides, "ride") as Ride[]) : scopeRides,
            hasActivePlan: !!(sharedMode ? rideWeekModel : activeWeekModel),
            todayISO: TODAY,
          })
        : null,
    [canWrite, cards, scopeRides, activeWeekModel, sharedMode, rideWeekModel],
  );
  // localStorage direkt beim Rendern lesen (kein Effekt + setState) — der
  // Wert ändert sich nur mit `testCardId` und beim Wegklicken (das den
  // Session-State unten setzt und so einen Re-Render auslöst).
  const ftpRescaleStoredDismissed = useMemo(() => {
    if (!doneFtpTest) return false;
    try {
      return !!localStorage.getItem(`ftp-rescale-dismissed:${doneFtpTest.testCardId}`);
    } catch {
      return false; // localStorage nicht verfügbar — Banner bleibt sichtbar
    }
  }, [doneFtpTest]);
  const showFtpRescaleBanner =
    !!doneFtpTest &&
    !ftpRescaleStoredDismissed &&
    ftpRescaleDismissed !== doneFtpTest.testCardId;
  function dismissFtpRescale() {
    if (doneFtpTest) {
      try {
        localStorage.setItem(`ftp-rescale-dismissed:${doneFtpTest.testCardId}`, "1");
      } catch {
        /* ignorieren — nur eine Bequemlichkeit */
      }
      setFtpRescaleDismissed(doneFtpTest.testCardId);
    }
    setFtpRescaleOpen(false);
  }

  // Fahrplan 43 E5: ruhiger Hinweis, wenn aktive Ziele und aktiver Plan
  // auseinanderliegen. Nur für den Athleten selbst (Ziele sind owner-only).
  // „Später" merkt sich localStorage pro Signatur (Ziele + Abweichung) — wie
  // beim FTP-Rescale-Banner; ändert sich ein Ziel, kommt der Hinweis neu.
  const { data: activePlanRow } = useActiveTrainingPlan(activeAthleteId, effectiveSport);
  const { goals: planGoals, interimFtp } = useGoalPlanContext(activeAthleteId, effectiveSport);
  const goalHint = useMemo(
    () => (editable && isSelf && activePlanRow ? goalPlanHint(planGoals, activePlanRow, interimFtp) : null),
    [editable, isSelf, activePlanRow, planGoals, interimFtp],
  );
  const [goalHintDismissed, setGoalHintDismissed] = useState<string | null>(null);
  const [recomputeWithGoals, setRecomputeWithGoals] = useState(false);
  const goalHintStoredDismissed = useMemo(() => {
    if (!goalHint) return false;
    try {
      return !!localStorage.getItem(`goal-plan-hint-dismissed:${goalHint.signature}`);
    } catch {
      return false; // localStorage nicht verfügbar — Hinweis bleibt sichtbar
    }
  }, [goalHint]);
  const showGoalHint = !!goalHint && !goalHintStoredDismissed && goalHintDismissed !== goalHint.signature;
  function dismissGoalHint() {
    if (!goalHint) return;
    try {
      localStorage.setItem(`goal-plan-hint-dismissed:${goalHint.signature}`, "1");
    } catch {
      /* ignorieren — nur eine Bequemlichkeit */
    }
    setGoalHintDismissed(goalHint.signature);
  }

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

  // Fahrplan 44 E1: Aktionen je Sportart. Mit gewähltem Filter (oder bei einem
  // Einzelsport-Athleten) ist die Sportart eindeutig; im Modus "Alle" fragt
  // ActionSportPicker nach. Die Wahl gilt nur für diese eine Aktion.
  const athleteSportList = athleteSports.filter(
    (sp): sp is ActiveSport => sp === "ride" || sp === "run" || sp === "swim",
  );
  const modelledSports = athleteSportList.filter(
    (sp) => !!{ ride: rideWeekModel, run: runWeekModel, swim: swimWeekModel }[sp],
  );
  const hasPlanModel = sharedMode ? modelledSports.length > 0 : !!activeWeekModel;
  function openAction(kind: "new" | "recompute" | "shift") {
    if (kind === "new") setNewPlanOpen(true);
    else if (kind === "recompute") setRecomputeOpen(true);
    else setShiftOpen(true);
  }
  function requestAction(kind: "new" | "recompute" | "shift") {
    if (sharedMode) {
      setPickerFor(kind);
      return;
    }
    setActionSport(undefined);
    openAction(kind);
  }
  const dialogSport = filterSport ?? actionSport;
  const PICKER_ACTION_LABEL = { new: "Neuer Plan", recompute: "Plan anpassen", shift: "Plan verschieben" } as const;

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

  /** Gegenstück zu handleMove für die "Kopieren"-Wahl im MoveCopyDialog —
   *  legt eine neue Karte auf targetDate an, die Quellkarte bleibt
   *  unangetastet. Kein Vorschlags-Zweig: der Dialog ist nur über eine
   *  echte Zieh-Geste erreichbar, die canDragCard() für Trainer im
   *  Vorschlagsmodus bereits vollständig sperrt (core/plan-drag.js). */
  async function handleCopy(id: string, targetDate: string): Promise<Result> {
    const source = (cards ?? []).find((c) => c.id === id);
    if (!source) return { ok: false, error: { code: "NO_DATA", message: "Karte nicht gefunden" } };
    const result = await createPlanCard(buildCopyInput(source, targetDate));
    if (result.ok) recordDelta(targetDate);
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
      // Ein gültiger Drop fragt erst per Dialog "Verschieben oder
      // Kopieren?" nach, statt sofort zu schreiben (Bugreport 02.09.2026) —
      // "none" (derselbe Tag) und "rejected" (Vergangenheit) bleiben wie
      // bisher ohne Dialog (Ghost schnappt zurück).
      if (action === "move") setPendingDrop({ cardId: activeCard.id, targetDate });
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
        {/* canWrite (Self+Trainer+Admin) ohne Self/Trainer ⇒ der Betrachter
            ist Admin. plan_cards hat keine is_admin()-RLS-Policy (Issue #103)
            — die Ansicht ist für Admin rein lesend (editable=false oben),
            das hier sichtbar machen, damit die fehlenden Schreib-Knöpfe nicht
            wie eine defekte Athleten-/Trainer-Sicht wirken. */}
        {canWrite && !isSelf && !isTrainer && (
          <span
            title="Du bist als Admin eingeloggt. Die Trainingsplanung ist für dich hier rein lesend — Admin hat keine Schreibrechte auf Trainingskarten, weder als der Athlet selbst noch als sein Trainer."
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "5px 11px",
              borderRadius: "var(--pill)",
              border: "1px solid rgba(162,74,208,.4)",
              background: "rgba(162,74,208,.12)",
              color: "var(--ink-2)",
              fontFamily: "var(--font-mono)",
              fontSize: ".72rem",
              letterSpacing: ".03em",
            }}
          >
            🛡 Admin-Ansicht
          </span>
        )}
        {canCreatePlan && (
          <button type="button" onClick={() => requestAction("new")} style={{ ...SECTION_ACTION_BTN_STYLE, marginLeft: "auto" }}>
            + Neuer Plan
          </button>
        )}
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
      {showFtpRescaleBanner && doneFtpTest && (
        <div style={{ display: "flex", gap: 8, alignItems: "stretch" }}>
          <button
            type="button"
            onClick={() => setFtpRescaleOpen(true)}
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "flex-start",
              gap: 2,
              padding: "13px 18px",
              borderRadius: "16px",
              background: "rgba(224,138,60,.08)",
              border: "1px solid rgba(224,138,60,.3)",
              backdropFilter: "blur(14px)",
              color: "var(--ink)",
              font: "inherit",
              cursor: "pointer",
              textAlign: "left",
            }}
          >
            <span style={{ fontSize: ".88rem", fontWeight: 600 }}>
              FTP-Test am {fmtDate(doneFtpTest.testDateISO)} erledigt
            </span>
            <span style={{ fontSize: ".76rem", color: "var(--ink-3)" }}>
              Neue FTP eintragen — künftige Watt-Ziele anpassen
            </span>
          </button>
          <button
            type="button"
            onClick={dismissFtpRescale}
            style={{ ...SECTION_ACTION_BTN_STYLE, fontWeight: 400, fontSize: ".78rem" }}
          >
            Später
          </button>
        </div>
      )}
      {showGoalHint && goalHint && (
        <div style={{ display: "flex", gap: 8, alignItems: "stretch" }}>
          <div
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "flex-start",
              gap: 6,
              padding: "13px 18px",
              borderRadius: "16px",
              background: "rgba(255,255,255,.03)",
              border: "1px solid var(--hair)",
              backdropFilter: "blur(14px)",
              color: "var(--ink)",
            }}
          >
            <span style={{ fontSize: ".82rem", color: "var(--ink-2)", lineHeight: 1.45 }}>
              {sharedMode ? `${sportBadge(effectiveSport).label}: ` : ""}
              {goalHint.text}
            </span>
            <button
              type="button"
              onClick={() => {
                setRecomputeWithGoals(true);
                // Im Modus "Alle" gehört der Hinweis zur genannten Sportart.
                setActionSport(sharedMode ? effectiveSport : undefined);
                setRecomputeOpen(true);
              }}
              style={{ ...SECTION_ACTION_BTN_STYLE, fontWeight: 600, fontSize: ".8rem" }}
            >
              Plan anpassen ansehen
            </button>
          </div>
          <button
            type="button"
            onClick={dismissGoalHint}
            style={{ ...SECTION_ACTION_BTN_STYLE, fontWeight: 400, fontSize: ".78rem" }}
          >
            Später
          </button>
        </div>
      )}
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

      {/* Fahrplan 13 E4/X3: Wochenvolumen je Sport — reine Ist-Fahrten-Anzeige,
          unabhängig davon, ob für den aktiven Sport-Tab schon ein Plan
          angelegt ist (sonst bei "Noch kein Plan"-Athlet 3 nie sichtbar).
          Gate hängt bewusst an `useRides` (ridesLoading/ridesError), nicht an
          `usePlanCards` (isLoading/error oben) — andere Query, eigener
          Ladezustand; sonst zeigt die Zeile "0.0h" statt zu warten, sobald
          Plankarten schneller laden als die Fahrtendaten. */}
      {!ridesLoading && !ridesError && showWeeklyVolume && (
        <p style={{ margin: 0, fontSize: ".84rem", color: "var(--ink-2)" }}>
          Diese Woche:{" "}
          {athleteSports
            .filter((s): s is "ride" | "run" | "swim" => s === "ride" || s === "run" || s === "swim")
            .map((s) => `${VOLUME_SPORT_LABEL[s]} ${(weeklyVolume[s] / 60).toFixed(1)}h`)
            .join(" · ")}
        </p>
      )}

      {!isLoading && !error && !weekGrid.length && totalDone === 0 && (
        <GlassCard variant="soft" style={{ padding: "28px 24px", display: "flex", flexDirection: "column", gap: 12, alignItems: "flex-start" }}>
          <p style={{ margin: 0, color: "var(--ink-3)", fontSize: ".9rem" }}>
            {!sharedMode && effectiveSport === "run"
              ? "Noch kein Laufplan — lege eine Karte an."
              : canCreatePlan
                ? "Noch kein Trainingsplan angelegt."
                : "Für diesen Athleten ist kein Trainingsplan hinterlegt."}
          </p>
          {/* Lauf: seit Fahrplan 14 E6 BEIDE Wege — Karte-für-Karte (Fahrplan 12
              G5/G12) UND „Plan erstellen" (Entscheidung 5), NewPlanDialog
              erkennt den Sport-Tab jetzt selbst. Rad/Schwimm: unverändert nur
              „Plan erstellen" — für Schwimm ist das seit E6 real sport-bewusst
              statt implizit "ride" (der frühere Bug). */}
          <div style={{ display: "flex", gap: 10 }}>
            {!sharedMode && effectiveSport === "run" && editable && (
              <button type="button" onClick={() => setDialog("new")} style={SECTION_ACTION_BTN_STYLE}>
                + Karte
              </button>
            )}
            {canCreatePlan && (
              <button type="button" onClick={() => requestAction("new")} style={SECTION_ACTION_BTN_STYLE}>
                Plan erstellen
              </button>
            )}
          </div>
        </GlassCard>
      )}

      {!isLoading && !error && (weekGrid.length > 0 || totalDone > 0) && (
        <>
          {scopeBlocks.map((scope, idx) => (
          <GlassCard
            key={scope.sport ?? "single"}
            variant="soft"
            style={{ padding: "20px 22px", display: "flex", flexDirection: "column", gap: 16 }}
          >
            <div>
              {/* Fahrplan 44 E1: im Modus "Alle" je Sportart ein Block — Sportart
                  steht als Symbol + Text in der Überschrift. */}
              {scope.sport ? (
                <h2 style={{ margin: "0 0 4px", fontFamily: "var(--font-disp)", fontSize: "1.15rem", color: "var(--ink)" }}>
                  <span aria-hidden="true">{sportBadge(scope.sport).icon} </span>
                  {heroTitle} — {sportBadge(scope.sport).label}
                </h2>
              ) : (
                <h2 style={{ margin: "0 0 4px", fontFamily: "var(--font-disp)", fontSize: "1.15rem", color: "var(--ink)" }}>
                  {heroTitle}
                </h2>
              )}
              {(scope.sport === null || idx === 0) && (
                <p style={{ margin: 0, fontSize: ".84rem", color: "var(--ink-3)" }}>{heroDesc}</p>
              )}
            </div>

            <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
              <Stat value={scope.sections.stats.doneCount} label="absolviert" />
              <Stat value={scope.sections.stats.upcomingCount} label="ausstehend" />
              <Stat value={scope.sections.stats.weeksLeft} label="Wochen" />
              <Stat
                value={scope.sections.stats.currentWeekLabel ? weekDisplayLabels([scope.sections.stats.currentWeekLabel])[0] : "–"}
                label="aktuell"
              />
              {scope.sections.stats.cancelledCount > 0 && (
                <Stat value={scope.sections.stats.cancelledCount} label="ausgefallen" color="var(--danger)" />
              )}
              {scope.sections.stats.missedCount > 0 && (
                <Stat value={scope.sections.stats.missedCount} label="verpasst" color="var(--gold)" />
              )}
            </div>

            <div>
              <div style={{ height: 6, borderRadius: 3, background: "rgba(255,255,255,.08)", overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${scope.sections.stats.pct}%`, background: "var(--ss)" }} />
              </div>
              <div style={{ marginTop: 6, fontSize: ".76rem", color: "var(--ink-3)" }}>
                {scope.sections.stats.pct}% abgeschlossen · {scope.sections.stats.totalSessions} Sessions gesamt
              </div>
            </div>
          </GlassCard>
          ))}

          {shiftHintFor === activeAthleteId && editable && canShiftPlan && (
            <GlassCard
              variant="strong"
              radius="14px"
              style={{
                padding: "12px 16px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
                flexWrap: "wrap",
              }}
            >
              <span style={{ fontSize: ".84rem", color: "var(--ink-2)" }}>
                Plan erstellt. Falscher Start?
              </span>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  type="button"
                  style={SECTION_ACTION_BTN_STYLE}
                  onClick={() => {
                    setShiftHintFor(null);
                    setShiftOpen(true);
                  }}
                >
                  Plan verschieben…
                </button>
                <button
                  type="button"
                  style={SECTION_ACTION_BTN_STYLE}
                  onClick={() => setShiftHintFor(null)}
                  aria-label="Hinweis schließen"
                >
                  ×
                </button>
              </div>
            </GlassCard>
          )}

          {weekGrid.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                <span style={SECTION_TITLE_STYLE}>📅 Ausstehend — {totalUpcoming} Sessions</span>
                {editable && (
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {canShiftPlan && (
                      <button type="button" onClick={() => requestAction("shift")} style={SECTION_ACTION_BTN_STYLE}>
                        Plan verschieben…
                      </button>
                    )}
                    {hasPlanModel && (
                      <button
                        type="button"
                        onClick={() => {
                          setRecomputeWithGoals(false);
                          requestAction("recompute");
                        }}
                        style={SECTION_ACTION_BTN_STYLE}
                      >
                        Plan anpassen…
                      </button>
                    )}
                    <button type="button" onClick={() => setDialog("new")} style={SECTION_ACTION_BTN_STYLE}>
                      + Karte
                    </button>
                  </div>
                )}
              </div>
              <WeekGrid
                weeks={weekGrid}
                today={TODAY}
                canEdit={editable}
                trainerProposalMode={trainerProposalMode}
                renderDetail={(cell) => {
                  if (!cell.card) return null;
                  // Alle Karten des Tages, nach sort_order — bei mehreren
                  // wird jede als eigene Detailzeile gezeigt (sonst wäre die
                  // zweite Karte nur über das "+1" im Raster ahnbar) und
                  // trägt ▲/▼ zum Umsortieren innerhalb des Tages.
                  const dayCards = [cell.card, ...cell.otherCards].sort(
                    (a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0),
                  );
                  const multi = dayCards.length > 1;
                  return (
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {dayCards.map((card, idx) => (
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
                          cadenceTarget={cadenceTarget}
                          weightKg={weightKg}
                          intervalsCredentials={intervalsCredentials}
                          trainerProposalMode={trainerProposalMode}
                          // Im Modus "Alle" nur Aktivitäten der Karten-Sportart — sonst
                          // fände eine Radkarte die Lauf-Aktivität desselben Tages.
                          rides={sharedMode ? (ridesForSport(ridesAllList, activitySport(card)) as Ride[]) : allRides}
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
                          // Umsortieren hat keinen Vorschlag-Ersatz — im
                          // Trainer-Vorschlagsmodus deshalb aus.
                          reorder={
                            multi && !trainerProposalMode
                              ? {
                                  canUp: idx > 0,
                                  canDown: idx < dayCards.length - 1,
                                  onReorder: (direction) => reorder(card.id, direction),
                                }
                              : undefined
                          }
                        />
                      ))}
                    </div>
                  );
                }}
              />
            </div>
          )}

          {scopeBlocks.map((scope) => (
          <div key={scope.sport ?? "single"} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <span style={SECTION_TITLE_STYLE}>
              ✅ Absolviert
              {scope.sport && (
                <>
                  {" · "}
                  <span aria-hidden="true">{sportBadge(scope.sport).icon} </span>
                  {sportBadge(scope.sport).label}
                </>
              )}
              {" — "}
              {scope.sections.done.length}
            </span>
            <DoneTable
              rows={scope.doneRows}
              fidelity={scope.fidelity}
              gaps={scope.gaps}
              athleteId={activeAthleteId}
              ftp={ftp ?? null}
              cadenceTarget={cadenceTarget}
              hrMax={hrMax}
              renderChart={(row) => (
                <DoneDetailChart {...row} intervalsCredentials={intervalsCredentials} ftp={ftp ?? null} />
              )}
            />
          </div>
          ))}
        </>
      )}

      {dialog !== "closed" && (
        <PlanCardForm
          athleteId={activeAthleteId}
          editingCard={dialog === "new" ? null : dialog}
          onClose={() => setDialog("closed")}
          isTrainerSaving={isTrainer}
          saveMode={saveMode}
          defaultSport={filterSport}
        />
      )}

      {newPlanOpen && (
        <NewPlanDialog
          athleteId={activeAthleteId}
          sport={dialogSport}
          onClose={() => setNewPlanOpen(false)}
          onCreated={() => setShiftHintFor(activeAthleteId)}
        />
      )}

      {recomputeOpen && (
        <RecomputePlanDialog
          athleteId={activeAthleteId}
          withGoals={recomputeWithGoals}
          sport={dialogSport}
          onClose={() => setRecomputeOpen(false)}
        />
      )}

      {pickerFor && (
        <ActionSportPicker
          action={PICKER_ACTION_LABEL[pickerFor]}
          sports={pickerFor === "recompute" ? modelledSports : athleteSportList}
          onClose={() => setPickerFor(null)}
          onPick={(picked) => {
            const kind = pickerFor;
            setActionSport(picked);
            setPickerFor(null);
            openAction(kind);
          }}
        />
      )}

      {ftpRescaleOpen && doneFtpTest && (
        <FtpRescaleDialog
          athleteId={activeAthleteId}
          testDateISO={doneFtpTest.testDateISO}
          onClose={dismissFtpRescale}
        />
      )}

      {shiftOpen && (
        <ShiftPlanDialog
          athleteId={activeAthleteId}
          sport={dialogSport}
          onClose={() => {
            setShiftOpen(false);
            recordDelta();
          }}
        />
      )}

      {pendingDrop &&
        (() => {
          const dropCard = (cards ?? []).find((c) => c.id === pendingDrop.cardId);
          if (!dropCard) return null;
          return (
            <MoveCopyDialog
              card={dropCard}
              targetDate={pendingDrop.targetDate}
              onClose={() => setPendingDrop(null)}
              onMove={() => handleMove(pendingDrop.cardId, pendingDrop.targetDate)}
              onCopy={() => handleCopy(pendingDrop.cardId, pendingDrop.targetDate)}
            />
          );
        })()}

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
