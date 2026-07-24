/* ============================================================
   UI/PROPOSAL-LIST.JS — Vorschlagsliste (Mockup 2)
   (Phase 4 — Vorschlags-Schema-Konzept §5)

   Öffnet sich über die Vorschläge-Kachel der Trainer-Leiste. Gruppen
   (group_id gesetzt, z. B. ein Claude-Import) erscheinen als eigene Zeile
   mit "Alle übernehmen", ungruppierte Vorschläge einzeln (core/proposal-
   groups.js). Kein Ablehnen-Button hier — das ist die Vergleichsansicht
   ("Aktuelle behalten", ui/proposal-compare.js) vorbehalten, Direkt-
   Übernahme ohne Vergleich ist die dokumentierte Abkürzung (Schema-Konzept
   §5, Abkürzung 1+2).
   ============================================================ */

import { escapeHtml } from "./dom.js";
import {
  getState as getProposalsState,
  acceptProposal,
  acceptGroup,
  onProposalsChange,
} from "../state/proposals.js";
import { getState as getPlanCardsState } from "../state/plan-cards.js";
import { getState as getEventsState } from "../state/events.js";
import { isAthlete } from "../state/session.js";
import { Data } from "../state/data.js";
import { groupOpenProposals } from "../core/proposal-groups.js";
import { previewProposal } from "../core/proposal-preview.js";
import { summarizeProposalImpact } from "../core/proposal-summary.js";
import { localISODate } from "../core/format.js";
import { openProposalCompare } from "./proposal-compare.js";
import { Planned } from "./planned.js";

let overlay = null;
let modal = null;
let listEl = null;
let errorEl = null;
let currentAthleteId = null;

function build() {
  overlay = document.createElement("div");
  overlay.id = "proposal-list-overlay";
  overlay.className = "planned-card-dialog-overlay";

  modal = document.createElement("div");
  modal.className = "planned-card-dialog proposal-list-dialog";
  modal.innerHTML = `
    <div class="planned-card-dialog-title" id="proposal-list-title">Vorschläge</div>
    <div class="proposal-list-body" id="proposal-list-body"></div>
    <div class="planned-card-dialog-error" id="proposal-list-error"></div>
    <div class="planned-card-dialog-footer">
      <button type="button" class="card-dialog-cancel" id="proposal-list-close">Schließen</button>
    </div>`;

  overlay.appendChild(modal);
  document.body.appendChild(overlay);
  listEl = modal.querySelector("#proposal-list-body");
  errorEl = modal.querySelector("#proposal-list-error");

  modal.querySelector("#proposal-list-close").addEventListener("click", closeProposalList);
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) closeProposalList();
  });
}

/** Karten-Mutation nach einer Annahme sichtbar machen — derselbe Hook, den
 *  ui/planned.js nach Move/Cancel/Anlegen selbst auslöst (app.js verdrahtet
 *  Planned.onAdjustmentChange auf Overview/WeekReview/Analysis-Refresh).
 *  Ohne diesen Aufruf bliebe der Planungstab nach einem Annehmen sichtbar
 *  veraltet, bis der Athlet den Tab wechselt oder neu lädt. */
function refreshPlannedAfterAccept() {
  Planned.render(Data.byDate());
  Planned.onAdjustmentChange?.();
}

function findCard(id) {
  return getPlanCardsState().cards.find((c) => c.id === id) || null;
}

function describeProposal(p) {
  if (p.op === "add") return `Neu anlegen: ${escapeHtml(p.payload?.title || "–")}`;
  if (p.op === "move") {
    const card = findCard(p.targetCardId);
    return `Verschieben: ${escapeHtml(card?.name || "(Karte)")} → ${escapeHtml(p.payload?.plan_date || "–")}`;
  }
  if (p.op === "cancel") return `Ausfallen lassen: ${escapeHtml(findCard(p.targetCardId)?.name || "(Karte)")}`;
  // replace
  const card = findCard(p.targetCardId);
  return `${escapeHtml(card?.name || "(Karte)")} → ${escapeHtml(p.payload?.title || "–")}`;
}

/** Prognose-Kurzfassung für die Zeile — dieselbe Vorschau, die die
 *  Vergleichsansicht als vollen Delta+Konflikte zeigt (core/proposal-preview.js),
 *  hier nur zu einer Zeile verdichtet (core/proposal-summary.js). */
function impactText(p) {
  const preview = previewProposal(p, {
    cards: getPlanCardsState().cards,
    actuals: Data.byDate(),
    events: getEventsState().events,
    ftp: Data.ftpValue(),
  });
  return summarizeProposalImpact(preview, getEventsState().events, localISODate());
}

