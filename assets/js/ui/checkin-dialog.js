import { getState, loadToday, saveToday } from "../state/wellbeing.js";
import { isAthlete } from "../state/session.js";

let overlay = null;
let modal = null;
const sliders = {};
const sliderVals = {};
let noteInput = null;
let errorEl = null;
let saveBtn = null;
let touched = false;
// Erhöht sich bei jedem openDialog()-Aufruf; eine spätere Async-Antwort
// (loadToday/saveToday) wirkt auf DOM/State nur, wenn der Dialog seitdem
// nicht erneut geöffnet wurde — verhindert, dass eine überholte Antwort
// laufende Eingaben oder einen frisch wiedergeöffneten Dialog überschreibt.
let openToken = 0;

const SLIDER_DEFS = [
  { key: "energy", label: "Energie", min: "ausgelaugt", max: "voll da / spritzig" },
  { key: "muscleFeel", label: "Muskelgefühl", min: "schwer / platt / Muskelkater", max: "frisch & locker" },
  { key: "mood", label: "Stimmung", min: "mies / gereizt", max: "top / motiviert" },
];

function sliderRow(def) {
  return `
    <div style="margin-bottom: 16px;">
      <div style="display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 6px;">
        <span style="font-family: var(--font-mono); font-size: 0.68rem; text-transform: uppercase; letter-spacing: 0.06em; color: var(--dim);">${def.label}</span>
        <b id="checkin-${def.key}-val" style="font-family: var(--font-disp); font-weight: 700; font-size: 0.85rem; color: var(--accent);">3</b>
      </div>
      <input type="range" id="checkin-${def.key}" min="1" max="5" step="1" value="3"
        aria-label="${def.label} (1 bis 5)"
        style="width: 100%; accent-color: var(--ss); cursor: pointer;">
      <div style="display: flex; justify-content: space-between; margin-top: 4px;">
        <span style="font-family: var(--font-body); font-size: 0.66rem; color: var(--dim2);">${def.min}</span>
        <span style="font-family: var(--font-body); font-size: 0.66rem; color: var(--dim2); text-align: right;">${def.max}</span>
      </div>
    </div>
  `;
}

