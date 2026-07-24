/* ============================================================
   CORE/PROJECTION.JS — TSS/CTL-Prognose in die Zukunft (kein DOM)
   (Phase 3, Schritt 4 — docs/phase-3-konzept-konfliktlogik-prognose.md §1/§2)

   Reine Rechenschicht: schreibt CTL/ATL/TSB ab dem letzten Ist-Stand über die
   geplanten Karten in die Zukunft fort (Standard-PMC-Fortschreibung, Coggan).
   Liefert DATEN, kein Rendering — die Delta-Zeile/Badges baut Schritt 5.

   Befinden fließt hier bewusst NICHT ein (Governor-Abgrenzung): für
   zukünftige Tage gibt es keine Befinden-Daten, die Zukunft ist rein
   lastbasiert.

   Wiederverwendet:
   - core/pmc.js::currentPmc  → Startpunkt CTL/ATL (as-of heute)
   - core/pmc.js CTL_DAYS/ATL_DAYS = 42/7 (dieselbe Glättung)
   - core/ftp-progress.js::estimateSessionTSS → TSS-Schätzung aus Workout-Blöcken
   - core/format.js::localISODate/addDaysISO → lokale Datumsarithmetik
   ============================================================ */

import { currentPmc, CTL_DAYS, ATL_DAYS } from "./pmc.js";
import { estimateSessionTSS } from "./ftp-progress.js";
import { localISODate, addDaysISO } from "./format.js";
import { TYPE_DEFAULT_TSS, FALLBACK_TSS } from "./plan-config.js";

/** Auf 2 Nachkommastellen runden (nur für die Ausgabe — die Fortschreibung
 *  selbst rollt ungerundet, damit sich Rundungsfehler nicht akkumulieren). */
function round2(n) {
  return Math.round(n * 100) / 100;
}

/**
 * Geplanter TSS einer Karte nach der Prioritätskette (Konzept §2):
 *   1. `tssPlanned` explizit gesetzt         → sicher   (source "target")
 *   2. aus `workout`-Blöcken geschätzt        → unsicher (source "workout")
 *   3. Typ-Default (Median-TRIMP je Typ, K3)  → unsicher (source "type")
 * Karten mit geschätztem TSS werden als `uncertain` markiert, damit die
 * Prognose (bzw. Schritt 5) nicht präziser aussieht als die Datenlage ist.
 * Ausgefallene Karten behandelt der Aufrufer (projectLoad überspringt sie) —
 * diese Funktion beschreibt nur, WAS die Karte an Last brächte.
 *
 * @param {{tssPlanned?: number|null, workout?: Object|null, typ?: string|null}} card
 * @param {{typeDefaults?: Record<string,number>, fallbackTss?: number, ftp?: number}} [opts]
 * @returns {{tss: number, uncertain: boolean, source: "target"|"workout"|"type"}}
 */
export function estimateTss(card, opts = {}) {
  const typeDefaults = opts.typeDefaults ?? TYPE_DEFAULT_TSS;
  const fallbackTss = opts.fallbackTss ?? FALLBACK_TSS;

  // 1. explizit gesetzter Zielwert (Number.isFinite statt typeof: ein
  //    NaN würde sonst als "gesetzt" durchgehen und die gesamte Kurve mit
  //    NaN vergiften — 0 bleibt ein gültiger expliziter Wert)
  if (Number.isFinite(card?.tssPlanned)) {
    return { tss: card.tssPlanned, uncertain: false, source: "target" };
  }

  // 2. Schätzung aus den Workout-Blöcken (nur wenn sie etwas ergibt)
  if (card?.workout) {
    const est = estimateSessionTSS(card.workout, opts.ftp);
    if (est > 0) return { tss: est, uncertain: true, source: "workout" };
  }

  // 3. Typ-Default (Median-TRIMP je Typ), sonst Pauschalwert
  const tss = typeDefaults[card?.typ] ?? fallbackTss;
  return { tss, uncertain: true, source: "type" };
}

/** Höchstes Datum in `dates`, das ≥ `floor` liegt; `floor`, wenn keins passt. */
function maxDateFrom(dates, floor) {
  let anchor = floor;
  for (const d of dates) {
    if (d && d >= floor && d > anchor) anchor = d;
  }
  return anchor;
}

