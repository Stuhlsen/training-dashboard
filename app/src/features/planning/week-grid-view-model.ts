/* ============================================================
   FEATURES/PLANNING/WEEK-GRID-VIEW-MODEL.TS — reine Ableitung für das
   Mo–So-Raster des Planungstabs (Etappe 13a, Redesign nach "Planungstab
   Live"-Mockup). Ersetzt NICHT buildPlanningSections() (die liefert weiter
   die Fortschritts-Statistik und die reinen Done/Missed/Cancelled-Listen
   für die neue "Absolviert"-Tabelle, s. done-table-view-model.ts) — dieses
   Modul liefert stattdessen eine EINHEITLICHE Kalenderstruktur über ALLE
   Status (done/today/open/missed/cancelled/empty) hinweg, weil das Raster
   anders als die bisherige Karten-Liste jede Tageszelle einer Woche zeigt,
   nicht nur die anstehenden Karten.

   Nur aktuelle + zukünftige Wochen (Korrektur nach Etappe 13c, 21.08.2026):
   Der Bereich im Planungstab heißt "Ausstehend" — vollständig vergangene
   Wochen gehören dort nicht rein, die absolvierten/verpassten/ausgefallenen
   Karten stehen bereits in der "Absolviert"-Tabelle bzw. deren Lücken-Chips
   (done-table-view-model.ts::gapsChips). Frühere Fassung zeigte hier bewusst
   ALLE Wochen inkl. reiner Vergangenheit ("kein künstliches Wochenlimit") —
   das führte dazu, dass Karten bis zum allerersten Plantag unter "Ausstehend"
   auftauchten, obwohl sie längst anderswo (Absolviert-Tabelle) sichtbar
   waren. Die aktuelle, noch laufende Woche bleibt trotzdem komplett sichtbar
   (auch ihre bereits vergangenen Tage) — nur ganze Wochen VOR der aktuellen
   werden rausgefiltert. ============================ */

import { isoWeekKey } from "../../core/aggregate.js";
import { weekDays } from "../../core/plan-drag.js";
import { computePlanningDerivedSets, isMissedCard, isRestDay, type PlanningDerivedSets } from "./planning-view-model";
import type { PlanCard } from "../../api/types";

type Ride = import("../../types.js").Ride;

export type DayStatus = "done" | "today" | "open" | "missed" | "cancelled" | "empty";

/** Statusglyphen — 1:1 an das Mockup angelehnt (STATUS-Objekt), hier als
 *  reine Konstante statt in der Komponente, analog PLAN_TYPE_COLOR/ICON in
 *  planning-view-model.ts. */
export const DAY_STATUS_GLYPH: Record<DayStatus, string> = {
  done: "✓",
  today: "●",
  open: "",
  missed: "!",
  cancelled: "×",
  empty: "",
};

/** Textform des Status fuer Screenreader — DAY_STATUS_GLYPH allein ist
 *  `aria-hidden` (Symbol ohne Wortbedeutung), diese Map liefert das
 *  gesprochene Gegenstueck fuer den `aria-label` der Tageszelle. */
export const DAY_STATUS_LABEL: Record<DayStatus, string> = {
  done: "absolviert",
  today: "heute",
  open: "offen",
  missed: "verpasst",
  cancelled: "ausgefallen",
  empty: "",
};

/** Token-Namen (tokens.css), keine Hex-Werte — Politur-Vorgabe aus dem
 *  Etappe-13-Plan ("überall Tokens statt Hex"). */
export const DAY_STATUS_COLOR_TOKEN: Record<DayStatus, string> = {
  done: "var(--ok)",
  today: "var(--accent)",
  open: "var(--ink-3)",
  missed: "var(--warn)",
  cancelled: "var(--danger)",
  empty: "var(--ink-3)",
};

export interface GridDayCell {
  date: string;
  isToday: boolean;
  status: DayStatus;
  /** Die für diesen Tag primär angezeigte Karte — bei mehreren Karten am
   *  selben Datum (z. B. ausgefallene Original- + verschobene Ersatzkarte)
   *  die nicht-ausgefallene; `null` nur bei wirklich leerem Tag. */
  card: PlanCard | null;
  /** Weitere Karten desselben Datums (z. B. die ausgefallene Original-
   *  karte, wenn `card` bereits die Ersatzkarte zeigt) — für die
   *  Lücken-Chips der Done-Tabelle (Etappe 13d), hier nur durchgereicht. */
  otherCards: PlanCard[];
}

export interface GridWeekRow {
  weekKey: string;
  phase: string | null;
  isRecoveryWeek: boolean;
  rangeStart: string;
  rangeEnd: string;
  /** Tatsächlich gefahrene TSS-Summe der Woche, sobald mindestens eine Fahrt
   *  vorliegt — sonst die geplante Summe (`tssPlanned`) als Schätzung für
   *  reine Zukunftswochen. Nie eine Mischung aus beidem — `tssIsPlanned`
   *  sagt, welcher Fall gerade gilt (Anzeige braucht sonst ununterscheidbar
   *  aussehende "Ist"- und "Soll"-Zahlen nebeneinander im Raster). */
  tssSum: number;
  tssIsPlanned: boolean;
  /** 0–100, relativ zur höchsten `tssSum` unter den zurückgegebenen Wochen
   *  (kein externes Zielvolumen verfügbar — s. Etappe-13-Plan). */
  loadPct: number;
  days: GridDayCell[];
}

