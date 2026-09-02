/* ============================================================
   CHARTS/TRACE-CARD-AXIS.TS — reine Achsen-/Fenster-Helfer für TraceCard.tsx.
   Bewusst als eigenes Modul (kein Component-Export), damit sie ohne
   `react-refresh/only-export-components`-Warnung testbar sind.
   ============================================================ */

export interface DayTick {
  index: number;
  label: string;
}

/** Mindestbreite des Zeitfensters in Tagen. Ohne das würde ein sehr kurzes
 *  Fenster (neuer Athlet, nur ein paar Tage Daten) über die volle Kartenbreite
 *  gezerrt — `preserveAspectRatio="none"` streckt 2–3 Punkte auf 900 Einheiten.
 *  Mit der Untergrenze sitzen die Punkte linksbündig in natürlicher
 *  Tagesdichte, rechts bleibt leerer Raum statt Streckung. Betrifft nur die
 *  Darstellung; die Daten selbst bleiben unverändert. */
export const MIN_SPAN_DAYS = 21;

/** Effektives Fenster-Ende fürs Zeichnen. Weitet auf MIN_SPAN_DAYS auf,
 *  ABER nur wenn das Fenster die gesamte (kurze) Historie zeigt — von Tag 0
 *  bis ans Datenende (`totalDays - 1`) und trotzdem schmaler als
 *  MIN_SPAN_DAYS. Ein Brush-Zoom in ein Teilfenster (r0 > 0 oder r1 vor dem
 *  Datenende) bleibt unverändert, sonst würde die Brush-Auswahl nicht mehr
 *  zum gezeichneten Fenster passen. */
export function effectiveR1(r0: number, r1: number, totalDays: number): number {
  const wholeSeriesShort = r0 === 0 && r1 >= totalDays - 1 && r1 - r0 < MIN_SPAN_DAYS;
  return wholeSeriesShort ? r0 + MIN_SPAN_DAYS : r1;
}

/** Fünf Achsen-Ticks bei 0/25/50/75/100% des Fensters, "heute"-Marker
 *  unterdrückt Ticks näher als 7% (Handoff „Chart-Label-Konvention"). */
export function buildAxisTicks(
  r0: number,
  r1: number,
  todayIdx: number,
  formatDay: (i: number) => string,
): DayTick[] {
  const span = Math.max(1, r1 - r0);
  const todayFrac = (todayIdx - r0) / span;
  const showsToday = todayIdx >= r0 && todayIdx <= r1;
  return [0, 0.25, 0.5, 0.75, 1]
    .filter((f) => !showsToday || Math.abs(f - todayFrac) > 0.07)
    .map((f) => {
      const index = Math.round(r0 + f * span);
      return { index, label: formatDay(index) };
    })
    // Bei aufgeweitetem Fenster (MIN_SPAN_DAYS über das echte Datenende hinaus)
    // klemmt formatDay mehrere Ticks auf dasselbe letzte Datum — Duplikate
    // entfernen, sonst überlappen zwei gleiche Labels am rechten Rand
    // (Chart-Label-Konvention: keine End-Kollisionen).
    .filter((t, i, arr) => arr.findIndex((o) => o.label === t.label) === i);
}
