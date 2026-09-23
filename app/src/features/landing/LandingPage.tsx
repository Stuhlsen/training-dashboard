/* ============================================================
   FEATURES/LANDING/LANDINGPAGE.TSX — Fahrplan 22 (Etappen 3–8)

   Hero + Story-Blöcke (1–5) nutzen echte Dashboard-Komponenten mit
   dem Etappe-2-Demo-Datensatz statt echten Athletendaten. Etappe 6
   ergänzt die normalen (nicht animierten) Sektionen um Hero und Blöcke
   herum: "Problem/Warum" direkt nach dem Hero, "Für wen" nach Block 5
   und den Abschluss-CTA mit Wartelisten-Formular ganz unten. Etappe 7b
   legt einen festen Szenen-Hintergrund darunter (LandingBackdrop), der
   an unsichtbaren Kapitelmarkern von Hero-Video zu Bild überblendet.

   Scroll-Animation über Framer Motion (nur im Landing-Bundle, code-
   gesplittet). Mobile/reduced-motion: landing.css erzwingt bei
   `max-width: 768px`/`prefers-reduced-motion: reduce` position:static
   und `transform: none !important` auf `.landing-story__block` — die
   JS-Seite muss dafür nichts zusätzlich abfragen, nur `useReducedMotion()`
   respektieren, damit vor dem ersten Scroll kein unsichtbarer Zustand
   hängen bleibt.
   ============================================================ */

import { useEffect, useRef, useState, type FormEvent } from "react";
import { motion, useReducedMotion, useScroll, useTransform } from "framer-motion";
import { loadDemoDataset } from "../../api/demo-pipeline";
import { addToWaitlist } from "../../api/supabase/waitlist";
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
import { buildDemoFormTrend, countDemoWeeks, toPlanCard, toRide, withDemoPmc } from "./landing-demo-model";
import { flattenPlanCards } from "../planning/plan-persist";
import { buildHeroFormChart } from "./hero-form-chart-model";
import { HeroFormChart } from "./HeroFormChart";

const demo = loadDemoDataset();
const activityCount = demo.rides.length;
const sportCount = new Set(demo.rides.map((ride) => ride.sport)).size;

/** Letztes Datum im Demo-Zeitraum — als todayIso, damit die Karten nicht
 *  als "verpasst" markiert werden. */
const DEMO_TODAY = "2026-03-01";

const weekCount = countDemoWeeks(demo.rides);

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

/** Hero-Widget (Fahrplan 22, nach E8): echte Form-Kurve statt Deko. Demo-
 *  Fahrten bekommen CTL/ATL lokal gerechnet (withDemoPmc), die Prognose
 *  kommt aus demselben Demo-Plan wie Block 03 (startet am Tag nach
 *  DEMO_TODAY). */
const FORM_PROGNOSIS_DAYS = 28;
const demoFormTrend = buildDemoFormTrend(
  withDemoPmc(demoRides),
  flattenPlanCards(DEMO_GENERATED_PLAN),
  DEMO_TODAY,
  FORM_PROGNOSIS_DAYS,
);

const heroFormChart = demoFormTrend ? buildHeroFormChart(demoFormTrend) : null;

