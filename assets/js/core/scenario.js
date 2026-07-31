/* ============================================================
   CORE/SCENARIO.JS — What-if-Parameter → synthetischer Kartensatz
   (Phase 5, Schritt 3 — docs/phase-5-konzept-explorer.md §6, Variante 4A)

   Reine Rechenschicht: nimmt die ECHTEN Plan-Karten plus drei Parameter
   entgegen und liefert einen synthetischen Kartensatz in derselben
   Session-Shape wie plan_cards (s. data-access/supabase/plan-cards.js
   ::toSession) — NICHT persistiert, nie nach plan_cards geschrieben (§6.4).
   Der Aufrufer (state/chart-view.js) reicht das Ergebnis unverändert an
   core/projection.js::projectLoad() weiter; dieses Modul kennt projectLoad
   nicht und rechnet keine PMC-Kurve selbst.

   ── uncertain-Weitergabe (§6.3) ──────────────────────────────────────
   projectLoad()s eigene estimateTss()-Neuauswertung stuft eine Karte mit
   explizitem tssPlanned IMMER als "sicher" ein (Stufe 1 der Prioritäts-
   kette, core/projection.js). Würde dieses Modul einen skalierten Wert
   direkt in tssPlanned schreiben, ginge die Information verloren, dass die
   zugrunde liegende Zahl aus einer K3-Typ-Default-Schätzung mit dünner
   Datenbasis stammt — genau die Präzisions-Vortäuschung, die §6.3 verbietet.
   Deshalb wird JEDE Karte VOR der Skalierung einmal mit dem bereits
   exportierten core/projection.js::estimateTss() bewertet; ihre ID landet
   bei uncertain:true im zurückgegebenen `uncertainCardIds`-Set. Der Aufrufer
   verknüpft das nach dem projectLoad()-Aufruf über `day.cardIds` UND-mäßig
   in `day.uncertain` — core/projection.js selbst bleibt unangetastet.

   ── Reihenfolge der Transformationen ─────────────────────────────────
   1. Baseline je Karte auflösen (estimateTss, vor jeder Skalierung).
   2. Wochen-TSS ± %: skaliert die Baseline-Zahl, negativ geklemmt bei 0.
   3. N zusätzliche Ruhetage: pro ISO-Woche die N Karten mit dem höchsten
      (bereits skalierten) TSS werden aus dem Kartensatz ENTFERNT, nicht auf
      0 genullt. Begründung: projectLoad()s Tagesaggregation liefert für
      einen Tag ganz ohne Karte exakt dasselbe TSS-Ergebnis (0) wie eine
      genullte Karte — Entfernen ist die ehrlichere Semantik für "wird zum
      echten Ruhetag" und hinterlässt keine Karten-ID mit 0 TSS im
      Tagesobjekt.
   4. Rampenrate: Wochen chronologisch sortiert, Woche 0 bleibt Referenz
      (kein Vorgänger im übergebenen Kartensatz), jede Folgewoche wird
      proportional auf vorherigeWoche×(1+rampRatePct/100) skaliert, verteilt
      auf die nach Schritt 3 noch vorhandenen Karten dieser Woche. Eine Woche
      ohne Karten (Summe 0) kann nicht sinnvoll skaliert werden — die Kette
      läuft dann mit 0 als neuer Referenz weiter.
   ============================================================ */

import { estimateTss } from "./projection.js";
import { isoWeekKey } from "./aggregate.js";
import { localISODate } from "./format.js";

function round2(n) {
  return Math.round(n * 100) / 100;
}

function sumTss(group) {
  return group.reduce((sum, w) => sum + w.tssPlanned, 0);
}

function groupByWeek(working) {
  const byWeek = new Map();
  for (const w of working) {
    const key = isoWeekKey(w.date);
    if (!byWeek.has(key)) byWeek.set(key, []);
    byWeek.get(key).push(w);
  }
  return byWeek;
}

/**
 * @param {Array<{id:string, date:string, tssPlanned?:number|null, workout?:Object|null, typ?:string|null, cancelled?:boolean}>} cards
 *   Echte Plan-Karten (Session-Shape aus data-access/supabase/plan-cards.js).
 * @param {{weekTssPct?: number, restDays?: number, rampRatePct?: number}} [params]
 * @param {{today?: string, ftp?: number}} [opts]
 * @returns {{cards: Array<{id:string, date:string, tssPlanned:number, typ:string|null}>, uncertainCardIds: Set<string>}}
 */
export function buildScenario(cards, params = {}, opts = {}) {
  const today = opts.today ?? localISODate();
  const ftp = opts.ftp;
  const weekTssPct = params.weekTssPct ?? 0;
  const restDays = Math.max(0, Math.round(params.restDays ?? 0));
  const rampRatePct = params.rampRatePct ?? 0;

  const uncertainCardIds = new Set();
  const futureCards = (cards || []).filter((c) => c && !c.cancelled && c.date && c.date >= today);
  if (!futureCards.length) return { cards: [], uncertainCardIds };

  // 1. Baseline (unskaliert) + uncertain-Herkunft je Karte.
  const baseline = futureCards.map((c) => {
    const { tss, uncertain } = estimateTss(c, { ftp });
    if (uncertain) uncertainCardIds.add(c.id);
    return { id: c.id, date: c.date, typ: c.typ, baseTss: tss };
  });

  // 2. Wochen-TSS ± % — negativ geklemmt (ein Faktor < 0 würde die
  //    Rangfolge in Schritt 3 invertieren und ergäbe eine negative TSS).
  const scaleFactor = Math.max(0, 1 + weekTssPct / 100);
  let working = baseline.map(({ id, date, typ, baseTss }) => ({
    id,
    date,
    typ,
    tssPlanned: round2(baseTss * scaleFactor),
  }));

  // 3. N zusätzliche Ruhetage je ISO-Woche.
  if (restDays > 0) {
    const toRemove = new Set();
    for (const group of groupByWeek(working).values()) {
      const sorted = [...group].sort((a, b) => b.tssPlanned - a.tssPlanned);
      for (let i = 0; i < Math.min(restDays, sorted.length); i++) {
        toRemove.add(sorted[i].id);
      }
    }
    working = working.filter((w) => !toRemove.has(w.id));
  }

  // 4. Rampenrate — Wochenketten-Skalierung über die verbliebenen Karten.
  if (rampRatePct !== 0 && working.length) {
    const byWeek = groupByWeek(working);
    const weekKeys = [...byWeek.keys()].sort();
    let prevSum = sumTss(byWeek.get(weekKeys[0]));
    for (let i = 1; i < weekKeys.length; i++) {
      const group = byWeek.get(weekKeys[i]);
      const currentSum = sumTss(group);
      if (currentSum > 0) {
        const target = Math.max(0, prevSum * (1 + rampRatePct / 100));
        const factor = target / currentSum;
        for (const w of group) w.tssPlanned = round2(w.tssPlanned * factor);
        prevSum = target;
      } else {
        prevSum = 0; // keine Karten in dieser Woche → Kette bricht auf 0
      }
    }
  }

  return { cards: working, uncertainCardIds };
}
