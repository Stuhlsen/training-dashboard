/* ============================================================
   CORE/CONFLICTS.JS — Konfliktregeln v1 (kein DOM)
   (Phase 3, Schritt 4 — docs/phase-3-konzept-konfliktlogik-prognose.md §3)

   Nimmt die PMC-Projektion (core/projection.js) + die Karten + Events und
   liefert eine Liste von Befunden MIT fertigem Anzeigetext. Die Texte kommen
   aus dieser Funktion, nicht aus der UI — Schritt 5 rendert nur noch.

   Grundsatz: warnen, nie blockieren. Kein Befund verhindert eine Änderung.
   Schwellen sind Konfig-Defaults aus core/plan-config.js (K1), keine Magic
   Numbers hier — nach Plan 2 gegen die Ist-Daten reviewen.
   ============================================================ */

import { fmtDate, addDaysISO } from "./format.js";
import { isoWeekKey } from "./aggregate.js";
import { CONFLICT_THRESHOLDS, INTENSITY_CLASS, intensityClass } from "./plan-config.js";
import { weeklyCtlRamp } from "./projection.js";
import { RECOVERY_CARD_TYPES } from "./plan-feedback.js";
import { currentBlockTarget, PHASE_SIGNATURES } from "./periodization.js";
import { planWeekFor } from "./plan-week-model.js";

/** Ein Konfliktbefund.
 *  @typedef {Object} Conflict
 *  @property {string} rule       Regel-Kennung (K-TSB, K-HART, …)
 *  @property {"info"|"warning"} severity  info = gold (Hinweis), warning = rot
 *  @property {string[]} dates    betroffene ISO-Daten
 *  @property {string[]} cardIds  betroffene Karten-IDs (für Badges in Schritt 5)
 *  @property {string} message    fertiger Anzeigetext */

/** Anzeigetext für events.priority (DB-Werte seit Migration 0004: "main"/
 *  "secondary", nullable) — dupliziert ui/event-timeline.js::PRIORITY_LABEL
 *  bewusst hier, weil dieses Modul laut Dateikopf fertigen Anzeigetext
 *  erzeugt und core/ nicht aus ui/ importieren darf (Schichtenregel). */
const EVENT_PRIORITY_LABEL = { main: "Hauptziel", secondary: "Nebenziel" };

/** Datumsbereich lesbar: "24.07." oder "24.07.–26.07." */
function dateRange(dates) {
  if (!dates.length) return "";
  if (dates.length === 1) return fmtDate(dates[0]);
  return `${fmtDate(dates[0])}–${fmtDate(dates[dates.length - 1])}`;
}

/**
 * Erzeugt die Konfliktliste zu einer Projektion.
 * @param {{days: Array<{date: string, tsb: number, tss: number, cardIds: string[]}>, startCtl?: number}} projection
 *   `startCtl` wird für K-RAMPE (neu)/K-WOCHENTSS gebraucht (Baseline der
 *   jeweils ersten vollen Woche) — fehlt es (z.B. in älteren Test-Fixtures,
 *   die nur `days` konstruieren), feuern diese beiden Regeln für die
 *   betroffene(n) erste(n) Woche(n) einfach nicht, statt zu crashen.
 * @param {Array<{id: string, date: string, typ?: string|null, phase?: string|null, cancelled?: boolean}>} cards
 * @param {Array<{eventDate: string, title?: string, type?: string, priority?: string}>} events
 * @param {import("../types.js").Ride[]} [actuals] Ist-Fahrten — für den
 *   K-WOCHENSPRUNG-Ist-Seed (letzte tatsächlich gefahrene Woche als
 *   Vergleichswert für die erste volle Planwoche, s. docs/offene-punkte.md)
 *   UND für K-TID (Intensitätsverteilung der letzten 4 Wochen).
 * @param {{config?: typeof CONFLICT_THRESHOLDS, intensityTable?: Record<string,string>, athleteId?: string}} [options]
 *   `athleteId` (Fahrplan 6, RUH3): schaltet die Plan-Wochen-Modell-
 *   Konsultation frei — ein Ruhe-Slot-Tag ohne Karte gilt dann als „ruhe"
 *   (bewusst frei) statt „leer" (Planungslücke). Ohne `athleteId` bleibt die
 *   Klassifikation exakt wie vor RUH3 (nur Ruhetag-/ausgefallene Karten
 *   zählen als bewusst frei).
 * @returns {Conflict[]}
 */