function HeroFormWidget() {
  const reducedMotion = useReducedMotion();
  if (!heroFormChart) return null;
  return (
    <motion.div
      className="landing-form-widget"
      initial={reducedMotion ? false : { opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.7, ease: "easeOut", delay: 0.2 }}
    >
      <HeroFormChart chart={heroFormChart} />
    </motion.div>
  );
}

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
        <p className="landing-eyebrow">01 · Belastung</p>
        <h2 id="landing-story-title">Wie viel ist zu viel?</h2>
        <p>
          Die Wochenlast zeigt, wie hart du trainiert hast. Steigt sie zu schnell oder ist jede
          Woche gleich, siehst du das hier, bevor du es in den Beinen merkst.
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
        <p className="landing-eyebrow">02 · Planung</p>
        <h2>Deine Woche, Tag für Tag.</h2>
        <p>
          Geplante und gefahrene Einheiten stehen nebeneinander. Fällt ein Termin aus, ziehst du
          die Einheit einfach auf einen anderen Tag.
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
        <p className="landing-eyebrow">03 · Plan erstellen</p>
        <h2>Ein neuer Plan in ein paar Klicks.</h2>
        <p>
          Du gibst an, wie viel Zeit du pro Woche hast, an welchen Tagen du trainierst und worauf
          du hinarbeitest. Daraus entsteht ein Plan mit Aufbau- und Erholungswochen.
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
        <p className="landing-eyebrow">04 · Auswertung</p>
        <h2>Wo stehst du gerade?</h2>
        <p>
          Die Leistungskurve zeigt deine besten Werte von 5 Sekunden bis 90 Minuten. Darunter
          siehst du, wie viel Zeit du locker, mittel und hart unterwegs warst.
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
        <p className="landing-eyebrow">05 · Laufen, Schwimmen, Bike-Fit</p>
        <h2>Nicht nur fürs Rad.</h2>
        <p>
          Läufe und Schwimmeinheiten werden auch ausgewertet, mit eigenen Pace-Zonen. Mit der
          Bike-Fit-Analyse prüfst du anhand eines Fotos, ob deine Sitzposition passt.
        </p>
      </div>
      <div className="landing-story__chart">
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }} role="group" aria-label="Sportart wechseln">
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
                Rad ist der Schwerpunkt. Leistung, Wochenlast und Leistungskurve hast du
                weiter oben schon gesehen.
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
                Schwimmeinheiten lassen sich genauso planen und auswerten, mit Pace pro 100 Meter.
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
 *  110vh-Scrollbereich + eigenes Sticky) statt eines gemeinsamen Containers
 *  für alle drei — sonst stapeln sich die Blöcke nur nacheinander, statt dass
 *  jeder beim Scrollen sein eigenes "Kapitel" bekommt und den vorherigen
 *  ablöst (Live-Check nach Etappe 4, 22.09.2026). Die Scroll-Animation selbst
 *  hängt ohnehin am jeweiligen Block-Ref, nicht am Wrapper — das Aufteilen
 *  ändert an der Animationslogik in den Blöcken nichts. */
function ScrollStory() {
  return (
    <>
      <section id="demo-preview" className="landing-story" aria-label="Demo: Belastung">
        <div className="landing-story__sticky">
          <LoadStoryBlock />
        </div>
      </section>
      <section className="landing-story" aria-label="Demo: Planung">
        <div className="landing-story__sticky">
          <PlanningStoryBlock />
        </div>
      </section>
      <section className="landing-story" aria-label="Demo: Plan erstellen">
        <div className="landing-story__sticky">
          <GeneratorStoryBlock />
        </div>
      </section>
      <SceneMarker scene={2} />
      <section className="landing-story" aria-label="Demo: Auswertung">
        <div className="landing-story__sticky">
          <AnalysisStoryBlock />
        </div>
      </section>
      <section className="landing-story" aria-label="Demo: Laufen, Schwimmen, Bike-Fit">
        <div className="landing-story__sticky">
          <MultiSportStoryBlock />
        </div>
      </section>
    </>
  );
}

/** Problem/Warum — normale Sektion direkt nach dem Hero (Etappe 6). Kein
 *  Story-Block: keine Sticky-, keine Framer-Animation. Kurz, worum es geht
 *  und warum es das Dashboard gibt. */
function ProblemWhySection() {
  return (
    <section className="landing-section" aria-labelledby="landing-why-title">
      <div className="landing-section__inner">
        <p className="landing-eyebrow">Worum es geht</p>
        <h2 id="landing-why-title">Trainingsdaten liegen oft verstreut.</h2>
        <p className="landing-section__lead">
          Die Daten stecken in der Uhr, in der App und manchmal im Notizbuch. Einzelne Einheiten
          siehst du, aber nicht, wie sie zusammenspielen.
        </p>
        <p>
          Hier liegt alles an einem Ort. Du siehst, wann ein harter Block Sinn macht und wann du
          Pause brauchst.
        </p>
      </div>
    </section>
  );
}

/** Für wen — normale Sektion nach Block 5 (Etappe 6). Zwei Fälle: allein
 *  trainieren und mit Trainer trainieren. Es werden nur Funktionen genannt,
 *  die es wirklich gibt (Plan-Generator, Verschieben im Planungstab,
 *  Trainer-Rolle/Vorschläge — CoachPanel.tsx, ProposalList.tsx). */
