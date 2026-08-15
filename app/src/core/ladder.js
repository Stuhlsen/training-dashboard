/* ============================================================
   CORE/LADDER.JS — Formatkatalog: Leiterstufen aus session_formats.axes
   (Progressionssteuerung — docs/konzept-progressionssteuerung.md D4, L1–L8)

   Zwei Formen von `axes` (Architekturentscheidung Fenster D, s. Bericht
   "selbst entschieden" — im Konzept nur die parametrische Form (D4.2)
   spezifiziert): parametrisch `{primary, secondary, tertiary?}` oder
   aufgezählt `{explicitSteps: [...]}`. Ein Katalogeintrag hat genau eine
   der beiden Formen — resolveSteps() liest beide gleich in eine
   einheitliche, geordnete Stufenliste auf.

   generateLadderSteps() wurde gegen die Startbelegung L2–L6 abgeglichen
   (Fenster-D-Auftrag, "Abgleich vor dem Commit"): keines der sechs Formate
   reproduziert sich aus einem reinen primary×secondary-Kreuzprodukt —
   sweetspot-long nutzt bei S5/S8 reps=2/duration=30min (außerhalb der in
   D4.2 vorgegebenen Achsenwerte primary:[3,4]/secondary:[600..1200]),
   threshold-long enthält mit T2→T3 denselben bewussten Achsenwechsel wie
   S5 bei sweetspot-long (4×8 [32min] → 2×15 [30min]: Gesamtvolumen sinkt
   leicht, Einzelintervalllänge UND Intensität steigen — kein
   Generierungsfehler, sondern dieselbe Bauart, nur in der ursprünglichen
   Konzepttabelle nicht als solche kommentiert), vo2-short/vo2-long/
   sprint-accessory folgen einer "Zickzack"-Progression zwischen den Achsen
   (mal primär, mal sekundär erhöht), die ein Kreuzprodukt nicht abbildet,
   over-under hat laut Konzept ohnehin eine abweichende Achsenrangfolge.
   Alle sechs Startformate sind deshalb `explicitSteps` (Migration 0014) —
   der Generator bleibt für künftige, neu angelegte Formate VORGESEHEN
   (D4.2: "eine neue Bauform braucht keine Code-Änderung mehr, nur einen
   Katalogeintrag").

   **generateLadderSteps() ist UNERPROBT** — er reproduziert null von
   sechs realen Formaten (s. oben) und hat bisher keinen einzigen echten
   Anwendungsfall bestanden. Das B7-Ziel ("neue Bauform ohne Code-
   Änderung") ist über `explicitSteps` bereits vollständig erfüllt; der
   Generator ist Spekulation für ein hypothetisches künftiges Format mit
   sauberem Gitter, keine erprobte Alternative. Nicht als validierten Pfad
   behandeln, ohne ihn an einem echten neuen Format zu prüfen.
   ============================================================ */

