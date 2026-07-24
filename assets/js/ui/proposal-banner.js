/* ============================================================
   UI/PROPOSAL-BANNER.JS — Athleten-Banner für offene Vorschläge
   (Phase 4 — Vorschlags-Schema-Konzept §5: "beim Athleten als dezenter
   Banner ('N Vorschläge offen') über dem Plan")

   Wichtig: Die Trainer-Leiste (ui/trainer-bar.js) zeigt den Vorschläge-
   Zähler nur zur Information — annehmen/ablehnen DARF laut RLS
   ("proposals: Athlet entscheidet", nur athlete_id = auth.uid()) nur der
   Athlet selbst. Dieser Banner ist der einzige Einstieg, über den ein
   Annehmen/Ablehnen tatsächlich gelingen kann; ohne ihn gäbe es für den
   Athleten selbst gar keinen Weg, über eigene Vorschläge zu entscheiden.
   ============================================================ */

import { el } from "./dom.js";
import { isAthlete, onSessionChange } from "../state/session.js";
import { loadProposals, getState as getProposalsState, onProposalsChange } from "../state/proposals.js";
import { openProposalList } from "./proposal-list.js";

let container = null;
let currentAthleteId = null;

function draw() {
  if (!container) return;
  if (!isAthlete()) {
    container.innerHTML = "";
    return;
  }
  const openCount = getProposalsState().proposals.filter((p) => p.status === "open").length;
  if (!openCount) {
    container.innerHTML = "";
    return;
  }
  container.innerHTML = `
    <div class="planned-delta-banner proposal-banner" id="proposal-banner-btn">
      <div class="planned-delta-banner-text">
        <span>${openCount} Vorschlag${openCount === 1 ? "" : "e"} offen</span>
        <span class="planned-delta-hint">von deinem Trainer oder Claude — klicken zum Prüfen</span>
      </div>
    </div>`;
  container.querySelector("#proposal-banner-btn").addEventListener("click", () => {
    openProposalList(currentAthleteId);
  });
}

export const ProposalBanner = {
  /** @param {string} athleteId interne Kennung ("athlete1"/"athlete2") */
  async render(athleteId) {
    container = el("proposal-banner-container");
    if (!container) return;
    currentAthleteId = athleteId;
    if (!isAthlete()) {
      container.innerHTML = "";
      return;
    }
    await loadProposals(athleteId);
    draw();
  },
};

onProposalsChange(() => {
  if (container) draw();
});

// Wie ui/trainer-bar.js: app.js ruft render() beim initialen Page-Load VOR
// initSession() auf, die Session ist dann noch nicht wiederhergestellt —
// ohne diesen Listener bliebe der Banner nach F5 unsichtbar, bis der Athlet
// den Athleten-Toggle erneut anfasst. Holt den Render einmal nach, sobald
// die Session (auch später) tatsächlich vorliegt.
onSessionChange(() => {
  if (currentAthleteId) ProposalBanner.render(currentAthleteId);
});
