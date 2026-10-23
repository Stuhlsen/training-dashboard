/* ============================================================
   CORE/ZONE-EXPLANATIONS.JS — Erklärtexte je Zone (reine Daten, kein I/O)
   (Fahrplan 24, Etappe E1)

   Je Sportart zwei Listen:
   - `zonen`: Schwellen-Zonen (Rad Coggan, Lauf Daniels, Schwimmen CSS);
              ids = ZoneMeta.id aus sports/<sport>/zones.ts
   - `hf`:    Herzfrequenz-Zonen; ids = Schlüssel der HR-Zonen-Konstante
              (HR_ZONES / RUNNING_HR_ZONES / SWIMMING_HR_ZONES)

   Texte: einfache Worte für Anfänger, beschreiben die Zone, geben aber
   KEINE Trainingsbefehle. Die Zonengrenzen (Prozentwerte) stehen NICHT
   hier, sondern in sports/*; Texte nennen daher keine Prozentzahlen.
   Belegt vs. eigene Formulierung: planning/recherche/zonen-e1-belege.md
   (privat). `quelleKeys` verweist auf core/zone-sources.js; eine leere
   Liste heißt: eigene Formulierung ohne Quelle.
   ============================================================ */

import { ZONE_SOURCE_KEYS as K } from "./zone-sources.js";

/**
 * @typedef {Object} ZoneExplanation
 * @property {string} id         passt zu ZoneMeta.id bzw. zum HR-Zonen-Schlüssel
 * @property {string} kurz       eine Zeile
 * @property {string} gefuehl    wie es sich anfühlt
 * @property {string} wofuer     wofür die Zone gut ist
 * @property {string} dauer      typische Dauer
 * @property {ReadonlyArray<string>} quelleKeys  Schlüssel aus zone-sources.js
 */

/** @param {string} id @param {string} kurz @param {string} gefuehl @param {string} wofuer
 *  @param {string} dauer @param {string[]} quelleKeys
 *  @returns {Readonly<ZoneExplanation>} */
const z = (id, kurz, gefuehl, wofuer, dauer, quelleKeys) =>
  Object.freeze({ id, kurz, gefuehl, wofuer, dauer, quelleKeys: Object.freeze(quelleKeys) });

/* ---------- Rad (Coggan) ---------- */
const CYCLING_ZONEN = [
  z("z1", "Sehr locker, fast wie Spazierenfahren.",
    "Kaum Anstrengung, die Beine ermüden nicht. Du kannst dich ganz normal unterhalten.",
    "Der Körper erholt sich, ohne zusätzlich belastet zu werden.",
    "Keine feste Dauer, zum Beispiel zwischen harten Einheiten.",
    [K.COGGAN_POWER_LEVELS]),
  z("z2", "Ruhig und gleichmäßig, die Basis für Ausdauer.",
    "Die Anstrengung ist gering. Du kannst die ganze Zeit reden.",
    "Lange, ruhige Fahrten bauen die Grundlage auf, auf der alles andere aufbaut.",
    "Typisch ein bis zwei Stunden und länger.",
    [K.COGGAN_POWER_LEVELS]),
  z("z3", "Zügig, aber noch kontrolliert.",
    "Die Beine arbeiten spürbar. Reden geht, aber nur noch in kürzeren Sätzen.",
    "Das ist das Tempo einer flotten Gruppenausfahrt.",
    "Ab etwa 30 Minuten am Stück.",
    [K.COGGAN_POWER_LEVELS]),
  z("z4", "Hart, rund um deine Schwellenleistung (FTP).",
    "Deutlich anstrengende Beine, Reden fällt schwer.",
    "Verbessert, wie lange du ein hohes Tempo halten kannst.",
    "Abschnitte von etwa 10 bis 30 Minuten.",
    [K.COGGAN_POWER_LEVELS]),
  z("z5", "Sehr hart, nahe am Limit deiner Atmung.",
    "Starke bis sehr starke Anstrengung, Reden geht nicht mehr.",
    "Erhöht die größte Menge Sauerstoff, die dein Körper nutzen kann (VO2max).",
    "Kurze Abschnitte von etwa 3 bis 8 Minuten.",
    [K.COGGAN_POWER_LEVELS]),
];

