/* ============================================================
   UI/PROPOSAL-COMPARE.JS — Vergleichsansicht (Mockup 3)
   (Phase 4 — Vorschlags-Schema-Konzept §5)

   Aktuelle vs. vorgeschlagene Karte nebeneinander (`.planned-card`-Optik),
   geänderte Felder akzentuiert, darunter reason + Prognose-Auswirkung aus
   core/proposal-preview.js (Phase-3-Konfliktmodul: core/projection.js +
   core/conflicts.js) — dieselbe Vorschau wie die Kurzfassung in
   ui/proposal-list.js, hier vollständig (TSB-Delta + neue/gelöste
   Konflikt-Badges statt nur eine Zeile).
   ============================================================ */

import { escapeHtml } from "./dom.js";
import { acceptProposal, rejectProposal, withdrawProposal } from "../state/proposals.js";
import { getState as getPlanCardsState } from "../state/plan-cards.js";
import { getState as getEventsState } from "../state/events.js";
import { isAthlete } from "../state/session.js";
import { Data } from "../state/data.js";
import { payloadToCardData } from "../core/proposal-payload.js";
import { previewProposal } from "../core/proposal-preview.js";
import { conflictKey } from "../core/proposal-summary.js";
import { horizonRaceEvent, tsbOnDate } from "../core/plan-feedback.js";
import { localISODate } from "../core/format.js";
import { Planned } from "./planned.js";

// Vergleichbare Felder für "replace" (Schema-Konzept §2/§5) — eine Stelle,
// von renderCard()/sidesFor() gemeinsam genutzt statt zweier Literale.
const COMPARABLE_FIELDS = ["name", "typ", "date", "tssPlanned"];

let overlay = null;
let modal = null;
let currentAthleteId = null;
let currentProposal = null;

function build() {
  overlay = document.createElement("div");
  overlay.id = "proposal-compare-overlay";
  overlay.className = "planned-card-dialog-overlay";

  modal = document.createElement("div");
  modal.className = "planned-card-dialog proposal-compare-dialog";
  modal.innerHTML = `
    <div class="proposal-compare-header" id="proposal-compare-header"></div>
    <div class="proposal-compare-grid" id="proposal-compare-grid"></div>
    <div class="proposal-compare-impact" id="proposal-compare-impact"></div>
    <div class="planned-card-dialog-error" id="proposal-compare-error"></div>
    <div class="proposal-compare-readonly-note" id="proposal-compare-readonly-note" style="display:none;">
      Nur der Athlet selbst kann Vorschläge annehmen oder ablehnen — diese Ansicht ist hier nur zur Kontrolle.
    </div>
    <div class="planned-card-dialog-footer" id="proposal-compare-footer">
      <button type="button" class="card-dialog-cancel" id="proposal-compare-reject">Aktuelle behalten</button>
      <button type="button" class="card-dialog-save" id="proposal-compare-accept">Vorschlag übernehmen</button>
    </div>`;

  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) closeProposalCompare();
  });
}

function findCard(id) {
  return getPlanCardsState().cards.find((c) => c.id === id) || null;
}

function renderCard(data, { accent = false, changed = [] } = {}) {
  if (!data) return `<div class="proposal-compare-card proposal-compare-card--empty">–</div>`;
  const mark = (f) => (accent && changed.includes(f) ? " proposal-compare-field--changed" : "");
  const workoutHtml = data.workout?.blocks
    ? `<div class="planned-workout-blocks">${data.workout.blocks
        .map((b) => `<span class="pwb pwb-${b.type === "interval" ? "interval" : b.type}">${escapeHtml(b.text)}</span>`)
        .join("")}</div>`
    : "";
  return `
    <div class="proposal-compare-card${accent ? " proposal-compare-card--accent" : ""}">
      <div class="proposal-compare-card-title${mark("name")}">${escapeHtml(data.name || "–")}</div>
      <div class="proposal-compare-card-meta">
        <span class="${mark("date")}">${escapeHtml(data.date || "–")}</span>
        <span class="proposal-compare-card-type${mark("typ")}">${escapeHtml(data.typ || "–")}</span>
      </div>
      ${data.tssPlanned != null ? `<div class="proposal-compare-card-tss${mark("tssPlanned")}">${data.tssPlanned} TSS</div>` : ""}
      ${workoutHtml}
      ${data.cancelled ? `<div class="proposal-compare-card-cancelled">❌ Ausgefallen</div>` : ""}
    </div>`;
}

