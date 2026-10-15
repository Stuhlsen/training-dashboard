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
 * @property {"primaer"|"sekundaer"|"unbelegt"} status  Herkunft, s. ZONE_SOURCE_STATUS
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
  BISHOP_2025: "bishop-2025",
  FERNANDES_2024: "fernandes-2024",
  SWIMMING_CANADA_2024: "swimming-canada-2024",
  HR_PCT_UNBELEGT: "hr-pct-unbelegt",
});

/** @type {ReadonlyArray<Readonly<ZoneSourceEntry>>} */
const ENTRIES = [
  {
    key: ZONE_SOURCE_KEYS.COGGAN_POWER_LEVELS,
    title: "Coggan A: Power training levels (TrainingPeaks, Stand 18.07.2026)",
    link: "https://www.trainingpeaks.com/learn/articles/power-training-levels/",
    note: "Bedeutung, typische Dauer und Empfindung der Leistungsstufen 1–5 (Z1 Recovery bis Z5 VO2max). Der Artikel enthält auch eine Herzfrequenz-Spalte (Z1 <68, Z2 69–83, Z3 84–94, Z4 95–105, Z5 >106); worauf sich die Prozente beziehen, steht dort nicht, der Text spricht von 'threshold HR' statt HFmax. Der Artikel nennt keine Buchausgabe; die Originalstelle in 'Training and Racing with a Power Meter' wurde nicht geöffnet. Die %-FTP-Grenzen im Code (core/zones.js) sind maßgeblich.",
  },
  {
    key: ZONE_SOURCE_KEYS.SEILER_2010,
    title: "Seiler S: What is best practice for training intensity and duration distribution in endurance athletes?",
    link: "Int J Sports Physiol Perform 2010;5(3):276-291, doi 10.1123/ijspp.5.3.276",
    note: "Abstract geprüft: Bei national und international erfolgreichen Ausdauersportlern (10–13 Einheiten pro Woche) liegen etwa 80 % der Einheiten im niedrigen Bereich (2 mM Laktat), etwa 20 % sind von Hochintensitätsarbeit geprägt. Volltext geprüft: Die Zahl bezieht sich auf Einheiten, nicht auf Zeit, und auf Leistungssportler. Für untrainierte und Freizeitsportler sei die 2-mM-Schwelle schwer zu bestimmen (unveröffentlichte Beobachtung) — die 80 % sind für Einsteiger also nicht belegt.",
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
    key: ZONE_SOURCE_KEYS.BISHOP_2025,
    title: "Bishop DJ et al.: Physical Activity and Exercise Intensity Terminology — ACSM Expert Statement and ESSA Consensus Statement",
    link: "Med Sci Sports Exerc 2025;57(11):2599-2613, doi 10.1249/MSS.0000000000003795",
    url: "https://doi.org/10.1249/MSS.0000000000003795",
    note: "Volltext geprüft: Feste Prozente von Maximalwerten (%VO2max, %HRmax, %HRR) führen dazu, dass Personen in unterschiedlichen Intensitätsbereichen trainieren; bei 80 % HFmax liegt etwa die Hälfte über und die Hälfte unter der ersten Stoffwechselschwelle. %HFmax-Zonen sind also nur ein grober Richtwert.",
  },
  {
    key: ZONE_SOURCE_KEYS.FERNANDES_2024,
    title: "Fernandes RJ, Carvalho DD, Figueiredo P: Training zones in competitive swimming: a biophysical approach",
    link: "Front Sports Act Living 2024;6:1363730, doi 10.3389/fspor.2024.1363730",
    url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC10982397",
    note: "Fünf Schwimm-Zonen (niedrig, moderat, schwer, sehr schwer, extrem) mit Dauer, Laktat und Puls für Wettkampfschwimmer, z. B. schwer 10–20 min, sehr schwer (Aerobic Power) 3–10 min, extrem unter 2 min. Absolute Pulswerte gelten für Wettkampfschwimmer; die Zuordnung zu den App-Zonen s1–s5 ist eine eigene Interpretation. Aussage 'Schwimm-Puls niedriger' nennt der Artikel nicht.",
  },
  {
    key: ZONE_SOURCE_KEYS.SWIMMING_CANADA_2024,
    title: "Vandenbogaerde T: Swim Training Zone Terminology (Swimming Canada / CSI Pacific)",
    link: "Juni 2024, https://blob.poolq.net/swimnb/files/swimmingcanada-trainingzones-june2024-1.pdf",
    url: "https://blob.poolq.net/swimnb/files/swimmingcanada-trainingzones-june2024-1.pdf",
    note: "Praxisleitfaden eines Verbands, kein Peer-Review. Threshold = höchstes Tempo, das über längere Strecken durchgehalten werden kann; A1 = Technik bei sehr niedriger Intensität. Pulswerte dort als 'Schläge unter Maximum', individuell.",
  },
  {
    key: ZONE_SOURCE_KEYS.HR_PCT_UNBELEGT,
    title: "Prozentwerte der HF-Zonen (% HFmax): übernommene Wahl, nicht belegt",
    link: "",
    note: "Rad (68/83/88/95 %): im Code nur 'unverändert aus der Vanilla-Version übernommen'. Nur Z1 (<68) und die Z1/Z2-Grenze (83) stehen so in Coggans Herzfrequenz-Spalte; Z3–Z5 weichen ab (dort 84–94, 95–105, >106), und der Artikel nennt als Bezug nicht HFmax (er hält die Schwellen-HF für den logischeren Bezug, sagt aber nicht ausdrücklich, worauf die Tabelle sich bezieht). Lauf/Schwimmen (60/70/80/90 %): im Code als 'klassisches Raster' bezeichnet, keine Primärquelle geöffnet. Die Erklärtexte beschreiben deshalb nur die Anstrengung, nennen keine Prozentzahlen und sind kein Beleg für die Grenzen.",
  },
];

