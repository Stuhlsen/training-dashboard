/* ============================================================
   UI/PLAN-CARD-DIALOG.JS — Karten-CRUD (Anlegen/Bearbeiten/Löschen)
   Trainingskarten-Dialog für den Planungstab (Phase 3, Schritt 2).
   Overlay/Modal-Aufbau analog ui/event-form.js/checkin-dialog.js, aber mit
   dedizierten CSS-Klassen (planned.css) statt Inline-Styles.

   Workout-Blöcke: nur die NEUE, im Dialog erzeugte Form
   ({ blocks: [{ type, text }] }) ist hier editierbar. Migrierte Plan-2-
   Karten mit der alten, starren Form (warmup/intervals/duration/rest/
   cooldown/pct/watts/label — s. ui/planned.js) werden beim Bearbeiten NICHT
   angetastet, solange niemand einen Block hinzufügt/entfernt (sonst würde
   ein reiner Titel-Fix eine bestehende, pushbare Workout-Struktur
   stillschweigend löschen).
   ============================================================ */

import { escapeHtml } from "./dom.js";
import {
  createPlanCard,
  updatePlanCard,
  deletePlanCard,
  getState as getPlanCardsState,
} from "../state/plan-cards.js";
import { createTrainerProposal } from "../state/proposals.js";
import { getState as getTrainerViewState } from "../state/trainer-view.js";
import { isCoach } from "../state/session.js";
import { TYP_OPTIONS } from "./planned.js";

const TYPE_LABEL = { warmup: "WU", interval: "Intervall", cooldown: "CD" };

let overlay = null;
let modal = null;
let form = null;
let errorEl = null;
let saveBtn = null;
let deleteBtn = null;
let pushedNoteEl = null;
let blockListEl = null;
let titleInput = null;
let dateInput = null;
let typSelect = null;
let tssInput = null;
let kmInput = null;
let noteInput = null;
let reasonRow = null;
let reasonInput = null;

let currentAthleteId = null;
let currentCard = null; // null = anlegen, sonst bearbeiten
// true, wenn der eingeloggte User Trainer des Athleten ist UND der
// Speichern-Modus in der Trainer-Leiste auf "Vorschlag" steht (Default) —
// steuert, ob der Submit-Handler createTrainerProposal() statt
// createPlanCard()/updatePlanCard() aufruft (Trainer-Sicht-Konzept §3/§5).
let currentProposalMode = false;
let localBlocks = []; // [{ type, text, isNew }]
let deleteConfirmTimer = null;
// Analog zu ui/event-form.js::openToken: eine spät eintreffende
// create/update/delete-Antwort darf einen inzwischen erneut geöffneten
// (oder geschlossenen) Dialog nicht mehr beeinflussen.
let openToken = 0;

/** `onSaved(beforeProjection)` — beforeProjection ist der Prognose-Stand
 *  (getState().projection) von UNMITTELBAR VOR dem Speichern, für die
 *  Delta-Zeile (Nach-Drop-Feedback, Schritt 5). Läuft über den Callback statt
 *  eines direkten Imports von ui/planned.js, um keinen Zirkelimport
 *  einzuführen (planned.js importiert bereits openPlanCardDialog von hier). */
export const PlanCardDialog = { onSaved: null };

function renderBlockList() {
  blockListEl.innerHTML = localBlocks
    .map((b, i) => {
      if (!b.isNew) {
        return `
          <div class="planned-card-dialog-block-row" data-index="${i}">
            <span class="pwb pwb-${b.type === "interval" ? "interval" : b.type}">${TYPE_LABEL[b.type] || b.type}</span>
            <span class="planned-card-dialog-block-text">${escapeHtml(b.text)}</span>
            <button type="button" class="planned-card-dialog-block-remove" data-index="${i}" title="Block entfernen">🗑</button>
          </div>`;
      }
      return `
        <div class="planned-card-dialog-block-row planned-card-dialog-block-row--new" data-index="${i}">
          <select class="planned-card-dialog-block-type" data-index="${i}">
            <option value="warmup" ${b.type === "warmup" ? "selected" : ""}>WU</option>
            <option value="interval" ${b.type === "interval" ? "selected" : ""}>Intervall</option>
            <option value="cooldown" ${b.type === "cooldown" ? "selected" : ""}>CD</option>
          </select>
          <input type="text" class="planned-card-dialog-block-input" data-index="${i}"
            placeholder="z. B. 4×8' SS 84–97%" value="${escapeHtml(b.text)}">
          <button type="button" class="planned-card-dialog-block-remove" data-index="${i}" title="Block entfernen">🗑</button>
        </div>`;
    })
    .join("");
}

