/* ============================================================
   GLOSSARY.TS — zentrales Abkürzungs-/Fachbegriff-Glossar für die
   Erklär-Tooltips (`components/InfoTooltip.tsx`).

   Reine Daten, keine Importe aus `api/`/`components/`/`features/` — wie
   `config.ts` eine Stammdaten-Datei neben `main.tsx`. Ein Ort für alle
   Kurztexte, damit dieselbe Abkürzung überall gleich erklärt wird.

   Konvention:
   - Key: kebab-/lowercase, stabil halten (wird im UI referenziert).
   - `text`: EIN Satz, Deutsch, kein Formel-Dickicht. Wo hilfreich ein
     Richtwert ("unter 5 % = aerob stabil").
   - Neue Begriffe hier ergänzen, nicht verstreut als Strings im UI.
   ============================================================ */

export interface GlossaryEntry {
  /** Fett vorangestellter Titel in der Tooltip-Box (Abkürzung ausgeschrieben). */
  title: string;
  /** Ein Satz Klartext. */
  text: string;
}

export const GLOSSARY = {
  // ── Belastung / PMC ────────────────────────────────────────────────
  ctl: {
    title: "CTL — Chronische Belastung",
    text: "Deine Langzeit-Fitness: der über 42 Tage geglättete Schnitt deiner täglichen Trainingsbelastung.",
  },
  atl: {
    title: "ATL — Akute Belastung",
    text: "Deine kurzfristige Ermüdung: der über 7 Tage geglättete Schnitt deiner täglichen Trainingsbelastung.",
  },
  tsb: {
    title: "TSB — Formstand",
    text: "Form = CTL − ATL: −5 bis −25 ist produktiver Aufbau, +5 bis +20 Frische, unter −25 Überlastung.",
  },
  tss: {
    title: "TSS — Trainingsbelastung",
    text: "Belastungspunkte einer Einheit aus Intensität und Dauer; eine Stunde exakt an der FTP ergibt 100.",
  },
  trimp: {
    title: "TRIMP",
    text: "Herzfrequenz-basiertes Belastungsmaß pro Einheit — die Alternative zur wattbasierten TSS.",
  },
  "ramp-rate": {
    title: "Ramp-Rate",
    text: "Wie schnell deine CTL pro Woche steigt; +3 bis +6 gilt als sicherer Aufbau.",
  },
  monotony: {
    title: "Foster-Monotonie",
    text: "Wie gleichförmig die Woche belastet war; hohe Werte heißen zu wenig Wechsel zwischen hart und locker.",
  },
  strain: {
    title: "Strain",
    text: "Wochenbelastung mal Monotonie — ein Frühwarnwert für Überlastung.",
  },
  "load-guard": {
    title: "Belastungswächter",
    text: "Prüft, ob dein CTL-Aufbau im sicheren Zielband bleibt, und warnt bei zu steilem Anstieg.",
  },

  // ── Leistung / FTP ────────────────────────────────────────────────
  ftp: {
    title: "FTP — Funktionelle Schwellenleistung",
    text: "Die Wattzahl, die du etwa eine Stunde am Stück halten kannst — Bezugsgröße für alle Zonen.",
  },
  eftp: {
    title: "eFTP — geschätzte FTP",
    text: "Laufend von intervals.icu aus deinen besten Leistungen geschätzte Schwellenleistung, ohne eigenen Test.",
  },
  "ramp-test": {
    title: "Ramp-Test",
    text: "Stufentest mit stetig steigender Leistung bis zur Ausbelastung; daraus wird die gemessene FTP berechnet.",
  },
  np: {
    title: "NP — Normalized Power",
    text: "Für harte Spitzen gewichtete Durchschnittsleistung — bildet die Belastung besser ab als der reine Schnitt.",
  },
  if: {
    title: "IF — Intensity Factor",
    text: "NP geteilt durch FTP: zeigt, wie hart eine Einheit im Verhältnis zu deiner Schwelle war.",
  },
  "w-per-kg": {
    title: "W/kg",
    text: "Watt pro Kilogramm Körpergewicht — die Leistung im Verhältnis zum Gewicht, entscheidend am Berg.",
  },
  "power-curve": {
    title: "Leistungskurve",
    text: "Deine beste Durchschnittsleistung je Zeitdauer, von wenigen Sekunden bis zu einer Stunde.",
  },
  "season-start-ftp": {
    title: "Saison-Start-FTP",
    text: "Deine FTP zu Saisonbeginn — der Nullpunkt des Fortschrittsrings zum Ziel.",
  },

  // ── Zonen / Intensität ───────────────────────────────────────────
  "coggan-zones": {
    title: "Leistungszonen (Coggan)",
    text: "Fünf Trainingsbereiche, jeweils als Prozentbereich der FTP definiert.",
  },
  z1: {
    title: "Zone 1 — Recovery",
    text: "Sehr lockere aktive Erholung, unter etwa 55 % der FTP.",
  },
  z2: {
    title: "Zone 2 — Grundlage",
    text: "Ruhige Ausdauerfahrt bei etwa 56–75 % der FTP — das Fundament des Ausdauertrainings.",
  },
  z3: {
    title: "Zone 3 — Tempo",
    text: "Zügiges Fahren bei etwa 76–90 % der FTP.",
  },
  z4: {
    title: "Zone 4 — Schwelle",
    text: "Fahren rund um die FTP, etwa 91–105 %.",
  },
  z5: {
    title: "Zone 5 — VO₂max",
    text: "Harte Intervalle über der Schwelle, etwa 106–120 % der FTP.",
  },
  "sweet-spot": {
    title: "Sweet Spot",
    text: "Etwa 88–94 % der FTP — viel Trainingsreiz bei noch überschaubarer Ermüdung.",
  },
  vo2max: {
    title: "VO₂max",
    text: "Die maximale Sauerstoffaufnahme des Körpers; kurze harte Intervalle über der Schwelle trainieren sie.",
  },
  "intensity-distribution": {
    title: "Intensitätsverteilung",
    text: "Wie sich die Trainingszeit auf niedrige, mittlere und hohe Intensität verteilt; ab etwa 80 % niedrig gilt als nachhaltig.",
  },
  ga: {
    title: "Grundlagenanteil (GA)",
    text: "Anteil deiner Wochenzeit im niedrig-intensiven Bereich.",
  },

  // ── Aerobe Marker ────────────────────────────────────────────────
  ef: {
    title: "EF — Effizienzfaktor",
    text: "NP geteilt durch die durchschnittliche Herzfrequenz; steigt, wenn deine Aerobik besser wird.",
  },
  decoupling: {
    title: "Entkopplung",
    text: "Wie stark Herzfrequenz und Leistung über eine Fahrt auseinanderlaufen; unter 5 % gilt als aerob stabil.",
  },
  cadence: {
    title: "Kadenz",
    text: "Kurbelumdrehungen pro Minute (RPM).",
  },

  // ── Körper / Erholung ────────────────────────────────────────────
  hf: {
    title: "HF — Herzfrequenz",
    text: "Schläge pro Minute; „Ø HF“ ist der Fahrt-Durchschnitt, „HF-Max“ der Höchstwert der Fahrt.",
  },
  hrv: {
    title: "HRV — Herzfrequenzvariabilität",
    text: "Schwankung der Abstände zwischen zwei Herzschlägen; höhere und stabile Werte sprechen für gute Erholung.",
  },
  rhr: {
    title: "Ruhepuls",
    text: "Herzfrequenz in völliger Ruhe; dauerhaft erhöhte Werte können auf Ermüdung oder einen Infekt hindeuten.",
  },
  "energy-balance": {
    title: "Energiebilanz",
    text: "Kalorienzufuhr minus Kalorienverbrauch eines Tages.",
  },
  bmr: {
    title: "BMR — Grundumsatz",
    text: "Kalorienverbrauch des Körpers in völliger Ruhe, ohne jede Aktivität.",
  },
  hydration: {
    title: "Trinkrate",
    text: "Aufgenommene Flüssigkeitsmenge — je nach Datenlage als Tageswert oder als Score.",
  },

  // ── Sonstiges ────────────────────────────────────────────────────
  readiness: {
    title: "Tagesform",
    text: "Zusammengefasstes Bereitschaftssignal aus HRV, Ruhepuls, Schlaf und deinem Befinden.",
  },
  taper: {
    title: "Taper",
    text: "Gezielte Belastungsreduktion in den Tagen vor einem Wettkampf, damit die Form zum Renntag hochkommt.",
  },
  periodization: {
    title: "Periodisierung",
    text: "Planvoller Wechsel von Aufbau- und Erholungsphasen über die Saison.",
  },
} satisfies Record<string, GlossaryEntry>;

export type GlossaryKey = keyof typeof GLOSSARY;

/** Eintrag zu einem Begriff, oder `null` bei unbekanntem Key. Toleriert
 *  beliebige Strings, damit ein Tippfehler im UI keinen Crash auslöst,
 *  sondern nur "kein Hinweis" bedeutet. */
export function glossaryEntry(key: string): GlossaryEntry | null {
  return (GLOSSARY as Record<string, GlossaryEntry>)[key] ?? null;
}