export function detectConflicts(projection, cards, events = [], actuals = [], options = {}) {
  const cfg = options.config ?? CONFLICT_THRESHOLDS;
  const intensityTable = options.intensityTable ?? INTENSITY_CLASS;
  const athleteId = options.athleteId ?? null;
  const days = projection?.days ?? [];
  if (!days.length) return [];

  const today = days[0].date;

  // Karten je Datum (nur aktive, nur ab heute — Vergangenheit ist nicht mehr
  // planbar und die Projektion beginnt ohnehin heute).
  const cardsByDate = new Map();
  // Tage mit mindestens einer AUSGEFALLENEN Karte — bewusst getrennt von
  // cardsByDate (das bleibt "nur aktive Karten" für K-OVERLAP/hardCardIds/
  // cardIds). Wer eine Karte ausfallen lässt, hat den Tag bewusst frei
  // gemacht — die Konfliktlogik soll das wie einen Ruhetag werten, nicht wie
  // eine echte Planungslücke (s. isRestEquivalent unten).
  const cancelledDates = new Set();
  for (const c of cards || []) {
    if (c.cancelled && c.date && c.date >= today) cancelledDates.add(c.date);
    if (c.cancelled || !c.date || c.date < today) continue;
    if (!cardsByDate.has(c.date)) cardsByDate.set(c.date, []);
    cardsByDate.get(c.date).push(c);
  }

  /** Tag ohne aktive Karte, der bewusst frei ist — kein Unterschied zu einem
   *  geplanten Ruhetag. Zwei Quellen:
   *   1. mindestens eine AUSGEFALLENE Karte an dem Tag (cancelledDates), oder
   *   2. Fahrplan 6 (RUH3): der Tag ist laut Plan-Wochen-Modell ein Ruhe-Slot
   *      (`planWeekFor().isRestSlot`) — nur wenn `athleteId` übergeben wurde,
   *      sonst greift Quelle 2 nie und das Verhalten bleibt wie vor RUH3.
   *  Ein Tag mit einer AKTIVEN Karte (egal welchen Typs) bleibt davon
   *  unberührt, auch wenn zusätzlich etwas anderes an diesem Tag ausgefallen
   *  ist — cardsByDate.has(date) sticht. */
  const isRestEquivalent = (date) =>
    !cardsByDate.has(date) &&
    (cancelledDates.has(date) ||
      (athleteId != null && planWeekFor(athleteId, date).isRestSlot));

  /** Lastklasse eines Tages: "hart" (≥1 harte Karte), "aktiv" (moderat/locker),
   *  "ruhe" (bewusst frei: nur Ruhetag-Karte(n), nur ausgefallene Karte(n),
   *  oder abgeleiteter Ruhe-Slot ohne Karte — s. isRestEquivalent) oder
   *  "leer" (keine Karte an einem Trainings-Slot — echte Planungslücke). Vor
   *  D6 (docs/konzept-progressionssteuerung.md) fielen "keine Karte" und
   *  "Ruhetag-Karte" beide auf "ruhe" — K-LEER unten unterscheidet das jetzt
   *  bewusst (nur "leer" löst aus). */
  const classOf = (date) => {
    const dc = cardsByDate.get(date) || [];
    if (!dc.length) return isRestEquivalent(date) ? "ruhe" : "leer";
    const classes = dc.map((c) => intensityClass(c.typ, intensityTable));
    if (classes.includes("hart")) return "hart";
    if (classes.some((k) => k === "moderat" || k === "locker")) return "aktiv";
    return "ruhe";
  };
  const hardCardIds = (date) =>
    (cardsByDate.get(date) || [])
      .filter((c) => intensityClass(c.typ, intensityTable) === "hart")
      .map((c) => c.id);

  const conflicts = [];

  // ── K-TSB: irgendein Tag unter dem Tiefwert (< −30) ────────────
  const deepDays = days.filter((d) => d.tsb < cfg.tsbLow);
  if (deepDays.length) {
    const min = deepDays.reduce((a, b) => (b.tsb < a.tsb ? b : a));
    conflicts.push({
      rule: "K-TSB",
      severity: "warning",
      dates: deepDays.map((d) => d.date),
      cardIds: [...new Set(deepDays.flatMap((d) => d.cardIds))],
      message: `TSB fällt am ${fmtDate(min.date)} auf ${Math.round(min.tsb)} (unter ${cfg.tsbLow})`,
    });
  }

  // ── K-TSB2: anhaltend tiefer TSB (< −20 an ≥ 3 Folgetagen) ─────
  for (const run of runsWhere(days, (d) => d.tsb < cfg.tsbSustained)) {
    if (run.length < cfg.tsbSustainedDays) continue;
    conflicts.push({
      rule: "K-TSB2",
      severity: "warning",
      dates: run.map((d) => d.date),
      cardIds: [...new Set(run.flatMap((d) => d.cardIds))],
      message: `TSB bleibt ${run.length} Tage in Folge unter ${cfg.tsbSustained} (${dateRange(
        run.map((d) => d.date)
      )})`,
    });
  }

  // ── K-HART: harte Einheiten an Folgetagen ──────────────────────
  for (const run of runsWhere(days, (d) => classOf(d.date) === "hart")) {
    if (run.length < cfg.hardStreakInfo) continue;
    const dates = run.map((d) => d.date);
    conflicts.push({
      rule: "K-HART",
      severity: run.length >= cfg.hardStreakWarn ? "warning" : "info",
      dates,
      cardIds: [...new Set(dates.flatMap((d) => hardCardIds(d)))],
      message: `${run.length} harte Tage in Folge (${dateRange(dates)})`,
    });
  }

  // ── K-LEER: harte Einheit direkt nach einem Block ≥ 3 echten Planungs-
  //    lücken ("leer" — keine Karte an einem Trainings-Slot). Ein bewusst
  //    freier Tag ("ruhe": Ruhetag-/ausgefallene Karte ODER abgeleiteter
  //    Ruhe-Slot, s. isRestEquivalent) bricht die Zählung wie ein aktiver
  //    Tag — er ist keine Planungslücke (D6, docs/konzept-
  //    progressionssteuerung.md; Ruhe-Slot-Ableitung: Fahrplan 6 RUH3).
  for (let i = 0; i < days.length; i++) {
    if (classOf(days[i].date) !== "hart") continue;
    let rest = 0;
    for (let j = i - 1; j >= 0 && classOf(days[j].date) === "leer"; j--) rest++;
    if (rest >= cfg.restBlockDays) {
      conflicts.push({
        rule: "K-LEER",
        severity: "info",
        dates: [days[i].date],
        cardIds: hardCardIds(days[i].date),
        message: `Harte Einheit am ${fmtDate(days[i].date)} direkt nach ${rest} ungeplanten Tagen`,
      });
    }
  }

  // ── K-WOCHENSPRUNG: Wochen-TSS-Sprung > +20 % (nur volle Wochen) ─
  // Bis Fenster E1 hieß diese Regel "K-RAMPE" — umbenannt, weil dieser
  // Bezeichner jetzt die CTL-Rampe unten meint (P2, docs/konzept-
  // progressionssteuerung.md). Logik/Schwelle unverändert.
  // Ist-Seed: die Projektion selbst beginnt erst HEUTE und kennt keine
  // Vergangenheit — ohne den Seed hätte die erste volle Planwoche nie einen
  // Vorwert und würde nie geprüft (Schleife startet bei i=1).
  const weeks = weeklyTss(days);
  const seed = lastRiddenWeekTss(actuals, today);
  if (seed) weeks.unshift(seed);
  for (let i = 1; i < weeks.length; i++) {
    const prev = weeks[i - 1];
    const cur = weeks[i];
    if (prev.tss <= 0) continue;
    const jump = (cur.tss - prev.tss) / prev.tss;
    if (jump > cfg.weekJumpPct / 100) {
      conflicts.push({
        rule: "K-WOCHENSPRUNG",
        severity: "info",
        dates: [cur.firstDate],
        cardIds: cur.cardIds,
        message: `Wochenlast +${Math.round(jump * 100)} % (${prev.tss}→${cur.tss} TSS, ab ${fmtDate(
          cur.firstDate
        )})`,
      });
    }
  }

  // ── K-RAMPE (P2, neu): projizierte CTL-Rampe über der Schwelle ──
  // core/projection.js::weeklyCtlRamp — dieselbe Rechnung wie P1s
  // "projizierte Rampe des Planungshorizonts" (core/guardrails.js), hier
  // nur als Schwellenprüfung statt erzählender Übersicht.
  for (const w of weeklyCtlRamp(days, projection?.startCtl)) {
    if (!Number.isFinite(w.ramp)) continue;
    if (w.ramp > cfg.ctlRampWarn) {
      conflicts.push({
        rule: "K-RAMPE",
        severity: "warning",
        dates: [w.firstDate],
        cardIds: [],
        message: `Projizierte CTL-Rampe +${w.ramp}/Woche über der Warnschwelle (${cfg.ctlRampWarn}, ab ${fmtDate(w.firstDate)})`,
      });
    } else if (w.ramp > cfg.ctlRampInfo) {
      conflicts.push({
        rule: "K-RAMPE",
        severity: "info",
        dates: [w.firstDate],
        cardIds: [],
        message: `Projizierte CTL-Rampe +${w.ramp}/Woche über dem Hinweiswert (${cfg.ctlRampInfo}, ab ${fmtDate(w.firstDate)})`,
      });
    }
  }

  // ── K-HARTFOLGE (P2, neu): zwei harte Tage ohne rest-/recovery- ─
  //    Karte dazwischen (D6.2). Nur die NÄCHSTE vorangehende harte Karte
  //    zählt (kein O(n²) über alle Paare) — echte Rückenlücke = 0
  //    (unmittelbar aufeinanderfolgende harte Tage) deckt bereits K-HART
  //    ab, hier also bewusst nur gap ≥ 1.
  for (let i = 0; i < days.length; i++) {
    if (classOf(days[i].date) !== "hart") continue;
    for (let j = i - 1; j >= 0; j--) {
      if (classOf(days[j].date) !== "hart") continue;
      const gap = i - j - 1;
      if (gap >= 1) {
        let hasRecovery = false;
        for (let k = j + 1; k < i; k++) {
          const dc = cardsByDate.get(days[k].date) || [];
          // Trennt zwei harte Tage: eine Z1-Recovery-Karte ODER ein "ruhe"-Tag
          // (Ruhetag-/Notiz-Karte, nur ausgefallene Karte, oder — mit
          // athleteId — abgeleiteter Ruhe-Slot; classOf deckt alle drei ab).
          if (dc.some((c) => RECOVERY_CARD_TYPES.has(c.typ)) || classOf(days[k].date) === "ruhe") {
            hasRecovery = true;
            break;
          }
        }
        if (!hasRecovery) {
          conflicts.push({
            rule: "K-HARTFOLGE",
            severity: "warning",
            dates: [days[j].date, days[i].date],
            cardIds: [...hardCardIds(days[j].date), ...hardCardIds(days[i].date)],
            message: `Harte Tage am ${fmtDate(days[j].date)} und ${fmtDate(days[i].date)} ohne Ruhetag-/Recovery-Karte dazwischen`,
          });
        }
      }
      break; // nur die nächste vorangehende harte Karte prüfen
    }
  }

  // ── K-WOCHENTSS (P2, neu): Wochen-TSS > CTL(Wochenstart) × Faktor ─
  for (const w of weeks.filter((w) => w !== seed)) {
    const idx = days.findIndex((d) => d.date === w.firstDate);
    const ctlAtStart = idx > 0 ? days[idx - 1].ctl : projection?.startCtl;
    if (!Number.isFinite(ctlAtStart)) continue;
    const ceiling = ctlAtStart * cfg.weekTssCeilingFactor;
    if (w.tss > ceiling) {
      conflicts.push({
        rule: "K-WOCHENTSS",
        severity: "warning",
        dates: [w.firstDate],
        cardIds: w.cardIds,
        message: `Wochen-TSS ${Math.round(w.tss)} über Obergrenze ${Math.round(ceiling)} (CTL ${Math.round(
          ctlAtStart
        )} × ${cfg.weekTssCeilingFactor}, ab ${fmtDate(w.firstDate)})`,
      });
    }
  }

  // ── K-TID (P2, neu): Anteil hoher Intensität außerhalb des Block- ─
  //    korridors über die letzten 4 Ist-Wochen (`r.if`, bereits vorhanden).
  //    Kein Korridor für die aktuelle Blockphase (Taper/Übergang/kein
  //    Blockziel) → keine Regel, keine Aussage.
  const tidPhase = currentBlockTarget(cards, today);
  const tidCorridor = tidPhase ? PHASE_SIGNATURES[tidPhase] : null;
  if (tidCorridor) {
    const tidFrom = addDaysISO(today, -28);
    const tidWindow = (actuals || []).filter((r) => {
      const d = r.dateISO || r.date;
      return d && d >= tidFrom && d < today && r.if != null;
    });
    if (tidWindow.length) {
      const above = tidWindow.filter((r) => r.if > tidCorridor.ifMax).length;
      const share = above / tidWindow.length;
      if (share > cfg.highIntensityShareInfo) {
        conflicts.push({
          rule: "K-TID",
          severity: "info",
          dates: [today],
          cardIds: [],
          message: `Intensitätsverteilung (letzte 4 Wochen): ${Math.round(
            share * 100
          )} % oberhalb des Zielkorridors „${tidPhase}" (IF > ${tidCorridor.ifMax})`,
        });
      }
    }
  }

  // ── K-EVENT: Form am Eventtag außerhalb des Zielfensters ───────
  const dayByDate = new Map(days.map((d) => [d.date, d]));
  for (const ev of events || []) {
    if (ev.type !== "race") continue;
    const window =
      ev.priority === "main"
        ? cfg.eventWindowMain
        : ev.priority === "secondary"
          ? cfg.eventWindowSecondary
          : null;
    if (!window) continue; // ohne Priorität: kein Zielfenster in v1
    const day = dayByDate.get(ev.eventDate);
    if (!day) continue; // Event außerhalb des Horizonts
    const [lo, hi] = window;
    if (day.tsb < lo || day.tsb > hi) {
      const label = ev.title ? `${ev.title}, ` : "";
      const priorityLabel = EVENT_PRIORITY_LABEL[ev.priority] ?? ev.priority;
      conflicts.push({
        rule: "K-EVENT",
        severity: ev.priority === "main" ? "warning" : "info",
        dates: [ev.eventDate],
        cardIds: day.cardIds,
        message: `TSB am Eventtag (${label}${fmtDate(ev.eventDate)}): ${Math.round(
          day.tsb
        )} — außerhalb Zielfenster ${priorityLabel} (${lo > 0 ? "+" : ""}${lo}…${hi > 0 ? "+" : ""}${hi})`,
      });
    }
  }

  // ── K-OVERLAP: zwei aktive Karten am selben Tag ────────────────
  for (const [date, dc] of cardsByDate) {
    if (dc.length < 2) continue;
    conflicts.push({
      rule: "K-OVERLAP",
      severity: "info",
      dates: [date],
      cardIds: dc.map((c) => c.id),
      message: `${dc.length} Einheiten am selben Tag (${fmtDate(date)})`,
    });
  }

  return conflicts;
}

