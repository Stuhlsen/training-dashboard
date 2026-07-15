import { createEvent, updateEvent, loadEvents } from "../state/events.js";

let overlay = null;
let modal = null;
let form = null;
let errorEl = null;
let saveBtn = null;
let raceFieldsEl = null;
let typeBtns = {};
// Explizite Refs statt form.title/form.eventDate: `title` ist ein natives
// HTMLElement-Attribut (Tooltip) — ein per name="title" registriertes
// Formularfeld überschreibt das zwar spec-konform (HTMLFormElement hat
// [OverrideBuiltins]), aber das ist ein unnötig fragiler Pfad, wenn
// querySelector genauso einfach ist.
let titleInput = null;
let dateInput = null;
let priorityInput = null;
let ftpGoalInput = null;
let noteInput = null;
let currentType = "race";
let currentAthleteId = null;
let currentEventId = null; // null = anlegen, sonst bearbeiten
// Analog zu ui/checkin-dialog.js::openToken: eine spät eintreffende
// createEvent/updateEvent-Antwort darf einen inzwischen erneut geöffneten
// (oder geschlossenen) Dialog nicht mehr beeinflussen.
let openToken = 0;

const PRIORITY_OPTIONS = [
  { value: "", label: "– keine Priorität –" },
  { value: "main", label: "Hauptziel" },
  { value: "secondary", label: "Nebenziel" },
];

const INPUT_STYLE =
  "width:100%; background: rgba(255,255,255,0.05); border:1px solid var(--border); border-radius:8px; color: var(--text); font-family: var(--font-body); font-size:0.85rem; padding: 8px 10px;";
const LABEL_STYLE =
  "display:flex; flex-direction:column; gap:5px; font-family: var(--font-mono); font-size:0.64rem; text-transform:uppercase; letter-spacing:0.06em; color: var(--dim);";

function setType(type) {
  currentType = type;
  for (const [key, btn] of Object.entries(typeBtns)) {
    btn.classList.toggle("active", key === type);
  }
  raceFieldsEl.style.display = type === "race" ? "flex" : "none";
}

