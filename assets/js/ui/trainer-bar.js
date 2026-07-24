/* ============================================================
   UI/TRAINER-BAR.JS — Trainer-Leiste über dem Planungstab
   (Phase 4 — Trainer-Sicht-Konzept §5, Mockup 1)

   Sichtbar nur, wenn der eingeloggte User der Trainer des gerade
   angezeigten Athleten ist (state/trainer-view.js::loadTrainerContext).
   Kein separates Layout — dieselbe Leiste, athletenscoped über den
   bestehenden Athleten-Toggle (Data.activeAthleteId).

   Governor/TSB-Werte werden NICHT hier neu berechnet — app.js übergibt sie
   aus derselben Rechnung, die bereits für die Tagesform-Kachel läuft
   (Wiederverwendung statt Neubau, Trainer-Sicht-Konzept §5 letzter Absatz).
   ============================================================ */

import { CONFIG } from "../state/config.js";
import { localISODate, addDaysISO } from "../core/format.js";
import { horizonRaceEvent, tsbOnDate } from "../core/plan-feedback.js";
import { el, escapeHtml } from "./dom.js";
import {
  loadTrainerContext,
  loadCategories,
  saveCategories,
  setSaveMode,
  getState as getTrainerViewState,
  DEFAULT_CATEGORIES,
  OPTIONAL_CATEGORIES,
  CATEGORY_LABELS,
} from "../state/trainer-view.js";
import { loadProposals, getState as getProposalsState, onProposalsChange } from "../state/proposals.js";
import { loadRangeForAthlete } from "../state/wellbeing.js";
import { getState as getPlanCardsState } from "../state/plan-cards.js";
import { getState as getEventsState } from "../state/events.js";
import { onSessionChange } from "../state/session.js";
import { openProposalList } from "./proposal-list.js";

let container = null;
let currentAthleteId = null;
let panelOpen = false;
let lastBriefing = null;
let lastTsb = null;
let lastRides = [];
let lastWeekCheckins = [];
let lastCheckin = null;
let trainerProfileId = null;

function tile(title, bodyHtml, opts = {}) {
  return `<div class="trainer-tile${opts.clickable ? " trainer-tile--clickable" : ""}"${
    opts.dataTile ? ` data-tile="${opts.dataTile}"` : ""
  }>
    <div class="trainer-tile-title">${escapeHtml(title)}</div>
    <div class="trainer-tile-body">${bodyHtml}</div>
  </div>`;
}

function checkinTile() {
  if (!lastCheckin) return tile("Check-in heute", `<span class="trainer-tile-empty">kein Check-in</span>`);
  return tile(
    "Check-in heute",
    `<div class="trainer-tile-row"><span>Energie</span><b>${lastCheckin.energy}/5</b></div>
     <div class="trainer-tile-row"><span>Muskeln</span><b>${lastCheckin.muscleFeel}/5</b></div>
     <div class="trainer-tile-row"><span>Stimmung</span><b>${lastCheckin.mood}/5</b></div>`
  );
}

function governorTile() {
  if (!lastBriefing) return tile("Governor heute", `<span class="trainer-tile-empty">–</span>`);
  const color =
    lastBriefing.level === "red" ? "var(--red)" : lastBriefing.level === "yellow" ? "var(--gold)" : "var(--green)";
  return tile(
    "Governor heute",
    `<div class="trainer-tile-headline" style="color:${color}">${escapeHtml(lastBriefing.headline)}</div>
     <div class="trainer-tile-sub">${escapeHtml(lastBriefing.recommendation)}</div>`
  );
}

function tsbTile(event, eventTsb) {
  const label = lastTsb != null ? Math.round(lastTsb) : "–";
  const goalHtml =
    event && eventTsb != null
      ? `<div class="trainer-tile-sub">Ziel (${escapeHtml(event.title || "Event")}): ${Math.round(eventTsb)}</div>`
      : "";
  return tile("TSB aktuell", `<div class="trainer-tile-big">${label}</div>${goalHtml}`);
}

function proposalsTile(openCount) {
  return tile(
    "Vorschläge",
    `<div class="trainer-tile-big">${openCount}</div>
     <div class="trainer-tile-sub">offen · klicken zum Öffnen</div>`,
    { clickable: true, dataTile: "proposals" }
  );
}