/* ---------- Lauf (Daniels) ---------- */
const RUNNING_ZONEN = [
  z("e", "Easy: locker und entspannt.",
    "Du läufst bequem und kannst dich unterhalten.",
    "Stärkt Herz, Muskeln und Sehnen, ohne dass du lange Erholung brauchst.",
    "Auch lange Läufe, bis etwa zweieinhalb Stunden.",
    [K.DANIELS_RUNNING_FORMULA]),
  z("m", "Marathon: gleichmäßig und zügig.",
    "Etwas anstrengender als locker, aber du hältst es gleichmäßig durch.",
    "Du übst das Tempo eines Marathons und dazu Essen und Trinken beim Laufen.",
    "Pro Einheit höchstens etwa 1 Stunde 50 Minuten.",
    [K.DANIELS_RUNNING_FORMULA]),
  z("t", "Schwelle: anstrengend, aber gleichmäßig.",
    "Du läufst deutlich an der Grenze, die du noch eine Weile halten kannst.",
    "Trainiert, wie gut dein Körper Milchsäure (Laktat) abbaut, damit du länger schnell bleibst.",
    "Zum Beispiel ein durchgehender Lauf von etwa 20 Minuten oder mehrere Abschnitte mit kurzer Pause.",
    [K.DANIELS_RUNNING_FORMULA]),
  z("i", "Intervall: sehr hart, in Abschnitten.",
    "Die Atmung ist schwer, lange hältst du das nicht durch.",
    "Trainiert die größte Menge Sauerstoff, die dein Körper nutzen kann (VO2max).",
    "Abschnitte von etwa 3 bis 5 Minuten mit Pausen dazwischen.",
    [K.DANIELS_RUNNING_FORMULA]),
  z("r", "Wiederholung: sehr schnell, aber kurz.",
    "Es fühlt sich schnell und kräftig an, danach brauchst du viel Pause.",
    "Verbessert Schnelligkeit und wie sparsam du läufst.",
    "Abschnitte unter etwa 2 Minuten, mit langen Pausen.",
    [K.DANIELS_RUNNING_FORMULA]),
];

/* ---------- Schwimmen (CSS) ---------- */
const SWIMMING_ZONEN = [
  z("s1", "Rekom: sehr locker zum Erholen.",
    "Du schwimmst ohne Druck und achtest eher auf saubere Bewegungen.",
    "Erholung und Technik, ohne den Körper zu belasten.",
    "Keine feste Dauer, zum Beispiel zum Ein- oder Ausschwimmen.",
    []),
  z("s2", "Grundlage: ruhig und gleichmäßig.",
    "Du schwimmst entspannt und kannst den Rhythmus lange halten.",
    "Baut die Ausdauer auf, auf der das schnellere Schwimmen aufbaut.",
    "Lange Strecken am Stück, etwa 40 Minuten und mehr.",
    [K.FERNANDES_2024]),
  z("s3", "CSS: dein Dauertempo.",
    "Anstrengend, aber gleichmäßig. CSS (Critical Swim Speed) ist das Tempo, das du über längere Zeit halten kannst.",
    "Verbessert, wie lange du ein zügiges Tempo durchhältst.",
    "Abschnitte von etwa 10 bis 20 Minuten.",
    [K.SWIM_SMOOTH_CSS, K.FERNANDES_2024, K.SWIMMING_CANADA_2024]),
  z("s4", "VO2max: schnell und fordernd.",
    "Die Atmung ist schwer, du schwimmst schneller als dein Dauertempo.",
    "Erhöht die größte Menge Sauerstoff, die dein Körper nutzen kann (VO2max).",
    "Abschnitte von etwa 3 bis 10 Minuten mit Pausen dazwischen.",
    [K.FERNANDES_2024]),
  z("s5", "Sprint: so schnell wie möglich.",
    "Maximale Kraft über sehr kurze Zeit, danach brauchst du Pause.",
    "Trainiert Schnelligkeit und Kraft im Wasser.",
    "Sehr kurze Strecken von unter etwa 2 Minuten, mit langen Pausen.",
    [K.FERNANDES_2024]),
];

/* ---------- Herzfrequenz-Zonen (% HFmax) ----------
   Die Texte beschreiben die Anstrengung; die Prozentgrenzen selbst sind
   eine übernommene Wahl (K.HR_PCT_UNBELEGT), keine belegte Setzung. */
