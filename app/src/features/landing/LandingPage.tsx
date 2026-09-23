/* ============================================================
   FEATURES/LANDING/LANDINGPAGE.TSX — Etappe 3 / Fahrplan 22

   Hero + Block 1 "Form & Belastung". Der Story-Block unter dem Hero
   nutzt echte Dashboard-Komponenten (TraceCard/TraceLane, buildLoadRows)
   mit dem Etappe-2-Demo-Datensatz statt echten Athletendaten.

   Scroll-Animation über Framer Motion (nur im Landing-Bundle, code-
   gesplittet). Mobile/reduced-motion: landing.css erzwingt bei
   `max-width: 768px`/`prefers-reduced-motion: reduce` position:static
   und `transform: none !important` auf `.landing-story__block` — die
   JS-Seite muss dafür nichts zusätzlich abfragen, nur `useReducedMotion()`
   respektieren, damit vor dem ersten Scroll kein unsichtbarer Zustand
   hängen bleibt.
   ============================================================ */

import { useRef, useState } from "react";
import { motion, useReducedMotion, useScroll, useTransform } from "framer-motion";
import { loadDemoDataset } from "../../api/demo-pipeline";
import { TraceCard, type TraceLaneConfig } from "../../charts/TraceCard";
import { buildLoadRows, type LoadRow } from "../analysis/analysis-view-model";
import "./landing.css";

type Ride = import("../../types.js").Ride;

import { buildWeekGrid, type GridWeekRow } from "../planning/week-grid-view-model";
import { computePlanningDerivedSets } from "../planning/planning-view-model";
import { WeekGrid } from "../planning/WeekGrid";
import { PlanPreview } from "../planning/PlanPreview";
import { generatePlan, emptyHistory } from "../../core/plan-generator.js";
import type { PlanCard } from "../../api/types";
import { PowerCurveTraceCard, type PowerUnit } from "../../charts/PowerCurveTraceCard";
import { PaceCurveCard } from "../../charts/PaceCurveCard";
import { PaceZoneScale } from "../../charts/PaceZoneScale";
import { IntensityBand } from "../analysis/IntensityBand";
import { buildIntensityDistribution } from "../analysis/analysis-view-model";
import type { PaceCurvePoint, PaceZone } from "../analysis/pace-section-view-model";
import { IterationResult } from "../bikefit/IterationResult";
import { compareToTargets } from "../../core/bikefit.js";

const demo = loadDemoDataset();
const activityCount = demo.rides.length;
const sportCount = new Set(demo.rides.map((ride) => ride.sport)).size;

/** Letztes Datum im Demo-Zeitraum — als todayIso, damit die Karten nicht
 *  als "verpasst" markiert werden. */
const DEMO_TODAY = "2026-03-01";

/** Grobe ISO-Kalenderwoche fürs Hero-Kennzahlenfeld (Montag = Wochenstart). */
function isoWeekKey(dateStr: string): string {
  const date = new Date(`${dateStr}T00:00:00Z`);
  const day = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - day + 3);
  const firstThursday = new Date(Date.UTC(date.getUTCFullYear(), 0, 4));
  const diffWeeks = Math.round((date.getTime() - firstThursday.getTime()) / 604800000);
  return `${date.getUTCFullYear()}-KW${String(1 + diffWeeks).padStart(2, "0")}`;
}

const weekCount = new Set(demo.rides.map((ride) => isoWeekKey(ride.date))).size;

/** Demo-Ride → app/src/types.js::Ride, wie core/loadguard.js::rideLoad() sie
 *  erwartet: Rad bevorzugt tss, Lauf/Schwimm bevorzugt trimp (fehlt eines,
 *  fällt rideLoad() aufs andere zurück — beide zu setzen wäre irreführend,
 *  deshalb nur das jeweils passende Feld). Die TSS-Näherung nutzt eine feste
 *  Referenzleistung von 200 W rein zur Demo-Skalierung, keine echte FTP. */
function toRide(entry: (typeof demo.rides)[number]): Ride {
  const isRide = !entry.sport || entry.sport === "ride";
  return {
    dateISO: entry.date,
    sport: entry.sport,
    min: entry.durationMinutes,
    km: entry.distanceKm,
    watt: entry.avgWatts,
    np: entry.npWatts,
    hf: entry.avgHr,
    tss: isRide ? Math.round((entry.durationMinutes / 60) * (entry.npWatts / 200) ** 2 * 100) : null,
    trimp: isRide ? null : Math.round((entry.durationMinutes * entry.avgHr) / 100),
    eftp: entry.eftpWatts,
    feel: String(entry.feel),
    zoneTimes: entry.zoneTimesSec,
  };
}

