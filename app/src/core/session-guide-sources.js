/* ============================================================
   CORE/SESSION-GUIDE-SOURCES.JS — Kuratierte Quellenliste für die
   Trainings-Guides der Trainingskarten (kein I/O)
   (Fahrplan 34, Etappe E1)

   Format und Status-Werte wie core/zone-sources.js, damit die UI
   (SourceList) beide Listen ohne Umbau anzeigt. Zitate stammen aus
   planning/recherche/trainingskarten-erklaeren-belege.md (privat, Stand
   2026-10-23). Quellen-Regel: 2024–2026 zuerst; gibt es nichts Neueres,
   gilt die älteste geprüfte Primärquelle (hier ACSM 2016).

   `eigene-setzung` ist der ehrliche Platzhalter für alles ohne Beleg
   (RPE-Bänder, Gefühls-Sätze, Cues): Status "unbelegt", kein Link.
   `figueiredo-2025` und die Fueling-Quellen werden erst in E2/E6
   angezeigt, stehen aber schon hier (eine Liste, einmal gepflegt).
   ============================================================ */

import { ZONE_SOURCE_STATUS } from "./zone-sources.js";

/** @typedef {import("./zone-sources.js").ZoneSourceEntry} GuideSourceEntry */

/** Einzige Quelle der Schlüssel: session-guide-texts.js verweist über diese
 *  Konstanten, nicht über getippte Strings.
 *  @type {Readonly<Record<string,string>>} */
export const GUIDE_SOURCE_KEYS = Object.freeze({
  MORTON_2026: "morton-2026",
  ACSM_2016: "acsm-2016",
  IJAZ_2025: "ijaz-2025",
  NUUTTILA_2025: "nuuttila-2025",
  FIGUEIREDO_2025: "figueiredo-2025",
  EIGENE_SETZUNG: "eigene-setzung",
});

/** @type {ReadonlyArray<Omit<GuideSourceEntry,"status"|"url">>} */
const ENTRIES = [
  {
    key: GUIDE_SOURCE_KEYS.MORTON_2026,
    title: "Morton JP et al.: From Metabolism to Medals — Contemporary Perspectives and Revisiting Carbohydrate Guidelines for Fueling Endurance Athletes During Exercise",
    link: "J Nutr 2026, doi 10.1016/j.tjnut.2026.101442 (Journal Pre-proof, angenommen 20.02.2026)",
    note: "Volltext geprüft: Kohlenhydrate während der Belastung in absoluten g/h — ACSM 2016 zitiert mit 30–60 g/h für 1–2,5 h und bis 90 g/h ab > 2,5–3 h; die Obergrenze könnte bei Trainierten von 90 auf 120 g/h steigen. 120–200 g/h aus der Praxis seien nicht belegt. Die absoluten Oxidationsraten stammen fast nur von Männern.",
  },
  {
    key: GUIDE_SOURCE_KEYS.ACSM_2016,
    title: "Thomas DT, Erdman KA, Burke LM: Position of the Academy of Nutrition and Dietetics, Dietitians of Canada, and the American College of Sports Medicine — Nutrition and Athletic Performance",
    link: "J Acad Nutr Diet 2016;116(3):501-528, doi 10.1016/j.jand.2015.12.006; zeitgleich Med Sci Sports Exerc 2016;48(3):543-568",
    note: "Volltext geprüft (Tabelle 'Acute fuelling strategies'): Vor Belastungen über 60 min 1–4 g Kohlenhydrate pro kg, 1–4 h vorher, wenig Fett, wenig Ballaststoffe, mäßig Eiweiß. Während: unter 45 min nicht nötig, 45–75 min kleine Mengen, 1–2,5 h 30–60 g/h, über 2,5–3 h bis 90 g/h. Es ist die älteste Quelle der Liste; eine neuere Primärquelle für 'vorher' wurde nicht gefunden.",
  },
  {
    key: GUIDE_SOURCE_KEYS.IJAZ_2025,
    title: "Ijaz A et al.: Exogenous glucose oxidation during exercise is positively related to body size",
    link: "Int J Sport Nutr Exerc Metab 2025;35(1):12-23, doi 10.1123/ijsnem.2024-0097",
    note: "Abstract geprüft: 15 Radfahrer, 90 g/h Glukose, 120 min. Größere Fahrer (> 70 kg) oxidierten im Schnitt mehr (~45 g/h) als kleinere (~33 g/h). Die Körpergröße erklärt nicht die ganze Streuung — darum nur ein Hinweis, keine Umrechnung pro kg.",
  },
  {
    key: GUIDE_SOURCE_KEYS.NUUTTILA_2025,
    title: "Nuuttila O-P et al.: The accuracy of fixed intensity anchors to estimate lactate thresholds in recreational runners",
    link: "Eur J Appl Physiol 2025;125(8):2161-2171, doi 10.1007/s00421-025-05748-8",
    note: "Volltext geprüft: Auf der Borg-Skala 6–20 lag die Anstrengung an der zweiten Schwelle im Mittel bei etwa 15 ('schwer'), mit großer Streuung. RPE war die ungenaueste feste Methode — darum steht sie hier immer neben dem Wattbereich, nie allein. Untersucht wurden Läufer; für Radfahren ist die Richtung übertragen, nicht gemessen.",
  },
  {
    key: GUIDE_SOURCE_KEYS.FIGUEIREDO_2025,
    title: "Figueiredo I, Reis e Silva M, Sousa JE: The Influence of Running Cadence on Biomechanics and Injury Prevention — A Systematic Review",
    link: "Cureus 2025;17(8):e90322, doi 10.7759/cureus.90322",
    note: "Volltext geprüft: 5–10 % über der eigenen Schrittfrequenz senkt Stoß- und Gelenklast, ohne die Laufökonomie zu verschlechtern. Zusammenfassung von 18 Studien; die Autoren fordern bessere Langzeitstudien — darum nur vorsichtig formuliert.",
  },
  {
    key: GUIDE_SOURCE_KEYS.EIGENE_SETZUNG,
    title: "Eigene Setzung (nicht belegt)",
    link: "Keine Fundstelle",
    note: "Ziel-Anstrengung (RPE-Bänder), Gefühls-Sätze, Hinweise zum Fahren und Abbruchregeln sind eigene Formulierungen. Es gibt keine geprüfte Kopplung zwischen RPE auf der 1–10-Skala und Leistungszonen. Darum steht RPE immer neben dem Zielbereich der Karte, nie allein.",
  },
];