function isPlainObject(v) {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * "Aktuell gültige" Stufe eines Formats aus der ladder_history (D2,
 * Migration 0015) — Eintrag mit dem größten `validFrom <= todayISO` für
 * dieses `formatId`, oder `null`, wenn keiner zutrifft (noch keine
 * Fortschreibung/Ersteinstufung). Gegenstück zu
 * core/ftp-history.js::currentFtpEntry, nur zusätzlich nach `formatId`
 * gefiltert, weil ein Athlet mehrere Formate parallel führt (L1.1).
 * @param {Array<{formatId:string, step:number, validFrom:string}>} history
 * @param {string} formatId
 * @param {string} todayISO ISO-Datum (bewusst kein Default hier — anders
 *  als currentFtpEntry importiert core/ladder.js nicht core/format.js, um
 *  bei künftigen Diff-Läufen des Generators keine unnötige Abhängigkeit zu
 *  tragen; Aufrufer aus state/ übergeben `localISODate()` explizit)
 * @returns {{formatId:string, step:number, validFrom:string}|null}
 */
export function currentLadderStep(history, formatId, todayISO) {
  const applicable = (history || []).filter((e) => e.formatId === formatId && e.validFrom <= todayISO);
  if (!applicable.length) return null;
  return applicable.reduce((a, b) => (b.validFrom > a.validFrom ? b : a));
}

/**
 * Aktive Sperre eines Formats (D4b Schritt 2, "lockWeeks" aus
 * core/ladder-progression.js::presetAction() "reduce" tatsächlich
 * durchsetzen) — das späteste `lockedUntil` unter den Einträgen dieses
 * Formats, das noch nicht verstrichen ist (`>= todayISO`), sonst `null`.
 * Mehrere Einträge mit aktiver Sperre sind möglich (z. B. zwei
 * aufeinanderfolgende Abstufungen) — das späteste Datum gewinnt, nicht das
 * neueste `validFrom` (anders als currentLadderStep: hier zählt, wie lange
 * die Sperre nachwirkt, nicht welcher Eintrag zuletzt geschrieben wurde).
 * @param {Array<{formatId:string, lockedUntil?:string|null}>} history
 * @param {string} formatId
 * @param {string} todayISO
 * @returns {string|null}
 */
export function activeLockUntil(history, formatId, todayISO) {
  const locks = (history || [])
    .filter((e) => e.formatId === formatId && e.lockedUntil && e.lockedUntil >= todayISO)
    .map((e) => e.lockedUntil);
  if (!locks.length) return null;
  return locks.reduce((a, b) => (b > a ? b : a));
}

/**
 * Jüngste Fahrt mit einer Compliance-Ampel für ein Format (D4b Schritt 3,
 * Verdrahtung ins Export-Panel) — die Ride↔Format-Brücke
 * (`ride.compliance.matchedFormatId`, core/session-format-match.js/
 * scripts/lib/compliance.js) macht das erst möglich. Liefert `{rating, rpe}`
 * für state/export.js::buildClaudeExport(), das daraus den `ctx` für
 * state/ladder.js::getPresetSuggestion() baut — reine Funktion auf bereits
 * geladenen Ride-Objekten, kein I/O.
 * @param {Array<{dateISO?:string, date?:string, rpe?:number|null, compliance?:{matchedFormatId?:string, rating?:string}}>} rides
 * @param {string} formatId
 * @returns {{rating:string|null, rpe:number|null}|null}
 */
// Notion-Fahrten (Plan 1) bekommen serverseitig nie ein `compliance`-Feld
// (keine Segmentstruktur) — der matchedFormatId-Filter unten schließt sie
// dadurch bereits de facto aus, kein zusätzlicher dataSource-Filter nötig
// (Fahrplan 1, Fenster V3).
export function lastComplianceForFormat(rides, formatId) {
  const matches = (rides || []).filter((r) => r.compliance?.matchedFormatId === formatId);
  if (!matches.length) return null;
  const latest = matches.reduce((a, b) => ((b.dateISO || b.date) > (a.dateISO || a.date) ? b : a));
  return { rating: latest.compliance.rating ?? null, rpe: latest.rpe ?? null };
}

/**
 * UNERPROBT (s. Kopfkommentar) — reproduziert keines der sechs L2–L6-
 * Startformate, alle laufen als `explicitSteps`. Nur für hypothetische
 * künftige Formate mit sauberem primary×secondary-Gitter gedacht, noch an
 * keinem realen Fall geprüft.
 *
 * Kreuzprodukt aus axes.primary × axes.secondary (primäre Achse äußere
 * Schleife — D4.2: "primäre und sekundäre Achse zuerst"). axes.tertiary
 * (falls vorhanden) wird NUR an die letzte (voll-volumige) Kombination
 * angehängt und trägt `gate` zur Kennzeichnung — die eigentliche
 * Gate-Auswertung ("zweimal grün", C3) ist Aufgabe der Fortschreibung
 * (core/ladder-progression.js), nicht dieses Generators.
 * @param {{primary:{name:string,values:number[]}, secondary:{name:string,values:number[]},
 *   tertiary?:{name:string,values:number[],gate?:string}}} axes
 * @returns {Array<Record<string, number|string|null>>} flache, geordnete Liste
 */
export function generateLadderSteps(axes) {
  if (!isPlainObject(axes) || !isPlainObject(axes.primary) || !isPlainObject(axes.secondary)) return [];
  const primaryValues = Array.isArray(axes.primary.values) ? axes.primary.values : [];
  const secondaryValues = Array.isArray(axes.secondary.values) ? axes.secondary.values : [];
  const steps = [];
  for (const p of primaryValues) {
    for (const s of secondaryValues) {
      steps.push({ [axes.primary.name]: p, [axes.secondary.name]: s });
    }
  }
  if (isPlainObject(axes.tertiary) && Array.isArray(axes.tertiary.values) && steps.length) {
    const last = steps[steps.length - 1];
    for (const t of axes.tertiary.values) {
      steps.push({ ...last, [axes.tertiary.name]: t, gate: axes.tertiary.gate ?? null });
    }
  }
  return steps;
}

/**
 * Geordnete Stufenliste eines Katalogeintrags — liest `explicitSteps`
 * direkt oder generiert aus `primary`/`secondary`/`tertiary` (D4.2).
 * @param {{axes?: Object}|null|undefined} format
 * @returns {Array<Object>}
 */
export function resolveSteps(format) {
  const axes = format?.axes;
  if (!isPlainObject(axes)) return [];
  if (Array.isArray(axes.explicitSteps)) return axes.explicitSteps;
  return generateLadderSteps(axes);
}

/**
 * Stufe 1-indexiert (wie im Konzept, S1/T1/…) — außerhalb des gültigen
 * Bereichs liefert `null` (der Aufrufer entscheidet, ob das eine Sperre ist).
 * @param {{axes?: Object}|null|undefined} format @param {number} step
 * @returns {Object|null}
 */
export function stepAt(format, step) {
  const steps = resolveSteps(format);
  return steps[step - 1] ?? null;
}

/**
 * Die beiden Nachbarstufen (L8: "die zwei Nachbarstufen"), `null` an den
 * Rändern der Leiter statt außerhalb hineinzulesen.
 * @param {{axes?: Object}|null|undefined} format @param {number} step
 * @returns {{prev: Object|null, next: Object|null}}
 */
export function neighborSteps(format, step) {
  return { prev: stepAt(format, step - 1), next: stepAt(format, step + 1) };
}

/**
 * Kurzform für E1/Briefing, z. B. "Sweet Spot lang · Stufe S3 (3×15)".
 * Jede aufgezählte Stufe trägt `id`/`structureLabel`; generierte Stufen
 * (künftige Formate) fallen auf eine numerische Beschriftung zurück.
 * @param {{label?: string}|null|undefined} format
 * @param {{id?: string, structureLabel?: string}|null} stepData
 * @param {number} step
 * @returns {string}
 */
export function formatSummary(format, stepData, step) {
  const formatLabel = format?.label ?? "–";
  if (!stepData) return `${formatLabel} · Stufe ${step} (unbekannt)`;
  const stepLabel = stepData.id ? `Stufe ${stepData.id}` : `Stufe ${step}`;
  return stepData.structureLabel ? `${formatLabel} · ${stepLabel} (${stepData.structureLabel})` : `${formatLabel} · ${stepLabel}`;
}
