/* ============================================================
   CORE/PLAN-DRAG.JS — Drag-&-Drop-Entscheidungen (kein DOM)
   Reine Regel-Ebene für das Verschieben einer Trainingskarte per
   Drag & Drop (docs/phase-3-konzept-planungstab.md §4/§6):
   - welche Tage sind gültige Drop-Ziele (heute + Zukunft),
   - was passiert bei einem Drop (verschieben / No-Op / abgewiesen),
   - welches week/phase-Label die Karte am Zieltag trägt.

   Bewusst hier statt in ui/planned.js: dieselben Regeln gelten für den
   Drag-Pfad UND den bestehenden "Verschieben"-Button — beide laufen über
   state/plan-cards.js::movePlanCard(). Ohne DOM ist alles mit node:test
   prüfbar (tests/plan-drag.test.js).
   ============================================================ */

import { isoWeekKey } from "./aggregate.js";

/** Alle Tage (Mo–So) der Kalenderwoche, in der `dateStr` liegt.
 *  @param {string} dateStr ISO-Datum (YYYY-MM-DD)
 *  @returns {string[]} 7 ISO-Daten, Montag zuerst */
export function weekDays(dateStr) {
  const d = new Date(dateStr);
  d.setHours(0, 0, 0, 0);
  // getDay(): So=0 → auf Montag als Wochenstart normalisieren
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  const days = [];
  for (let i = 0; i < 7; i++) {
    const day = new Date(d);
    day.setDate(d.getDate() + i);
    days.push(toISO(day));
  }
  return days;
}

/** Lokales ISO-Datum (YYYY-MM-DD) — bewusst NICHT toISOString(), das
 *  in UTC umrechnet und östlich von Greenwich einen Tag zurückspringt. */
function toISO(d) {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

/** Ist `date` ein erlaubtes Drop-Ziel? Konzept §6: nur heute und
 *  zukünftige Tage — ein vergangener Tag ist entweder gefahren (Ist steht
 *  über die read-only-Pipeline da) oder verpasst.
 *  @param {string} date @param {string} today beide ISO (YYYY-MM-DD) */
export function isDropAllowed(date, today) {
  return date >= today;
}

/** Darf eine Karte überhaupt als Drag-Quelle gegriffen werden? Fasst die
 *  Gate-Bedingungen aus ui/planned.js::_renderCard() zusammen (Bearbeitungs-
 *  recht, Datum, Trainer-Vorschlag-Modus) — als eigene, reine Funktion, damit
 *  der Vorschlag-Modus-Anteil (Bugfix: Drag & Drop umging den Direkt/
 *  Vorschlag-Umschalter vollständig, Trainer-Sicht-Konzept §3) ohne DOM
 *  testbar ist. Ein Trainer im Vorschlag-Modus bekommt keinen Griff — Drag &
 *  Drop hat kein Begründungsfeld und bewegt optimistisch sofort, beides passt
 *  nicht zu "erzeugt nur einen Vorschlag" (s. Konzept-Nachtrag).
 *  @param {{canEdit: boolean, cardDate: string, today: string, trainerProposalMode: boolean}} args */
export function canDragCard({ canEdit, cardDate, today, trainerProposalMode }) {
  return !!canEdit && cardDate >= today && !trainerProposalMode;
}

/**
 * Entscheidet, was ein Drop auf `targetDate` auslöst.
 * @param {{id: string, date: string}} card die gezogene Karte
 * @param {string} targetDate ISO-Datum des Zieltags
 * @param {string} today ISO-Datum
 * @returns {{action: "move"|"none"|"rejected", reason?: string}}
 *   - "move"     → verschieben, movePlanCard() aufrufen
 *   - "none"     → Drop auf denselben Tag: kein Schreibvorgang (Konzept §7)
 *   - "rejected" → vergangener Tag (Konzept §6), Ghost schnappt zurück
 */
export function resolveDrop(card, targetDate, today) {
  if (!card || !targetDate) return { action: "rejected", reason: "Kein Ziel" };
  if (card.date === targetDate) return { action: "none" };
  if (!isDropAllowed(targetDate, today))
    return { action: "rejected", reason: "Vergangene Tage nehmen keine Karte an" };
  return { action: "move" };
}

/**
 * week/phase-Label für eine Karte, die auf `date` verschoben wird.
 * Übernimmt die Labels der Karten, die bereits in der Zielwoche liegen —
 * sonst hinge die Karte nach einem Drop über die Wochengrenze unter der
 * ALTEN Wochenüberschrift, mit dem neuen Datum daneben (ui/planned.js
 * gruppiert nach s.week, nicht nach Datum).
 *
 * Die gezogene Karte selbst wird ausgeschlossen (`excludeId`) — sie
 * verlässt ihre alte Woche gerade und darf ihr eigenes altes Label nicht
 * als "Beleg" für die Zielwoche liefern.
 *
 * Ist die Zielwoche leer, gibt es nichts zu übernehmen → `null`, und der
 * Aufrufer lässt week/phase unverändert. Bekannte v1-Einschränkung: eine
 * auf einen komplett leeren Wochenblock gezogene Karte behält damit ihr
 * altes Label (s. docs/offene-punkte.md).
 *
 * @param {{id: string, date: string, week?: string|null, phase?: string|null}[]} cards
 * @param {string} date ISO-Zieldatum
 * @param {string} [excludeId] ID der gezogenen Karte
 * @returns {{week: string|null, phase: string|null}|null} null = Label behalten
 */
export function weekLabelForDate(cards, date, excludeId) {
  if (!date) return null;
  const targetWeek = isoWeekKey(date);
  const sibling = (cards || []).find(
    (c) => c.id !== excludeId && c.date && isoWeekKey(c.date) === targetWeek && c.week
  );
  if (!sibling) return null;
  return { week: sibling.week, phase: sibling.phase ?? null };
}
