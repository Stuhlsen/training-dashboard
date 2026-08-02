/* ============================================================
   STATE/EXPORT.JS — Claude-Export: Domänenobjekte zusammenziehen
   (Phase 4 — Export/Import-Workflow-Konzept §2)

   Zieht Profil (state/config.js/state/session.js), Events, Plan-Fenster,
   Ist-Fahrten, Wellbeing-Verlauf und Projektion/Konflikte aus den
   jeweiligen state/-Modulen zusammen und reicht sie an
   core/export-briefing.js weiter — der Dialog (ui/export-panel.js) kennt
   core/export-briefing.js nicht direkt (Konzept §2: "Datensammlung sitzt
   in state/, der Dialog in ui/ ruft nur state/ auf").
   ============================================================ */

import { buildExportText, exportFileName } from "../core/export-briefing.js";
import { localISODate, addDaysISO } from "../core/format.js";
import { currentFtpEntry } from "../core/ftp-history.js";
import { efficiencyTrend, decouplingTrend } from "../core/efficiency.js";
import { eftpHistory, eftpHistoryFromWellness, mergeEftpHistories } from "../core/ftp-forecast.js";
import {
  eftpProgressSummary,
  bestEffortComparison,
  RECENT_BLOCK_KEY,
  PREVIOUS_BLOCK_KEY,
} from "../core/progress-indicators.js";
import { buildGuardrailSummary } from "../core/guardrails.js";
import { CONFIG } from "./config.js";
import { Data } from "./data.js";
import { getState as getEventsState } from "./events.js";
import { getState as getPlanCardsState } from "./plan-cards.js";
import { loadRangeForAthlete } from "./wellbeing.js";
import { getFtpHistory } from "./ftp-history.js";
import { getSession } from "./session.js";
import { loadProposals, getState as getProposalsState } from "./proposals.js";
import { getLadderState, getPresetSuggestion } from "./ladder.js";
import { lastComplianceForFormat } from "../core/ladder.js";

// Fester Umfang, kein Zeitraum-Regler (Konzept §2, Entscheidung): Plan-
// Fenster ohne Enddatum-Cutoff, Ist-Daten/Wellbeing je 4 Wochen zurück.
const ACTUALS_WEEKS = 4;
const WELLBEING_WEEKS = 4;
// F1 (docs/konzept-progressionssteuerung.md): eFTP-/EF-/Decoupling-Trend
// brauchen einen längeren Rückblick als die 4-Wochen-Tabelle oben — eigenes
// Fenster, unabhängig von ACTUALS_WEEKS (die Ist-Fahrten-Tabelle im Briefing
// soll nicht auf 8 Wochen anwachsen, nur weil der Fortschrittsblock mehr
// Historie braucht).
const PROGRESS_WEEKS = 8;

// 6A (docs/konzept-progressionssteuerung.md): nur echte Entscheidungen
// zählen als Gedächtnis — "open" (noch nicht entschieden) und "stale"
// (durch eine andere Kartenänderung überholt, nie selbst entschieden)
// sind keine Aussage über eine frühere Entscheidung.
const DECIDED_PROPOSAL_STATUSES = new Set(["accepted", "rejected", "withdrawn"]);
const RECENT_PROPOSALS_LIMIT = 10;

/** Baut den fertigen Export-Text (Prompt-Vorlage mit eingesetztem Briefing,
 *  eine Zeichenkette — Konzept §2) für den eingeloggten Athleten. Nur für
 *  den EIGENEN Plan sinnvoll; das Gate (nur der Athlet selbst, unabhängig
 *  vom betrachteten Athleten-Toggle) liegt bei ui/export-panel.js, analog
 *  zu ui/planned.js::_canEdit().
 *  @param {string} athleteId interne Kennung ("athlete1"/"athlete2") — nur
 *    für Dateiname/Config-Lookup, die Daten selbst kommen immer vom
 *    eingeloggten Athleten (Session), nie von einem betrachteten Fremdplan.
 *  @param {{preset?:string, eventId?:string|null, extraContext?:string}} [opts]
 *    Export-Richtungsvorgabe (R1/R4): `preset` steuert den Auftragsblock,
 *    `eventId` (Supabase-`events.id`) wird gegen die bereits geladenen
 *    Events aufgelöst (Titel/Datum fürs Auftrag), `extraContext` (R2) ist
 *    reiner Laufzeit-Text — wird hier weitergereicht, nie persistiert.
 *  @returns {Promise<{ok:true, text:string, fileName:string}|{ok:false, error:{code:string,message:string}}>} */
