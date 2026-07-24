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

import { fmtDate } from "./format.js";
import { isoWeekKey } from "./aggregate.js";
import { CONFLICT_THRESHOLDS, INTENSITY_CLASS, intensityClass } from "./plan-config.js";

/** Ein Konfliktbefund.
 *  @typedef {Object} Conflict
 *  @property {string} rule       Regel-Kennung (K-TSB, K-HART, …)
 *  @property {"info"|"warning"} severity  info = gold (Hinweis), warning = rot
 *  @property {string[]} dates    betroffene ISO-Daten
 *  @property {string[]} cardIds  betroffene Karten-IDs (für Badges in Schritt 5)
 *  @property {string} message    fertiger Anzeigetext */

/** Datumsbereich lesbar: "24.07." oder "24.07.–26.07." */
function dateRange(dates) {
  if (!dates.length) return "";
  if (dates.length === 1) return fmtDate(dates[0]);
  return `${fmtDate(dates[0])}–${fmtDate(dates[dates.length - 1])}`;
}

/**
 * Erzeugt die Konfliktliste zu einer Projektion.
 * @param {{days: Array<{date: string, tsb: number, tss: number, cardIds: string[]}>}} projection
 * @param {Array<{id: string, date: string, typ?: string|null, cancelled?: boolean}>} cards
 * @param {Array<{eventDate: string, title?: string, type?: string, priority?: string}>} events
 * @param {{config?: typeof CONFLICT_THRESHOLDS, intensityTable?: Record<string,string>}} [options]
 * @returns {Conflict[]}
 */
export function detectConflicts(projection, cards, events = [], options = {}) {
  const cfg = options.config ?? CONFLICT_THRESHOLDS;
  const intensityTable = options.intensityTable ?? INTENSITY_CLASS;
  const days = projection?.days ?? [];
  if (!days.length) return [];

  const today = days[0].date;

  // Karten je Datum (nur aktive, nur ab heute — Vergangenheit ist nicht mehr
  // planbar und die Projektion beginnt ohnehin heute).
  const cardsByDate = new Map();
  for (const c of cards || []) {
    if (c.cancelled || !c.date || c.date < today) continue;
    if (!cardsByDate.has(c.date)) cardsByDate.set(c.date, []);
    cardsByDate.get(c.date).push(c);
  }

  /** Lastklasse eines Tages: "hart" (≥1 harte Karte), "aktiv" (moderat/locker)
   *  oder "ruhe" (keine Karte oder nur Ruhetage). */
  const classOf = (date) => {
    const dc = cardsByDate.get(date) || [];
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

  // ── K-LEER: harte Einheit direkt nach einem Ruheblock ≥ 3 Tagen ─
  for (let i = 0; i < days.length; i++) {
    if (classOf(days[i].date) !== "hart") continue;
    let rest = 0;
    for (let j = i - 1; j >= 0 && classOf(days[j].date) === "ruhe"; j--) rest++;
    if (rest >= cfg.restBlockDays) {
      conflicts.push({
        rule: "K-LEER",
        severity: "info",
        dates: [days[i].date],
        cardIds: hardCardIds(days[i].date),
        message: `Harte Einheit am ${fmtDate(days[i].date)} direkt nach ${rest} Ruhetagen`,
      });
    }
  }

  // ── K-RAMPE: Wochen-TSS-Sprung > +20 % (nur volle Wochen) ───────
  const weeks = weeklyTss(days);
  for (let i = 1; i < weeks.length; i++) {
    const prev = weeks[i - 1];
    const cur = weeks[i];
    if (prev.tss <= 0) continue;
    const jump = (cur.tss - prev.tss) / prev.tss;
    if (jump > cfg.weekRampPct / 100) {
      conflicts.push({
        rule: "K-RAMPE",
        severity: "info",
        dates: [cur.firstDate],
        cardIds: cur.cardIds,
        message: `Wochenlast +${Math.round(jump * 100)} % (${prev.tss}→${cur.tss} TSS, ab ${fmtDate(
          cur.firstDate
        )})`,
      });
    }
  }

  // ── K-EVENT: Form am Eventtag außerhalb des Zielfensters ───────
  const dayByDate = new Map(days.map((d) => [d.date, d]));
  for (const ev of events || []) {
    if (ev.type !== "race") continue;
    const window = ev.priority === "A" ? cfg.eventWindowA : ev.priority === "B" ? cfg.eventWindowB : null;
    if (!window) continue; // C-Events / ohne Priorität: kein Zielfenster in v1
    const day = dayByDate.get(ev.eventDate);
    if (!day) continue; // Event außerhalb des Horizonts
    const [lo, hi] = window;
    if (day.tsb < lo || day.tsb > hi) {
      const label = ev.title ? `${ev.title}, ` : "";
      conflicts.push({
        rule: "K-EVENT",
        severity: ev.priority === "A" ? "warning" : "info",
        dates: [ev.eventDate],
        cardIds: day.cardIds,
        message: `TSB am Eventtag (${label}${fmtDate(ev.eventDate)}): ${Math.round(
          day.tsb
        )} — außerhalb Zielfenster ${ev.priority} (${lo > 0 ? "+" : ""}${lo}…${hi > 0 ? "+" : ""}${hi})`,
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
