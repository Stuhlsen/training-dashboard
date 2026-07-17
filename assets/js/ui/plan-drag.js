/* ============================================================
   UI/PLAN-DRAG.JS — Drag & Drop einer Trainingskarte auf einen Tag
   Pointer Events (Maus + Touch + Pen in einem Pfad), kein natives
   HTML5-draggable und keine Library — s. docs/phase-3-konzept-
   planungstab.md §4.

   Die REGELN liegen in core/plan-drag.js (rein, getestet), das
   SCHREIBEN in state/plan-cards.js::movePlanCard() — dieses Modul
   macht nur DOM: Griff, Ghost, Tages-Slots, Autoscroll. Es meldet
   einen gültigen Drop über onDrop(cardId, date) zurück; ui/planned.js
   ruft damit dieselbe Funktion auf wie der "Verschieben"-Button.

   Die Tages-Slots existieren nur WÄHREND eines Drags: der Planungstab
   rendert ein Wochen-Grid, keine Tagesspalten (planned.css:
   .planned-cards = auto-fill-Grid). Ein Drop braucht aber einen Tag
   als Ziel — auch einen, an dem noch keine Karte liegt. Deshalb blendet
   der Drag-Start pro Wochenblock eine Slot-Zeile (Mo–So) ein und der
   Drag-Ende sie wieder aus; im Ruhezustand bleibt das Layout exakt wie
   bisher.
   ============================================================ */

import { resolveDrop, daySlots } from "../core/plan-drag.js";
import { fmtDate, localISODate } from "../core/format.js";

/** Pixel, die der Zeiger sich bewegen muss, bevor aus einem Druck auf den
 *  Griff ein Drag wird — sonst startet jeder Klick/Tap einen Ghost. */
const DRAG_THRESHOLD_PX = 5;
/** Abstand zum Fensterrand, ab dem der Ghost die Seite mitscrollt (§4). */
const AUTOSCROLL_ZONE_PX = 90;
/** Pro Frame, nicht pro Mausbewegung — bei 60fps ~480px/s. */
const AUTOSCROLL_SPEED_PX = 8;

const WEEKDAYS = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];

/** Aktiver Drag (nur einer gleichzeitig) oder null. */
let drag = null;
/** Von initPlanDrag() gesetzt: was bei einem gültigen Drop passiert. */
let dropHandler = null;

/** "Mi 22.07." — Tagesformat der Slots. Der DD.MM-Teil kommt aus
 *  core/format.js::fmtDate (dashboard-weite Konvention), der Wochentag
 *  davor ist das, was einen Slot überhaupt erst als Tag lesbar macht. */
function fmtDay(iso) {
  return `${WEEKDAYS[new Date(iso).getDay()]} ${fmtDate(iso)}`;
}

/* ── Tages-Slots ein-/ausblenden ───────────────────────────────── */

/** Hängt an jeden Wochenblock eine Mo–So-Slot-Zeile. Anker ist das Datum
 *  der ersten Karte der Woche — der Wochenblock IST nach Plan-Woche
 *  gruppiert, seine Karten liegen also alle in derselben Kalenderwoche. */
function showDaySlots(container, today) {
  const weeks = container.querySelectorAll(".planned-week");
  for (const week of weeks) {
    const anchor = week.querySelector(".planned-card[data-date]")?.dataset.date;
    if (!anchor) continue;
    const row = document.createElement("div");
    row.className = "planned-day-slots";
    row.innerHTML = daySlots(anchor, today)
      .map(
        (slot) => `
        <div class="planned-day-slot${slot.allowed ? "" : " planned-day-slot--blocked"}"
             ${slot.allowed ? `data-drop-date="${slot.date}"` : ""}
             aria-hidden="true">
          <span class="planned-day-slot-day">${fmtDay(slot.date)}</span>
          <span class="planned-day-slot-hint">${slot.allowed ? "ablegen" : "vorbei"}</span>
        </div>`
      )
      .join("");
    week.appendChild(row);
  }
}

function hideDaySlots(container) {
  for (const row of container.querySelectorAll(".planned-day-slots")) row.remove();
}

/* ── Ghost ─────────────────────────────────────────────────────── */