const demoRides: Ride[] = demo.rides.map(toRide);
const loadRows: LoadRow[] = buildLoadRows(demoRides, { multiSport: true, ridesAll: demoRides });

/** Demo-eigener Generator-Input — kein echter Athlet, keine echte Historie.
 *  Startet an einem Montag, 12 Wochen pyramidal, Ziel-FTP 210 W, 8 h/Woche,
 *  4 Trainingstage (Di/Do/Sa/So). */
const DEMO_GENERATED_PLAN = generatePlan({
  sport: "ride",
  startDate: "2026-03-02",
  mode: "open",
  weeks: 12,
  trainingWeekdays: [2, 4, 6, 7],
  fixedDays: [],
  weeklyHours: 8,
  currentFtp: 190,
  ftpMeasuredDate: "2026-03-01",
  ftpTarget: 210,
  indoorShare: 0.4,
  focus: "allgemein",
  level: "fortgeschritten",
  model: "pyramidal",
  history: emptyHistory(),
});

/** Demo-PlanCard → PlanCard (app/src/api/types.ts). Die Demo hat keine
 *  IDs, Workouts oder DB-Felder — die Pflichtfelder bekommen Dummy-Werte. */
function toPlanCard(entry: (typeof demo.planCards)[number]): PlanCard {
  return {
    id: `demo-${entry.date}-${entry.label}`,
    date: entry.date,
    sortOrder: 0,
    name: entry.label,
    typ: entry.type === "rest" ? "Ruhetag" : entry.type === "workout" ? "Intervall" : entry.type === "endurance" ? "Ausdauer" : "Erholung",
    km: null,
    durationMin: entry.durationMinutes,
    tssPlanned: null,
    week: null,
    phase: null,
    sport: entry.sport === "rest" ? "ride" : (entry.sport as "ride" | "run" | "swim" | undefined),
    details: null,
    workout: null,
    workoutStructure: null,
    pushedExternalId: null,
    createdAt: "",
    updatedAt: "",
  };
}

const demoPlanCards: PlanCard[] = demo.planCards.map(toPlanCard);
const demoDerivedSets = computePlanningDerivedSets(demoPlanCards, demoRides);
const demoWeekGridRows: GridWeekRow[] = buildWeekGrid(
  demoPlanCards,
  demoRides,
  DEMO_TODAY,
  undefined, // athleteId — kein echter Athlet, keine Ruhetag-Ableitung
  demoDerivedSets,
  0,         // offsetWeeks
  [],        // weekModel
);

function buildDemoLanes(rows: LoadRow[]): TraceLaneConfig[] {
  const lane = (vals: (number | null)[]) => ({ kind: "line" as const, vals });
  const fmt = (value: number) => Math.round(value).toLocaleString("de-DE");
  return [
    {
      display: { key: "load", title: "Belastung", sub: "Wochenlast", colorVar: "var(--ss)" },
      lane: lane(rows.map((row) => row.total)),
      baseHeight: 70,
      formatValue: fmt,
      formatUnit: () => "TSS",
    },
    {
      display: { key: "ramp", title: "Ramp", sub: "Belastungsaufbau", colorVar: "var(--z2)" },
      lane: lane(rows.map((row) => row.ramp)),
      baseHeight: 70,
      formatValue: fmt,
      formatUnit: () => "TSS/Woche",
    },
    {
      display: { key: "strain", title: "Strain", sub: "Belastungsdichte", colorVar: "var(--thr)" },
      lane: lane(rows.map((row) => row.strain)),
      baseHeight: 70,
      formatValue: fmt,
      formatUnit: () => "Score",
    },
    {
      display: { key: "monotony", title: "Monotonie", sub: "Trainingsrhythmus", colorVar: "var(--vo2)" },
      lane: lane(rows.map((row) => row.monotony)),
      baseHeight: 70,
      formatValue: fmt,
      formatUnit: () => "Index",
    },
  ];
}

const loadLanes = buildDemoLanes(loadRows);