/** Zerlegt eine Tagesliste in maximale Läufe aufeinanderfolgender Tage, die
 *  `pred` erfüllen (die Tage sind bereits lückenlos aufsteigend). */
function runsWhere(days, pred) {
  const runs = [];
  let cur = [];
  for (const d of days) {
    if (pred(d)) {
      cur.push(d);
    } else if (cur.length) {
      runs.push(cur);
      cur = [];
    }
  }
  if (cur.length) runs.push(cur);
  return runs;
}

/** TSS-Summe je ISO-Woche, nur VOLLE 7-Tage-Wochen (partielle Anfangs-/End-
 *  wochen würden den Rampenvergleich verfälschen — eine halbe Startwoche
 *  sähe künstlich niedrig aus). Chronologisch sortiert. */
/** Wochen-TSS der letzten VOLLSTÄNDIG vergangenen Kalenderwoche aus echten
 *  Fahrten — Ist-Seed für K-RAMPE (s. Aufrufstelle). Nimmt bewusst die
 *  jüngste vorhandene Woche, auch wenn eine Lücke zu `beforeDate` liegt:
 *  genau der Vergleich "Planstart vs. letzte reale Last" ist der Punkt.
 *  @param {import("../types.js").Ride[]} actuals
 *  @param {string} beforeDate ISO-Datum, ab dem nicht mehr gezählt wird
 *  @returns {{tss: number} | null} */
function lastRiddenWeekTss(actuals, beforeDate) {
  const byWeek = new Map();
  for (const r of actuals || []) {
    const date = r.dateISO || r.date;
    if (!date || date >= beforeDate || !Number.isFinite(r.tss)) continue;
    const key = isoWeekKey(date);
    byWeek.set(key, (byWeek.get(key) || 0) + r.tss);
  }
  if (!byWeek.size) return null;
  const keys = [...byWeek.keys()].sort();
  return { tss: byWeek.get(keys[keys.length - 1]) };
}

function weeklyTss(days) {
  const map = new Map();
  for (const d of days) {
    const key = isoWeekKey(d.date);
    if (!map.has(key)) map.set(key, { key, tss: 0, count: 0, firstDate: d.date, cardIds: [] });
    const w = map.get(key);
    w.tss += d.tss;
    w.count += 1;
    w.cardIds.push(...d.cardIds);
  }
  return [...map.values()]
    .filter((w) => w.count === 7)
    .sort((a, b) => a.firstDate.localeCompare(b.firstDate));
}
