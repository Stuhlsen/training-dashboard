/* ============================================================
   UI/EXPORT-PANEL.JS — Export/Import-Leiste + Export-Dialog
   (Phase 4 — Export/Import-Workflow-Konzept §1/§2,
   Export-Richtungsvorgabe-Konzept R1-R4/R6-R8)

   Schmale Leiste mit zwei Buttons oben im Planungstab: "Export für Claude"
   (Dialog hier) und "Vorschläge importieren" (öffnet ui/import-dialog.js).
   Erscheint, wenn der eingeloggte Athlet SEINEN EIGENEN Plan ansieht —
   unabhängig davon, ob profiles.trainer_id gesetzt ist (Konzept §1: Claude
   hat keinen Account, der Athlet betätigt den Workflow immer selbst).
   Gate-Vergleich synchron über den Anzeigenamen (CONFIG.athleteConfig),
   analog zum athletenscharfen `_canEdit()`-Muster in ui/planned.js.

   Export-Dialog trägt seit der Export-Richtungsvorgabe zusätzlich eine
   Preset-Kachelreihe (R1), ein optionales Zusatzkontext-Freitextfeld (R2,
   nie persistiert) und — bei Preset "event" — eine Zielevent-Auswahl (R3).
   Preset + Zielevent werden über state/export-prefs.js pro Profil gemerkt
   (R5/R6); kein Trainer-Zugriff (R8) — ownsPlan()/isAthlete() unverändert.
   ============================================================ */

import { el, els, escapeHtml } from "./dom.js";
import { isAthlete, getSession, onSessionChange } from "../state/session.js";
import { CONFIG } from "../state/config.js";
import { buildClaudeExport } from "../state/export.js";
import {
  getState as getEventsState,
  loadEvents,
  onEventsChange,
  isUpcomingEvent,
  nextRaceEvent,
} from "../state/events.js";
import { loadExportPrefs, saveExportPrefs, DEFAULT_PRESET } from "../state/export-prefs.js";
import { openEventForm } from "./event-form.js";
import { openImportDialog } from "./import-dialog.js";
import { localISODate, fmtDateFull } from "../core/format.js";
import { createRequestGuard } from "../core/request-guard.js";
import { EXTRA_CONTEXT_MAX_LENGTH } from "../core/export-briefing.js";

let barContainer = null;
let currentAthleteId = null;

let overlay = null;
let modal = null;
let athleteNameEl = null;
let presetRowEl = null;
let explainerTextEl = null;
let eventBlockEl = null;
let eventSelectEl = null;
let eventEmptyEl = null;
let contextTextarea = null;
let textarea = null;
let errorEl = null;
let copyBtn = null;
let downloadBtn = null;
let lastFileName = "claude-briefing.md";

let selectedPreset = DEFAULT_PRESET;
let selectedEventId = null;
let eventsUnsub = null;
let contextDebounceTimer = null;
// Schützt regenerateText() gegen sich überholende Antworten (schneller
// Preset-Wechsel, während eine vorherige buildClaudeExport()-Anfrage noch
// läuft) — analog zu den Guards in ui/event-form.js/ui/import-dialog.js.
const textGuard = createRequestGuard();

const PRIORITY_LABEL = { main: "Hauptziel", secondary: "Nebenziel" };

const PRESETS = [
  { key: "general", label: "Allgemein prüfen", icon: "ti-list-check", explainer: "Form, Plan und Events ansehen, Änderungen wo sinnvoll" },
  { key: "event", label: "Auf Event hin", icon: "ti-target", explainer: "Form auf den Zieltermin ausrichten, Taper einplanen" },
  { key: "check", label: "Nur prüfen", icon: "ti-clipboard-check", explainer: "Einschätzung ohne Änderungsvorschläge" },
  { key: "reduce", label: "Entlasten", icon: "ti-battery-2", explainer: "Entlastung einbauen, Intensität zurücknehmen" },
  { key: "build", label: "Aufbau steigern", icon: "ti-trending-up", explainer: "Mehr Reiz, sofern die Daten es zulassen" },
];