/** Demo-Werte für Block 4 (Analyse) — direkt aus dataset.json, kein Hook.
 *  `buildIntensityDistribution` erwartet `Ride[]` (demoRides schon gebaut). */
const demoIntensity = buildIntensityDistribution(demoRides);
/** Structural Cast: die Demo-Shapes sind identisch zu PaceCurvePoint/PaceZone
 *  (bewusst keine api/-Import-Abhängigkeit von features/, s. types.ts). */
const demoPaceCurve: PaceCurvePoint[] = (demo.paceCurve ?? []) as PaceCurvePoint[];
const demoPaceZones: PaceZone[] = (demo.paceZones ?? []) as PaceZone[];
const demoBike = demo.bikefit ?? { bikeType: "road", goal: "balanced", angles: {} };
const demoRecommendations = compareToTargets(demoBike.angles, demoBike.bikeType, demoBike.goal);

function LoadStoryBlock() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const reducedMotion = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: sectionRef, offset: ["start end", "end start"] });
  const y = useTransform(scrollYProgress, [0, 0.35, 0.7, 1], [40, 0, 0, -24]);
  const opacity = useTransform(scrollYProgress, [0, 0.2, 0.8, 1], [0, 1, 1, 0.8]);

  return (
    <motion.div
      ref={sectionRef}
      className="landing-story__block"
      aria-labelledby="landing-story-title"
      style={reducedMotion ? undefined : { y, opacity }}
    >
      <div className="landing-story__heading">
        <p className="landing-eyebrow">01 · Form &amp; Belastung</p>
        <h2 id="landing-story-title">Belastung wird lesbar.</h2>
        <p>
          Acht Wochen Training in einer Spur: Last, Aufbau, Dichte und Rhythmus — damit klar wird,
          wann Training trägt und wann Erholung dazugehört.
        </p>
      </div>
      <div className="landing-story__chart">
        <TraceCard
          lanes={loadLanes}
          r0={0}
          r1={Math.max(0, loadRows.length - 1)}
          totalDays={loadRows.length}
          todayIdx={loadRows.length - 1}
          eventIdx={null}
          formatDay={(index) => loadRows[index]?.label ?? ""}
          dense
        />
      </div>
    </motion.div>
  );
}

function PlanningStoryBlock() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const reducedMotion = useReducedMotion();
  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start end", "start center"],
  });
  // Side-Einschub laut Fahrplan V4 (translateX)
  const x = useTransform(scrollYProgress, [0, 0.4, 1], [80, 0, 0]);
  const opacity = useTransform(scrollYProgress, [0, 0.2, 0.8, 1], [0, 1, 1, 0.8]);

  return (
    <motion.div
      ref={sectionRef}
      className="landing-story__block"
      style={reducedMotion ? undefined : { x, opacity }}
    >
      <div className="landing-story__heading">
        <p className="landing-eyebrow">02 · Trainingsplanung</p>
        <h2>Woche für Woche sehen, was ansteht.</h2>
        <p>
          Mo–So-Raster mit Plan- und Ist-Einheiten, Verschieben per Drag &amp; Drop und Erholungswochen,
          die das Modell automatisch einplant. So behältst du den Überblick, ohne jede Karte einzeln zu ordnen.
        </p>
      </div>
      <div className="landing-story__chart landing-story__chart--weekgrid">
        <WeekGrid
          weeks={demoWeekGridRows}
          today={DEMO_TODAY}
          canEdit={false}
          trainerProposalMode={false}
          renderDetail={undefined}
        />
      </div>
    </motion.div>
  );
}

function GeneratorStoryBlock() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const reducedMotion = useReducedMotion();
  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start end", "start center"],
  });
  // scale+opacity laut Fahrplan V4
  const scale = useTransform(scrollYProgress, [0, 0.4, 1], [0.8, 1, 1]);
  const opacity = useTransform(scrollYProgress, [0, 0.2, 0.8, 1], [0, 1, 1, 0.8]);

  return (
    <motion.div
      ref={sectionRef}
      className="landing-story__block"
      style={reducedMotion ? undefined : { scale, opacity }}
    >
      <div className="landing-story__heading">
        <p className="landing-eyebrow">03 · Plan-Generator</p>
        <h2>Dein nächster Plan in Sekunden.</h2>
        <p>
          Wähle Belastungsstufe, Modell und Fokus — aus deiner Historie berechnet der Generator
          einen pyramidalen oder linearen Plan, der zu dir passt. Ohne Tabellenkalkulation.
        </p>
      </div>
      <div className="landing-story__chart">
        <PlanPreview
          plan={DEMO_GENERATED_PLAN}
          sport="ride"
        />
      </div>
    </motion.div>
  );
}

