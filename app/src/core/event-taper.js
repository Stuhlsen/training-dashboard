/* ============================================================
   CORE/EVENT-TAPER.JS — Taper-Erkennung für Preset "Auf Event hin" (kein
   DOM, kein I/O)
   (Progressionssteuerung — docs/konzept-progressionssteuerung.md C4,
   Auftrag "Taper-Erkennung für 'Auf Event hin'")

   core/ladder-progression.js::presetAction() unterstützt für das Preset
   "event" bereits `inTaper` (C4: "Leiter läuft normal bis Taper-Beginn,
   danach eingefroren"), aber niemand hat es bisher hergeleitet —
   state/export.js übergab bislang fest `false`.

   Gating identisch zu core/conflicts.js' K-EVENT-Regel (nur `type: "race"`
   MIT gesetzter `priority` zählt als Zielevent) — keine zweite, abweichende
   Definition von "zählendes Event" neben der bereits bestehenden.

   Bewusst KEIN Bezug auf `event.isTest`: is_test-Events frieren die Leiter
   bereits vollständig separat über presetAction()s `isTestEvent`-Zweig ein
   (der IMMER zuerst greift, unabhängig von `inTaper`, s. D5) — eine
   Vermischung würde die beiden im Konzept bewusst getrennten Fälle wieder
   zusammenwerfen.
   ============================================================ */

import { CONFLICT_THRESHOLDS } from "./plan-config.js";
import { diffDays } from "./format.js";

/**
 * Befindet sich `todayISO` im Taper-Fenster vor einem priorisierten
 * Renn-Event (0..taperDays Tage davor, beide Grenzen inklusiv)?
 * @param {{eventDate:string, type?:string, priority?:string|null}|null|undefined} event
 * @param {string} todayISO
 * @param {number} [taperDays] CONFLICT_THRESHOLDS.eventTaperDays per Default
 * @returns {boolean}
 */
export function isInEventTaper(event, todayISO, taperDays = CONFLICT_THRESHOLDS.eventTaperDays) {
  if (!event || event.type !== "race" || !event.priority) return false;
  const days = diffDays(event.eventDate, todayISO);
  return days >= 0 && days <= taperDays;
}