export async function buildClaudeExport(athleteId, { preset = "general", eventId = null, extraContext = "" } = {}) {
  const user = getSession();
  if (!user) return { ok: false, error: { code: "UNKNOWN", message: "Nicht eingeloggt" } };

  const today = localISODate();
  const athleteCfg = CONFIG.athleteConfig(athleteId);
  const planState = getPlanCardsState();
  const planCards = (planState.cards || []).filter((c) => c.date >= today);

  const actualsFrom = addDaysISO(today, -7 * ACTUALS_WEEKS);
  const actuals = Data.byDate().filter((r) => r.dateISO >= actualsFrom);

  const wellbeingFrom = addDaysISO(today, -7 * WELLBEING_WEEKS);
  const wellbeingResult = await loadRangeForAthlete(user.id, wellbeingFrom, today);
  const wellbeing = wellbeingResult.ok ? wellbeingResult.checkins : [];

  const events = getEventsState().events;
  const selectedEvent = eventId ? events.find((e) => e.id === eventId) ?? null : null;

  // Aktuelle FTP bevorzugt aus ftp_history (Migration 0009, laufend vom
  // Athleten gepflegt über ui/settings-panel.js), Fallback auf die
  // statische Athleten-Config für den (aktuell durchgängigen) Fall einer
  // leeren Historie. Nur "ramp-test"-Quellen zählen — hält den FTP-
  // Dreiklang (gemessen/geschätzt/Ziel, nie vermischen) auch ein, falls
  // später ein "schaetzung"-Eintrag hinzukommt (DB erlaubt es, das
  // Formular bietet es aktuell bewusst nicht an).
  const ftpHistoryResult = await getFtpHistory();
  const currentEntry = ftpHistoryResult.ok
    ? currentFtpEntry(ftpHistoryResult.entries.filter((e) => e.source === "ramp-test"))
    : null;

  // 6A (docs/konzept-progressionssteuerung.md): letzte ENTSCHIEDENE
  // Vorschläge fürs Entscheidungsgedächtnis — nur echte Entscheidungen
  // (s. DECIDED_PROPOSAL_STATUSES), neueste zuerst, auf RECENT_PROPOSALS_LIMIT
  // gekappt (buildMemorySection kappt zwar selbst auch noch einmal, aber
  // erst NACH dem Sortieren braucht es überhaupt nur die neuesten hier).
  await loadProposals(athleteId);
  const recentProposals = getProposalsState()
    .proposals.filter((p) => DECIDED_PROPOSAL_STATUSES.has(p.status))
    .sort((a, b) => (b.decidedAt ?? b.createdAt ?? "").localeCompare(a.decidedAt ?? a.createdAt ?? ""))
    .slice(0, RECENT_PROPOSALS_LIMIT)
    .map((p) => ({
      date: (p.decidedAt ?? p.createdAt ?? "").slice(0, 10) || null,
      op: p.op,
      status: p.status,
      reason: p.reason,
    }));

  // D3/E1 (docs/konzept-progressionssteuerung.md): Leiterstand ins
  // Entscheidungsgedächtnis — degradiert bei Fehler geräuschlos auf leer,
  // ein Ladder-Ladefehler soll den restlichen Export nicht blockieren.
  const ladderStateResult = await getLadderState();
  const ladderState = ladderStateResult.ok ? ladderStateResult.formats : [];

  // D4b Schritt 3 (Auftrag "Ride↔Format-Brücke, Verdrahtung, echte Sperre"):
  // je aktivem Format den Stufenvorschlag holen — reine Information fürs
  // Briefing, kein Schreibpfad (C3.1 bleibt in Kraft). Bleibt ohne Freigabe
  // (profiles.ladder_progression_enabled, aktuell BEIDE Athleten) und ohne
  // aktive Formate leer, kein Effekt auf den restlichen Export.
  // `inTaper` wird hier bewusst NICHT hergeleitet (kein bestehendes State-
  // Signal dafür verfügbar) — das "event"-Preset friert die Leiter in
  // diesem Fenster nie automatisch beim Taper-Beginn ein, nur
  // `isTestEvent` greift (Vereinfachung, s. Auftragsbericht).
  const presetSuggestions = [];
  for (const f of ladderState) {
    const last = lastComplianceForFormat(Data.byDate(), f.formatId);
    const suggestionResult = await getPresetSuggestion(preset, f.formatId, {
      rating: last?.rating ?? null,
      rpe: last?.rpe ?? null,
      isTestEvent: selectedEvent?.isTest ?? false,
    });
    if (suggestionResult.ok && suggestionResult.enabled && suggestionResult.suggestion) {
      presetSuggestions.push({ formatId: f.formatId, label: f.label, ...suggestionResult.suggestion });
    }
  }

  // F1 (docs/konzept-progressionssteuerung.md): eFTP-/EF-/Decoupling-Trend
  // über PROGRESS_WEEKS (länger als die ACTUALS_WEEKS-Tabelle oben, s.
  // Kommentar dort) + Bestwerte-Vergleich aus den zwei rollierenden
  // Power-Curve-Blöcken (scripts/lib/plan2.js::getRecentComparisonBlocks —
  // fehlen sie, z.B. vor dem ersten Sync-Lauf mit den neuen Blöcken,
  // liefert bestEffortComparison eine leere Liste, kein Fehler).
  const progressFrom = addDaysISO(today, -7 * PROGRESS_WEEKS);
  const rides8w = Data.byDate().filter((r) => r.dateISO >= progressFrom);
  const wellness8w = (Data.wellness || []).filter((w) => (w.dateISO || w.date) >= progressFrom);
  const eftpHistory8w = mergeEftpHistories(eftpHistory(rides8w), eftpHistoryFromWellness(wellness8w));
  const lastRampTest = currentEntry ? { date: currentEntry.validFrom, ftpWatt: currentEntry.ftpWatt } : null;
  const recentBlock = (Data.powerCurveBlocks || []).find((b) => b.key === RECENT_BLOCK_KEY) ?? null;
  const previousBlock = (Data.powerCurveBlocks || []).find((b) => b.key === PREVIOUS_BLOCK_KEY) ?? null;
  const progress = {
    eftp: eftpProgressSummary(eftpHistory8w, lastRampTest),
    ef: efficiencyTrend(rides8w),
    decoupling: decouplingTrend(rides8w),
    bestEfforts: bestEffortComparison(recentBlock, previousBlock),
  };

  // P1 (docs/konzept-progressionssteuerung.md): Leitplanken — bekommt bewusst
  // die VOLLE Ist-Historie (Data.byDate(), nicht die 4-Wochen-`actuals` von
  // oben), weil rampHistoricalHitRate über die gesamte Historie zählt, wie
  // core/guardrails.js im Detail beschreibt; die anderen Felder fenstern
  // sich intern selbst (letzte 4 Wochen bzw. Planungshorizont).
  const guardrails = buildGuardrailSummary({
    actuals: Data.byDate(),
    cards: planState.cards,
    projection: planState.projection,
    today,
  });

  const text = buildExportText(
    {
      athleteId: user.id,
      displayName: user.displayName,
      ftp: currentEntry?.ftpWatt ?? athleteCfg?.ftpMeasured ?? Data.ftpValue(),
      ftpGoal: athleteCfg?.ftpGoal ?? null,
      dataSources: athleteCfg?.dataSources ?? [],
      events,
      planCards,
      actuals,
      wellbeing,
      projection: planState.projection,
      conflicts: planState.conflicts,
      recentProposals,
      ladderState,
      presetSuggestions,
      progress,
      guardrails,
      today,
    },
    {
      preset,
      event: selectedEvent
        ? { title: selectedEvent.title, eventDate: selectedEvent.eventDate, isTest: selectedEvent.isTest }
        : null,
      extraContext,
    },
  );

  return { ok: true, text, fileName: exportFileName(athleteId, today) };
}