function AnalysisStoryBlock() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const reducedMotion = useReducedMotion();
  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start end", "start center"],
  });
  // Zoom-in laut Fahrplan V4 (scale) — gleiches Guard-Muster wie die
  // anderen Blöcke (eigener ref + useScroll + useReducedMotion).
  const scale = useTransform(scrollYProgress, [0, 0.4, 1], [0.8,  1,  1]);
  const opacity = useTransform(scrollYProgress, [0,  0.2, 0.8, 1], [0, 1, 1, 0.8]);

  return (
    <motion.div
      ref={sectionRef}
      className="landing-story__block"
      style={reducedMotion ? undefined : { scale, opacity }}
    >
      <div className="landing-story__heading">
        <p className="landing-eyebrow">04 · Analyse</p>
        <h2>Zahlen, die erklären, statt erklären zu müssen.</h2>
        <p>
          Leistungsverlauf über 90 Minuten und die Intensitätsverteilung deiner Einheiten —
          damit klar wird, wo die Form herkommt.

        </p>
      </div>
      <div className="landing-story__chart">
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <PowerCurveTraceCard
            powerCurves={demo.powerCurve}
            unit={"W" as PowerUnit}
            weightKg={72}
            formatValue={(watts) => Math.round(watts).toLocaleString("de-DE")}
          />
          <IntensityBand dist={demoIntensity} />
        </div>
      </div>
    </motion.div>
  );
}
function MultiSportStoryBlock() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const reducedMotion = useReducedMotion();
  const [sport, setSport] = useState<"ride" | "run" | "swim">("ride");
  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start end", "start center"],
  });
  // Card-shift laut Fahrplan V4 — Sport-Umschalter bleibt lokal und schreibt
  // bewusst NICHT in localStorage (anders als der Dashboard-SportToggle).
  const x = useTransform(scrollYProgress, [0, 0.4, 1], [64, 0, 0]);
  const opacity = useTransform(scrollYProgress, [0, 0.2, 0.8, 1], [0, 1, 1, 0.8]);
  const labels: Record<"ride" | "run" | "swim", string> = {
    ride: "Rad",
    run: "Lauf",
    swim: "Schwimmen",
  };

  return (
    <motion.div
      ref={sectionRef}
      className="landing-story__block"
      style={reducedMotion ? undefined : { x, opacity }}
    >
      <div className="landing-story__heading">
        <p className="landing-eyebrow">05 · Multi-Sport &amp; Bike-Fit</p>
        <h2>Rad, Lauf, Schwimm — alles an einem Ort.</h2>
        <p>
          Ein Umschalter für deine Sportarten, Pace-Trainingszonen fürs Laufen und eine
          Bike-Fit-Analyse direkt in der App. Dein Trainingskonzept endet nicht an der Rennrad-Saison.
        </p>
      </div>
      <div className="landing-story__chart">
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }} role="tablist" aria-label="Sportart wechseln">
            {(["ride", "run", "swim"] as const).map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setSport(key)}
                aria-pressed={sport === key}
                style={{
                  padding: "8px 18px",
                  borderRadius: "var(--pill)",
                  border: "1px solid rgba(255, 255, 255, 0.18)",
                  background: sport === key ? "var(--ss)" : "var(--glass)",
                  color: sport === key ? "#17110a" : "var(--ink)",
                  fontFamily: "var(--font-mono)",
                  fontSize: ".78rem",
                  cursor: "pointer",
                  transition: "background 160ms ease, color 160ms ease",
                }}
              >
                {labels[key]}
              </button>
            ))}
          </div>

          {sport === "ride" && (
            <div className="landing-sport-note">
              <p>
                Beim Rad dreht sich alles um Leistung, Belastung und Form — genau das,
                was du in den Blöcken 01–04 oben schon gesehen hast: Leistungsskala,
                Wochenlast, Power-Curve und Intensitätsverteilung.
              </p>
            </div>
          )}

          {sport === "run" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <PaceCurveCard curve={demoPaceCurve} thresholdUnit="min/km" activityNoun="Läufe" />
              <PaceZoneScale
                zones={demoPaceZones}
                scaleMaxSpeed={demo.scaleMaxSpeed ?? 0}
                degraded={false}
                thresholdUnit="min/km"
                sport="run"
              />
            </div>
          )}

          {sport === "swim" && (
            <div className="landing-sport-note">
              <p>
                Schwimmen wird ebenso unterstützt, inklusive Einheitenplanung und Pace-Zonen.
                Sobald deine Einheiten in intervals.icu laufen, zeigt dir das Dashboard dieselben
                Analysen wie für Rad und Lauf.
              </p>
            </div>
          )}

          <p className="landing-eyebrow landing-story__sub-eyebrow">Bike-Fit</p>
          <IterationResult
            bikeType={demoBike.bikeType}
            goal={demoBike.goal}
            angles={demoBike.angles}
            recommendations={demoRecommendations}
          />
        </div>
      </div>
    </motion.div>
  );
}


