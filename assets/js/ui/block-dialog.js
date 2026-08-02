/* ============================================================
   UI/BLOCK-DIALOG.JS — Blockstart-Dialog (D3/E2)
   (docs/konzept-progressionssteuerung.md L9)

   Erscheint NUR beim Übergang in einen neuen Block, und nur wenn für das
   Blockziel mehr als eine Familie zulässig+aktiv ist (state/
   block-transition.js::detectBlockTransition) — bewusst KEIN Steuerelement
   im Export-Panel (L9: falsche Granularität, die Familie darf sich
   innerhalb eines Blocks gerade nicht ändern).

   Overlay/Modal im bestehenden `planned-card-dialog*`-Klassenmuster
   (Vorbild ui/plan-card-dialog.js/ui/export-panel.js), Options-Kacheln im
   `export-preset-tile`-Radiogroup-Stil, aber mit eigener Klasse
   (`block-dialog-option`) für den breiteren, textlastigeren Inhalt je
   Option (Zielsystem, evidence_grade, Beispieleinheit).
   ============================================================ */

import { escapeHtml } from "./dom.js";
import { stepAt, formatSummary } from "../core/ladder.js";
import { recordLadderStep } from "../state/ladder.js";
import { detectBlockTransition } from "../state/block-transition.js";
import { createRequestGuard } from "../core/request-guard.js";
import { isAthlete, getSession } from "../state/session.js";
import { CONFIG } from "../state/config.js";

const TARGET_SYSTEM_LABEL = {
  "aerob-ermuedungsresistenz": "Aerobe Ermüdungsresistenz",
  schwelle: "Schwelle",
  "laktat-clearance": "Laktat-Clearance",
  vo2max: "VO2max",
  neuromuskulaer: "Neuromuskulär",
};

const EVIDENCE_GRADE_LABEL = { studienlage: "Studienlage", "coaching-konsens": "Coaching-Konsens" };

let overlay = null;
let modal = null;
let optionsEl = null;
let errorEl = null;
let confirmBtn = null;

let currentCandidates = [];
let selectedFormatId = null;
const openGuard = createRequestGuard();

/** Vorauswahl (E2: "eine vom System begründet vorausgewählte Option") —
 *  bevorzugt die besser belegte Familie (`studienlage` vor
 *  `coaching-konsens`), sonst die erste Kandidatin. Einfache, im Bericht
 *  als "selbst entschieden" gekennzeichnete Heuristik — das Konzept
 *  spezifiziert die Begründung nicht bis auf Regelebene. */
function defaultCandidate(candidates) {
  return candidates.find((c) => c.evidenceGrade === "studienlage") ?? candidates[0];
}

function renderOptions() {
  optionsEl.innerHTML = currentCandidates
    .map((format) => {
      const firstStep = stepAt(format, 1);
      const sample = formatSummary(format, firstStep, 1);
      const active = format.id === selectedFormatId;
      return `
        <button type="button" class="block-dialog-option${active ? " active" : ""}" role="radio"
          aria-checked="${active}" data-format-id="${format.id}">
          <span class="block-dialog-option-label">${escapeHtml(format.label)}</span>
          <span class="block-dialog-option-system">${escapeHtml(TARGET_SYSTEM_LABEL[format.targetSystem] ?? format.targetSystem)}</span>
          <span class="block-dialog-option-evidence">${escapeHtml(EVIDENCE_GRADE_LABEL[format.evidenceGrade] ?? format.evidenceGrade)}</span>
          <span class="block-dialog-option-sample">${escapeHtml(sample)}</span>
        </button>`;
    })
    .join("");

  for (const btn of optionsEl.querySelectorAll(".block-dialog-option")) {
    btn.addEventListener("click", () => {
      selectedFormatId = btn.dataset.formatId;
      renderOptions();
    });
  }
}

