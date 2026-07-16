/* ============================================================
   APP.JS — Einstiegspunkt (ES-Modul)
   Tab-Navigation, Chart-Gruppen, Athleten-Toggle (Athlet 1 / 2),
   renderAll(), Chart-Explainer, Period-Toggles
   Ladereihenfolge ergibt sich aus dem Import-Graph — kein
   Script-Tag-Management mehr in index.html nötig.
   ============================================================ */

import { isoWeekKey, monthlyFromRides } from "./core/aggregate.js";
import { cadenceCoach } from "./core/cadence.js";
import { weeklyConsistency } from "./core/consistency.js";
import { weightTrend, energyView, hydrationSeries, estimateBMR } from "./core/body.js";
import { efficiencyTrend } from "./core/efficiency.js";
import {
  eftpHistory,
  eftpHistoryFromWellness,
  mergeEftpHistories,
  forecastFtp,
  dateForTarget,
} from "./core/ftp-forecast.js";
import { buildBriefing } from "./core/briefing.js";
import { localISODate } from "./core/format.js";
import { nextPlannedSession } from "./core/ftp-progress.js";
import { buildLoadGuard } from "./core/loadguard.js";
import { currentPmc, tsbTrend } from "./core/pmc.js";
import { assessReadiness } from "./core/readiness.js";
import { recordProgression } from "./core/records.js";
import { buildWeekReview } from "./core/weekreview.js";
import { weeklyZoneShares } from "./core/zones.js";
import { CONFIG } from "./state/config.js";
import { Data } from "./state/data.js";
import { el, Tooltip } from "./ui/dom.js";
import { activateTab, initTabs, initChartGroupToggles } from "./ui/nav.js";
import { Charts } from "./ui/charts/index.js";
import { Overview } from "./ui/overview.js";
import { Table } from "./ui/table.js";
import { Planned } from "./ui/planned.js";
import { PlanCardDialog } from "./ui/plan-card-dialog.js";
import { Analysis } from "./ui/analysis.js";
import { ChartVisibility } from "./ui/chart-visibility.js";
import { renderReadiness, renderWeekReview, renderRecords } from "./ui/panels.js";
import { initSession, isAthlete } from "./state/session.js";
import { getState as getWellbeingState } from "./state/wellbeing.js";
import { EventTimeline } from "./ui/event-timeline.js";
import "./ui/header.js";
import "./ui/wellbeing-card.js";

/* ── Athleten-Toggle ─────────────────────────────────────────── */
function initAthleteToggle() {
  const wrap = el("athlete-toggle");
  if (!wrap) return;

  wrap.innerHTML = CONFIG.athletes
    .map(
      (a) => `
    <button class="athlete-btn${a.id === Data.activeAthleteId ? " active" : ""}" data-athlete="${a.id}">${a.name}</button>
  `
    )
    .join("");

  wrap.querySelectorAll(".athlete-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.dataset.athlete;
      if (id === Data.activeAthleteId) return;
      wrap.querySelectorAll(".athlete-btn").forEach((b) => b.classList.toggle("active", b === btn));
      localStorage.setItem("active_athlete", id);
      await renderAll(id);
    });
  });
}

/* ── Hat der aktive Athlet Athlet 1s Plan-1/2-Struktur? ─────────
   Steuert NUR die Plan-1/2-spezifischen Inhalte (HRV/RHF-Split an
   der W0-Übergangswoche, "Plan 2"/W12-Retest-Texte, Wochen-Aggregation
   nach Plan- statt Kalenderwochen) — exklusiv Athlet 1, erkannt an
   ride.week (Athlet 2 hat das bewusst nicht, s. map-activity.js).
   Für den Planungstab selbst (auch bei Athlet 2 mit eigenem Plan seit
   GFNY Bremen 2026) ist stattdessen `hasPlanningTab` unten zuständig. */
function hasOwnPlan() {
  return Data.rides.some((r) => r.week);
}

/** Planungs-Tab im UI je nach Datensatz ein-/ausblenden */
function togglePlanningTabVisibility(show) {
  const btn = document.querySelector('.tab-btn[data-tab="planned"]');
  if (btn) btn.classList.toggle("hidden", !show);
  // Falls aktuell aktiver Tab "planned" ist aber nicht mehr verfügbar → zurück zu Übersicht
  if (!show && btn?.classList.contains("active")) {
    activateTab("overview");
  }
}