/** Baut linke/rechte Kartenansicht + geänderte Felder je nach `op`
 *  (Schema-Konzept §2: add hat keine linke Seite, move/cancel zeigen eine
 *  reduzierte Darstellung statt eines vollen Feldvergleichs). */
function sidesFor(proposal) {
  const current = proposal.targetCardId ? findCard(proposal.targetCardId) : null;
  if (proposal.op === "add") {
    // Kein "Aktuell" zum Vergleichen (Schema-Konzept §5: "bei add entfällt
    // die linke Seite") — die Akzent-Umrandung allein zeigt "neu", eine
    // Feld-für-Feld-Änderungsmarkierung ohne Baseline wäre nur Rauschen.
    const right = payloadToCardData(proposal.payload);
    return { left: null, right, changed: [] };
  }
  if (proposal.op === "replace") {
    const right = { ...current, ...payloadToCardData(proposal.payload) };
    const changed = COMPARABLE_FIELDS.filter((f) => right[f] !== current?.[f] && right[f] != null);
    return { left: current, right, changed };
  }
  if (proposal.op === "move") {
    const right = { ...current, date: proposal.payload?.plan_date };
    return { left: current, right, changed: ["date"] };
  }
  if (proposal.op === "cancel") {
    const right = { ...current, cancelled: true };
    return { left: current, right, changed: ["cancelled"] };
  }
  return { left: current, right: null, changed: [] };
}

function drawImpact(proposal) {
  const preview = previewProposal(proposal, {
    cards: getPlanCardsState().cards,
    actuals: Data.byDate(),
    events: getEventsState().events,
    ftp: Data.ftpValue(),
  });
  const today = localISODate();
  const event = horizonRaceEvent(getEventsState().events, preview.after, today);
  const before = event ? tsbOnDate(preview.before, event.eventDate) : null;
  const after = event ? tsbOnDate(preview.after, event.eventDate) : null;

  const tsbLine =
    event && before != null && after != null
      ? `<div class="proposal-compare-impact-line">TSB am Eventtag (${escapeHtml(event.title || "Event")}, ${escapeHtml(event.eventDate)}): ${Math.round(before)} → ${Math.round(after)}</div>`
      : "";

  const afterKeys = new Set(preview.afterConflicts.map(conflictKey));
  const beforeKeys = new Set(preview.beforeConflicts.map(conflictKey));
  const resolved = preview.beforeConflicts.filter((c) => !afterKeys.has(conflictKey(c)));
  const introduced = preview.afterConflicts.filter((c) => !beforeKeys.has(conflictKey(c)));

  const badges = [
    ...resolved.map((c) => `<span class="planned-conflict-badge planned-conflict-badge--info">✓ löst ${escapeHtml(c.rule)}: ${escapeHtml(c.message)}</span>`),
    ...introduced.map(
      (c) =>
        `<span class="planned-conflict-badge planned-conflict-badge--${c.severity}">${escapeHtml(c.message)}</span>`
    ),
  ].join("");

  return `
    ${proposal.reason ? `<div class="proposal-compare-reason">${escapeHtml(proposal.reason)}</div>` : ""}
    ${tsbLine}
    ${badges ? `<div class="planned-conflict-badges">${badges}</div>` : ""}
  `;
}