function build() {
  overlay = document.createElement("div");
  overlay.id = "event-form-overlay";
  overlay.style.cssText = `
    position: fixed; inset: 0; background: rgba(7,9,14,0.75);
    display: flex; align-items: center; justify-content: center;
    z-index: 1000;
  `;

  modal = document.createElement("div");
  modal.style.cssText = `
    background: #141924; border: 1px solid rgba(255,255,255,0.18);
    border-radius: 22px; padding: 26px 24px; width: 100%; max-width: 380px;
    max-height: 90vh; overflow-y: auto;
  `;

  modal.innerHTML = `
    <div id="event-form-title" style="font-family: var(--font-disp); font-weight: 700; font-size: 1rem; color: var(--text);">
      Event anlegen
    </div>

    <form id="event-form" style="display:flex; flex-direction:column; gap:12px; margin-top: 16px;">
      <label style="${LABEL_STYLE}">
        Titel
        <input name="title" type="text" required placeholder="z. B. Gran Fondo Bremen" style="${INPUT_STYLE}">
      </label>

      <label style="${LABEL_STYLE}">
        Datum
        <input name="eventDate" type="date" required style="${INPUT_STYLE}">
      </label>

      <div style="${LABEL_STYLE}">
        Typ
        <div class="plan-toggle" id="event-form-type-toggle" style="margin-bottom:0;">
          <button type="button" class="plan-btn" data-type="race">Rennen/Tour</button>
          <button type="button" class="plan-btn" data-type="other">Sonstiges</button>
        </div>
      </div>

      <div id="event-form-race-fields" style="display:flex; flex-direction:column; gap:12px;">
        <label style="${LABEL_STYLE}">
          Priorität
          <select name="priority" style="${INPUT_STYLE}">
            ${PRIORITY_OPTIONS.map((o) => `<option value="${o.value}">${o.label}</option>`).join("")}
          </select>
        </label>
        <label style="${LABEL_STYLE}">
          Ziel-FTP (Watt, optional)
          <input name="ftpGoal" type="number" min="0" step="1" placeholder="z. B. 210" style="${INPUT_STYLE}">
        </label>
      </div>

      <label style="${LABEL_STYLE}">
        Notiz (optional)
        <textarea name="note" rows="2" placeholder="z. B. Zielzeit, Strecke" style="${INPUT_STYLE} resize:vertical;"></textarea>
      </label>

      <div id="event-form-error" style="color: var(--red); font-family: var(--font-mono); font-size: 0.7rem; min-height: 1em;"></div>

      <div style="display: flex; gap: 10px; margin-top: 4px;">
        <button type="submit" class="btn-primary" id="event-form-save" style="flex: 1;">Speichern</button>
        <button type="button" id="event-form-cancel"
          style="flex: 1; background: transparent; border: 1px solid var(--border); border-radius: 999px; color: var(--dim); font-family: var(--font-body); cursor: pointer;">
          Abbrechen
        </button>
      </div>
    </form>
  `;

  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  form = modal.querySelector("#event-form");
  errorEl = modal.querySelector("#event-form-error");
  saveBtn = modal.querySelector("#event-form-save");
  raceFieldsEl = modal.querySelector("#event-form-race-fields");
  titleInput = form.querySelector('[name="title"]');
  dateInput = form.querySelector('[name="eventDate"]');
  priorityInput = form.querySelector('[name="priority"]');
  ftpGoalInput = form.querySelector('[name="ftpGoal"]');
  noteInput = form.querySelector('[name="note"]');
  typeBtns = {
    race: modal.querySelector('[data-type="race"]'),
    other: modal.querySelector('[data-type="other"]'),
  };
  for (const [key, btn] of Object.entries(typeBtns)) {
    btn.addEventListener("click", () => setType(key));
  }

  modal.querySelector("#event-form-cancel").addEventListener("click", closeEventForm);
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) closeEventForm();
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    errorEl.textContent = "";
    saveBtn.disabled = true;
    saveBtn.textContent = "Speichern …";
    const myToken = openToken;

    const fd = new FormData(form);
    // Kein type-abhängiges Nullen hier — state/events.js::createEvent/
    // updateEvent erzwingen priority=null/ftpGoal=null bei type="other"
    // bereits selbst (Konzept Abschnitt 4a), unabhängig davon, was in den
    // (bei type="other" nur versteckten, nicht geleerten) Race-Feldern steht.
    const payload = {
      title: fd.get("title").trim(),
      eventDate: fd.get("eventDate"),
      type: currentType,
      priority: fd.get("priority") || null,
      ftpGoal: fd.get("ftpGoal") ? Number(fd.get("ftpGoal")) : null,
      note: fd.get("note").trim() || null,
    };

    const result = currentEventId
      ? await updateEvent(currentEventId, payload)
      : await createEvent(currentAthleteId, payload);

    // Dialog wurde währenddessen geschlossen oder erneut geöffnet (Abbrechen,
    // neu für ein anderes Event geöffnet) — Button/Fehlermeldung eines
    // inzwischen verlassenen Dialog-Standes nicht mehr anfassen.
    if (myToken !== openToken) return;
    saveBtn.disabled = false;
    saveBtn.textContent = "Speichern";
    if (!result.ok) {
      errorEl.textContent = result.error?.message || "Event konnte nicht gespeichert werden.";
      return;
    }
    await loadEvents(currentAthleteId);
    closeEventForm();
  });
}

function fillForm(event) {
  titleInput.value = event?.title || "";
  dateInput.value = event?.eventDate || "";
  priorityInput.value = event?.priority || "";
  ftpGoalInput.value = event?.ftpGoal ?? "";
  noteInput.value = event?.note || "";
  setType(event?.type || "race");
}

function onKeydown(e) {
  if (e.key === "Escape") closeEventForm();
}

/** Öffnet das Event-Formular für `athleteId`. Ohne `event` = neu anlegen,
 *  mit `event` (aus dem geladenen State, s. state/events.js) = bearbeiten.
 *  `athleteId` wird immer explizit übergeben, da das Event-Objekt selbst
 *  keine athlete_id trägt (data-access/supabase/events.js selektiert sie
 *  nicht, da der Aufrufer sie ohnehin schon kennt — Athlet der gerade
 *  betrachteten Liste). */
export function openEventForm(athleteId, event = null) {
  if (!overlay) build();
  currentAthleteId = athleteId;
  currentEventId = event?.id ?? null;
  openToken++;
  errorEl.textContent = "";
  modal.querySelector("#event-form-title").textContent = event ? "Event bearbeiten" : "Event anlegen";
  fillForm(event);
  overlay.style.display = "flex";
  document.addEventListener("keydown", onKeydown);
}

export function closeEventForm() {
  if (!overlay) return;
  openToken++; // invalidiert einen noch laufenden Save (Abbrechen währenddessen)
  overlay.style.display = "none";
  document.removeEventListener("keydown", onKeydown);
}
