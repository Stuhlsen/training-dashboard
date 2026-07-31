import { getSession, isAthlete, onSessionChange } from "../state/session.js";
import { getState as getWellbeingState, onWellbeingChange, loadSharedToday } from "../state/wellbeing.js";
import { openDialog } from "./checkin-dialog.js";
import { localISODate } from "../core/format.js";
import { CONFIG } from "../state/config.js";
import { el, escapeHtml } from "./dom.js";

// Gerade per Athleten-Toggle angezeigter Athlet — nur für den Besucher-/
// fremder-Coach-Zweig (renderShared) relevant. Von app.js analog zu
// TrainerBar/ProposalBanner explizit als Teil von renderAll() gesetzt
// (WellbeingCard.render(Data.activeAthleteId)).
let currentAthleteId = null;
let sharedCheckin = null;
let sharedLoading = false;
// Verhindert, dass eine überholte Antwort (schneller Athletenwechsel
// während des Ladens) den Shared-State eines inzwischen verlassenen
// Athleten überschreibt — analog state/plan-cards.js/state/events.js.
let sharedRequestId = 0;

function promptSeenKey(userId) {
  return `checkin_prompt_seen_${userId}_${localISODate()}`;
}

/** Bietet den Check-in-Dialog einmal pro Tag an, sobald der heutige Stand
 *  geladen ist und noch kein Eintrag existiert — dismissbar, blockiert nie
 *  (Konzept D4). Setzt die "gesehen"-Markierung SOFORT, nicht erst beim
 *  Schließen, damit ein zweiter render()-Aufruf (z. B. durch einen weiteren
 *  onSessionChange-Event kurz danach) nicht erneut öffnet. */
function maybeAutoPrompt(user, wbState) {
  if (!user || wbState.loading || wbState.error || wbState.checkin) return;
  const key = promptSeenKey(user.id);
  if (localStorage.getItem(key)) return;
  localStorage.setItem(key, "1");
  openDialog();
}

/** Eigener, editierbarer Check-in des eingeloggten Athleten — bewusst
 *  UNABHÄNGIG vom Athleten-Toggle (Data.activeAthleteId), s. app.js-
 *  Kommentar zu `subjective`: der Morgen-Check-in hängt an der auth.uid()
 *  des eingeloggten Users, nicht an der gerade betrachteten Athletenseite. */
function renderSelf(wrap, user) {
  const wbState = getWellbeingState();
  let statusLabel, statusColor;
  if (wbState.loading) {
    statusLabel = "Lädt …";
    statusColor = "var(--dim2)";
  } else if (wbState.error) {
    statusLabel = "Nicht geladen";
    statusColor = "var(--dim2)";
  } else if (wbState.checkin) {
    statusLabel = "Heute erfasst ✓";
    statusColor = "var(--z1)";
  } else {
    statusLabel = "Check-in offen";
    statusColor = "var(--gold)";
  }

  wrap.style.display = "";
  wrap.innerHTML = `
    <div class="panel-card">
      <div class="panel-title">Befinden heute</div>
      <button type="button" id="wellbeing-card-btn" title="Klicken für den Morgen-Check-in" style="
        display: flex; align-items: center; gap: 8px; width: 100%; text-align: left;
        background: none; border: none; padding: 0; cursor: pointer; font: inherit; color: inherit;">
        <span style="width: 8px; height: 8px; border-radius: 50%; background: ${statusColor}; flex-shrink: 0;"></span>
        <span style="font-family: var(--font-disp); font-weight: 600; font-size: 0.85rem; color: ${statusColor};">${statusLabel}</span>
      </button>
    </div>`;

  wrap.querySelector("#wellbeing-card-btn").addEventListener("click", () => openDialog());

  maybeAutoPrompt(user, wbState);
}

/** Freigegebene Werte (wellbeing_shared) des per Toggle betrachteten
 *  Athleten — für Betrachter ohne Athlet-Rolle (Besucher, fremder Coach;
 *  Konzept docs/phase-2-konzept-morgen-checkin.md Abschnitt 10). Leer
 *  sowohl ohne Eintrag als auch bei deaktiviertem `wellbeing_public` —
 *  von hier aus nicht unterscheidbar (die View filtert selbst, s.
 *  getSharedRange-Kommentar) und muss es auch nicht sein. */
function renderShared(wrap) {
  const athleteName = CONFIG.athleteConfig(currentAthleteId)?.name || "";
  if (sharedLoading) {
    wrap.style.display = "";
    wrap.innerHTML = `
      <div class="panel-card">
        <div class="panel-title">Befinden heute — ${escapeHtml(athleteName)}</div>
        <span style="font-size: 0.85rem; color: var(--dim2);">Lädt …</span>
      </div>`;
    return;
  }
  if (!sharedCheckin) {
    // display:none statt nur leeren innerHTML — sonst bleibt der Div ein
    // aktiver Grid-Track in .insight-row (auto-fit zählt ihn trotz leerem
    // Inhalt mit) und readiness-panel/weekreview-card würden unnötig
    // schmaler gerendert.
    wrap.innerHTML = "";
    wrap.style.display = "none";
    return;
  }
  wrap.style.display = "";
  wrap.innerHTML = `
    <div class="panel-card">
      <div class="panel-title">Befinden heute — ${escapeHtml(athleteName)}</div>
      <div style="display:flex; gap:14px; font-size:0.85rem; color:var(--dim);">
        <span>Energie <b>${sharedCheckin.energy}/5</b></span>
        <span>Muskeln <b>${sharedCheckin.muscleFeel}/5</b></span>
        <span>Stimmung <b>${sharedCheckin.mood}/5</b></span>
      </div>
    </div>`;
}

function draw() {
  const wrap = el("wellbeing-card");
  if (!wrap) return;

  const user = getSession();
  if (user && isAthlete()) {
    renderSelf(wrap, user);
    return;
  }

  if (!currentAthleteId) {
    wrap.innerHTML = "";
    wrap.style.display = "none";
    return;
  }
  renderShared(wrap);
}

async function loadShared(athleteId) {
  const myRequest = ++sharedRequestId;
  sharedLoading = true;
  draw();
  const result = await loadSharedToday(athleteId);
  if (myRequest !== sharedRequestId) return; // durch schnelleren Athletenwechsel überholt
  sharedLoading = false;
  sharedCheckin = result.ok ? result.checkin : null;
  draw();
}

export const WellbeingCard = {
  /** @param {string} athleteId interne Kennung ("athlete1"/"athlete2") des
   *  gerade per Athleten-Toggle angezeigten Athleten. Nur für den Besucher-/
   *  fremder-Coach-Zweig relevant (renderShared) — die eigene Editor-Karte
   *  (renderSelf) hängt unverändert am eingeloggten User, nicht am Toggle. */
  render(athleteId) {
    currentAthleteId = athleteId;
    const user = getSession();
    if (user && isAthlete()) {
      draw();
      return;
    }
    loadShared(athleteId);
  },
};

onSessionChange(draw);
onWellbeingChange(draw);
