import { getState, loadEvents, raceCountdown, onEventsChange, removeEvent } from "../state/events.js";
import { getSession, onSessionChange } from "../state/session.js";
import { fmtDate, localISODate } from "../core/format.js";
import { el } from "./dom.js";
import { openEventForm } from "./event-form.js";

const TYPE_LABEL = { race: "Rennen/Tour", other: "Sonstiges" };
const PRIORITY_LABEL = { main: "Hauptziel", secondary: "Nebenziel" };
const ESCAPE_MAP = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

// event.title ist freier, öffentlich sichtbarer Text (E1: events öffentlich
// lesbar, jeder Athlet/Trainer kann ihn über ui/event-form.js setzen) und
// landet hier per innerHTML im DOM — ohne Escaping wäre das gespeicherter
// XSS für jeden Besucher der Timeline. Badge-Labels laufen über denselben
// Helper, auch wenn sie normalerweise aus einer festen Lookup-Tabelle kommen
// (type/priority sind DB-seitig per CHECK-Constraint auf einen festen Wertesatz
// begrenzt) — der `?? event.type`-Fallback für einen unbekannten Wert soll
// nicht der einzige ungeschützte Pfad sein, falls der Wertesatz sich mal
// ändert oder eine Altzeile abweicht.
function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ESCAPE_MAP[c]);
}

function badge(label, color) {
  return `<span style="font-family: var(--font-mono); font-size: 0.6rem; text-transform: uppercase; letter-spacing: 0.04em;
    padding: 2px 7px; border-radius: var(--pill); background: ${color}22; color: ${color}; border: 1px solid ${color}44;
    white-space: nowrap;">${escapeHtml(label)}</span>`;
}

function countdownCard(countdown) {
  if (!countdown) return "";
  return `
    <div class="session-pill" style="--sp-color: var(--ss); margin-bottom: 12px;">
      <span class="zdot"></span>
      <span>${countdown.label} · <b>${escapeHtml(countdown.event.title)}</b> · ${fmtDate(countdown.event.eventDate)}</span>
    </div>`;
}

function eventRow(event, canEdit) {
  const typeColor = event.type === "race" ? "var(--ss)" : "var(--dim)";
  const badges = [badge(TYPE_LABEL[event.type] ?? event.type, typeColor)];
  if (event.type === "race" && event.priority) {
    badges.push(badge(PRIORITY_LABEL[event.priority] ?? event.priority, "var(--accent)"));
  }
  return `
    <div class="event-timeline-row" data-id="${event.id}" style="
      display:flex; align-items:center; gap:10px; padding:8px 4px; border-radius:8px; cursor:${canEdit ? "pointer" : "default"};">
      <span style="font-family: var(--font-mono); font-size:0.7rem; color: var(--dim); flex-shrink:0; width:52px;">${fmtDate(event.eventDate)}</span>
      <span style="font-family: var(--font-disp); font-weight:600; font-size:0.82rem; color: var(--text); flex:1; min-width:0;
        overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHtml(event.title)}</span>
      <span style="display:flex; gap:6px; flex-shrink:0;">${badges.join("")}</span>
      ${canEdit ? `<button type="button" class="event-timeline-remove" data-id="${event.id}" title="Event löschen"
        style="background:none; border:none; color: var(--dim2); cursor:pointer; font-size:0.9rem; padding:2px 4px; flex-shrink:0;">×</button>` : ""}
    </div>`;
}

