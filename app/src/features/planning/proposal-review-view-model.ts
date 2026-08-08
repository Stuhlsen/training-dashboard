/* ============================================================
   FEATURES/PLANNING/PROPOSAL-REVIEW-VIEW-MODEL.TS — reine Ableitungen für
   Vorschlagsliste + Vergleichsansicht (kein DOM, kein Fetch — Muster wie
   trainer-bar-view-model.ts/planning-view-model.ts).

   Port der entsprechenden Berechnungen aus assets/js/ui/proposal-list.js
   (describeProposal/impactText) und assets/js/ui/proposal-compare.js
   (sidesFor/drawImpact). Gruppierung, Vorschau-Simulation und
   Kurzfassung selbst sind bereits als core/proposal-groups.js,
   core/proposal-preview.js, core/proposal-summary.js portiert (Etappe 2a) —
   hier nur, was ui/proposal-list.js/ui/proposal-compare.js zusätzlich an
   reiner Logik brauchten. Etappe 7b. */

import { payloadToCardData } from "../../core/proposal-payload.js";
import { previewProposal } from "../../core/proposal-preview.js";
import { summarizeProposalImpact, conflictKey } from "../../core/proposal-summary.js";
import { horizonRaceEvent, tsbOnDate } from "../../core/plan-feedback.js";
import { detectConflicts } from "../../core/conflicts.js";
import type { EventItem, PlanCard, Proposal } from "../../api/types";

type Ride = import("../../types.js").Ride;
type Conflict = ReturnType<typeof detectConflicts>[number];

const COMPARABLE_FIELDS = ["name", "typ", "date", "tssPlanned"] as const;

export interface CompareCardData {
  name?: string | null;
  typ?: string | null;
  date?: string | null;
  tssPlanned?: number | null;
  workout?: unknown;
  cancelled?: boolean;
}

export interface ProposalSides {
  left: CompareCardData | null;
  right: CompareCardData | null;
  changed: string[];
}

function findCard(cards: PlanCard[], id: string | null): PlanCard | null {
  return cards.find((c) => c.id === id) ?? null;
}

/** Kurzbeschreibung einer Zeile in der Vorschlagsliste — Port von
 *  ui/proposal-list.js::describeProposal(). */
export function describeProposal(proposal: Proposal, cards: PlanCard[]): string {
  if (proposal.op === "add") return `Neu anlegen: ${String(proposal.payload?.title ?? "–")}`;
  if (proposal.op === "move") {
    const card = findCard(cards, proposal.targetCardId);
    return `Verschieben: ${card?.name ?? "(Karte)"} → ${String(proposal.payload?.plan_date ?? "–")}`;
  }
  if (proposal.op === "cancel") {
    return `Ausfallen lassen: ${findCard(cards, proposal.targetCardId)?.name ?? "(Karte)"}`;
  }
  const card = findCard(cards, proposal.targetCardId);
  return `${card?.name ?? "(Karte)"} → ${String(proposal.payload?.title ?? "–")}`;
}

/** Linke/rechte Vergleichsseite + geänderte Felder — Port von
 *  ui/proposal-compare.js::sidesFor(). Bei "add" entfällt die linke Seite
 *  (keine Baseline zum Markieren geänderter Felder). */