/** Chart-Erklärtexte je Athlet anpassen — generische Vergleichsdaten statt
    personalisierte "du"-Ansprache und Plan-spezifische Begriffe */
function updateChartExplainers(ownPlan, ftp) {
  const set = (id, html) => {
    const e = el(id);
    if (e) e.innerHTML = html;
  };

  if (ownPlan) {
    set(
      "explainer-pmc",
      `CTL (blau, Fläche) = aufgebaute Fitness über Wochen. ATL (rot, gestrichelt) = aktuelle Ermüdung der letzten Tage. TSB (grün, rechte Achse) = Form: positiv/grün = frisch, negativ/rot = müde. Die grüne Zone markiert den Sweet Spot (TSB -10 bis -30) — hier trainierst du produktiv ohne Übertraining.`
    );
    set(
      "explainer-trimp",
      `Balken: TRIMP-Wochenlast (grün &lt;400 · gelb · orange · rot &gt;900). Weiße Linie: CTL-Anstieg pro Woche — der grüne Korridor (+3 bis +6) ist der sichere Aufbaubereich, ab +8 steigt das Überlastungsrisiko deutlich. ⚠ markiert Foster-Monotonie ≥ 2: gleiche Last jeden Tag ist riskanter als gemischte Tage. Erholungswochen sollen grün und ohne ⚠ sein.`
    );
    set(
      "explainer-power-curve",
      `Beste gemessene Leistung je Zeitintervall — von 1 Sekunde (Sprint) bis 60 Minuten (Ausdauer). Gold: FTP (${ftp}W); der rote Bereich darüber ist die anaerobe Reserve. Der Blöcke-Toggle legt die Kurven der Trainingsblöcke übereinander: so siehst du, WO jeder Block gewirkt hat — Sweet Spot sollte 20–60 min heben, VO2max die 1–8 min. W/kg nutzt das Gewicht aus Apple Health.`
    );
    set(
      "explainer-hrv",
      `Höhere HRV-Werte deuten auf bessere Erholung und geringeren Stress hin. Die goldene Übergangswoche (W0) markiert den Wechsel der Messmethode: Plan 1 nutzt Apple Health RMSSD (lila), Plan 2 intervals.icu SDNN Schlafschnitt (orange) — beide Methoden liefern grundsätzlich unterschiedliche absolute Werte, weshalb Trend und Mittelwert pro Plan getrennt berechnet werden statt eine gemeinsame Linie zu bilden.`
    );
    set(
      "explainer-rhf",
      `Ein sinkender Ruhepuls über mehrere Wochen ist ein verlässliches Zeichen kardiovaskulärer Anpassung an das Training. Die goldene Übergangswoche (W0) trennt Plan 1 (rot) und Plan 2 (orange) visuell, ohne dass die Messmethode hier wechselt — beide Mittelwerte sind direkt vergleichbar.`
    );

    set(
      "explainer-scatter",
      `Jeder Punkt zeigt eine Fahrt: Tempo (x-Achse) gegen Durchschnittsherzfrequenz (y-Achse). Punkte oben links sind effizient — schnelles Tempo bei niedriger Herzfrequenz. Die Phasenfarben zeigen wie sich diese Beziehung über die Trainingsphasen verschoben hat.`
    );
    set(
      "legend-scatter",
      `
      <div class="legend-item"><div class="legend-dot" style="background:#c9a84c"></div> Vorbereitung</div>
      <div class="legend-item"><div class="legend-dot" style="background:#6b7280"></div> Phase 1</div>
      <div class="legend-item"><div class="legend-dot" style="background:#4a7fa8"></div> Phase 2</div>
      <div class="legend-item"><div class="legend-dot" style="background:#7c5cbf"></div> Phase 3</div>
    `
    );

    set("note-cadence", `RPM pro Fahrt · gestrichelt = Ziel ${CONFIG.cadenceTarget} RPM`);
    set("note-hrv", `Plan 1 (lila) · Übergang (gold) · Plan 2 (orange)`);
    set("note-rhf", `Plan 1 (rot) · Übergang (gold) · Plan 2 (orange)`);
    set("note-sleep", `Nur Plan 2 · intervals.icu`);
    set("efficiency-note", `Nur Powermeter-Fahrten (ab W6)`);
  } else {
    set(
      "explainer-pmc",
      `CTL (blau, Fläche) = aufgebaute Fitness über Wochen. ATL (rot, gestrichelt) = aktuelle Ermüdung der letzten Tage. TSB (grün, rechte Achse) = Form: positiv/grün = frisch, negativ/rot = müde. Die grüne Zone markiert den Sweet Spot (TSB -10 bis -30) — produktive Trainingsbelastung ohne Übertraining.`
    );
    set(
      "explainer-trimp",
      `Balken: TRIMP-Wochenlast (grün &lt;400 · gelb · orange · rot &gt;900). Weiße Linie: CTL-Anstieg pro Kalenderwoche — Korridor +3 bis +6 = nachhaltiger Aufbau, ab +8 deutlich erhöhtes Überlastungsrisiko. ⚠ = Foster-Monotonie ≥ 2 (Belastung zu gleichförmig verteilt).`
    );
    set(
      "explainer-power-curve",
      `Beste gemessene Leistung je Zeitintervall — von 1 Sekunde (Sprint) bis 60 Minuten (Ausdauer).${ftp ? ` Gold: FTP (${ftp}W).` : ""} Der Blockvergleich ist nur für den eigenen Trainingsplan verfügbar; W/kg nutzt das Gewicht aus intervals.icu.`
    );
    set(
      "explainer-hrv",
      `Höhere HRV-Werte deuten auf bessere Erholung und geringeren Stress hin. Da kein eigener Trainingsplan vorliegt, wird hier ein durchgehender Verlauf ohne Plan-Trennung gezeigt.`
    );
    set(
      "explainer-rhf",
      `Ein sinkender Ruhepuls über mehrere Wochen ist ein verlässliches Zeichen kardiovaskulärer Anpassung an das Training.`
    );

    set(
      "explainer-scatter",
      `Jeder Punkt zeigt eine Fahrt: Tempo (x-Achse) gegen Durchschnittsherzfrequenz (y-Achse). Punkte oben links sind effizient — schnelles Tempo bei niedriger Herzfrequenz.`
    );
    set(
      "legend-scatter",
      `<div class="legend-item"><div class="legend-dot" style="background:#4a7fa8"></div> Fahrten</div>`
    );

    set("note-cadence", `RPM pro Fahrt`);
    set("note-hrv", `Verlauf über den erfassten Zeitraum`);
    set("note-rhf", `Verlauf über den erfassten Zeitraum`);
    set("note-sleep", `intervals.icu`);
    set("efficiency-note", `Nur Powermeter-Fahrten`);
  }
}

