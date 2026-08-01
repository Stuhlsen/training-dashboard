/* ============================================================
   CORE/PLAN-FEEDBACK.JS — Nach-Drop-Feedback: reine Ableitungen
   (Phase 3, Schritt 5 — docs/dashboard-2.0-fahrplan-aktuell.md)

   Nimmt die bereits fertigen Ergebnisse aus core/projection.js +
   core/conflicts.js und leitet daraus nur noch an, WAS ui/planned.js
   zeigen soll (Konflikt-Badges pro Karte, Delta-Zeile am Eventtag).
   Kein DOM, kein neuer Rechencode — reine Sortierung/Auswahl auf
   bereits vorhandenen Daten, deshalb hier statt in ui/ (testbar ohne
   Supabase-Mocking, s. AGENTS.md Stack-Abschnitt).
   ============================================================ */

import { isoWeekKey } from "./aggregate.js";
import { estimateTss } from "./projection.js";

function round2(n) {
  return Math.round(n * 100) / 100;
}

/** Konfliktbefunde, die eine bestimmte Karte betreffen — sortiert
 *  warning vor info (Konzept §4: "gold für Hinweis, rot für Warnung").
 *  Eine Karte kann in mehreren Konflikten gleichzeitig auftauchen. */
export function conflictsForCard(conflicts, cardId) {
  return (conflicts || [])
    .filter((c) => c.cardIds?.includes(cardId))
    .slice()
    .sort((a, b) => {
      if (a.severity === b.severity) return 0;
      return a.severity === "warning" ? -1 : 1;
    });
}

/** Nächstes A/B/C-Rennen im Projektionshorizont — für die Delta-Zeile
 *  ("TSB am Eventtag: … → …"). Analog zu state/events.js::nextRaceEvent,
 *  zusätzlich auf den Prognosehorizont begrenzt: ein Event weit hinter
 *  dem Horizont hat ohnehin keinen projizierten TSB-Wert. */
export function horizonRaceEvent(events, projection, todayIso) {
  if (!projection?.days?.length) return null;
  const horizonEnd = projection.horizonEnd;
  const upcoming = (events || []).filter(
    (e) => e.type === "race" && e.eventDate >= todayIso && e.eventDate <= horizonEnd
  );
  if (!upcoming.length) return null;
  return upcoming.reduce((soonest, e) => (e.eventDate < soonest.eventDate ? e : soonest));
}

/** Projizierter TSB an einem Datum, oder null wenn außerhalb der
 *  Projektion (kein Tag mit diesem Datum vorhanden). */
export function tsbOnDate(projection, dateIso) {
  const day = projection?.days?.find((d) => d.date === dateIso);
  return day ? day.tsb : null;
}

/** Modellierte Wirkung EINES Tages aus der PMC-Fortschreibung (W1, docs/
 *  konzept-progressionssteuerung.md Schritt 3b/9C) — der Einzeltagesschritt
 *  für `dateIso`: Fitness (CTL) bewegt sich langsam (Zweiundvierzigstel),
 *  Ermüdung (ATL) schnell (Siebtel), Form (TSB) ist die Differenz zwischen
 *  Vorher- und Nachher-Stand desselben Tages (core/projection.js::
 *  projectLoad rechnet TSB[t] bereits als CTL[t-1]−ATL[t-1], "vorher").
 *  Nutzt AUSSCHLIESSLICH bereits in `projection` vorhandene, gerundete
 *  Werte — keine neue Rechenschicht, nur eine Differenzbildung auf dem
 *  bereits Sichtbaren (dieselben Zahlen, die die Charts zeigen).
 *  Bei mehreren Karten am selben Tag ist das die GEMEINSAME Tageswirkung
 *  (projection.days aggregiert TSS bereits pro Datum, s. estimateTss-
 *  Aufrufer in projection.js) — keine Aufteilung pro Karte.
 *  `null` außerhalb der Projektion (vergangene/ausgefallene Karten —
 *  projectLoad() überspringt diese Tage, kein Fehler).
 *  @param {ReturnType<typeof import("./projection.js").projectLoad>} projection
 *  @param {string} dateIso
 *  @returns {{deltaFitness: number, deltaFatigue: number, deltaForm: number, uncertain: boolean}|null} */
export function dayImpact(projection, dateIso) {
  const days = projection?.days;
  if (!days?.length) return null;
  const idx = days.findIndex((d) => d.date === dateIso);
  if (idx === -1) return null;
  const day = days[idx];
  const ctlBefore = idx === 0 ? projection.startCtl : days[idx - 1].ctl;
  const atlBefore = idx === 0 ? projection.startAtl : days[idx - 1].atl;
  return {
    deltaFitness: round2(day.ctl - ctlBefore),
    deltaFatigue: round2(day.atl - atlBefore),
    deltaForm: round2(day.ctl - day.atl - day.tsb),
    uncertain: day.uncertain,
  };
}

/** Vorzeichen-Zahl mit einer Nachkommastelle, deutsches Format (Komma,
 *  Unicode-Minus) — Konzept-Beispiel W1: "Ermüdung −8,6". Exportiert, damit
 *  ui/planned.js dieselbe Formatierung für den Vorher/Nachher-Vergleich im
 *  Drop-Feedback-Banner nutzt (kein zweites, abweichendes Zahlenformat). */
export function formatSignedDelta(n) {
  const rounded = Math.round(n * 10) / 10;
  if (rounded === 0) return "±0"; // deckt auch −0 ab (−0 === 0 in JS)
  const sign = rounded > 0 ? "+" : "−";
  return `${sign}${Math.abs(rounded).toLocaleString("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}`;
}

