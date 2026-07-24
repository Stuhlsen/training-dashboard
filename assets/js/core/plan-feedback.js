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
