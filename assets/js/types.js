/* ============================================================
   TYPES.JS — Zentrale JSDoc-Typdefinitionen
   Kein Laufzeit-Code. Wird von jsconfig.json ("checkJs") genutzt,
   damit der Editor Typfehler anzeigt — ohne Build-Step.
   ============================================================ */

/**
 * Eine einzelne Fahrt, wie sie in data/rides.json liegt und vom
 * Frontend konsumiert wird.
 * @typedef {Object} Ride
 * @property {number} [id]
 * @property {string} dateISO      ISO-Datum (YYYY-MM-DD)
 * @property {string} [date]       Roh-Datum aus der Quelle (identisch zu dateISO)
 * @property {string} [dateShort]  DD.MM für Anzeige
 * @property {string} [startTime]  start_date_local aus intervals.icu (Tiebreaker)
 * @property {string} [week]       Notion-Plan-Woche ("W1", …, historisch) oder
 *                                  ISO-Kalenderwoche ("2026-KW31", seit dem Umbau
 *                                  "Plan 1/2 → Kalenderwoche") — fehlt bei Vergleichsdaten
 * @property {string|null} [phase]
 * @property {string} [dataSource]  "notion" | "intervals" — Herkunft der Rohdaten,
 *                                  athletenunabhängig (Athlet 1 Notion-Ära vs.
 *                                  intervals.icu-Ära; Athlet 2 immer "intervals")
 * @property {string} [name]
 * @property {string} [typ]           Anzeige-Typ (Priorität: subjective > Plan > IF-Ableitung,
 *                                     s. typSource) — unverändert gegenüber Vor-typSource-Ära
 * @property {string|null} [typPlanned]   Typ der Plankarte dieses Tages, sonst null
 * @property {string|null} [typDetected]  Ergebnis der datenbasierten Ist-Typerkennung
 *                                         (core/session-classify.js::classifySession),
 *                                         unabhängig von `typ` — null bei zu dünner
 *                                         Datenlage (z.B. keine Leistungsdaten)
 * @property {{type:string|null, confidence:"hoch"|"mittel"|"niedrig",
 *   signals:Array<{label:string,value:string|number|null,note?:string}>,
 *   rule:string}} [typDetection]  Volles Klassifikations-Ergebnis (Begründung
 *                                  für die Anzeige) — `typDetected` ist nur dessen `type`
 * @property {"subjective"|"plan"|"inferred"|"detected"} [typSource] Herkunft von `typ`
 *                                  (aktuell nie "detected" — Konsumenten stellen
 *                                  einzeln und bewusst um, s. AGENTS.md/Fahrplan)
 * @property {RideCompliance} [compliance] Soll-Ist-Matching gegen die zugehörige
 *                                  Plankarte (core/compliance-match.js), nur bei
 *                                  echtem Match gesetzt — sonst kein Feld (s. dort)
 * @property {number|null} [km]
 * @property {number|null} [min]
 * @property {number|null} [kmh]
 * @property {number|null} [hf]
 * @property {number|null} [hfMax]
 * @property {number|null} [kad]
 * @property {number|null} [watt]
 * @property {number|null} [np]
 * @property {number|null} [ftpWatt]
 * @property {number|null} [trimp]
 * @property {number|null} [tss]
 * @property {number|null} [ctl]
 * @property {number|null} [atl]
 * @property {number|null} [tsb]
 * @property {number|null} [decoupling]
 * @property {number|null} [ruhepuls]
 * @property {number|null} [hrv]
 * @property {string|null} [feel]        Manuelles Befinden (Fahrtenbuch-Dropdown, subjective.json)
 * @property {string} [feelCls]
 * @property {number|null} [rpe]         Perceived Exertion, vom Athleten in intervals.icu eingetragen
 * @property {number|null} [feelIcu]     Feel-Skala aus intervals.icu (nicht zu verwechseln mit `feel`)
 * @property {number|null} [efficiency]  Watt pro Herzschlag (berechnet)
 * @property {Object|null} [weather]
 * @property {string|null} [wetter]
 * @property {Array<number|{id: string, secs: number}>|null} [zoneTimes] Zeit je Leistungszone (intervals.icu)
 * @property {number|null} [eftp] eFTP zum Fahrtzeitpunkt (intervals.icu)
 */