/** Beschriftung für die Wirkungsanzeige (W1.1, Entscheidung zur Abnahme):
 *  ausgeschrieben und neutral, KEINE prominente TSB-Einzelzahl — eine
 *  hervorgehobene Formzahl pro Karte lädt dazu ein, auf TSB hin zu
 *  optimieren (Konzept P2-Begründung). `scale` (aus estimateTss(), B0/
 *  Schritt 3) muss durchschlagen (W1.2): sitzt der Wert auf der TRIMP-
 *  Näherung statt echtem/berechnetem TSS, reicht der Zusatz "modelliert"
 *  allein nicht — braucht eine erkennbar schwächere Formulierung.
 *  @param {{deltaFitness:number, deltaFatigue:number, deltaForm:number}} impact
 *  @param {"tss"|"tss-approx"} scale
 *  @returns {string} */
export function formatCardImpact(impact, scale) {
  const qualifier = scale === "tss-approx" ? "grob geschätzt" : "modelliert";
  return `Ermüdung ${formatSignedDelta(impact.deltaFatigue)} · Fitness ${formatSignedDelta(impact.deltaFitness)} · Form ${formatSignedDelta(impact.deltaForm)} — ${qualifier}`;
}

/** Wirkungsanzeige EINER Karte (W1/9C) — kombiniert dayImpact() mit der
 *  `scale` aus estimateTss() (dieselbe Funktion, die core/projection.js
 *  intern für die Prognose selbst nutzt) und liefert die fertige
 *  Beschriftung. `null`, wenn die Karte außerhalb der Projektion liegt
 *  (kein Tag mit `card.date` vorhanden — vergangene/ausgefallene Karten).
 *  @param {{date?:string, tssPlanned?:number|null, workout?:Object|null, workoutStructure?:Object|null, typ?:string|null}} card
 *  @param {ReturnType<typeof import("./projection.js").projectLoad>} projection
 *  @param {{ftp?:number}} [opts]
 *  @returns {{deltaFitness:number, deltaFatigue:number, deltaForm:number, uncertain:boolean, scale:"tss"|"tss-approx", label:string}|null} */
export function cardImpact(card, projection, opts = {}) {
  if (!card?.date) return null;
  const impact = dayImpact(projection, card.date);
  if (!impact) return null;
  const { scale } = estimateTss(card, opts);
  return { ...impact, scale, label: formatCardImpact(impact, scale) };
}

/** D6 (docs/konzept-progressionssteuerung.md D6.1): eine `Ruhetag`-Karte,
 *  an deren Datum trotzdem eine Fahrt existiert, ist kein Fehler und kein
 *  Konflikt (core/conflicts.js kennt diesen Fall nicht — reine
 *  Projektions-/Plankarten-Logik dort) — nur ein eigenes Trainer-Signal,
 *  analog zum bestehenden Abweichungssignal geplant/erkannt. `wasRidden`
 *  statt eines Datums-Sets, weil der einzige Aufrufer (ui/planned.js::
 *  _renderDoneCard, die einzige Stelle, an der eine Ruhetag-Karte überhaupt
 *  mit einer gefundenen Ist-Fahrt zusammentrifft) das Ride-Match bereits
 *  aufgelöst hat.
 *  @param {{typ?: string|null}} card
 *  @param {boolean} wasRidden
 *  @returns {{severity: "info", message: string} | null} */
export function restDayRiddenSignal(card, wasRidden) {
  if (card?.typ !== "Ruhetag" || !wasRidden) return null;
  return { severity: "info", message: "Ruhetag gefahren — bewusst freier Tag wurde trotzdem trainiert." };
}

/** Kartentypen, die für eine geplante Erholungswoche zählen (D6, docs/
 *  konzept-progressionssteuerung.md) — `Ruhetag` (bewusst frei) UND
 *  `Z1 Recovery` (Z1-Ausfahrt, D6s "recovery"-Rolle). */
const RECOVERY_CARD_TYPES = new Set(["Ruhetag", "Z1 Recovery"]);

/** Ab welchem Anteil Ruhetag-/Z1-Recovery-Karten an den Kartentagen einer
 *  ISO-Woche die Woche als geplante Erholungswoche gilt. */
export const PLANNED_RECOVERY_WEEK_MIN_SHARE = 0.5;

/** Erkennt geplante Erholungswochen direkt aus den Plankarten — bisher hing
 *  das allein an der 3:1-Blockplan-Struktur (core/periodization.js, dort
 *  aber nur für Ist-Fahrten mit `week`/`phase`), eine spontan eingelegte
 *  Ruhewoche war so unsichtbar. Gruppiert nach ISO-Kalenderwoche (derselbe
 *  Schlüsselraum wie `plan_cards.week`, s. core/plan-drag.js::weekLabelForDate)
 *  und zählt eine Woche als Erholungswoche, wenn der Anteil Ruhetag-/
 *  Z1-Recovery-Karten an ihren (nicht ausgefallenen) Kartentagen
 *  `PLANNED_RECOVERY_WEEK_MIN_SHARE` erreicht.
 *  @param {Array<{date: string, typ?: string|null, cancelled?: boolean}>} cards
 *  @returns {Set<string>} Menge betroffener ISO-Wochenschlüssel */
export function plannedRecoveryWeeks(cards) {
  const byWeek = new Map();
  for (const c of cards || []) {
    if (c.cancelled || !c.date) continue;
    const key = isoWeekKey(c.date);
    if (!byWeek.has(key)) byWeek.set(key, []);
    byWeek.get(key).push(c);
  }
  const result = new Set();
  for (const [week, weekCards] of byWeek) {
    const recoveryCount = weekCards.filter((c) => RECOVERY_CARD_TYPES.has(c.typ)).length;
    if (recoveryCount / weekCards.length >= PLANNED_RECOVERY_WEEK_MIN_SHARE) result.add(week);
  }
  return result;
}
