/* ============================================================
   FEATURES/PLANNING/DONE-TABLE-VIEW-MODEL.TS — reine Ableitung für die
   "Absolviert"-Soll/Ist-Tabelle des Planungstabs (Etappe 13d, Redesign nach
   "Planungstab Live"-Mockup). Ersetzt die bisherige Karten-Liste
   (`sections.done.map(...)` + `PlanCard isDone`) durch eine kompakte Zeile
   je Karte mit aufklappbarem Detail (DoneCompareBlock + DoneDetailChart,
   Etappe 13e).

   Berechnet NICHTS neu, was schon existiert: Dauer-/Ø-Watt-Zellen kommen aus
   buildDoneCompareRows() (planning-view-model.ts) — dieselbe Fallback-Kette
   (card.durationMin → Legacy-Intervallsumme → km-Schätzung) bliebe sonst an
   zwei Stellen gepflegt. TSS/Compliance sind bereits rohe Felder
   (card.tssPlanned/ride.tss, visibleCompliance()) und werden nur
   durchgereicht. ============================================== */

import { buildDoneCompareRows, typeColor, typeIcon, visibleCompliance } from "./planning-view-model";
import type { PlanCard } from "../../api/types";

type Ride = import("../../types.js").Ride;
type RideCompliance = import("../../types.js").RideCompliance;

/** Vorab von der aufrufenden Seite gematchte Ist-Fahrt je Kartel-ID (wie
 *  PlanningPage.tsx's bestehende `matchRideForCard()`-Map) — `canEdit`
 *  fließt dort bereits ins Matching ein (Athlet-1-Filter auf
 *  `dataSource === "intervals"`), hier nicht noch einmal nötig. */
export type DoneRideMap = Map<string, Ride | null>;

export interface DoneTableRow {
  card: PlanCard;
  ride: Ride | null;
  date: string;
  typIcon: string;
  typColor: string;
  name: string;
  tssPlanned: number | null;
  tssActual: number | null;
  /** 0–100+ (ungecappt, Balkenbreite ist Komponentensache), Anteil Ist- an
   *  Soll-TSS für den Soll-Ist-Balken — `null` ohne Plan-TSS (kein
   *  Vergleichswert vorhanden). */
  tssRatioPct: number | null;
  durationPlan: string;
  durationActual: string;
  wattPlan: string;
  wattActual: string;
  wattColor?: string;
  compliance: RideCompliance | null;
  /** Nur mit gematchter Ist-Fahrt aufklappbar — DoneCompareBlock/
   *  DoneDetailChart brauchen `ride`. */
  expandable: boolean;
}

/** 1:1-Wiederverwendung der bestehenden "Dauer"/"Ø Watt"-Zeilenlogik aus
 *  buildDoneCompareRows() statt eigener Parallel-Berechnung. */
function buildTableRow(card: PlanCard, ride: Ride | null, canEdit: boolean): DoneTableRow {
  const compareRows = ride ? buildDoneCompareRows(card, ride, canEdit) : [];
  const durationRow = compareRows.find((r) => r.label === "Dauer");
  const wattRow = compareRows.find((r) => r.label === "Ø Watt");
  const tssPlanned = card.tssPlanned ?? null;
  const tssActual = ride?.tss ?? null;

  return {
    card,
    ride,
    date: card.date,
    typIcon: typeIcon(card.typ),
    typColor: typeColor(card.typ),
    name: card.name ?? "",
    tssPlanned,
    tssActual,
    tssRatioPct: tssPlanned ? Math.round(((tssActual ?? 0) / tssPlanned) * 100) : null,
    durationPlan: durationRow?.plan ?? "–",
    durationActual: durationRow?.actual ?? "–",
    wattPlan: wattRow?.plan ?? "–",
    wattActual: wattRow?.actual ?? "–",
    wattColor: wattRow?.color,
    compliance: ride ? visibleCompliance(ride, card.id) : null,
    expandable: !!ride,
  };
}