function statusForDate(
  date: string,
  primary: PlanCard | null,
  todayIso: string,
  doneDates: Set<string>,
): DayStatus {
  if (!primary) return "empty";
  if (primary.cancelled) return "cancelled";
  // Ruhetag: nie "verpasst" (isRestDay-Konvention aus buildPlanningSections)
  // — ein nicht gefahrener Ruhetag ist Erfüllung, sobald der Tag vorbei ist.
  if (isRestDay(primary)) return date <= todayIso ? "done" : "open";
  if (doneDates.has(date)) return "done";
  if (date === todayIso) return "today";
  // isMissedCard() ist dieselbe Regel wie buildPlanningSections()' missed-
  // Filter (planning-view-model.ts) — geteilt, damit Raster-Status und
  // Fortschritts-Statistik für dieselbe Karte nie auseinanderlaufen.
  if (isMissedCard(primary, doneDates, todayIso)) return "missed";
  return "open";
}

export function buildWeekGrid(
  cards: PlanCard[],
  rides: Ride[],
  todayIso: string,
  derived: PlanningDerivedSets = computePlanningDerivedSets(cards, rides),
): GridWeekRow[] {
  const { doneDates, recoveryWeeks } = derived;

  const byDate = new Map<string, PlanCard[]>();
  // Anker-Datum je Wochenschlüssel im selben Durchlauf mitgeführt — spart
  // die sonst nötige `cards.find(...)`-Suche pro Woche (O(Wochen×Karten)).
  const anchorByWeek = new Map<string, string>();
  for (const c of cards) {
    const bucket = byDate.get(c.date);
    if (bucket) bucket.push(c);
    else byDate.set(c.date, [c]);
    const weekKey = isoWeekKey(c.date);
    if (!anchorByWeek.has(weekKey)) anchorByWeek.set(weekKey, c.date);
  }

  const weekKeys = [...anchorByWeek.keys()].sort();

  const rows = weekKeys.map((weekKey): GridWeekRow => {
    const anchorDate = anchorByWeek.get(weekKey)!;
    const days: GridDayCell[] = weekDays(anchorDate).map((date) => {
      const dateCards = byDate.get(date) ?? [];
      const primary = dateCards.find((c) => !c.cancelled) ?? dateCards[0] ?? null;
      const otherCards = dateCards.filter((c) => c !== primary);
      return {
        date,
        isToday: date === todayIso,
        status: statusForDate(date, primary, todayIso, doneDates),
        card: primary,
        otherCards,
      };
    });

    const weekCards = days.flatMap((d) => (d.card ? [d.card, ...d.otherCards] : d.otherCards));
    const activeCards = weekCards.filter((c) => !c.cancelled);
    const phase = activeCards.find((c) => c.phase)?.phase ?? null;
    const plannedTssSum = activeCards.reduce((sum, c) => sum + (c.tssPlanned ?? 0), 0);
    // `tssPlanned` fehlt bei den meisten Karten (nur strukturierte Plan-2-
    // Workouts haben es) — eine Woche mit real fahrenen Einheiten zeigte
    // dadurch "0 TSS" direkt neben der Hero-Seite, die für dieselbe Woche
    // die echte, aus den Fahrten berechnete Summe zeigt (Critique-Fund).
    // Fallback auf tatsächlich gefahrene TSS, sobald mindestens eine Fahrt
    // in der Woche liegt — nur eine reine Zukunftswoche ohne Fahrten zeigt
    // weiterhin die geplante Summe (die einzig verfügbare Schätzung dort).
    const weekRides = rides.filter((r) => r.dateISO >= days[0].date && r.dateISO <= days[6].date);
    // Auf Fahrten-PRÄSENZ prüfen, nicht auf Summe > 0 — eine Woche mit
    // echten Fahrten, die zufällig alle `tss: null` haben (z. B. Plan-1/
    // Notion-Ära ohne Leistungsdaten), soll 0 zeigen, nicht auf die geplante
    // Schätzung zurückfallen (Code-Review-Fund).
    const actualTssSum = weekRides.reduce((sum, r) => sum + (r.tss ?? 0), 0);
    const tssIsPlanned = weekRides.length === 0;
    const tssSum = tssIsPlanned ? plannedTssSum : actualTssSum;

    return {
      weekKey,
      phase,
      isRecoveryWeek: recoveryWeeks.has(weekKey),
      rangeStart: days[0].date,
      rangeEnd: days[6].date,
      tssIsPlanned,
      tssSum,
      loadPct: 0, // unten relativ zur Wochen-Maximallast nachgetragen
      days,
    };
  });

  // Ganze Wochen vor der aktuellen raus — die laufende Woche (rangeEnd >=
  // todayIso) bleibt trotz teilweise vergangener Tage komplett erhalten.
  const currentAndFuture = rows.filter((r) => r.rangeEnd >= todayIso);

  const maxTss = Math.max(1, ...currentAndFuture.map((r) => r.tssSum));
  return currentAndFuture.map((r) => ({ ...r, loadPct: Math.round((r.tssSum / maxTss) * 100) }));
}
