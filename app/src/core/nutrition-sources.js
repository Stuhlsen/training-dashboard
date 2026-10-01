/* ============================================================
   CORE/NUTRITION-SOURCES.JS — Kuratierte Quellenliste für
   Ernährungskomponenten (kein I/O)
   (Fahrplan 23, Etappe E1, Entscheidungen E7/E8)

   Einträge sind stabile Referenzen, keine dynamisch geladenen
   Daten — einmal definiert, nie zur Laufzeit erweitert.

   Jeder Eintrag: key (Machine-Key für Rückgabe), title, link,
   note (deutsch, Repo-Konvention).
   ============================================================ */

/**
 * @typedef {Object} SourceEntry
 * @property {string} key
 * @property {string} title
 * @property {string} link
 * @property {string} note
 */

/** Einzige Quelle der Schlüssel: nutrition.js verweist über diese Konstanten,
 *  nicht über getippte Strings (verhindert Drift gegen die Liste).
 *  @type {Readonly<Record<string,string>>} */
export const SOURCE_KEYS = Object.freeze({
  MIFFLIN_ST_JEOR: "mifflin-st-jeor",
  IOC_REDS_2023: "ioc-reds-2023",
  RETHINKING_EA_2026: "rethinking-ea-2026",
  RUEDA_CORDOBA_2026: "rueda-cordoba-2026",
  EU_ALLERGEN_REG: "eu-allergen-reg",
  STANDARD_BODYFAT: "standard-bodyfat",
  ACSM_AND_2016: "acsm-and-2016",
  DGE_KONIG_2020: "dge-konig-2020",
  KCAL_PER_KG_7700: "7700-kcal-per-kg",
});

/** @type {ReadonlyArray<Readonly<SourceEntry>>} */
const ENTRIES = [
  {
    key: SOURCE_KEYS.MIFFLIN_ST_JEOR,
    title: "Mifflin-St-Jeor — Grundumsatzformel",
    link: "Mifflin MD et al., Am J Clin Nutr 1990;51:241-247",
    note: "Standard-Formel zur BMR-Schätzung; Abweichung ±100–400 kcal zum gemessenen Wert.",
  },
  {
    key: SOURCE_KEYS.IOC_REDS_2023,
    title: "IOC Consensus on REDs",
    link: "Mountjoy M et al., Br J Sports Med 2023;57:1073-1097, doi 10.1136/bjsports-2023-106994",
    note: "30 kcal/kg FFM stammt aus Kurzzeit-Laboren mit wenigen untrainierten Frauen; Orientierung, keine Diagnose. Fuer Maenner nennt das Konsensus keinen festen Wert (lower, approx. 9–25 kcal/kg FFM).",
  },
  {
    key: SOURCE_KEYS.RETHINKING_EA_2026,
    title: "Rethinking Energy Availability — from Conceptual Models to Applied Practice",
    link: "PMC12899827, Nutrients 2026",
    note: "Warnt davor, 30 kcal/kg als starres Kriterium zu verwenden.",
  },
  {
    key: SOURCE_KEYS.RUEDA_CORDOBA_2026,
    title: "Rueda-Córdoba et al., Einfluss der FFM-Messmethode",
    link: "Appl Physiol Nutr Metab 2026, PubMed 42091222",
    note: "Die Messmethode für fettfreie Masse verschiebt die Energieverfügbarkeit merklich.",
  },
  {
    key: SOURCE_KEYS.EU_ALLERGEN_REG,
    title: "EU-Allergenverordnung (LMIV, Anhang II)",
    link: "VO (EU) Nr. 1169/2011, Anhang II — 14 Hauptallergene",
    note: "Grundlage der Taxonomie in nutrition-taxonomy.js (Etappe E0, issue #20).",
  },
  {
    key: SOURCE_KEYS.STANDARD_BODYFAT,
    title: "Standard-Körperfett 12 % / 20 %",
    link: "",
    note: "Schätzwert, kein Literaturwert — Annahme bei fehlender Körperfettmessung: Männer 12 %, Frauen 20 %.",
  },
  {
    key: SOURCE_KEYS.ACSM_AND_2016,
    title: "Position of the Academy of Nutrition and Dietetics, Dietitians of Canada, and the ACSM — Nutrition and Athletic Performance",
    link: "Thomas DT, Erdman KA, Burke LM. J Acad Nutr Diet 2016;116:501-528 (auch Med Sci Sports Exerc 2016;48:543-568). doi 10.1016/j.jand.2015.12.006",
    note: "Tägliche Kohlenhydratziele nach Trainingsdauer: 3–5 g/kg (Ruhe/leicht) bis 8–12 g/kg (>4–5 h). Die Einteilung 3–4 h → 6–10 g/kg ist eigene Interpretation (Lücke zwischen ›1–3 h‹ und ›>4–5 h‹ im Original). Intensität wird hier nicht modelliert (bekannte Einschränkung).",
  },
  {
    key: SOURCE_KEYS.DGE_KONIG_2020,
    title: "Position der DGE-Arbeitsgruppe Sporternährung: Kohlenhydrate in der Sporternährung",
    link: "König D et al., Dtsch Z Sportmed 2020;71:253-260",
    note: "Train-Low ist umstritten und keine generelle Empfehlung — daher kein Train-Low / Sleep-Low in dieser Implementierung.",
  },
  {
    key: SOURCE_KEYS.KCAL_PER_KG_7700,
    title: "7700 kcal pro kg Körpermasse",
    link: "",
    note: "Gängige Näherung; überschätzt die Wirkung über längere Zeit (Anpassung des Stoffwechsels), z. B. Hall, Obesity 2024 (doi 10.1002/oby.24027).",
  },
];

/** Gefrorener Array — einmal importiert, nie verändert.
 *  @type {ReadonlyArray<Readonly<SourceEntry>>} */
export const NUTRITION_SOURCES = Object.freeze(
  ENTRIES.map((e) => Object.freeze({ ...e }))
);

/** Key→Source-Lookup.
 *  @type {ReadonlyMap<string, Readonly<SourceEntry>>} */
export const SOURCE_BY_KEY = Object.freeze(
  new Map(NUTRITION_SOURCES.map((e) => [e.key, e]))
);