function AudienceSection() {
  return (
    <section className="landing-section" aria-labelledby="landing-audience-title">
      <div className="landing-section__inner">
        <p className="landing-eyebrow">Für wen</p>
        <h2 id="landing-audience-title">Für dich, ob allein oder mit Trainer.</h2>
        <div className="landing-audience">
          <div className="landing-card">
            <h3>Du trainierst allein</h3>
            <p>
              Der Plan-Generator baut dir einen Plan aus deiner Zeit, deinen Trainingstagen und
              deinem Ziel. Kommt etwas dazwischen, verschiebst du die Einheit im Planungstab.
            </p>
          </div>
          <div className="landing-card">
            <h3>Du trainierst mit Trainer</h3>
            <p>
              Wer dich trainiert, sieht deinen Plan und deine Belastung und kann dir Änderungen
              vorschlagen. Du entscheidest, was du übernimmst.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

/** Gleiche Regeln wie die Check-Constraints in Migration 0054 (Muster) und
 *  0055 (Länge) — bei Änderung beide Seiten anpassen. */
const EMAIL_PATTERN = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+[.][A-Za-z]{2,}$/;
const EMAIL_MAX_LENGTH = 254;

/** Abschluss-CTA mit Wartelisten-Formular (Etappe 6). Zustände: sendet,
 *  gesendet, Fehler. Button ist während des Sendens gesperrt. Pflicht-
 *  Checkbox für die Einwilligung + kurzer Datenschutz-Hinweis. */
function WaitlistSection() {
  const [email, setEmail] = useState("");
  const [consent, setConsent] = useState(false);
  const [status, setStatus] = useState<"idle" | "sending" | "done" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (status === "sending") return;

    if (!consent) {
      setStatus("error");
      setErrorMessage("Bitte bestätige zuerst, dass wir deine Adresse speichern dürfen.");
      return;
    }
    const trimmed = email.trim();
    if (trimmed.length > EMAIL_MAX_LENGTH || !EMAIL_PATTERN.test(trimmed)) {
      setStatus("error");
      setErrorMessage("Bitte gib eine gültige E-Mail-Adresse ein.");
      return;
    }

    setStatus("sending");
    setErrorMessage("");
    const result = await addToWaitlist(email);
    if (result.ok) {
      setStatus("done");
    } else {
      setStatus("error");
      setErrorMessage("Das hat gerade nicht geklappt. Bitte versuch es später noch einmal.");
    }
  };

  return (
    <section className="landing-section landing-section--final" aria-labelledby="landing-waitlist-title">
      <div className="landing-section__inner">
        <p className="landing-eyebrow">Warteliste</p>
        <h2 id="landing-waitlist-title">Sei dabei, wenn die Anmeldung startet.</h2>
        <p className="landing-section__lead">
          Trag dich ein, dann melden wir uns, sobald du dich anmelden kannst.
        </p>

        {status === "done" ? (
          <p className="landing-waitlist__done" role="status">
            Du stehst auf der Liste.
          </p>
        ) : (
          <form className="landing-waitlist" onSubmit={handleSubmit} noValidate>
            <div className="landing-waitlist__field">
              <label htmlFor="waitlist-email">E-Mail-Adresse</label>
              <input
                id="waitlist-email"
                type="email"
                autoComplete="email"
                maxLength={EMAIL_MAX_LENGTH}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="du@beispiel.de"
                disabled={status === "sending"}
              />
            </div>
            <label className="landing-waitlist__consent">
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
                disabled={status === "sending"}
              />
              <span>
                Ich willige ein, dass meine E-Mail-Adresse für die Warteliste gespeichert und
                ich über den Start benachrichtigt werde.
              </span>
            </label>
            {status === "error" && (
              <p className="landing-waitlist__error" role="alert">
                {errorMessage}
              </p>
            )}
            <button
              type="submit"
              className="landing-button landing-button--primary"
              disabled={status === "sending"}
            >
              {status === "sending" ? "Wird eingetragen…" : "Auf die Warteliste"}
            </button>
          </form>
        )}

        <p className="landing-waitlist__privacy">
          Deine Adresse wird nur für die Benachrichtigung genutzt. Auf Wunsch löschen wir sie
          wieder.
        </p>

        <div className="landing-waitlist__who">
          <p className="landing-eyebrow">Wer dahintersteckt</p>
          <p>
            Stuhlsen fährt Rad und wollte besser verstehen, was das eigene Training bringt. Daraus ist
            dieses Dashboard entstanden.
          </p>
        </div>

        <div className="landing-waitlist__cta">
          <a className="landing-button landing-button--ghost" href="/app">
            Zum Dashboard
          </a>
        </div>
      </div>
    </section>
  );
}

/** Etappe 7b: Pfad wie in AppBackground.tsx über BASE_URL, nicht hart "/". */
const LANDING_ASSETS = `${import.meta.env.BASE_URL}assets/landing/`;

/** Szenen des Landing-Hintergrunds (Etappe 7b): Szene 0 ist das Hero-Video
 *  (Poster als Standbild), 1–3 die Kapitelbilder Rad, Feldweg/Laufen, See. */
const SCENES = [
  { image: "hero-poster.webp", width: 1280, height: 720 },
  { image: "trenner-1.webp", width: 1584, height: 672 },
  { image: "trenner-2.webp", width: 1584, height: 672 },
  { image: "trenner-3.webp", width: 1584, height: 672 },
] as const;

/** Aktive Szene = höchster `.landing-scene-marker`, dessen Oberkante die
 *  Bildschirmmitte schon passiert hat. `seen` merkt sich die weiteste
 *  erreichte Szene, damit Bilder erst kurz vor ihrem Einsatz laden. */
function useActiveScene(): { active: number; seen: number } {
  const [scene, setScene] = useState({ active: 0, seen: 0 });

  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const line = window.innerHeight * 0.5;
      let active = 0;
      document.querySelectorAll<HTMLElement>(".landing-scene-marker").forEach((marker) => {
        if (marker.getBoundingClientRect().top < line) {
          active = Math.max(active, Number(marker.dataset.scene));
        }
      });
      setScene((prev) =>
        prev.active === active && prev.seen >= active
          ? prev
          : { active, seen: Math.max(prev.seen, active) },
      );
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    schedule();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      cancelAnimationFrame(frame);
    };
  }, []);

  return scene;
}

