/* ============================================================
   UI/EXPORT-PANEL.JS — Export/Import-Leiste + Export-Dialog
   (Phase 4 — Export/Import-Workflow-Konzept §1/§2)

   Schmale Leiste mit zwei Buttons oben im Planungstab: "Export für Claude"
   (Dialog hier) und "Vorschläge importieren" (öffnet ui/import-dialog.js).
   Erscheint, wenn der eingeloggte Athlet SEINEN EIGENEN Plan ansieht —
   unabhängig davon, ob profiles.trainer_id gesetzt ist (Konzept §1: Claude
   hat keinen Account, der Athlet betätigt den Workflow immer selbst).
   Gate-Vergleich synchron über den Anzeigenamen (CONFIG.athleteConfig),
   analog zum athletenscharfen `_canEdit()`-Muster in ui/planned.js.
   ============================================================ */

import { el } from "./dom.js";
import { isAthlete, getSession, onSessionChange } from "../state/session.js";
import { CONFIG } from "../state/config.js";
import { buildClaudeExport } from "../state/export.js";
import { openImportDialog } from "./import-dialog.js";

let barContainer = null;
let currentAthleteId = null;

let overlay = null;
let modal = null;
let textarea = null;
let errorEl = null;
let copyBtn = null;
let downloadBtn = null;
let lastFileName = "claude-briefing.md";

function ownsPlan(athleteId) {
  return isAthlete() && getSession()?.displayName === CONFIG.athleteConfig(athleteId)?.name;
}

function buildDialog() {
  overlay = document.createElement("div");
  overlay.id = "export-panel-overlay";
  overlay.className = "planned-card-dialog-overlay";

  modal = document.createElement("div");
  modal.className = "planned-card-dialog export-dialog";
  modal.innerHTML = `
    <div class="planned-card-dialog-title">Export für Claude</div>
    <p class="export-dialog-hint">Text unten in ein neues Gespräch mit Claude einfügen (z. B. Claude Pro) oder als Datei herunterladen.</p>
    <textarea class="planned-card-dialog-textarea export-dialog-textarea" id="export-panel-text" rows="14" readonly></textarea>
    <div class="planned-card-dialog-error" id="export-panel-error"></div>
    <div class="planned-card-dialog-footer">
      <div class="planned-card-dialog-footer-left">
        <button type="button" class="card-dialog-save" id="export-panel-copy">In Zwischenablage kopieren</button>
        <button type="button" class="card-dialog-cancel" id="export-panel-download">Als Datei herunterladen</button>
      </div>
      <button type="button" class="card-dialog-cancel" id="export-panel-close">Schließen</button>
    </div>`;

  overlay.appendChild(modal);
  document.body.appendChild(overlay);
  textarea = modal.querySelector("#export-panel-text");
  errorEl = modal.querySelector("#export-panel-error");
  copyBtn = modal.querySelector("#export-panel-copy");
  downloadBtn = modal.querySelector("#export-panel-download");

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
  errorEl.textContent = "";
  textarea.value = "Lade Briefing …";
  overlay.style.display = "flex";
  document.addEventListener("keydown", onKeydown);

  const result = await buildClaudeExport(athleteId);
  if (!result.ok) {
    textarea.value = "";
    errorEl.textContent = result.error?.message || "Export konnte nicht erstellt werden.";
    return;
  }
  textarea.value = result.text;
  lastFileName = result.fileName;
}

export function closeExportDialog() {
  if (!overlay) return;
  overlay.style.display = "none";
  document.removeEventListener("keydown", onKeydown);
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