function build() {
  overlay = document.createElement("div");
  overlay.id = "plan-card-dialog-overlay";
  overlay.className = "planned-card-dialog-overlay";

  modal = document.createElement("div");
  modal.className = "planned-card-dialog";

  modal.innerHTML = `
    <div id="plan-card-dialog-title" class="planned-card-dialog-title">Karte anlegen</div>

    <form id="plan-card-dialog-form" class="planned-card-dialog-form">
      <div class="planned-card-dialog-row">
        <label class="planned-card-dialog-label">
          Titel
          <input name="title" type="text" required placeholder="z. B. Sweet-Spot 3×12" class="planned-card-dialog-input">
        </label>
        <label class="planned-card-dialog-label">
          Datum
          <input name="date" type="date" required class="planned-card-dialog-input">
        </label>
      </div>

      <div class="planned-card-dialog-row">
        <label class="planned-card-dialog-label">
          Typ
          <select name="typ" required class="planned-card-dialog-select">
            ${TYP_OPTIONS.map((t) => `<option value="${t}">${t}</option>`).join("")}
          </select>
        </label>
        <label class="planned-card-dialog-label">
          Ziel-TSS
          <input name="tssPlanned" type="number" min="0" step="1" class="planned-card-dialog-input">
        </label>
        <label class="planned-card-dialog-label">
          km
          <input name="km" type="number" min="0" step="1" class="planned-card-dialog-input">
        </label>
      </div>

      <label class="planned-card-dialog-label">
        Notiz
        <textarea name="details" rows="2" class="planned-card-dialog-textarea"></textarea>
      </label>

      <div id="plan-card-dialog-reason-row" class="planned-card-dialog-row" style="display:none;">
        <label class="planned-card-dialog-label" style="flex:1;">
          Begründung (öffentlich sichtbar, sachlich — nur Last/Plan/Events, s. Prompt-Vorlage-Konvention)
          <input name="reason" type="text" maxlength="140" class="planned-card-dialog-input" placeholder="z. B. TSB vor Event zu tief — Einheit entschärfen">
        </label>
      </div>

      <div>
        <div class="planned-card-dialog-blocks-header">
          <span class="planned-card-dialog-blocks-title">Workout-Blöcke</span>
          <button type="button" id="plan-card-dialog-add-block" class="planned-card-dialog-add-block">+ Block</button>
        </div>
        <div id="plan-card-dialog-block-list" class="planned-card-dialog-block-list"></div>
      </div>

      <div id="plan-card-dialog-pushed-note" class="planned-card-dialog-pushed-note" style="display:none;">
        ⚠️ Bereits auf Wahoo gepusht — dort bleibt das Event bestehen, ggf. manuell entfernen.
      </div>

      <div id="plan-card-dialog-error" class="planned-card-dialog-error"></div>

      <div class="planned-card-dialog-footer">
        <div class="planned-card-dialog-footer-left">
          <button type="button" id="plan-card-dialog-delete" class="card-dialog-delete" style="display:none;">🗑 Löschen</button>
        </div>
        <button type="button" id="plan-card-dialog-cancel" class="card-dialog-cancel">Abbrechen</button>
        <button type="submit" id="plan-card-dialog-save" class="card-dialog-save">Speichern</button>
      </div>
    </form>
  `;

  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  form = modal.querySelector("#plan-card-dialog-form");
  errorEl = modal.querySelector("#plan-card-dialog-error");
  saveBtn = modal.querySelector("#plan-card-dialog-save");
  deleteBtn = modal.querySelector("#plan-card-dialog-delete");
  pushedNoteEl = modal.querySelector("#plan-card-dialog-pushed-note");
  blockListEl = modal.querySelector("#plan-card-dialog-block-list");
  titleInput = form.querySelector('[name="title"]');
  dateInput = form.querySelector('[name="date"]');
  typSelect = form.querySelector('[name="typ"]');
  tssInput = form.querySelector('[name="tssPlanned"]');
  kmInput = form.querySelector('[name="km"]');
  noteInput = form.querySelector('[name="details"]');
  reasonRow = modal.querySelector("#plan-card-dialog-reason-row");
  reasonInput = form.querySelector('[name="reason"]');

  modal.querySelector("#plan-card-dialog-cancel").addEventListener("click", closePlanCardDialog);
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) closePlanCardDialog();
  });

  modal.querySelector("#plan-card-dialog-add-block").addEventListener("click", () => {
    localBlocks.push({ type: "interval", text: "", isNew: true });
    renderBlockList();
  });

  blockListEl.addEventListener("click", (e) => {
    const removeBtn = e.target.closest(".planned-card-dialog-block-remove");
    if (!removeBtn) return;
    const i = Number(removeBtn.dataset.index);
    localBlocks.splice(i, 1);
    renderBlockList();
  });

  blockListEl.addEventListener("input", (e) => {
    const i = Number(e.target.dataset.index);
    if (Number.isNaN(i) || !localBlocks[i]) return;
    if (e.target.classList.contains("planned-card-dialog-block-input")) localBlocks[i].text = e.target.value;
  });
  blockListEl.addEventListener("change", (e) => {
    const i = Number(e.target.dataset.index);
    if (Number.isNaN(i) || !localBlocks[i]) return;
    if (e.target.classList.contains("planned-card-dialog-block-type")) localBlocks[i].type = e.target.value;
  });

  deleteBtn.addEventListener("click", async () => {
    if (deleteBtn.dataset.confirming !== "1") {
      deleteBtn.dataset.confirming = "1";
      deleteBtn.textContent = "🗑 Wirklich löschen?";
      deleteConfirmTimer = setTimeout(() => {
        deleteBtn.dataset.confirming = "0";
        deleteBtn.textContent = "🗑 Löschen";
      }, 3000);
      return;
    }
    clearTimeout(deleteConfirmTimer);
    const myToken = openToken;
    deleteBtn.disabled = true;
    deleteBtn.textContent = "⏳ Löschen…";
    const result = await deletePlanCard(currentCard.id);
    if (myToken !== openToken) return;
    if (!result.ok) {
      deleteBtn.disabled = false;
      deleteBtn.dataset.confirming = "0";
      deleteBtn.textContent = "🗑 Löschen";
      errorEl.textContent = result.error?.message || "Karte konnte nicht gelöscht werden.";
      return;
    }
    PlanCardDialog.onSaved?.();
    closePlanCardDialog();
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    errorEl.textContent = "";
    saveBtn.disabled = true;
    saveBtn.textContent = "Speichern …";
    const myToken = openToken;

    const fd = new FormData(form);
    const finalBlocks = localBlocks.filter((b) => b.text.trim()).map((b) => ({ type: b.type, text: b.text.trim() }));
    let workout;
    if (finalBlocks.length) {
      workout = { blocks: finalBlocks };
    } else if (currentCard?.workout && !Array.isArray(currentCard.workout.blocks)) {
      // Altes Format wird in diesem Dialog nie geladen/entfernbar dargestellt
      // (fillForm befüllt localBlocks nur aus card.workout.blocks) — ein
      // Speichern ohne neue Blöcke darf es deshalb nie löschen, unabhängig
      // davon, ob zwischendurch eine leere Zeile hinzugefügt/entfernt wurde.
      workout = currentCard.workout;
    } else {
      workout = null;
    }

    const cardData = {
      date: fd.get("date"),
      name: fd.get("title").trim(),
      typ: fd.get("typ"),
      tssPlanned: fd.get("tssPlanned") ? Number(fd.get("tssPlanned")) : null,
      km: fd.get("km") ? Number(fd.get("km")) : null,
      details: fd.get("details").trim() || null,
      workout,
    };

    const before = getPlanCardsState().projection;
    let result;
    if (currentProposalMode) {
      // Trainer-Modus "Vorschlag": schreibt in proposals statt direkt in
      // plan_cards — landet als offener Vorschlag im Review-Flow (Schema-
      // Konzept §3/§5), keine Prognose-Änderung VOR der Annahme.
      const payload = {
        title: cardData.name,
        type: cardData.typ,
        plan_date: cardData.date,
        target_tss: cardData.tssPlanned,
        km: cardData.km,
        workout: cardData.workout,
        note: cardData.details,
      };
      result = currentCard
        ? await createTrainerProposal(currentAthleteId, {
            op: "replace",
            targetCardId: currentCard.id,
            targetUpdatedAt: currentCard.updatedAt,
            payload,
            reason: fd.get("reason")?.trim() || null,
          })
        : await createTrainerProposal(currentAthleteId, {
            op: "add",
            targetCardId: null,
            targetUpdatedAt: null,
            payload,
            reason: fd.get("reason")?.trim() || null,
          });
    } else {
      result = currentCard
        ? await updatePlanCard(currentCard.id, cardData)
        : await createPlanCard(currentAthleteId, cardData);
    }

    if (myToken !== openToken) return;
    saveBtn.disabled = false;
    saveBtn.textContent = currentProposalMode ? "Als Vorschlag speichern" : "Speichern";
    if (!result.ok) {
      errorEl.textContent =
        result.error?.message ||
        (currentProposalMode ? "Vorschlag konnte nicht angelegt werden." : "Karte konnte nicht gespeichert werden.");
      return;
    }
    // Ein Vorschlag ändert plan_cards nicht direkt — kein Delta/Re-Render
    // der Prognose nötig (die passiert erst bei Annahme, s. state/proposals.js).
    if (!currentProposalMode) PlanCardDialog.onSaved?.(before);
    closePlanCardDialog();
  });
}

