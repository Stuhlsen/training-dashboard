---
name: chart-labels
description: Chart-Label-, Datums- und Merge-Konventionen für app/src/charts und Chart-Komponenten in app/src/features/*. Überlappungsschutz für Achsen-/Wert-Labels, DD.MM-Datumsformat, "neue Auswertung in bestehendes Chart" statt neuer Box. Nutzen, wenn ein Chart geändert oder neu angelegt wird.
---

# Chart-Label-Konvention (Überlappungsschutz)

X-Achsen- und Wert-Labels NIEMALS pro Datenpunkt/Balken ohne Ausdünnung
zeichnen — bei Athlet 2 (30+ Kalenderwochen) überlappt sonst die Achse.
Pflicht für jedes Chart mit variabler Datenmenge:

- `pickLabelIndices(xs, minPx)` aus `app/src/core/chart-scale.js` (pure,
  getestet in `chart-scale.test.js`): Mindestabstand, letzter Punkt garantiert
  und kollisionsfrei. Richtwerte: 40px für Wochen-Balken, 55–60px für Datums-Labels.
- Wochen-Keys über `weekDisplayLabels()` (`app/src/core/week-labels.js` bzw.
  `aggregate.js`) kürzen ("2026-KW27" → "KW27", Jahreswechsel wird markiert,
  Monate → "MM/JJ").
- Wert-Labels auf Balken bei Pitch < ~22px nur auf den Label-Indizes zeichnen;
  In-Balken-Labels zusätzlich per Balkenbreite gaten (siehe Wetter-Chart).
- Keine "Modulo-Step + letzter immer"-Guards mehr — die erzeugen End-Kollisionen.
- Segment-/Phasen-Labels an Divider-Linien zentriert im eigenen Segment
  zeichnen, nie an den Rändern der Divider-Linie (zwei benachbarte Rand-Labels
  kollidieren, sobald ein Segment schmal wird — z. B. eine kurze Übergangswoche).
  Die Vanilla-Fassung hatte dafür ein `fitsLabel(spanPx, text)` in `ui/charts/base.js`
  — **nicht mit nach `app/src/core/chart-scale.js` portiert** (`CompareChart.tsx`
  verzichtet laut eigenem Kommentar bewusst auf eine `fitsLabel()`-Segment-
  beschriftung mitten in der Kurve). Vor einer Änderung an Divider-Labels im
  React-Code prüfen, ob das Kollisionsproblem dort überhaupt noch auftreten kann
  (z. B. weil die Divider selbst mit dem Umbau „Plan 1/2 → Kalenderwoche"
  entfallen sind) und ggf. neu entscheiden, statt eine nicht vorhandene Funktion
  vorauszusetzen.
- Mehrzeilige SVG-Texte (z. B. per `wrapText()`) grundsätzlich gegen die
  viewBox-Höhe absichern — der SVG-Root clippt Inhalt außerhalb der
  viewBox standardmäßig, eine zu tief platzierte zweite Zeile ist dann
  unsichtbar statt nur falsch positioniert. Ein Filter wie
  `lines.filter((_, i) => y(i) <= H - 4)` ist nur dann wirklich dynamisch,
  wenn `y(i)` unabhängig von einer Konstante prüfbar bleibt — bei fixer
  Chart-Höhe (`H` lokal hartkodiert) kann so ein Filter unbemerkt zu einem
  festen Zeilenlimit degenerieren. Einfacher und ehrlicher: wenn ohnehin
  nur eine Zeile Platz hat (wie im HRV/RHF-Hinweis), explizit nur die
  erste `wrapText()`-Zeile zeichnen statt mit einer Pseudo-Dynamik zu tun,
  als würde mehr passen.

# Datumsformat (Charts)

Einheitlich **DD.MM** für Achsen-/Label-Text (`fmtDate(iso)`, `app/src/core/format.js`)
und **DD.MM.JJJJ** für Tooltips, wo das Jahr zur Eindeutigkeit gebraucht wird
(`fmtDateFull(iso)`, `app/src/core/format.js`) — DD.MM ist die Mehrheitskonvention im
restlichen Dashboard (Fahrtenbuch, `normalizeRide`/`normalizeWellness`).
Achsenlabels über `fmtDate()` erzeugen, nicht `iso.split("-")`/`iso.slice(5)`
selbst zusammensetzen — das bleibt gültig, auch wenn die einzelnen Charts
seit dem React-Umbau eigene `<text>`-Elemente statt einer gemeinsamen
`xLabel()`-Zeichenfunktion verwenden (Font-Größe/-Ausrichtung über gemeinsame
Konstanten in `app/src/charts/`, nicht mehr über einen einzigen Helper).

# Chart-Merge-Konvention

Neue Auswertungen möglichst in bestehende Charts integrieren statt neue Boxen
anzulegen (Chart-Masse begrenzen): Belastungswächter lebt IM TRIMP-Chart
(`TrimpLoadChart.tsx`, Ramp-Linie + ⚠), EF-Trend IM Effizienz-Chart
(`EfficiencyChart.tsx`), Blockvergleich IM Power-Curve-Chart (`PowerCurveChart.tsx`,
Toggle), Kadenz-Coach als Chips ÜBER dem Kadenz-Chart (`CadenceChart.tsx`). Der
Konsistenzkalender (`ConsistencyCalendar.tsx`) hat die Wochentags-Heatmap ERSETZT
(Wochentagszähler in den Zeilenlabels). Explainer-Texte bei Chart-Änderungen immer
mitziehen — sie leben jetzt als Teil der jeweiligen Feature-Komponente
(`app/src/features/*`, für beide Athleten-Varianten prüfen), nicht mehr zentral
in `index.html`/`app.js`.