const HF_TEXTE = [
  ["z1", "Sehr locker.", "Dein Puls ist niedrig, du merkst kaum eine Anstrengung.", "Aufwärmen und Erholen.", "Keine feste Dauer."],
  ["z2", "Locker und gleichmäßig.", "Der Puls ist niedrig bis moderat, du kannst dich unterhalten.", "Baut die Ausdauer-Grundlage auf.", "Lange Einheiten sind möglich."],
  ["z3", "Zügig.", "Der Puls steigt spürbar, die Atmung wird tiefer.", "Verbessert die Ausdauer bei etwas höherem Tempo.", "Mittlere Abschnitte."],
  ["z4", "Hart.", "Der Puls ist hoch, die Atmung schnell, Reden fällt schwer.", "Trainiert, ein hohes Tempo länger zu halten.", "Abschnitte mit Pausen."],
  ["z5", "Sehr hart bis maximal.", "Der Puls ist nahe am Höchstwert, du hältst das nur kurz durch.", "Trainiert die obere Leistungsgrenze.", "Kurze Abschnitte mit langen Pausen."],
];
const hfZonen = () => HF_TEXTE.map((t) => z(...t, [K.HR_PCT_UNBELEGT, K.BISHOP_2025]));

/** @type {Readonly<Record<"cycling"|"running"|"swimming", Readonly<{zonen: ReadonlyArray<Readonly<ZoneExplanation>>, hf: ReadonlyArray<Readonly<ZoneExplanation>>}>>>} */
export const ZONE_EXPLANATIONS = Object.freeze({
  cycling: Object.freeze({ zonen: Object.freeze(CYCLING_ZONEN), hf: Object.freeze(hfZonen()) }),
  running: Object.freeze({ zonen: Object.freeze(RUNNING_ZONEN), hf: Object.freeze(hfZonen()) }),
  swimming: Object.freeze({ zonen: Object.freeze(SWIMMING_ZONEN), hf: Object.freeze(hfZonen()) }),
});

/** Welche Schwellen-Zone je Sportart vorgewählt ist (Q8: Zone 2 / Easy). */
export const EASY_ZONE_ID_BY_SPORT = Object.freeze({
  cycling: "z2",
  running: "e",
  swimming: "s2",
});

/** Satz für die vorgewählte Zone (Q8). Grundlage: Seiler 2010 (etwa 80 % der
 *  EINHEITEN niedrigintensiv, bei Spitzen-Ausdauersportlern — nicht Zeit, nicht
 *  Einsteiger), Stöggl & Sperlich 2015 (etwa 80 % des Trainings bei gut
 *  trainierten und Elite-Ausdauersportlern). Deshalb ehrlich als "oft rund
 *  80 %" bei Ausdauersportlern formuliert (Alex-Entscheidung nach der
 *  E1-Prüfung); für Einsteiger ist es ein Richtwert (= LOW_INTENSITY_TARGET
 *  im Code). */
export const EASY_ZONE_SHARE_SENTENCE = Object.freeze({
  text: "Bei Ausdauersportlern liegt oft rund 80 % des Trainings hier.",
  quelleKeys: Object.freeze([K.SEILER_2010, K.STOGGL_SPERLICH_2015]),
});

/** Hinweis für alle Puls-Zonen-Kacheln: feste Prozente von HFmax sind nur ein
 *  grober Richtwert. Belegt durch Bishop et al. 2025 (ACSM/ESSA); die
 *  Prozentgrenzen selbst sind übernommene Wahl (K.HR_PCT_UNBELEGT). */
export const HR_RICHTWERT_HINT = Object.freeze({
  text: "Die Pulszonen sind ein grober Richtwert: Bei gleichem Prozentwert deines Höchstpulses liegen Menschen unterschiedlich weit von ihrer eigenen Belastungsschwelle entfernt.",
  quelleKeys: Object.freeze([K.BISHOP_2025, K.HR_PCT_UNBELEGT]),
});

/** Hinweis zur Wasser-Herzfrequenz (Q6) für die Schwimm-HF-Kachel.
 *  Belegt durch Olstad 2019 (6,7 ± 5,3 bpm niedriger als beim Laufen, 12 junge
 *  Spitzenschwimmer) — bewusst vorsichtig formuliert, ohne feste Korrektur. */
export const SWIMMING_HR_HINT = Object.freeze({
  text: "Beim Schwimmen kann dein Puls niedriger ausfallen als beim Laufen oder Radfahren. In einer Studie mit 12 jungen Spitzenschwimmern lag der Höchstpuls im Schnitt rund 7 Schläge pro Minute niedriger, mit großen Unterschieden zwischen den Personen. Achte deshalb zusätzlich auf Tempo und Gefühl.",
  quelleKeys: Object.freeze([K.OLSTAD_2019]),
});
