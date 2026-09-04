import { useMemo, useState } from "react";
import { useAuth } from "../../api/auth/useAuth";
import { useActiveAthlete } from "../../api/hooks/useActiveAthlete";
import { useRides } from "../../api/hooks/useRides";
import { usePlanCards } from "../../api/hooks/usePlanCards";
import { useTodayCheckin } from "../../api/hooks/useWellbeing";
import { useIsSelfAthlete } from "../../api/hooks/useWriteAuthorization";
import { useEvents, raceCountdown } from "../../api/hooks/useEvents";
import { useFtpHistory } from "../../api/hooks/useFtpHistory";
import { athleteConfig } from "../../config";
import { localISODate } from "../../core/format.js";
import { buildWeekReview } from "../../core/weekreview.js";
import { GlassCard } from "../../components/GlassCard";
import { ConsistencyCalendar } from "../../charts/ConsistencyCalendar";
import { buildRecordChips } from "../analysis/analysis-view-model";
import { RecordChips } from "../analysis/RecordChips";
import { BriefingCard, LEVEL_COLOR } from "./BriefingCard";
import { FtpRings } from "./FtpRings";
import { HeroTileGrid, type HeroTile } from "./HeroTileGrid";
import { MetricTile } from "./MetricTile";
import { PowerScale } from "./PowerScale";
import { RaceCountdownPill } from "./RaceCountdownPill";
import { RaceResultsCard } from "./RaceResultsCard";
import { buildRaceResults } from "./race-results-view-model";
import { ReadinessCard } from "./ReadinessCard";
import { SessionCard } from "./SessionCard";
import { WeatherCard } from "./WeatherCard";
import { WeekReviewCard } from "./WeekReviewCard";
import { WellbeingCard } from "./WellbeingCard";
import { buildHeroCore, buildHeroMetrics, buildPowerScale, type HeroCoreInput } from "./hero-view-model";
import { useHeroLayout } from "../../api/hooks/useHeroLayout";
import { resolveTileLayout } from "../../core/hero-layout.js";
import type { HeroTilePosition } from "../../api/supabase/hero-layout";

type Ride = import("../../types.js").Ride;
type WellnessDay = import("../../types.js").WellnessDay;

const TODAY = localISODate();

/** Feste Basis-Kippung der Plate in Grad (`Hero-Weitwinkel.dc.html`s
 *  `tiltAmount`-Prop) — statisch, keine Mausverfolgung mehr (bis 22.08.2026
 *  vorhanden, auf Wunsch entfernt, s. AppBackground.tsx). */
const BASE_ROTATE_X = 1.6;

