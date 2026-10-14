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
  TEN_HAAF_2014: "ten-haaf-2014",
  CUNNINGHAM_1980: "cunningham-1980",
  ONEILL_2023: "oneill-2023",
  IOC_REDS_2023: "ioc-reds-2023",
  RETHINKING_EA_2026: "rethinking-ea-2026",
  RUEDA_CORDOBA_2026: "rueda-cordoba-2026",
  EU_ALLERGEN_REG: "eu-allergen-reg",
  STANDARD_BODYFAT: "standard-bodyfat",
  ACSM_AND_2016: "acsm-and-2016",
  DGE_KONIG_2020: "dge-konig-2020",
  KCAL_PER_KG_7700: "7700-kcal-per-kg",
  FAO_WHO_UNU_PAL: "fao-who-unu-pal",
  NEAT_GOSHOZONO_2024: "neat-goshozono-2024",
  BLS_4_0: "bls-4-0",
  USDA_FDC: "usda-fdc",
});

/** @type {ReadonlyArray<Readonly<SourceEntry>>} */
const ENTRIES = [
  {
    key: SOURCE_KEYS.TEN_HAAF_2014,
    title: "ten Haaf T, Weijs PJ: Resting energy expenditure prediction in recreational athletes of 18–35 years",
    link: "PLoS One 2014, https://pmc.ncbi.nlm.nih.gov/articles/PMC4183531/",
    note: "Gewichtsbasierte Gleichung: 11,936·Gewicht[kg] + 587,728·Größe[m] − 8,129·Alter + 191,027·Geschlecht (m=1, f=0) + 29,279 kcal/Tag. Geprüft an 18- bis 35-jährigen Freizeitsportlern. Koeffizienten im Original nur als Bild; hier gegen die Tabelle in O'Neill 2023 übernommen.",
  },
  {
    key: SOURCE_KEYS.CUNNINGHAM_1980,
    title: "Cunningham JJ: A reanalysis of the factors influencing basal metabolic rate in normal adults",
    link: "Am J Clin Nutr 1980;33:2372-2374; Formel 500 + 22 × FFM[kg] nach Tabelle 1 in ten Haaf 2014 (PMC4183531)",
    note: "Braucht gemessene fettfreie Masse. Bei Sportlern streuen Einzelstudien von −16 % bis +10 %, deshalb nur mit gemessenem Körperfett und Plausibilitätsprüfung gegen Ten-Haaf.",
  },
  {
    key: SOURCE_KEYS.ONEILL_2023,
    title: "O'Neill JER, Corish CA, Horner K: Accuracy of resting metabolic rate prediction equations in athletes — systematic review and meta-analysis",
    link: "Sports Med 2023, doi 10.1007/s40279-023-01896-z, https://pmc.ncbi.nlm.nih.gov/articles/PMC10687135/",
    note: "Mifflin-St-Jeor liegt bei Sportlern signifikant daneben (gilt nur für die Allgemeinbevölkerung, ersetzt); Ten-Haaf am genauesten (80,2 % innerhalb ±10 %, andere 41–64 %).",
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
  {
    key: SOURCE_KEYS.FAO_WHO_UNU_PAL,
    title:
      "Human energy requirements: Report of a Joint FAO/WHO/UNU Expert Consultation (Energy requirements of adults, PAL-Kategorien)",
    link: "https://www.fao.org/4/y5686e/y5686e07.htm",
    note: "Alltag ohne regelmäßigen Sport: PAL (Gesamtverbrauch ÷ Grundumsatz) 1,40–1,69, typischer Mittelwert ca. 1,55–1,65. Wir nehmen 1,55 (Näherung, echte Spanne 1,40–1,69). Das Training wird getrennt addiert, deshalb gilt der Wert für einen Alltag ohne Sport.",
  },
  {
    key: SOURCE_KEYS.NEAT_GOSHOZONO_2024,
    title:
      "Goshozono et al.: Characteristics of non-exercise activity thermogenesis in male collegiate athletes under real-life conditions. Front Sports Act Living 2024",
    link: "https://pmc.ncbi.nlm.nih.gov/articles/PMC10896989/",
    note: "Plausibilitäts-Gegenprobe zum PAL: Alltagsverbrauch ohne Sport ca. 10,4 kcal/kg/Tag (33 junge Männer, Beschleunigungssensor, kleine Stichprobe). Kein Rechenwert in der App.",
  },
  {
    key: SOURCE_KEYS.BLS_4_0,
    title: "Bundeslebensmittelschlüssel (BLS), Version 4.0",
    link: "Max Rubner-Institut (2025): Bundeslebensmittelschlüssel (BLS), Version 4.0, DOI 10.25826/Data20251217-134202-0, https://blsdb.de",
    note: "Nährwerte der Rezept-Zutaten (Energie, Eiweiß, Kohlenhydrate, Fett je 100 g). Kostenfrei, App-Nutzung laut blsdb.de/faq erlaubt. Rezept-Nährwerte sind aus den Zutaten gerechnet, nicht gemessen; Hersteller- und Rezeptvarianten können abweichen.",
  },
  {
    key: SOURCE_KEYS.USDA_FDC,
    title: "USDA FoodData Central",
    link: "https://fdc.nal.usda.gov",
    note: "Lückenfüller für Zutaten ohne BLS-Eintrag (einzelne Gewürze und Kräuter). Public Domain (CC0), Nennung erwünscht.",
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