/** Klickbare Adressen je Quelle (nur wo stabil und nicht schon im Eintrag). */
const URLS = {
  [ZONE_SOURCE_KEYS.COGGAN_POWER_LEVELS]: "https://www.trainingpeaks.com/learn/articles/power-training-levels/",
  [ZONE_SOURCE_KEYS.SEILER_2010]: "https://doi.org/10.1123/ijspp.5.3.276",
  [ZONE_SOURCE_KEYS.STOGGL_SPERLICH_2015]: "https://doi.org/10.3389/fphys.2015.00295",
};

/** Herkunft je Quelle, damit die UI immer ehrlich zeigen kann, woher ein Wert
 *  kommt: "primaer" = Original (Studie/Autorenartikel) gelesen,
 *  "sekundaer" = nur Zusammenfassung/Leitfaden gelesen, "unbelegt" = übernommene
 *  Wahl ohne Quelle (kein Link, UI zeigt 'nicht belegt'). */
export const ZONE_SOURCE_STATUS = Object.freeze({
  PRIMAER: "primaer",
  SEKUNDAER: "sekundaer",
  UNBELEGT: "unbelegt",
});

const STATUS = {
  [ZONE_SOURCE_KEYS.COGGAN_POWER_LEVELS]: ZONE_SOURCE_STATUS.PRIMAER,
  [ZONE_SOURCE_KEYS.SEILER_2010]: ZONE_SOURCE_STATUS.PRIMAER,
  [ZONE_SOURCE_KEYS.STOGGL_SPERLICH_2015]: ZONE_SOURCE_STATUS.PRIMAER,
  [ZONE_SOURCE_KEYS.OLSTAD_2019]: ZONE_SOURCE_STATUS.PRIMAER,
  [ZONE_SOURCE_KEYS.BISHOP_2025]: ZONE_SOURCE_STATUS.PRIMAER,
  [ZONE_SOURCE_KEYS.FERNANDES_2024]: ZONE_SOURCE_STATUS.PRIMAER,
  [ZONE_SOURCE_KEYS.DANIELS_RUNNING_FORMULA]: ZONE_SOURCE_STATUS.SEKUNDAER,
  [ZONE_SOURCE_KEYS.SWIM_SMOOTH_CSS]: ZONE_SOURCE_STATUS.SEKUNDAER,
  [ZONE_SOURCE_KEYS.SWIMMING_CANADA_2024]: ZONE_SOURCE_STATUS.SEKUNDAER,
  [ZONE_SOURCE_KEYS.HR_PCT_UNBELEGT]: ZONE_SOURCE_STATUS.UNBELEGT,
};

/** @type {ReadonlyArray<Readonly<ZoneSourceEntry>>} */
export const ZONE_SOURCES = Object.freeze(
  ENTRIES.map((e) =>
    Object.freeze({ ...e, ...(URLS[e.key] ? { url: URLS[e.key] } : {}), status: STATUS[e.key] })
  )
);

/** Key→Source-Lookup.
 *  @type {ReadonlyMap<string, Readonly<ZoneSourceEntry>>} */
export const SOURCE_BY_KEY = Object.freeze(new Map(ZONE_SOURCES.map((e) => [e.key, e])));