/**
 * Ergebnis des Soll-Ist-Matchings gegen die zugehörige Plankarte
 * (core/compliance-match.js::computeCompliance, D3 in
 * docs/konzept-progressionssteuerung.md). Nur vorhanden, wenn eine
 * matchbare Karte (workout_structure, nicht ausgefallen, kein rest) UND
 * bereits gecachte Segmente für die Fahrt existierten.
 * @typedef {Object} RideCompliance
 * @property {string} matchedCardId          plan_cards.id der gematchten Karte
 * @property {number} plannedZoneTime_s      Soll-Zeit in Zone (set) bzw. Soll-Over-Zeit (alternating), Sekunden
 * @property {number} actualZoneTime_s       tatsächliche Zeit/Over-Zeit, Sekunden
 * @property {number} intervalsPlanned       Anzahl geplanter matchbarer Einheiten (set-Reps + alternating-Reps)
 * @property {number} intervalsCompleted     davon als erfüllt gewertet
 * @property {number} fadePct                mittlere Leistung letztes vs. erstes beobachtetes Intervall, in %
 * @property {"green"|"yellow"|"red"} rating
 * @property {string} rule                   auslösende Bedingung im Klartext (Regelcode)
 */

/**
 * Ein Wellness-Tag (Schlaf, HRV, Ruhepuls) aus intervals.icu.
 * @typedef {Object} WellnessDay
 * @property {string} date
 * @property {string} [dateISO]
 * @property {string} [dateShort]
 * @property {number|null} [sleepHours]
 * @property {number|null} [sleepScore]      gemessener Schlafqualitäts-Score (intervals.icu `sleepScore`), nicht die Dauer
 * @property {number|null} [avgSleepingHR]
 * @property {number|null} [restingHR]
 * @property {number|null} [hrv]
 * @property {number|null} [weight]          kg (Apple Health → intervals.icu)
 * @property {number|null} [bodyFat]         %
 * @property {number|null} [activeEnergy]     aktiv verbrannte kcal (Apple Health)
 * @property {number|null} [restingEnergy]    Grundumsatz-kcal (Apple Health)
 * @property {number|null} [kcalConsumed]     aufgenommene kcal (Zufuhr)
 * @property {number|null} [hydration]       Hydrations-Score (intervals.icu)
 * @property {number|null} [hydrationVolume] ml
 * @property {number|null} [eftp]            eFTP (Ride) aus Wellness-sportInfo
 */

/**
 * Letztes Update je Readiness-Metrik (core/readiness.js) — ein Kalenderdatum,
 * KEIN Wall-Clock-Zeitstempel: intervals.icu liefert pro Wellness-Feld keine
 * Uhrzeit, nur Tagesgranularität (siehe scripts/lib/wellness.js::lastFieldDates).
 * @typedef {Object} WellnessMeta
 * @property {Object} lastUpdated
 * @property {string|null} lastUpdated.hrv
 * @property {string|null} lastUpdated.restingHR
 * @property {string|null} lastUpdated.sleepHours
 */

/**
 * Wochen-Aggregat aus core/aggregate.js.
 * @typedef {Object} WeekAggregate
 * @property {string} week
 * @property {string|null} phase
 * @property {number} rides
 * @property {number} km
 * @property {number} min
 * @property {number} trimp
 * @property {number|null} avgHF
 * @property {number|null} avgKad
 * @property {number|null} avgEff
 */

/**
 * Einheitlicher Fehler in Result-Objekten.
 * Codes: "HTTP" | "NETWORK" | "TOKEN_INVALID" | "SCHEMA" | "NO_DATA" | "UNKNOWN"
 * @typedef {Object} AppError
 * @property {string} code
 * @property {string} message
 * @property {unknown} [cause]
 */

/**
 * Einheitlicher Rückgabetyp für fehlbare Operationen (Laden, Schreiben, API-Calls).
 * Statt gemischter String-Rückgaben: immer { ok } prüfen, bei !ok liegt error vor.
 * @typedef {Object} Result
 * @property {boolean} ok
 * @property {AppError} [error]  Nur gesetzt wenn ok === false
 * @property {boolean} [skipped]  Nur bei ok === true: Operation war idempotent
 *   ohne Wirkung (z.B. Wahoo-Push übersprungen, weil das Workout für dieses
 *   Datum bereits existiert) — kein Fehler, aber vom UI abweichend anzuzeigen.
 */

/**
 * Ergebnis von Data.load(): Result plus Herkunft der Daten.
 * @typedef {Result & { source: "json"|"static"|"none", updated?: string }} LoadResult
 */

export {};