function ownsPlan(athleteId) {
  return isAthlete() && getSession()?.displayName === CONFIG.athleteConfig(athleteId)?.name;
}

/** Zeigt/versteckt die Zielevent-Auswahl bzw. den Leerzustand (R3) und wählt
 *  bei Bedarf ein Event vor: die gemerkte Event-ID, falls noch unter den
 *  künftigen Events; sonst das nächste priorisierte Rennen; sonst das
 *  chronologisch nächste künftige Event. */
function renderEventSelect() {
  const todayIso = localISODate();
  const upcoming = getEventsState()
    .events.filter((e) => isUpcomingEvent(e, todayIso))
    .sort((a, b) => a.eventDate.localeCompare(b.eventDate));

  if (!upcoming.length) {
    eventSelectEl.style.display = "none";
    eventEmptyEl.style.display = "flex";
    selectedEventId = null;
    return;
  }
  eventSelectEl.style.display = "";
  eventEmptyEl.style.display = "none";

  const stillValid = selectedEventId && upcoming.some((e) => e.id === selectedEventId);
  if (!stillValid) {
    selectedEventId = nextRaceEvent(todayIso)?.id ?? upcoming[0].id;
  }

  eventSelectEl.innerHTML = upcoming
    .map((e) => {
      const prio = e.type === "race" && e.priority ? ` (${PRIORITY_LABEL[e.priority] ?? e.priority})` : "";
      return `<option value="${e.id}">${fmtDateFull(e.eventDate)} — ${escapeHtml(e.title || "(ohne Titel)")}${prio}</option>`;
    })
    .join("");
  eventSelectEl.value = selectedEventId;
}

/** Aktualisiert Kachel-Zustand (aria-checked/active/roving tabindex),
 *  Erklärungszeile und Zielevent-Block für `selectedPreset`. */
function updatePresetUI() {
  const tiles = els(".export-preset-tile", presetRowEl);
  for (const tile of tiles) {
    const active = tile.dataset.preset === selectedPreset;
    tile.setAttribute("aria-checked", String(active));
    tile.tabIndex = active ? 0 : -1;
    tile.classList.toggle("active", active);
  }
  const presetDef = PRESETS.find((p) => p.key === selectedPreset) ?? PRESETS[0];
  explainerTextEl.textContent = presetDef.explainer;
  eventBlockEl.style.display = selectedPreset === "event" ? "flex" : "none";
  if (selectedPreset === "event") renderEventSelect();
}

async function regenerateText() {
  const myRequest = textGuard.bump();
  const result = await buildClaudeExport(currentAthleteId, {
    preset: selectedPreset,
    eventId: selectedPreset === "event" ? selectedEventId : null,
    extraContext: contextTextarea.value,
  });
  if (!textGuard.isCurrent(myRequest)) return; // durch neueren Preset-/Event-/Freitext-Wechsel überholt
  if (!result.ok) {
    textarea.value = "";
    errorEl.textContent = result.error?.message || "Export konnte nicht erstellt werden.";
    return;
  }
  errorEl.textContent = "";
  textarea.value = result.text;
  lastFileName = result.fileName;
}

function selectPreset(key) {
  if (key === selectedPreset) return;
  selectedPreset = key;
  updatePresetUI();
  saveExportPrefs(selectedPreset, selectedPreset === "event" ? selectedEventId : null);
  regenerateText();
}

function buildPresetRow() {
  presetRowEl.innerHTML = PRESETS.map(
    (p) => `
    <button type="button" class="export-preset-tile" role="radio" aria-checked="false" tabindex="-1"
      data-preset="${p.key}" title="${escapeHtml(p.explainer)}">
      <i class="ti ${p.icon} export-preset-tile-icon"></i>
      <span class="export-preset-tile-label">${escapeHtml(p.label)}</span>
    </button>`,
  ).join("");

  for (const tile of els(".export-preset-tile", presetRowEl)) {
    tile.addEventListener("click", () => selectPreset(tile.dataset.preset));
  }

  presetRowEl.addEventListener("keydown", (e) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const tiles = els(".export-preset-tile", presetRowEl);
    const idx = tiles.findIndex((t) => t.dataset.preset === selectedPreset);
    const dir = e.key === "ArrowRight" ? 1 : -1;
    const next = tiles[(idx + dir + tiles.length) % tiles.length];
    selectPreset(next.dataset.preset);
    next.focus();
  });
}

