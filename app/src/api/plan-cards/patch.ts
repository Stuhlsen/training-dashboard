/* ============================================================
   API/PLAN-CARDS/PATCH.TS — reine Regeln der Karten-Anpassungen

   Herausgelöst aus state/plan-cards.js (Vanilla): dort steckten diese
   Regeln mitten im async-Schreibpfad und ließen sich nur über gemocktes
   Adapter-Geschirr prüfen. Sie hängen aber an nichts Asynchronem — was ein
   Move/Undo/Cancel in die DB schreibt, ist eine Funktion des aktuellen
   Kartenstands. Als reine Funktionen sind sie mockfrei testbar, und der
   Hook darüber (useMovePlanCard etc.) trägt nur noch Optimistik, Rollback
   und Cache-Pflege.

   Die Regeln selbst sind unverändert übernommen — jede einzelne stammt aus
   einem konkreten Verhalten, das die alten Tests festschreiben.
   ============================================================ */

import { weekLabelForDate } from "../../core/plan-drag.js";
import type { PlanCard, PlanCardPatch, WeekModelEntry } from "../types";

interface WeekLabel {
  week: string;
  phase: string | null;
}

/** Der Patch, den ein Verschieben schreibt.
 *
 *  Drei Regeln stecken darin:
 *  1. `movedFromDate` merkt sich den ALLERERSTEN Ursprung — verschiebt man
 *     dieselbe Karte ein zweites Mal, bleibt das "Verschoben von …"-Badge
 *     auf dem ursprünglichen Datum stehen.
 *  2. Die Karte übernimmt week/phase der Zielwoche, sonst hinge sie nach
 *     einem Drop über die Wochengrenze unter der alten Wochenüberschrift.
 *     Quelle ist eine Nachbarkarte, ersatzweise das Plan-Wochen-Modell
 *     (`athleteId`, Fahrplan 6 RUH5). Nur wenn beides nichts liefert
 *     (Datum außerhalb aller Planwochen), bleibt das alte Label stehen —
 *     dann kein week/phase im Patch.
 *  3. status/cancelReason werden mit zurückgesetzt: eine Karte kann in der
 *     DB theoretisch gleichzeitig "ausgefallen" UND "verschoben" markiert
 *     sein (getrennte Spalten, kein Constraint), das alte Modell kannte pro
 *     Datum aber nur EINEN aktiven Zustand. Verschieben einer ausgefallenen
 *     Karte reaktiviert sie also implizit als geplant. */
export function buildMovePatch(
  cards: PlanCard[],
  card: PlanCard,
  newDate: string,
  reason?: string,
  athleteId?: string,
  /** Plan-Verschiebung des Athleten (`profiles.plan_offset_weeks`, 0026) —
   *  sonst berechnet weekLabelForDate das Phasen-Label aus dem unverschobenen
   *  Plan-Wochen-Modell. Default 0. */
  offsetWeeks = 0,
  /** Fahrplan 8 E7: Wochenstruktur eines aktiven `training_plans`-Eintrags —
   *  an weekLabelForDate() durchgereicht. `null` ⇒ Code-Vorlage wie bisher. */
  weekModel: WeekModelEntry[] | null = null,
): PlanCardPatch {
  const movedFromDate = card.originalDate ?? card.date;
  const label = weekLabelForDate(
    cards,
    newDate,
    card.id,
    athleteId,
    offsetWeeks,
    weekModel,
  ) as WeekLabel | null;
  return {
    plannedDate: newDate,
    movedFromDate,
    moveReason: reason || "",
    status: "geplant",
    cancelReason: null,
    ...(label ? { week: label.week, phase: label.phase } : {}),
  };
}

/** Wie die Karte nach einem optimistisch angewandten Move lokal aussieht —
 *  dieselben Regeln wie buildMovePatch(), nur in der Domänen-Shape statt in
 *  der Patch-Shape. Bewusst hier neben dem Patch und nicht im Hook: die
 *  beiden dürfen nicht auseinanderlaufen, sonst zeigt die UI kurzzeitig
 *  etwas anderes an, als tatsächlich geschrieben wird. */
export function applyMoveOptimistic(
  cards: PlanCard[],
  card: PlanCard,
  newDate: string,
  reason?: string,
  athleteId?: string,
  offsetWeeks = 0,
  weekModel: WeekModelEntry[] | null = null,
): PlanCard {
  const movedFromDate = card.originalDate ?? card.date;
  const label = weekLabelForDate(
    cards,
    newDate,
    card.id,
    athleteId,
    offsetWeeks,
    weekModel,
  ) as WeekLabel | null;
  return {
    ...card,
    date: newDate,
    originalDate: movedFromDate,
    movedReason: reason || undefined,
    cancelled: undefined,
    cancelReason: undefined,
    ...(label ? { week: label.week, phase: label.phase } : {}),
  };
}

