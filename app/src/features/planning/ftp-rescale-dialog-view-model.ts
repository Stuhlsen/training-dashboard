/* ============================================================
   FEATURES/PLANNING/FTP-RESCALE-DIALOG-VIEW-MODEL.TS — reine Logik hinter
   dem FTP-Umrechnungs-Dialog (Fahrplan 8 E12).

   `detectDoneFtpTest()` findet den jüngsten erledigten FTP-Testtag eines
   selbst gebauten Plans (Banner-Auslöser). `rescalePreviewRows()` baut die
   Beispiel-Zeilen für den Dialog-Body — beide rechnen über die reine
   `core/plan-ftp-rescale.js`.
   ============================================================ */

import { diffDays } from "../../core/format.js";
import { planFtpRescale } from "../../core/plan-ftp-rescale.js";
import { doneDatesOf } from "./planning-view-model";

type Ride = import("../../types.js").Ride;

/** Nur die Felder, die diese View-Model-Funktionen anfassen — so können die
 *  Tests schlichte Objekte reichen (Muster wie `ShiftCard`). */
interface RescaleCard {
  id: string;
  date: string;
  name?: string | null;
  typ?: string | null;
  cancelled?: boolean;
  workout?: unknown;
}

/** Erledigter Testtag zählt nur so lange als frisch — danach kein Banner mehr. */
export const FTP_TEST_WINDOW_DAYS = 21;

export interface DoneFtpTest {
  testCardId: string;
  testDateISO: string;
}

/**
 * Jüngster FTP-Testtag, der (a) zu einem selbst gebauten Plan gehört
 * (`hasActivePlan`), (b) höchstens `FTP_TEST_WINDOW_DAYS` zurückliegt und
 * (c) eine Ist-Fahrt am selben Tag hat. `null`, wenn es keinen gibt.
 * Kein FTP-Wert — der wird im Dialog manuell eingegeben.
 */
export function detectDoneFtpTest(args: {
  cards: RescaleCard[];
  rides: Ride[];
  hasActivePlan: boolean;
  todayISO: string;
}): DoneFtpTest | null {
  const { cards, rides, hasActivePlan, todayISO } = args;
  if (!hasActivePlan) return null;
  const done = doneDatesOf(rides);
  const latest = cards
    .filter(
      (c) =>
        c.typ === "FTP-Test" &&
        !c.cancelled &&
        c.date <= todayISO &&
        diffDays(todayISO, c.date) <= FTP_TEST_WINDOW_DAYS &&
        done.has(c.date),
    )
    .sort((a, b) => b.date.localeCompare(a.date))[0];
  return latest ? { testCardId: latest.id, testDateISO: latest.date } : null;
}

export interface RescalePreviewRow {
  name: string;
  /** vorhandenes Watt-Band, oder `null` wenn die Karte bisher keins trug */
  from: [number, number] | null;
  to: [number, number];
}

function wattBandOf(workout: unknown): [number, number] | null {
  const w = workout as { watts?: unknown } | null | undefined;
  const b = w?.watts;
  if (!Array.isArray(b) || b.length !== 2) return null;
  if (typeof b[0] !== "number" || typeof b[1] !== "number") return null;
  return [b[0], b[1]];
}

/**
 * Trockenlauf für den Dialog: wie viele künftige Karten neue Watt-Ziele
 * bekämen (`affectedCount`) und ein paar Beispiel-Zeilen (`rows`, gedeckelt
 * auf `limit`). Ungültiges/leeres `newFtp` → `{ affectedCount: 0, rows: [] }`.
 */
export function rescalePreviewRows(args: {
  cards: RescaleCard[];
  newFtp: number;
  todayISO: string;
  limit?: number;
}): { affectedCount: number; rows: RescalePreviewRow[] } {
  const { cards, newFtp, todayISO, limit = 5 } = args;
  const { patches, affectedCount } = planFtpRescale({ cards, newFtp, todayISO });
  const byId = new Map(cards.map((c) => [c.id, c]));
  const rows = patches.slice(0, limit).map((p) => {
    const card = byId.get(p.id);
    return {
      name: card?.name || card?.typ || "Einheit",
      from: wattBandOf(card?.workout),
      to: (p.workout as { watts: [number, number] }).watts,
    };
  });
  return { affectedCount, rows };
}