function buildDialog() {
  overlay = document.createElement("div");
  overlay.id = "export-panel-overlay";
  overlay.className = "planned-card-dialog-overlay";

  modal = document.createElement("div");
  modal.className = "planned-card-dialog export-dialog";
  modal.innerHTML = `
    <div class="export-panel-header-row">
      <div class="planned-card-dialog-title">Export für Claude</div>
      <div class="export-panel-athlete-name" id="export-panel-athlete-name"></div>
    </div>
    <p class="export-panel-question">Was soll Claude in dieser Runde für dich tun?</p>
    <div class="export-preset-row" id="export-preset-row" role="radiogroup" aria-label="Was soll Claude tun?"></div>
    <div class="export-preset-explainer">
      <i class="ti ti-info-circle"></i>
      <span id="export-preset-explainer-text"></span>
    </div>

    <div class="export-event-block" id="export-event-block">
      <label class="export-field-label" for="export-event-select">Zielevent</label>
      <select class="glass-select" id="export-event-select"></select>
      <div class="export-event-empty" id="export-event-empty">
        <i class="ti ti-alert-triangle"></i>
        <span>Kein künftiges Event hinterlegt. Trage zuerst ein Ziel ein — etwa einen
          Test- oder Wettkampftermin —, damit Claude die Form darauf ausrichten kann.</span>
        <a href="#" id="export-event-empty-link">Event eintragen</a>
      </div>
    </div>

    <label class="export-field-label" for="export-panel-context">Zusatzkontext (optional)</label>
    <textarea class="glass-textarea" id="export-panel-context" rows="2" maxlength="${EXTRA_CONTEXT_MAX_LENGTH}"
      placeholder="z. B. diese Woche wenig Zeit, fahre nur am Wochenende"></textarea>

    <textarea class="planned-card-dialog-textarea export-dialog-textarea" id="export-panel-text" rows="14" readonly></textarea>
    <div class="planned-card-dialog-error" id="export-panel-error"></div>
    <div class="planned-card-dialog-footer">
      <div class="planned-card-dialog-footer-left">
        <span class="export-dialog-scope-hint">Gilt nur für diesen Export</span>
      </div>
      <div class="export-panel-footer-right">
        <button type="button" class="card-dialog-save" id="export-panel-copy">In Zwischenablage kopieren</button>
        <button type="button" class="card-dialog-cancel" id="export-panel-download">Als Datei herunterladen</button>
        <button type="button" class="card-dialog-cancel" id="export-panel-close">Schließen</button>
      </div>
    </div>`;

  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  athleteNameEl = modal.querySelector("#export-panel-athlete-name");
  presetRowEl = modal.querySelector("#export-preset-row");
  explainerTextEl = modal.querySelector("#export-preset-explainer-text");
  eventBlockEl = modal.querySelector("#export-event-block");
  eventSelectEl = modal.querySelector("#export-event-select");
  eventEmptyEl = modal.querySelector("#export-event-empty");
  contextTextarea = modal.querySelector("#export-panel-context");
  textarea = modal.querySelector("#export-panel-text");
  errorEl = modal.querySelector("#export-panel-error");
  copyBtn = modal.querySelector("#export-panel-copy");
  downloadBtn = modal.querySelector("#export-panel-download");

  buildPresetRow();

  eventSelectEl.addEventListener("change", () => {
    selectedEventId = eventSelectEl.value || null;
    saveExportPrefs(selectedPreset, selectedEventId);
    regenerateText();
  });

  modal.querySelector("#export-event-empty-link").addEventListener("click", (e) => {
    e.preventDefault();
    openEventForm(currentAthleteId);
  });

  contextTextarea.addEventListener("input", () => {
    clearTimeout(contextDebounceTimer);
    contextDebounceTimer = setTimeout(regenerateText, 400);
  });

  modal.querySelector("#export-panel-close").addEventListener("click", closeExportDialog);
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) closeExportDialog();
  });

  copyBtn.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(textarea.value);
      const original = copyBtn.textContent;
      copyBtn.textContent = "Kopiert ✓";
      setTimeout(() => {
        copyBtn.textContent = original;
      }, 1500);
    } catch {
      errorEl.textContent = "Kopieren nicht möglich — Text manuell markieren und kopieren.";
    }
  });

  downloadBtn.addEventListener("click", () => {
    const blob = new Blob([textarea.value], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = lastFileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  });
}