function build() {
  overlay = document.createElement("div");
  overlay.id = "block-dialog-overlay";
  overlay.className = "planned-card-dialog-overlay";

  modal = document.createElement("div");
  modal.className = "planned-card-dialog block-dialog";
  modal.innerHTML = `
    <div class="planned-card-dialog-title">Neuer Trainingsblock — welches Format?</div>
    <p class="export-panel-question">Für diesen Block sind mehrere Familien zulässig. Die Wahl gilt für den
      gesamten Block — ein Wechsel mittendrin setzt die Leiterposition zurück.</p>
    <div class="block-dialog-options" id="block-dialog-options" role="radiogroup" aria-label="Trainingsformat für diesen Block"></div>
    <div class="planned-card-dialog-error" id="block-dialog-error"></div>
    <div class="planned-card-dialog-footer">
      <div class="planned-card-dialog-footer-left">
        <span class="export-dialog-scope-hint">Gilt für den ganzen Block</span>
      </div>
      <div class="export-panel-footer-right">
        <button type="button" class="card-dialog-save" id="block-dialog-confirm">Übernehmen</button>
        <button type="button" class="card-dialog-cancel" id="block-dialog-close">Später entscheiden</button>
      </div>
    </div>`;

  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  optionsEl = modal.querySelector("#block-dialog-options");
  errorEl = modal.querySelector("#block-dialog-error");
  confirmBtn = modal.querySelector("#block-dialog-confirm");

  modal.querySelector("#block-dialog-close").addEventListener("click", closeBlockDialog);
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) closeBlockDialog();
  });

  confirmBtn.addEventListener("click", async () => {
    if (!selectedFormatId) return;
    const myRequest = openGuard.bump();
    errorEl.textContent = "";
    confirmBtn.disabled = true;
    const result = await recordLadderStep({ formatId: selectedFormatId, step: 1, reason: "block-start" });
    if (!openGuard.isCurrent(myRequest)) return; // Dialog währenddessen geschlossen/neu geöffnet
    confirmBtn.disabled = false;
    if (!result.ok) {
      errorEl.textContent = result.error?.message || "Konnte nicht gespeichert werden.";
      return;
    }
    closeBlockDialog();
  });
}

function onKeydown(e) {
  if (e.key === "Escape") closeBlockDialog();
}

/** @param {{blockTarget: string, candidates: Array<Object>}} transition
 *  Ergebnis von state/block-transition.js::detectBlockTransition() mit
 *  `shouldPrompt: true`. */
export function openBlockDialog({ candidates }) {
  if (!overlay) build();
  currentCandidates = candidates;
  selectedFormatId = defaultCandidate(candidates)?.id ?? null;
  errorEl.textContent = "";
  renderOptions();
  overlay.style.display = "flex";
  document.addEventListener("keydown", onKeydown);
}

export function closeBlockDialog() {
  if (!overlay) return;
  overlay.style.display = "none";
  document.removeEventListener("keydown", onKeydown);
}

/** App-Init-Hook (analog zu ui/export-panel.js::ownsPlan-Gate): prüft beim
 *  Rendern des Planungstabs, ob der Blockstart-Dialog jetzt fällig ist, und
 *  öffnet ihn nur für den eingeloggten Athleten auf SEINEM EIGENEN Plan —
 *  nie für einen Trainer, der einen fremden Plan betrachtet. Still (kein
 *  Fehler-UI) bei Ladefehlern — der Dialog ist eine Erinnerung, kein
 *  blockierender Schritt.
 *  @param {string} athleteId interne Kennung ("athlete1"/"athlete2") */
export async function maybeOpenBlockDialog(athleteId) {
  const ownsPlan = isAthlete() && getSession()?.displayName === CONFIG.athleteConfig(athleteId)?.name;
  if (!ownsPlan) return;
  if (overlay?.style.display === "flex") return; // schon offen, nicht doppelt anstoßen
  const transition = await detectBlockTransition();
  if (transition.shouldPrompt) openBlockDialog(transition);
}
