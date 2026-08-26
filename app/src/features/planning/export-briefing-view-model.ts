/* ============================================================
   FEATURES/PLANNING/EXPORT-BRIEFING-VIEW-MODEL.TS — Claude-Export:
   Domänenobjekte zusammenziehen (Etappe 7c)

   Port von state/export.js::buildClaudeExport() (Vanilla) — reine Funktion,
   nimmt bereits geladene Daten entgegen (Events/Cards/Rides/Wellbeing/
   Projektion kommen aus den bereits portierten Hooks bzw. als Props aus
   PlanningPage.tsx, wie TrainerBar es schon vormacht) und baut daraus die
   `ctx`-Struktur für core/export-briefing.js::buildExportText(). Kein I/O
   hier — das unterscheidet diese Datei von state/export.js, das selbst noch
   lud; in React laden die Hooks bereits vorher.
   ============================================================ */

import { addDaysISO, localISODate } from "../../core/format.js";
import { currentFtpEntry } from "../../core/ftp-history.js";
import { assessReadiness } from "../../core/readiness.js";
import { efficiencyTrend, decouplingTrend } from "../../core/efficiency.js";
import { eftpHistory, eftpHistoryFromWellness, mergeEftpHistories } from "../../core/ftp-forecast.js";
import {
  eftpProgressSummary,
  bestEffortComparison,
  RECENT_BLOCK_KEY,
  PREVIOUS_BLOCK_KEY,
} from "../../core/progress-indicators.js";
import { buildGuardrailSummary } from "../../core/guardrails.js";
import type { projectLoad } from "../../core/projection.js";
import type { Checkin, EventItem, PlanCard, Proposal } from "../../api/types";
import type { LadderStateFormat } from "../../api/hooks/useLadderState";

type Ride = import("../../types.js").Ride;
type WellnessDay = import("../../types.js").WellnessDay;
type Projection = ReturnType<typeof projectLoad>;
interface FtpHistoryEntry {
  ftpWatt: number;
  validFrom: string;
  source: string;
}
interface PowerCurveBlock {
  key: string;
  curve?: object | null;
}

// Fester Umfang, kein Zeitraum-Regler (Export/Import-Workflow-Konzept §2):
// Plan-Fenster ohne Enddatum-Cutoff, Ist-Daten/Wellbeing je 4 Wochen zurück.
export const ACTUALS_WEEKS = 4;
export const WELLBEING_WEEKS = 4;
// F1 (docs/konzept-progressionssteuerung.md): eFTP-/EF-/Decoupling-Trend
// brauchen einen längeren Rückblick als die 4-Wochen-Tabelle — eigenes
// Fenster, unabhängig von ACTUALS_WEEKS.
export const PROGRESS_WEEKS = 8;

const DECIDED_PROPOSAL_STATUSES = new Set(["accepted", "rejected", "withdrawn"]);
const RECENT_PROPOSALS_LIMIT = 10;

/** Zeitfenster fürs Befinden-Laden (useCheckinRange) — hält die Fensterbreite
 *  an einer Stelle mit den restlichen Export-Fenstern zusammen, statt sie in
 *  der Komponente zu duplizieren. */
export function wellbeingWindow(today: string): { from: string; to: string } {
  return { from: addDaysISO(today, -7 * WELLBEING_WEEKS), to: today };
}

export interface ExportBriefingInput {
  displayName: string | null;
  /** Bereits aufgelöste FTP (z. B. planning-view-model.ts::resolvePlanningFtp) —
   *  unterste Stufe der Priorität, s. Kommentar bei `ftp` in buildExportBriefingCtx. */
  ftp: number | null;
  ftpGoal: number | null;
  dataSources: string[];
  events: EventItem[];
  /** ALLE Karten, nicht auf den Planungshorizont gefiltert — Guardrails
   *  brauchen die volle Liste, das Briefing selbst filtert intern auf
   *  `date >= today`. */
  cards: PlanCard[];
  /** ALLE Fahrten (volle Historie, wie Vanillas Data.byDate()) — die
   *  Fenster (4/8 Wochen) filtert diese Funktion selbst. */
  rides: Ride[];
  /** ALLE Wellness-Tage (für die eFTP-Historie aus sportInfo). */
  wellness: WellnessDay[];
  /** Bereits gefenstert vom Aufrufer (useCheckinRange mit wellbeingWindow()). */
  wellbeing: Checkin[];
  powerCurveBlocks: PowerCurveBlock[];
  ftpHistoryEntries: FtpHistoryEntry[];
  /** core/projection.js::projectLoad()-Ergebnis — von PlanningPage.tsx
   *  bereits berechnet, wie bei TrainerBar als Prop durchgereicht. */
  projection: Projection | null;
  conflicts: Array<{ rule: string; severity: string; message: string }>;
  proposals: Proposal[];
  ladderState: LadderStateFormat[];
  /** D4b: vom Aufrufer separat (async, pro aktivem Format über
   *  useLadderPresetSuggestion()) ermittelt — diese Funktion bleibt rein und
   *  reicht die fertige Liste nur durch. Default leer (kein Freigabe/keine
   *  aktiven Formate). */
  presetSuggestions?: Array<{
    formatId: string;
    label: string;
    inTaper: boolean;
    step: number;
    action: string;
    lockedUntil?: string;
  }>;
  today?: string;
}