/** Unsichtbare Kapitelgrenze für den Szenenwechsel im Hintergrund. */
function SceneMarker({ scene }: { scene: 1 | 2 | 3 }) {
  return <div className="landing-scene-marker" data-scene={scene} aria-hidden="true" />;
}

/** Ein einziger fester Hintergrund für die ganze Landingpage (Etappe 7b):
 *  blendet beim Scrollen von Szene zu Szene über, statt Trennbilder als
 *  Balken über das feste Foto zu legen (Alex' Rückmeldung: zwei Bildebenen
 *  gleichzeitig wirkten verwirrend). Ersetzt auf "/" das Hintergrundbild
 *  aus AppBackground.tsx (das dort auf "/" keins mehr lädt). Das Video spielt nur in Szene 0; bei
 *  reduced-motion gibt es nur das Poster-Bild und keinen Überblend-Effekt. */
function LandingBackdrop() {
  const reducedMotion = useReducedMotion();
  const { active, seen } = useActiveScene();
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (active === 0) {
      // Abgelehntes Autoplay ist kein Fehler: dann bleibt das Poster stehen.
      video.play().catch(() => undefined);
    } else {
      video.pause();
    }
  }, [active]);

  return (
    <div className="landing-backdrop" aria-hidden="true">
      {SCENES.map((scene, index) => {
        const className = `landing-backdrop__layer${index === active ? " is-active" : ""}`;
        const src = `${LANDING_ASSETS}${scene.image}`;
        if (index === 0 && !reducedMotion) {
          return (
            <video
              key={scene.image}
              ref={videoRef}
              className={className}
              autoPlay
              muted
              loop
              playsInline
              preload="auto"
              poster={src}
              width={scene.width}
              height={scene.height}
            >
              <source src={`${LANDING_ASSETS}hero.mp4`} type="video/mp4" />
            </video>
          );
        }
        if (index > seen + 1) return null;
        return (
          <img
            key={scene.image}
            className={className}
            src={src}
            alt=""
            width={scene.width}
            height={scene.height}
            decoding="async"
          />
        );
      })}
      <div className="landing-backdrop__shade" />
    </div>
  );
}

export function LandingPage() {
  return (
    <main className="landing-page">
      <LandingBackdrop />

      <section className="landing-hero" aria-labelledby="landing-title">
        <div className="landing-hero__copy">
          <p className="landing-eyebrow">Trainingsdashboard für Ausdauersport</p>
          <h1 id="landing-title">
            Dein Training
            <br />
            <span>auf einen Blick.</span>
          </h1>
          <p className="landing-hero__intro">
            Hier landen deine Fahrten, Läufe und Schwimmeinheiten. Du siehst, wie müde du gerade
            bist und ob sich das Training lohnt.
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

        <HeroFormWidget />
      </section>

      <ProblemWhySection />

      <SceneMarker scene={1} />

      <ScrollStory />

      <SceneMarker scene={3} />

      <AudienceSection />
      <WaitlistSection />
    </main>
  );
}
