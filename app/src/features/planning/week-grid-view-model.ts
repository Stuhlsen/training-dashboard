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
import { activitySport, sportBadge } from "../../core/activity-sport.js";
import { isDeliberateRestDay, planWeekFor } from "../../core/plan-week-model.js";
import {
  computePlanningDerivedSets,
  isMissedCard,
  isNonTrainingCard,
  type PlanningDerivedSets,
} from "./planning-view-model";
import type { PlanCard, WeekModelEntry } from "../../api/types";

type Ride = import("../../types.js").Ride;

export type DayStatus = "done" | "today" | "open" | "missed" | "cancelled" | "empty" | "rest";

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
  rest: "😴",
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
  rest: "Ruhetag",
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
  // Bewusst gedämpft wie `empty` — ein (abgeleiteter) Ruhetag ist keine
  // hervorzuhebende Leistung, nur eine Info.
  rest: "var(--ink-3)",
};

/** Eine Karte eines Tages mit eigenem Status und eigener Sportart. Im
 *  gemeinsamen Kalender (Fahrplan 44 E1) zählt jede Karte gegen die
 *  Aktivitäten IHRER Sportart — der Tagesstatus (`GridDayCell.status`) ist
 *  nur der der Hauptkarte. */
export interface GridCardEntry {
  card: PlanCard;
  sport: string;
  status: DayStatus;
}

/** Zusatzdaten für den Modus "Alle" (Fahrplan 44 E1). Nur wenn gesetzt, wird
 *  über Sportarten hinweg gerechnet; ohne bleibt `buildWeekGrid` bit-identisch
 *  zum Einzelsport-Verhalten. */
export interface SharedCalendarOptions {
  /** Aktivitäten ALLER Sportarten (`ridesAll`) — ersetzt dann den Parameter
   *  `rides`, der sportgefiltert ist. */
  rides: Ride[];
  /** Wochenmodell je Sportart; `null`/fehlend ⇒ die Sportart hat keinen
   *  eigenen Plan. Rad stimmt beim Ruhetag immer mit ab (wie bisher), Lauf/
   *  Schwimmen nur mit eigenem Modell. */
  weekModels: Partial<Record<string, WeekModelEntry[] | null>>;
}

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
  /** Alle Karten des Tages mit eigenem Status/Sportart (Reihenfolge wie
   *  `cards`). Leer bei Tagen ohne Karte. */
  entries: GridCardEntry[];
  /** Sportarten mit mindestens einer AKTIVEN (nicht ausgefallenen) Karte. */
  sportsOnDay: string[];
  /** Doppelbelegung nach V3: mindestens zwei aktive Karten DERSELBEN
   *  Sportart. Verschiedene Sportarten am Tag zählen nicht. */
  sameSportOverlap: boolean;
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
  /** Phase je Sportart (nur im gemeinsamen Kalender), sonst `null`. */
  phaseBySport: Record<string, string> | null;
  /** Gemeinsamer Kalender: `tssSum` ist eine Summe über Sportarten (Näherung). */
  multiSport: boolean;
  days: GridDayCell[];
}