/** Baut die `ctx`-Struktur für core/export-briefing.js::buildExportText().
 *  @param athleteId interne Kennung ("athlete1"/"athlete2") — nur für
 *    Dateiname/JSON-Anhang, die Daten selbst kommen immer vom eingeloggten
 *    Athleten (Aufrufer stellt das über die Hook-Auswahl sicher). */
export function buildExportBriefingCtx(athleteId: string, input: ExportBriefingInput) {
  const today = input.today ?? localISODate();
  const planCards = input.cards.filter((c) => c.date >= today);

  const actualsFrom = addDaysISO(today, -7 * ACTUALS_WEEKS);
  const actuals = input.rides.filter((r) => r.dateISO >= actualsFrom);

  // 6A (docs/konzept-progressionssteuerung.md): nur echte Entscheidungen
  // zählen als Gedächtnis.
  const recentProposals = input.proposals
    .filter((p) => DECIDED_PROPOSAL_STATUSES.has(p.status))
    .sort((a, b) => (b.decidedAt ?? b.createdAt ?? "").localeCompare(a.decidedAt ?? a.createdAt ?? ""))
    .slice(0, RECENT_PROPOSALS_LIMIT)
    .map((p) => ({
      date: (p.decidedAt ?? p.createdAt ?? "").slice(0, 10) || null,
      op: p.op,
      status: p.status,
      reason: p.reason,
    }));

  // Aktuelle FTP bevorzugt aus ftp_history (nur "ramp-test"-Quellen zählen —
  // hält den FTP-Dreiklang gemessen/geschätzt/Ziel auseinander), sonst die
  // bereits aufgelöste `input.ftp` (Config-Fallback, s. planning-view-model.ts).
  const currentEntry = currentFtpEntry(
    input.ftpHistoryEntries.filter((e) => e.source === "ramp-test"),
    today,
  ) as FtpHistoryEntry | null;
  const ftp = currentEntry?.ftpWatt ?? input.ftp ?? null;

  // F1: eFTP-/EF-/Decoupling-Trend über PROGRESS_WEEKS + Bestwerte-Vergleich
  // aus den zwei rollierenden Power-Curve-Blöcken.
  const progressFrom = addDaysISO(today, -7 * PROGRESS_WEEKS);
  const rides8w = input.rides.filter((r) => r.dateISO >= progressFrom);
  const wellness8w = input.wellness.filter((w) => (w.dateISO || w.date) >= progressFrom);
  const eftpHistory8w = mergeEftpHistories(eftpHistory(rides8w), eftpHistoryFromWellness(wellness8w));
  const lastRampTest = currentEntry ? { date: currentEntry.validFrom, ftpWatt: currentEntry.ftpWatt } : null;
  const recentBlock = input.powerCurveBlocks.find((b) => b.key === RECENT_BLOCK_KEY) ?? null;
  const previousBlock = input.powerCurveBlocks.find((b) => b.key === PREVIOUS_BLOCK_KEY) ?? null;
  const progress = {
    eftp: eftpProgressSummary(eftpHistory8w, lastRampTest),
    ef: efficiencyTrend(rides8w),
    decoupling: decouplingTrend(rides8w),
    bestEfforts: bestEffortComparison(recentBlock, previousBlock),
  };

  // P1: Leitplanken — bekommen bewusst die VOLLE Ist-Historie (nicht die
  // 4-Wochen-`actuals` oben), s. core/guardrails.js.
  const guardrails = buildGuardrailSummary({
    actuals: input.rides,
    cards: input.cards,
    projection: input.projection,
    today,
  });

  // Objektive Erholungs-Ampel (HRV/Ruhepuls/Schlaf) — dasselbe Muster wie
  // hero-view-model.ts::buildBriefingInfo (volle Wellness-Historie, die
  // Funktion filtert/sortiert selbst). Bisher fehlte dieser Kanal im
  // Claude-Trainer-Briefing komplett, nur der subjektive Morgen-Check-in
  // (`wellbeing` oben) tauchte auf.
  const readiness = assessReadiness(input.wellness, today);

  return {
    athleteId,
    displayName: input.displayName ?? "Athlet",
    ftp,
    ftpGoal: input.ftpGoal,
    dataSources: input.dataSources,
    events: input.events,
    planCards,
    actuals,
    wellbeing: input.wellbeing,
    readiness,
    projection: input.projection,
    conflicts: input.conflicts,
    recentProposals,
    ladderState: input.ladderState,
    presetSuggestions: input.presetSuggestions ?? [],
    progress,
    guardrails,
    today,
  };
}