function wellbeing7dTile() {
  if (!lastWeekCheckins.length)
    return tile("Wellbeing 7 Tage", `<span class="trainer-tile-empty">keine Daten</span>`);
  const avg = (key) =>
    (lastWeekCheckins.reduce((sum, c) => sum + (c[key] || 0), 0) / lastWeekCheckins.length).toFixed(1);
  return tile(
    "Wellbeing 7 Tage",
    `<div class="trainer-tile-row"><span>Ø Energie</span><b>${avg("energy")}</b></div>
     <div class="trainer-tile-row"><span>Ø Stimmung</span><b>${avg("mood")}</b></div>`
  );
}

function lastRidesTile() {
  const withData = (lastRides || []).filter((r) => r.rpe != null).slice(-10);
  if (!withData.length) return tile("Letzte Fahrten", `<span class="trainer-tile-empty">keine RPE-Daten</span>`);
  const avgRpe = (withData.reduce((sum, r) => sum + r.rpe, 0) / withData.length).toFixed(1);
  return tile("Letzte Fahrten", `<div class="trainer-tile-row"><span>Ø RPE</span><b>${avgRpe}</b></div>`);
}

function conflictsTile(conflicts) {
  return tile("Offene Konflikte", `<div class="trainer-tile-big">${(conflicts || []).length}</div>`);
}

function ctlAtlTile(projection) {
  if (!projection) return tile("CTL/ATL-Verlauf", `<span class="trainer-tile-empty">–</span>`);
  return tile(
    "CTL/ATL-Verlauf",
    `<div class="trainer-tile-row"><span>CTL</span><b>${Math.round(projection.startCtl)}</b></div>
     <div class="trainer-tile-row"><span>ATL</span><b>${Math.round(projection.startAtl)}</b></div>`
  );
}

function panelHtml(selected) {
  return `<div class="trainer-bar-panel">
    ${OPTIONAL_CATEGORIES.map(
      (key) => `
      <label class="trainer-bar-panel-item">
        <input type="checkbox" data-category="${key}" ${selected.includes(key) ? "checked" : ""}>
        ${escapeHtml(CATEGORY_LABELS[key])}
      </label>`
    ).join("")}
  </div>`;
}

function _draw() {
  if (!container) return;
  const { categories, saveMode, trainerContext } = getTrainerViewState();
  // Bugfix (25.07.2026, live per Playwright bestätigt): _draw() wird auch
  // von onProposalsChange() unten aufgerufen, das bei JEDER Änderung am
  // proposals-State feuert — z.B. wenn ui/proposal-banner.js für den
  // eingeloggten ATHLETEN SELBST loadProposals() aufruft (passiert bei
  // jedem renderAll()). Ohne dieses Gate rendert dieser Aufruf die Leiste
  // unconditional neu, selbst nachdem render() sie oben korrekt geleert
  // hatte, weil er trainerContext.isTrainer nie geprüft hat — die Leiste
  // erschien dadurch deterministisch auch für Athleten, die sich selbst
  // betrachten (kein Trainer). Die Buttons blieben dabei ungefährlich
  // (ui/planned.js::_isTrainerProposalMode()/ui/plan-card-dialog.js prüfen
  // isCoach()+trainerContext.isTrainer selbst noch einmal vor jedem
  // Schreibzugriff), aber die Anzeige widersprach Trainer-Sicht-Konzept §5.
  if (!trainerContext.isTrainer) {
    container.innerHTML = "";
    return;
  }
  const openCount = getProposalsState().proposals.filter((p) => p.status === "open").length;
  const planState = getPlanCardsState();
  const events = getEventsState().events;
  const today = localISODate();
  const event = horizonRaceEvent(events, planState.projection, today);
  const eventTsb = event ? tsbOnDate(planState.projection, event.eventDate) : null;
  const athleteName = CONFIG.athleteConfig(currentAthleteId)?.name || "";

  const renderers = {
    checkin: checkinTile,
    governor: governorTile,
    tsb: () => tsbTile(event, eventTsb),
    proposals: () => proposalsTile(openCount),
    wellbeing7d: wellbeing7dTile,
    lastRides: lastRidesTile,
    conflicts: () => conflictsTile(planState.conflicts),
    ctlAtl: () => ctlAtlTile(planState.projection),
  };
  const visible = [...DEFAULT_CATEGORIES, ...categories];

  container.innerHTML = `
    <div class="trainer-bar">
      <div class="trainer-bar-header">
        <div class="trainer-bar-title">Du trainierst ${escapeHtml(athleteName)}</div>
        <div class="trainer-bar-controls">
          <button type="button" class="trainer-bar-adjust-btn" id="trainer-bar-adjust-btn">⚙ Ansicht anpassen</button>
          <div class="trainer-bar-mode-toggle">
            <button type="button" class="trainer-bar-mode-btn${saveMode === "proposal" ? " active" : ""}" data-mode="proposal">Vorschlag</button>
            <button type="button" class="trainer-bar-mode-btn${saveMode === "direct" ? " active" : ""}" data-mode="direct">Direkt</button>
          </div>
        </div>
      </div>
      ${panelOpen ? panelHtml(categories) : ""}
      <div class="trainer-bar-grid">
        ${visible.map((key) => renderers[key]?.() || "").join("")}
      </div>
    </div>`;

  container.querySelector("#trainer-bar-adjust-btn")?.addEventListener("click", () => {
    panelOpen = !panelOpen;
    _draw();
  });
  container.querySelectorAll(".trainer-bar-mode-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      setSaveMode(btn.dataset.mode);
      _draw();
    });
  });
  container.querySelectorAll("[data-category]").forEach((cb) => {
    cb.addEventListener("change", async () => {
      const { categories: current } = getTrainerViewState();
      const key = cb.dataset.category;
      const next = cb.checked ? [...current, key] : current.filter((c) => c !== key);
      await saveCategories(next);
      _draw();
    });
  });
  container.querySelector('[data-tile="proposals"]')?.addEventListener("click", () => {
    openProposalList(currentAthleteId);
  });
}

