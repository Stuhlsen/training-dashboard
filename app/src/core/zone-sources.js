/* ============================================================
   CORE/ZONE-SOURCES.JS — Kuratierte Quellenliste für die
   Zonen-Erklärtexte (kein I/O)
   (Fahrplan 24, Etappe E1)

   Aufbau wie core/nutrition-sources.js: stabile Referenzen, einmal
   definiert, nie zur Laufzeit erweitert. Jeder Eintrag: key, title,
   link (Fundstelle als Text), optional url, note (deutsch).

   Einträge OHNE url sind bewusst ehrlich: "nicht belegt" bzw. nur
   über Sekundärquelle geprüft steht dann in `note`.
   ============================================================ */

/**
 * @typedef {Object} ZoneSourceEntry
 * @property {string} key
 * @property {string} title
 * @property {string} link   Zitat/Fundstelle als Text
 * @property {string} [url]  klickbare Adresse, nur wo eine stabile existiert
 * @property {string} note
 */

/** Einzige Quelle der Schlüssel: zone-explanations.js verweist über diese
 *  Konstanten, nicht über getippte Strings.
 *  @type {Readonly<Record<string,string>>} */
export const ZONE_SOURCE_KEYS = Object.freeze({
  COGGAN_POWER_LEVELS: "coggan-power-levels",
  SEILER_2010: "seiler-2010",
  STOGGL_SPERLICH_2015: "stoggl-sperlich-2015",
  DANIELS_RUNNING_FORMULA: "daniels-running-formula",
  SWIM_SMOOTH_CSS: "swim-smooth-css",
  OLSTAD_2019: "olstad-2019",
  HR_PCT_UNBELEGT: "hr-pct-unbelegt",
});