/** FTP-Projektion-Titel/Erklärtext: Athlet 1 hat einen festen Retest-Termin
 *  (W12), Athlet 2 keinen eigenen Plan — dort zeigt targetISO das Datum,
 *  an dem der eFTP-Trend das Ziel erreichen würde (core/ftp-forecast.js::
 *  dateForTarget), oder ist null, wenn sich kein Horizont ableiten lässt. */
function updateFtpForecastText(ownPlan, goal, targetISO) {
  const set = (id, html) => {
    const e = el(id);
    if (e) e.innerHTML = html;
  };
  if (ownPlan) {
    set("title-ftp-forecast", "FTP-Projektion · Retest W12");
    set(
      "explainer-ftp-forecast",
      `Lineare Fortschreibung der eFTP-Entwicklung der letzten 8 Wochen auf den Retest-Termin — der Fächer zeigt die realistische Spannweite, keine Punktversprechen. Gold: das ${goal}-W-Ziel. Zweck: vor dem Taper wissen, ob das Ziel in Reichweite ist, statt in W11 aus Frust zu viel nachzulegen.`
    );
  } else if (targetISO) {
    set("title-ftp-forecast", `FTP-Projektion · Ziel ${goal}W`);
    set(
      "explainer-ftp-forecast",
      `Lineare Fortschreibung der eFTP-Entwicklung der letzten 8 Wochen — der Fächer zeigt die realistische Spannweite bis zu dem Datum, an dem das ${goal}-W-Ziel beim aktuellen Trend erreichbar wäre. Keine Terminvorgabe wie bei einem Plan-Retest, sondern eine reine Trend-Fortschreibung.`
    );
  } else {
    set("title-ftp-forecast", "FTP-Projektion");
    set(
      "explainer-ftp-forecast",
      `eFTP-Verlauf aus intervals.icu (Ramp-Test-Schätzung). Der aktuelle Trend lässt aktuell kein belastbares Zieldatum${goal ? ` für ${goal} W` : ""} ableiten — sobald genug Datenpunkte in eine klare Richtung zeigen, erscheint hier eine Prognose.`
    );
  }
}