/** Dünne Tabellen-Projektion über `sections.done` (buildPlanningSections()) —
 *  eine Zeile je Karte, neueste zuerst (Reihenfolge von `done` wird
 *  übernommen, `done` ist dort bereits `b.date.localeCompare(a.date)`
 *  sortiert). */
export function buildDoneRows(done: PlanCard[], doneRides: DoneRideMap, canEdit: boolean): DoneTableRow[] {
  return done.map((card) => buildTableRow(card, doneRides.get(card.id) ?? null, canEdit));
}

export interface PlanFidelitySummary {
  windowDays: number;
  /** Karten mit sichtbarer Compliance-Ampel im Fenster (Nenner). */
  ratedCount: number;
  /** Davon mit Ampel "green" (Zähler). */
  fulfilledCount: number;
  /** 0–100, 0 wenn `ratedCount` 0 ist (keine bewertbaren Karten im Fenster,
   *  keine Aussage über schlechte Plantreue). */
  pct: number;
}

function isoDaysBefore(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

/** Plantreue-Quote NUR über Karten mit vorhandener Compliance-Ampel
 *  (Intervall-Workouts, `visibleCompliance()` liefert nicht-`null`) —
 *  Entscheidung aus dem Etappe-13-Plan: keine neue Grobregel für
 *  Nicht-Intervall-Fahrten erfinden. `windowDays` ist inklusiv an beiden
 *  Enden ([today - windowDays, today]). */
export function planFidelitySummary(
  done: PlanCard[],
  doneRides: DoneRideMap,
  todayIso: string,
  windowDays = 28,
): PlanFidelitySummary {
  const windowStart = isoDaysBefore(todayIso, windowDays);
  let ratedCount = 0;
  let fulfilledCount = 0;

  for (const card of done) {
    if (card.date < windowStart || card.date > todayIso) continue;
    const compliance = visibleCompliance(doneRides.get(card.id) ?? null, card.id);
    if (!compliance) continue;
    ratedCount++;
    if (compliance.rating === "green") fulfilledCount++;
  }

  return {
    windowDays,
    ratedCount,
    fulfilledCount,
    pct: ratedCount ? Math.round((fulfilledCount / ratedCount) * 100) : 0,
  };
}

export interface GapChip {
  id: string;
  date: string;
  typIcon: string;
  typColor: string;
  name: string;
  kind: "missed" | "cancelled";
  note: string;
}

const MISSED_NOTE = "Keine passende Fahrt erfasst.";
const CANCELLED_NOTE_FALLBACK = "Ausgefallen.";

/** Lücken-Chips aus den bereits vorhandenen `missed`/`cancelled`-Arrays
 *  (buildPlanningSections()) — kein neues "Notiz"-Datenfeld: Verpasst trägt
 *  immer denselben generischen Text, Ausgefallen nutzt das bestehende
 *  `card.cancelReason`, wenn vorhanden. Neueste zuerst über beide Arten
 *  hinweg. */
export function gapsChips(missed: PlanCard[], cancelled: PlanCard[]): GapChip[] {
  const missedChips: GapChip[] = missed.map((c) => ({
    id: c.id,
    date: c.date,
    typIcon: typeIcon(c.typ),
    typColor: typeColor(c.typ),
    name: c.name ?? "",
    kind: "missed",
    note: MISSED_NOTE,
  }));
  const cancelledChips: GapChip[] = cancelled.map((c) => ({
    id: c.id,
    date: c.date,
    typIcon: typeIcon(c.typ),
    typColor: typeColor(c.typ),
    name: c.name ?? "",
    kind: "cancelled",
    note: c.cancelReason ? `Grund: ${c.cancelReason}` : CANCELLED_NOTE_FALLBACK,
  }));
  return [...missedChips, ...cancelledChips].sort((a, b) => b.date.localeCompare(a.date));
}
