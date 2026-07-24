/* ============================================================
   UI/IMPORT-DIALOG.JS — Claude-Vorschläge importieren
   (Phase 4 — Export/Import-Workflow-Konzept §3/§4)

   Textfeld (komplette Claude-Antwort) + Datei-Upload — Upload befüllt nur
   dasselbe Textfeld, ein Eingabepfad (Konzept §3). "Prüfen" parst+validiert
   über state/proposals.js::previewClaudeImport() (kennt core/proposal-
   import-parser.js/core/proposal-validator.js nicht direkt, Schichtenregel)
   und zeigt eine Vorschau-Liste mit Status pro Vorschlag — diese Vorschau
   IST die Bestätigung vor dem Insert (Konzept §4, kein zweiter Sicherheits-
   Dialog). Teilerfolg: "Importieren" übernimmt nur die validen Einträge.
   ============================================================ */

import { escapeHtml } from "./dom.js";
import { previewClaudeImport, importClaudeProposals } from "../state/proposals.js";

let overlay = null;
let modal = null;
let textInput = null;
let fileInput = null;
let previewEl = null;
let errorEl = null;
let importBtn = null;
let currentAthleteId = null;
// Ergebnis der letzten "Prüfen"-Runde: [{proposal, valid, errors}] — null
// solange noch nicht geprüft oder der Text seitdem geändert wurde (Vorschau
// muss immer zum zuletzt eingefügten Text passen, sonst könnte "Importieren"
// einen längst überholten Prüfstand übernehmen).
let currentResults = null;
// Wie ui/checkin-dialog.js: verhindert, dass eine späte Import-Antwort einen
// inzwischen erneut geöffneten Dialog beeinflusst.
let openToken = 0;

function describeProposal(p) {
  const date = escapeHtml(p.payload?.plan_date || "–");
  if (p.op === "add") return `Neu anlegen: ${escapeHtml(p.payload?.title || "–")} (${date})`;
  if (p.op === "move") return `Verschieben nach ${date}`;
  if (p.op === "cancel") return "Ausfallen lassen";
  return `Ersetzen: ${escapeHtml(p.payload?.title || "–")} (${date})`;
}

function rowHtml({ proposal, valid, errors }) {
  return `
    <div class="import-row ${valid ? "import-row--valid" : "import-row--invalid"}">
      <span class="import-row-status">${valid ? "✅" : "❌"}</span>
      <div class="import-row-text">
        <div class="import-row-desc">${escapeHtml(proposal?.op ?? "?")} · ${describeProposal(proposal || {})}</div>
        ${proposal?.reason ? `<div class="import-row-reason">${escapeHtml(proposal.reason)}</div>` : ""}
        ${!valid ? `<ul class="import-row-errors">${(errors || []).map((e) => `<li>${escapeHtml(e)}</li>`).join("")}</ul>` : ""}
      </div>
    </div>`;
}

function drawPreview() {
  if (!currentResults) {
    previewEl.innerHTML = "";
    importBtn.disabled = true;
    importBtn.textContent = "Importieren";
    return;
  }
  const validCount = currentResults.filter((r) => r.valid).length;
  previewEl.innerHTML = currentResults.length
    ? currentResults.map(rowHtml).join("")
    : `<p class="proposal-list-empty">Keine Vorschläge in der Antwort — Claude schlägt keine Änderung vor.</p>`;
  importBtn.disabled = validCount === 0;
  importBtn.textContent = validCount ? `${validCount} von ${currentResults.length} importieren` : "Importieren";
}

function runCheck() {
  errorEl.textContent = "";
  const result = previewClaudeImport(textInput.value);
  if (!result.ok) {
    currentResults = null;
    drawPreview();
    errorEl.textContent = result.error?.message || "Prüfung fehlgeschlagen.";
    return;
  }
  currentResults = result.results;
  drawPreview();
}

function build() {
  overlay = document.createElement("div");
  overlay.id = "import-dialog-overlay";
  overlay.className = "planned-card-dialog-overlay";

  modal = document.createElement("div");
  modal.className = "planned-card-dialog proposal-list-dialog import-dialog";
  modal.innerHTML = `
    <div class="planned-card-dialog-title">Vorschläge importieren</div>
    <p class="export-dialog-hint">Claudes komplette Antwort einfügen (Text + JSON-Block) oder als Datei hochladen.</p>
    <textarea class="planned-card-dialog-textarea" id="import-dialog-text" rows="10" placeholder="Claudes Antwort hier einfügen …"></textarea>
    <input type="file" class="import-dialog-file" id="import-dialog-file" accept=".md,.txt">
    <div class="planned-card-dialog-error" id="import-dialog-error"></div>
    <div class="import-dialog-preview" id="import-dialog-preview"></div>
    <div class="planned-card-dialog-footer">
      <div class="planned-card-dialog-footer-left">
        <button type="button" class="card-dialog-cancel" id="import-dialog-check">Prüfen</button>
      </div>
      <button type="button" class="card-dialog-save" id="import-dialog-import" disabled>Importieren</button>
      <button type="button" class="card-dialog-cancel" id="import-dialog-close">Schließen</button>
    </div>`;

  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  textInput = modal.querySelector("#import-dialog-text");
  fileInput = modal.querySelector("#import-dialog-file");
  previewEl = modal.querySelector("#import-dialog-preview");
  errorEl = modal.querySelector("#import-dialog-error");
  importBtn = modal.querySelector("#import-dialog-import");
  const checkBtn = modal.querySelector("#import-dialog-check");

  modal.querySelector("#import-dialog-close").addEventListener("click", closeImportDialog);
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) closeImportDialog();
  });

  fileInput.addEventListener("change", () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      textInput.value = String(reader.result || "");
      currentResults = null;
      drawPreview();
    };
    reader.readAsText(file);
  });

  textInput.addEventListener("input", () => {
    currentResults = null;
    drawPreview();
    errorEl.textContent = "";
  });

  checkBtn.addEventListener("click", runCheck);

  importBtn.addEventListener("click", async () => {
    if (!currentResults) return;
    const validProposals = currentResults.filter((r) => r.valid).map((r) => r.proposal);
    importBtn.disabled = true;
    importBtn.textContent = "⏳ …";
    const myToken = openToken;
    const result = await importClaudeProposals(currentAthleteId, validProposals);
    if (myToken !== openToken) return; // Dialog wurde zwischenzeitlich neu geöffnet
    if (!result.ok) {
      errorEl.textContent = result.error?.message || "Import fehlgeschlagen.";
      drawPreview();
      return;
    }
    closeImportDialog();
  });
}

function onKeydown(e) {
  if (e.key === "Escape") closeImportDialog();
}

export function openImportDialog(athleteId) {
  if (!overlay) build();
  currentAthleteId = athleteId;
  openToken++;
  textInput.value = "";
  fileInput.value = "";
  currentResults = null;
  errorEl.textContent = "";
  drawPreview();
  overlay.style.display = "flex";
  document.addEventListener("keydown", onKeydown);
}

export function closeImportDialog() {
  if (!overlay) return;
  overlay.style.display = "none";
  document.removeEventListener("keydown", onKeydown);
}
