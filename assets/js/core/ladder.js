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
   threshold-long ist nicht volumen-monoton (T2 > T3), vo2-short/vo2-long/
   sprint-accessory folgen einer "Zickzack"-Progression zwischen den Achsen
   (mal primär, mal sekundär erhöht), die ein Kreuzprodukt nicht abbildet,
   over-under hat laut Konzept ohnehin eine abweichende Achsenrangfolge.
   Alle sechs Startformate sind deshalb `explicitSteps` (Migration 0014) —
   der Generator bleibt für künftige, neu angelegte Formate nutzbar (D4.2:
   "eine neue Bauform braucht keine Code-Änderung mehr, nur einen
   Katalogeintrag").
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