function makeGhost(cardEl, event) {
  const rect = cardEl.getBoundingClientRect();
  const ghost = cardEl.cloneNode(true);
  ghost.classList.add("planned-card--ghost");
  ghost.querySelector(".planned-card-grip")?.remove();
  // Der Klon zöge sonst jede id der Karte (z.B. push-status-<id>) ein
  // zweites Mal ins Dokument — getElementById fände dann je nach
  // Baumreihenfolge den Ghost statt der echten Karte.
  for (const withId of ghost.querySelectorAll("[id]")) withId.removeAttribute("id");
  ghost.removeAttribute("id");
  ghost.style.width = `${rect.width}px`;
  ghost.style.height = `${rect.height}px`;
  document.body.appendChild(ghost);
  return {
    el: ghost,
    // Greifpunkt merken, damit der Ghost nicht unter dem Zeiger springt
    offsetX: event.clientX - rect.left,
    offsetY: event.clientY - rect.top,
  };
}

function moveGhost(ghost, x, y) {
  ghost.el.style.transform = `translate(${x - ghost.offsetX}px, ${y - ghost.offsetY}px)`;
}

/* ── Autoscroll ────────────────────────────────────────────────── */

/** Läuft als rAF-Schleife, solange gezogen wird — NICHT aus pointermove
 *  heraus: am Rand stillgehaltene Zeiger scrollen sonst nicht (ohne
 *  Bewegung kein Event), und man müsste im Randstreifen wackeln, um die
 *  Liste weiterzubewegen. */
function autoscrollTick() {
  if (!drag?.active) return;
  const y = drag.pointerY;
  const dy =
    y < AUTOSCROLL_ZONE_PX
      ? -AUTOSCROLL_SPEED_PX
      : y > window.innerHeight - AUTOSCROLL_ZONE_PX
        ? AUTOSCROLL_SPEED_PX
        : 0;
  if (dy) {
    window.scrollBy(0, dy);
    // Der Zeiger steht still, aber der Inhalt wandert unter ihm durch —
    // ohne das hier bliebe die Hervorhebung am alten Slot kleben.
    highlight(slotUnder(drag.pointerX, y));
  }
  drag.rafId = window.requestAnimationFrame(autoscrollTick);
}

/* ── Drop-Ziel unter dem Zeiger ────────────────────────────────── */

function slotUnder(x, y) {
  // Der Ghost hängt am Zeiger und würde jeden Treffer abfangen —
  // pointer-events:none (planned.css) hält ihn aus elementFromPoint raus.
  const el = document.elementFromPoint(x, y);
  return el?.closest(".planned-day-slot[data-drop-date]") || null;
}

function highlight(slotEl) {
  if (drag.hoverEl === slotEl) return;
  drag.hoverEl?.classList.remove("planned-day-slot--over");
  slotEl?.classList.add("planned-day-slot--over");
  drag.hoverEl = slotEl;
}

/* ── Drag-Lebenszyklus ─────────────────────────────────────────── */

function beginDrag(event) {
  drag.active = true;
  drag.ghost = makeGhost(drag.cardEl, event);
  drag.cardEl.classList.add("planned-card--dragging");
  document.body.classList.add("is-card-dragging");
  showDaySlots(drag.container, drag.today);
  moveGhost(drag.ghost, event.clientX, event.clientY);
  drag.rafId = window.requestAnimationFrame(autoscrollTick);
}

/** Räumt Ghost, Slots und Listener ab. `snapBack` lässt den Ghost sichtbar
 *  an die Ausgangsposition zurückschnappen (Konzept §6: abgewiesener Drop)
 *  statt einfach zu verschwinden. */
function endDrag(snapBack) {
  if (!drag) return;
  const { ghost, cardEl, container } = drag;
  if (drag.rafId) window.cancelAnimationFrame(drag.rafId);
  window.removeEventListener("pointermove", onPointerMove);
  window.removeEventListener("pointerup", onPointerUp);
  window.removeEventListener("pointercancel", onPointerCancel);
  window.removeEventListener("keydown", onKeyDown);

  drag.hoverEl?.classList.remove("planned-day-slot--over");
  hideDaySlots(container);
  cardEl?.classList.remove("planned-card--dragging");
  document.body.classList.remove("is-card-dragging");

  if (ghost) {
    if (snapBack && cardEl?.isConnected) {
      // Zielposition LIVE lesen: der Ghost wird per transform gesetzt, und
      // die Ausgangsposition der Karte hat sich seit dem Greifen verschoben
      // (Autoscroll, eingeblendete Slot-Zeilen). Ein gemerkter Startwert —
      // oder gar translate(0,0), was der Viewport-Ecke entspräche — ließe
      // den Ghost woandershin fliegen als zur Karte.
      const home = cardEl.getBoundingClientRect();
      ghost.el.classList.add("planned-card--ghost-snapback");
      ghost.el.style.transform = `translate(${home.left}px, ${home.top}px)`;
      ghost.el.addEventListener("transitionend", () => ghost.el.remove(), { once: true });
      // Fallback, falls die Transition nie feuert (reduced-motion o. Ä.)
      setTimeout(() => ghost.el.remove(), 400);
    } else {
      ghost.el.remove();
    }
  }
  drag = null;
}