/**
 * PMC-Fortschreibung ab dem letzten Ist-Stand über die geplanten Karten.
 *
 * @param {Array<{id: string, date: string, tssPlanned?: number|null, workout?: Object|null, typ?: string|null, cancelled?: boolean}>} cards
 *   Plan-Karten (Session-Shape aus data-access/supabase/plan-cards.js).
 * @param {import("../types.js").Ride[]} actuals  Ist-Fahrten (für den Startpunkt)
 * @param {{today?: string, events?: Array<{eventDate: string}>, ftp?: number,
 *          typeDefaults?: Record<string,number>, fallbackTss?: number}} [options]
 * @returns {{
 *   days: Array<{date: string, ctl: number, atl: number, tsb: number, tss: number, uncertain: boolean, cardIds: string[]}>,
 *   startCtl: number, startAtl: number, hasBaseline: boolean, asOf: string, horizonEnd: string
 * }}
 */
export function projectLoad(cards, actuals, options = {}) {
  const today = options.today ?? localISODate();
  const events = options.events ?? [];
  const tssOpts = {
    typeDefaults: options.typeDefaults,
    fallbackTss: options.fallbackTss,
    ftp: options.ftp,
  };

  // ── Startpunkt: letzter Ist-CTL/ATL, as-of heute (bereits lastfrei
  //    fortgeschrieben, s. currentPmc). Ohne ctl/atl-Kontext (z.B. nur
  //    Plan-1-Notion-TSB oder gar keine Fahrten) starten wir bei 0 und
  //    markieren hasBaseline:false — die Kurve ist dann relativ, nicht absolut.
  const start = currentPmc(actuals || [], today);
  const hasBaseline = !!(start && start.ctl != null && start.atl != null);
  const startCtl = hasBaseline ? start.ctl : 0;
  const startAtl = hasBaseline ? start.atl : 0;
  const asOf = start?.asOfDate ?? today;

  // ── Horizont: heute … max(letzter geplanter Tag, nächster Event) + 7 Tage
  //    Nachlauf. Ohne zukünftige Karten UND ohne Events endet er heute.
  const futureCards = (cards || []).filter((c) => !c.cancelled && c.date && c.date >= today);
  const futureEventDates = events.map((e) => e.eventDate).filter((d) => d && d >= today);
  const hasHorizonInput = futureCards.length > 0 || futureEventDates.length > 0;
  const anchor = maxDateFrom(
    [...futureCards.map((c) => c.date), ...futureEventDates],
    today
  );
  const horizonEnd = hasHorizonInput ? addDaysISO(anchor, 7) : today;

  // ── Tages-TSS aggregieren (mehrere Karten am selben Tag summieren)
  const tssByDate = new Map();
  for (const card of futureCards) {
    if (card.date > horizonEnd) continue;
    const { tss, uncertain } = estimateTss(card, tssOpts);
    const entry = tssByDate.get(card.date) || { tss: 0, uncertain: false, cardIds: [] };
    entry.tss += tss;
    entry.uncertain = entry.uncertain || uncertain;
    entry.cardIds.push(card.id);
    tssByDate.set(card.date, entry);
  }

  // ── Fortschreibung Tag für Tag. TSB[t] = CTL[t-1] − ATL[t-1] (Form am
  //    Morgen, VOR der Einheit des Tages); der gespeicherte ctl/atl-Wert ist
  //    der Stand am ABEND des Tages (nach der Einheit).
  const days = [];
  let ctl = startCtl;
  let atl = startAtl;
  for (let d = today; d <= horizonEnd; d = addDaysISO(d, 1)) {
    const e = tssByDate.get(d) || { tss: 0, uncertain: false, cardIds: [] };
    const tsb = ctl - atl;
    const ctlNext = ctl + (e.tss - ctl) / CTL_DAYS;
    const atlNext = atl + (e.tss - atl) / ATL_DAYS;
    days.push({
      date: d,
      ctl: round2(ctlNext),
      atl: round2(atlNext),
      tsb: round2(tsb),
      tss: e.tss,
      uncertain: e.uncertain,
      cardIds: e.cardIds,
    });
    ctl = ctlNext;
    atl = atlNext;
  }

  return {
    days,
    startCtl: round2(startCtl),
    startAtl: round2(startAtl),
    hasBaseline,
    asOf,
    horizonEnd,
  };
}