function onKeydown(e) {
  if (e.key === "Escape") closeExportDialog();
}

export async function openExportDialog(athleteId) {
  if (!overlay) buildDialog();
  currentAthleteId = athleteId;
  errorEl.textContent = "";
  contextTextarea.value = ""; // R2: nie vorausgefüllt, startet bei jedem Export leer
  athleteNameEl.textContent = CONFIG.athleteConfig(athleteId)?.name ?? "";
  textarea.value = "Lade Briefing …";
  overlay.style.display = "flex";
  document.addEventListener("keydown", onKeydown);

  eventsUnsub?.();
  eventsUnsub = onEventsChange(() => {
    if (selectedPreset === "event") renderEventSelect();
  });

  // R3: eigener Absicherungs-Load — state/events.js::loadEvents() wird sonst
  // nur vom Übersicht-Tab ausgelöst; ohne diesen Aufruf könnte der
  // Leerzustand fälschlich "kein Event" zeigen, obwohl welche existieren.
  // Kein Doppel-Ladung: nur auslösen, wenn noch nicht für DIESEN Athleten
  // geladen (loadedForAthleteId aus state/events.js::getState()).
  if (getEventsState().loadedForAthleteId !== athleteId) {
    await loadEvents(athleteId);
  }

  const prefsResult = await loadExportPrefs();
  selectedPreset = prefsResult.ok && prefsResult.preset ? prefsResult.preset : DEFAULT_PRESET;
  selectedEventId = prefsResult.ok ? prefsResult.eventId : null;

  updatePresetUI();
  await regenerateText();
}

export function closeExportDialog() {
  if (!overlay) return;
  overlay.style.display = "none";
  document.removeEventListener("keydown", onKeydown);
  eventsUnsub?.();
  eventsUnsub = null;
  clearTimeout(contextDebounceTimer);
}

function drawBar() {
  if (!barContainer) return;
  if (!ownsPlan(currentAthleteId)) {
    barContainer.innerHTML = "";
    return;
  }
  barContainer.innerHTML = `
    <div class="export-import-bar">
      <button type="button" class="export-import-btn" id="export-import-export-btn">Export für Claude</button>
      <button type="button" class="export-import-btn" id="export-import-import-btn">Vorschläge importieren</button>
    </div>`;
  barContainer
    .querySelector("#export-import-export-btn")
    .addEventListener("click", () => openExportDialog(currentAthleteId));
  barContainer
    .querySelector("#export-import-import-btn")
    .addEventListener("click", () => openImportDialog(currentAthleteId));
}

export const ExportImportBar = {
  /** @param {string} athleteId interne Kennung ("athlete1"/"athlete2") */
  render(athleteId) {
    barContainer = el("export-import-bar-container");
    if (!barContainer) return;
    currentAthleteId = athleteId;
    drawBar();
  },
};

// Wie ui/trainer-bar.js/ui/proposal-banner.js: app.js ruft render() beim
// initialen Page-Load VOR initSession() auf (Session noch nicht
// wiederhergestellt) — ohne diesen Listener bliebe die Leiste nach einem
// F5 unsichtbar, bis der Athlet den Athleten-Toggle erneut anfasst.
onSessionChange(() => {
  if (currentAthleteId) drawBar();
});
