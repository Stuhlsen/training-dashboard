import { getSession, isAthlete, onSessionChange } from "../state/session.js";
import { getState as getWellbeingState, onWellbeingChange } from "../state/wellbeing.js";
import { openDialog } from "./checkin-dialog.js";
import { localISODate } from "../core/format.js";
import { el } from "./dom.js";

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

function render() {
  const wrap = el("wellbeing-card");
  if (!wrap) return;

  const user = getSession();
  if (!user || !isAthlete()) {
    // display:none statt nur leeren innerHTML — sonst bleibt der Div ein
    // aktiver Grid-Track in .insight-row (auto-fit zählt ihn trotz leerem
    // Inhalt mit) und readiness-panel/weekreview-card würden für Besucher
    // (der Regelfall) unnötig schmaler gerendert.
    wrap.innerHTML = "";
    wrap.style.display = "none";
    return;
  }
  wrap.style.display = "";

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

onSessionChange(render);
onWellbeingChange(render);