/** Der Patch, den ein Ausfallen schreibt. `movedFromDate`/`moveReason`
 *  werden mit gelöscht — sonst bliebe eine bereits verschobene Karte nach
 *  dem Ausfallen mit stehengebliebenen Verschiebe-Daten zurück, und
 *  "Rückgängig" bräuchte zwei Klicks statt einen. */
export function buildCancelPatch(reason?: string): PlanCardPatch {
  return {
    status: "ausgefallen",
    cancelReason: reason || "",
    movedFromDate: null,
    moveReason: null,
  };
}

/** Was "Rückgängig" (↩) für eine Karte bedeutet. Der Knopf deckt zwei Fälle
 *  ab, die das alte Adjustments-Modell unterschiedslos behandelte (pro Datum
 *  gab es genau EINE Anpassung — Verschiebung ODER Ausfall):
 *
 *  - ausgefallene Karte  → zurück auf "geplant"
 *  - verschobene Karte   → zurück auf moved_from_date, inkl. neu geliehenem
 *    week/phase-Label der (wieder-)aktuellen Woche. Ohne das hinge die Karte
 *    nach "Rückgängig" weiter unter der zuletzt gezogenen Zielwoche.
 *  - weder noch          → `null`, es gibt nichts rückgängig zu machen */
export function buildUndoPatch(
  cards: PlanCard[],
  card: PlanCard,
  athleteId?: string,
  offsetWeeks = 0,
  weekModel: WeekModelEntry[] | null = null,
): PlanCardPatch | null {
  if (card.cancelled) {
    return { status: "geplant", cancelReason: null };
  }
  if (!card.originalDate) return null;
  const label = weekLabelForDate(
    cards,
    card.originalDate,
    card.id,
    athleteId,
    offsetWeeks,
    weekModel,
  ) as WeekLabel | null;
  return {
    plannedDate: card.originalDate,
    movedFromDate: null,
    moveReason: null,
    ...(label ? { week: label.week, phase: label.phase } : {}),
  };
}

/** sort_order einer NEUEN Karte: max()+1 unter den bereits geladenen Karten
 *  desselben Datums (0 wenn keine), damit zwei Karten am selben Tag stabil
 *  sortiert bleiben. */
export function nextSortOrder(cards: PlanCard[], date: string): number {
  const sameDate = cards.filter((c) => c.date === date).map((c) => c.sortOrder ?? 0);
  return sameDate.length ? Math.max(...sameDate) + 1 : 0;
}

/** Patches für „Karte innerhalb ihres Tages eine Position nach oben/unten".
 *  Nummeriert ALLE Karten desselben Datums in ihrer aktuellen Reihenfolge
 *  (sort_order, dann Eingabereihenfolge) sauber neu auf 0…n-1 und tauscht
 *  die Zielkarte mit ihrem Nachbarn in `direction`. Zurück kommen nur die
 *  Karten, deren sort_order sich dabei wirklich ändert — steht die Karte
 *  schon am Rand, ist das Ergebnis leer (erfolgreicher No-Op).
 *
 *  Ausgefallene Karten zählen bewusst mit: sie tragen ebenfalls eine
 *  sort_order, und eine Lücke in der Nummerierung würde `nextSortOrder`
 *  bzw. eine spätere Neuvergabe verschieben. Welche Karte im Raster als
 *  „primär" gilt, entscheidet ohnehin der Kartenstatus, nicht diese Zahl. */
export function buildReorderPatches(
  cards: PlanCard[],
  cardId: string,
  direction: "up" | "down",
): Array<{ id: string; sortOrder: number }> {
  const target = cards.find((c) => c.id === cardId);
  if (!target) return [];

  const sameDay = cards
    .filter((c) => c.date === target.date)
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));

  const i = sameDay.findIndex((c) => c.id === cardId);
  const j = direction === "up" ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= sameDay.length) return [];

  const reordered = [...sameDay];
  [reordered[i], reordered[j]] = [reordered[j], reordered[i]];

  const patches: Array<{ id: string; sortOrder: number }> = [];
  reordered.forEach((c, idx) => {
    if ((c.sortOrder ?? 0) !== idx) patches.push({ id: c.id, sortOrder: idx });
  });
  return patches;
}

/** Sortierung des lokalen Cache — dieselbe Ordnung, die listPlanCards()
 *  serverseitig liefert (Datum, dann sort_order). Nach jeder optimistischen
 *  Änderung nötig, sonst springt eine verschobene Karte erst beim nächsten
 *  Laden an ihren Platz. */
export function sortCards(cards: PlanCard[]): PlanCard[] {
  return [...cards].sort(
    (a, b) => a.date.localeCompare(b.date) || (a.sortOrder ?? 0) - (b.sortOrder ?? 0),
  );
}