/** @type {ReadonlyArray<Readonly<ZoneSourceEntry>>} */
const ENTRIES = [
  {
    key: ZONE_SOURCE_KEYS.COGGAN_POWER_LEVELS,
    title: "Coggan A: Power training levels (TrainingPeaks, Stand 18.07.2026)",
    link: "https://www.trainingpeaks.com/learn/articles/power-training-levels/",
    note: "Bedeutung, typische Dauer und Empfindung der Leistungsstufen 1–5 (Z1 Recovery bis Z5 VO2max). Der Artikel nennt keine Buchausgabe; die Originalstelle in 'Training and Racing with a Power Meter' wurde nicht geöffnet. Die %-FTP-Grenzen im Code (core/zones.js) sind maßgeblich.",
  },
  {
    key: ZONE_SOURCE_KEYS.SEILER_2010,
    title: "Seiler S: What is best practice for training intensity and duration distribution in endurance athletes?",
    link: "Int J Sports Physiol Perform 2010;5(3):276-291, doi 10.1123/ijspp.5.3.276",
    note: "Abstract geprüft: Bei national und international erfolgreichen Ausdauersportlern (10–13 Einheiten pro Woche) liegen etwa 80 % der Einheiten im niedrigen Bereich (2 mM Laktat), etwa 20 % sind von Hochintensitätsarbeit geprägt. Die Zahl bezieht sich auf Einheiten, nicht auf Zeit, und auf Leistungssportler, nicht auf Einsteiger.",
  },
  {
    key: ZONE_SOURCE_KEYS.STOGGL_SPERLICH_2015,
    title: "Stöggl TL, Sperlich B: The training intensity distribution among well-trained and elite endurance athletes",
    link: "Front Physiol 2015;6:295, doi 10.3389/fphys.2015.00295",
    note: "Übersichtsarbeit: Spitzen-Ausdauersportler trainieren etwa 80 % ihres Trainings niedrigintensiv (unter 2 mM Laktat) und etwa 20 % hochintensiv; Zonenmodell mit drei Zonen. Quelle für die Formulierung 'Anteil am Training'.",
  },
  {
    key: ZONE_SOURCE_KEYS.DANIELS_RUNNING_FORMULA,
    title: "Daniels J: Daniels' Running Formula (E/M/T/I/R-Tempi)",
    link: "Buch; nur über eine Sekundärzusammenfassung geprüft: https://www.coachray.nz/2023/05/03/jack-daniels-running-intensity/",
    url: "https://www.coachray.nz/2023/05/03/jack-daniels-running-intensity/",
    note: "Zweck und typische Dauer je Tempo (Easy, Marathon, Threshold, Interval, Repetition). Das Buch selbst wurde nicht geöffnet — Primärquelle offen, die Angaben stammen aus einer Zusammenfassung. Die Zonengrenzen im Code (sports/running/zones.ts) sind maßgeblich.",
  },
  {
    key: ZONE_SOURCE_KEYS.SWIM_SMOOTH_CSS,
    title: "Swim Smooth: Critical Swim Speed (CSS) und Trainingszonen",
    link: "https://blog.swimsmooth.com/p/understanding-training-zones (Beitrag vom 24.07.2025)",
    url: "https://blog.swimsmooth.com/p/understanding-training-zones",
    note: "Nur grob geprüft: CSS ist die Grundlage der Zonen; die Zonentabelle des Beitrags liegt als Bild vor und war nicht lesbar. Die Zonengrenzen im Code stammen laut Code-Kommentar aus Maglischo (2003), Swimming Fastest — dieses Buch wurde nicht geöffnet.",
  },
  {
    key: ZONE_SOURCE_KEYS.OLSTAD_2019,
    title: "Olstad BH, Bjørlykke V, Schäfer Olstad D: Maximal Heart Rate for Swimmers",
    link: "Sports (Basel) 2019;7(11):235, doi 10.3390/sports7110235",
    url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC6915385/",
    note: "12 junge Spitzenschwimmer (Ø 18,8 Jahre): Höchstpuls beim Schwimmen 6,7 ± 5,3 bpm niedriger als beim Laufen (beim Rad 5,7 ± 6,5 bpm, nicht signifikant). Die Autoren raten wegen der großen Streuung zu einem eigenen Test statt einer festen Korrektur. Der Code-Kommentar '~10 bpm' (sports/swimming/metrics.ts) ist damit NICHT belegt.",
  },
  {
    key: ZONE_SOURCE_KEYS.HR_PCT_UNBELEGT,
    title: "Prozentwerte der HF-Zonen (% HFmax): übernommene Wahl, nicht belegt",
    link: "",
    note: "Rad (68/83/88/95 %): im Code nur 'unverändert aus der Vanilla-Version übernommen', keine Quelle gefunden. Lauf/Schwimmen (60/70/80/90 %): im Code als 'klassisches Raster' bezeichnet, keine Primärquelle geöffnet. Die Erklärtexte beschreiben deshalb nur die Anstrengung, nennen keine Prozentzahlen und sind kein Beleg für die Grenzen.",
  },
];

/** Klickbare Adressen je Quelle (nur wo stabil und nicht schon im Eintrag). */
const URLS = {
  [ZONE_SOURCE_KEYS.COGGAN_POWER_LEVELS]: "https://www.trainingpeaks.com/learn/articles/power-training-levels/",
  [ZONE_SOURCE_KEYS.SEILER_2010]: "https://doi.org/10.1123/ijspp.5.3.276",
  [ZONE_SOURCE_KEYS.STOGGL_SPERLICH_2015]: "https://doi.org/10.3389/fphys.2015.00295",
};

/** @type {ReadonlyArray<Readonly<ZoneSourceEntry>>} */
export const ZONE_SOURCES = Object.freeze(
  ENTRIES.map((e) => Object.freeze(URLS[e.key] ? { ...e, url: URLS[e.key] } : { ...e }))
);

/** Key→Source-Lookup.
 *  @type {ReadonlyMap<string, Readonly<ZoneSourceEntry>>} */
export const SOURCE_BY_KEY = Object.freeze(new Map(ZONE_SOURCES.map((e) => [e.key, e])));