export const EventTimeline = {
  _athleteId: null,
  _unsubscribe: null,

  /** Rendert die Event-Timeline für `athleteId` in #event-timeline (falls im
   *  DOM vorhanden — noch kein fester Platz dafür verdrahtet, s.
   *  docs/phase-2-konzept-event-verwaltung.md Abschnitt 8, "Header-
   *  Integration" offen). Lädt einmalig pro athleteId, hält sich danach über
   *  onEventsChange aktuell (create/update/remove aus event-form.js). */
  async render(athleteId) {
    if (!el("event-timeline")) return;
    if (this._athleteId !== athleteId) {
      this._athleteId = athleteId;
      if (this._unsubscribe) this._unsubscribe();
      this._unsubscribe = onEventsChange(() => this._draw());
      this._draw(); // sofort "Lädt …" zeigen, nicht erst nach dem await
      await loadEvents(athleteId);
    }
    this._draw();
  },

  _draw() {
    const wrap = el("event-timeline");
    if (!wrap) return;
    const { events, loading, error, loadedForAthleteId } = getState();
    const canEdit = !!getSession();

    // loadEvents() setzt error=null bei jedem Start und respektiert den
    // requestId-Guard — ist "loading" abgeschlossen und "error" gesetzt,
    // bezieht sich das auf den zuletzt angefragten (= aktuellen) Athleten.
    if (!loading && error) {
      wrap.innerHTML = `<div class="panel-card"><div class="panel-title">Events</div>
        <div class="panel-empty">Events konnten nicht geladen werden.</div></div>`;
      return;
    }
    // Der geteilte State hält bis zum Abschluss von loadEvents() noch die
    // Liste des vorherigen Athleten — ohne diesen Guard würde beim
    // Athleten-Wechsel kurzzeitig athleteId A's Events unter athleteId B
    // angezeigt UND mit B's this._athleteId für Edit/Delete verdrahtet.
    if (loading || loadedForAthleteId !== this._athleteId) {
      wrap.innerHTML = `<div class="panel-card"><div class="panel-title">Events</div><div class="panel-empty">Lädt …</div></div>`;
      return;
    }

    const todayIso = localISODate();
    const countdown = raceCountdown(todayIso);
    // Das Countdown-Event separat oben zu zeigen UND nochmal identisch in
    // der Liste wäre eine verwirrende Dopplung derselben Zeile.
    const upcoming = events.filter((e) => e.eventDate >= todayIso && e.id !== countdown?.event.id);

    wrap.innerHTML = `
      <div class="panel-card">
        <div class="panel-title">Events</div>
        ${countdownCard(countdown)}
        <div id="event-timeline-list">
          ${
            upcoming.length
              ? upcoming.map((e) => eventRow(e, canEdit)).join("")
              : countdown
                ? ""
                : `<div class="panel-empty">Keine anstehenden Events.</div>`
          }
        </div>
        <div id="event-timeline-error" style="color: var(--red); font-family: var(--font-mono); font-size: 0.65rem; min-height: 1em; margin-top: 6px;"></div>
        ${
          canEdit
            ? `<button type="button" id="event-timeline-add" style="margin-top:10px; background:none; border:none; cursor:pointer;
                font-family: var(--font-mono); font-size:0.62rem; color: var(--accent); padding:0;">+ Event hinzufügen</button>`
            : ""
        }
      </div>`;

    if (!canEdit) return;

    const errorEl = wrap.querySelector("#event-timeline-error");
    wrap.querySelector("#event-timeline-add")?.addEventListener("click", () => openEventForm(this._athleteId));
    for (const row of wrap.querySelectorAll(".event-timeline-row")) {
      row.addEventListener("click", (e) => {
        if (e.target.closest(".event-timeline-remove")) return;
        const event = events.find((ev) => ev.id === row.dataset.id);
        if (event) openEventForm(this._athleteId, event);
      });
    }
    for (const btn of wrap.querySelectorAll(".event-timeline-remove")) {
      btn.addEventListener("click", async (e) => {
        e.stopPropagation();
        if (btn.disabled) return; // gegen Doppelklick während der Anfrage
        btn.disabled = true;
        errorEl.textContent = "";
        const result = await removeEvent(btn.dataset.id);
        if (!result.ok) {
          btn.disabled = false;
          errorEl.textContent = result.error?.message || "Event konnte nicht gelöscht werden.";
        }
        // Bei Erfolg zeichnet onEventsChange -> _draw() die Liste ohnehin neu.
      });
    }
  },
};

// Login/Logout blendet Edit/Delete-Affordanzen ein/aus (RLS bleibt die
// eigentliche Durchsetzung, s. state/events.js::createEvent-Kommentar) — nur
// relevant, nachdem render() mindestens einmal für einen Athleten lief.
onSessionChange(() => {
  if (EventTimeline._athleteId !== null) EventTimeline._draw();
});