export const TrainerBar = {
  /** @param {string} athleteId interne Kennung ("athlete1"/"athlete2")
   *  @param {{briefing?: Object|null, tsb?: number|null, rides?: Array}} extras
   *    briefing/tsb kommen unverändert aus derselben Rechnung wie die
   *    Tagesform-Kachel (app.js::renderAll) — keine zweite Berechnung hier. */
  async render(athleteId, { briefing = null, tsb = null, rides = [] } = {}) {
    container = el("trainer-bar-container");
    if (!container) return;
    currentAthleteId = athleteId;
    lastBriefing = briefing;
    lastTsb = tsb;
    lastRides = rides;

    const ctx = await loadTrainerContext(athleteId);
    if (!ctx.isTrainer) {
      container.innerHTML = "";
      return;
    }
    trainerProfileId = ctx.athleteProfileId;

    await loadCategories();
    await loadProposals(athleteId);

    const today = localISODate();
    const rangeResult = await loadRangeForAthlete(trainerProfileId, addDaysISO(today, -6), today);
    lastWeekCheckins = rangeResult.ok ? rangeResult.checkins : [];
    lastCheckin = lastWeekCheckins.find((c) => c.date === today) || null;

    panelOpen = false;
    _draw();
  },
};

// Proposals ändern sich außerhalb dieses Renderpfads (Annehmen/Ablehnen im
// Vorschlagsliste-Dialog) — Zähler-Kachel hält sich selbst aktuell, ohne
// dass ui/proposal-list.js diese Datei kennen müsste.
onProposalsChange(() => {
  if (container) _draw();
});

// app.js ruft TrainerBar.render() als Teil von renderAll() auf — beim
// initialen Page-Load passiert das VOR initSession() (s. app.js-Kommentar
// "NACH allem Rendering"), die Supabase-Session ist zu dem Zeitpunkt also
// noch nicht wiederhergestellt und loadTrainerContext() sieht (korrekt für
// diesen Moment) keinen eingeloggten User. Ohne diese Reaktion bliebe die
// Leiste nach einem F5 leer, bis der Athlet erneut manuell togglet — dieser
// Listener holt den bereits gecachten Render-Kontext nach, sobald die Session
// (auch später) tatsächlich vorliegt. Kein Effekt vor dem ersten render()
// (currentAthleteId noch null).
onSessionChange(() => {
  if (currentAthleteId) TrainerBar.render(currentAthleteId, { briefing: lastBriefing, tsb: lastTsb, rides: lastRides });
});