function draw() {
  const p = currentProposal;
  const { left, right, changed } = sidesFor(p);

  modal.querySelector("#proposal-compare-header").innerHTML = `
    <span class="proposal-row-icon">${p.source === "claude" ? "⚡" : "🧑‍🏫"}</span>
    <span>Vorschlag von ${p.source === "claude" ? "Claude" : "Trainer"} · ${escapeHtml((p.createdAt || "").slice(0, 10))}</span>
    ${p.groupId ? `<span class="proposal-compare-group-hint">Teil einer Vorschlagsrunde</span>` : ""}
  `;

  modal.querySelector("#proposal-compare-grid").innerHTML = `
    <div class="proposal-compare-col">
      <div class="proposal-compare-col-label">Aktuell</div>
      ${renderCard(left)}
    </div>
    <div class="proposal-compare-col">
      <div class="proposal-compare-col-label">Vorgeschlagen</div>
      ${renderCard(right, { accent: true, changed })}
    </div>`;

  modal.querySelector("#proposal-compare-impact").innerHTML = drawImpact(p);
  modal.querySelector("#proposal-compare-error").textContent = "";

  // RLS ("proposals: Athlet entscheidet") erlaubt Annehmen/Ablehnen nur dem
  // Athleten selbst — ein Trainer sieht die Ansicht nur zur Kontrolle.
  const readonly = !isAthlete();
  modal.querySelector("#proposal-compare-footer").style.display = readonly ? "none" : "flex";
  modal.querySelector("#proposal-compare-readonly-note").style.display = readonly ? "block" : "none";

  // Eigener Vorschlag (source "claude" = Claude-Import durch den Athleten
  // selbst, s. Header-Icon oben) → "Zurückziehen" statt "Aktuelle
  // behalten": "ablehnen" passt nicht auf eine eigene Idee, die man sich
  // anders überlegt hat (s. state/proposals.js::withdrawProposal).
  modal.querySelector("#proposal-compare-reject").textContent =
    p.source === "claude" ? "Zurückziehen" : "Aktuelle behalten";
}

function onKeydown(e) {
  if (e.key === "Escape") closeProposalCompare();
}

export function openProposalCompare(athleteId, proposal) {
  if (!overlay) build();
  currentAthleteId = athleteId;
  currentProposal = proposal;
  overlay.style.display = "flex";
  document.addEventListener("keydown", onKeydown);
  draw();

  const acceptBtn = modal.querySelector("#proposal-compare-accept");
  const rejectBtn = modal.querySelector("#proposal-compare-reject");
  const errorEl = modal.querySelector("#proposal-compare-error");

  acceptBtn.onclick = async () => {
    acceptBtn.disabled = true;
    rejectBtn.disabled = true;
    acceptBtn.textContent = "⏳ Übernehmen…";
    const result = await acceptProposal(currentAthleteId, currentProposal);
    acceptBtn.disabled = false;
    rejectBtn.disabled = false;
    acceptBtn.textContent = "Vorschlag übernehmen";
    if (!result.ok) {
      errorEl.textContent = result.error?.message || "Vorschlag konnte nicht übernommen werden.";
      return;
    }
    // Karten-Mutation sichtbar machen — derselbe Hook, den ui/planned.js
    // nach eigenen Move/Cancel/Anlegen-Aktionen auslöst.
    Planned.render(Data.byDate());
    Planned.onAdjustmentChange?.();
    closeProposalCompare();
  };

  rejectBtn.onclick = async () => {
    const isOwn = currentProposal.source === "claude";
    const restoreLabel = isOwn ? "Zurückziehen" : "Aktuelle behalten";
    acceptBtn.disabled = true;
    rejectBtn.disabled = true;
    rejectBtn.textContent = "⏳…";
    const result = isOwn
      ? await withdrawProposal(currentProposal.id)
      : await rejectProposal(currentProposal.id);
    acceptBtn.disabled = false;
    rejectBtn.disabled = false;
    rejectBtn.textContent = restoreLabel;
    if (!result.ok) {
      errorEl.textContent =
        result.error?.message || (isOwn ? "Zurückziehen fehlgeschlagen." : "Ablehnen fehlgeschlagen.");
      return;
    }
    closeProposalCompare();
  };
}

export function closeProposalCompare() {
  if (!overlay) return;
  overlay.style.display = "none";
  document.removeEventListener("keydown", onKeydown);
}