/* ── Wochen/Monats-Toggle für Volumen, TRIMP und Wetter ─────── */

/** Liest oder setzt den Period-Toggle-Status für den aktuellen Athleten */
function getPeriod(chartId) {
  return localStorage.getItem(`period_${Data.activeAthleteId}_${chartId}`) || "week";
}
function setPeriod(chartId, value) {
  localStorage.setItem(`period_${Data.activeAthleteId}_${chartId}`, value);
}

/** Initialisiert die drei Period-Toggle-Buttons und rendert Charts entsprechend */
function initPeriodToggles(rides, weekly, guard, onBarClick) {
  const charts = [
    {
      toggleId: "toggle-weekly",
      titleId: "title-weekly",
      chartFn: (data, period) => Charts.renderWeeklyVolume("chart-weekly", data, onBarClick, period),
      titleWeek: "Wöchentliches Volumen (km)",
      titleMonth: "Monatliches Volumen (km)",
    },
    {
      toggleId: "toggle-trimp",
      titleId: "title-trimp",
      chartFn: (data, period) =>
        Charts.renderTrimp("chart-trimp", data, period === "month" ? null : guard, period),
      titleWeek: "Belastungswächter · TRIMP, Ramp & Monotonie",
      titleMonth: "Trainingsbelastung TRIMP pro Monat",
    },
    {
      toggleId: "toggle-weather",
      titleId: "title-weather",
      chartFn: (data, period) => {
        if (period === "month") {
          // Fahrten temporär mit Monat als "week" versehen für die Aggregation in renderWeatherWeekly
          const ridesWithMonth = Data.rides.map((r) => ({
            ...r,
            week: r.dateISO ? r.dateISO.slice(0, 7) : r.week || "?",
          }));
          Charts.renderWeatherWeekly("chart-weather-weekly", ridesWithMonth, period);
        } else {
          Charts.renderWeatherWeekly("chart-weather-weekly", Data.rides, period);
        }
      },
      titleWeek: "Trainingswetter · Temperatur & Wind pro Woche",
      titleMonth: "Trainingswetter · Temperatur & Wind pro Monat",
    },
  ];

  for (const cfg of charts) {
    const wrap = el(cfg.toggleId);
    if (!wrap) continue;

    // Toggle-Status aus localStorage wiederherstellen
    const saved = getPeriod(cfg.toggleId);
    wrap.querySelectorAll(".unit-btn").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.period === saved);
    });
    if (cfg.titleId) {
      const titleEl = el(cfg.titleId);
      if (titleEl) titleEl.textContent = saved === "month" ? cfg.titleMonth : cfg.titleWeek;
    }

    // Initial rendern mit gespeichertem Wert
    cfg.chartFn(saved === "month" ? monthlyFromRides(Data.rides) : weekly, saved);

    // Click-Handler
    wrap.querySelectorAll(".unit-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const period = btn.dataset.period;
        if (btn.classList.contains("active")) return;
        wrap.querySelectorAll(".unit-btn").forEach((b) => b.classList.toggle("active", b === btn));
        setPeriod(cfg.toggleId, period);
        const titleEl = el(cfg.titleId);
        if (titleEl) titleEl.textContent = period === "month" ? cfg.titleMonth : cfg.titleWeek;
        cfg.chartFn(period === "month" ? monthlyFromRides(Data.rides) : weekly, period);
      });
    });
  }
}