export function sidesFor(proposal: Proposal, cards: PlanCard[]): ProposalSides {
  const current = proposal.targetCardId ? findCard(cards, proposal.targetCardId) : null;

  if (proposal.op === "add") {
    const right = payloadToCardData(proposal.payload ?? {}) as CompareCardData;
    return { left: null, right, changed: [] };
  }
  if (proposal.op === "replace") {
    // Spread current ZUERST, dann patched drüber — wie ui/proposal-compare.js
    // ({...current, ...payloadToCardData(payload)}). Wichtig für Felder, die
    // payloadToCardData gar nicht kennt (z.B. `cancelled`): die bleiben aus
    // `current` erhalten statt beim Bearbeiten einer bereits ausgefallenen
    // Karte stillschweigend zu verschwinden.
    const patched = payloadToCardData(proposal.payload ?? {}) as CompareCardData;
    const right: CompareCardData = { ...current, ...patched };
    const changed = COMPARABLE_FIELDS.filter(
      (f) => right[f] !== (current ? current[f] : undefined) && right[f] != null,
    );
    return { left: current, right, changed };
  }
  if (proposal.op === "move") {
    const right: CompareCardData = { ...current, date: proposal.payload?.plan_date as string | undefined };
    return { left: current, right, changed: ["date"] };
  }
  if (proposal.op === "cancel") {
    const right: CompareCardData = { ...current, cancelled: true };
    return { left: current, right, changed: ["cancelled"] };
  }
  return { left: current, right: null, changed: [] };
}

export interface ImpactContext {
  cards: PlanCard[];
  rides: Ride[];
  events: EventItem[];
  ftp?: number;
  today: string;
}

/** Schmale Adapter für core/projection.js/core/conflicts.js — dieselbe
 *  Anpassung wie toProjectionCard()/toProjectionEvent() in PlanningPage.tsx,
 *  hier bewusst erneut lokal (Konvention: kein geteilter Adapter, s.
 *  PlanCard.tsx-Kommentar zur selben Stelle). */
function toProjectionCard(c: PlanCard) {
  return {
    id: c.id,
    date: c.date,
    typ: c.typ,
    phase: c.phase,
    cancelled: c.cancelled,
    tssPlanned: c.tssPlanned,
    workout: c.workout as object | null,
  };
}

function toProjectionEvent(e: EventItem) {
  return { eventDate: e.eventDate, title: e.title, type: e.type, priority: e.priority ?? undefined };
}

function preview(proposal: Proposal, ctx: ImpactContext) {
  return previewProposal(proposal, {
    cards: ctx.cards.map(toProjectionCard),
    actuals: ctx.rides,
    events: ctx.events.map(toProjectionEvent),
    ftp: ctx.ftp,
    today: ctx.today,
  });
}

/** Prognose-Kurzfassung für eine Listenzeile — Port von
 *  ui/proposal-list.js::impactText(). `null` ohne sichtbaren Unterschied. */
export function impactSummary(proposal: Proposal, ctx: ImpactContext): string | null {
  return summarizeProposalImpact(preview(proposal, ctx), ctx.events.map(toProjectionEvent), ctx.today);
}

export interface ImpactDetail {
  tsb: { eventTitle: string; eventDate: string; before: number; after: number } | null;
  resolved: Conflict[];
  introduced: Conflict[];
}

/** Volle Vorschau für die Vergleichsansicht — Port von
 *  ui/proposal-compare.js::drawImpact()s Datenanteil (TSB-Delta am
 *  Eventtag + gelöste/neu eingeführte Konflikte). */
export function impactDetail(proposal: Proposal, ctx: ImpactContext): ImpactDetail {
  const p = preview(proposal, ctx);
  const events = ctx.events.map(toProjectionEvent);
  const event = horizonRaceEvent(events, p.after, ctx.today);
  const before = event ? tsbOnDate(p.before, event.eventDate) : null;
  const after = event ? tsbOnDate(p.after, event.eventDate) : null;
  const tsb =
    event && before != null && after != null
      ? { eventTitle: event.title || "Event", eventDate: event.eventDate, before, after }
      : null;

  const afterKeys = new Set(p.afterConflicts.map(conflictKey));
  const beforeKeys = new Set(p.beforeConflicts.map(conflictKey));
  const resolved = p.beforeConflicts.filter((c: Conflict) => !afterKeys.has(conflictKey(c)));
  const introduced = p.afterConflicts.filter((c: Conflict) => !beforeKeys.has(conflictKey(c)));
  return { tsb, resolved, introduced };
}
