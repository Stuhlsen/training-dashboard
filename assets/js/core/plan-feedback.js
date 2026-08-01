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