/** Klickbare Adressen je Quelle (nur wo stabil). */
const URLS = {
  [GUIDE_SOURCE_KEYS.MORTON_2026]: "https://doi.org/10.1016/j.tjnut.2026.101442",
  [GUIDE_SOURCE_KEYS.ACSM_2016]: "https://doi.org/10.1016/j.jand.2015.12.006",
  [GUIDE_SOURCE_KEYS.IJAZ_2025]: "https://doi.org/10.1123/ijsnem.2024-0097",
  [GUIDE_SOURCE_KEYS.NUUTTILA_2025]: "https://doi.org/10.1007/s00421-025-05748-8",
  [GUIDE_SOURCE_KEYS.FIGUEIREDO_2025]: "https://doi.org/10.7759/cureus.90322",
};

const STATUS = {
  [GUIDE_SOURCE_KEYS.MORTON_2026]: ZONE_SOURCE_STATUS.PRIMAER,
  [GUIDE_SOURCE_KEYS.ACSM_2016]: ZONE_SOURCE_STATUS.PRIMAER,
  [GUIDE_SOURCE_KEYS.IJAZ_2025]: ZONE_SOURCE_STATUS.PRIMAER,
  [GUIDE_SOURCE_KEYS.NUUTTILA_2025]: ZONE_SOURCE_STATUS.PRIMAER,
  [GUIDE_SOURCE_KEYS.FIGUEIREDO_2025]: ZONE_SOURCE_STATUS.PRIMAER,
  [GUIDE_SOURCE_KEYS.EIGENE_SETZUNG]: ZONE_SOURCE_STATUS.UNBELEGT,
};

/** @type {ReadonlyArray<Readonly<GuideSourceEntry>>} */
export const SESSION_GUIDE_SOURCES = Object.freeze(
  ENTRIES.map((e) =>
    Object.freeze({ ...e, ...(URLS[e.key] ? { url: URLS[e.key] } : {}), status: STATUS[e.key] })
  )
);

/** Key→Source-Lookup.
 *  @type {ReadonlyMap<string, Readonly<GuideSourceEntry>>} */
export const GUIDE_SOURCE_BY_KEY = Object.freeze(new Map(SESSION_GUIDE_SOURCES.map((e) => [e.key, e])));