export function HeroPage() {
  const { activeAthleteId } = useActiveAthlete();
  const athleteCfg = athleteConfig(activeAthleteId);
  const { data: athleteData, isLoading, error } = useRides(activeAthleteId);
  const { data: planCards } = usePlanCards(activeAthleteId);
  const { data: checkin } = useTodayCheckin();
  // Eigene, von der Session-Karte unabhängige Datenquelle (Events statt
  // Plankarten) — auch ein Athlet ohne eigenen Trainingsplan kann Events
  // haben (Muster wie overview.js::_renderSessionPill).
  const { data: events } = useEvents(activeAthleteId);
  const countdown = raceCountdown(events ?? [], TODAY);
  // Der Morgen-Check-in hängt an auth.uid(), nicht am Athleten-Toggle
  // (useWellbeing.ts) — nur anwenden, wenn der angezeigte Athlet auch der
  // eingeloggte Selbst ist, sonst bekäme ein Toggle auf den anderen
  // Athleten dessen Briefing mit dem eigenen Befinden vermischt (Muster
  // wie isSelfAthlete() in api/write-authorization.ts).
  const { isSelf } = useIsSelfAthlete(activeAthleteId);
  // ftp_history hängt wie der Check-in an auth.uid(), nicht am
  // Athleten-Toggle — nur bei isSelf anwenden, sonst würde ein Toggle auf
  // den anderen Athleten dessen Ring mit der eigenen FTP-Historie zeigen.
  const { entries: ftpHistoryEntries } = useFtpHistory();
  // Sichtbarkeits-Matrix (docs/phase-6-konzept-sichtbarkeit.md): die
  // Governor-/Belastungsempfehlung erbt die Sichtbarkeit ihrer sensibelsten
  // Quelle (Befinden) und ist für Besucher grundsätzlich ❌ — unabhängig
  // davon, ob für DIESE Ansicht gerade `subjective` null ist (s. isSelf oben).
  const { session } = useAuth();

  // FTP-Sichtbarkeit für Besucher (Migration 0025 `profiles.ftp_public`): der
  // eingeloggte Athlet sieht seine eigene FTP immer; für alle anderen
  // entscheidet das serverseitig gesetzte Flag aus dem Payload (fehlt in
  // Alt-Payloads → sichtbar). Bei `false` verschwinden Leistungsskala, Ringe
  // und Zeitstrahl komplett — dasselbe Verhalten wie beim Befinden-Schalter.
  const ftpGateOpen = isSelf || (athleteData?.ftpPublic ?? true);

  const [whatIfFtp, setWhatIfFtp] = useState(athleteCfg?.ftpGoal ?? 210);

  // Athletenwechsel muss den Slider auf den NEUEN Athleten zurücksetzen —
  // sonst bleibt z.B. Athlet 1s Ziel-FTP (210 W) nach dem Toggle auf
  // Athlet 2 (Ziel 280 W) stehen und liegt unterhalb von dessen whatIf.min.
  // Zustand während des Renderns anpassen (React-Muster "Adjusting state
  // when a prop changes"), NICHT per useEffect+setState — das würde einen
  // zusätzlichen Render-Durchlauf erzwingen (react-hooks/set-state-in-effect).
  const [lastAthleteId, setLastAthleteId] = useState(activeAthleteId);
  if (activeAthleteId !== lastAthleteId) {
    setLastAthleteId(activeAthleteId);
    setWhatIfFtp(athleteCfg?.ftpGoal ?? 210);
  }

  // buildHeroCore() durchläuft die gesamte Fahrten-/Wellness-Historie
  // (Briefing/Readiness/LoadGuard/eFTP) — memoisiert, damit ein What-if-
  // Slider-Tick (whatIfFtp ändert sich, sonst nichts) das nicht jedes Mal
  // neu anstößt. Nur buildPowerScale() (billige Zonen-Prozentrechnung)
  // läuft bei jedem Tick frisch. rides/wellness/forecast bewusst INNERHALB
  // des Memo-Callbacks aus athleteData abgeleitet, nicht als eigene
  // Variablen davor — sonst verlangt exhaustive-deps sie zusätzlich in der
  // Dependency-Liste, obwohl sie deterministisch aus athleteData folgen.
  const core = useMemo(() => {
    const rides = (athleteData?.rides as Ride[] | undefined) ?? [];
    const wellness = (athleteData?.wellness as WellnessDay[] | undefined) ?? [];
    const forecast = (athleteData?.forecast as HeroCoreInput["forecast"] | undefined) ?? {};
    return buildHeroCore({
      athleteId: activeAthleteId,
      rides,
      wellness,
      forecast,
      planCards: planCards ?? [],
      subjective: isSelf ? (checkin?.subjective ?? null) : null,
      todayISO: TODAY,
      // Eingeloggter Athlet: seine eigene ftp_history (hängt an auth.uid(),
      // nicht am Toggle). Besucher / anderer Athlet: die serverseitig
      // ftp_public-gegatete Historie aus dem Payload (Migration 0025) —
      // damit sieht die ausgeloggte Ansicht dieselben Ramp-Tests wie die
      // eingeloggte. Beide Zweige sind stabile Referenzen (react-query-Cache
      // bzw. Hook-Konstante), kein Neu-Array pro Render.
      ftpHistoryEntries: isSelf ? ftpHistoryEntries : (athleteData?.ftpHistory ?? []),
    });
  }, [activeAthleteId, athleteData, planCards, isSelf, checkin, ftpHistoryEntries]);
  const powerScale = buildPowerScale(core.ramp.value, core.eftp.value, whatIfFtp);
  const vm = { ...core, powerScale };

  // Athlet 4 ("Bentastiic", Einsteiger) hat noch keine FTP (kein Test,
  // config-Felder null) und anfangs keine Fahrten — Leistungsskala und
  // FTP-Ringe hätten dann keine Basis. Erst einblenden, sobald irgendein
  // FTP-Wert vorliegt (config, ftp_history-Ringwert oder eFTP aus Fahrten).
  // Zusätzlich: bei abgeschalteter FTP-Sichtbarkeit (ftpGateOpen=false)
  // bleiben Kachel/Ringe/Skala für Besucher komplett aus.
  const hasFtpData =
    ftpGateOpen &&
    ((athleteCfg?.ftpMeasured ?? athleteCfg?.eFTP ?? athleteCfg?.ftpGoal ?? null) != null ||
      core.ramp.value > 0 ||
      core.eftp.value > 0);

  // Gesamtstatistiken-Kachelreihe (Etappe 11c) — nutzt core.ramp/core.eftp
  // statt FTP/eFTP ein zweites Mal herzuleiten (s. buildHeroMetrics()-
  // Kommentar), läuft daher nicht mit durch buildHeroCore()s teure Memo,
  // sondern bekommt ihre eigene, billigere.
  const metrics = useMemo(() => {
    const rides = (athleteData?.rides as Ride[] | undefined) ?? [];
    return buildHeroMetrics(rides, core.ramp, core.eftp, ftpGateOpen);
  }, [athleteData, core.ramp, core.eftp, ftpGateOpen]);

  // Bestleistungen + Trainingskonsistenz (Etappe 12a) — vanilla zeigt beides
  // auf tab-overview (= Hero-Tab hier); Records zusätzlich auch im
  // Analyse-Tab (RecordChips dort unverändert, 1:1-Port-Konvention). `rides`
  // selbst memoisiert, sonst würde die logische `??`-Ausdrucksweise bei
  // jedem Render ein neues Array liefern und records/ConsistencyCalendar
  // unnötig neu rechnen (react-hooks/exhaustive-deps).
  const rides = useMemo(() => (athleteData?.rides as Ride[] | undefined) ?? [], [athleteData]);
  const records = useMemo(() => buildRecordChips(rides), [rides]);
  // Absolvierte Rennen mit erfasstem Ergebnis (Migration 0027) — reine
  // Ableitung aus der ohnehin geladenen Event-Liste, kein Request.
  const raceResults = useMemo(() => buildRaceResults(events ?? [], TODAY), [events]);

  // Wochenrückblick (Fahrplan 1, V1) — Port von ui/panels.js::renderWeekReview().
  // Adjustments bewusst leer wie im Vanilla-Original (app.js ruft buildWeekReview
  // an beiden Stellen mit `{}` auf, s. docs/v0-funktionsabgleich-bericht.md §3) —
  // keine Verbesserung hier, nur Parität.
  const weekReview = useMemo(
    () => buildWeekReview(rides, planCards ?? [], {}, TODAY),
    [rides, planCards],
  );

  // Kachel-Anordnung (Edit-Modus) — 2D-Positionen sind eine persönliche
  // Einstellung des EINGELOGGTEN Users (hängt an dessen auth.uid(), nicht
  // am Athleten-Toggle — wie useExportPrefs), gilt also unabhängig davon,
  // wessen Seite gerade betrachtet wird. `draftLayout` hält den Entwurf
  // während des Bearbeitens lokal, bis "Fertig" gespeichert oder
  // "Abbrechen" verwirft.
  const { layout: savedLayout, save: saveLayout } = useHeroLayout();
  const [editMode, setEditMode] = useState(false);
  const [draftLayout, setDraftLayout] = useState<HeroTilePosition[] | null>(null);

  if (isLoading || !athleteData) {
    return <p style={{ color: "var(--ink-3)", padding: 40 }}>{error ? "Fehler beim Laden der Trainingsdaten." : "Lädt…"}</p>;
  }

  // Kachel-Registry: nur die gerade SICHTBAREN Kacheln landen hier — exakt
  // dieselben Bedingungen wie vorher an den festen Grid-Positionen, jetzt
  // nur nicht mehr an eine feste Position gebunden. PowerScale/MetricsGrid
  // sind `wide` (spannen im Raster über alle Spalten, wie vorher als eigene
  // volle Zeile).
  const tiles: HeroTile[] = [];
  if (vm.session) tiles.push({ id: "session", node: <SessionCard session={vm.session} statusColor={LEVEL_COLOR[vm.briefing.level]} /> });
  if (vm.weatherToday) tiles.push({ id: "weather", node: <WeatherCard weather={vm.weatherToday} /> });
  if (session) tiles.push({ id: "briefing", node: <BriefingCard briefing={vm.briefing} /> });
  if (hasFtpData) {
    tiles.push({
      id: "ftpRings",
      node: <FtpRings eftp={vm.eftp} ramp={vm.ramp} ftpPrimary={vm.ftpPrimary} milestones={vm.milestones} goal={athleteCfg?.ftpGoal ?? 0} />,
    });
    tiles.push({
      id: "powerScale",
      wide: true,
      node: (
        <PowerScale
          powerScale={vm.powerScale}
          whatIf={vm.whatIf}
          whatIfFtp={whatIfFtp}
          onWhatIfChange={setWhatIfFtp}
          eftpVal={vm.eftp.value || null}
        />
      ),
    });
  }
  // Jede Kennzahl ist seit der Rückfrage vom 2026-09-04 ihre eigene, einzeln
  // verschiebbare Hero-Kachel (nicht mehr ein gemeinsamer MetricsGrid-Block)
  // — `metric.key` kommt stabil aus buildHeroMetrics(), s. hero-view-model.ts.
  for (const metric of metrics) {
    tiles.push({ id: `metric-${metric.key}`, node: <MetricTile metric={metric} /> });
  }
  tiles.push({
    id: "consistency",
    node: (
      <GlassCard variant="soft" style={{ padding: "20px 22px" }}>
        <span style={{ fontSize: "var(--fs-tile-title)", letterSpacing: ".16em", textTransform: "uppercase", color: "var(--ink)", fontWeight: 700 }}>
          Trainingskonsistenz
        </span>
        <ConsistencyCalendar rides={rides} todayISO={TODAY} />
      </GlassCard>
    ),
  });
  tiles.push({
    id: "records",
    node: (
      <GlassCard variant="soft" style={{ padding: "20px 22px" }}>
        <span style={{ fontSize: "var(--fs-tile-title)", letterSpacing: ".16em", textTransform: "uppercase", color: "var(--ink)", fontWeight: 700 }}>
          Bestleistungen
        </span>
        <RecordChips records={records} />
      </GlassCard>
    ),
  });
  if (raceResults.length > 0) tiles.push({ id: "raceResults", node: <RaceResultsCard rows={raceResults} /> });
  tiles.push({ id: "weekReview", node: <WeekReviewCard review={weekReview} /> });
  tiles.push({ id: "wellbeing", node: <WellbeingCard activeAthleteId={activeAthleteId} /> });
  tiles.push({ id: "readiness", node: <ReadinessCard readiness={vm.readiness} briefing={vm.briefing} /> });

  const availableTileIds = tiles.map((t) => t.id);
  const effectiveLayout = resolveTileLayout(draftLayout ?? savedLayout, availableTileIds);

  function handleLayoutChange(next: HeroTilePosition[]) {
    setDraftLayout(next);
  }

  function startEditing() {
    setDraftLayout(savedLayout);
    setEditMode(true);
  }

  function cancelEditing() {
    setDraftLayout(null);
    setEditMode(false);
  }

  function finishEditing() {
    if (draftLayout) saveLayout(draftLayout);
    setEditMode(false);
  }

  return (
    <div
      style={{
        position: "relative",
        zIndex: 1,
        perspective: 2100,
        perspectiveOrigin: "50% 34%",
        padding: "56px 0 96px",
        // Die permanente rotateX(BASE_ROTATE_X)-Kippung der Plate (auch im
        // Ruhezustand, nicht nur beim Hover) projiziert geometrisch minimal
        // über die Viewport-Breite hinaus und erzeugte dadurch einen
        // dauerhaften horizontalen Scrollbalken (Critique-Fund) — die
        // Kippung selbst bleibt, nur ihr unsichtbarer Rand wird geclippt.
        overflowX: "hidden",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 2040,
          margin: "0 auto",
          padding: "0 clamp(28px,4vw,80px)",
          display: "flex",
          flexDirection: "column",
          gap: 34,
          transformStyle: "preserve-3d",
          transform: `rotateX(${BASE_ROTATE_X}deg)`,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 24, flexWrap: "wrap", transform: "translateZ(70px)" }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 14 }}>
            <span style={{ fontSize: "1.02rem", fontWeight: 600, letterSpacing: ".01em", color: "var(--ink)" }}>
              Training<span style={{ color: "var(--ink-3)" }}> · </span>Dashboard
            </span>
            <span style={{ fontSize: ".76rem", letterSpacing: ".14em", textTransform: "uppercase", color: "var(--ink-3)" }}>
              {vm.dateRangeLabel}
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
            <RaceCountdownPill countdown={countdown} />
            {session && !editMode && (
              <button
                type="button"
                onClick={startEditing}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 9,
                  background: "rgba(255,255,255,.06)",
                  border: "1px solid var(--hair)",
                  borderRadius: "var(--pill)",
                  padding: "11px 20px",
                  color: "var(--ink)",
                  font: "inherit",
                  fontSize: ".86rem",
                  fontWeight: 500,
                  cursor: "pointer",
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--ink-2)" strokeWidth={2}>
                  <path d="M12 20h9" />
                  <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
                </svg>
                Kacheln anordnen
              </button>
            )}
            {editMode && (
              <>
                <button
                  type="button"
                  onClick={cancelEditing}
                  style={{
                    background: "rgba(255,255,255,.06)",
                    border: "1px solid var(--hair)",
                    borderRadius: "var(--pill)",
                    padding: "11px 20px",
                    color: "var(--ink-2)",
                    font: "inherit",
                    fontSize: ".86rem",
                    cursor: "pointer",
                  }}
                >
                  Abbrechen
                </button>
                <button
                  type="button"
                  onClick={finishEditing}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 8,
                    background: "var(--ok)",
                    border: "1px solid var(--ok)",
                    borderRadius: "var(--pill)",
                    padding: "11px 22px",
                    color: "#0b1a10",
                    font: "inherit",
                    fontSize: ".86rem",
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#0b1a10" strokeWidth={2.4}>
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                  Fertig
                </button>
              </>
            )}
          </div>
        </div>

        {/* Überschrift bleibt fix — bewusst nicht Teil der verschiebbaren
            Kacheln (Alex' Vorgabe: "alles außer der Überschrift"). */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8, transform: "translateZ(46px)" }}>
          {vm.eyebrow && (
            <span style={{ fontSize: ".72rem", letterSpacing: ".17em", textTransform: "uppercase", color: "var(--accent-2)", fontWeight: 600 }}>
              {vm.eyebrow}
            </span>
          )}
          <h1
            style={{
              margin: 0,
              fontFamily: "var(--font-disp)",
              fontSize: "clamp(2.6rem,3.4vw,4.1rem)",
              lineHeight: 1,
              fontWeight: 600,
              letterSpacing: "-.03em",
              color: "var(--ink)",
              textShadow: "0 4px 30px rgba(0,0,0,.6)",
            }}
          >
            Radsport
            <br />
            Trainingsdashboard
          </h1>
        </div>

        <HeroTileGrid tiles={tiles} layout={effectiveLayout} editing={editMode} onLayoutChange={handleLayoutChange} />
      </div>
    </div>
  );
}