/** Jeder Block bekommt eine EIGENE `.landing-story`-Sektion (eigener
 *  155vh-Scrollbereich + eigenes Sticky) statt eines gemeinsamen Containers
 *  für alle drei — sonst stapeln sich die Blöcke nur nacheinander, statt dass
 *  jeder beim Scrollen sein eigenes "Kapitel" bekommt und den vorherigen
 *  ablöst (Live-Check nach Etappe 4, 22.09.2026). Die Scroll-Animation selbst
 *  hängt ohnehin am jeweiligen Block-Ref, nicht am Wrapper — das Aufteilen
 *  ändert an der Animationslogik in den Blöcken nichts. */
function ScrollStory() {
  return (
    <>
      <section id="demo-preview" className="landing-story" aria-label="Demo-Einblick: Form &amp; Belastung">
        <div className="landing-story__sticky">
          <LoadStoryBlock />
        </div>
      </section>
      <section className="landing-story" aria-label="Demo-Einblick: Trainingsplanung">
        <div className="landing-story__sticky">
          <PlanningStoryBlock />
        </div>
      </section>
      <section className="landing-story" aria-label="Demo-Einblick: Plan-Generator">
        <div className="landing-story__sticky">
          <GeneratorStoryBlock />
        </div>
      </section>
      <section className="landing-story" aria-label="Demo-Einblick: Analyse">
        <div className="landing-story__sticky">
          <AnalysisStoryBlock />
        </div>
      </section>
      <section className="landing-story" aria-label="Demo-Einblick: Multi-Sport und Bike-Fit">
        <div className="landing-story__sticky">
          <MultiSportStoryBlock />
        </div>
      </section>
    </>
  );
}

export function LandingPage() {
  return (
    <main className="landing-page">
      <section className="landing-hero" aria-labelledby="landing-title">
        <div className="landing-hero__copy">
          <p className="landing-eyebrow">Training Intelligence</p>
          <h1 id="landing-title">
            Dein Training.
            <br />
            <span>Klarer gesehen.</span>
          </h1>
          <p className="landing-hero__intro">
            Ein persönliches Trainingsdashboard für Belastung, Form und Fortschritt — mit Daten,
            die nicht im Weg stehen, sondern Entscheidungen leichter machen.
          </p>
          <div className="landing-hero__actions">
            <a className="landing-button landing-button--primary" href="#demo-preview">
              Demo ansehen
            </a>
            <a className="landing-button landing-button--ghost" href="/app">
              Zum Dashboard
            </a>
          </div>
          <dl className="landing-metrics" aria-label="Demo-Datensatz">
            <div>
              <dt>Zeitraum</dt>
              <dd>{weekCount} Wochen</dd>
            </div>
            <div>
              <dt>Aktivitäten</dt>
              <dd>{activityCount}</dd>
            </div>
            <div>
              <dt>Sportarten</dt>
              <dd>{sportCount}</dd>
            </div>
          </dl>
        </div>

        <div className="landing-signature" aria-hidden="true">
          <div className="landing-signature__orb landing-signature__orb--large" />
          <div className="landing-signature__orb landing-signature__orb--small" />
          <div className="landing-signature__grid" />
          <div className="landing-signature__line landing-signature__line--one" />
          <div className="landing-signature__line landing-signature__line--two" />
          <div className="landing-signature__readout">
            <span>LOAD / FORM / PROGRESS</span>
            <strong>↗</strong>
          </div>
        </div>
      </section>

      <ScrollStory />
    </main>
  );
}
