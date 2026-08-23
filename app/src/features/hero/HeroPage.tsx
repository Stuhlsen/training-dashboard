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
import { MetricsGrid } from "./MetricsGrid";
import { PowerScale } from "./PowerScale";
import { RaceCountdownPill } from "./RaceCountdownPill";
import { ReadinessCard } from "./ReadinessCard";
import { SessionCard } from "./SessionCard";
import { WeatherCard } from "./WeatherCard";
import { WeekReviewCard } from "./WeekReviewCard";
import { WellbeingCard } from "./WellbeingCard";
import { buildHeroCore, buildHeroMetrics, buildPowerScale, type HeroCoreInput } from "./hero-view-model";

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
      // ftp_history hängt wie der Check-in an auth.uid(), nicht am
      // Athleten-Toggle — nur bei isSelf anwenden, sonst würde ein Toggle
      // auf den anderen Athleten dessen Ring mit der eigenen FTP-Historie
      // zeigen. Ternary bewusst HIER (im Memo-Callback), nicht in einer
      // eigenen Variable davor — sonst erzeugt `isSelf ? entries : []` bei
      // jedem Render ein neues Array und triggert das Memo unabhängig von
      // echten Datenänderungen (react-hooks/exhaustive-deps).
      ftpHistoryEntries: isSelf ? ftpHistoryEntries : [],
    });
  }, [activeAthleteId, athleteData, planCards, isSelf, checkin, ftpHistoryEntries]);
  const powerScale = buildPowerScale(core.ramp.value, core.eftp.value, whatIfFtp);
  const vm = { ...core, powerScale };

  // Gesamtstatistiken-Kachelreihe (Etappe 11c) — nutzt core.ramp/core.eftp
  // statt FTP/eFTP ein zweites Mal herzuleiten (s. buildHeroMetrics()-
  // Kommentar), läuft daher nicht mit durch buildHeroCore()s teure Memo,
  // sondern bekommt ihre eigene, billigere.
  const metrics = useMemo(() => {
    const rides = (athleteData?.rides as Ride[] | undefined) ?? [];
    return buildHeroMetrics(rides, core.ramp, core.eftp);
  }, [athleteData, core.ramp, core.eftp]);

  // Bestleistungen + Trainingskonsistenz (Etappe 12a) — vanilla zeigt beides
  // auf tab-overview (= Hero-Tab hier); Records zusätzlich auch im
  // Analyse-Tab (RecordChips dort unverändert, 1:1-Port-Konvention). `rides`
  // selbst memoisiert, sonst würde die logische `??`-Ausdrucksweise bei
  // jedem Render ein neues Array liefern und records/ConsistencyCalendar
  // unnötig neu rechnen (react-hooks/exhaustive-deps).
  const rides = useMemo(() => (athleteData?.rides as Ride[] | undefined) ?? [], [athleteData]);
  const records = useMemo(() => buildRecordChips(rides), [rides]);

  // Wochenrückblick (Fahrplan 1, V1) — Port von ui/panels.js::renderWeekReview().
  // Adjustments bewusst leer wie im Vanilla-Original (app.js ruft buildWeekReview
  // an beiden Stellen mit `{}` auf, s. docs/v0-funktionsabgleich-bericht.md §3) —
  // keine Verbesserung hier, nur Parität.
  const weekReview = useMemo(
    () => buildWeekReview(rides, planCards ?? [], {}, TODAY),
    [rides, planCards],
  );


  if (isLoading || !athleteData) {
    return <p style={{ color: "var(--ink-3)", padding: 40 }}>{error ? "Fehler beim Laden der Trainingsdaten." : "Lädt…"}</p>;
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
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 340px), 1fr))", gap: "clamp(20px,2vw,34px)", alignItems: "start" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 20, transform: "translateZ(46px)" }}>
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

            {vm.session && <SessionCard session={vm.session} statusColor={LEVEL_COLOR[vm.briefing.level]} />}

            {vm.weatherToday && <WeatherCard weather={vm.weatherToday} />}
          </div>

          {session && (
            // Unterkante bündig mit der linken Spalte (Wetter-Karte) statt
            // oben an der Überschrift klebend (Review-Kommentar 23.08.2026)
            // — `alignSelf: "end"` statt eines geschätzten Pixel-Werts, damit
            // es bei jeder Inhaltslänge der linken Spalte stimmt. Gilt
            // unabhängig vom Login-Status auch für die FTP-Ringe daneben.
            <div style={{ alignSelf: "end", transform: "translateZ(88px)" }}>
              <BriefingCard briefing={vm.briefing} />
            </div>
          )}

          <div style={{ alignSelf: "end", transform: "translateZ(30px)" }}>
            <FtpRings eftp={vm.eftp} ramp={vm.ramp} ftpPrimary={vm.ftpPrimary} milestones={vm.milestones} goal={athleteCfg?.ftpGoal ?? 0} />
          </div>
        </div>

        <div style={{ transform: "translateZ(22px)" }}>
          <PowerScale
            powerScale={vm.powerScale}
            whatIf={vm.whatIf}
            whatIfFtp={whatIfFtp}
            onWhatIfChange={setWhatIfFtp}
            eftpVal={vm.eftp.value || null}
          />
        </div>

        <div style={{ transform: "translateZ(14px)" }}>
          <MetricsGrid metrics={metrics} />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 420px), 1fr))", gap: "clamp(20px,2vw,34px)", transform: "translateZ(10px)" }}>
          <GlassCard variant="soft" style={{ padding: "20px 22px" }}>
            <span style={{ fontSize: "var(--fs-tile-title)", letterSpacing: ".16em", textTransform: "uppercase", color: "var(--ink)", fontWeight: 700 }}>
              Trainingskonsistenz
            </span>
            <ConsistencyCalendar rides={rides} todayISO={TODAY} />
          </GlassCard>
          <GlassCard variant="soft" style={{ padding: "20px 22px" }}>
            <span style={{ fontSize: "var(--fs-tile-title)", letterSpacing: ".16em", textTransform: "uppercase", color: "var(--ink)", fontWeight: 700 }}>
              Bestleistungen
            </span>
            <RecordChips records={records} />
          </GlassCard>
          <WeekReviewCard review={weekReview} />
          <WellbeingCard activeAthleteId={activeAthleteId} />
          <ReadinessCard readiness={vm.readiness} briefing={vm.briefing} />
        </div>
      </div>
    </div>
  );
}
