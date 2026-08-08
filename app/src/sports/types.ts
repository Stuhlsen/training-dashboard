/* ============================================================
   SPORTS/TYPES.TS — Der Sportart-Vertrag (Etappe 3, Konzept G5)

   Was eine Sportart mitbringen muss, damit die Rechenlogik in core/
   mit ihr arbeiten kann. Es gibt genau EINE Implementierung
   (`cycling/`) — dieser Vertrag existiert, damit eine zweite prinzipiell
   danebenstehen könnte, nicht weil sie schon geplant wäre.

   Bewusst NUR Werte, keine Funktionen: die Berechnung selbst bleibt in
   core/ (Schichtenregel). Ein Sportprofil ist reine Konfiguration —
   Zonengrenzen, Metriknamen, Typvokabular, Einstufungsschwellen.
   ============================================================ */

/** Eine Leistungszone: Anzeigename + Farb-Token. Die Wattgrenzen entstehen
 *  erst in core/zones.js::computeZones() aus FTP × Prozentgrenze. */
export interface ZoneMeta {
  id: string;
  label: string;
  /** CSS-Variablenname (`var(--z1)`). Dass hier ein UI-Token in der
   *  Wertschicht steht, ist Vorbestand aus der Vanilla-Version — siehe
   *  cycling/README.md, gehört perspektivisch zu tokens.css (Etappe 4). */
  farbe: string;
}

export interface SportZones {
  /** Obergrenzen der Trainingszonen als Anteil der Schwellenleistung
   *  (Radsport: % FTP). Lückenlose Kette: Zone n endet, wo n+1 beginnt. */
  upperPct: readonly number[];
  /** Anzeige-Metadaten, index-gleich zu `upperPct`. */
  meta: readonly ZoneMeta[];
  /** Overlay-Band über zwei Zonen hinweg (Radsport: Sweet Spot 88–94 %).
   *  KEINE eigene Zone. `null`, wenn eine Sportart kein solches Band kennt. */
  overlayBandPct: readonly [number, number] | null;
  /** Grenzen für die grobe Ganzfahrt-Intensitäts-Bänderung (Fallback ohne
   *  gemessene Zonenzeiten). */
  ifBands: { lowMax: number; midMax: number };
  /** Richtwert für den Anteil niedrigintensiver Zeit (0–1). */
  lowIntensityTarget: number;
}

export interface SportMetrics {
  /** Name der Schwellenmetrik, wie sie in der UI heißt (Radsport: "FTP";
   *  eine Laufsport-Implementierung stünde hier auf "Schwellenpace"). */
  thresholdMetric: string;
  thresholdUnit: string;
  /** Trainingslast-Metrik (Radsport: "TSS"). */
  loadMetric: string;
  /** Relative Intensität einer Einheit (Radsport: "IF"). */
  intensityMetric: string;
  /** Geglättete Leistungsgröße (Radsport: "NP" — Normalized Power). */
  normalizedPowerMetric: string;
  cadenceMetric: string;
  cadenceUnit: string;
  cadenceTarget: number;
  /** Bezugswert der HF-Zonen. `null`, wenn die Sportart ihn nicht selbst
   *  setzt, weil er eine Eigenschaft der Person ist (so beim Radsport). */
  hrMax: number | null;
  /** Herzfrequenzzonen als Anteil von `hrMax`. */
  hrZones: Readonly<Record<string, readonly [number, number]>>;
  /** Festes Skalenende der Zonen-Anzeige im Hero. `null`, wenn die Skala
   *  stattdessen dynamisch aus der Schwellenleistung wächst. */
  scaleMax: number | null;
  /** Additiver Puffer für die What-if-Skala — verhindert, dass sich der
   *  Skalierungsfaktor exakt herauskürzt (Begründung in core/zones.js
   *  ::whatIfScaleMax). */
  whatIfScaleHeadroom: number;
}

export interface PhaseSignature {
  ifMin: number;
  ifMax: number;
  types: readonly string[];
}

export interface EfficiencyComparable {
  types: readonly string[];
  minDurationMin: number;
  tempRange: readonly [number, number];
}

export interface SportSessionTypes {
  /** Vokabular für Karten-Dialog und Vorschlags-Validator. */
  known: readonly string[];
  /** Typ-Default-Trainingslast, wenn eine Karte weder einen expliziten Wert
   *  noch eine Workout-Struktur trägt. */
  defaultLoad: Readonly<Record<string, number>>;
  /** Typen, deren Default eine Näherung statt eines echten Medians ist. */
  defaultLoadApprox: ReadonlySet<string>;
  /** hart/moderat/locker/ruhe je Typ. */
  intensityClass: Readonly<Record<string, string>>;
  /** Erwartetes Zonen-Band (low/mid/high) je Typ, für den Konfidenz-Abgleich. */
  expectedBand: Readonly<Record<string, string>>;
  /** Reizsignatur je Periodisierungsblock. */
  phaseSignatures: Readonly<Record<string, PhaseSignature>>;
  /** Welche Einheiten für den Effizienz-Trend vergleichbar sind. */
  efficiencyComparable: EfficiencyComparable;
}

export interface SportClassifyBandShare {
  low: number;
  mid: number;
  high: number;
}

/** Schwellen der datenbasierten Ist-Typerkennung. Die `if*`-Felder sind
 *  Anteile der Schwellenleistung, die `*Min`-Felder Minuten bzw. Sekunden. */
export interface SportClassify {
  ftpTestMaxMin: number;
  ftpTestMinIF: number;
  ifLowMax: number;
  ifZ2DauerMax: number;
  ifTempoMax: number;
  ifSweetSpotMax: number;
  ifSchwelleMax: number;
  longRideMin: number;
  dauerMin: number;
  langOverrideMin: number;
  shortRideConfidenceMin: number;
  bandMinShare: Readonly<SportClassifyBandShare>;
  blockMinDurationSec: number;
  blockMinSharePct: number;
  /** Rückfall-Trainingslast für einen Typ ohne Eintrag in `defaultLoad`. */
  fallbackLoad: number;
}

export interface SportProfile {
  id: string;
  label: string;
  zones: SportZones;
  metrics: SportMetrics;
  sessionTypes: SportSessionTypes;
  classify: SportClassify;
}