function build() {
  overlay = document.createElement("div");
  overlay.id = "checkin-dialog-overlay";
  overlay.style.cssText = `
    position: fixed; inset: 0; background: rgba(7,9,14,0.75);
    display: flex; align-items: center; justify-content: center;
    z-index: 1000;
  `;

  modal = document.createElement("div");
  modal.style.cssText = `
    background: #141924; border: 1px solid rgba(255,255,255,0.18);
    border-radius: 22px; padding: 26px 24px; width: 100%; max-width: 360px;
    max-height: 90vh; overflow-y: auto;
  `;

  modal.innerHTML = `
    <div style="font-family: var(--font-disp); font-weight: 700; font-size: 1rem; color: var(--text);">
      Morgen-Check-in
    </div>
    <div style="font-family: var(--font-mono); font-size: 0.64rem; text-transform: uppercase; color: var(--dim2); margin-top: 4px;">
      Wie geht's dir heute?
    </div>

    <div style="margin-top: 16px; padding: 10px 12px; background: rgba(255,255,255,0.03);
      border: 1px solid var(--border); border-radius: 12px; font-family: var(--font-body);
      font-size: 0.72rem; color: var(--dim);">
      Schlaf: Score kommt automatisch aus intervals.icu
    </div>

    <form id="checkin-dialog-form" style="margin-top: 18px;">
      ${SLIDER_DEFS.map(sliderRow).join("")}

      <label style="display: flex; flex-direction: column; gap: 6px; margin-top: 4px;">
        <span style="font-family: var(--font-mono); font-size: 0.64rem; text-transform: uppercase; letter-spacing: 0.08em; color: var(--dim);">Notiz (optional)</span>
        <textarea id="checkin-note" rows="2" placeholder="z. B. Kopf dicht, evtl. was im Anflug"
          style="width: 100%; resize: vertical; background: rgba(255,255,255,0.05); border: 1px solid var(--border);
          border-radius: 12px; color: var(--text); font-family: var(--font-body); font-size: 0.82rem; padding: 9px 12px;"></textarea>
        <span style="font-family: var(--font-mono); font-size: 0.6rem; color: var(--dim2);">Notiz nie öffentlich sichtbar</span>
      </label>

      <div id="checkin-dialog-error" style="color: var(--red); font-family: var(--font-mono); font-size: 0.7rem; min-height: 1em; margin-top: 8px;"></div>

      <div style="display: flex; gap: 10px; margin-top: 14px;">
        <button type="submit" class="btn-primary" id="checkin-dialog-save" style="flex: 1;">Speichern</button>
        <button type="button" id="checkin-dialog-skip"
          style="flex: 1; background: transparent; border: 1px solid var(--border); border-radius: 999px; color: var(--dim); font-family: var(--font-body); cursor: pointer;">
          Überspringen
        </button>
      </div>
    </form>
  `;

  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  for (const def of SLIDER_DEFS) {
    const input = modal.querySelector(`#checkin-${def.key}`);
    const valEl = modal.querySelector(`#checkin-${def.key}-val`);
    input.addEventListener("input", () => {
      valEl.textContent = input.value;
      touched = true;
    });
    sliders[def.key] = input;
    sliderVals[def.key] = valEl;
  }
  noteInput = modal.querySelector("#checkin-note");
  noteInput.addEventListener("input", () => (touched = true));
  errorEl = modal.querySelector("#checkin-dialog-error");
  saveBtn = modal.querySelector("#checkin-dialog-save");

  modal.querySelector("#checkin-dialog-skip").addEventListener("click", closeDialog);
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) closeDialog();
  });

  modal.querySelector("#checkin-dialog-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    errorEl.textContent = "";
    saveBtn.disabled = true;
    saveBtn.textContent = "Speichern …";
    const myToken = openToken;
    const result = await saveToday({
      energy: Number(sliders.energy.value),
      muscleFeel: Number(sliders.muscleFeel.value),
      mood: Number(sliders.mood.value),
      note: noteInput.value.trim() || null,
    });
    saveBtn.disabled = false;
    saveBtn.textContent = "Speichern";
    if (!result.ok) {
      errorEl.textContent = result.error?.message || "Check-in konnte nicht gespeichert werden.";
      return;
    }
    // Dialog wurde während des Speicherns erneut geöffnet (z. B. Escape,
    // dann neue Eingaben) — nicht den frisch wiedergeöffneten Stand schließen.
    if (myToken !== openToken) return;
    closeDialog();
  });
}

/** Slider/Notiz auf einen Check-in setzen — fehlende Werte fallen auf den
 *  neutralen Default 3 zurück (Konzept D1), keinen leeren Regler. */
function fillFromCheckin(checkin) {
  for (const def of SLIDER_DEFS) {
    const value = checkin?.[def.key] ?? 3;
    sliders[def.key].value = value;
    sliderVals[def.key].textContent = value;
  }
  noteInput.value = checkin?.note || "";
}

function onKeydown(e) {
  if (e.key === "Escape") closeDialog();
}

/** Öffnet den Check-in-Dialog für den eingeloggten Athleten. Zeigt zunächst
 *  den bereits im State gecachten Stand (meist schon durch den Session-
 *  Auto-Load vorhanden), lädt danach den heutigen Check-in frisch nach und
 *  füllt die Regler ggf. nach — deckt sowohl den schnellen Regelfall als
 *  auch den Fall ab, dass der Auto-Load beim Öffnen noch nicht fertig ist.
 *  Füllt nur nach, solange der Athlet noch nichts eingegeben hat und der
 *  Dialog nicht zwischenzeitlich erneut geöffnet wurde (sonst würde eine
 *  spät eintreffende Antwort laufende Eingaben überschreiben). */
export async function openDialog() {
  if (!isAthlete()) return;
  if (!overlay) build();
  const myToken = ++openToken;
  touched = false;
  errorEl.textContent = "";
  fillFromCheckin(getState().checkin);
  overlay.style.display = "flex";
  document.addEventListener("keydown", onKeydown);
  const result = await loadToday();
  if (myToken !== openToken) return;
  if (result.ok) {
    if (!touched) fillFromCheckin(result.checkin);
  } else {
    errorEl.textContent = result.error?.message || "Check-in konnte nicht geladen werden.";
  }
}

export function closeDialog() {
  if (!overlay) return;
  overlay.style.display = "none";
  document.removeEventListener("keydown", onKeydown);
}