function fillForm(card) {
  titleInput.value = card?.name || "";
  dateInput.value = card?.date || "";
  typSelect.value = card?.typ || TYP_OPTIONS[0];
  tssInput.value = card?.tssPlanned ?? "";
  kmInput.value = card?.km ?? "";
  noteInput.value = card?.details || "";

  localBlocks = Array.isArray(card?.workout?.blocks)
    ? card.workout.blocks.map((b) => ({ type: b.type, text: b.text, isNew: false }))
    : [];
  renderBlockList();

  const hasLegacyWorkout = card?.workout && !Array.isArray(card.workout.blocks);
  pushedNoteEl.style.display = card?.pushedExternalId ? "block" : "none";
  if (hasLegacyWorkout) {
    blockListEl.insertAdjacentHTML(
      "beforeend",
      `<div class="planned-card-dialog-block-text" style="opacity:0.7; padding:4px 2px;">
        ℹ️ Bestehendes Workout im alten Format — hier nicht editierbar. Neuer Block ersetzt es beim Speichern.
      </div>`
    );
  }

  deleteBtn.style.display = card ? "inline-block" : "none";
  deleteBtn.disabled = false;
  deleteBtn.dataset.confirming = "0";
  deleteBtn.textContent = "🗑 Löschen";
}

function onKeydown(e) {
  if (e.key === "Escape") closePlanCardDialog();
}