function statusForDate(
  date: string,
  primary: PlanCard | null,
  todayIso: string,
  doneDates: Set<string>,
  athleteId?: string,
  offsetWeeks = 0,
  weekModel: WeekModelEntry[] | null = null,
): DayStatus {
  // Fahrplan 6 (RUH4): ein Tag ohne (aktive) Karte, der laut Plan-Wochen-Modell
  // ein bewusster Ruhetag ist, wird als solcher gerendert statt als Planungs-
  // lücke ("empty"). `isDeliberateRestDay` ist dieselbe Quelle wie in
  // conflicts.js (RUH3). Ohne `athleteId` (z. B. in Alt-Tests) bleibt das
  // Verhalten unverändert — die Ableitung ist opt-in.
  if (!primary)
    return athleteId && isDeliberateRestDay(athleteId, date, false, offsetWeeks, weekModel)
      ? "rest"
      : "empty";
  if (primary.cancelled) return "cancelled";
  // Ruhetag / reine Notiz-Karte: nie "verpasst" (isNonTrainingCard-Konvention
  // aus buildPlanningSections) — ein nicht gefahrener Ruhetag bzw. eine
  // erledigte Erinnerung ist Erfüllung, sobald der Tag vorbei ist.
  if (isNonTrainingCard(primary)) return date <= todayIso ? "done" : "open";
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
  /** Fahrplan 6 (RUH4): schaltet die Ruhe-Slot-Ableitung + die Phasen-Quelle
   *  aus dem Plan-Wochen-Modell frei. Ohne `athleteId` bit-identisch zu vorher
   *  (Phase kommt dann nur aus den Nachbarkarten, kein "rest"-Status). */
  athleteId?: string,
  derived: PlanningDerivedSets = computePlanningDerivedSets(cards, rides),
  /** Plan-Verschiebung des Athleten (`profiles.plan_offset_weeks`, Migration
   *  0026) — verschiebt die Ruhe-Slot-Ableitung + die Modell-Phasenquelle um
   *  N ganze Wochen mit. Default 0 ⇒ unverändert. */
  offsetWeeks = 0,
  /** Fahrplan 8 E7: die Wochenstruktur eines aktiven `training_plans`-
   *  Eintrags. Wenn gesetzt, sind Ruhe-Slots + Modell-Phase daraus statt aus
   *  der Code-Vorlage. `null` ⇒ Code-Vorlage wie bisher. */
  weekModel: WeekModelEntry[] | null = null,
  /** Fahrplan 44 E1: Modus "Alle" — s. SharedCalendarOptions. */
  shared?: SharedCalendarOptions,
): GridWeekRow[] {
  const { doneDates, recoveryWeeks } = derived;
  const allRides = shared ? shared.rides : rides;
  // Erledigt-Tage je Sportart: eine Karte passt nur zu einer Aktivität ihrer
  // eigenen Sportart. Einzelsport: dieselbe Menge für alle (bit-identisch).
  const doneBySport = new Map<string, Set<string>>();
  if (shared) {
    for (const r of shared.rides) {
      const sport = activitySport(r);
      const set = doneBySport.get(sport) ?? new Set<string>();
      set.add(r.date ?? r.dateISO);
      doneBySport.set(sport, set);
    }
  }
  const doneFor = (card: PlanCard): Set<string> =>
    shared ? (doneBySport.get(activitySport(card)) ?? new Set<string>()) : doneDates;
  // Sportarten, die beim Ruhetag/der Phase mitstimmen (nur gemeinsamer Kalender).
  const voters = shared
    ? Object.entries({ ride: shared.weekModels.ride ?? null, ...shared.weekModels })
        .filter(([sport, model]) => sport === "ride" || (model && model.length))
        .map(([sport, model]) => ({ sport, model: (model ?? null) as WeekModelEntry[] | null }))
    : [];

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
      const entries: GridCardEntry[] = dateCards.map((c) => ({
        card: c,
        sport: activitySport(c),
        status: statusForDate(date, c, todayIso, doneFor(c), athleteId, offsetWeeks, weekModel),
      }));
      const activeSports = dateCards.filter((c) => !c.cancelled).map((c) => activitySport(c));
      const sportsOnDay = [...new Set(activeSports)];
      // Tagesstatus: Einzelsport wie bisher; gemeinsam die Hauptkarte, ein
      // Tag ohne Karte ist nur Ruhetag, wenn ALLE abstimmenden Sportarten
      // dort Ruhe haben.
      const status: DayStatus = !shared
        ? statusForDate(date, primary, todayIso, doneDates, athleteId, offsetWeeks, weekModel)
        : primary
          ? statusForDate(date, primary, todayIso, doneFor(primary), athleteId, offsetWeeks, weekModel)
          : athleteId &&
              voters.length > 0 &&
              voters.every((v) => isDeliberateRestDay(athleteId, date, false, offsetWeeks, v.model))
            ? "rest"
            : "empty";
      return {
        date,
        isToday: date === todayIso,
        status,
        card: primary,
        otherCards,
        entries,
        sportsOnDay,
        sameSportOverlap: sportsOnDay.length < activeSports.length,
      };
    });

    const weekCards = days.flatMap((d) => (d.card ? [d.card, ...d.otherCards] : d.otherCards));
    const activeCards = weekCards.filter((c) => !c.cancelled);
    // Fahrplan 6 (RUH4): Phase primär aus dem Plan-Wochen-Modell (card-
    // unabhängig) — löst den offene-punkte.md-Punkt "Karte behält altes
    // week/phase-Label in leerer Zielwoche" für die Rasteranzeige. Karten-Phase
    // bleibt Fallback für Athleten/Zeiträume ohne Modelleintrag.
    let phaseBySport: Record<string, string> | null = null;
    let modelPhase: string | null;
    if (shared) {
      // Phase je Sportart; unterscheiden sie sich, nennt die Kopfzeile jede
      // statt eine falsche für alle (V3, Punkt "Phase nicht je Spalte").
      const perSport: Record<string, string> = {};
      if (athleteId) {
        for (const v of voters) {
          const p = planWeekFor(athleteId, anchorDate, offsetWeeks, v.model).phase;
          if (p) perSport[v.sport] = p;
        }
      }
      phaseBySport = Object.keys(perSport).length ? perSport : null;
      const distinct = new Set(Object.values(perSport));
      modelPhase =
        distinct.size === 1
          ? [...distinct][0]
          : distinct.size > 1
            ? Object.entries(perSport)
                .map(([s, p]) => `${sportBadge(s).label}: ${p}`)
                .join(" · ")
            : null;
    } else {
      modelPhase = athleteId ? planWeekFor(athleteId, anchorDate, offsetWeeks, weekModel).phase : null;
    }
    const phase = modelPhase ?? activeCards.find((c) => c.phase)?.phase ?? null;
    const plannedTssSum = activeCards.reduce((sum, c) => sum + (c.tssPlanned ?? 0), 0);
    // `tssPlanned` fehlt bei den meisten Karten (nur strukturierte Plan-2-
    // Workouts haben es) — eine Woche mit real fahrenen Einheiten zeigte
    // dadurch "0 TSS" direkt neben der Hero-Seite, die für dieselbe Woche
    // die echte, aus den Fahrten berechnete Summe zeigt (Critique-Fund).
    // Fallback auf tatsächlich gefahrene TSS, sobald mindestens eine Fahrt
    // in der Woche liegt — nur eine reine Zukunftswoche ohne Fahrten zeigt
    // weiterhin die geplante Summe (die einzig verfügbare Schätzung dort).
    const weekRides = allRides.filter((r) => r.dateISO >= days[0].date && r.dateISO <= days[6].date);
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
      phaseBySport,
      multiSport: !!shared,
      days,
    };
  });

  // Ganze Wochen vor der aktuellen raus — die laufende Woche (rangeEnd >=
  // todayIso) bleibt trotz teilweise vergangener Tage komplett erhalten.
  const currentAndFuture = rows.filter((r) => r.rangeEnd >= todayIso);

  const maxTss = Math.max(1, ...currentAndFuture.map((r) => r.tssSum));
  return currentAndFuture.map((r) => ({ ...r, loadPct: Math.round((r.tssSum / maxTss) * 100) }));
}