function rowHtml(p) {
  const icon = p.source === "claude" ? "⚡" : "🧑‍🏫";
  const impact = impactText(p);
  return `
    <div class="proposal-row" data-id="${p.id}">
      <div class="proposal-row-main">
        <span class="proposal-row-icon" title="${p.source === "claude" ? "Claude" : "Trainer"}">${icon}</span>
        <div class="proposal-row-text">
          <div class="proposal-row-desc">${describeProposal(p)}</div>
          <div class="proposal-row-sub">${escapeHtml(p.op)}${impact ? " · " + escapeHtml(impact) : ""}</div>
        </div>
      </div>
      <div class="proposal-row-actions">
        <button type="button" class="proposal-row-compare" data-id="${p.id}">${isAthlete() ? "Vergleichen…" : "Ansehen…"}</button>
        ${isAthlete() ? `<button type="button" class="proposal-row-accept" data-id="${p.id}">Übernehmen</button>` : ""}
      </div>
    </div>`;
}

function groupHeaderHtml(group) {
  const first = group.items[0];
  const icon = first.source === "claude" ? "⚡" : "🧑‍🏫";
  return `
    <div class="proposal-group-header">
      <span class="proposal-row-icon">${icon}</span>
      <span class="proposal-group-header-text">Vorschlagsrunde · ${
        first.source === "claude" ? "Claude" : "Trainer"
      } · ${group.items.length} Vorschläge</span>
      ${isAthlete() ? `<button type="button" class="proposal-group-accept-all" data-group="${group.groupId}">Alle übernehmen</button>` : ""}
    </div>`;
}

function draw() {
  if (!overlay) return;
  const { proposals } = getProposalsState();
  const groups = groupOpenProposals(proposals);
  const total = groups.reduce((n, g) => n + g.items.length, 0);
  modal.querySelector("#proposal-list-title").textContent = `${total} Vorschläge offen`;
  errorEl.textContent = "";

  if (!groups.length) {
    listEl.innerHTML = `<p class="proposal-list-empty">Keine offenen Vorschläge.</p>`;
    return;
  }

  listEl.innerHTML = groups
    .map((g) =>
      g.groupId
        ? `<div class="proposal-group">${groupHeaderHtml(g)}${g.items.map(rowHtml).join("")}</div>`
        : g.items.map(rowHtml).join("")
    )
    .join("");

  listEl.querySelectorAll(".proposal-row-compare").forEach((btn) => {
    btn.addEventListener("click", () => {
      const p = proposals.find((x) => x.id === btn.dataset.id);
      if (p) openProposalCompare(currentAthleteId, p);
    });
  });
  listEl.querySelectorAll(".proposal-row-accept").forEach((btn) => {
    btn.addEventListener("click", async () => {
      btn.disabled = true;
      btn.textContent = "⏳…";
      errorEl.textContent = "";
      const p = proposals.find((x) => x.id === btn.dataset.id);
      const result = p ? await acceptProposal(currentAthleteId, p) : { ok: false };
      if (!result.ok) {
        btn.disabled = false;
        btn.textContent = "Übernehmen";
        errorEl.textContent = result.error?.message || "Vorschlag konnte nicht übernommen werden.";
        return;
      }
      refreshPlannedAfterAccept();
      // Liste selbst zeichnet über onProposalsChange (unten) neu.
    });
  });
  listEl.querySelectorAll(".proposal-group-accept-all").forEach((btn) => {
    btn.addEventListener("click", async () => {
      btn.disabled = true;
      btn.textContent = "⏳…";
      errorEl.textContent = "";
      const result = await acceptGroup(currentAthleteId, btn.dataset.group);
      btn.disabled = false;
      btn.textContent = "Alle übernehmen";
      refreshPlannedAfterAccept();
      if (!result.ok) {
        const firstMessage = result.failed[0]?.result.error?.message;
        errorEl.textContent = `${result.failed.length} von ${result.results.length} Vorschlägen konnten nicht übernommen werden${firstMessage ? `: ${firstMessage}` : "."}`;
      }
    });
  });
}

function onKeydown(e) {
  if (e.key === "Escape") closeProposalList();
}

export function openProposalList(athleteId) {
  if (!overlay) build();
  currentAthleteId = athleteId;
  overlay.style.display = "flex";
  document.addEventListener("keydown", onKeydown);
  draw();
}

export function closeProposalList() {
  if (!overlay) return;
  overlay.style.display = "none";
  document.removeEventListener("keydown", onKeydown);
}

onProposalsChange(() => {
  if (overlay && overlay.style.display === "flex") draw();
});