/** Öffnet den Karten-Dialog. `athleteId` ist die interne Athleten-Kennung
 *  (Data.activeAthleteId, z. B. "athlete1") — die Auflösung auf die
 *  Supabase-Profil-UUID passiert in state/plan-cards.js, analog zu
 *  loadPlanCards(). Ohne `card` = Neu-Anlegen, mit `card` (aus dem bereits
 *  geladenen State) = Bearbeiten. */
export function openPlanCardDialog(athleteId, card = null) {
  if (!overlay) build();
  clearTimeout(deleteConfirmTimer);
  currentAthleteId = athleteId;
  currentCard = card;
  openToken++;
  errorEl.textContent = "";

  const { trainerContext, saveMode } = getTrainerViewState();
  const isTrainerSaving = isCoach() && trainerContext.isTrainer;
  // T2 (Trainer-Sicht-Konzept §3): Anlegen läuft für einen Trainer IMMER als
  // Vorschlag, unabhängig vom Direkt/Vorschlag-Umschalter — der Umschalter
  // entscheidet nur bei einer BESTEHENDEN Karte (replace). Der Athlet selbst
  // (isTrainerSaving === false) ist von dieser Einschränkung nie betroffen.
  currentProposalMode = isTrainerSaving && (!card || saveMode === "proposal");
  reasonRow.style.display = currentProposalMode ? "flex" : "none";
  reasonInput.value = "";
  saveBtn.textContent = currentProposalMode ? "Als Vorschlag speichern" : "Speichern";
  modal.querySelector("#plan-card-dialog-title").textContent = card
    ? currentProposalMode
      ? "Karte bearbeiten (als Vorschlag)"
      : "Karte bearbeiten"
    : currentProposalMode
      ? "Karte anlegen (als Vorschlag)"
      : "Karte anlegen";
  fillForm(card);
  // fillForm() zeigt "Löschen" bei einer bestehenden Karte — für einen
  // Trainer IMMER ausgeblendet (auch im Direkt-Modus): T2 verlangt, dass
  // Löschen nie unilateral passiert, das Vorschlags-Schema kennt aber v1
  // bewusst kein "delete"-Op (Streichen läuft dort über "cancel"). Ein
  // Trainer kann eine Karte also nicht hart löschen, nur ausfallen lassen
  // (Planungstab-Button, nicht dieser Dialog) — konsequent aus beiden
  // Konzepten, keine Ausnahme über den Speichern-Modus-Umschalter.
  if (isTrainerSaving) deleteBtn.style.display = "none";
  overlay.style.display = "flex";
  document.addEventListener("keydown", onKeydown);
}

export function closePlanCardDialog() {
  if (!overlay) return;
  clearTimeout(deleteConfirmTimer);
  openToken++; // invalidiert einen noch laufenden Save/Delete
  overlay.style.display = "none";
  document.removeEventListener("keydown", onKeydown);
}