/* ── Nach einer Adjustment-Änderung (verschoben/ausgefallen) im
   Planungs-Tab: Panels, die plannedSessions+adjustments lesen, ohne
   vollständigen Reload aktualisieren (Hero-Session-Pill, Wochenrückblick,
   Analyse-Briefing/Konsistenz). Planned.render() selbst übernimmt
   ui/planned.js. ── */
function refreshAfterAdjustment() {
  if (!Data.plannedSessions.length) return;
  const rides = Data.byDate();
  const todayISO = new Date().toISOString().split("T")[0];
  Overview.render(rides, true);
  renderWeekReview(
    "weekreview-card",
    buildWeekReview(rides, Data.plannedSessions, Data.adjustments, todayISO)
  );
  Analysis.render(rides, true);
}
Planned.onAdjustmentChange = refreshAfterAdjustment;
// Karten-Dialog (Anlegen/Bearbeiten/Löschen) kennt planned.js nicht direkt
// (kein Zirkelimport dort) — meldet Erfolg über diesen Callback zurück,
// analog zu Planned.onAdjustmentChange oben.
PlanCardDialog.onSaved = () => {
  Planned.render(Data.byDate());
  refreshAfterAdjustment();
};

/* ── Gesamtes Dashboard rendern (initial + bei Athletenwechsel) ─ */
async function renderAll(athleteId) {
  el("loading").classList.remove("hidden");
  el("app").classList.add("hidden");
  el("error").classList.add("hidden");

  const result = athleteId ? await Data.switchAthlete(athleteId) : await Data.load();

  if (!result.ok) {
    el("loading").classList.add("hidden");
    el("error").classList.remove("hidden");
    el("error-msg").textContent = result.error?.message || "Unbekannter Fehler";
    return;
  }

  el("loading").classList.add("hidden");
  el("app").classList.remove("hidden");

  const rides = Data.byDate();
  const weekly = Data.weekly();
  const ownPlan = hasOwnPlan();
  // Schmalerer Flag als ownPlan: schaltet nur den Planungstab + Tagesform-
  // Pill/Wochenrückblick frei, rein datengetrieben (plannedSessions kommt
  // für Athlet 2 seit GFNY Bremen 2026 ebenfalls aus rides-2.json) — ohne
  // die Athlet-1-exklusiven Plan-1/2-Inhalte zu berühren, die weiter an
  // ownPlan hängen (s. Kommentar bei hasOwnPlan()).
  const hasPlanningTab = Data.plannedSessions.length > 0;
  const ftp = ownPlan
    ? CONFIG.ftp
    : CONFIG.athleteConfig(Data.activeAthleteId)?.ftpMeasured ||
      Data.athleteFtp ||
      Data.rides.find((r) => r.np)?.np ||
      null;
  // localISODate() statt toISOString() — sonst würde todayISO bei UTC-Versatz
  // (z.B. CEST) zwischen Mitternacht lokal und UTC auf den Vortag
  // zurückrutschen und von analysis.js's eigenem lokalen todayISO() abweichen.
  const todayISO = localISODate();

  // Wochen-Zuordnung: Plan-Wochen (Athlet 1) bzw. ISO-Kalenderwochen
  const weekKeyFn = ownPlan ? (r) => r.week : (r) => (r.dateISO ? isoWeekKey(r.dateISO) : null);
  const weekSortFn = ownPlan
    ? (a, b) => CONFIG.weekIndex(a) - CONFIG.weekIndex(b)
    : (a, b) => a.localeCompare(b);
  const guard = buildLoadGuard(rides, weekKeyFn, weekSortFn);

  togglePlanningTabVisibility(hasPlanningTab);
  updateChartExplainers(ownPlan, ftp);

  // Events-Timeline + Renn-Countdown: bewusst NICHT awaited — beide Panels
  // (ui/event-timeline.js, Overview._renderSessionPill) hängen an
  // onEventsChange (state/events.js) und zeichnen sich selbst neu, sobald
  // der Ladevorgang durchkommt. Ein await hier würde die komplette restliche
  // Render-Pipeline (Charts, Panels) auf einen Supabase-Roundtrip warten
  // lassen, ohne dass irgendetwas davon Event-Daten braucht.
  EventTimeline.render(Data.activeAthleteId);

  // Overview
  Overview.render(rides, hasPlanningTab);

  // Panels: Tagesform (7d vs. 42d-Baseline) + Wochenrückblick + Bestwerte.
  // Die Belastungsempfehlung (gleiche Berechnung wie Analysis::_renderBriefing)
  // wird hier mitgebaut, damit die Tagesform-Karte darauf verlinken kann.
  const readiness = assessReadiness(Data.wellness, todayISO);
  // currentPmc() schreibt den TSB auf heute fort statt ihn am Stand der
  // letzten Fahrt einzufrieren (s. core/pmc.js, core/briefing.js).
  const pmc = currentPmc(rides, todayISO);
  const tsb = pmc?.tsb ?? null;
  const trend = tsbTrend(rides, todayISO);
  const loadRisk = guard.length ? guard[guard.length - 1].risk : null;
  let nextSession = null;
  if (hasPlanningTab) {
    const doneDates = new Set(rides.map((r) => r.dateISO));
    nextSession = nextPlannedSession(Data.plannedSessions, Data.adjustments, doneDates, todayISO);
  }
  // Subjektiver Kanal (Morgen-Check-in) nur beim eingeloggten Athleten selbst
  // — unabhängig von Data.activeAthleteId (state/wellbeing.js hängt am
  // Supabase-Login, nicht am Athleten-Toggle; dieselbe bereits bestehende
  // Lücke wie bei Goals/Events, s. ui/settings-panel.js-Kommentar). Greift
  // erst beim nächsten vollen renderAll() (Athleten-Toggle/Reload), nicht
  // reaktiv auf einen späteren Check-in — konsistent zu TSB/LoadGuard, die
  // ebenfalls nicht live nachziehen.
  const subjective = isAthlete() ? getWellbeingState().subjective : null;
  const briefing = buildBriefing({ readiness, tsb, loadRisk, nextSession, trend, subjective });
  renderReadiness("readiness-panel", readiness, briefing);
  renderWeekReview(
    "weekreview-card",
    buildWeekReview(rides, hasPlanningTab ? Data.plannedSessions : [], Data.adjustments, todayISO)
  );
  renderRecords("records-wall", recordProgression(rides));

  // Charts — Fitness & Belastung (Belastungswächter: Ramp + Foster-Monotonie)
  Charts.renderPMC("chart-pmc", rides);
  initPeriodToggles(rides, weekly, guard, (week) => {
    document.querySelector('[data-tab="table"]').click();
    Table.filterByWeek(week);
  });
  Charts.renderZoneWeekly("chart-zones", weeklyZoneShares(rides, weekKeyFn, weekSortFn));

  // Charts — Leistung
  Charts.renderPowerCurve(
    "chart-power-curve",
    Data.powerCurves,
    ftp,
    Data.athleteWeight,
    ownPlan ? Data.powerCurveBlocks : []
  );
  Charts.renderEfficiency("chart-efficiency", rides, efficiencyTrend(rides));
  Charts.renderScatter("chart-scatter", rides);
  Charts.renderSmallMultiples(rides);
  Charts.renderCadenceCoach(
    "kadenz-coach",
    cadenceCoach(rides, CONFIG.cadenceTarget),
    CONFIG.cadenceTarget
  );

  // FTP-Projektion: für BEIDE Athleten aus derselben Datenquelle (Ride-eFTP
  // + Wellness-eFTP gemergt, wie Overview._eftpValue). Athlet 1 hat einen
  // festen Plan-Retest-Termin, Athlet 2 keinen Plan — dort wird stattdessen
  // der Ziel-Horizont aus dem aktuellen Trend abgeleitet (dateForTarget).
  // Ohne verwertbare Historie zeigt die Chart-Funktion selbst den Empty-State.
  {
    const ac = CONFIG.athleteConfig(Data.activeAthleteId);
    const history = mergeEftpHistories(eftpHistory(rides), eftpHistoryFromWellness(Data.wellness));
    const goal = ownPlan ? CONFIG.ftpGoal : ac?.ftpGoal || null;
    let targetISO = ownPlan ? CONFIG.retestDate : null;
    if (!targetISO && goal && history.length >= 3) {
      const t = dateForTarget(history, goal);
      if (t?.reached) targetISO = t.date;
    }
    const fc = targetISO ? forecastFtp(history, targetISO) : null;
    updateFtpForecastText(ownPlan, goal, targetISO);
    Charts.renderFtpForecast(
      "chart-ftp-forecast",
      history,
      fc,
      goal,
      targetISO,
      ownPlan ? "Retest" : "Ziel"
    );
  }

  // Charts — Aerobe Gesundheit
  Charts.renderDecoupling("chart-decoupling", rides);
  Charts.renderSleep("chart-sleep", Data.wellness, ownPlan);
  Charts.renderPlanCompareHRV(rides);
  Charts.renderPlanCompareRHF(rides);

  // Körper: Gewicht/Energie/Hydration (erscheinen nur bei vorhandenen Daten,
  // Sichtbarkeit via ChartVisibility)
  // Energie + Gewicht (Variante B): Verbrauch/Zufuhr als gruppierte Balken,
  // Gewichts-Spur darunter. Fehlt der Grundumsatz (z. B. Amazfit), wird er
  // aus den Körperdaten der Config geschätzt (Mifflin-St-Jeor).
  const wt = weightTrend(Data.wellness);
  const ac = CONFIG.athleteConfig(Data.activeAthleteId);
  let estBMR = null;
  if (ac && ac.bmr) {
    const refWeight = (wt && wt.points.length && wt.points[wt.points.length - 1].weight) || ac.bmr.weightKg;
    estBMR = estimateBMR({ weightKg: refWeight, heightCm: ac.bmr.heightCm, age: ac.bmr.age, sex: ac.bmr.sex });
  }
  Charts.renderEnergy("chart-energy", energyView(Data.wellness, estBMR), wt);
  Charts.renderHydration("chart-hydration", hydrationSeries(Data.wellness));

  // Übersicht — Konsistenz-Jahreskalender (ersetzt Wochentags-Heatmap)
  Charts.renderConsistency("chart-consistency", weeklyConsistency(rides, todayISO));

  // Table
  Table.init();

  // Planung — sobald plannedSessions vorhanden sind (Athlet 1 immer,
  // Athlet 2 seit GFNY Bremen 2026 ebenfalls — dort read-only, s. planned.js)
  if (hasPlanningTab) {
    await Planned.render(rides);
  }

  // Analysis
  Analysis.render(rides, hasPlanningTab);

  // Datengetriebene Chart-Sichtbarkeit anwenden (leere Charts/Kategorien
  // ausblenden, sofern nicht per Umschalter eingeblendet)
  ChartVisibility.apply();

  // Footer
  const athleteName = CONFIG.athletes.find((a) => a.id === Data.activeAthleteId)?.name || "";
  el("footer").innerHTML = `
    <p>Daten: ${rides.length} Fahrten · ${athleteName} · Quelle: ${ownPlan ? "Notion + intervals.icu" : "intervals.icu"} · Aktualisiert ${new Date().toLocaleDateString("de")}</p>
  `;
}

// Main init
(async function () {
  initTabs();
  initChartGroupToggles();
  ChartVisibility.init();
  Tooltip.init();

  // Gespeicherten Athleten aus localStorage übernehmen, bevor initial gerendert wird.
  // Alte/unbekannte IDs (aus früheren Versionen) fallen auf den Primär-Athleten
  // zurück — der Toggle setzt sich dabei einmalig zurück.
  const savedAthlete = localStorage.getItem("active_athlete");
  const validAthlete = CONFIG.athletes.some((a) => a.id === savedAthlete);
  if (savedAthlete && !validAthlete) localStorage.removeItem("active_athlete");
  Data.activeAthleteId = validAthlete ? savedAthlete : CONFIG.primaryAthleteId;

  initAthleteToggle();
  await renderAll(validAthlete ? savedAthlete : null);

  initSession();

  // Tab aus URL-Hash aktivieren — NACH allem Rendering damit nichts überschrieben wird
  const hash = location.hash.replace("#", "");
  activateTab(hash || "overview");
})();