function onPointerMove(event) {
  if (!drag) return;
  if (!drag.active) {
    const far =
      Math.abs(event.clientX - drag.startX) > DRAG_THRESHOLD_PX ||
      Math.abs(event.clientY - drag.startY) > DRAG_THRESHOLD_PX;
    if (!far) return;
    beginDrag(event);
  }
  event.preventDefault();
  drag.pointerX = event.clientX;
  drag.pointerY = event.clientY;
  moveGhost(drag.ghost, event.clientX, event.clientY);
  highlight(slotUnder(event.clientX, event.clientY));
}

function onPointerUp(event) {
  if (!drag) return;
  if (!drag.active) {
    endDrag(false); // reiner Klick auf den Griff — nie ein Drag geworden
    return;
  }
  const slot = slotUnder(event.clientX, event.clientY);
  const target = slot?.dataset.dropDate || null;
  const { action } = resolveDrop({ id: drag.cardId, date: drag.cardDate }, target, drag.today);
  const cardId = drag.cardId;

  // "none" (derselbe Tag) und "rejected" (Vergangenheit / neben dem Raster
  // losgelassen) schreiben beide NICHT — der Ghost schnappt zurück (§6/§7).
  endDrag(action !== "move");
  if (action === "move") dropHandler?.(cardId, target);
}

function onPointerCancel() {
  endDrag(true);
}

function onKeyDown(event) {
  if (event.key === "Escape") endDrag(true);
}

function onPointerDown(event) {
  // Nur primäre Taste/Berührung; Rechtsklick startet keinen Drag.
  if (event.button !== 0 || drag) return;
  const grip = event.target.closest(".planned-card-grip");
  if (!grip) return;
  const cardEl = grip.closest(".planned-card[data-card-id]");
  if (!cardEl) return;

  event.preventDefault();
  drag = {
    container: event.currentTarget,
    cardEl,
    cardId: cardEl.dataset.cardId,
    cardDate: cardEl.dataset.date,
    // localISODate() statt toISOString(): letzteres liefert das UTC-Datum
    // und würde in deutscher Sommerzeit zwischen 00:00 und 02:00 noch den
    // Vortag als "heute" ausweisen — der gerade abgelaufene Tag bliebe
    // dann ein gültiges Drop-Ziel.
    today: localISODate(),
    startX: event.clientX,
    startY: event.clientY,
    pointerX: event.clientX,
    pointerY: event.clientY,
    active: false,
    ghost: null,
    hoverEl: null,
    rafId: 0,
  };
  window.addEventListener("pointermove", onPointerMove, { passive: false });
  window.addEventListener("pointerup", onPointerUp);
  window.addEventListener("pointercancel", onPointerCancel);
  window.addEventListener("keydown", onKeyDown);
}

/* ── Öffentliche API ───────────────────────────────────────────── */

/**
 * Bindet Drag & Drop an den Planungstab-Container. Nur EINMAL pro
 * Container aufrufen (ui/planned.js guardet über ein dataset-Flag, wie
 * beim Click-Handler) — der Listener überlebt den innerHTML-Austausch
 * beim Re-Render.
 * @param {HTMLElement} container
 * @param {(cardId: string, date: string) => void} onDrop gültiger Drop
 */
export function initPlanDrag(container, onDrop) {
  dropHandler = onDrop;
  container.addEventListener("pointerdown", onPointerDown);
}

/** Bricht einen laufenden Drag ab — ui/planned.js ruft das vor jedem
 *  Re-Render (Athletenwechsel, Adjustment-Änderung): der innerHTML-
 *  Austausch reißt die gezogene Karte sonst unter dem Ghost weg und der
 *  Drop schriebe eine Fremd-Karte (Konzept §7). */
export function cancelActiveDrag() {
  endDrag(false);
}
